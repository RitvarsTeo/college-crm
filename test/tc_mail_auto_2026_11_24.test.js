// THE TRAINING CENTRE EMAIL AUTOMATION (patch 172; his words "Make the same mechanism for TC email!", his picks 24.11.2026: the
// B2B/B2C rule TC_AUTO_5, Q1 "B: Intake creates it", Q2 "A: stays Contacted"). Invented people and addresses only; no Gmail.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from '../src/db.js';
import { recordTcMail, mailCards, TC_MAILBOX } from '../src/tcmail.js';
import { classify, processTcMail, undoTc, tcSuggestedReply, nameFromDomain, topicOf, forgetPairs, SILENCE_DAYS, START } from '../src/tcmailauto.js';
import { ROOT } from './security_helpers.js';

const m = (id, thread, mine, from, at, subject, body, fromName = null) => ({ id, threadId: thread, mine, from, fromName, to: [TC_MAILBOX], subject, body, sentAt: at, attachments: [] });
const T = (h) => new Date(Date.parse('2026-11-23T08:00:00Z') + h * 3600000).toISOString();

async function setup({ from = '2026-01-01T00:00:00.000Z' } = {}) {
  const db = await openDb();
  // these tests run after the release: the start is set before their mail (his pick "From release on" has its own test)
  if (from) await db.prepare('INSERT INTO sync_state (name, value, ran_at) VALUES (?,?,?)').run(START, from, from);
  await db.prepare(`INSERT INTO tc_companies (id, name, name_key, status, website, created_at) VALUES (9, 'Baltic Example Crewing', 'baltic example crewing', 'to_contact', 'https://www.balticexample.lv/', '2026-11-01T00:00:00Z')`).run();
  await db.prepare(`INSERT INTO tc_company_contacts (id, company_id, name, email, created_at) VALUES (90, 9, 'Kristaps Paraugs', 'kristaps@balticexample.lv', '2026-11-01T00:00:00Z')`).run();
  await db.prepare(`INSERT INTO tc_company_contacts (id, company_id, name, email, created_at) VALUES (91, 9, 'Gmail Person', 'gmail.person@gmail.com', '2026-11-01T00:00:00Z')`).run();
  await db.prepare(`INSERT INTO tc_companies (id, name, name_key, status, website, created_at) VALUES (10, 'Two Sites A', 'two sites a', 'contacted', 'twosites.lv', '2026-11-01T00:00:00Z')`).run();
  await db.prepare(`INSERT INTO tc_companies (id, name, name_key, status, website, created_at) VALUES (11, 'Two Sites B', 'two sites b', 'contacted', 'http://twosites.lv', '2026-11-01T00:00:00Z')`).run();
  return db;
}

test('the rule: the first row that fits decides; an address is matched whole', async () => {
  const db = await setup();
  assert.deepEqual(await classify(db, 'KRISTAPS@balticexample.lv'), { segment: 'b2b', rule: 'contact', companyId: 9, contactId: 90, domain: 'balticexample.lv' });
  assert.equal((await classify(db, 'gmail.person@gmail.com')).segment, 'b2b', 'a contact writing from gmail stays B2B');
  assert.deepEqual([(await classify(db, 'andris@inbox.lv')).segment, (await classify(db, 'andris@inbox.lv')).rule], ['b2c', 'mailbox']);
  assert.equal((await classify(db, 'x@pm.me')).rule, 'mailbox');
  assert.deepEqual(await classify(db, 'new.person@balticexample.lv'), { segment: 'b2b', rule: 'domain', companyId: 9, domain: 'balticexample.lv' });
  assert.ok((await classify(db, 'a@twosites.lv')).ask, 'two companies on one domain: a person decides');
  assert.deepEqual(await classify(db, 'ops@nordexample-shipping.com'), { segment: 'b2b', rule: 'new_company', domain: 'nordexample-shipping.com' });
  for (const a of ['noreply@linkedin.com', 'someone@google.com', 'billing@lv.visma.com', 'colleague@novikontas.org', 'notifications@example.com']) assert.ok((await classify(db, a)).never, a);
  assert.equal((await classify(db, 'buh@example-firm.lv', 'Rēķins Nr. 12 apmaksai')).never, 'an invoice');
  assert.equal((await classify(db, 'j@example-firm.lv', 'Please find my attached CV for the vacancy')).never, 'a CV or job application');
  assert.equal(nameFromDomain('nordexample-shipping.com'), 'Nordexample Shipping');
  assert.equal(nameFromDomain('mail.example.co.uk'), 'Example');
  assert.match(topicOf('Please quote BOSIET with CA-EBS for 3 people'), /BOSIET, CA-EBS, the price/);
});

test('B2B: training@ replied to a known contact -> the whole conversation on the company, Follow up 7 days after our reply, the card in Handled; the level untouched', async () => {
  const db = await setup();
  await recordTcMail(db, [
    m('a1', 'tA', 'in', 'kristaps@balticexample.lv', T(0), 'GWO BST for 6 crew', 'We need GWO BST for 6 people. Dates and price please.', 'Kristaps Paraugs'),
  ]);
  assert.equal((await processTcMail(db, { at: T(1) })).processed, 0, 'not answered yet: nothing happens');
  await recordTcMail(db, [m('a2', 'tA', 'out', TC_MAILBOX, T(2), 'Re: GWO BST for 6 crew', 'Labdien,\n\nThe next GWO BST starts 11 January, 6 places are free.\n\nAr cieņu,\nTraining Centre', 'Training Centre')]);
  const r = await processTcMail(db, { at: T(3) });
  assert.deepEqual([r.processed, r.b2b], [1, 1]);
  const lines = await db.prepare(`SELECT kind, body, actor, origin, topics, contact_id FROM tc_activities WHERE company_id = 9 ORDER BY occurred_at`).all();
  assert.deepEqual(lines.map((l) => [l.kind, l.actor, l.origin]), [['email', 'Intake', 'automatic'], ['email', 'Intake', 'automatic']]);
  assert.match(lines[0].body, /^Email from Kristaps Paraugs: GWO BST for 6 crew\. We need GWO BST/);
  assert.equal(lines[1].body, 'training@ replied: The next GWO BST starts 11 January, 6 places are free.');
  assert.match(lines[0].topics, /GWO BST/);
  const task = await db.prepare('SELECT label, due_at, created_by FROM tc_tasks WHERE company_id = 9').get();
  assert.deepEqual([task.label, task.due_at, task.created_by], ['Follow up', new Date(Date.parse(T(2)) + SILENCE_DAYS * 86400000).toISOString().slice(0, 10), 'Intake']);
  assert.equal((await db.prepare('SELECT status FROM tc_companies WHERE id = 9').get()).status, 'to_contact', 'Q2 / levels: Intake never changes the level');
  const H = await mailCards(db, { handled: true });
  assert.deepEqual(H.cards[0].auto, { segment: 'b2b', companyId: 9, company: 'Baltic Example Crewing', privateId: null });
  assert.equal((await mailCards(db)).cards.length, 0, 'gone from Waiting');
  assert.equal((await processTcMail(db, { at: T(4) })).processed, 0, 'once');
});

test('B2C: a private mailbox becomes a private client from Email with the course; their next contact 7 days after our reply', async () => {
  const db = await setup();
  await recordTcMail(db, [
    m('b1', 'tB', 'in', 'elina.piemera@gmail.com', T(0), 'STCW refresher', 'Labdien, vēlos pieteikties STCW atjaunošanas kursam februārī.', 'Elīna Piemēra'),
    m('b2', 'tB', 'out', TC_MAILBOX, T(1), 'Re: STCW refresher', 'Labdien!\nJā, februārī ir brīvas vietas.\n\nOn Mon, someone wrote:\n> old', 'Training Centre'),
  ]);
  const r = await processTcMail(db, { at: T(2) });
  assert.deepEqual([r.processed, r.b2c], [1, 1]);
  const p = await db.prepare('SELECT * FROM tc_private_clients').get();
  assert.deepEqual([p.name, p.email, p.came_from, p.course, p.owner, p.status], ['Elīna Piemēra', 'elina.piemera@gmail.com', 'Email', 'STCW refresher', null, 'not_contacted']);
  assert.equal(p.next_at, new Date(Date.parse(T(1)) + 7 * 86400000).toISOString().slice(0, 10));
  const h = (await db.prepare('SELECT kind, body FROM tc_private_history WHERE client_id = ? ORDER BY occurred_at, id').all(p.id)).map((x) => x.body);
  assert.match(h[0], /^Email from Elīna Piemēra: STCW refresher\./);
  assert.equal(h[1], 'training@ replied: Jā, februārī ir brīvas vietas.');
  assert.match(h[2], /^Next contact: /);
});

test('his pick B: a company Intake does not know is created, named after the domain, with the contact under it', async () => {
  const db = await setup();
  await recordTcMail(db, [
    m('c1', 'tC', 'in', 'laura@nordexample-shipping.com', T(0), 'BOSIET for 3', 'Please quote BOSIET with CA-EBS for 3 people.', 'Laura Example'),
    m('c2', 'tC', 'out', TC_MAILBOX, T(1), 'Re: BOSIET for 3', 'Hello, the offer is attached.', 'Training Centre'),
  ]);
  const r = await processTcMail(db, { at: T(2) });
  assert.equal(r.madeCompany, 1);
  const co = await db.prepare(`SELECT id, name, website, status FROM tc_companies WHERE name = 'Nordexample Shipping'`).get();
  assert.deepEqual([co.website, co.status], ['nordexample-shipping.com', 'not_contacted']);
  assert.equal((await db.prepare('SELECT name FROM tc_company_contacts WHERE company_id = ?').get(co.id)).name, 'Laura Example');
  // the next person from that domain lands on the same company (row 4)
  assert.deepEqual([(await classify(db, 'other@nordexample-shipping.com')).rule, (await classify(db, 'other@nordexample-shipping.com')).companyId], ['domain', Number(co.id)]);
});

test('row 6 and answered-before-asked: never a client, the card stays as it is', async () => {
  const db = await setup();
  await recordTcMail(db, [
    m('d1', 'tD', 'in', 'jobs@linkedin.com', T(0), 'New jobs', 'x'),
    m('d2', 'tD', 'out', TC_MAILBOX, T(1), 'Re', 'ok'),
    m('e1', 'tE', 'in', 'buh@example-firm.lv', T(0), 'Rēķins', 'Rēķins Nr. 5 apmaksai'),
    m('e2', 'tE', 'out', TC_MAILBOX, T(1), 'Re', 'Paldies'),
  ]);
  assert.equal((await processTcMail(db, { at: T(2) })).processed, 0);
  assert.equal(Number((await db.prepare('SELECT COUNT(*) n FROM tc_companies').get()).n), 3);
  assert.equal((await mailCards(db)).cards.length, 2, 'both stay, answered');
});

test('Q2 "A": they write back -> a History line "They wrote back and asked about ..."; the card waits; our next reply hands it again', async () => {
  const db = await setup();
  await recordTcMail(db, [
    m('f1', 'tF', 'in', 'kristaps@balticexample.lv', T(0), 'GWO', 'GWO BST please', 'Kristaps Paraugs'),
    m('f2', 'tF', 'out', TC_MAILBOX, T(1), 'Re: GWO', 'Dates attached.', 'Training Centre'),
  ]);
  await processTcMail(db, { at: T(2) });
  await recordTcMail(db, [m('f3', 'tF', 'in', 'kristaps@balticexample.lv', T(3), 'Re: GWO', 'Thank you. What is the price for 6?', 'Kristaps Paraugs')]);
  await processTcMail(db, { at: T(4) });
  const last = await db.prepare(`SELECT body FROM tc_activities WHERE company_id = 9 ORDER BY occurred_at DESC, id DESC`).get();
  assert.match(last.body, /^They wrote back and asked about the price: Thank you\./);
  assert.equal((await mailCards(db)).cards.length, 1, 'their new email waits');
  await recordTcMail(db, [m('f4', 'tF', 'out', TC_MAILBOX, T(5), 'Re: GWO', 'The price is in the offer.', 'Training Centre')]);
  await processTcMail(db, { at: T(6) });
  assert.equal((await mailCards(db)).cards.length, 0, 'answered again: handled again');
  assert.equal(Number((await db.prepare(`SELECT COUNT(*) n FROM tc_activities WHERE company_id = 9 AND kind = 'email'`).get()).n), 4, 'each message once');
  assert.equal(Number((await db.prepare(`SELECT COUNT(*) n FROM tc_tasks WHERE company_id = 9`).get()).n), 1, 'one Follow up, not two');
});

test('Undo: the card waits again; nothing is deleted: the Follow up is closed "Undo", what Intake made is archived, a line says who; never processed again by itself', async () => {
  const db = await setup();
  await recordTcMail(db, [
    m('g1', 'tG', 'in', 'kristaps@balticexample.lv', T(0), 'GWO', 'GWO BST', 'Kristaps Paraugs'),
    m('g2', 'tG', 'out', TC_MAILBOX, T(1), 'Re', 'Yes.', 'Training Centre'),
    m('h1', 'tH', 'in', 'janis.paraugs@inbox.lv', T(0), 'STCW', 'STCW Basic Safety price?', 'Jānis Paraugs'),
    m('h2', 'tH', 'out', TC_MAILBOX, T(1), 'Re', 'Cena ir mājaslapā.', 'Training Centre'),
  ]);
  await processTcMail(db, { at: T(2) });
  assert.equal((await undoTc(db, 'm:tG', '')).error, 'Who is undoing this?');
  assert.deepEqual(await undoTc(db, 'm:tG', 'Laura'), { ok: true, kept: false });
  const acts = await db.prepare(`SELECT kind, body, actor FROM tc_activities WHERE company_id = 9 ORDER BY id`).all();
  assert.deepEqual(acts.map((x) => [x.kind, x.actor]), [['email', 'Intake'], ['email', 'Intake'], ['note', 'Laura']], 'the emails stay as the record; nothing deleted');
  assert.equal(acts[2].body, 'Undo by Laura: the email conversation is back in the Inbox');
  const t = await db.prepare(`SELECT done_at, outcome FROM tc_tasks WHERE company_id = 9`).get();
  assert.ok(t.done_at); assert.equal(t.outcome, 'Undo');
  assert.equal((await db.prepare('SELECT archived_at FROM tc_company_contacts WHERE id = 90').get()).archived_at, null, 'a contact that was there stays');
  assert.deepEqual(await undoTc(db, 'm:tH', 'Laura'), { ok: true, kept: false });
  assert.ok((await db.prepare(`SELECT archived_at FROM tc_private_clients WHERE email = 'janis.paraugs@inbox.lv'`).get()).archived_at, 'the private client Intake made is archived');
  assert.equal((await mailCards(db)).cards.length, 2, 'both back in the Inbox');
  assert.equal((await processTcMail(db, { at: T(3) })).processed, 0, 'never again by itself');
  assert.ok((await undoTc(db, 'm:tG', 'Laura')).error);
});

test('his pick "From release on": the first run marks the start; what training@ answered before it stays a card; what it answers after is processed', async () => {
  const db = await setup({ from: null });
  await recordTcMail(db, [
    m('o1', 'tO', 'in', 'kristaps@balticexample.lv', T(0), 'GWO', 'GWO BST please', 'Kristaps Paraugs'),
    m('o2', 'tO', 'out', TC_MAILBOX, T(1), 'Re: GWO', 'Dates attached.', 'Training Centre'),
    m('n1', 'tN', 'in', 'elina@inbox.lv', T(2), 'STCW', 'STCW refresher?', 'Elīna'),
  ]);
  const first = await processTcMail(db, { at: T(3) });
  assert.deepEqual([first.processed, first.before], [0, 1], 'answered before the release: not processed');
  assert.equal((await db.prepare('SELECT value FROM sync_state WHERE name = ?').get(START)).value, T(3));
  await recordTcMail(db, [m('n2', 'tN', 'out', TC_MAILBOX, T(4), 'Re: STCW', 'Jā, ir vietas.', 'Training Centre')]);
  const next = await processTcMail(db, { at: T(5) });
  assert.deepEqual([next.processed, next.b2c, next.before], [1, 1, 1]);
  assert.equal((await processTcMail(db, { at: T(9) })).processed, 0, 'the start never moves');
  assert.equal((await mailCards(db)).cards.length, 1, 'the old one waits for a person, answered');
});

test('the suggested reply: training@\'s answer to the most similar email, cut, to copy; the late mark after one working day', async () => {
  const db = await setup();
  await recordTcMail(db, [
    m('s1', 't1', 'in', 'a@inbox.lv', T(-200), 'STCW Basic Safety', 'Cik maksā STCW Basic Safety kurss un kad nākamais?', 'A'),
    m('s2', 't1', 'out', TC_MAILBOX, T(-199), 'Re', 'Labdien!\nSTCW Basic Safety notiek katru mēnesi, nākamais 7. decembrī.\n\nAr cieņu,\nTC', 'Training Centre'),
    m('s3', 't2', 'in', 'b@inbox.lv', '2026-11-20T08:00:00.000Z', 'Basic Safety', 'Labdien, cik maksā STCW Basic Safety un kad nākamais kurss?', 'B'),
  ]);
  forgetPairs();
  const s = await tcSuggestedReply(db, 'm:t2');
  assert.deepEqual(s, { text: 'STCW Basic Safety notiek katru mēnesi, nākamais 7. decembrī.', like: 1 });
  assert.equal(await tcSuggestedReply(db, 'm:nothing'), null);
  const cards = (await mailCards(db, { now: new Date('2026-11-24T12:00:00Z') })).cards;
  assert.equal(cards.find((c) => c.key === 'm:t2').late, true);
  const fresh = (await mailCards(db, { now: new Date('2026-11-20T09:00:00Z') })).cards;
  assert.equal(fresh.find((c) => c.key === 'm:t2').late, false);
});

test('the page and the server: Undo and the suggested reply behind the Training Centre gate; nothing sends', () => {
  const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  for (const s of ["B2B · added to <a href=\"#/tc/company/", "B2C · made a <a href=\"#/tc/private/", "tcInboxUndo(", "post('/api/tc/inbox/undo', { key })",
    "api('/api/tc/inbox/suggested-reply?key=' + encodeURIComponent(key))", "cStateLine(c.late ? 'late' : 'new'"]) assert.ok(APP.includes(s), s);
  const srv = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
  const gate = srv.indexOf('TRAINING CENTRE --');
  for (const r of ["'/api/tc/inbox/undo'", "'/api/tc/inbox/suggested-reply'"]) assert.ok(srv.indexOf(r) > gate && gate > 0, r);
  const mod = fs.readFileSync(path.join(ROOT, 'src', 'tcmailauto.js'), 'utf8').split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join(' ');   // the code, not its comments
  assert.doesNotMatch(mod, /messages\/send|drafts|gmail\.(send|compose|modify)|fetch\(/, 'Intake never sends or drafts');
  assert.doesNotMatch(mod, /SET status|status = '(contacted|met|focus)'/, 'the level is not touched (his question on the levels)');
});
