// TILDA FORM EMAILS (patch 190, his pick 27.11.2026: "Admissions need normal full information, not a notification :D").
// Ieva, 27.11: an Inbox card from the website showed only "noreply@tilda.ws · Request from [novikontas.org]". Tilda's
// notification is HTML only and the Gmail pull keeps plain text. Now the form's fields are read from the HTML for mail
// from Tilda only; a copy of a submission the website webhook already brought is set aside. Every person is invented and
// everything runs against a fake Gmail. The layout is Tilda's standard notification as ASSUMED until a real one is read.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { openDb } from '../src/db.js';
import { syncGmail, rereadTildaCards, TILDA_COPY_WHY } from '../src/sync.js';
import { toAdapterShape } from '../lib/gmail.js';
import { tildaFieldsOf, isTildaSender } from '../src/tildamail.js';
import { receive } from '../src/intake.js';

const HTML = `<html><head><style>p{color:red}</style></head><body>
<p>Request details:</p>
<p>Name: Anna Example<br>Email: anna.example@mail.example<br>Phone: +371 2000 1122<br>
Programme: Navigation<br>Message: I would like to know about the start date &amp; the fee.<br>
Topics: Admission; Fees</p>
<p>Request ID: 1234567:8901234<br>Form: Talk to Admissions<br>Page: https://novikontas.org/academy/en</p>
<p>Cookies: TILDAUTM=utm_source%3Dgoogle%7C%7C%7Cutm_medium%3Dcpc</p></body></html>`;
const TABLE = `<table><tr><td>Name</td><td>Jānis Paraugs</td></tr><tr><td>Phone</td><td>29 111 222</td></tr>
<tr><td>Comments</td><td>Zvaniet, lūdzu</td></tr></table><p>Form: Book a visit</p>`;

const message = (id, from, subject, { html = null, text = null, date = 'Wed, 26 Nov 2026 12:33:47 +0200' } = {}) => ({
  id, threadId: 't-' + id, labelIds: ['INBOX'],
  payload: { mimeType: 'multipart/alternative', headers: [
    { name: 'Date', value: date }, { name: 'From', value: from }, { name: 'Subject', value: subject }],
  parts: [
    ...(text ? [{ mimeType: 'text/plain', body: { data: Buffer.from(text, 'utf8').toString('base64url') } }] : []),
    ...(html ? [{ mimeType: 'text/html', body: { data: Buffer.from(html, 'utf8').toString('base64url') } }] : []),
  ] },
});
function fakeGmail(box) {
  const reply = (body, ok = true, status = 200) => ({ ok, status, json: async () => body, text: async () => JSON.stringify(body) });
  return async (url) => {
    if (url.includes('oauth2.googleapis.com/token')) return reply({ access_token: 'x', expires_in: 3600 });
    if (/\/labels$/.test(url)) return reply({ labels: [] });
    if (url.includes('/messages?')) return reply({ messages: (box.inbox || []).map((id) => ({ id })) });
    if (url.includes('/threads/')) return reply({ messages: [] });
    return reply(box.messages[decodeURIComponent(url.split('/messages/')[1].split('?')[0])]);
  };
}
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const ENV = { CHANNEL_MODE_GMAIL: 'test', GMAIL_SERVICE_ACCOUNT_JSON: JSON.stringify({
  client_email: 'svc@example.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }) };
const NOW = new Date('2026-11-26T10:40:00Z');
const pull = (db, box) => syncGmail(db, { env: ENV, fetchImpl: fakeGmail(box), now: NOW });
const card = async (db, ext) => db.prepare('SELECT * FROM inbound WHERE external_id = ?').get(ext);
const fields = async (db, id) => Object.fromEntries((await db.prepare('SELECT field, value FROM field_values WHERE inbound_id = ?').all(id)).map((r) => [r.field, r.value]));

test('the reading: every "Label: value" line or two-cell row, Tilda\'s own lines apart, only from Tilda', () => {
  const t = tildaFieldsOf(HTML);
  assert.deepEqual(t.fields.map(([k]) => k), ['Name', 'Email', 'Phone', 'Programme', 'Message', 'Topics']);
  assert.equal(t.fields.find(([k]) => k === 'Message')[1], 'I would like to know about the start date & the fee.');
  assert.deepEqual([t.requestId, t.form, t.page], ['1234567:8901234', 'Talk to Admissions', 'https://novikontas.org/academy/en']);
  const tb = tildaFieldsOf(TABLE);
  assert.deepEqual(tb.fields, [['Name', 'Jānis Paraugs'], ['Phone', '29 111 222'], ['Comments', 'Zvaniet, lūdzu']]);
  assert.equal(tb.form, 'Book a visit');
  assert.equal(tildaFieldsOf('<p>Request from [novikontas.org]</p>'), null, 'no fields: the email stays as it was');
  assert.ok(isTildaSender('Tilda <noreply@tilda.ws>') && isTildaSender('noreply@tilda.ws'));
  assert.ok(!isTildaSender('Anna <noreply@tilda.ws.example.com>') && !isTildaSender('someone@mail.example'));
  // only Tilda's mail is read from HTML; any other HTML-only email is untouched
  assert.equal(toAdapterShape(message('m0', 'News <news@shop.example>', 'Sale', { html: HTML })).tilda, null);
  assert.ok(toAdapterShape(message('m1', 'Tilda <noreply@tilda.ws>', 'Request from [novikontas.org]', { html: HTML })).tilda);
});

test('a Tilda email becomes the card of the person who filled in the form, with every answer, past the email rule', async () => {
  const db = await openDb();
  await pull(db, { inbox: ['m1'], messages: { m1: message('m1', 'Tilda <noreply@tilda.ws>', 'Request from [novikontas.org]', { html: HTML }) } });
  const c = await card(db, 'm1');
  assert.equal(c.state, 'new', 'a form submission is never set aside by the email rule');
  assert.equal(c.contact_name, 'Anna Example');
  assert.equal(c.contact_email, 'anna.example@mail.example');
  assert.equal(c.contact_phone, '+371 2000 1122');
  for (const line of ['Website form: Talk to Admissions', 'Name: Anna Example', 'Programme: Navigation',
    'Message: I would like to know about the start date & the fee.', 'Topics: Admission; Fees', 'Page: https://novikontas.org/academy/en']) {
    assert.ok(c.body.includes(line), line);
  }
  assert.ok(!/Cookies|TILDAUTM|Request ID/.test(c.body), 'Tilda\'s technical lines are not on the card');
  assert.equal((await fields(db, c.id)).form_programme, 'Navigation');
});

test('the same submission from the website webhook first: the email is set aside as a copy, findable', async () => {
  const db = await openDb();
  await receive(db, { channel: 'website', externalId: 'tilda-1234567:8901234', receivedAt: '2026-11-26T10:33:40.000Z',
    name: 'Anna Example', email: 'anna.example@mail.example', phone: '+371 2000 1122', body: 'Talk to Admissions' });
  await pull(db, { inbox: ['m1'], messages: { m1: message('m1', 'Tilda <noreply@tilda.ws>', 'Request from [novikontas.org]', { html: HTML }) } });
  const c = await card(db, 'm1');
  assert.equal(c.state, 'filtered');
  assert.equal(c.archive_note, TILDA_COPY_WHY);
  // no Request ID match: the same phone within 15 minutes still counts; 40 minutes later it does not
  const db2 = await openDb();
  await receive(db2, { channel: 'website', externalId: 'w-2', receivedAt: '2026-11-26T10:25:00.000Z', name: 'J', phone: '+37129111222', body: 'x' });
  await pull(db2, { inbox: ['m2', 'm3'], messages: {
    m2: message('m2', 'noreply@tilda.ws', 'Request from [novikontas.org]', { html: TABLE }),
    m3: message('m3', 'noreply@tilda.ws', 'Request from [novikontas.org]', { html: TABLE.replace('29 111 222', '29 333 444'), date: 'Wed, 26 Nov 2026 13:05:00 +0200' }) } });
  assert.equal((await card(db2, 'm2')).archive_note, TILDA_COPY_WHY);
  assert.equal((await card(db2, 'm3')).state, 'new');
});

test('the waiting notification card is read again: preview changes nothing; apply files the form and sets the old card aside', async () => {
  const db = await openDb();
  // what production holds today: the card the old reader made (subject only, Tilda's address as the contact)
  await receive(db, { channel: 'gmail', externalId: 'm9', receivedAt: '2026-11-26T10:33:47.000Z', name: 'noreply@tilda.ws',
    email: 'noreply@tilda.ws', body: 'Request from [novikontas.org]', noFilter: true });
  const old = await card(db, 'm9');
  const box = { messages: { m9: message('m9', 'Tilda <noreply@tilda.ws>', 'Request from [novikontas.org]', { html: HTML }) } };
  const pre = await rereadTildaCards(db, { env: ENV, fetchImpl: fakeGmail(box), now: NOW });
  assert.deepEqual([pre.applied, pre.waiting], [false, 1]);
  assert.equal((await card(db, 'm9')).state, 'new', 'the preview changes nothing');
  assert.ok((await rereadTildaCards(db, { apply: true, env: ENV, fetchImpl: fakeGmail(box), now: NOW })).error, 'apply needs a name');
  const r = await rereadTildaCards(db, { apply: true, by: 'Ritvars', env: ENV, fetchImpl: fakeGmail(box), now: NOW });
  assert.equal(r.cards[0].outcome, 'new card');
  const fresh = await card(db, 'm9:form');
  assert.equal(fresh.state, 'new');
  assert.equal(fresh.contact_name, 'Anna Example');
  const was = await card(db, 'm9');
  assert.equal(was.state, 'filtered');
  assert.equal(was.archive_note, `Read again as a website form (patch 190): card ${fresh.id}`);
  assert.equal(Number(old.id), Number(was.id), 'the old card is kept, never deleted');
  assert.equal((await rereadTildaCards(db, { apply: true, by: 'Ritvars', env: ENV, fetchImpl: fakeGmail(box), now: NOW })).waiting, 0, 'once');
});

// patch 191 (his pick 27.11.2026 "Intake pulls it"): a Tilda card made into a lead before 190 left a person called
// "noreply@tilda.ws". Intake reads the email again and puts the form's name, email and phone on that person.
test('a Tilda card already made a lead: the person gets the form\'s name, email and phone, logged; never over somebody else', async () => {
  const db = await openDb();
  const AT = '2026-11-27T07:50:53.000Z';
  const person = async (id, name, email, phone) => db.prepare(`INSERT INTO people (id, name, email, phone, status, owner, source_channel, created_at)
    VALUES (?,?,?,?,?,?,?,?)`).run(id, name, email, phone, 'Contacted', 'Ieva', 'gmail', AT);
  await person('pT', 'noreply@tilda.ws', 'noreply@tilda.ws', null);
  await receive(db, { channel: 'gmail', externalId: 'm7', receivedAt: '2026-11-26T10:33:47.000Z', name: 'noreply@tilda.ws',
    email: 'noreply@tilda.ws', body: 'Request from [novikontas.org]', noFilter: true });
  await db.prepare(`UPDATE inbound SET state = 'qualified', person_id = 'pT' WHERE external_id = 'm7'`).run();
  const box = { messages: { m7: message('m7', 'Tilda <noreply@tilda.ws>', 'Request from [novikontas.org]', { html: HTML }) } };
  const pre = await rereadTildaCards(db, { env: ENV, fetchImpl: fakeGmail(box), now: NOW });
  assert.deepEqual(pre.leads.map((l) => l.person), ['pT']);
  assert.equal((await db.prepare('SELECT name FROM people WHERE id = ?').get('pT')).name, 'noreply@tilda.ws', 'the preview changes nothing');
  const r = await rereadTildaCards(db, { apply: true, by: 'Ritvars', env: ENV, fetchImpl: fakeGmail(box), now: NOW });
  assert.equal(r.leads[0].outcome, 'person fixed');
  assert.deepEqual(r.leads[0].changed.sort(), ['email', 'name', 'phone']);
  const p = await db.prepare('SELECT name, email, phone, status FROM people WHERE id = ?').get('pT');
  assert.deepEqual({ ...p }, { name: 'Anna Example', email: 'anna.example@mail.example', phone: '+371 2000 1122', status: 'Contacted' });
  const ev = await db.prepare(`SELECT subject, actor FROM events WHERE person_id = 'pT' ORDER BY id`).all();
  assert.ok(ev.some((e) => e.subject === 'Name changed' && e.actor === 'Intake'));
  assert.ok(ev.some((e) => e.subject === 'Website form read again (patch 191)'));
  assert.equal((await rereadTildaCards(db, { env: ENV, fetchImpl: fakeGmail(box), now: NOW })).leads.length, 0, 'once');
  // the form's email already belongs to somebody else: nothing changes
  const db2 = await openDb();
  await db2.prepare(`INSERT INTO people (id, name, email, phone, status, owner, source_channel, created_at)
    VALUES ('pT','noreply@tilda.ws','noreply@tilda.ws',NULL,'Contacted','Ieva','gmail',?), ('pA','Anna Example','anna.example@mail.example',NULL,'New','Ieva','website',?)`).run(AT, AT);
  await receive(db2, { channel: 'gmail', externalId: 'm7', receivedAt: '2026-11-26T10:33:47.000Z', name: 'x', email: 'noreply@tilda.ws', body: 'x', noFilter: true });
  await db2.prepare(`UPDATE inbound SET state = 'qualified', person_id = 'pT' WHERE external_id = 'm7'`).run();
  const r2 = await rereadTildaCards(db2, { apply: true, by: 'Ritvars', env: ENV, fetchImpl: fakeGmail(box), now: NOW });
  assert.equal(r2.leads[0].outcome, 'stays');
  assert.match(r2.leads[0].why, /already person pA/);
  assert.equal((await db2.prepare('SELECT name FROM people WHERE id = ?').get('pT')).name, 'noreply@tilda.ws');
});
