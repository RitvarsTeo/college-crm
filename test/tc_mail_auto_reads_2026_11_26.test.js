// THE AUTOMATION READS ONLY WHAT IT CAN ACT ON (patch 188, 26.11.2026, his "Yes, hand them over": the database's monthly transfer ran
// over; 433 answered conversations the rule leaves to a person were read whole, bodies and all, on every run, 60,230 times). A
// conversation is read again only when a newer message arrives. Invented people and addresses only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { recordTcMail, TC_MAILBOX } from '../src/tcmail.js';
import { processTcMail, START } from '../src/tcmailauto.js';

const m = (id, thread, mine, from, at, subject, body) => ({ id, threadId: thread, mine, from, fromName: null, to: [TC_MAILBOX], subject, body, sentAt: at, attachments: [] });
const T = (h) => new Date(Date.parse('2026-11-23T08:00:00Z') + h * 3600000).toISOString();

async function counted() {
  const db = await openDb();
  await db.prepare('INSERT INTO sync_state (name, value, ran_at) VALUES (?,?,?)').run(START, '2026-01-01T00:00:00.000Z', T(0));
  await db.prepare(`INSERT INTO tc_companies (id, name, name_key, status, website, created_at) VALUES (9, 'Baltic Example Crewing', 'baltic example crewing', 'to_contact', 'balticexample.lv', '2026-11-01T00:00:00Z')`).run();
  await db.prepare(`INSERT INTO tc_company_contacts (id, company_id, name, email, created_at) VALUES (90, 9, 'Kristaps Paraugs', 'kristaps@balticexample.lv', '2026-11-01T00:00:00Z')`).run();
  await db.prepare(`INSERT INTO tc_companies (id, name, name_key, status, website, created_at) VALUES (10, 'Two Sites A', 'two sites a', 'contacted', 'twosites.lv', '2026-11-01T00:00:00Z')`).run();
  await db.prepare(`INSERT INTO tc_companies (id, name, name_key, status, website, created_at) VALUES (11, 'Two Sites B', 'two sites b', 'contacted', 'http://twosites.lv', '2026-11-01T00:00:00Z')`).run();
  const reads = [];
  const prepare = db.prepare.bind(db);
  db.prepare = (sql) => { const st = prepare(sql); if (/FROM tc_mail WHERE thread_id = \? ORDER BY at, id/.test(sql)) { const all = st.all.bind(st); st.all = (...p) => { reads.push(p[0]); return all(...p); }; } return st; };
  return { db, reads };
}

test('a conversation left to a person is read once, then again only after a newer message', async () => {
  const { db, reads } = await counted();
  await recordTcMail(db, [m('s1', 'tS', 'in', 'a@twosites.lv', T(0), 'Course', 'Hello, a course please.'), m('s2', 'tS', 'out', TC_MAILBOX, T(1), 'Re: Course', 'Hello, here it is.')]);
  const r1 = await processTcMail(db, { at: T(2) });
  assert.deepEqual([r1.processed, r1.skipped, reads.length], [0, 1, 1], 'two companies on one domain: a person decides; read once');
  const r2 = await processTcMail(db, { at: T(3) });
  assert.deepEqual([r2.skipped, reads.length], [1, 1], 'the next run does not read it again');
  await recordTcMail(db, [m('s3', 'tS', 'in', 'a@twosites.lv', T(4), 'Re: Course', 'And the price?'), m('s4', 'tS', 'out', TC_MAILBOX, T(5), 'Re: Course', 'The price is on the offer.')]);
  await processTcMail(db, { at: T(6) });
  assert.equal(reads.length, 2, 'a newer message: read again');
});

test('a processed conversation with nothing new is not read; a new message from them is', async () => {
  const { db, reads } = await counted();
  await recordTcMail(db, [m('k1', 'tK', 'in', 'kristaps@balticexample.lv', T(0), 'GWO BST', 'GWO BST for 6 please.'), m('k2', 'tK', 'out', TC_MAILBOX, T(1), 'Re: GWO BST', 'Dates attached.')]);
  assert.equal((await processTcMail(db, { at: T(2) })).processed, 1);
  assert.equal(reads.length, 1);
  await recordTcMail(db, [m('k3', 'tK', 'in', 'kristaps@balticexample.lv', T(3), 'Re: GWO BST', 'Thanks, and the price?')]);
  await processTcMail(db, { at: T(4) });
  assert.equal(reads.length, 2, 'they wrote back: read, written into the history');
  await processTcMail(db, { at: T(5) });
  await processTcMail(db, { at: T(6) });
  assert.equal(reads.length, 2, 'waiting for our answer, nothing new: not read again');
  await recordTcMail(db, [m('k4', 'tK', 'out', TC_MAILBOX, T(7), 'Re: GWO BST', 'The price is on the offer.')]);
  const r = await processTcMail(db, { at: T(8) });
  assert.equal(r.carried, 1);
  assert.equal(reads.length, 3);
});
