// Shared by the security tests of 07.10.2026 (patch S1). Not a test file itself: the
// suite runs test/*.test.js, and this name does not match.
//
// One server per test, in memory, sign-in ON by default, because every hole the review
// found was a hole on the hosted copy, where sign-in is on.

import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { issueSession } from '../src/auth.js';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const SECRET = crypto.randomBytes(32).toString('hex');

export const ADMIN = 'ritvars.vilcins@novikontas.org';
export const USER = 'edu@novikontas.org';

export function start(env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], { env: { ...process.env,
      PORT: '0', CRM_DB: ':memory:', DATASET: 'demo', CRM_AUTH: '1', CRM_SESSION_SECRET: SECRET, CRM_INSECURE_COOKIE: '1',
      CRM_PUBLIC: '', DATABASE_URL: '', DATABASE_URL_UNPOOLED: '', CRM_DB_DATABASE_URL_UNPOOLED: '', VERCEL: '', VERCEL_ENV: '',
      CRM_ALLOW_WIPE: '', HOST: '',
      CRM_RITVARS_PASSWORD: 'fixture-only-not-a-secret-R9', CRM_AIGARS_PASSWORD: 'fixture-only-not-a-secret-A7',
      CRM_ADMISSIONS_PASSWORD: 'fixture-only-not-a-secret-E4', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const look = (d) => { out += d; const m = out.match(/http:\/\/(?:localhost|127\.0\.0\.1):(\d+)/); if (m) resolve({ child, base: `http://127.0.0.1:${m[1]}`, log: () => out }); };
    child.stdout.on('data', look); child.stderr.on('data', look);
    child.on('exit', (code) => reject(Object.assign(new Error(out), { code, out })));
  });
}

// Boots and waits for the exit. For the "refuses to start" tests.
export function bootExit(env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], { env: { ...process.env,
      PORT: '0', CRM_DB: ':memory:', DATASET: 'demo', CRM_AUTH: '', CRM_PUBLIC: '', DATABASE_URL: '', DATABASE_URL_UNPOOLED: '',
      CRM_DB_DATABASE_URL_UNPOOLED: '', VERCEL: '', VERCEL_ENV: '', HOST: '', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => { child.kill(); resolve({ code: 'running', out }); }, 15000);
    const look = (d) => {
      out += d;
      if (/http:\/\/(?:localhost|127\.0\.0\.1):\d+/.test(out)) { clearTimeout(timer); child.kill(); resolve({ code: 'running', out }); }
    };
    child.stdout.on('data', look); child.stderr.on('data', look);
    child.on('exit', (code) => { clearTimeout(timer); resolve({ code, out }); });
  });
}

export const session = (email, role, sessionVersion = 0) =>
  'crm_session=' + issueSession({ email, role, sessionVersion, authMethod: 'google' }, SECRET);
export const adminCookie = () => session(ADMIN, 'admin');
export const userCookie = () => session(USER, 'user');

// What the app's own screen sends: its own origin and a JSON body.
export const post = (s, p, { cookie, body = {}, headers = {} } = {}) => fetch(s.base + p, { method: 'POST',
  headers: { origin: s.base, 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body) });
export const get = (s, p, { cookie, headers = {} } = {}) => fetch(s.base + p, {
  headers: { ...(cookie ? { cookie } : {}), ...headers }, redirect: 'manual' });

// The routes that empty or replace the database (H3), and the simulators and demo builders (M3).
export const WIPES = [['/api/dataset', { kind: 'empty' }], ['/api/reset', {}], ['/api/demo/scenario', {}],
  ['/api/console/mode', { mode: 'empty', confirm: 'yes' }]];
export const SIMS = [['POST', '/api/sim/website/run', { scenario: 'study_enquiry' }], ['POST', '/api/sim/website/outbound', {}],
  ['POST', '/api/sim/demo', {}], ['GET', '/api/sim/providers'], ['GET', '/api/sim/events'],
  ['POST', '/api/intake/demo', {}], ['POST', '/api/intake/receive', { channel: 'website', externalId: 'x1', contactName: 'Sim' }],
  ['POST', '/api/inbound/website/simulate', {}], ['POST', '/api/console/phone-event', { event: 'ringing' }],
  ['POST', '/api/console/send', { channel: 'website', scenario: 'study_enquiry' }]];

// THE LIVE COPY'S SHAPE (fix/security-2026-10-07): VERCEL set and sign-in on is the production lock, and
// with VERCEL set server.js does not listen, so handle() is served by a small harness, as the
// security_2026_10_07 tests do.
export function startHosted(env = {}) {
  const harness = `
    const http = await import('node:http');
    const { pathToFileURL } = await import('node:url');
    const { handle } = await import(pathToFileURL(${JSON.stringify(path.join(ROOT, 'src', 'server.js'))}).href);
    const s = http.createServer(handle);
    s.listen(0, '127.0.0.1', () => console.log('http://localhost:' + s.address().port));`;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', harness], { env: { ...process.env,
      CRM_DB: ':memory:', PORT: '0', CRM_INSECURE_COOKIE: '1', CRM_PUBLIC: '', DATASET: 'empty', VERCEL: '1', VERCEL_ENV: 'production',
      CRM_AUTH: '1', CRM_SESSION_SECRET: SECRET, DATABASE_URL: '', DATABASE_URL_UNPOOLED: '', CRM_DB_DATABASE_URL_UNPOOLED: '',
      CRM_RITVARS_PASSWORD: 'fixture-only-not-a-secret-R9', CRM_AIGARS_PASSWORD: 'fixture-only-not-a-secret-A7',
      CRM_ADMISSIONS_PASSWORD: 'fixture-only-not-a-secret-E4', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('never started: ' + out)); }, 20000);
    const look = (d) => { out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) { clearTimeout(timer); resolve({ child, base: `http://127.0.0.1:${m[1]}` }); } };
    child.stdout.on('data', look); child.stderr.on('data', look);
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`exited ${code}: ${out}`)); });
  });
}

// AREAS (19.10.2026): a running copy with one account per kind - admin with both halves, a Training Centre user, an
// Academy user and a user with no area - in a fresh SQLite file, the first-boot marker already set so the areas stay
// exactly as written here. Synthetic addresses; no password is set or needed (the session is signed by SECRET).
export const AREA_USERS = {
  admin: { email: 'admin.both@novikontas.org', role: 'admin', areas: ['academy', 'tc'] },
  tc: { email: 'tc.only@novikontas.org', role: 'user', areas: ['tc'] },
  academy: { email: 'academy.only@novikontas.org', role: 'user', areas: ['academy'] },
  none: { email: 'no.area@novikontas.org', role: 'user', areas: [] },
};
export async function startWithAreas(env = {}) {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const keep = {};
  for (const k of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'CRM_DB_DATABASE_URL_UNPOOLED']) { keep[k] = process.env[k]; process.env[k] = ''; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-areas-'));
  const file = path.join(dir, 'areas.db');
  const { openDb } = await import('../src/db.js');
  const db = await openDb(file);
  const at = new Date().toISOString();
  for (const [k, u] of Object.entries(AREA_USERS)) {
    await db.prepare(`INSERT INTO crm_users (id, email, display_name, password_hash, role, active, session_version, created_at)
      VALUES (?,?,?,NULL,?,1,0,?)`).run('u_' + k, u.email, 'Test ' + k, u.role, at);
    for (const a of u.areas) await db.prepare('INSERT INTO crm_user_areas (user_id, area, granted_at, granted_by) VALUES (?,?,?,?)').run('u_' + k, a, at, 'test');
  }
  await db.prepare('INSERT INTO sync_state (name, value, ran_at) VALUES (?,?,?)').run('areas_backfill_2026_10', 'done', at);
  await db.close();
  for (const [k, v] of Object.entries(keep)) process.env[k] = v ?? '';
  const s = await start({ CRM_DB: file, DATASET: 'empty', CRM_RITVARS_PASSWORD: '', CRM_AIGARS_PASSWORD: '', CRM_ADMISSIONS_PASSWORD: '', ...env });
  const cookie = (k) => session(AREA_USERS[k].email, AREA_USERS[k].role);
  return { ...s, cookie, dir };
}
