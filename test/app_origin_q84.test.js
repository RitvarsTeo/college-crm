// Q84, 09.10.2026 ("Yes, redirect pages"): a PAGE asked for on an older address (crm-novikontas.vercel.app)
// goes to the app's own address (APP_ORIGIN, https://intake.novikontas.org), so Google sign-in starts and
// returns on one host. Every /api/* route - the provider webhooks above all - answers where it is sent.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { redirectTarget, appOrigin } from '../src/apporigin.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ENV = { APP_ORIGIN: 'https://intake.novikontas.org' };
const OLD = 'crm-novikontas.vercel.app';
const go = (o, env = ENV) => redirectTarget({ method: 'GET', host: OLD, ...o }, env);

test('a page on the old host goes to the same path and query on the app origin', () => {
  assert.equal(go({ url: '/' }), 'https://intake.novikontas.org/');
  assert.equal(go({ url: '/?cp=b' }), 'https://intake.novikontas.org/?cp=b');
  assert.equal(go({ url: '/console' }), 'https://intake.novikontas.org/console');
  assert.equal(go({ url: '/', method: 'HEAD' }), 'https://intake.novikontas.org/');
});

test('/api/*, /healthz and every write stay where they are sent', () => {
  for (const u of ['/api/inbound/website', '/api/inbound/phone-event', '/api/cron/pbx-calls', '/api/auth/google/callback?code=x', '/api', '/healthz']) {
    assert.equal(go({ url: u }), null, u);
  }
  assert.equal(go({ url: '/', method: 'POST' }), null, 'only GET and HEAD');
  assert.equal(go({ url: '/access', method: 'POST' }), null);
});

test('the app origin itself, a missing setting, or a bad one: no redirect at all', () => {
  assert.equal(go({ host: 'intake.novikontas.org', url: '/' }), null, 'already there');
  assert.equal(go({ host: 'INTAKE.novikontas.org', url: '/' }), null, 'case does not matter');
  assert.equal(go({ url: '/' }, {}), null, 'not set = fail-safe, local and previews unchanged');
  for (const bad of ['intake.novikontas.org', 'http://intake.novikontas.org', 'https://intake.novikontas.org/app', 'javascript:alert(1)', 'https://u:p@intake.novikontas.org']) {
    assert.equal(appOrigin({ APP_ORIGIN: bad }), null, bad);
  }
});

test('no open redirect: the request gives the path, never the host', () => {
  // a request line starting with // (or /\) is read as another host: only its PATH is kept, on our origin
  assert.equal(go({ url: '//evil.example/x' }), 'https://intake.novikontas.org/x');
  for (const u of ['//evil.example/x', '/\\evil.example', '/%2F%2Fevil.example']) {
    assert.equal(new URL(go({ url: u })).host, 'intake.novikontas.org', u);
  }
});

// ------------------------------------------------------------------ the running server --
function start(env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], { env: { ...process.env,
      PORT: '0', CRM_DB: ':memory:', DATASET: 'empty', CRM_AUTH: '', CRM_PUBLIC: '', DATABASE_URL: '',
      CRM_DB_DATABASE_URL_UNPOOLED: '', APP_ORIGIN: '', CHANNEL_MODE_WEBSITE: 'test', WEBSITE_FORM_SECRET: 'w-secret-not-real-0000', ...env },
    stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const look = (d) => { out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, port: Number(m[1]) }); };
    child.stdout.on('data', look); child.stderr.on('data', look);
    child.on('exit', () => reject(new Error(out)));
  });
}
const ask = (port, method, p, host, body = null, headers = {}) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: { host, ...headers } }, (res) => {
    let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location, body: b }));
  });
  req.on('error', reject);
  if (body) req.write(body);
  req.end();
});

test('running: a page on the old host answers 308; the website webhook on the old host is unchanged', async (t) => {
  const s = await start(ENV);
  t.after(() => s.child.kill());
  const page = await ask(s.port, 'GET', '/?x=1', OLD);
  assert.equal(page.status, 308);
  assert.equal(page.location, 'https://intake.novikontas.org/?x=1');
  const viaProxy = await ask(s.port, 'GET', '/', '127.0.0.1', null, { 'x-forwarded-host': OLD });
  assert.equal(viaProxy.status, 308, 'Vercel names the host in x-forwarded-host');
  const hook = await ask(s.port, 'POST', '/api/inbound/website', OLD, 'test=test',
    { 'content-type': 'application/x-www-form-urlencoded', 'x-crm-secret': 'w-secret-not-real-0000' });
  assert.equal(hook.status, 200, 'Tilda answered on the old host exactly as before');
  assert.equal(hook.body, 'ok');
  const own = await ask(s.port, 'GET', '/healthz', OLD);
  assert.notEqual(own.status, 308);
  const home = await ask(s.port, 'GET', '/', 'intake.novikontas.org');
  assert.equal(home.status, 200, 'the app origin serves the page');
});

test('running: without APP_ORIGIN nothing moves', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  const page = await ask(s.port, 'GET', '/', OLD);
  assert.equal(page.status, 200);
});
