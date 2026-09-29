// The first look at a real SIS reply (29.09.2026): admins only, read-only, one GET through
// lib/sis.js, and it answers the SHAPE - never a person, a date value or the token.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { shapeOf, firstLook } from '../src/sisfirstlook.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TOKEN = 'test-sis-token-not-real-1111';
const A = (over = {}) => ({ reference: 'ref-secret-1', applicationId: 'app-1', givenName: 'Jonas', familyName: 'Berzins',
  email: 'jonas@example.com', phone: '+371 20000000', programmeCode: 'NAV', programmeName: 'Maritime Transport',
  status: 'started', registeredAt: '2026-09-28T07:40:11.000Z', submittedAt: null, changedAt: '2026-09-28T07:58:02.000Z', ...over });

test('the shape: field names, fill counts, status counts - and none of the values', () => {
  const s = shapeOf([A(), A({ status: 'matriculated', submittedAt: '2026-09-28T08:00:00.000Z', email: null, startedAt: 'x' })], 'next');
  assert.equal(s.applicantsOnFirstPage, 2);
  assert.equal(s.morePages, true);
  assert.deepEqual(s.fields.email, { filled: 1, empty: 1 });
  assert.deepEqual(s.status, { started: 1, matriculated: 1 });
  assert.deepEqual(s.notInTheDocument, ['startedAt']);
  assert.deepEqual(s.startedOrMatriculatedDateFields, ['startedAt']);
  const text = JSON.stringify(s);
  for (const v of ['Jonas', 'Berzins', 'jonas@example.com', '20000000', 'ref-secret-1', '2026-09-28']) assert.ok(!text.includes(v), 'no value: ' + v);
});

test('one read-only GET through the existing client: Bearer header, no token in the URL, no since', async () => {
  const seen = [];
  const fetchImpl = async (url, opts) => { seen.push({ url: String(url), opts });
    return { ok: true, status: 200, json: async () => ({ applicants: [A()], nextCursor: null }) }; };
  const s = await firstLook({ env: { SIS_API_TOKEN: TOKEN }, fetchImpl });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].opts.method, 'GET');
  assert.equal(seen[0].opts.headers.authorization, 'Bearer ' + TOKEN);
  assert.ok(!seen[0].url.includes(TOKEN));
  assert.doesNotMatch(seen[0].url, /since=/);
  assert.match(seen[0].url, /limit=200/);
  assert.ok(!JSON.stringify(s).includes(TOKEN));
});

function startServer(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], {
      env: { ...process.env, PORT: '0', CRM_DB: ':memory:', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.stdout.on('data', (d) => { const m = String(d).match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, port: Number(m[1]) }); });
    child.on('exit', (code) => reject(new Error(`server exited (${code}): ${err}`)));
    setTimeout(() => reject(new Error('server did not start: ' + err)), 8000);
  });
}

test('the route: refused for a non-admin; for an admin without a token it says so, and nothing crashes', async (t) => {
  const { child, port } = await startServer({ SIS_API_TOKEN: '' });
  t.after(() => child.kill());
  const url = `http://127.0.0.1:${port}/api/admin/sis/first-look`;
  assert.equal((await fetch(url, { headers: { 'x-acting-as': 'Ieva' } })).status, 403);
  const r = await fetch(url, { headers: { 'x-acting-as': 'Ritvars' } });
  assert.equal(r.status, 200);
  const b = await r.json();
  assert.equal(b.ok, false);
  assert.match(b.error, /SIS_API_TOKEN/);
});
