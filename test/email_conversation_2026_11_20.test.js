// THE WHOLE EMAIL CONVERSATION (20.11.2026, the owner's pick B). edu@'s SENT mail is read with the same read-only access,
// kept only when it went to somebody Intake holds (the conversation of one of their cards, or exactly one person's own
// address), shown in the person's Email conversation box; an email card answered in Gmail says "Answered by" and is not
// counted as waiting; the 13-month retention empties the sent texts too.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { syncSent } from '../src/sync.js';
import { recordSentMail, conversationFor, listInbound, waitingFor, purgeLineBodies, agedCount } from '../src/intake.js';
import { toSentShape, addressesOf, displayNameOf, sentQuery } from '../lib/gmail.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const H = 3600000;
const NOW = new Date();
const ago = (h) => new Date(NOW.getTime() - h * H).toISOString();
const OWN = 'edu' + '@' + 'novikontas.org';   // our own mailbox, written in parts

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const ENV = { CHANNEL_MODE_GMAIL: 'live', GMAIL_SERVICE_ACCOUNT_JSON: JSON.stringify({
  client_email: 'svc@example.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }) };

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64url');
const gmailMsg = ({ id, thread, at, from = `Novikontas Academy <${OWN}>`, to, subject = 'Re: Programmas maiņa', body = 'Labdien!', labels = ['SENT'] }) => ({
  id, threadId: thread, labelIds: labels, internalDate: String(Date.parse(at)),
  payload: { headers: [{ name: 'Date', value: new Date(at).toUTCString() }, { name: 'From', value: from }, { name: 'To', value: to }, { name: 'Subject', value: subject }],
    parts: [{ mimeType: 'text/plain', body: { data: b64(body) } }, { filename: 'iesniegums.pdf', body: { size: 1234 } }] } });

async function setup() {
  const db = await openDb(':memory:');
  await db.prepare("INSERT INTO people (id,name,email,status,owner,created_at) VALUES ('p1','Liene Kalna','liene@example.lv','Contacted','Admissions',?)").run(ago(500));
  await db.prepare("INSERT INTO people (id,name,email,status,owner,created_at) VALUES ('p2','Jānis Ozols','janis@example.lv','New','Admissions',?)").run(ago(500));
  const add = async (o) => {
    const r = await db.prepare(`INSERT INTO inbound (channel, thread_key, external_id, received_at, surface_at, suggested, state, source, person_id, contact_email, contact_name, body)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run('gmail', o.thread, 'x' + Math.random(), o.at, o.at, 'raw', o.state, 'provider', o.person || null, o.email, o.name, o.body);
    return Number(r.lastInsertRowid ?? (await db.prepare('SELECT MAX(id) n FROM inbound').get()).n);
  };
  const lead = await add({ thread: 'T1', at: ago(50), state: 'qualified', person: 'p1', email: 'liene@example.lv', name: 'Liene Kalna', body: 'Vai var mainīt programmu?' });
  const card = await add({ thread: 'T2', at: ago(30), state: 'new', email: 'anna@example.lv', name: 'Anna New', body: 'Labdien, kādi dokumenti vajadzīgi?' });
  return { db, lead, card };
}

test('the Gmail shape: recipients, the name on From, the text, attachments by name and size only', () => {
  const s = toSentShape(gmailMsg({ id: 'm1', thread: 'T1', at: ago(10), from: `Ieva Example <${OWN}>`, to: 'Liene <liene@example.lv>, other@example.lv', body: 'Labdien, Liene!' }));
  assert.equal(s.fromName, 'Ieva Example');
  assert.deepEqual(s.to, ['liene@example.lv', 'other@example.lv']);
  assert.equal(s.body, 'Labdien, Liene!');
  assert.deepEqual(s.attachments, [{ filename: 'iesniegums.pdf', size: 1234 }]);
  assert.equal(displayNameOf(OWN), null, 'a bare address has no name');
  assert.equal(displayNameOf(`"${OWN}" <${OWN}>`), null, 'an address used as the name is no name');
  assert.deepEqual(addressesOf('A <A@X.LV>; b@y.com'), ['a@x.lv', 'b@y.com']);
  assert.match(sentQuery(ago(24)), /^in:sent after:\d+$/);
});

test('a sent email is kept only for somebody Intake holds: by the conversation, else by exactly one person\'s address', async () => {
  const { db, lead, card } = await setup();
  const keep = async (o) => recordSentMail(db, toSentShape(gmailMsg(o)));
  // the conversation of a lead's card
  let r = await keep({ id: 's1', thread: 'T1', at: ago(40), to: 'liene@example.lv', body: 'Jā, var mainīt.' });
  assert.equal(r.stored, true); assert.equal(r.personId, 'p1'); assert.equal(r.inboundId, lead);
  // a new conversation to a person's own address
  r = await keep({ id: 's2', thread: 'T9', at: ago(20), to: 'janis@example.lv', subject: 'Uzaicinājums' });
  assert.equal(r.stored, true); assert.equal(r.personId, 'p2'); assert.equal(r.inboundId, null);
  // a waiting card's conversation (no person yet)
  r = await keep({ id: 's3', thread: 'T2', at: ago(25), to: 'anna@example.lv' });
  assert.equal(r.stored, true); assert.equal(r.inboundId, card);
  // nobody we hold: never stored
  r = await keep({ id: 's4', thread: 'T7', at: ago(5), to: 'supplier@example.com' });
  assert.equal(r.stored, false);
  // a repeat adds nothing
  r = await keep({ id: 's1', thread: 'T1', at: ago(40), to: 'liene@example.lv' });
  assert.equal(r.repeat, true);
  assert.equal(Number((await db.prepare('SELECT COUNT(*) n FROM mail_sent').get()).n), 3);
  const sup = await db.prepare("SELECT COUNT(*) n FROM mail_sent WHERE to_email = 'supplier@example.com'").get();
  assert.equal(Number(sup.n), 0, 'a supplier\'s email is never kept');
});

test('the conversation: both sides, newest first, by conversation; the waiting card becomes Answered and leaves the count', async () => {
  const { db, card } = await setup();
  await recordSentMail(db, toSentShape(gmailMsg({ id: 's1', thread: 'T1', at: ago(40), from: `Ieva Example <${OWN}>`, to: 'liene@example.lv', body: 'Jā, var mainīt.' })));
  const conv = await conversationFor(db, 'p1');
  assert.deepEqual(conv.map((m) => [m.dir, m.who]), [['out', 'Ieva Example'], ['in', 'Liene Kalna']], 'ours, newest first, then theirs');
  assert.equal(conv[0].thread, 'T1'); assert.equal(conv[1].thread, 'T1');
  // the waiting card: before, it is late and waiting
  let rows = await listInbound(db, { state: 'new' });
  let c = rows.find((r) => r.id === card);
  assert.equal(c.answered, null); assert.equal(c.aged, true);
  const before = await waitingFor(db, 'Admissions');
  const agedBefore = await agedCount(db);
  // edu@ answers it in Gmail
  await recordSentMail(db, toSentShape(gmailMsg({ id: 's3', thread: 'T2', at: ago(25), to: 'anna@example.lv' })));
  rows = await listInbound(db, { state: 'new' });
  c = rows.find((r) => r.id === card);
  assert.deepEqual(c.answered, { at: c.first_reply_at, by: 'edu@' }, 'no name on From: "edu@"');
  assert.equal(c.aged, false); assert.equal(c.answerNow, false);
  assert.equal(c.state, 'new', 'answering is not sorting: Make a lead / Set aside still to do');
  const after = await waitingFor(db, 'Admissions');
  if (before.intake) assert.equal(after.intake, before.intake - 1, 'out of the waiting count');
  assert.equal(await agedCount(db), agedBefore - 1, 'never late');
});

test('the 13-month retention empties the sent texts too, the row stays', async () => {
  const { db } = await setup();
  await recordSentMail(db, toSentShape(gmailMsg({ id: 'old', thread: 'T1', at: ago(24 * 400), to: 'liene@example.lv', body: 'Sen' })));
  await recordSentMail(db, toSentShape(gmailMsg({ id: 'new', thread: 'T1', at: ago(10), to: 'liene@example.lv', body: 'Nesen' })));
  await purgeLineBodies(db, ago(24 * 395));
  const rows = await db.prepare('SELECT external_id, body, body_deleted_at FROM mail_sent ORDER BY external_id').all();
  assert.deepEqual(rows.map((r) => [r.external_id, r.body, Boolean(r.body_deleted_at)]), [['new', 'Nesen', false], ['old', null, true]]);
  assert.ok(!(await conversationFor(db, 'p1')).some((m) => m.body === 'Sen'), 'an emptied text is not shown');
});

test('the sync: in:sent from its own bookmark, only messages edu@ sent, a refused message keeps the bookmark', async () => {
  const { db } = await setup();
  const msgs = { s1: gmailMsg({ id: 's1', thread: 'T1', at: ago(3), to: 'liene@example.lv' }), x: gmailMsg({ id: 'x', thread: 'T1', at: ago(3), to: 'liene@example.lv', labels: ['INBOX'] }) };
  const asked = [];
  const fetchImpl = async (url) => {
    if (url.includes('oauth2.googleapis.com/token')) { const b = { access_token: 'x', expires_in: 3600 }; return { ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) }; }
    asked.push(url);
    if (url.includes('/messages?')) return { ok: true, status: 200, json: async () => ({ messages: [{ id: 's1' }, { id: 'x' }, { id: 'gone' }] }) };
    const id = decodeURIComponent(url.split('/messages/')[1].split('?')[0]);
    return msgs[id] ? { ok: true, status: 200, json: async () => msgs[id] } : { ok: false, status: 404, json: async () => ({}), text: async () => '' };
  };
  const r = await syncSent(db, { now: NOW, env: ENV, fetchImpl, refreshToken: null });
  assert.equal(r.stored, 1, 'only the message edu@ sent'); assert.equal(r.ok, false, 'one message was refused');
  assert.match(decodeURIComponent(asked[0]), /q=in:sent after:\d+/);
  const state = await db.prepare("SELECT value FROM sync_state WHERE name = 'gmail_sent'").get();
  assert.ok(!state || !state.value, 'a refused message keeps the old bookmark (none yet), so it is asked again');
});

test('the page: the Email conversation box above History, theirs left and ours right; the Answered line on the card', () => {
  assert.match(APP, /function cConversation\(p\)/);
  assert.match(APP, /\$\{cLifeLine\(p\)\}\$\{next\}\$\{cConversation\(p\)\}\s*<div class="c-sheet"><h3>History/);
  assert.match(APP, /<h3>Email conversation<b>\$\{msgs\.length\}<\/b><\/h3>/);
  assert.match(APP, /✓ Answered by \$\{esc\(r\.answered\.by \|\| 'edu@'\)\}/);
  assert.match(APP, /n: rows\.filter\(\(r\) => cInboxAge\(r\.received_at\) === id && !r\.answered\)\.length/);
  // found on the real screen (20.11.2026): a column holding only answered cards counted 0 and folded shut, hiding the card;
  // the fold follows every card in the column, the count only the waiting ones
  assert.match(APP, /cards: rows\.filter\(\(r\) => cInboxAge\(r\.received_at\) === id\)\.length/);
  assert.match(APP, /const emptyFold = \(c\) => !openId && !C_IP\.col && cFoldEmpty\('inbox', c\.id, c\.cards\);/);
  assert.match(APP, /cols\.find\(\(c\) => c\.cards\)/);
});
