// THE ACADEMY WHATSAPP INTO INTAKE, BY COEXISTENCE (Ritvars, 07.10.2026: "Pag. merkis ir intake savienot ar academy
// whatsapp. tas ir tavs endpoint. now solutions." -> "Yes, coexistence", route "Own Meta app"). The number stays on the
// staff phone in the WhatsApp Business app and is also connected to our Meta app, so:
//   1. a message the person sends reaches the Inbox (the adapter as before);
//   2. a reply staff send FROM THE PHONE arrives as an smb_message_echoes notification: it becomes the reply's TIME on
//      the Inbox row (first reply) and on the person, never its text, and never an Inbox row;
//   3. history and contact sync notifications are not imported (history import OFF, MASTER CONTROL 07.10.2026);
//   4. "Connect WhatsApp" (Meta's Embedded Signup, coexistence) exchanges the code on the server, keeps the token
//      encrypted, subscribes the app to the account and starts the two syncs Meta requires within 24 hours.
// Everything runs against a fake Meta on localhost.

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP_SECRET = 'test-meta-app-secret-not-real';
const BUSINESS_TOKEN = 'test-business-token-not-real';
const ADMIN = { 'x-acting-as': 'Ritvars', 'content-type': 'application/json' };
const USER = { 'x-acting-as': 'Ieva', 'content-type': 'application/json' };

function fakeMeta() {
  const seen = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => { raw += d; });
    req.on('end', () => {
      const u = new URL(req.url, 'http://x');
      seen.push({ method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams), body: raw ? JSON.parse(raw) : null,
        auth: req.headers.authorization || null });
      const send = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
      if (u.pathname.endsWith('/oauth/access_token')) {
        if (u.searchParams.get('client_secret') !== APP_SECRET || u.searchParams.get('code') !== 'the-code') return send(400, { error: { message: 'bad code' } });
        return send(200, { access_token: BUSINESS_TOKEN, token_type: 'bearer' });
      }
      if (req.headers.authorization !== 'Bearer ' + BUSINESS_TOKEN) return send(401, { error: { message: 'no token' } });
      if (/\/waba-1\/phone_numbers$/.test(u.pathname)) return send(200, { data: [{ id: 'pn-1', display_phone_number: '+371 23 111 114' }] });
      if (/\/waba-1\/subscribed_apps$/.test(u.pathname) && req.method === 'POST') return send(200, { success: true });
      if (/\/pn-1\/smb_app_data$/.test(u.pathname) && req.method === 'POST') return send(200, { success: true });
      return send(404, { error: { message: 'unknown ' + u.pathname } });
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, seen, base: `http://127.0.0.1:${server.address().port}/v25.0` })));
}

function start(env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], { env: { ...process.env,
      PORT: '0', CRM_DB: ':memory:', DATASET: 'empty', CRM_AUTH: '', CRM_PUBLIC: '', DATABASE_URL: '', CRM_DB_DATABASE_URL_UNPOOLED: '',
      META_APP_SECRET: APP_SECRET, META_VERIFY_TOKEN: 'verify-me', CHANNEL_MODE_WHATSAPP: 'test', CRM_SESSION_SECRET: 'test-session-secret-not-real',
      ...env },
    stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const look = (d) => { out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, base: `http://127.0.0.1:${m[1]}` }); };
    child.stdout.on('data', look); child.stderr.on('data', look);
    child.on('exit', () => reject(new Error(out)));
  });
}
const signed = (s, payload) => {
  const raw = JSON.stringify(payload);
  const sig = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(raw).digest('hex');
  return fetch(s.base + '/api/inbound/whatsapp', { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig }, body: raw });
};
const wa = (field, value) => ({ object: 'whatsapp_business_account', entry: [{ id: 'waba-1', changes: [{ field,
  value: { messaging_product: 'whatsapp', metadata: { display_phone_number: '37123111114', phone_number_id: 'pn-1' }, ...value } }] }] });
const message = (id, from, ts, text) => wa('messages', { contacts: [{ wa_id: from, profile: { name: 'Anna B' } }],
  messages: [{ from, id, timestamp: String(ts), type: 'text', text: { body: text } }] });
const echo = (id, to, ts, text) => wa('smb_message_echoes', { message_echoes: [{ from: '37123111114', to, id, timestamp: String(ts), type: 'text', text: { body: text } }] });
const inbox = (s) => fetch(s.base + '/api/intake?state=new', { headers: USER }).then((r) => r.json()).then((j) => j.rows);

// ---------------------------------------------------------------- 1 + 2: echoes --
test('a reply from the phone sets the first-reply TIME on the Inbox row; no text, no new row', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  const asked = 1791367200;                       // the question
  assert.equal((await signed(s, message('wamid.q1', '37129111222', asked, 'Kad sākas uzņemšana?'))).status, 200);
  const [row] = await inbox(s);
  assert.equal(row.channel, 'whatsapp');
  assert.equal(row.first_reply_at, null);
  const r = await signed(s, echo('wamid.e1', '37129111222', asked + 600, 'Sveiki! Uzņemšana ir visu gadu.'));
  assert.equal(r.status, 200, await r.clone().text());
  const rows = await inbox(s);
  assert.equal(rows.length, 1, 'the reply is never a new Inbox row');
  assert.equal(rows[0].first_reply_at, new Date((asked + 600) * 1000).toISOString(), 'its time is the first reply');
  assert.doesNotMatch(JSON.stringify(rows), /Uzņemšana ir visu gadu/, 'and its text is never kept');
  // a later reply never moves the first one
  await signed(s, echo('wamid.e2', '37129111222', asked + 3600, 'Vēl kas?'));
  assert.equal((await inbox(s))[0].first_reply_at, new Date((asked + 600) * 1000).toISOString());
});

test('a reply to somebody already a person goes on their History as a sent WhatsApp, time only, once', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  await signed(s, message('wamid.q2', '37129333444', 1791367200, 'I want to study navigation'));
  const [row] = await inbox(s);
  const q = await fetch(`${s.base}/api/intake/${row.id}/qualify`, { method: 'POST', headers: USER,
    body: JSON.stringify({ qualification: 'lead', createPerson: true, nextAction: 'Call and establish interest', stated: { interest: 'NAV' } }) }).then((x) => x.json());
  assert.ok(q.personId, JSON.stringify(q));
  const e = echo('wamid.e3', '37129333444', 1791367900, 'Sveiki, zvanīšu rīt');
  await signed(s, e);
  await signed(s, e);                              // Meta may deliver twice
  const person = await fetch(`${s.base}/api/people/${q.personId}`, { headers: USER }).then((x) => x.json());
  const all = JSON.stringify(person);
  assert.equal((all.match(/WhatsApp reply sent/g) || []).length, 1, 'on the History, once');
  assert.doesNotMatch(all, /zvanīšu rīt/, 'no text');
});

test('a reply to a number Intake does not know is counted, nothing else', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  const r = await signed(s, echo('wamid.e4', '37120000000', 1791367900, 'hi'));
  assert.equal(r.status, 200, 'Meta gets its 200, or it retries');
  assert.equal((await inbox(s)).length, 0);
  const ch = await fetch(s.base + '/api/admin/channels', { headers: ADMIN }).then((x) => x.json());
  assert.equal(((ch.runs.whatsapp_echoes || {}).detail || {}).unmatched, 1);
});

// ------------------------------------------------------- 3: history stays out --
test('history and contact sync notifications are not imported', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  const hist = wa('history', { history: [{ metadata: { phase: 0, chunk_order: 1, progress: 100 }, threads: [{ id: '37129111222',
    messages: [{ from: '37129111222', id: 'wamid.old', timestamp: '1780000000', type: 'text', text: { body: 'an old chat' } }] }] }] });
  assert.equal((await signed(s, hist)).status, 200);
  assert.equal((await signed(s, wa('smb_app_state_sync', { state_sync: [{ type: 'contact', contact: { full_name: 'X', phone_number: '37129111222' }, action: 'add' }] }))).status, 200);
  assert.equal((await inbox(s)).length, 0, 'history import is OFF');
});

// ----------------------------------------------------------- 4: Connect WhatsApp --
test('Connect WhatsApp: says what is missing; with it set, the browser gets the app and configuration ids only', async (t) => {
  const s = await start({ META_APP_ID: '', WHATSAPP_ES_CONFIG_ID: '' });
  t.after(() => s.child.kill());
  const url = s.base + '/api/admin/channels/whatsapp/connect';
  assert.equal((await fetch(url, { headers: USER })).status, 403, 'admins only');
  const miss = await fetch(url, { headers: ADMIN }).then((x) => x.json());
  assert.deepEqual([...miss.missing].sort(), ['META_APP_ID', 'WHATSAPP_ES_CONFIG_ID']);
  const s2 = await start({ META_APP_ID: '1234567890', WHATSAPP_ES_CONFIG_ID: '987654321' });
  t.after(() => s2.child.kill());
  const ok = await fetch(s2.base + '/api/admin/channels/whatsapp/connect', { headers: ADMIN }).then((x) => x.json());
  assert.deepEqual({ appId: ok.appId, configId: ok.configId, missing: ok.missing }, { appId: '1234567890', configId: '987654321', missing: [] });
  assert.doesNotMatch(JSON.stringify(ok), new RegExp(APP_SECRET), 'never the app secret');
});

test('Connect WhatsApp: the code is exchanged on the server, the token kept encrypted, the app subscribed, both syncs started, no re-registration', async (t) => {
  const meta = await fakeMeta();
  const s = await start({ META_APP_ID: '1234567890', WHATSAPP_ES_CONFIG_ID: '987654321', META_GRAPH_BASE: meta.base });
  t.after(() => { s.child.kill(); meta.server.close(); });
  const url = s.base + '/api/admin/channels/whatsapp/connect';
  assert.equal((await fetch(url, { method: 'POST', headers: USER, body: '{}' })).status, 403);
  const r = await fetch(url, { method: 'POST', headers: ADMIN, body: JSON.stringify({ code: 'the-code', wabaId: 'waba-1' }) }).then((x) => x.json());
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.match(r.line, /Connected/);
  assert.equal(r.phoneNumberId, 'pn-1', 'the number is found on the account when the signup did not send it');
  const calls = meta.seen.map((c) => c.method + ' ' + c.path.replace(/^\/v25\.0/, ''));
  assert.deepEqual(calls, ['GET /oauth/access_token', 'GET /waba-1/phone_numbers', 'POST /waba-1/subscribed_apps',
    'POST /pn-1/smb_app_data', 'POST /pn-1/smb_app_data']);
  assert.deepEqual(meta.seen.filter((c) => c.path.endsWith('smb_app_data')).map((c) => c.body.sync_type), ['smb_app_state_sync', 'history'],
    'both syncs, inside Meta\'s 24 hours (the history notifications are then not imported)');
  assert.ok(!meta.seen.some((c) => c.path.endsWith('/register')), 'a coexistence number is never re-registered');
  assert.doesNotMatch(JSON.stringify(r), new RegExp(BUSINESS_TOKEN + '|' + APP_SECRET), 'no secret comes back');
  const ch = await fetch(s.base + '/api/admin/channels', { headers: ADMIN }).then((x) => x.json());
  assert.match(JSON.stringify(ch.runs.whatsapp_connect || {}), /Connected/);
  assert.doesNotMatch(JSON.stringify(ch), new RegExp(BUSINESS_TOKEN), 'the stored token is never shown');
});

test('Connect WhatsApp: a refused code says so in one line and stores nothing', async (t) => {
  const meta = await fakeMeta();
  const s = await start({ META_APP_ID: '1234567890', WHATSAPP_ES_CONFIG_ID: '987654321', META_GRAPH_BASE: meta.base });
  t.after(() => { s.child.kill(); meta.server.close(); });
  const r = await fetch(s.base + '/api/admin/channels/whatsapp/connect', { method: 'POST', headers: ADMIN,
    body: JSON.stringify({ code: 'wrong', wabaId: 'waba-1' }) });
  assert.equal(r.status, 502);
  const j = await r.json();
  assert.equal(j.ok, false);
  assert.match(j.line, /Meta answered 400/);
  assert.equal(meta.seen.length, 1, 'it stops at the refused exchange');
});

// --------------------------------------------------------------------- page --
test('the WhatsApp Settings and check page carries the line and the button; the sign-up is Meta\'s coexistence flow', () => {
  const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  assert.match(APP, /id="waConnect" onclick="chWhatsAppConnect\(\)">Connect WhatsApp<\/button>/);
  assert.match(APP, /featureType: 'whatsapp_business_app_onboarding'/);
  assert.match(APP, /https:\/\/connect\.facebook\.net\/en_US\/sdk\.js/);
  assert.match(APP, /FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING/);
});

test('Help says how the academy WhatsApp reaches Intake, in the same change', () => {
  const help = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'help.json'), 'utf8'));
  const q = help.faq.find((x) => x.id === 'whatsapp-academy');
  assert.ok(q);
  assert.match(q.a, /Connect WhatsApp/);
  assert.match(q.a, /phone/);
  assert.match(q.a, /reply/i);
});
