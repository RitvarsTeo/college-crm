// Found 28.09.2026: POST /api/reset, /api/dataset and /api/demo/scenario replace or empty
// the whole database, and with sign-in on they needed only A session - so the shared
// Admissions account could empty the live CRM with one request (12 people -> 0 on a
// throwaway copy). Now, with sign-in on, only an admin may, as with /api/console/mode.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { issueSession } from '../src/auth.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SECRET = crypto.randomBytes(32).toString('hex');

function start() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], { env: { ...process.env,
      PORT: '0', CRM_DB: ':memory:', DATASET: 'demo', CRM_AUTH: '1', CRM_SESSION_SECRET: SECRET, CRM_INSECURE_COOKIE: '1',
      CRM_PUBLIC: '', DATABASE_URL: '', DATABASE_URL_UNPOOLED: '', CRM_DB_DATABASE_URL_UNPOOLED: '',
      CRM_RITVARS_PASSWORD: 'fixture-only-not-a-secret-R9', CRM_AIGARS_PASSWORD: 'fixture-only-not-a-secret-A7',
      CRM_ADMISSIONS_PASSWORD: 'fixture-only-not-a-secret-E4' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const look = (d) => { out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, base: `http://127.0.0.1:${m[1]}` }); };
    child.stdout.on('data', look); child.stderr.on('data', look);
    child.on('exit', () => reject(new Error(out)));
  });
}
const session = (email, role) => 'crm_session=' + issueSession({ email, role, sessionVersion: 0, authMethod: 'google' }, SECRET);

test('a signed-in non-admin cannot empty or replace the database; an admin still can', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  const user = session('edu@novikontas.org', 'user');
  const admin = session('ritvars.vilcins@novikontas.org', 'admin');
  const count = async () => (await (await fetch(s.base + '/api/people', { headers: { cookie: user } })).json()).count;
  const post = (p, cookie, body = {}) => fetch(s.base + p, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) });

  const before = await count();
  assert.ok(before > 0, 'the demo people are there');
  for (const [p, body] of [['/api/reset', {}], ['/api/dataset', { kind: 'empty' }], ['/api/demo/scenario', {}]]) {
    const r = await post(p, user, body);
    assert.equal(r.status, 403, `${p} is refused to the Admissions account`);
    assert.equal(await count(), before, `${p} removed nobody`);
  }
  assert.equal((await post('/api/reset', admin)).status, 200, 'an admin can still reset a copy');
  assert.equal(await count(), 0);
});
