// SHARED LINKS SIGN IN FIRST (Component library part 15), over real HTTP and in a
// fake page. The owner, 28.09.2026: links open for anyone at ANY time.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { signInFirst, screenFor, RETURN_SCRIPT, withReturnScript } from '../src/signinfirst.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SECRET = 'x'.repeat(48);
const NAV = { 'sec-fetch-mode': 'navigate', accept: 'text/html' };

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')],
      { env: { ...process.env, CRM_DB: ':memory:', PORT: '0', CRM_INSECURE_COOKIE: '1',
        CRM_PUBLIC: '', DATASET: 'empty', CRM_AUTH: '1', CRM_SESSION_SECRET: SECRET },
        stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('never started: ' + out)); }, 15000);
    child.stdout.on('data', (d) => {
      out += d;
      if (/REFUSING TO START|Error/.test(out)) { clearTimeout(timer); child.kill(); reject(new Error(out)); }
      const m = out.match(/http:\/\/localhost:(\d+)/);
      if (m) { clearTimeout(timer); resolve({ child, port: Number(m[1]) }); }
    });
    child.stderr.on('data', (d) => { out += d; });
  });
}
const get = (port, p, headers = {}) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path: p, headers }, (res) => {
    let text = ''; res.on('data', (d) => { text += d; });
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
  }).on('error', reject);
});

test('a signed-out browser tab goes to the screen, code keeps its 401', async () => {
  const { child, port } = await startServer();
  try {
    for (const [p, to] of [['/api/report.csv?from=2026-01-01&to=2026-09-01', '/#/reports'],
      ['/api/report.xlsx', '/#/reports'], ['/api/admin/feedback/7/screenshot', '/#/feedback'],
      ['/api/people', '/']]) {
      const r = await get(port, p, NAV);
      assert.equal(r.status, 302, p);
      assert.equal(r.headers.location, to, p);
      const c = await get(port, p, { 'sec-fetch-mode': 'cors' });
      assert.equal(c.status, 401, `${p} from code`);
      assert.match(c.text, /not signed in/);
    }
    // A stale cookie is not a session.
    const s = await get(port, '/api/report.csv', { ...NAV, cookie: 'crm_session=old.stale' });
    assert.equal(s.status, 302);
    // The page carries the return script, first in <head>.
    const page = await get(port, '/');
    assert.equal(page.status, 200);
    assert.ok(page.text.includes('crmReturnAfterSignIn'));
    assert.ok(page.text.indexOf('crmReturnAfterSignIn') < page.text.indexOf('</head>'));
  } finally { child.kill(); }
});

test('never a POST, never another host', () => {
  assert.equal(signInFirst({ method: 'POST', headers: NAV }, '/api/report.csv'), null);
  assert.equal(signInFirst({ method: 'GET', headers: { 'sec-fetch-mode': 'same-origin', accept: 'text/html' } }, '/api/x'), null);
  for (const p of ['/api/report.csv', '/api/x', '//evil', '/api/admin/feedback/1']) assert.match(screenFor(p), /^\/(#\/[a-z]+)?$/);
});

function tab(url, store) {
  const u = new URL(url, 'https://crm.example');
  const loc = { pathname: u.pathname, search: u.search, hash: u.hash };
  const ctx = {
    location: loc, JSON, Date,
    sessionStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } },
    history: { replaceState: (a, b, to) => { const n = new URL(to, 'https://crm.example'); loc.search = n.search; loc.hash = n.hash; } },
    window: { addEventListener: () => {} },
  };
  vm.runInNewContext(RETURN_SCRIPT.replace(/^<script>|<\/script>$/g, ''), ctx);
  return loc;
}

test('a hash link survives the Google sign-in, once', () => {
  const store = {};
  tab('/#/person/123', store);                       // shared link, signed out
  const back = tab('/?auth=google', store);          // Google brings the tab back
  assert.equal(back.hash, '#/person/123');
  assert.equal(back.search, '?auth=google', 'the app still sees and strips its own flag');
  assert.equal(tab('/?auth=google', store).hash, '', 'consumed');
});

test('the return script follows nothing it should not', () => {
  const store = {};
  tab('/#/home', store); assert.deepEqual(store, {}, 'Home is not worth returning to');
  tab('/#javascript:alert(1)', store); assert.deepEqual(store, {});
  store.crmReturnAfterSignIn = JSON.stringify({ h: '#/person/1', at: Date.now() - 31 * 60 * 1000 });
  assert.equal(tab('/?auth=google', store).hash, '', 'older than 30 minutes');
  store.crmReturnAfterSignIn = JSON.stringify({ h: '//evil.example', at: Date.now() });
  assert.equal(tab('/?auth=google', store).hash, '', 'tampered');
  store.crmReturnAfterSignIn = JSON.stringify({ h: '#/person/9', at: Date.now() });
  assert.equal(tab('/', store).hash, '', 'only after a Google return');
});

test('withReturnScript puts it right after <head>', () => {
  assert.ok(withReturnScript('<html><head lang="x"><title>t</title></head>').startsWith('<html><head lang="x"><script>'));
});
