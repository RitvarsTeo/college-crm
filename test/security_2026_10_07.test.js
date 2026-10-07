// The 07.10.2026 entry audit (before the move to the college's Vercel + Supabase).
//
// One test per finding that was fixed, each against a real server process with sign-in ON,
// the way production runs. Each test states what would be possible if its guard were deleted.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SECRET = 'a-session-secret-long-enough-to-be-accepted';
const AUTH_ENV = { CRM_AUTH: '1', CRM_SESSION_SECRET: SECRET };

function startServer(env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')],
      { env: { ...process.env, CRM_DB: ':memory:', PORT: '0', CRM_INSECURE_COOKIE: '1',
        CRM_PUBLIC: '', DATASET: 'empty', VERCEL: '', VERCEL_ENV: '', ...env },
        stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const done = (fn, arg) => { clearTimeout(timer); fn(arg); };
    const timer = setTimeout(() => { child.kill(); reject(new Error('the server never started: ' + out)); }, 15000);
    child.stdout.on('data', (d) => {
      out += d;
      if (/REFUSING TO START|Error/.test(out)) { child.kill(); return done(reject, new Error(out)); }
      const m = out.match(/http:\/\/localhost:(\d+)/);
      if (m) done(resolve, { child, port: Number(m[1]), out: () => out });
    });
    child.stderr.on('data', (d) => { out += d; });
    child.on('exit', () => done(reject, new Error('the server exited: ' + out)));
  });
}

function request(port, method, p, { raw, contentType = 'application/json', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: p,
      headers: { ...(raw != null ? { 'content-type': contentType, 'content-length': Buffer.byteLength(raw) } : {}),
        ...headers } },
      (res) => {
        let text = '';
        res.on('data', (d) => { text += d; });
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(text); } catch {}
          resolve({ status: res.statusCode, text, json });
        });
      });
    req.on('error', reject);
    if (raw != null) req.write(raw);
    req.end();
  });
}

// ------------------------------------------------------------------ C1 ----
// Without the guard: anybody on the internet could POST an invented email or a "missed call"
// with a premium-rate number into the Inbox, recorded as if the provider had sent it.
test('C1: the pull channels (gmail, phone, in_person) refuse an outside POST, even when switched on', async (t) => {
  const s = await startServer({ ...AUTH_ENV, CHANNEL_MODE_GMAIL: 'test', CHANNEL_MODE_PHONE: 'test',
    CHANNEL_MODE_IN_PERSON: 'test' });
  t.after(() => s.child.kill());
  for (const channel of ['gmail', 'phone', 'in_person']) {
    const json = await request(s.port, 'POST', '/api/inbound/' + channel,
      { raw: JSON.stringify({ id: 'forged-1', from: 'x@example.com', text: 'hello' }) });
    assert.notEqual(json.status, 200, channel + ' accepted an unauthenticated JSON POST');
    const plain = await request(s.port, 'POST', '/api/inbound/' + channel,
      { raw: '{"id":"forged-2"}', contentType: 'text/plain' });
    assert.notEqual(plain.status, 200, channel + ' accepted an unauthenticated text/plain POST');
  }
  const people = await request(s.port, 'GET', '/api/intake?state=new');
  assert.equal(people.status, 401, 'and the queue itself stays behind sign-in');
});
