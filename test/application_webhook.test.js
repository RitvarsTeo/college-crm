// The fast path for an application (Session B brief, 30.09.2026): POST /api/intake/application.
// apply.novikontas.org (or the SIS) sends the same fields the daily pull reads, the moment somebody
// starts an application. The webhook is the fast path, the daily pull is the safety net, and the
// same application twice is one person.
//
// Guarded by its own secret header, x-crm-application-secret, checked against the environment
// variable SIS_APPLICATION_SECRET. Only the NAME is in the source; Ritvars sets the value in Vercel.
// The values below are fakes that announce themselves.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { syncSis, receiveSisApplication } from '../src/sync.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SECRET = 'test-application-secret-not-real-0000';
const PATH = '/api/intake/application';

const app = (over = {}) => ({
  reference: 'ref-wh', applicationId: 'app-wh', givenName: 'Liene', familyName: 'Kalna',
  email: 'liene.kalna@example.com', phone: '+371 29990002', programmeCode: 'MEH', status: 'started',
  registeredAt: '2026-09-30T06:00:00.000Z', changedAt: '2026-09-30T06:05:00.000Z', ...over,
});

function start(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], { env: { ...process.env,
      PORT: '0', CRM_DB: ':memory:', DATASET: 'empty', CRM_AUTH: '', CRM_PUBLIC: '', DATABASE_URL: '',
      CRM_DB_DATABASE_URL_UNPOOLED: '', SIS_APPLICATION_SECRET: '', CHANNEL_MODE_SIS: '', ...env },
    stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const look = (d) => { out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, base: `http://127.0.0.1:${m[1]}` }); };
    child.stdout.on('data', look); child.stderr.on('data', look);
    child.on('exit', () => reject(new Error(out)));
  });
}
const post = (base, body, headers = {}) => fetch(base + PATH, { method: 'POST',
  headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, text: await r.text() }));
const people = (base) => fetch(base + '/api/people', { headers: { 'x-acting-as': 'Ieva' } }).then((r) => r.json());
const list = (j) => (Array.isArray(j) ? j : j.people || j.rows || []);

test('webhook: no secret configured refuses everything, and a wrong or missing header is refused', async (t) => {
  const none = await start({ CHANNEL_MODE_SIS: 'test' });
  t.after(() => none.child.kill());
  const r0 = await post(none.base, app(), { 'x-crm-application-secret': SECRET });
  assert.equal(r0.status, 401);

  const s = await start({ CHANNEL_MODE_SIS: 'test', SIS_APPLICATION_SECRET: SECRET });
  t.after(() => s.child.kill());
  for (const h of [{}, { 'x-crm-application-secret': '' }, { 'x-crm-application-secret': 'wrong' },
    { 'x-crm-application-secret': SECRET + 'x' }, { authorization: `Bearer ${SECRET}` }]) {
    const r = await post(s.base, app(), h);
    assert.equal(r.status, 401, JSON.stringify(h));
    assert.ok(!r.text.includes(SECRET), 'the secret is never echoed');
  }
  assert.equal(list(await people(s.base)).length, 0, 'nothing was stored');
});

test('webhook: the right secret creates an application-first person once; a form only started is at New (07.10)', async (t) => {
  const s = await start({ CHANNEL_MODE_SIS: 'test', SIS_APPLICATION_SECRET: SECRET });
  t.after(() => s.child.kill());
  const h = { 'x-crm-application-secret': SECRET };
  const r1 = await post(s.base, app(), h);
  assert.equal(r1.status, 200, r1.text);
  assert.equal(JSON.parse(r1.text).outcome, 'created');
  assert.ok(!r1.text.includes(SECRET));
  const r2 = await post(s.base, app(), h);
  assert.equal(r2.status, 200);
  assert.equal(JSON.parse(r2.text).outcome, 'repeat');
  const all = list(await people(s.base));
  assert.equal(all.length, 1);
  assert.equal(all[0].status, 'New', 'started is not a submitted application');
  assert.equal(all[0].name, 'Liene Kalna');
});

test('webhook: works with sign-in on, without a session, and still needs the secret', async (t) => {
  const s = await start({ CHANNEL_MODE_SIS: 'test', SIS_APPLICATION_SECRET: SECRET,
    CRM_AUTH: '1', CRM_SESSION_SECRET: 'test-session-secret-not-real-0000000000' });
  t.after(() => s.child.kill());
  assert.equal((await fetch(s.base + '/api/people')).status, 401, 'private routes stay private');
  assert.equal((await post(s.base, app(), {})).status, 401);
  assert.equal((await post(s.base, app(), { 'x-crm-application-secret': SECRET })).status, 200);
});

test('webhook: SIS off answers 409 and stores nothing; a record with no reference is 400', async (t) => {
  const off = await start({ SIS_APPLICATION_SECRET: SECRET });
  t.after(() => off.child.kill());
  assert.equal((await post(off.base, app(), { 'x-crm-application-secret': SECRET })).status, 409);
  assert.equal(list(await people(off.base)).length, 0);

  const s = await start({ CHANNEL_MODE_SIS: 'test', SIS_APPLICATION_SECRET: SECRET });
  t.after(() => s.child.kill());
  assert.equal((await post(s.base, app({ reference: null }), { 'x-crm-application-secret': SECRET })).status, 400);
  assert.equal((await post(s.base, app({ status: 'wobbly' }), { 'x-crm-application-secret': SECRET })).status, 400);
});

test('webhook then daily pull: the same application is one person, and the bookmark is the pull\'s own', async () => {
  const db = await openDb(':memory:');
  const env = { SIS_API_TOKEN: 'test-sis-token-not-real-0000', CHANNEL_MODE_SIS: 'test' };
  const now = new Date('2026-09-30T06:06:00Z');
  const w = await receiveSisApplication(db, app(), { now, env });
  assert.equal(w.outcome, 'created');
  assert.equal(await db.prepare("SELECT value FROM sync_state WHERE name = 'sis'").get(), undefined,
    'the webhook never moves the pull bookmark');
  const later = app({ status: 'submitted', submittedAt: '2026-09-30T07:00:00.000Z', changedAt: '2026-09-30T07:00:00.000Z' });
  const r = await syncSis(db, { now: new Date('2026-10-01T05:00:00Z'), env,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ applicants: [app(), later], nextCursor: null }) }) });
  assert.equal(r.created, 0);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM people').get()).n, 1);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM inbound WHERE channel = 'sis'").get()).n, 1);
  // and the other way round: the pull first, the webhook repeats it
  const db2 = await openDb(':memory:');
  await syncSis(db2, { now, env, fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ applicants: [app()], nextCursor: null }) }) });
  assert.equal((await receiveSisApplication(db2, app(), { now, env })).outcome, 'repeat');
  assert.equal((await db2.prepare('SELECT COUNT(*) n FROM people').get()).n, 1);
});

test('webhook: only the NAME of the secret is in the source', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
  assert.match(src, /process\.env\.SIS_APPLICATION_SECRET/);
  assert.doesNotMatch(src, /SIS_APPLICATION_SECRET\s*[=:]\s*['"`][^'"`]+['"`]/);
});

test('webhook: a body that is not JSON, a list, or too big is refused and stores nothing', async (t) => {
  const s = await start({ CHANNEL_MODE_SIS: 'test', SIS_APPLICATION_SECRET: SECRET });
  t.after(() => s.child.kill());
  const h = { 'content-type': 'application/json', 'x-crm-application-secret': SECRET };
  const send = (raw) => fetch(s.base + PATH, { method: 'POST', headers: h, body: raw }).then((r) => r.status);
  assert.equal(await send('{not json'), 400);
  assert.equal(await send(JSON.stringify([app()])), 400);
  assert.equal(await send(JSON.stringify(app({ changedAt: null }))), 400);
  // too big: the server's own body guard cuts the connection; the caller sees an error, never a 200
  assert.notEqual(await send('x'.repeat(600 * 1024)).catch(() => 'cut'), 200);
  assert.equal(await send(JSON.stringify(app())), 200, 'and the server still answers the next one');
  assert.equal(list(await people(s.base)).length, 1, 'only the good one was stored');
});

test('webhook: the secret is named, empty, in .env.example', () => {
  assert.match(fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8'), /^SIS_APPLICATION_SECRET=$/m);
});
