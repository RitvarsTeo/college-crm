// LinkedIn Lead Sync, approved 07.10.2026 (app 264939930, Standard Tier). Checked against Microsoft Learn the same day:
//   B1  a lead webhook is subscribed by an API call, POST /rest/leadNotifications, per OWNER (the ad account, leadType
//       SPONSORED; a company page, COMPANY) - "webhook subscriptions must be created via the Lead Notification
//       Subscriptions API and cannot be created via the UI". An admin presses Subscribe leads; we make the call.
//   B2  a multiple-choice answer arrives as option ids; the text is on the form's question.
//   B3  leadAction DELETED (somebody withdrew) is never a new Inbox row.
// Everything runs against a fake LinkedIn: the real routes, the real adapter, the real fetch, a stand-in on localhost.

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fetchLinkedInLead } from '../lib/leads.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SECRET = 'test-linkedin-client-secret-not-real';
const TOKEN = 'test-linkedin-token-not-real';
const WEBHOOK = 'https://crm-novikontas.vercel.app/api/inbound/linkedin';

const FORM = { id: 3162, creationLocale: { country: 'US', language: 'en' }, content: { questions: [
  { questionId: 1, predefinedField: 'FIRST_NAME', name: 'first' },
  { questionId: 2, predefinedField: 'LAST_NAME', name: 'last' },
  { questionId: 3, predefinedField: 'EMAIL', name: 'email' },
  { questionId: 4, name: 'programme', questionDetails: { multipleChoiceQuestionDetails: { options: [
    { id: 1, text: { localized: { en_US: 'Navigation' } } },
    { id: 2, text: { localized: { en_US: 'Marine Engineering' } } }] } } },
  { questionId: 5, name: 'interests', questionDetails: { multipleChoiceQuestionDetails: { options: [
    { id: 1, text: { localized: { en_US: 'Full time' } } },
    { id: 3, text: { localized: { en_US: 'Part time' } } }] } } },
] } };
const RESPONSE = (id) => ({ id, versionedLeadGenFormUrn: 'urn:li:versionedLeadGenForm:(urn:li:leadGenForm:3162,1)',
  formResponse: { answers: [
    { questionId: 1, answerDetails: { textQuestionAnswer: { answer: 'Ilze' } } },
    { questionId: 2, answerDetails: { textQuestionAnswer: { answer: 'Liepa' } } },
    { questionId: 3, answerDetails: { textQuestionAnswer: { answer: 'ilze.liepa@gmail.com' } } },
    { questionId: 4, answerDetails: { multipleChoiceAnswer: { options: [1] } } },
    { questionId: 5, answerDetails: { multipleChoiceAnswer: { options: [1, 3] } } },
  ] } });

// ------------------------------------------------------------- a fake LinkedIn --
function fakeLinkedIn() {
  const seen = { posts: [], gets: [], subscriptions: [] };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => { raw += d; });
    req.on('end', () => {
      const send = (status, body, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json', ...headers }); res.end(body ? JSON.stringify(body) : ''); };
      if (req.headers.authorization !== 'Bearer ' + TOKEN) return send(401, { message: 'no token' });
      if (req.headers['linkedin-version'] !== '202609') return send(426, { message: 'version' });
      const u = new URL(req.url, 'http://x');
      seen.gets.push(req.method + ' ' + u.pathname);
      if (req.method === 'GET' && u.pathname === '/rest/leadNotifications') {
        const kind = /value:\((\w+):/.exec(decodeURIComponent(u.search))?.[1];   // LinkedIn lists one owner's subscriptions
        return send(200, { elements: seen.subscriptions.filter((x) => Object.keys(x.owner)[0] === kind) });
      }
      if (req.method === 'POST' && u.pathname === '/rest/leadNotifications') {
        const b = JSON.parse(raw);
        seen.posts.push(b);
        const sub = { id: 107700 + seen.posts.length, ...b };
        seen.subscriptions.push(sub);
        return send(201, null, { 'x-restli-id': String(sub.id) });
      }
      const resp = /^\/rest\/leadFormResponses\/(.+)$/.exec(u.pathname);
      if (req.method === 'GET' && resp) return send(200, RESPONSE(decodeURIComponent(resp[1])));
      if (req.method === 'GET' && u.pathname === '/rest/leadForms/3162') return send(200, FORM);
      return send(404, { message: 'unknown ' + u.pathname });
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, seen, base: `http://127.0.0.1:${server.address().port}/rest` })));
}

function start(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], { env: { ...process.env,
      PORT: '0', CRM_DB: ':memory:', DATASET: 'empty', CRM_AUTH: '', CRM_PUBLIC: '', DATABASE_URL: '', CRM_DB_DATABASE_URL_UNPOOLED: '',
      LINKEDIN_CLIENT_SECRET: SECRET, LINKEDIN_ACCESS_TOKEN: TOKEN, CHANNEL_MODE_LINKEDIN: 'test', ...env },
    stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const look = (d) => { out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, base: `http://127.0.0.1:${m[1]}` }); };
    child.stdout.on('data', look); child.stderr.on('data', look);
    child.on('exit', () => reject(new Error(out)));
  });
}
const ADMIN = { 'x-acting-as': 'Ritvars', 'content-type': 'application/json' };
const USER = { 'x-acting-as': 'Ieva', 'content-type': 'application/json' };
const notify = (s, payload) => {
  const raw = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', SECRET).update('hmacsha256=' + raw).digest('hex');
  return fetch(s.base + '/api/inbound/linkedin', { method: 'POST', headers: { 'content-type': 'application/json', 'x-li-signature': sig }, body: raw });
};
const lead = (id, action = 'CREATED', at = 1791363600000) => ({ type: 'LEAD_ACTION', leadGenFormResponse: 'urn:li:leadGenFormResponse:' + id,
  leadGenForm: 'urn:li:versionedLeadGenForm:(urn:li:leadGenForm:3162,1)', owner: { sponsoredAccount: 'urn:li:sponsoredAccount:520866471' },
  leadType: 'SPONSORED', leadAction: action, occurredAt: at });

// -------------------------------------------------------------------------- B1 --
test('B1: Subscribe leads makes the owner-level call once, admins only, and the answer is kept for the Channels screen', async (t) => {
  const li = await fakeLinkedIn();
  const s = await start({ LINKEDIN_API_BASE: li.base, LINKEDIN_AD_ACCOUNT_ID: '520866471' });
  t.after(() => { s.child.kill(); li.server.close(); });
  const url = s.base + '/api/admin/channels/linkedin/subscribe';
  assert.equal((await fetch(url, { method: 'POST', headers: USER, body: '{}' })).status, 403, 'admins only');
  const r = await fetch(url, { method: 'POST', headers: ADMIN, body: '{}' }).then((x) => x.json());
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(li.seen.posts, [{ webhook: WEBHOOK, owner: { sponsoredAccount: 'urn:li:sponsoredAccount:520866471' }, leadType: 'SPONSORED' }]);
  assert.match(r.line, /Subscribed/);
  const again = await fetch(url, { method: 'POST', headers: ADMIN, body: '{}' }).then((x) => x.json());
  assert.equal(again.ok, true);
  assert.match(again.line, /Already subscribed/);
  assert.equal(li.seen.posts.length, 1, 'a second press does not make a second subscription');
  const ch = await fetch(s.base + '/api/admin/channels', { headers: ADMIN }).then((x) => x.json());
  assert.match(JSON.stringify(ch.runs.linkedin_subscription || {}), /subscribed/i, 'the answer is kept for the screen');
  assert.doesNotMatch(JSON.stringify(ch), new RegExp(TOKEN), 'the token never comes back');
});

test('B1: the ad account only, never the company page; no ad account says what is missing', async (t) => {
  const li = await fakeLinkedIn();
  const s = await start({ LINKEDIN_API_BASE: li.base, LINKEDIN_AD_ACCOUNT_ID: '', LINKEDIN_ORGANIZATION_ID: '5622087' });
  t.after(() => { s.child.kill(); li.server.close(); });
  const r = await fetch(s.base + '/api/admin/channels/linkedin/subscribe', { method: 'POST', headers: ADMIN, body: '{}' });
  assert.equal(r.status, 409);
  assert.match((await r.json()).error, /LINKEDIN_AD_ACCOUNT_ID/);
  assert.equal(li.seen.posts.length, 0, 'an organization id alone subscribes nothing');
  const li2 = await fakeLinkedIn();
  const s2 = await start({ LINKEDIN_API_BASE: li2.base, LINKEDIN_AD_ACCOUNT_ID: '520866471', LINKEDIN_ORGANIZATION_ID: '5622087' });
  t.after(() => { s2.child.kill(); li2.server.close(); });
  await fetch(s2.base + '/api/admin/channels/linkedin/subscribe', { method: 'POST', headers: ADMIN, body: '{}' });
  assert.deepEqual(li2.seen.posts.map((p) => [Object.keys(p.owner)[0], p.leadType]), [['sponsoredAccount', 'SPONSORED']]);
});

// -------------------------------------------------------------------------- B2 --
test('B2: a lead lands in the Inbox as LinkedIn with its answers filled, dropdowns as their text', async (t) => {
  const li = await fakeLinkedIn();
  const s = await start({ LINKEDIN_API_BASE: li.base });
  t.after(() => { s.child.kill(); li.server.close(); });
  const r = await notify(s, lead('abc-1'));
  assert.equal(r.status, 200, await r.clone().text());
  const rows = await fetch(s.base + '/api/intake?state=new', { headers: USER }).then((x) => x.json()).then((j) => j.rows);
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.channel, 'linkedin');
  assert.equal(row.contact_name, 'Ilze Liepa');
  assert.equal(row.contact_email, 'ilze.liepa@gmail.com');
  assert.match(row.body, /programme: Navigation/, 'the dropdown answer is its text, not an id');
  assert.match(row.body, /interests: Full time, Part time/, 'several choices, all named');
  assert.equal((row.fields.find((f) => f.field === 'interest') || {}).value, 'Navigation');
});

test('B2: the mapping itself, read from the form', async () => {
  const fetchImpl = async (url) => ({ ok: true, status: 200, json: async () => (url.includes('/leadForms/') ? FORM : RESPONSE('x-1')) });
  const got = await fetchLinkedInLead('urn:li:leadGenFormResponse:x-1', { env: { LINKEDIN_ACCESS_TOKEN: 't' }, fetchImpl });
  assert.equal(got.programme, 'Navigation');
  assert.deepEqual(got.answers.find((a) => a.name === 'interests').value, 'Full time, Part time');
  const missing = await fetchLinkedInLead('urn:li:leadGenFormResponse:x-1', { env: { LINKEDIN_ACCESS_TOKEN: 't' },
    fetchImpl: async (url) => ({ ok: true, status: 200, json: async () => (url.includes('/leadForms/') ? { content: { questions: [] } } : RESPONSE('x-1')) }) });
  assert.equal(missing.answers.find((a) => a.name === '4').value, 'option 1', 'an option the form no longer has is named by its id, never guessed');
});

// -------------------------------------------------------------------------- B3 --
test('B3: a withdrawn lead is never a new Inbox row; known, it goes on the person; unknown, it is counted', async (t) => {
  const li = await fakeLinkedIn();
  const s = await start({ LINKEDIN_API_BASE: li.base });
  t.after(() => { s.child.kill(); li.server.close(); });
  // unknown: nobody has this lead
  const u = await notify(s, lead('zzz-9', 'DELETED', 1791363700000));
  assert.equal(u.status, 200, 'LinkedIn gets a 2xx, or it retries');
  assert.equal((await fetch(s.base + '/api/intake?state=new', { headers: USER }).then((x) => x.json())).rows.length, 0);
  // known: the lead came, somebody made a lead of it, then it was withdrawn
  await notify(s, lead('abc-2'));
  const [row] = (await fetch(s.base + '/api/intake?state=new', { headers: USER }).then((x) => x.json())).rows;
  const q = await fetch(`${s.base}/api/intake/${row.id}/qualify`, { method: 'POST', headers: USER,
    body: JSON.stringify({ qualification: 'lead', createPerson: true, nextAction: 'Call and establish interest', stated: { interest: 'Navigation' } }) }).then((x) => x.json());
  assert.ok(q.personId, JSON.stringify(q));
  const d = await notify(s, lead('abc-2', 'DELETED', 1791363800000));
  assert.equal(d.status, 200);
  assert.equal((await fetch(s.base + '/api/intake?state=new', { headers: USER }).then((x) => x.json())).rows.length, 0, 'still no new row');
  const person = await fetch(`${s.base}/api/people/${q.personId}`, { headers: USER }).then((x) => x.json());
  assert.match(JSON.stringify(person), /withdrew/i, 'a note on the person');
  const ch = await fetch(s.base + '/api/admin/channels', { headers: ADMIN }).then((x) => x.json());
  assert.equal(String((ch.runs.linkedin_withdrawn || {}).detail && ch.runs.linkedin_withdrawn.detail.skipped), '1', 'the unknown one is counted');
});

// ------------------------------------------------------------------------ help --
test('Help says where LinkedIn leads come from, in the same change', () => {
  const help = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'help.json'), 'utf8'));
  const q = help.faq.find((x) => x.id === 'linkedin-leads');
  assert.ok(q, 'the answer exists');
  assert.match(q.a, /Subscribe leads/);
  assert.match(q.a, /withdrawn/i);
});
