// THE TRAINING CENTRE EMAIL (patch 167; his pick "Yes, connect training@", "the correct one is training@novikontas.org", the
// picture TC_EMAIL_1_cards "Yes, build it"). Invented people and addresses only; Gmail is a fake.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from '../src/db.js';
import { recordTcMail, mailCards, mailDone, notAClient, TC_MAILBOX } from '../src/tcmail.js';
import { tcInbox, tcInboxDone } from '../src/tcwhatsapp.js';
import { syncTcMail, syncStaffMail } from '../src/sync.js';
import { ROOT } from './security_helpers.js';

const msg = (id, thread, mine, from, at, subject, body, fromName = null) => ({ id, threadId: thread, mine, from, fromName, to: [TC_MAILBOX], subject, body, sentAt: at, attachments: [] });

test('training@ mail is kept once in its own table; our own domain and robots never make a card; never the Academy Inbox', async () => {
  const db = await openDb();
  const r = await recordTcMail(db, [
    msg('g1', 't1', 'in', 'kristaps@example.lv', '2026-11-24T08:00:00.000Z', 'GWO BST for 6 crew', 'We need GWO BST for 6 people.', 'Kristaps Paraugs'),
    msg('g2', 't2', 'in', 'colleague@novikontas.org', '2026-11-24T08:05:00.000Z', 'Lunch', 'Hi'),
    msg('g3', 't3', 'in', 'no-reply@example.com', '2026-11-24T08:06:00.000Z', 'Receipt', 'x'),
  ]);
  assert.deepEqual([r.stored, r.skipped], [1, 2]);
  assert.equal((await recordTcMail(db, [msg('g1', 't1', 'in', 'kristaps@example.lv', '2026-11-24T08:00:00.000Z', 's', 'b')])).stored, 0, 'the same Gmail id is one message');
  assert.equal(Number((await db.prepare('SELECT COUNT(*) n FROM inbound').get()).n), 0, 'nothing in the Academy Inbox');
  assert.equal(Number((await db.prepare('SELECT COUNT(*) n FROM mail_sent').get()).n), 0, 'nothing in the Academy mail');
  assert.ok(notAClient('someone@novikontas.org') && notAClient('mailer-daemon@example.com') && !notAClient('a@example.com'));
});

test('one card per conversation; an answered one stays with "Answered by", out of the count; Done moves it to Handled', async () => {
  const db = await openDb();
  await db.prepare(`INSERT INTO tc_companies (id, name, name_key, status, created_at) VALUES (9, 'Baltic Example Crewing', 'baltic example crewing', 'contacted', '2026-11-01T00:00:00Z')`).run();
  await db.prepare(`INSERT INTO tc_company_contacts (company_id, name, email, created_at) VALUES (9, 'Kristaps Paraugs', 'kristaps@example.lv', '2026-11-01T00:00:00Z')`).run();
  await recordTcMail(db, [
    msg('a1', 'tA', 'in', 'kristaps@example.lv', '2026-11-24T08:00:00.000Z', 'GWO BST', 'Dates please.', 'Kristaps Paraugs'),
    msg('b1', 'tB', 'in', 'elina@example.com', '2026-11-24T07:00:00.000Z', 'STCW refresher', 'Vai ir vietas?', 'Elīna Piemēra'),
    msg('b2', 'tB', 'out', TC_MAILBOX, '2026-11-24T07:30:00.000Z', 'Re: STCW refresher', 'Jā, ir.', 'Training Centre'),
  ]);
  const M = await mailCards(db);
  assert.equal(M.cards.length, 2);
  assert.equal(M.waiting, 1, 'the answered conversation is not waiting');
  const a = M.cards.find((c) => c.key === 'm:tA'), b = M.cards.find((c) => c.key === 'm:tB');
  assert.deepEqual([a.kind, a.person, a.company, a.subject], ['email', 'Kristaps Paraugs', 'Baltic Example Crewing', 'GWO BST']);
  assert.ok(b.answered && !a.answered);
  const I = await tcInbox(db);
  assert.equal(I.waiting, 1);
  assert.deepEqual((await tcInboxDone(db, 'm:tA', 'Laura')).done, 1);
  assert.equal((await mailCards(db)).cards.length, 1);
  assert.equal((await mailCards(db, { handled: true })).cards[0].seenBy, 'Laura');
  assert.equal((await mailDone(db, 'nothing', 'Laura')).ok, false);
});

test('the run: nothing until training@ is connected; training@ is never read as an Academy staff mailbox', async () => {
  const db = await openDb();
  assert.equal((await syncTcMail(db, { env: {}, fetchImpl: async () => { throw new Error('no call'); } })).ran, false);
  await db.prepare('INSERT INTO staff_mail_links (user_email, token, connected_at) VALUES (?,?,?)').run(TC_MAILBOX, 'g1.x.y.z', '2026-11-24T00:00:00Z');
  const own = await syncStaffMail(db, { env: {}, fetchImpl: async () => { throw new Error('the Academy loop must not read training@'); } });
  assert.equal(own.mailboxes, 0);
});

test('Make a lead from an email card: B2B company line "Email from" (no B2C in Intake since 24.11.2026: private clients live in N3)', async () => {
  const tc = await import('../src/tc.js');
  const db = await openDb();
  const out = await tc.quickAdd(db, { newCompany: 'Example Crewing SIA', name: 'Kristaps Paraugs', email: 'kristaps@example.lv', note: 'GWO BST. Dates please.', via: 'email' }, 'Laura');
  const line = await db.prepare('SELECT body FROM tc_activities WHERE company_id = ? AND kind = ?').get(out.companyId, 'contact');
  assert.equal(line.body, 'Email from Kristaps Paraugs. GWO BST. Dates please.');
});

test('the page and the server: Email cards in the TC Inbox, a Connect training@ for an admin, the callback keeps only training@', () => {
  const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  for (const s of ["C_SRC_COLOUR.email : C_SRC_COLOUR.whatsapp", "✓ Answered by ${esc(c.answered.by || 'training@')}", "location.href='/api/tc/mail/connect'", "via: 'email', name: c.person"]) assert.ok(APP.includes(s), s);
  const srv = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
  assert.ok(srv.includes("if (got.email !== TC_MAILBOX) return back('other_account');"));
  assert.ok(srv.includes("if (!me || me.role !== 'admin') return refuseNotAdmin(res);"));
  assert.ok(srv.indexOf("'/api/tc/mail/connect'") > srv.indexOf('TRAINING CENTRE --'), 'behind the Training Centre gate');
});
