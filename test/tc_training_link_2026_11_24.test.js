// THE ONE-TIME LINK FOR training@ (patch 169; his words "Can you just make a link for her to open and click one click and done?",
// "Yes, build it"). Against a running copy and a fake Google: no token, a bad one, an expired one, the wrong account and a reused
// link are all refused; the right account connects once. Nothing here is a real token.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { openDb } from '../src/db.js';
import { makeInvite, checkInvite, useInvite, _inviteTest, TC_MAILBOX } from '../src/tcmail.js';
import { ROOT } from './security_helpers.js';

const idToken = (email) => 'x.' + Buffer.from(JSON.stringify({ email })).toString('base64url') + '.y';
function google() {
  const srv = http.createServer(async (req, res) => {
    let body = ''; for await (const c of req) body += c;
    const f = new URLSearchParams(body);
    const send = (code, b) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(b)); };
    const scope = 'https://www.googleapis.com/auth/gmail.readonly openid email';
    if (req.url === '/token' && f.get('code') === 'code-training') return send(200, { access_token: 'a', refresh_token: 'test-refresh-not-real', scope, id_token: idToken(TC_MAILBOX) });
    if (req.url === '/token' && f.get('code') === 'code-other') return send(200, { access_token: 'a', refresh_token: 'test-refresh-not-real', scope, id_token: idToken('someone.else@novikontas.org') });
    return send(400, { error: 'invalid_grant' });
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, base: `http://127.0.0.1:${srv.address().port}` })));
}
function start(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], { env: { ...process.env, PORT: '0', DATASET: 'empty', CRM_AUTH: '', CRM_PUBLIC: '',
      DATABASE_URL: '', CRM_DB_DATABASE_URL_UNPOOLED: '', CRM_SESSION_SECRET: 'test-session-secret-not-real-00000000000000', GMAIL_SERVICE_ACCOUNT_JSON: '', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const look = (d) => { out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, base: `http://127.0.0.1:${m[1]}` }); };
    child.stdout.on('data', look); child.stderr.on('data', look); child.on('exit', () => reject(new Error(out)));
  });
}

test('the token: only its hash is kept; 48 hours; spent once; a malformed one never reaches the database', async () => {
  const db = await openDb();
  const now = new Date('2026-11-24T10:00:00Z');
  const { token, expires } = await makeInvite(db, 'Ritvars', now);
  assert.equal(expires, '2026-11-26T10:00:00.000Z');
  const row = await db.prepare('SELECT * FROM tc_mail_invites').get();
  assert.equal(row.token_hash, _inviteTest.hashOf(token));
  assert.ok(!JSON.stringify(row).includes(token), 'the token itself is never stored');
  assert.ok(await checkInvite(db, token, now));
  assert.equal(await checkInvite(db, token, new Date('2026-11-26T10:00:01Z')), null, 'expired');
  assert.equal(await checkInvite(db, 'x', now), null);
  assert.equal(await checkInvite(db, '', now), null);
  const h = _inviteTest.hashOf(token);
  assert.equal(await useInvite(db, h, TC_MAILBOX, now), true);
  assert.equal(await useInvite(db, h, TC_MAILBOX, now), false, 'spent once');
  assert.equal(await checkInvite(db, token, now), null, 'a used link is dead');
});

test('end to end: no token, bad, expired, wrong account and reused are refused; training@ connects once', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tclink-'));
  const file = path.join(dir, 'intake.db');
  const db = await openDb(file);
  const good = await makeInvite(db, 'Ritvars');
  const old = await makeInvite(db, 'Ritvars', new Date(Date.now() - 49 * 3600 * 1000));
  await db.close?.();
  const g = await google();
  const s = await start({ CRM_DB: file, GMAIL_OAUTH_CLIENT_ID: 'test-client-id.apps.googleusercontent.com', GMAIL_OAUTH_CLIENT_SECRET: 'test-secret-not-real',
    GOOGLE_REDIRECT_URI: 'http://127.0.0.1/api/auth/google/callback', GMAIL_TOKEN_URL: g.base + '/token' });
  t.after(() => { s.child.kill(); g.srv.close(); });
  const open = (q) => fetch(`${s.base}/api/auth/tcmail/connect${q}`, { redirect: 'manual' });
  for (const q of ['', '?t=', '?t=not-a-real-token', `?t=${old.token}`]) {
    const r = await open(q);
    assert.equal(r.status, 403, q);
    assert.match(await r.text(), /expired or is not valid/);
  }
  const begin = async () => {
    const r = await open(`?t=${good.token}`);
    assert.equal(r.status, 302);
    const to = new URL(r.headers.get('location'));
    assert.equal(to.hostname, 'accounts.google.com');
    assert.equal(to.searchParams.get('login_hint'), TC_MAILBOX);
    assert.ok(to.searchParams.get('scope').includes('gmail.readonly') && !/gmail\.(send|modify|compose)/.test(to.searchParams.get('scope')));
    return { state: to.searchParams.get('state'), cookie: r.headers.get('set-cookie').split(';')[0] };
  };
  const finish = ({ state, cookie }, code) => fetch(`${s.base}/api/auth/google/callback?state=${state}&code=${code}`, { headers: { cookie }, redirect: 'manual' });
  // the wrong account connects nothing and does not spend the link
  const w = await finish(await begin(), 'code-other');
  assert.equal(w.status, 400);
  assert.match(await w.text(), /choose training@novikontas\.org/);
  // training@ connects, once
  const ok = await finish(await begin(), 'code-training');
  assert.equal(ok.status, 200);
  assert.match(await ok.text(), /connected to Intake, read only/);
  const again = await open(`?t=${good.token}`);
  assert.equal(again.status, 403, 'reused');
  const check = await openDb(file);
  const link = await check.prepare('SELECT user_email, token FROM staff_mail_links').all();
  assert.deepEqual(link.map((l) => l.user_email), [TC_MAILBOX]);
  assert.ok(!link[0].token.includes('test-refresh-not-real'), 'kept encrypted');
  assert.equal((await check.prepare('SELECT used_account FROM tc_mail_invites WHERE used_at IS NOT NULL').get()).used_account, TC_MAILBOX);
  await check.close?.();
});

test('the page: an admin makes the link, shown once with Copy; the route is admin only', () => {
  const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  for (const x of ['Make a link for training@', 'async function tcMailLink(', "post('/api/tc/mail/link', {})", 'Works once, until']) assert.ok(APP.includes(x), x);
  const srv = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
  const i = srv.indexOf("p === '/api/tc/mail/link'");
  assert.ok(i > 0 && srv.slice(i, i + 300).includes("me.role !== 'admin') return refuseNotAdmin(res)"));
});
