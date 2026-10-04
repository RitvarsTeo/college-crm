// WEB PUSH for the call notification (Q6, 04.10.2026): the corner notification also reaches a
// colleague whose Intake is closed. Tested without any push service: a fake fetch records the knocks.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { vapidHeader, pushConfigured, subscribe, knock } from '../src/webpush.js';
import { receivePhoneEvent } from '../src/phoneevent.js';
import { latestNote, noteFor } from '../src/callpop.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SW = fs.readFileSync(path.join(ROOT, 'src', 'sw.js'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const Q = '1001*Q-ADMISSION';

// a throwaway key pair, made here; nothing real
function keys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pub = publicKey.export({ format: 'jwk' });
  const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]);
  return { env: { VAPID_PUBLIC_KEY: raw.toString('base64url'), VAPID_PRIVATE_KEY: privateKey.export({ format: 'jwk' }).d,
    VAPID_SUBJECT: 'mailto:test@example.com' }, publicKey };
}

test('the VAPID header is an ES256 token the push service can verify with our public key', () => {
  const { env, publicKey } = keys();
  const h = vapidHeader('https://fcm.googleapis.com/fcm/send/abc', { env, now: Date.parse('2026-10-04T20:00:00Z') });
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h);
  assert.ok(m, h);
  const claims = JSON.parse(Buffer.from(m[2], 'base64url').toString());
  assert.equal(claims.aud, 'https://fcm.googleapis.com', 'the push service origin only');
  assert.equal(claims.sub, 'mailto:test@example.com');
  assert.ok(claims.exp - Date.parse('2026-10-04T20:00:00Z') / 1000 <= 24 * 3600);
  const ok = crypto.verify('sha256', Buffer.from(m[1] + '.' + m[2]), { key: publicKey, dsaEncoding: 'ieee-p1363' },
    Buffer.from(m[3], 'base64url'));
  assert.ok(ok, 'the signature verifies');
  assert.equal(m[4], env.VAPID_PUBLIC_KEY);
  assert.ok(!h.includes(env.VAPID_PRIVATE_KEY), 'the private key never leaves');
});

async function withSubs() {
  const db = await openDb(':memory:');
  await subscribe(db, { endpoint: 'https://push.example/ieva', userName: 'Ieva' });
  await subscribe(db, { endpoint: 'https://push.example/laura', userName: 'Laura' });
  return db;
}
function recorder(status = 201) {
  const calls = [];
  const f = async (url, opts) => { calls.push({ url, opts }); return { ok: status < 300, status }; };
  return { calls, f };
}

test('no keys, no knock: push is simply off', async () => {
  const db = await withSubs();
  assert.equal(pushConfigured({}), false);
  const r = await knock(db, { event: 'ringing' }, { env: {}, users: [] });
  assert.equal(r.skipped, 'push is not configured');
});

test('a ring knocks on every colleague; an answer only on whoever answered; an end on nobody', async () => {
  const db = await withSubs();
  const { env } = keys();
  const ring = recorder();
  await knock(db, { event: 'ringing' }, { env, users: ['Ieva', 'Laura'], fetchImpl: ring.f });
  assert.deepEqual(ring.calls.map((c) => c.url).sort(), ['https://push.example/ieva', 'https://push.example/laura']);
  const c = ring.calls[0].opts;
  assert.equal(c.method, 'POST');
  assert.equal(c.headers.TTL, '60');
  assert.equal(c.headers.Urgency, 'high');
  assert.match(c.headers.Authorization, /^vapid t=/);
  assert.equal(c.body, undefined, 'the knock carries no data');
  const ans = recorder();
  await knock(db, { event: 'answered', operator: 'Ieva Kalnina' }, { env, users: ['Ieva', 'Laura'], fetchImpl: ans.f });
  assert.deepEqual(ans.calls.map((x) => x.url), ['https://push.example/ieva']);
  const end = recorder();
  await knock(db, { event: 'ended' }, { env, users: ['Ieva'], fetchImpl: end.f });
  assert.equal(end.calls.length, 0);
});

test('a browser the push service says is gone is forgotten; a failing push never throws', async () => {
  const db = await withSubs();
  const { env } = keys();
  const gone = recorder(410);
  const r = await knock(db, { event: 'ringing' }, { env, users: [], fetchImpl: gone.f });
  assert.equal(r.gone, 2);
  assert.equal(Number((await db.prepare('SELECT COUNT(*) n FROM push_subscriptions').get()).n), 0);
  const db2 = await withSubs();
  const boom = await knock(db2, { event: 'ringing' }, { env, users: [], fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(boom.failed, 2);
});

test('a stored call event knocks; a repeat of the same event does not', async () => {
  const db = await withSubs();
  const { env } = keys();
  const saved = { ...process.env };
  Object.assign(process.env, env);
  const realFetch = globalThis.fetch;
  const rec = recorder();
  globalThis.fetch = rec.f;
  try {
    const e = { call_id: 'k1', event: 'ringing', caller: '+37126660001', queue: Q, at: '2026-10-04T08:00:00Z' };
    const first = await receivePhoneEvent(db, e, { mode: 'test' });
    assert.equal(first.pushed.sent, 2);
    await receivePhoneEvent(db, e, { mode: 'test' });
    assert.equal(rec.calls.length, 2, 'the retry knocked on nobody');
  } finally {
    globalThis.fetch = realFetch;
    for (const k of Object.keys(env)) { if (k in saved) process.env[k] = saved[k]; else delete process.env[k]; }
  }
});

test('after a knock the worker is told who is calling: name, new or existing, last note, next step', async () => {
  const db = await openDb(':memory:');
  await db.prepare(`INSERT INTO people (id, name, phone, status) VALUES ('p1', 'Anna Ozola', '29990001', 'Contacted')`).run();
  const now = new Date('2026-10-04T08:00:30Z');
  await receivePhoneEvent(db, { call_id: 'k2', event: 'ringing', caller: '+37129990001', queue: Q, at: '2026-10-04T08:00:00Z' }, { mode: 'test', now });
  const n = await latestNote(db, { viewer: 'Ieva', users: ['Ieva'], now });
  assert.equal(n.title, 'Anna Ozola');
  assert.match(n.body, /^Existing · Contacted/);
  assert.equal(n.href, '#/person/p1');
  assert.equal(n.tag, 'call-k2', 'the same tag as the open app uses, so the two never stack');
  assert.ok(!JSON.stringify(n).includes('29990001'), 'never the number');
  assert.equal(noteFor({ callId: 'x', who: { kind: 'unknown', last4: '0003' } }).title, 'New caller ···0003');
});

test('the service worker: quiet while Intake is on screen, otherwise asks Intake and shows the corner notification', () => {
  assert.match(SW, /w\.visibilityState === 'visible' && w\.focused\)\) return;/);
  assert.match(SW, /fetch\('\/api\/calls\/latest', \{ credentials: 'include'/);
  assert.match(SW, /showNotification\(n\.title, \{ body: n\.body, tag: n\.tag, requireInteraction: true/);
  assert.match(SW, /notificationclick/);
  assert.match(SW, /openWindow\('\/' \+ href\)/, 'a closed Intake opens on the caller');
  const server = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
  assert.match(server, /p === '\/sw\.js'/, 'served at the root, so it covers the whole app');
  assert.match(fs.readFileSync(path.join(ROOT, 'src', 'gate.js'), 'utf8'), /'\/sw\.js'\]\);/);
  assert.match(APP, /reg\.pushManager\.subscribe\(\{ userVisibleOnly: true, applicationServerKey: key \}\)/);
  assert.match(APP, /if \(!k\.publicKey\) return;/, 'no keys on the server, no subscription');
});

test('the key script prints the three names and saves nothing', () => {
  const s = fs.readFileSync(path.join(ROOT, 'scripts', 'vapid-keys.mjs'), 'utf8');
  for (const k of ['VAPID_PUBLIC_KEY=', 'VAPID_PRIVATE_KEY=', 'VAPID_SUBJECT=']) assert.ok(s.includes(k), k);
  assert.doesNotMatch(s, /writeFile|appendFile/);
});
