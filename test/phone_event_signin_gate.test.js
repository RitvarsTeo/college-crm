// 14.10.2026, live: POST /api/inbound/phone-event/ (a TRAILING SLASH) with the right PHONE_EVENT_SECRET answered 401
// "not signed in": only the exact path is open before sign-in. The real server, sign-in ON, as production runs it.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SECRET = 'phone-event-secret-not-real-0000';

function start() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], { env: { ...process.env,
      PORT: '0', CRM_DB: ':memory:', DATASET: 'empty', CRM_AUTH: '1', CRM_SESSION_SECRET: crypto.randomBytes(32).toString('hex'),
      CRM_INSECURE_COOKIE: '1', CRM_PUBLIC: '', DATABASE_URL: '', DATABASE_URL_UNPOOLED: '', CRM_DB_DATABASE_URL_UNPOOLED: '',
      APP_ORIGIN: '', PHONE_EVENT_SECRET: SECRET, CHANNEL_MODE_PHONE: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const look = (d) => { out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, base: `http://127.0.0.1:${m[1]}` }); };
    child.stdout.on('data', look); child.stderr.on('data', look);
    child.on('exit', () => reject(new Error(out)));
  });
}
const post = (s, p, secret, body) => fetch(s.base + p, { method: 'POST',
  headers: { 'content-type': 'application/json', ...(secret ? { 'x-crm-secret': secret } : {}) }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));
const EVENT = { call_id: 'gate-1', event: 'ringing', caller: '+37126660001', queue: '1001*Q-ADMISSION', at: '2026-10-14T08:00:00Z' };

test('sign-in ON: the right secret passes the sign-in door, with or without a trailing slash', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  for (const p of ['/api/inbound/phone-event', '/api/inbound/phone-event/']) {
    const empty = await post(s, p, SECRET, {});
    assert.equal(empty.status, 400, p + ': the handler ran and refused an empty event');
    assert.notEqual(empty.body.error, 'not signed in');
  }
  const ok = await post(s, '/api/inbound/phone-event/', SECRET, EVENT);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.stored, true);
});

test('sign-in ON: a wrong or missing secret is refused by the handler, before the database', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  for (const p of ['/api/inbound/phone-event', '/api/inbound/phone-event/']) {
    for (const secret of [null, 'wrong', SECRET + 'x']) {
      const r = await post(s, p, secret, EVENT);
      assert.equal(r.status, 401, `${p} ${secret}`);
      assert.equal(r.body.error, 'shared secret did not match');
    }
  }
});

test('sign-in ON: a trailing slash opens nothing that needs sign-in', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  for (const p of ['/api/people/', '/api/intake/', '/api/inbound/events/', '/api/admin/channels/']) {
    const r = await fetch(s.base + p, { headers: { accept: 'application/json' } });
    assert.equal(r.status, 401, p);
  }
});
