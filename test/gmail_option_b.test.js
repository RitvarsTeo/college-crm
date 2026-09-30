// Gmail option B, "sign in once as edu@ and approve read-only access" (built 30.09.2026 as C5,
// Ritvars chose B 01.10.2026, reworked the same day so Marina can actually use it):
//
//   POST /api/admin/gmail/link        admin only -> a link that lasts 48 hours
//   GET  /api/auth/gmail/connect      the link; NO Intake account needed -> Google consent,
//                                     gmail.readonly, offline, login_hint edu@novikontas.org,
//                                     back to GOOGLE_REDIRECT_URI (already registered at Google)
//   GET  /api/auth/google/callback    the gmail flow cookie decides; ONLY edu@ is kept, encrypted
//   GET  /api/admin/gmail/status, POST /api/admin/gmail/disconnect
//
// A stored edu@ sign-in wins over option A, because GMAIL_SERVICE_ACCOUNT_JSON is set in Vercel.
//
// Nothing here calls Google: a local stand-in plays the token endpoint and the Gmail API.

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { syncGmail } from '../src/sync.js';
import { saveGmailRefreshToken, loadGmailRefreshToken } from '../lib/gmail.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SESSION_SECRET = 'test-session-secret-not-real-00000000000000';
const CLIENT = { GMAIL_OAUTH_CLIENT_ID: 'test-client-id.apps.googleusercontent.com',
  GMAIL_OAUTH_CLIENT_SECRET: 'test-client-secret-not-real' };
const REFRESH = 'test-refresh-token-not-real-1234';
const REDIRECT = 'http://127.0.0.1/api/auth/google/callback';

function google({ mailbox = 'edu@novikontas.org' } = {}) {
  const seen = [];
  const srv = http.createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    seen.push({ method: req.method, url: req.url, body, auth: req.headers.authorization });
    const send = (code, b) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(b)); };
    if (req.url === '/token') {
      const f = new URLSearchParams(body);
      if (f.get('grant_type') === 'authorization_code' && f.get('code') === 'good-code') {
        return send(200, { access_token: 'acc-1', refresh_token: REFRESH, expires_in: 3599, scope: 'https://www.googleapis.com/auth/gmail.readonly' });
      }
      if (f.get('grant_type') === 'refresh_token' && f.get('refresh_token') === REFRESH) return send(200, { access_token: 'acc-2', expires_in: 3599 });
      return send(400, { error: 'invalid_grant' });
    }
    if (req.url.startsWith('/gmail/users/me/profile')) return send(200, { emailAddress: mailbox });
    if (req.url.includes('/messages?')) return send(200, { messages: [{ id: 'b1' }] });
    if (req.url.includes('/messages/b1')) {
      return send(200, { id: 'b1', threadId: 't-b1', payload: { headers: [
        { name: 'From', value: 'Kaspars <kaspars@example.com>' }, { name: 'Subject', value: 'Studijas' },
        { name: 'Date', value: 'Tue, 30 Sep 2026 09:00:00 +0300' }],
      body: { data: Buffer.from('Gribu macities NAV', 'utf8').toString('base64url') } } });
    }
    return send(404, {});
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => {
    const base = `http://127.0.0.1:${srv.address().port}`;
    resolve({ srv, seen, base, env: { GMAIL_TOKEN_URL: base + '/token', GMAIL_API_ROOT: base + '/gmail' } });
  }));
}

function start(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], { env: { ...process.env,
      PORT: '0', CRM_DB: ':memory:', DATASET: 'empty', CRM_AUTH: '', CRM_PUBLIC: '', DATABASE_URL: '',
      CRM_DB_DATABASE_URL_UNPOOLED: '', CRM_SESSION_SECRET: SESSION_SECRET, GMAIL_SERVICE_ACCOUNT_JSON: '', ...env },
    stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const look = (d) => { out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, base: `http://127.0.0.1:${m[1]}`, out: () => out }); };
    child.stdout.on('data', look); child.stderr.on('data', look);
    child.on('exit', () => reject(new Error(out)));
  });
}
const as = (who) => ({ 'x-acting-as': who });

async function linkFor(s) {
  const r = await fetch(s.base + '/api/admin/gmail/link', { method: 'POST', headers: as('Ritvars') });
  assert.equal(r.status, 200, await r.clone().text());
  return (await r.json()).link.replace(/^https?:\/\/[^/]+/, s.base);
}
// opened as a stranger: no admin header, no session
async function openLink(link) {
  const r = await fetch(link, { redirect: 'manual' });
  assert.equal(r.status, 302, await r.clone().text());
  const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  return { r, cookie, to: new URL(r.headers.get('location')) };
}

test('B: an admin gets a link; opening it needs no Intake account and asks Google for read-only edu@', async (t) => {
  const s = await start({ ...CLIENT, GOOGLE_REDIRECT_URI: REDIRECT });
  t.after(() => s.child.kill());
  assert.equal((await fetch(s.base + '/api/admin/gmail/link', { method: 'POST', headers: as('Ieva') })).status, 403);
  const link = await linkFor(s);
  assert.match(link, /\/api\/auth\/gmail\/connect\?invite=/);
  const { cookie, to, r } = await openLink(link);
  assert.equal(to.origin + to.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(to.searchParams.get('scope'), 'https://www.googleapis.com/auth/gmail.readonly');
  assert.equal(to.searchParams.get('access_type'), 'offline');
  assert.equal(to.searchParams.get('prompt'), 'consent');
  assert.equal(to.searchParams.get('login_hint'), 'edu@novikontas.org');
  assert.equal(to.searchParams.get('client_id'), CLIENT.GMAIL_OAUTH_CLIENT_ID);
  assert.equal(to.searchParams.get('redirect_uri'), REDIRECT, 'back to the address Google already knows');
  assert.ok(to.searchParams.get('state'));
  assert.match(cookie, /^crm_oauth=/);
  assert.ok(!r.headers.get('location').includes(CLIENT.GMAIL_OAUTH_CLIENT_SECRET), 'the client secret never goes in a URL');
});

test('B: a forged or expired link opens nothing', async (t) => {
  const s = await start({ ...CLIENT, GOOGLE_REDIRECT_URI: REDIRECT });
  t.after(() => s.child.kill());
  const old = Buffer.from(JSON.stringify({ purpose: 'gmail-invite', exp: Date.now() - 1000 })).toString('base64url');
  const oldSigned = old + '.' + crypto.createHmac('sha256', SESSION_SECRET).update(old).digest('base64url');
  for (const bad of ['forged', old + '.bad', oldSigned]) {
    const r = await fetch(`${s.base}/api/auth/gmail/connect?invite=${bad}`, { redirect: 'manual' });
    assert.equal(r.status, 403);
    assert.match(await r.text(), /expired or is not valid/);
  }
});

test('B: the callback keeps the token only for edu@, encrypted, with no Intake session, and the page says so', async (t) => {
  const g = await google();
  t.after(() => g.srv.close());
  const s = await start({ ...CLIENT, ...g.env, GOOGLE_REDIRECT_URI: REDIRECT, CHANNEL_MODE_GMAIL: 'test' });
  t.after(() => s.child.kill());
  const { cookie, to } = await openLink(await linkFor(s));
  const state = to.searchParams.get('state');
  const forged = await fetch(`${s.base}/api/auth/google/callback?code=good-code&state=forged`, { headers: { cookie }, redirect: 'manual' });
  assert.notEqual(forged.status, 200, 'a forged state is not a connection');
  const cb = await fetch(`${s.base}/api/auth/google/callback?code=good-code&state=${encodeURIComponent(state)}`,
    { headers: { cookie }, redirect: 'manual' });
  const page = await cb.text();
  assert.equal(cb.status, 200, page);
  assert.match(page, /edu@novikontas\.org is connected to Intake, read-only/);
  assert.ok(!page.includes(REFRESH));
  const st = await fetch(s.base + '/api/admin/gmail/status', { headers: as('Ritvars') }).then((r) => r.json());
  assert.equal(st.connected, true);
  assert.equal(st.how, 'B');
  assert.ok(!JSON.stringify(st).includes(REFRESH));
  assert.ok(!s.out().includes(REFRESH), 'never logged');
  const tokenCall = g.seen.find((x) => x.url === '/token');
  assert.equal(new URLSearchParams(tokenCall.body).get('redirect_uri'), REDIRECT);
  const dis = await fetch(s.base + '/api/admin/gmail/disconnect', { method: 'POST', headers: as('Ritvars') });
  assert.equal(dis.status, 200);
  assert.equal((await fetch(s.base + '/api/admin/gmail/status', { headers: as('Ritvars') }).then((r) => r.json())).connected, false);
  assert.equal((await fetch(s.base + '/api/admin/gmail/status', { headers: as('Ieva') })).status, 403);
});

test('B: a sign-in as any other mailbox is refused and nothing is kept', async (t) => {
  const g = await google({ mailbox: 'marina@novikontas.org' });
  t.after(() => g.srv.close());
  const s = await start({ ...CLIENT, ...g.env, GOOGLE_REDIRECT_URI: REDIRECT });
  t.after(() => s.child.kill());
  const { cookie, to } = await openLink(await linkFor(s));
  const cb = await fetch(`${s.base}/api/auth/google/callback?code=good-code&state=${encodeURIComponent(to.searchParams.get('state'))}`,
    { headers: { cookie }, redirect: 'manual' });
  assert.equal(cb.status, 400);
  assert.match(await cb.text(), /Only edu@novikontas\.org can be connected/);
  assert.equal((await fetch(s.base + '/api/admin/gmail/status', { headers: as('Ritvars') }).then((r) => r.json())).connected, false);
});

test('B: the stored token is encrypted, and the poll uses it into New Leads', async (t) => {
  const g = await google();
  t.after(() => g.srv.close());
  const db = await openDb(':memory:');
  const env = { ...CLIENT, ...g.env, CRM_SESSION_SECRET: SESSION_SECRET, CHANNEL_MODE_GMAIL: 'test' };
  await saveGmailRefreshToken(db, REFRESH, env);
  const raw = await db.prepare("SELECT value FROM sync_state WHERE name = 'gmail_oauth'").get();
  assert.ok(raw && raw.value && !raw.value.includes(REFRESH), 'not stored in plain text');
  assert.equal(await loadGmailRefreshToken(db, env), REFRESH);
  assert.equal(await loadGmailRefreshToken(db, { ...env, CRM_SESSION_SECRET: 'another-secret-0000000000000000' }), null,
    'unreadable without the right key');
  const r = await syncGmail(db, { env, fetchImpl: fetch, now: new Date('2026-09-30T06:30:00Z') });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.inbox, 1);
  const refresh = g.seen.find((x) => x.url === '/token');
  assert.equal(new URLSearchParams(refresh.body).get('grant_type'), 'refresh_token');
  assert.ok(g.seen.filter((x) => x.url.includes('/messages')).every((x) => x.auth === 'Bearer acc-2'));
});

test('B wins over A: with the service-account key set (as in Vercel), the stored edu@ sign-in is what reads', async (t) => {
  const g = await google();
  t.after(() => g.srv.close());
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const key = JSON.stringify({ client_email: 'intake-mail-reader@example.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) });
  const db = await openDb(':memory:');
  const env = { ...CLIENT, ...g.env, CRM_SESSION_SECRET: SESSION_SECRET, CHANNEL_MODE_GMAIL: 'test',
    GMAIL_SERVICE_ACCOUNT_JSON: key };
  await saveGmailRefreshToken(db, REFRESH, env);
  const r = await syncGmail(db, { env, fetchImpl: fetch, now: new Date('2026-09-30T06:30:00Z') });
  assert.equal(r.ok, true, JSON.stringify(r));
  const grants = g.seen.filter((x) => x.url === '/token').map((x) => new URLSearchParams(x.body).get('grant_type'));
  assert.deepEqual(grants, ['refresh_token'], 'the service account is not even tried');
});
