// L8 (security review 07.10.2026): the plain "Gmail" system pages printed Google's text and the
// signed-in account name as HTML, so an account name or error carrying markup ran on our origin; and
// the Gmail invite link was built from the request's Host header, which the caller chooses - a link
// pointing at somebody else's site could be minted and handed to whoever holds edu@'s password.
// Now both are escaped, and the link is built from PUBLIC_BASE_URL (or, on a host without it, the
// configured GOOGLE_REDIRECT_URI); the request's own host is used only on a laptop.

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { start } from './security_helpers.js';

const CLIENT = { GMAIL_OAUTH_CLIENT_ID: 'test-client-id.apps.googleusercontent.com', GMAIL_OAUTH_CLIENT_SECRET: 'test-client-secret-not-real' };
const REDIRECT = 'http://127.0.0.1/api/auth/google/callback';
const EVIL = '<img src=x onerror=alert(1)>@x.lv';

function google(mailbox) {
  const srv = http.createServer(async (req, res) => {
    let body = ''; for await (const c of req) body += c;
    const send = (code, b) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(b)); };
    if (req.url === '/token') return send(200, { access_token: 'acc-1', refresh_token: 'r-not-real', expires_in: 3599 });
    if (req.url.startsWith('/gmail/users/me/profile')) return send(200, { emailAddress: mailbox });
    return send(404, {});
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => {
    const base = `http://127.0.0.1:${srv.address().port}`;
    resolve({ srv, env: { GMAIL_TOKEN_URL: base + '/token', GMAIL_API_ROOT: base + '/gmail' } });
  }));
}
// a request whose Host header the caller chose
const withHost = (base, p, host, headers = {}) => new Promise((resolve, reject) => {
  const u = new URL(base + p);
  http.get({ host: u.hostname, port: u.port, path: u.pathname + u.search, headers: { host, ...headers } }, (res) => {
    let t = ''; res.on('data', (d) => { t += d; }); res.on('end', () => resolve({ status: res.statusCode, text: t }));
  }).on('error', reject);
});

test('L8: an account name with markup is shown as text on the Gmail page', async (t) => {
  const g = await google(EVIL);
  t.after(() => g.srv.close());
  const s = await start({ CRM_AUTH: '', DATASET: 'empty', ...CLIENT, ...g.env, GOOGLE_REDIRECT_URI: REDIRECT });
  t.after(() => s.child.kill());
  const link = (await (await fetch(s.base + '/api/admin/gmail/link?format=json', { headers: { 'x-acting-as': 'Ritvars' } })).json()).link
    .replace(/^https?:\/\/[^/]+/, s.base);
  const open = await fetch(link, { redirect: 'manual' });
  const cookie = (open.headers.get('set-cookie') || '').split(';')[0];
  const state = new URL(open.headers.get('location')).searchParams.get('state');
  const cb = await fetch(`${s.base}/api/auth/google/callback?code=c&state=${encodeURIComponent(state)}`, { headers: { cookie }, redirect: 'manual' });
  const html = await cb.text();
  assert.match(html, /You signed in as/);
  assert.doesNotMatch(html, /<img/i, 'the account name was printed as HTML');
  assert.match(html, /&lt;img/);
});

test('L8: the invite link uses PUBLIC_BASE_URL, never the Host the caller sent', async (t) => {
  const s = await start({ CRM_AUTH: '', DATASET: 'empty', ...CLIENT, GOOGLE_REDIRECT_URI: REDIRECT, PUBLIC_BASE_URL: 'https://intake.example.org' });
  t.after(() => s.child.kill());
  const r = await withHost(s.base, '/api/admin/gmail/link?format=json', 'evil.example', { 'x-acting-as': 'Ritvars' });
  assert.equal(r.status, 200, r.text);
  assert.match(JSON.parse(r.text).link, /^https:\/\/intake\.example\.org\/api\/auth\/gmail\/connect\?invite=/);
});

test('L8: the invite origin rule: PUBLIC_BASE_URL, else the configured Google redirect on a host, else the laptop address', async () => {
  const { inviteOrigin } = await import('../src/systempages.js');
  const req = { headers: { host: 'evil.example' } };
  assert.equal(inviteOrigin(req, { PUBLIC_BASE_URL: 'https://intake.example.org/' }), 'https://intake.example.org');
  assert.equal(inviteOrigin(req, { VERCEL: '1', GOOGLE_REDIRECT_URI: 'https://intake.example.org/api/auth/google/callback' }), 'https://intake.example.org');
  assert.equal(inviteOrigin(req, { VERCEL: '1' }), null, 'a host with nothing configured makes no link');
  assert.equal(inviteOrigin(req, {}), 'http://evil.example', 'a laptop uses the address it was opened at');
});
