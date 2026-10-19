// OUR OWN EMAIL (19.10.2026, Ieva; the owner: "Yes, build it"). On 14.10 an Inbox card was our own reply sent from
// edu@novikontas.org ("Re: MC 7.9 - 10 Able Seafarer deck / enginroom"): Intake took the sender as the contact, and Make
// a lead created a person "Novikontas Academy" <edu@novikontas.org>. Now an email from one of our own addresses never
// opens a card, whatever label it carries: our reply in a conversation already in Intake joins it (the time only, and it
// is the first reply); anything else is set aside as Our own email. Make a lead never puts our address on a person, and
// nobody is matched by it. Everything runs against a fake Gmail.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { syncGmail, syncReplies } from '../src/sync.js';
import { receive, qualify, listInbound, bringBack, activePersonFor, linesOf, OWN_EMAIL_WHY, OWN_ADDRESS_ERROR,
  CONFIG } from '../src/intake.js';
import { isOwnAddress, duplicateCheck, onePersonFor } from '../src/identity.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LABEL = { id: 'Label_77', name: 'Admissions' };

const message = (id, from, subject, body, { labelIds = ['INBOX'], threadId = 't-' + id, date = '2026-10-14T09:00:00Z' } = {}) => ({
  id, threadId, labelIds,
  payload: { mimeType: 'text/plain', headers: [
    { name: 'Date', value: new Date(date).toUTCString() },
    { name: 'From', value: from },
    { name: 'Subject', value: subject },
  ], body: { data: Buffer.from(body, 'utf8').toString('base64url') } },
});
function fakeGmail(box) {
  const reply = (body, ok = true, status = 200) => ({ ok, status, json: async () => body, text: async () => JSON.stringify(body) });
  return async (url) => {
    if (url.includes('oauth2.googleapis.com/token')) return reply({ access_token: 'x', expires_in: 3600 });
    if (/\/labels$/.test(url)) return reply({ labels: [LABEL] });
    if (url.includes('/messages?')) {
      const label = new URL(url).searchParams.get('labelIds');
      const ids = label ? (label === LABEL.id ? box.labelled || [] : []) : box.inbox || [];
      return reply({ messages: ids.map((id) => ({ id })) });
    }
    if (url.includes('/threads/')) {
      const id = decodeURIComponent(url.split('/threads/')[1].split('?')[0]);
      return (box.threads || {})[id] ? reply({ id, messages: box.threads[id] }) : reply({}, false, 404);
    }
    const id = decodeURIComponent(url.split('/messages/')[1].split('?')[0]);
    return reply(box.messages[id]);
  };
}
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const ENV = { CHANNEL_MODE_GMAIL: 'test', GMAIL_SERVICE_ACCOUNT_JSON: JSON.stringify({
  client_email: 'svc@example.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }) };
const pull = (db, box) => syncGmail(db, { env: ENV, fetchImpl: fakeGmail(box), now: new Date('2026-10-14T12:00:00Z') });
const byExt = async (db) => Object.fromEntries((await db.prepare(`SELECT * FROM inbound WHERE channel = 'gmail' ORDER BY id`).all())
  .map((r) => [r.external_id, r]));
const peopleCount = async (db) => Number((await db.prepare('SELECT COUNT(*) n FROM people').get()).n);

const ENQUIRY = message('e1', 'Wibbo <wibbo@ship.nl>', 'MC 7.9 - 10 Able Seafarer deck / enginroom',
  'Dear Sir, we are interested in the Able Seafarer course for our cadets, how can they apply?', { threadId: 'T1', date: '2026-10-14T08:00:00Z' });
const OUR_REPLY = (id, extra = {}) => message(id, 'Novikontas Academy <edu@novikontas.org>', 'Re: MC 7.9 - 10 Able Seafarer deck / enginroom',
  'Dear Wibbo and Henk, Thank you for your interest in Novikontas...', { threadId: 'T1', date: '2026-10-14T10:30:00Z', ...extra });

// ------------------------------------------------------------------------- the addresses --
test('our own addresses: every @novikontas.org and @novikontas.lv, the mailbox, the ownAddresses list; nobody else', () => {
  for (const a of ['edu@novikontas.org', 'EDU@Novikontas.org ', 'aigars.kluga@novikontas.org', 'info@novikontas.lv']) assert.equal(isOwnAddress(a), true, a);
  for (const a of ['wibbo@ship.nl', 'novikontas.org@gmail.com', 'edu@novikontas.org.evil.com', '', null]) assert.equal(isOwnAddress(a), false, String(a));
  assert.deepEqual(CONFIG.emailFilter.ownAddresses, ['edu@novikontas.org']);
  // the list is config: an address outside our domains counts once it is written there
  assert.equal(isOwnAddress('admissions@other.eu', { emailFilter: { internalDomains: [], ownAddresses: ['admissions@other.eu'] } }), true);
});

// ------------------------------------------------------------------------- rule 1 --
test('our reply in a conversation already in Intake joins it as our reply, labelled or not: no card, no person, the first reply', async () => {
  const db = await openDb(':memory:');
  await pull(db, { inbox: ['e1'], messages: { e1: ENQUIRY } });
  // the 14.10 case: the conversation carries the Admissions label, so our reply in it does too
  const r = await pull(db, { inbox: [], labelled: ['r1'], messages: { r1: OUR_REPLY('r1', { labelIds: ['SENT', LABEL.id] }) } });
  assert.equal(r.ownReply, 1);
  assert.equal(r.inbox, 0);
  const cards = await listInbound(db, { state: 'new' });
  assert.equal(cards.length, 1, 'one card, the enquiry');
  assert.equal(cards[0].contact_email, 'wibbo@ship.nl');
  assert.doesNotMatch(cards[0].body, /Thank you for your interest/, 'our text never joins the card');
  const lines = await linesOf(db, cards[0].id);
  assert.deepEqual(lines.map((l) => [l.kind, l.external_id, l.body]), [['message', 'e1', lines[0].body], ['reply', 'r1', null]]);
  assert.equal(cards[0].first_reply_at, new Date('2026-10-14T10:30:00Z').toISOString(), 'our reply is the first reply');
  assert.equal(await peopleCount(db), 0);
  // the same reply again is a repeat, and a later reply never moves the first reply
  const again = await pull(db, { inbox: ['r1', 'r2'], messages: { r1: OUR_REPLY('r1'), r2: OUR_REPLY('r2', { date: '2026-10-14T11:00:00Z' }) } });
  assert.equal(again.repeat, 1);
  assert.equal(again.ownReply, 1);
  assert.equal((await byExt(db)).e1.first_reply_at, new Date('2026-10-14T10:30:00Z').toISOString());
  assert.equal(Number((await db.prepare("SELECT COUNT(*) n FROM inbound WHERE channel = 'gmail'").get()).n), 1, 'no row for our replies');
  await db.close();
});

test('our reply in a conversation that is already a lead: the reply time on the History, no text, the person unchanged', async () => {
  const db = await openDb(':memory:');
  await pull(db, { inbox: ['e1'], messages: { e1: ENQUIRY } });
  const card = (await listInbound(db, { state: 'new' }))[0];
  const q = await qualify(db, card.id, { qualification: 'lead', createPerson: true, by: 'Ieva', nextAction: 'First call' });
  assert.equal(q.ok, true);
  await pull(db, { inbox: ['r1'], messages: { r1: OUR_REPLY('r1') } });
  const ev = await db.prepare("SELECT * FROM events WHERE person_id = ? AND direction = 'out'").all(q.personId);
  assert.deepEqual(ev.map((e) => [e.subject, e.occurred_at]), [['Email reply sent', new Date('2026-10-14T10:30:00Z').toISOString()]]);
  const p = await db.prepare('SELECT name, email FROM people WHERE id = ?').get(q.personId);
  assert.deepEqual([p.name, p.email], ['Wibbo', 'wibbo@ship.nl']);
  assert.equal(await peopleCount(db), 1);
  await db.close();
});

test('our email with no conversation in Intake is set aside as Our own email; the label never brings it back; nobody absorbs it', async () => {
  const db = await openDb(':memory:');
  // a person who (wrongly) carries our address, like the duplicate of 14.10: the email never lands on them
  await db.prepare("INSERT INTO people (id, name, email, status) VALUES ('p-dup', 'Novikontas Academy', 'edu@novikontas.org', 'New')").run();
  const box = { inbox: ['o1', 'o2'], labelled: ['o1'], messages: {
    o1: message('o1', 'Novikontas Academy <edu@novikontas.org>', 'Invitation', 'We invite you to study at Novikontas Academy', { labelIds: ['SENT', LABEL.id], threadId: 'T9' }),
    o2: message('o2', 'Aigars <aigars.kluga@novikontas.org>', 'Hello', 'Admission documents', { threadId: 'T8' }) } };
  const r = await pull(db, box);
  assert.equal(r.inbox, 0);
  assert.equal(r.filtered, 2);
  let by = await byExt(db);
  for (const k of ['o1', 'o2']) {
    assert.deepEqual([by[k].state, by[k].archive_reason, by[k].archive_note, by[k].person_id],
      ['filtered', 'Filtered automatically', OWN_EMAIL_WHY, null], k);
  }
  assert.ok(by.o1.body, 'kept, like every automatic set-aside');
  // the label again on the next pull: it stays set aside (Q91 brings back only what is not ours)
  const again = await pull(db, box);
  assert.equal(again.broughtBack || 0, 0);
  by = await byExt(db);
  assert.equal(by.o1.state, 'filtered');
  assert.equal((await listInbound(db, { state: 'new' })).length, 0, 'never a lead candidate');
  await db.close();
});

test('rule 1 is for email: a website form typed with a staff address keeps the filter it had', async () => {
  const db = await openDb(':memory:');
  const r = await receive(db, { channel: 'website_form', externalId: 'w1', email: 'ieva.gudaneca@novikontas.org', body: 'Test' });
  const row = await db.prepare('SELECT state, archive_note FROM inbound WHERE id = ?').get(r.id);
  assert.deepEqual([row.state, row.archive_note], ['filtered', 'sent from our own address (@novikontas.org)']);
  await db.close();
});

// ------------------------------------------------------------------------- rule 3 --
test('Make a lead with edu@novikontas.org is refused; the person\'s own email and name make the lead', async () => {
  const db = await openDb(':memory:');
  await db.prepare("INSERT INTO people (id, name, email, status) VALUES ('p-dup', 'Novikontas Academy', 'edu@novikontas.org', 'New')").run();
  await pull(db, { inbox: ['o1'], messages: { o1: OUR_REPLY('o1', { threadId: 'T7' }) } });
  const id = (await byExt(db)).o1.id;
  await bringBack(db, id, { by: 'Ieva' });                         // a person may bring it back by hand
  const card = (await listInbound(db, { state: 'new' })).find((c) => c.id === id);
  assert.equal(card.ownAddress, true, 'the card asks for the person\'s own email');
  assert.equal(card.joins || null, null, 'nobody is matched by our address');
  const base = { qualification: 'lead', createPerson: true, by: 'Ieva', nextAction: 'First call' };
  const refused = await qualify(db, id, base);
  assert.equal(refused.error, OWN_ADDRESS_ERROR);
  assert.equal(refused.error, "This is our own address - pick the person's own email");
  assert.equal((await qualify(db, id, { ...base, stated: { email: 'EDU@novikontas.org' } })).error, OWN_ADDRESS_ERROR, 'typed ours: refused');
  assert.equal((await qualify(db, id, { ...base, createPerson: false, personId: 'p-dup' })).error, OWN_ADDRESS_ERROR, 'Add to: refused too');
  assert.equal(await peopleCount(db), 1, 'nothing made');
  // the duplicate check and the known-person question never match by our address
  assert.equal((await duplicateCheck(db, { email: 'edu@novikontas.org' })).blocked, false);
  assert.equal(await onePersonFor(db, { email: 'edu@novikontas.org' }), null);
  assert.equal(await activePersonFor(db, 'edu@novikontas.org'), null);
  // the person's own email typed on the card: the lead is made, with their email and the typed name, never ours
  const ok = await qualify(db, id, { ...base, name: 'Wibbo', stated: { email: 'wibbo@ship.nl' } });
  assert.equal(ok.ok, true, ok.error);
  const p = await db.prepare('SELECT name, email FROM people WHERE id = ?').get(ok.personId);
  assert.deepEqual([p.name, p.email], ['Wibbo', 'wibbo@ship.nl']);
  const own = await db.prepare("SELECT COUNT(*) n FROM field_values WHERE person_id = ? AND lower(value) LIKE '%@novikontas.org'").get(ok.personId);
  assert.equal(Number(own.n), 0, 'our address is not kept on the person either');
  await db.close();
});

// ------------------------------------------------------------------------- unchanged --
test('a normal external email is unchanged: a study email opens a card with its sender, a reply from them joins with its text', async () => {
  const db = await openDb(':memory:');
  const r = await pull(db, { inbox: ['e1'], messages: { e1: ENQUIRY } });
  assert.equal(r.inbox, 1);
  const r2 = await pull(db, { inbox: ['e2'], messages: { e2: message('e2', 'Henk <henk@ship.nl>', 'Re: MC 7.9', 'Thanks, we will send the papers', { threadId: 'T1' }) } });
  assert.equal(r2.joined, 1);
  const [card] = await listInbound(db, { state: 'new' });
  assert.deepEqual([card.contact_name, card.contact_email, card.ownAddress], ['Wibbo', 'wibbo@ship.nl', false]);
  assert.match(card.body, /we will send the papers/);
  assert.deepEqual((await linesOf(db, card.id)).map((l) => l.kind), ['message', 'message']);
  const other = await pull(db, { inbox: ['x1'], messages: { x1: message('x1', 'Shop <s@shop.lv>', 'Offer', 'Chairs') } });
  assert.equal(other.filtered, 1);
  assert.equal((await byExt(db)).x1.archive_note, 'Not about studying');
  await db.close();
});

test('first-reply detection still works: the thread read finds edu@\'s SENT reply; a card our reply already answered is not read again', async () => {
  const db = await openDb(':memory:');
  const now = new Date('2026-10-14T12:00:00Z');
  const add = async (thread, at) => Number((await db.prepare(`INSERT INTO inbound (channel, thread_key, external_id, received_at, surface_at,
    suggested, state, source) VALUES ('gmail', ?, ?, ?, ?, 'raw', 'new', 'provider')`).run(thread, 'x-' + thread, at, at)).lastInsertRowid);
  const a = await add('TA', '2026-10-14T08:00:00Z');
  const b = await add('TB', '2026-10-14T08:00:00Z');
  await db.prepare("UPDATE inbound SET first_reply_at = '2026-10-14T09:00:00.000Z' WHERE id = ?").run(b);
  const sent = (id, iso) => ({ id, labelIds: ['SENT'], payload: { headers: [{ name: 'Date', value: new Date(iso).toUTCString() }] } });
  const asked = [];
  const f = fakeGmail({ threads: { TA: [sent('s1', '2026-10-14T09:15:00Z')] } });
  const got = await syncReplies(db, { env: ENV, now, refreshToken: null, fetchImpl: async (u) => { asked.push(u); return f(u); } });
  assert.deepEqual([got.read, got.replied], [1, 1]);
  assert.equal((await db.prepare('SELECT first_reply_at FROM inbound WHERE id = ?').get(a)).first_reply_at, new Date('2026-10-14T09:15:00Z').toISOString());
  assert.equal(asked.some((u) => u.includes('/threads/TB')), false, 'already answered: not read again');
  await db.close();
});

test('the Help center says in one sentence what happens to our own email', () => {
  const help = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'help.json'), 'utf8'));
  const a = help.faq.find((x) => x.id === 'email-to-inbox').a;
  assert.match(a, /our own reply from edu@ or any @novikontas\.org too, counted as the first reply, never as a card/);
  assert.match(a, /our own emails as Our own email/);
  assert.equal(a.split(/[.!?](\s|$)/).filter((x) => x && x.trim()).length, 1, 'still one sentence');
});
