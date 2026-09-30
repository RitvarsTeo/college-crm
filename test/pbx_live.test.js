// Ritvars' test, 30.09.2026: does the TeleGroup call list show a call WHILE it rings and while it is
// answered, or only after it ends? This decides the call pop-up (poll every ~10 s, or a real-time
// event from TeleGroup). GET /api/admin/pbx/live: admins only, behind sign-in, the last 2 minutes,
// per call only uniqueid, created_at, queue, state, operator_name and the caller's last 4 digits.
// Never the token. The token below is a fake that says so.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pbxLive } from '../lib/pbx.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TOKEN = 'test-pbx-token-not-real-0000';

test('pbx live: the last 2 minutes, only the six fields, the caller cut to 4 digits', async () => {
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(String(url));
    return { ok: true, status: 200, json: async () => [
      { uniqueid: '1727690000.1', created_at: '2026-09-30 16:01:10', queue: '1001*Q-ADMISSION', state: 'RINGING',
        operator_name: null, caller_num: '+37129990123', destination: 'incoming', recording: 'secret.wav', extra: 'x' },
      { uniqueid: '1727690000.2', created_at: '2026-09-30 16:01:30', queue: '1001*Q-OTHER', state: 'ANSWER',
        operator_name: 'Ieva', caller_num: '20000000' }] };
  };
  const r = await pbxLive({ env: { PBX_API_TOKEN: TOKEN }, fetchImpl, now: new Date('2026-09-30T13:02:00Z') });
  assert.equal(r.ok, true);
  assert.equal(r.minutes, 2);
  assert.deepEqual(r.calls[0], { uniqueid: '1727690000.1', created_at: '2026-09-30 16:01:10', queue: '1001*Q-ADMISSION',
    state: 'RINGING', operator_name: null, caller_last4: '0123' });
  assert.deepEqual(Object.keys(r.calls[1]), ['uniqueid', 'created_at', 'queue', 'state', 'operator_name', 'caller_last4']);
  const u = new URL(seen[0]);
  assert.equal(u.searchParams.get('dateFrom'), '2026-09-30 16:00:00', 'two minutes back, Riga time');
  assert.equal(u.searchParams.get('dateTo'), '2026-09-30 16:02:00');
  assert.ok(!JSON.stringify(r).includes(TOKEN), 'never the token');
});

test('pbx live: a failure says so without the token', async () => {
  const r = await pbxLive({ env: { PBX_API_TOKEN: TOKEN },
    fetchImpl: async () => { throw new Error(`boom token=${TOKEN}`); } });
  assert.equal(r.ok, false);
  assert.ok(!JSON.stringify(r).includes(TOKEN));
  const none = await pbxLive({ env: {}, fetchImpl: async () => ({}) });
  assert.equal(none.ok, false);
  assert.match(none.error, /PBX_API_TOKEN/);
});

function start(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], { env: { ...process.env,
      PORT: '0', CRM_DB: ':memory:', DATASET: 'empty', CRM_PUBLIC: '', DATABASE_URL: '',
      CRM_DB_DATABASE_URL_UNPOOLED: '', PBX_API_TOKEN: '', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const look = (d) => { out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, base: `http://127.0.0.1:${m[1]}` }); };
    child.stdout.on('data', look); child.stderr.on('data', look);
    child.on('exit', () => reject(new Error(out)));
  });
}

test('pbx live over the wire: admins only; signed out 401 with sign-in on', async (t) => {
  const s = await start({ CRM_AUTH: '' });
  t.after(() => s.child.kill());
  assert.equal((await fetch(s.base + '/api/admin/pbx/live', { headers: { 'x-acting-as': 'Ieva' } })).status, 403);
  const admin = await fetch(s.base + '/api/admin/pbx/live', { headers: { 'x-acting-as': 'Ritvars' } });
  assert.equal(admin.status, 200);
  assert.equal((await admin.json()).ok, false, 'no token on this copy: it says so');
  const on = await start({ CRM_AUTH: '1', CRM_SESSION_SECRET: 'test-session-secret-not-real-00000000000000' });
  t.after(() => on.child.kill());
  assert.equal((await fetch(on.base + '/api/admin/pbx/live')).status, 401);
});
