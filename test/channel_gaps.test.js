// The channel gaps Session C found on 30.09.2026 (crm-channel-docs HANDOVER.md, C1-C7), fixed by
// Session B the same day on Ritvars' "LETS DO ALL as per maximum in our code".
//
// NOTHING HERE CALLS A PROVIDER. Every token and secret below is a fake that says so.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { adaptAll } from '../src/adapters.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export function start(env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], { env: { ...process.env,
      PORT: '0', CRM_DB: ':memory:', DATASET: 'empty', CRM_AUTH: '', CRM_PUBLIC: '', DATABASE_URL: '',
      CRM_DB_DATABASE_URL_UNPOOLED: '', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const look = (d) => { out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, base: `http://127.0.0.1:${m[1]}` }); };
    child.stdout.on('data', look); child.stderr.on('data', look);
    child.on('exit', () => reject(new Error(out)));
  });
}
const send = (base, channel, payload) => fetch(`${base}/api/inbound/${channel}`, { method: 'POST',
  headers: { 'content-type': 'application/json', 'x-crm-simulated': '1', 'x-acting-as': 'Ieva' },
  body: JSON.stringify(payload) }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));
const newLeads = (base) => fetch(`${base}/api/intake?state=new`, { headers: { 'x-acting-as': 'Ieva' } })
  .then((r) => r.json()).then((j) => (Array.isArray(j) ? j : j.items || j.rows || []));

// ------------------------------------------------------------------ C1 ----
// Decided by Ritvars 30.09 (popup B): the Facebook Page registers ONE Meta address,
// /api/inbound/facebook. Inside it, messaging[] is Messenger and a leadgen change is Facebook.
const page = {
  object: 'page',
  entry: [{
    id: 'page-1', time: 1727690000,
    changes: [{ field: 'leadgen', value: { leadgen_id: 'lead-1', form_id: 'form-1', ad_id: 'ad-1', created_time: 1727690000 } }],
    messaging: [{ sender: { id: 'psid-1' }, recipient: { id: 'page-1' }, timestamp: 1727690001000,
      message: { mid: 'm-1', text: 'Hello, I want to study navigation' } }],
  }],
};

test('C1: a Page delivery on the facebook address: messages are Messenger, lead forms are Facebook', () => {
  const evs = adaptAll('facebook', page);
  assert.deepEqual(evs.map((e) => [e.channel, e.externalEventId]), [['facebook', 'lead-1'], ['messenger', 'm-1']]);
  // Instagram keeps its own channel for both
  assert.deepEqual(adaptAll('instagram', page).map((e) => e.channel), ['instagram', 'instagram']);
});

test('C1 over the wire: one POST to /api/inbound/facebook lands as one Messenger and one Facebook item', async (t) => {
  const s = await start({ CHANNEL_MODE_FACEBOOK: 'test' });
  t.after(() => s.child.kill());
  const r = await send(s.base, 'facebook', page);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const items = await newLeads(s.base);
  assert.deepEqual(items.map((i) => i.channel).sort(), ['facebook', 'messenger']);
  // a Meta retry of the same delivery adds nothing
  await send(s.base, 'facebook', page);
  assert.equal((await newLeads(s.base)).length, 2);
});

// ------------------------------------------------------------------ C4 ----
// Open Day: the booking tool sends the booking, and later whether the person came. The second
// message has the same booking_ref, so it used to be dropped as a repeat. Now a linked booking is a
// registration on the Open Day list, and attendance from the tool updates it exactly as the hand
// tick on that list does ("Attended the visit" + "Follow up after the visit").
const booking = (over = {}) => ({ booking_ref: 'od-77', event_id: 'openday-2026-10', booked_at: '2026-09-30T08:00:00.000Z',
  name: 'Gatis Purmalis', email: 'gatis.p@example.com', phone: '+37126550077', programme: 'NAV', slot: '14:00', ...over });
const qualifyItem = (base, id) => fetch(`${base}/api/intake/${id}/qualify`, { method: 'POST',
  headers: { 'content-type': 'application/json', 'x-acting-as': 'Ieva' },
  body: JSON.stringify({ qualification: 'lead', createPerson: true, nextAction: 'Call after the visit', by: 'Ieva' }) })
  .then((r) => r.json());
const personOf = (base, id) => fetch(`${base}/api/people/${id}`, { headers: { 'x-acting-as': 'Ieva' } }).then((r) => r.json());

test('C4: attendance sent later for the same booking reaches the Open Day list and the person', async (t) => {
  const s = await start({ CHANNEL_MODE_OPEN_DAY: 'test' });
  t.after(() => s.child.kill());
  const b1 = await send(s.base, 'open_day', booking());
  assert.equal(b1.status, 200);
  // attendance arrives before anybody linked the booking: kept, not dropped
  const a1 = await send(s.base, 'open_day', booking({ attended: true }));
  assert.equal(a1.json.outcome, 'attendance recorded');
  assert.equal((await newLeads(s.base)).length, 1, 'still one item in New Leads');

  const q = await qualifyItem(s.base, b1.json.inboundId);
  assert.equal(q.ok, true, JSON.stringify(q));
  let person = await personOf(s.base, q.personId);
  assert.equal(person.registrations.length, 1, 'the booking is on the Open Day list');
  assert.equal(person.registrations[0].open_day_id, 'openday-2026-10');
  assert.equal(person.registrations[0].slot, '14:00');
  assert.equal(person.registrations[0].attended, 1);
  assert.equal(person.timeline.filter((e) => e.subject === 'Attended the visit').length, 1);
  assert.ok(person.tasks.some((x) => x.label === 'Follow up after the visit' && !x.done_at));

  // the tool sends the same again: nothing new
  const a2 = await send(s.base, 'open_day', booking({ attended: true }));
  assert.equal(a2.json.outcome, 'already had it');
  person = await personOf(s.base, q.personId);
  assert.equal(person.timeline.filter((e) => e.subject === 'Attended the visit').length, 1);
  assert.equal(person.tasks.filter((x) => x.label === 'Follow up after the visit').length, 1);

  // a correction from the tool
  const a3 = await send(s.base, 'open_day', booking({ attended: 'false' }));
  assert.equal(a3.json.outcome, 'attendance recorded');
  person = await personOf(s.base, q.personId);
  assert.equal(person.registrations[0].attended, 0);
  assert.equal(person.timeline.filter((e) => e.subject === 'Did not attend').length, 1);
  const days = await fetch(`${s.base}/api/opendays`, { headers: { 'x-acting-as': 'Ieva' } }).then((r) => r.json());
  assert.equal(days.find((d) => d.id === 'openday-2026-10').registrations.length, 1);
});

test('C4: a booking with no attendance yet is a registration with attendance not marked', async (t) => {
  const s = await start({ CHANNEL_MODE_OPEN_DAY: 'test' });
  t.after(() => s.child.kill());
  const b1 = await send(s.base, 'open_day', booking({ booking_ref: 'od-78', email: 'other@example.com', phone: '+37126550078' }));
  const q = await qualifyItem(s.base, b1.json.inboundId);
  const person = await personOf(s.base, q.personId);
  assert.equal(person.registrations.length, 1);
  assert.equal(person.registrations[0].attended, null);
  // an unreadable attendance value is ignored, not guessed
  const a = await send(s.base, 'open_day', booking({ booking_ref: 'od-78', attended: 'maybe' }));
  assert.equal(a.json.outcome, 'already had it');
});

// ------------------------------------------------------------ C2 + C7a ----
// A Meta lead and a LinkedIn lead notify with ids only. The answers are fetched with the page's /
// app's token (lib/leads.js, shapes checked against Meta's and LinkedIn's documents 30.09.2026),
// straight away, and again by the daily retry when that failed. A local stand-in plays the provider.
import http from 'node:http';
const META_TOKEN = 'test-meta-page-token-not-real';
const LI_TOKEN = 'test-linkedin-token-not-real';

function provider() {
  const seen = [];
  const srv = http.createServer((req, res) => {
    seen.push({ url: req.url, auth: req.headers.authorization, version: req.headers['linkedin-version'] });
    const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.url.startsWith('/lead-9?')) {
      return send(200, { id: 'lead-9', created_time: '2026-09-30T08:00:00+0000', ad_id: 'ad-1', form_id: 'form-1',
        field_data: [{ name: 'full_name', values: ['Marta Liepa'] }, { name: 'email', values: ['marta@example.com'] },
          { name: 'phone_number', values: ['+37129990011'] }, { name: 'programme', values: ['NAV'] },
          { name: 'kad_vari_sakt', values: ['2027'] }] });
    }
    if (req.url === '/leadFormResponses/resp-5') {
      return send(200, { id: 'resp-5', versionedLeadGenFormUrn: 'urn:li:versionedLeadGenForm:(urn:li:leadGenForm:3162,1)',
        formResponse: { answers: [
          { questionId: 1, answerDetails: { textQuestionAnswer: { answer: 'Janis' } } },
          { questionId: 2, answerDetails: { textQuestionAnswer: { answer: 'Kalns' } } },
          { questionId: 3, answerDetails: { textQuestionAnswer: { answer: 'janis.k@example.com' } } }] } });
    }
    if (req.url === '/leadForms/3162') {
      return send(200, { id: 3162, content: { questions: [
        { questionId: 1, name: 'firstName', predefinedField: 'FIRST_NAME' },
        { questionId: 2, name: 'lastName', predefinedField: 'LAST_NAME' },
        { questionId: 3, name: 'email', predefinedField: 'EMAIL' }] } });
    }
    return send(404, { error: 'no' });
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve({ srv, seen, base: `http://127.0.0.1:${srv.address().port}` })));
}
const metaLeadDelivery = { object: 'page', entry: [{ id: 'page-1', time: 1727690000,
  changes: [{ field: 'leadgen', value: { leadgen_id: 'lead-9', page_id: 'page-1', form_id: 'form-1', ad_id: 'ad-1', created_time: 1727690000 } }] }] };
const liDelivery = { leadGenFormResponse: 'urn:li:leadGenFormResponse:resp-5', occurredAt: 1727690000000,
  leadType: 'SPONSORED', owner: { sponsoredAccount: 'urn:li:sponsoredAccount:1' } };

test('C2: a Meta lead arrives with its name, email and phone fetched from Meta', async (t) => {
  const p = await provider();
  t.after(() => p.srv.close());
  const s = await start({ CHANNEL_MODE_FACEBOOK: 'test', META_PAGE_ACCESS_TOKEN: META_TOKEN, META_GRAPH_BASE: p.base });
  t.after(() => s.child.kill());
  const r = await send(s.base, 'facebook', metaLeadDelivery);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const [item] = await newLeads(s.base);
  assert.equal(item.contact_name, 'Marta Liepa');
  assert.equal(item.contact_email, 'marta@example.com');
  assert.equal(item.contact_phone, '+37129990011');
  assert.match(item.body, /kad_vari_sakt: 2027/, 'every answer is there to read');
  assert.equal(p.seen[0].auth, `Bearer ${META_TOKEN}`);
  assert.ok(!p.seen[0].url.includes(META_TOKEN), 'the token is never in a URL');
  assert.ok(!JSON.stringify(r.json).includes(META_TOKEN));
});

test('C7: a LinkedIn lead arrives with its answers fetched from Lead Sync, mapped by the form', async (t) => {
  const p = await provider();
  t.after(() => p.srv.close());
  const s = await start({ CHANNEL_MODE_LINKEDIN: 'test', LINKEDIN_ACCESS_TOKEN: LI_TOKEN, LINKEDIN_API_BASE: p.base });
  t.after(() => s.child.kill());
  const r = await send(s.base, 'linkedin', liDelivery);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const [item] = await newLeads(s.base);
  assert.equal(item.contact_name, 'Janis Kalns');
  assert.equal(item.contact_email, 'janis.k@example.com');
  assert.ok(p.seen.every((x) => x.auth === `Bearer ${LI_TOKEN}` && x.version === '202609'));
});

test('C2: no token yet -> the lead still arrives (ids only) and the daily retry fills it in later', async (t) => {
  const p = await provider();
  t.after(() => p.srv.close());
  const { openDb } = await import('../src/db.js');
  const { receive } = await import('../src/intake.js');
  const { queueLeadAnswers, retryLeadAnswers } = await import('../src/leadanswers.js');
  const db = await openDb(':memory:');
  const ev = adaptAll('facebook', metaLeadDelivery)[0];
  const { toIntake } = await import('../src/adapters.js');
  const got = await receive(db, { ...toIntake(ev), source: 'simulated' });
  const first = await queueLeadAnswers(db, ev, { env: {} });
  assert.equal(first.state, 'pending');
  assert.match(first.why, /META_PAGE_ACCESS_TOKEN is not set/);
  let row = await db.prepare('SELECT * FROM inbound WHERE id = ?').get(got.id);
  assert.equal(row.contact_email, null);
  const env = { META_PAGE_ACCESS_TOKEN: META_TOKEN, META_GRAPH_BASE: p.base };
  const r = await retryLeadAnswers(db, { env });
  assert.equal(r.filled, 1);
  row = await db.prepare('SELECT * FROM inbound WHERE id = ?').get(got.id);
  assert.equal(row.contact_email, 'marta@example.com');
  assert.equal((await retryLeadAnswers(db, { env })).filled, 0, 'done once');
});

test('C2: the retry runs from the cron list', async () => {
  const fs = await import('node:fs');
  const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  assert.ok(v.crons.some((c) => c.path === '/api/cron/lead-answers'));
  assert.ok(fs.existsSync(path.join(ROOT, 'api', 'cron', 'lead-answers.js')));
});

// ---------------------------------------------------------------- C7b ----
// TikTok sends `content` as a JSON STRING and documents no single shape for it (which product
// carries our messages or lead forms is Tetiana's open question). So only fields that plainly
// ARE a name, an email, a phone or a message text are read, at any depth; nothing is guessed.
const tik = (content) => ({ client_key: 'ck', event: 'lead.create', create_time: 1727690000, user_openid: 'oid-1',
  content: JSON.stringify(content) });

test('C7: TikTok content: a plainly named name, email, phone and message are read', () => {
  const [ev] = adaptAll('tiktok', tik({ lead: { full_name: 'Ance Roze', email: 'ance@example.com',
    phone_number: '+37129990033' }, message: { text: 'Vai ir vietas NAV?' } }));
  assert.equal(ev.senderName, 'Ance Roze');
  assert.equal(ev.senderEmail, 'ance@example.com');
  assert.equal(ev.senderPhone, '+37129990033');
  assert.equal(ev.messageBody, 'Vai ir vietas NAV?');
});

test('C7: TikTok content: nothing plainly named -> nothing invented', () => {
  const [ev] = adaptAll('tiktok', tik({ video_id: '123', share_id: 'x', status: 'ok' }));
  assert.equal(ev.senderName, null);
  assert.equal(ev.senderEmail, null);
  assert.equal(ev.senderPhone, null);
  assert.equal(ev.messageBody, 'TikTok lead.create');
  // an "email" that is not an email is not taken
  const [bad] = adaptAll('tiktok', tik({ email: 'not-an-address' }));
  assert.equal(bad.senderEmail, null);
});

// ------------------------------------------------------------------ C6 ----
// The Apps Script the form owner pastes (scripts/google-form/Code.gs). Run here against stand-ins for
// Google's objects; what it would send is posted to the running server with the shared secret.
import vm from 'node:vm';
const FORM_SECRET = 'test-google-form-secret-not-real';

function runScript(fn, { responses = 1, secret = FORM_SECRET } = {}) {
  const sent = [];
  const triggers = [];
  const resp = (i) => ({ getId: () => 'resp-' + i, getTimestamp: () => new Date('2026-09-30T08:0' + i + ':00Z'),
    getRespondentEmail: () => 'liga' + i + '@example.com',
    getItemResponses: () => [
      { getItem: () => ({ getTitle: () => 'Vārds uzvārds' }), getResponse: () => 'Līga Bērza ' + i },
      { getItem: () => ({ getTitle: () => 'Programma' }), getResponse: () => 'NAV' },
      { getItem: () => ({ getTitle: () => 'Piekrītu saņemt informāciju par studijām' }), getResponse: () => ['Jā'] }] });
  const form = { getId: () => 'form-app-1', getResponses: () => Array.from({ length: responses }, (_, i) => resp(i)) };
  const ctx = {
    console: { error() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k === 'CRM_SECRET' ? secret : null) }) },
    UrlFetchApp: { fetch: (url, o) => { sent.push({ url, o }); return { getResponseCode: () => 200 }; } },
    FormApp: { getActiveForm: () => form },
    ScriptApp: { getProjectTriggers: () => [], deleteTrigger() {},
      newTrigger: (h) => ({ forForm: () => ({ onFormSubmit: () => ({ create: () => triggers.push(h) }) }) }) },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'scripts', 'google-form', 'Code.gs'), 'utf8'), ctx);
  const out = fn(ctx, { form, resp });
  return { sent, triggers, out };
}
import fs from 'node:fs';

test('C6: the script sends each response with the secret from Script Properties, never from its text', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'google-form', 'Code.gs'), 'utf8');
  assert.doesNotMatch(src, /x-crm-secret':\s*'[^']/, 'no secret value in the script');
  const r = runScript((ctx, { form, resp }) => ctx.onFormSubmit({ source: form, response: resp(0) }));
  assert.equal(r.sent.length, 1);
  assert.equal(r.sent[0].url, 'https://crm-novikontas.vercel.app/api/inbound/google_form');
  assert.equal(r.sent[0].o.headers['x-crm-secret'], FORM_SECRET);
  const body = JSON.parse(r.sent[0].o.payload);
  assert.equal(body.responseId, 'resp-0');
  assert.deepEqual(body.answers['Programma'], ['NAV']);
  assert.equal(runScript((ctx) => ctx.install()).triggers[0], 'onFormSubmit');
  assert.throws(() => runScript((ctx, { form, resp }) => ctx.onFormSubmit({ source: form, response: resp(0) }), { secret: null }),
    /CRM_SECRET is not set/);
});

test('C6 over the wire: what the script sends lands in New Leads, and resendAll repeats nothing', async (t) => {
  const s = await start({ CHANNEL_MODE_GOOGLE_FORM: 'test', GOOGLE_FORM_SECRET: FORM_SECRET });
  t.after(() => s.child.kill());
  const r = runScript((ctx) => ctx.resendAll(), { responses: 2 });
  const post = (x) => fetch(s.base + '/api/inbound/google_form', { method: 'POST',
    headers: { 'content-type': x.o.contentType, ...x.o.headers }, body: x.o.payload }).then((res) => res.status);
  for (const x of r.sent) assert.equal(await post(x), 200);
  for (const x of r.sent) assert.equal(await post(x), 200, 'a repeat is fine');
  const items = await newLeads(s.base);
  assert.equal(items.length, 2);
  const one = items.find((i) => i.contact_name === 'Līga Bērza 0');
  assert.equal(one.contact_email, 'liga0@example.com', 'the collected respondent email is used');
  const bad = await fetch(s.base + '/api/inbound/google_form', { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-crm-secret': 'wrong' }, body: r.sent[0].o.payload });
  assert.equal(bad.status, 401);
});
