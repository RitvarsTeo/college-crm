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
import { toSentShape, addressesOf, displayNameOf, sentQuery, SENT_PER_RUN } from '../lib/gmail.js';

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
  // a week old: late on any day it runs (30 hours ago on a Monday falls on the weekend and is not late yet)
  const card = await add({ thread: 'T2', at: ago(24 * 7), state: 'new', email: 'anna@example.lv', name: 'Anna New', body: 'Labdien, kādi dokumenti vajadzīgi?' });
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
    // Gmail lists newest first: the refused one is the newest, so the two older ones are read before it
    if (url.includes('/messages?')) return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'gone' }, { id: 'x' }, { id: 's1' }] }) };
    const id = decodeURIComponent(url.split('/messages/')[1].split('?')[0]);
    return msgs[id] ? { ok: true, status: 200, json: async () => msgs[id] } : { ok: false, status: 404, json: async () => ({}), text: async () => '' };
  };
  const r = await syncSent(db, { now: NOW, env: ENV, fetchImpl, refreshToken: null });
  assert.equal(r.stored, 1, 'only the message edu@ sent'); assert.equal(r.ok, false, 'one message was refused');
  assert.match(decodeURIComponent(asked[0]), /q=in:sent after:\d+/);
  const state = await db.prepare("SELECT value FROM sync_state WHERE name = 'gmail_sent'").get();
  assert.ok(!state || !state.value, 'a refused message keeps the old bookmark (none yet), so it is asked again');
});

test('the first run reads at most SENT_PER_RUN messages, oldest first, and the bookmark carries on from the last one read', async () => {
  const { db } = await setup();
  const n = SENT_PER_RUN + 5;
  const msgs = {}; const list = [];
  for (let i = 0; i < n; i++) {   // m0 is the oldest; Gmail lists newest first
    msgs['m' + i] = gmailMsg({ id: 'm' + i, thread: 'T1', at: ago(n - i + 1), to: 'liene@example.lv' });
    list.unshift({ id: 'm' + i });
  }
  const fetched = [];
  const fetchImpl = async (url) => {
    if (url.includes('oauth2.googleapis.com/token')) { const b = { access_token: 'x', expires_in: 3600 }; return { ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) }; }
    if (url.includes('/messages?')) return { ok: true, status: 200, json: async () => ({ messages: list }) };
    const id = decodeURIComponent(url.split('/messages/')[1].split('?')[0]); fetched.push(id);
    return { ok: true, status: 200, json: async () => msgs[id] };
  };
  const r = await syncSent(db, { now: NOW, env: ENV, fetchImpl, refreshToken: null });
  assert.equal(fetched.length, SENT_PER_RUN, 'never more than one run can take');
  assert.equal(fetched[0], 'm0', 'oldest first');
  assert.equal(r.stored, SENT_PER_RUN); assert.equal(r.more, true);
  const state = await db.prepare("SELECT value FROM sync_state WHERE name = 'gmail_sent'").get();
  assert.equal(state.value, new Date(new Date(ago(n - (SENT_PER_RUN - 1) + 1)).toUTCString()).toISOString(), 'the bookmark is the last message read');
});

test('ONE PLACE (patch 157, his words "just one place where everything is"): emails and History in one list, in time order, nothing twice', () => {
  const src = APP.slice(APP.indexOf('const C_ONE_NEWEST_FIRST'), APP.indexOf('// one email in the list'));
  const cOnePlace = new Function(`${src.replace(/^const /gm, 'var ')}; return cOnePlace;`)();
  const p = {
    conversation: [
      { id: 'm1', dir: 'in', at: '2026-11-14T08:23:00Z', who: 'Liene' },
      { id: 'm2', dir: 'out', at: '2026-11-14T16:23:00Z', who: 'edu@' },
    ],
    timeline: [
      { id: 'w1', kind: 'message', channel: 'gmail', occurred_at: '2026-11-14T08:23:00Z' },                    // the same email: left out
      { id: 'r1', kind: 'email', direction: 'out', occurred_at: '2026-11-14T16:23:00.000Z', subject: 'Email reply sent' }, // the reply is there: left out
      { id: 'r0', kind: 'email', direction: 'out', occurred_at: '2026-10-01T10:00:00Z', subject: 'Email reply sent' },     // no text kept: stays
      { id: 'c1', kind: 'call', channel: 'phone', occurred_at: '2026-11-15T10:12:00Z' },
      { id: 'n1', kind: 'note', occurred_at: '2026-11-16T09:00:00Z' },
      { id: 'w2', kind: 'message', channel: 'website', occurred_at: '2026-11-13T12:00:00Z' },
    ] };
  const list = cOnePlace(p).map((x) => (x.m ? x.m.id : x.e.id));
  // HIS PICK B: "I SAID OLDEST ON TOP!"
  assert.deepEqual(list, ['r0', 'w2', 'm1', 'm2', 'c1', 'n1'], 'oldest on top, emails among the calls and notes, nothing twice');
  assert.match(APP, /const C_ONE_NEWEST_FIRST = false;/);
  assert.match(APP, /const tl = cOnePlace\(p\);/);
  assert.match(APP, /\$\{tl\.map\(\(x\) => \(x\.m \? cMailBubble\(x\.m, p\) : ev\(x\.e\)\)\)\.join\(''\)/);
  assert.doesNotMatch(APP, /cConversation\(p\)/, 'no separate box any more');
});

test('the page: emails in History theirs left and ours right; the Answered line on the card', () => {
  assert.match(APP, /const cMailBubble = \(m, p\) => `<div class="c-cb \$\{m\.dir === 'out' \? 'out' : 'in'\}">/);
  assert.match(APP, /✓ Answered by \$\{esc\(r\.answered\.by \|\| 'edu@'\)\}/);
  assert.match(APP, /n: rows\.filter\(\(r\) => cInboxAge\(r\.received_at\) === id && !r\.answered\)\.length/);
  // found on the real screen (20.11.2026): a column holding only answered cards counted 0 and folded shut, hiding the card;
  // the fold follows every card in the column, the count only the waiting ones
  assert.match(APP, /cards: rows\.filter\(\(r\) => cInboxAge\(r\.received_at\) === id\)\.length/);
  assert.match(APP, /const emptyFold = \(c\) => !openId && !C_IP\.col && cFoldEmpty\('inbox', c\.id, c\.cards\);/);
  assert.match(APP, /cols\.find\(\(c\) => c\.cards\)/);
});

// ------------------------------------------------- the update popup + own mailbox --
import * as staffMail from '../src/staffmail.js';
import { recordMailbox } from '../src/intake.js';
import { syncStaffMail } from '../src/sync.js';

test('the update popup: once per Academy account, either answer ends it, Allow is read-only Gmail', async () => {
  const { db } = await setup();
  const ieva = { email: 'Staff.One@example.lv', areas: ['academy'] };
  assert.deepEqual(await staffMail.popupFor(db, ieva), { show: true });
  assert.deepEqual(await staffMail.popupFor(db, { email: 'tc@example.lv', areas: ['tc'] }), { show: false }, 'only the Academy');
  assert.deepEqual(await staffMail.popupFor(db, null), { show: false });
  assert.deepEqual(await staffMail.recordAnswer(db, ieva.email, 'later'), { recorded: true, answer: 'later' });
  assert.deepEqual(await staffMail.popupFor(db, ieva), { show: false }, 'never shown again');
  assert.deepEqual(await staffMail.recordAnswer(db, ieva.email, 'allow'), { recorded: false, answer: 'later' }, 'the first answer stays');
  await assert.rejects(() => staffMail.recordAnswer(db, 'x@example.lv', 'maybe'));
  const ov = await staffMail.overview(db);
  assert.deepEqual(ov.answers.map((a) => [a.user_email, a.answer]), [['staff.one@example.lv', 'later']]);
  const url = staffMail.consentUrl({ env: { GMAIL_OAUTH_CLIENT_ID: 'c', GMAIL_OAUTH_CLIENT_SECRET: 's' }, state: 'st', redirectUri: 'https://x/cb', email: ieva.email });
  assert.equal(new URL(url).searchParams.get('scope'), 'https://www.googleapis.com/auth/gmail.readonly openid email', 'read-only Gmail and the address, nothing else');
  assert.equal(new URL(url).searchParams.get('login_hint'), ieva.email);
});

test('an own mailbox: only mail with exactly one student is kept, both directions, named by the mailbox owner', async () => {
  const { db } = await setup();
  const mk = (o) => ({ ...toSentShape(gmailMsg(o)), mine: o.mine });
  let r = await recordMailbox(db, mk({ id: 'a', thread: 'X1', at: ago(9), from: 'Staff One <staff.one@example.lv>', to: 'liene@example.lv', body: 'Sveika!', mine: 'out' }), { mailbox: 'staff.one@example.lv', name: 'Staff One' });
  assert.equal(r.stored, true); assert.equal(r.direction, 'out');
  r = await recordMailbox(db, mk({ id: 'b', thread: 'X1', at: ago(8), from: 'Liene <liene@example.lv>', to: 'staff.one@example.lv', body: 'Paldies!', mine: 'in' }), { mailbox: 'staff.one@example.lv' });
  assert.equal(r.stored, true); assert.equal(r.direction, 'in');
  r = await recordMailbox(db, mk({ id: 'c', thread: 'X2', at: ago(7), from: 'Friend <friend@example.com>', to: 'staff.one@example.lv', body: 'private', mine: 'in' }), { mailbox: 'staff.one@example.lv' });
  assert.equal(r.stored, false, 'private mail is never kept');
  r = await recordMailbox(db, mk({ id: 'd', thread: 'X3', at: ago(6), to: 'liene@example.lv, janis@example.lv', mine: 'out' }), { mailbox: 'staff.one@example.lv' });
  assert.equal(r.stored, false, 'two students in one email: a question for a person, not a guess');
  r = await recordMailbox(db, mk({ id: 'a', thread: 'X1', at: ago(9), to: 'liene@example.lv', mine: 'out' }), { mailbox: 'staff.one@example.lv' });
  assert.equal(r.repeat, true);
  const conv = await conversationFor(db, 'p1');
  assert.deepEqual(conv.slice(0, 2).map((m) => [m.dir, m.who]), [['in', 'Liene Kalna'], ['out', 'Staff One']]);
});

test('the own-mailbox sync: nothing without a connection; a revoked one is dropped', async () => {
  const { db } = await setup();
  assert.deepEqual(await syncStaffMail(db, { now: NOW, env: {} }), { mailboxes: 0, read: 0, stored: 0, gone: 0, refused: 0 });
  const env = { CRM_SESSION_SECRET: 'k'.repeat(40), GMAIL_OAUTH_CLIENT_ID: 'c', GMAIL_OAUTH_CLIENT_SECRET: 's' };
  await staffMail.saveLink(db, 'staff.one@example.lv', 'refresh-token', env);
  const fetchImpl = async () => ({ ok: false, status: 400, json: async () => ({}), text: async () => '{"error":"invalid_grant"}' });
  const r = await syncStaffMail(db, { now: NOW, env, fetchImpl });
  assert.equal(r.gone, 1);
  assert.equal((await staffMail.overview(db)).links.length, 0, 'a mailbox Google no longer allows is let go');
  const raw = await db.prepare("SELECT COUNT(*) n FROM staff_mail_links").get();
  assert.equal(Number(raw.n), 0);
});

test('the popup on the page: once after sign-in, the approved words, Allow / Not now, nothing behind it clickable', () => {
  assert.match(APP, /if \(AUTH\.on && AUTH\.user\) cUpdatePopup\(\);/);
  assert.match(APP, /<div class="c-upd-tag">What's new<\/div>/);
  assert.match(APP, /<h2 id="c-upd-t">The whole email conversation, in Intake<\/h2>/);
  assert.match(APP, /<p>Each student now shows every email: theirs and our replies, in one place\. An answered email is marked "Answered" in the Inbox\.<\/p>/);
  assert.match(APP, /<p>Allow Intake to include your own mailbox too\. Only mail with students is kept\.<\/p>/);
  assert.match(APP, /<a class="c-upd-yes" href="\/api\/me\/mailbox\/allow">Allow<\/a><button type="button" class="c-upd-no" onclick="cUpdateLater\(this\)">Not now<\/button>/);
  assert.match(APP, /\.c-upd\{position:fixed;inset:0;z-index:9999;background:rgba\(10,20,40,\.62\)/);
});

test('the popup\'s Show me (patch 157): opens a student, docks the box, answers nothing; Allow stays the big button', async () => {
  assert.match(APP, /<button type="button" class="c-upd-link" onclick="cUpdateShowMe\(this\)">Show me →<\/button>/);
  const fn = APP.slice(APP.indexOf('async function cUpdateShowMe'), APP.indexOf('async function cUpdateLater'));
  assert.doesNotMatch(fn, /update-popup|mailbox\/allow|remove\(\)/, 'Show me never records an answer or closes the box');
  assert.match(fn, /el\.classList\.add\('docked'\)/);
  assert.match(fn, /apiFetch\('\/api\/me\/show-me'\)/);
  assert.match(APP, /\.c-upd\.docked\{background:transparent;pointer-events:none;place-items:end;padding:20px\}/);
  assert.match(APP, /\.c-upd\.docked \.c-upd-row\{flex-direction:column\} \.c-upd\.docked \.c-upd-yes\{padding:13px;font-size:15px\}/);
  // the student: whose emails moved last, a real person only
  const { db } = await setup();
  const { latestConversationPerson } = await import('../src/intake.js');
  assert.deepEqual(await latestConversationPerson(db), { id: 'p1' }, 'Liene\'s card email is the newest');
  await recordSentMail(db, toSentShape(gmailMsg({ id: 'z', thread: 'T9', at: ago(1), to: 'janis@example.lv' })));
  assert.deepEqual(await latestConversationPerson(db), { id: 'p2' });
});
