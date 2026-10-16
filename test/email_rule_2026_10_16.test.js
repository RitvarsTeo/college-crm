// THE EDU@ EMAIL RULE (the owner, 16.10.2026, after Ieva: "visi epasti nesaistīti ar admissions gan tur ir" - every
// email not about admissions is in the Inbox). An email reaches the Inbox only when it has the Admissions label (Q91)
// or reads as somebody wanting to study; a known person's email still goes to their profile; a reply in a conversation
// already in the Inbox or already a lead joins it; everything else is set aside like the automatic filter (Filtered
// automatically, with the reason), kept, can be brought back. A company booking crew training is not Admissions.
// Plus a one-off admin action over the email cards already waiting, preview first. Everything runs against a fake Gmail.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { syncGmail } from '../src/sync.js';
import { listLabelledIds } from '../lib/gmail.js';
import { receive, qualify, listInbound, bringBack, inboundHistory, setMark, emailStudyRead, emailStudyWhy,
  emailRuleOnWaiting, EMAIL_RULE_NOTE, CONFIG } from '../src/intake.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LABEL = { id: 'Label_77', name: 'Admissions' };
const RULE = CONFIG.emailFilter.studyRule;

const message = (id, from, subject, body, { labelIds = ['INBOX'], threadId = 't-' + id } = {}) => ({
  id, threadId, labelIds,
  payload: { mimeType: 'text/plain', headers: [
    { name: 'Date', value: 'Fri, 16 Oct 2026 09:00:00 +0300' },
    { name: 'From', value: from },
    { name: 'Subject', value: subject },
  ], body: { data: Buffer.from(body, 'utf8').toString('base64url') } },
});
// `inbox` is what in:inbox lists, `labelled` what labelIds=<the label> lists
function fakeGmail(box) {
  const reply = (body, ok = true, status = 200) => ({ ok, status, json: async () => body, text: async () => JSON.stringify(body) });
  const fetchImpl = async (url) => {
    if (url.includes('oauth2.googleapis.com/token')) return reply({ access_token: 'x', expires_in: 3600 });
    if (/\/labels$/.test(url)) return box.labelsFail ? reply({ error: { status: 'UNAVAILABLE' } }, false, 503) : reply({ labels: box.labels || [LABEL] });
    if (url.includes('/messages?')) {
      const label = new URL(url).searchParams.get('labelIds');
      const ids = label ? (label === LABEL.id ? box.labelled || [] : []) : box.inbox || [];
      return reply({ messages: ids.map((id) => ({ id })) });
    }
    if (url.includes('/threads/')) return reply({ messages: [] });
    const id = decodeURIComponent(url.split('/messages/')[1].split('?')[0]);
    return reply(box.messages[id]);
  };
  return { fetchImpl };
}
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const ENV = { CHANNEL_MODE_GMAIL: 'test', GMAIL_SERVICE_ACCOUNT_JSON: JSON.stringify({
  client_email: 'svc@example.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }) };
const pull = (db, box) => syncGmail(db, { env: ENV, fetchImpl: fakeGmail(box).fetchImpl, now: new Date('2026-10-16T07:00:00Z') });
const byExt = async (db) => Object.fromEntries((await db.prepare(`SELECT id, external_id, state, archive_reason, archive_note,
  person_id, body FROM inbound WHERE channel = 'gmail' ORDER BY id`).all()).map((r) => [r.external_id, r]));

async function withLead(db, addr) {
  const first = await receive(db, { channel: 'phone', externalId: 'call-' + addr, receivedAt: '2026-10-15T08:00:00Z', phone: '+37129990001', body: 'Incoming call' });
  const q = await qualify(db, first.id, { qualification: 'lead', createPerson: true, by: 'Ieva', nextAction: 'First call', stated: { email: addr } });
  return q.personId;
}

// ------------------------------------------------------------------------- the reading --
test('the reading: the app\'s own study reading plus the never-hide words, English, Latvian, Russian', () => {
  const stays = ['I want to study navigation', 'Question about the Marine Engineering programme', 'Is there a dormitory?',
    'How much is the tuition?', 'Which documents for admission do I need?', 'Can I enrol in September?', 'I finished secondary school',
    'Gribu pieteikties studijām', 'Vai ir kopmītnes?', 'Kāda ir mācību maksa?', 'Kad sākas uzņemšana?', 'Interesē kursi',
    'Хочу поступить в колледж', 'Есть ли общежитие?', 'Какие документы нужны для поступления?', 'Сколько стоит обучение?', 'Приёмная комиссия'];
  for (const t of stays) assert.equal(emailStudyRead(t).stay, true, t);
  for (const t of ['Hello', 'Meeting tomorrow at 10', 'Of course we will come on Monday', 'Ekskursija skolēniem', 'Re: your order',
    'Добрый день, жду ответа']) {
    assert.equal(emailStudyWhy(t), RULE.notStudyingWhy, t);
  }
  assert.equal(RULE.notStudyingWhy, 'Not about studying');
  // a word counts where a word starts: "kurs" is not inside "ekskursija", "course" is not "of course"
  assert.equal(emailStudyRead('ekskursija').stay, false);
  assert.match(emailStudyRead('Interested in the course').why, /reads as wanting to study/);
});

test('a company or supplier email is not Admissions, even when it names a course; admission words still win', () => {
  for (const t of ['Course booking for our crew\nWe would like to book Basic Safety for 6 crew members',
    'Purchase order 4411 for the simulator course', 'Invoice 2026/118', 'Rēķins par oktobri', 'Счет на оплату во вложении',
    'Mūsu apkalpes apmācība, kursi novembrī']) {
    const r = emailStudyRead(t);
    assert.equal(r.stay, false, t);
    assert.match(r.why, /^A company or supplier email, not about studying \("/, t);
  }
  assert.equal(emailStudyRead('Please send the invoice for my tuition fee').stay, true, 'a student\'s invoice for tuition stays');
  assert.equal(emailStudyRead('Our company sponsors a student who wants to enrol').stay, true);
});

// ------------------------------------------------------------------------ the Gmail pull --
test('labelled -> Inbox; study intent -> Inbox; anything else -> Filtered automatically, Not about studying, kept', async () => {
  const db = await openDb(':memory:');
  const box = { inbox: ['study', 'lv', 'other', 'b2b'], labelled: ['labelled'], messages: {
    labelled: message('labelled', 'Ilze <ilze@x.lv>', 'Hello', 'See you on Monday', { labelIds: [LABEL.id] }),
    study: message('study', 'Anna <anna@x.lv>', 'Question', 'I want to study navigation next year'),
    lv: message('lv', 'Jānis <janis@x.lv>', 'Jautājums', 'Vai ir dienesta viesnīca?'),
    other: message('other', 'Shop <sales@shop.lv>', 'Autumn offer', 'Our new chairs are in stock'),
    b2b: message('b2b', 'Crew Manager <crewing@shipco.com>', 'Course booking for our crew', 'Please book the Basic Safety course for 6 crew members. Purchase order attached.'),
  } };
  const r = await pull(db, box);
  assert.equal(r.ok, true, r.why);
  const by = await byExt(db);
  assert.equal(by.labelled.state, 'new', 'the Admissions label: always the Inbox');
  assert.equal(by.study.state, 'new');
  assert.equal(by.lv.state, 'new');
  for (const [ext, why] of [['other', /^Not about studying$/], ['b2b', /^A company or supplier email, not about studying/]]) {
    assert.equal(by[ext].state, 'filtered', ext);
    assert.equal(by[ext].archive_reason, 'Filtered automatically', ext);
    assert.match(by[ext].archive_note, why, ext);
    assert.ok(by[ext].body, 'kept with its text: ' + ext);
  }
  assert.equal(r.filtered, 2);
  assert.equal(r.inbox, 3);
  const aside = await listInbound(db, { state: 'notrelevant' });
  assert.deepEqual(aside.map((a) => a.external_id).sort(), ['b2b', 'other'], 'findable with the set-aside messages');
  await db.close();
});

test('a known person\'s email goes to their profile whatever it says; a mark still wins', async () => {
  const db = await openDb(':memory:');
  const pid = await withLead(db, 'anna@example.com');
  const r = await pull(db, { inbox: ['m1'], messages: { m1: message('m1', 'Anna <anna@example.com>', 'Thanks', 'Thank you, see you!') } });
  assert.equal(r.toPerson, 1);
  const by = await byExt(db);
  assert.deepEqual([by.m1.state, by.m1.person_id], ['qualified', pid], 'on their History, not set aside');
  // a supplier marked before: set aside with the mark, never by this rule's words
  const card = await receive(db, { channel: 'gmail', externalId: 'v0', email: 'vendor@supply.lv', body: 'Hello' });
  await db.prepare("UPDATE inbound SET state = 'new' WHERE id = ?").run(card.id);
  assert.ok((await setMark(db, card.id, { mark: 'Supplier or vendor', by: 'Ieva' })).ok);
  await pull(db, { inbox: ['v1'], messages: { v1: message('v1', 'V <vendor@supply.lv>', 'Hello', 'Hello') } });
  const v1 = (await byExt(db)).v1;
  assert.equal(v1.state, 'filtered');
  assert.doesNotMatch(v1.archive_note, /Not about studying/);
  await db.close();
});

test('a reply in a conversation already in the Inbox joins it; in one already a lead it goes on the person', async () => {
  const db = await openDb(':memory:');
  await pull(db, { inbox: ['q1'], messages: { q1: message('q1', 'Anna <anna@x.lv>', 'Studies', 'I want to study engineering', { threadId: 'T1' }) } });
  // her father answers in the same conversation, from another address, with nothing about studying
  const r = await pull(db, { inbox: ['q2'], messages: { q2: message('q2', 'Father <father@x.lv>', 'Re: Studies', 'Thanks, we will call you', { threadId: 'T1' }) } });
  assert.equal(r.joined, 1);
  const cards = await listInbound(db, { state: 'new' });
  assert.equal(cards.length, 1, 'one card, the thread is not broken');
  assert.match(cards[0].body, /I want to study[\s\S]*Thanks, we will call you/);
  // the card becomes a lead; the next reply in the thread lands on the person
  const q = await qualify(db, cards[0].id, { qualification: 'lead', createPerson: true, by: 'Ieva', nextAction: 'First call' });
  const r2 = await pull(db, { inbox: ['q3'], messages: { q3: message('q3', 'Father <father@x.lv>', 'Re: Studies', 'One more thing', { threadId: 'T1' }) } });
  assert.equal(r2.toPerson, 1);
  const q3 = (await byExt(db)).q3;
  assert.deepEqual([q3.state, q3.person_id], ['qualified', q.personId]);
  // a conversation that was set aside gives nothing: the reply is read on its own words
  await pull(db, { inbox: ['s1'], messages: { s1: message('s1', 'Shop <s@shop.lv>', 'Offer', 'Chairs', { threadId: 'T2' }) } });
  await pull(db, { inbox: ['s2'], messages: { s2: message('s2', 'Shop2 <s2@shop.lv>', 'Re: Offer', 'More chairs', { threadId: 'T2' }) } });
  assert.equal((await byExt(db)).s2.state, 'filtered');
  await db.close();
});

test('Bring back works on a message the rule set aside; the Admissions label brings it back too', async () => {
  const db = await openDb(':memory:');
  const box = { inbox: ['a1', 'a2'], labelled: [], messages: {
    a1: message('a1', 'Peter <peter@x.lv>', 'Hello', 'Can we talk?'), a2: message('a2', 'Maria <maria@x.lv>', 'Hello', 'Call me please') } };
  await pull(db, box);
  let by = await byExt(db);
  assert.equal(by.a1.state, 'filtered');
  const back = await bringBack(db, by.a1.id, { by: 'Ieva' });
  assert.equal(back.ok, true);
  assert.equal(back.textKept, true);
  assert.equal((await db.prepare('SELECT state FROM inbound WHERE id = ?').get(by.a1.id)).state, 'new');
  // a person labels a2 in edu@: the next pull brings it back (Q91 labelBringsBack)
  box.inbox = []; box.labelled = ['a2']; box.messages.a2.labelIds = [LABEL.id];
  const r = await pull(db, box);
  assert.equal(r.broughtBack, 1);
  by = await byExt(db);
  assert.equal(by.a2.state, 'new');
  assert.deepEqual((await inboundHistory(db, by.a2.id)).map((h) => h.actor), ['Admissions label']);
  await db.close();
});

// ------------------------------------------------------------------ the one-off --
async function waiting(db) {
  // cards that arrived before the rule, planted the way production holds them
  const plant = async (ext, from, body) => (await receive(db, { channel: 'gmail', externalId: ext, threadKey: 'th-' + ext,
    receivedAt: '2026-10-15T09:00:00Z', email: from, body })).id;
  const ids = {
    study: await plant('w-study', 'a@x.lv', 'Studies\nI want to study navigation'),
    chat: await plant('w-chat', 'b@x.lv', 'Hello\nCan we meet next week?'),
    b2b: await plant('w-b2b', 'crew@shipco.com', 'Booking\nCourse booking for our crew, 4 crew members'),
    label: await plant('w-label', 'c@x.lv', 'Hello\nSee you'),
    back: await plant('w-back', 'd@x.lv', 'Hello\nHi there'),
    known: await plant('w-known', 'known@x.lv', 'Hello\nThanks'),
  };
  await db.prepare("UPDATE inbound SET state = 'filtered' WHERE id = ?").run(ids.back);
  await bringBack(db, ids.back, { by: 'Ieva' });
  await db.prepare("INSERT INTO people (id, name, email, status) VALUES ('p-known', 'Known', 'known@x.lv', 'New')").run();
  return ids;
}

test('one-off: the preview lists counts and card numbers, no names, and changes nothing', async () => {
  const db = await openDb(':memory:');
  const ids = await waiting(db);
  const snap = async () => JSON.stringify(await db.prepare('SELECT id, state, archive_note FROM inbound ORDER BY id').all())
    + (await db.prepare('SELECT COUNT(*) n FROM inbound_history').get()).n;
  const before = await snap();
  const p = await emailRuleOnWaiting(db, { labelled: new Set(['w-label']) });
  assert.equal(await snap(), before, 'a preview changes nothing');
  assert.equal(p.applied, false);
  assert.equal(p.checked, 6);
  assert.equal(p.setAside, 2);
  const out = Object.fromEntries(p.cards.map((c) => [c.id, c]));
  assert.equal(out[ids.chat].outcome, 'set aside');
  assert.equal(out[ids.chat].why, 'Not about studying');
  assert.match(out[ids.b2b].why, /^A company or supplier email/);
  for (const [k, why] of [['study', /reads as wanting to study/], ['label', /Admissions label/], ['back', /brought back/], ['known', /somebody in Intake/]]) {
    assert.equal(out[ids[k]].outcome, 'stays', k);
    assert.match(out[ids[k]].why, why, k);
  }
  const text = JSON.stringify(p);
  for (const leak of ['a@x.lv', 'shipco', 'Known', 'navigation']) assert.ok(!text.includes(leak), 'no names or addresses: ' + leak);
  assert.deepEqual(Object.keys(p.cards[0]).sort(), ['id', 'outcome', 'received', 'why']);
  await db.close();
});

test('one-off: apply sets aside what the preview listed, logged, Bring back works; no label read = nothing moves', async () => {
  const db = await openDb(':memory:');
  const ids = await waiting(db);
  assert.match((await emailRuleOnWaiting(db, { apply: true, by: 'Ritvars' })).error, /label could not be read/);
  assert.match((await emailRuleOnWaiting(db, { apply: true, labelled: new Set() })).error, /who/);
  assert.equal((await listInbound(db, { state: 'new' })).length, 6, 'a refusal moves nothing');
  const done = await emailRuleOnWaiting(db, { apply: true, by: 'Ritvars', labelled: new Set(['w-label']), at: '2026-10-16T10:00:00Z' });
  assert.equal(done.applied, true);
  assert.equal(done.setAside, 2);
  const chat = await db.prepare('SELECT state, archive_reason, archive_note, processed_by, body FROM inbound WHERE id = ?').get(ids.chat);
  assert.deepEqual([chat.state, chat.archive_reason, chat.archive_note, chat.processed_by],
    ['filtered', 'Filtered automatically', 'Not about studying', 'machine']);
  assert.ok(chat.body, 'nothing deleted');
  const h = await inboundHistory(db, ids.chat);
  assert.deepEqual(h.map((x) => [x.action, x.actor, x.reason, x.note]),
    [['set_aside', 'Ritvars', 'Filtered automatically', 'Not about studying - ' + EMAIL_RULE_NOTE]]);
  assert.equal((await db.prepare("SELECT value FROM sync_state WHERE name = 'email_rule_on_waiting'").get()).value, '2');
  assert.equal((await listInbound(db, { state: 'new' })).length, 4);
  assert.equal((await bringBack(db, ids.chat, { by: 'Ieva' })).ok, true);
  const again = await emailRuleOnWaiting(db, { labelled: new Set(['w-label']) });
  assert.equal(again.setAside, 0, 'a card a person brought back stays back');
  await db.close();
});

test('one-off: the labelled ids are read from edu@ over every label page; a refused list is not ok', async () => {
  const box = { labelled: ['x1', 'x2'], messages: {} };
  const got = await listLabelledIds({ env: ENV, fetchImpl: fakeGmail(box).fetchImpl, since: new Date('2026-10-01T00:00:00Z') });
  assert.equal(got.ok, true, got.why);
  assert.deepEqual([...got.ids], ['x1', 'x2']);
  const bad = await listLabelledIds({ env: ENV, fetchImpl: fakeGmail({ labelsFail: true }).fetchImpl });
  assert.equal(bad.ok, false);
  assert.equal((await listLabelledIds({ env: { CHANNEL_MODE_GMAIL: 'test' }, fetchImpl: fakeGmail(box).fetchImpl })).ok, false, 'no sign-in, no answer');
});

function start(env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], { env: { ...process.env,
      PORT: '0', CRM_DB: ':memory:', DATASET: 'empty', CRM_AUTH: '', CRM_PUBLIC: '', DATABASE_URL: '', CRM_DB_DATABASE_URL_UNPOOLED: '', ...env },
    stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const look = (d) => { out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, base: `http://127.0.0.1:${m[1]}` }); };
    child.stdout.on('data', look); child.stderr.on('data', look);
    child.on('exit', () => reject(new Error(out)));
  });
}

test('one-off route: admins only; GET is the preview', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  const url = s.base + '/api/admin/inbox/email-rule';
  assert.equal((await fetch(url, { headers: { 'x-acting-as': 'Ieva' } })).status, 403);
  assert.equal((await fetch(url, { method: 'POST', headers: { 'x-acting-as': 'Ieva', 'content-type': 'application/json' },
    body: JSON.stringify({ apply: true }) })).status, 403);
  const look = await fetch(url, { headers: { 'x-acting-as': 'Ritvars' } }).then((r) => r.json());
  assert.equal(look.ok, true);
  assert.equal(look.applied, false);
});

test('the Help center says in one sentence what reaches the Inbox from email', () => {
  const help = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'help.json'), 'utf8'));
  const q = help.faq.find((x) => x.id === 'email-to-inbox');
  assert.ok(q, 'the question exists');
  assert.match(q.a, /Admissions label/);
  assert.match(q.a, /about studying/);
  assert.match(q.a, /Bring it back/);
  assert.equal(q.a.split(/[.!?](\s|$)/).filter((x) => x && x.trim()).length, 1, 'one sentence');
});
