// Q89b, picked by the owner 13.10.2026: "B: my own account". The sheet-pull Connect accepts a signed-in admin's
// own Google account, proves at once that the account can read the sheet (one read-only GET), and keeps nothing
// if it cannot. The page says which account is connected; Disconnect deletes it. A fake Google throughout.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
const SHEET = CFG.sheetPull.spreadsheetId;

// The fake Google: a token, the account that approved, and the sheet answering 200 or 403.
function fakeGoogle() {
  const g = { account: 'ritvars.vilcins@novikontas.org', canRead: true, calls: [] };
  g.server = http.createServer((req, res) => {
    g.calls.push([req.method, req.url.replace(/\?.*/, '')]);
    const send = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.url.startsWith('/token')) return send(200, { access_token: 'acc-not-real', refresh_token: 'refresh-not-real', expires_in: 3600 });
    if (req.url.startsWith('/userinfo')) return send(200, { email: g.account });
    if (req.url.startsWith('/v4/spreadsheets/' + SHEET)) return g.canRead ? send(200, { sheets: [{ properties: { title: 'NAV/ENG ADMISSIONS' } }] }) : send(403, { error: { status: 'PERMISSION_DENIED' } });
    return send(404, {});
  });
  return new Promise((r) => g.server.listen(0, '127.0.0.1', () => { g.base = `http://127.0.0.1:${g.server.address().port}`; r(g); }));
}

async function startIntake(google, file) {
  const env = { ...process.env, PORT: '0', CRM_DB: file, DATASET: '', CRM_AUTH: '', CRM_PUBLIC: '', DATABASE_URL: '', CRM_DB_DATABASE_URL_UNPOOLED: '',
    CRM_SESSION_SECRET: 'test-session-secret-not-real-00000000000', GOOGLE_CLIENT_ID: 'id-not-real', GOOGLE_CLIENT_SECRET: 'secret-not-real',
    GOOGLE_REDIRECT_URI: 'http://127.0.0.1/api/auth/google/callback', GMAIL_TOKEN_URL: google.base + '/token',
    GOOGLE_USERINFO_URL: google.base + '/userinfo', SHEETS_API_ROOT: google.base + '/v4' };
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const look = (d) => { out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, base: `http://127.0.0.1:${m[1]}` }); };
    child.stdout.on('data', look); child.stderr.on('data', look);
    child.on('exit', () => reject(new Error(out)));
  });
}

const ADMIN = { 'x-acting-as': 'Ritvars' };
// Press Connect as an admin, then come back from "Google" with a code: the whole real path.
async function connect(s) {
  const r = await fetch(s.base + '/api/admin/sheet-pull/connect', { headers: ADMIN, redirect: 'manual' });
  assert.equal(r.status, 302);
  const to = new URL(r.headers.get('location'));
  assert.match(to.searchParams.get('scope'), /spreadsheets\.readonly/);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const back = await fetch(`${s.base}/api/auth/google/callback?state=${encodeURIComponent(to.searchParams.get('state'))}&code=code-not-real`,
    { headers: { cookie }, redirect: 'manual' });
  return { status: back.status, text: await back.text() };
}
const status = async (s) => (await fetch(s.base + '/api/admin/sheet-pull?format=json', { headers: ADMIN })).json();

async function setup(t) {
  const google = await fakeGoogle();
  const file = path.join(os.tmpdir(), `intake-q89b-${process.pid}-${Date.now()}.db`);
  const db = await openDb(file);
  await db.prepare(`INSERT INTO crm_users (id, email, display_name, role, active, created_at) VALUES
    ('u1','ritvars.vilcins@novikontas.org','Ritvars','admin',1,'2026-10-01'), ('u2','ieva@novikontas.org','Ieva','user',1,'2026-10-01'),
    ('u3','gone.admin@novikontas.org','Gone','admin',0,'2026-10-01')`).run();
  if (db.close) await db.close();
  const s = await startIntake(google, file);
  t.after(() => { s.child.kill(); google.server.close(); setTimeout(() => { try { fs.unlinkSync(file); } catch {} }, 500); });
  return { google, s };
}

test('an admin connects with their own account: the sheet is read once to prove it, then the page says who', async (t) => {
  const { google, s } = await setup(t);
  const r = await connect(s);
  assert.equal(r.status, 200, r.text);
  assert.match(r.text, /connected to Intake as ritvars\.vilcins@novikontas\.org, read only/);
  assert.deepEqual(google.calls.filter(([, u]) => u.startsWith('/v4/')).map(([m]) => m), ['GET'], 'one read-only GET');
  const d = await status(s);
  assert.deepEqual([d.connected, d.account], [true, 'ritvars.vilcins@novikontas.org']);
  const page = await (await fetch(s.base + '/api/admin/sheet-pull', { headers: ADMIN })).text();
  assert.match(page, /Connected as ritvars\.vilcins@novikontas\.org, read only/);
  assert.match(page, /action="\/api\/admin\/sheet-pull\/disconnect"/);
  assert.ok(!/refresh-not-real|acc-not-real/.test(page + JSON.stringify(d)), 'no token anywhere');
});

test('an account that cannot open the sheet: refused, nothing kept', async (t) => {
  const { google, s } = await setup(t);
  google.canRead = false;
  const r = await connect(s);
  assert.equal(r.status, 400);
  assert.match(r.text, /cannot open the admissions sheet, so nothing was connected/);
  assert.equal((await status(s)).connected, false);
});

test('an account that is not an Intake admin (or an inactive one): refused, nothing kept, the sheet never asked', async (t) => {
  const { google, s } = await setup(t);
  for (const who of ['ieva@novikontas.org', 'gone.admin@novikontas.org', 'stranger@gmail.com']) {
    google.account = who;
    const r = await connect(s);
    assert.equal(r.status, 400, who);
    assert.match(r.text, /not an Intake admin/);
  }
  assert.equal((await status(s)).connected, false);
  assert.equal(google.calls.filter(([, u]) => u.startsWith('/v4/')).length, 0);
});

test('edu@, the sheet\'s owner, still connects; Disconnect deletes the sign-in', async (t) => {
  const { google, s } = await setup(t);
  google.account = 'edu@novikontas.org';
  assert.equal((await connect(s)).status, 200);
  assert.equal((await status(s)).account, 'edu@novikontas.org');
  const d = await fetch(s.base + '/api/admin/sheet-pull/disconnect', { method: 'POST', headers: ADMIN, redirect: 'manual' });
  assert.equal(d.status, 303);
  assert.equal((await status(s)).connected, false);
  assert.equal((await fetch(s.base + '/api/admin/sheet-pull/disconnect', { method: 'POST', headers: { 'x-acting-as': 'Ieva' } })).status, 403, 'admins only');
});
