// TELEGROUP'S CALL EVENTS WEBHOOK (their spec v1.0, 23.11.2026; patch 161). Their own sample payloads (section 7),
// with a college queue where ours must be stored: one call per call id, answered / missed, ring time and talk time;
// Riga time; outgoing calls, other divisions' queues and unknown types ignored; the token AND the address required.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { adaptPhoneEvent, receivePhoneEvent, phoneEventGate, sourceIp, redactToken, TELEGROUP_IPS } from '../src/phoneevent.js';
import { callMetrics } from '../src/callmetrics.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SECRET = 'test-telegroup-token-not-real-000';
const Q = '1001*Q-ADMISSION';
const base = { caller_sip: '', caller_num: '+37069965728', caller_name: '+37069965728' };
const agent = (n, name) => ({ destination_sip: `1001*${n}`, destination_num: n, destination_name: name });
// section 7.1, the answered call, in a college queue
const ANSWERED = [
  { type: 'join_queue', uniqueid: '1795421829.1642106', ...base, queue: Q, date: '2026-11-23 08:17:15' },
  { type: 'dial_ringing', uniqueid: '1795421829.1642106', ...base, ...agent('501', 'Erika Songailiene'), date: '2026-11-23 08:17:16' },
  { type: 'dial_ringing', uniqueid: '1795421829.1642106', ...base, ...agent('504', 'Jelena Vorobjova'), date: '2026-11-23 08:17:17' },
  { type: 'dial_connected', uniqueid: '1795421829.1642106', ...base, ...agent('501', 'Erika Songailiene'), date: '2026-11-23 08:17:19' },
  { type: 'status_hangup', uniqueid: '1795421829.1642106', ...base, ...agent('501', 'Erika Songailiene'), date: '2026-11-23 08:21:40',
    extraParams: { holdtime: '4', talktime: '261' } },
];
// section 7.6, the missed call
const MISSED = [
  { type: 'join_queue', uniqueid: '1795422011.1642230', caller_sip: '', caller_num: '+37061234567', caller_name: '', queue: Q, date: '2026-11-23 08:24:40' },
  { type: 'missed', uniqueid: '1795422011.1642230', caller_sip: '', caller_num: '+37061234567', caller_name: '', recipient: '37052000000',
    destination_sip: '', destination_num: '', destination_name: '', queue: Q, date: '2026-11-23 08:25:03' },
];
const call = (db, id) => db.prepare('SELECT * FROM pbx_calls WHERE uniqueid = ?').get(id);
const NOW = new Date('2026-11-23T07:00:00Z');

test('their `date` is Riga time: 08:17:15 in November (EET, +2) is 06:17:15 UTC; agent = destination_name', () => {
  const a = adaptPhoneEvent(ANSWERED[3]);
  assert.deepEqual([a.event, a.at, a.operator, a.extension, a.callId], ['answered', '2026-11-23T06:17:19.000Z', 'Erika Songailiene', '501', '1795421829.1642106']);
  assert.equal(adaptPhoneEvent({ ...ANSWERED[0], date: '2026-07-01 08:00:00' }).at, '2026-07-01T05:00:00.000Z', 'summer: EEST, +3');
  assert.deepEqual([adaptPhoneEvent(ANSWERED[4]).holdSec, adaptPhoneEvent(ANSWERED[4]).talkSec], [4, 261], 'their strings, read as seconds');
  assert.equal(adaptPhoneEvent(MISSED[1]).answered, false);
});

test('an answered call: five events in, ONE call stored - answered by Erika, waited 4 s, talked 261 s, from 08:17:15 Riga', async () => {
  const db = await openDb(':memory:');
  for (const e of ANSWERED) assert.equal((await receivePhoneEvent(db, e, { mode: 'live', now: NOW })).ok, true);
  const c = await call(db, '1795421829.1642106');
  assert.equal(c.called_at, '2026-11-23T06:17:15.000Z', 'when it entered the queue');
  assert.equal(Number(c.picked_up), 1);
  assert.equal(c.operator_name, 'Erika Songailiene');
  assert.deepEqual([Number(c.duration_sec), Number(c.talk_sec)], [265, 261], 'waited = duration - talk = 4 s, as the Calls screen reads it');
  assert.equal(c.queue, Q);
  assert.equal(Number((await db.prepare(`SELECT COUNT(*) n FROM pbx_calls`).get()).n), 1);
  const M = await callMetrics(db, { now: new Date('2026-11-24T10:00:00Z') });
  assert.equal(M.figures.waitSec, 4, 'the Calls screen: 4 s to answer');
});

test('a missed call: stored once as missed, with its ring time, no operator; it reaches the Inbox as the pull made it', async () => {
  const db = await openDb(':memory:');
  for (const e of MISSED) await receivePhoneEvent(db, e, { mode: 'live', now: NOW });
  // a hangup after the missed is a repeat of "ended", never a second call
  const again = await receivePhoneEvent(db, { ...MISSED[1], type: 'status_hangup', date: '2026-11-23 08:25:04' }, { mode: 'live', now: NOW });
  assert.equal(again.duplicate, true);
  const c = await call(db, '1795422011.1642230');
  assert.equal(Number(c.picked_up), 0);
  assert.equal(c.operator_name, null);
  assert.deepEqual([Number(c.duration_sec), Number(c.talk_sec)], [23, 0], 'rang 23 s, from the queue to the missed');
  assert.ok(c.inbound_id, 'an unknown number that rang and nobody answered is an Inbox card, as with the pull');
});

test('the same event twice is stored once; a repeat delivery is a 2xx, never an error', async () => {
  const db = await openDb(':memory:');
  for (const e of ANSWERED) await receivePhoneEvent(db, e, { mode: 'live', now: NOW });
  const r = await receivePhoneEvent(db, ANSWERED[3], { mode: 'live', now: NOW });
  assert.equal(r.duplicate, true);
  assert.equal(Number((await db.prepare(`SELECT COUNT(*) n FROM call_events WHERE call_id = '1795421829.1642106'`).get()).n), 3, 'ringing, answered, ended');
});

test('only a college queue: their example queue (Lithuania) and another division are ignored - every event of that call, never stored under Admissions', async () => {
  const db = await openDb(':memory:');
  for (const queue of ['1001*Q-NOVIKONTAS_LT', '1001*Q-ENERGY_LV']) {
    const id = 'other-' + queue;
    for (const e of ANSWERED) {
      const r = await receivePhoneEvent(db, { ...e, uniqueid: id, ...(e.queue ? { queue } : {}) }, { mode: 'live', now: NOW });
      assert.ok(r.ignored, `${e.type} of a ${queue} call is ignored`);
    }
  }
  assert.equal(Number((await db.prepare('SELECT COUNT(*) n FROM call_events').get()).n), 0, 'nothing of theirs is stored');
  assert.equal(Number((await db.prepare('SELECT COUNT(*) n FROM pbx_calls').get()).n), 0);
});

test('outgoing calls (caller_sip filled) and unknown types are ignored with a 2xx answer', async () => {
  const db = await openDb(':memory:');
  const out = { type: 'dial_ringing', uniqueid: '1795422200.1642301', caller_sip: '1001*501', caller_num: '501', caller_name: 'Erika Songailiene',
    destination_sip: '', destination_num: '+37069965728', destination_name: '', date: '2026-11-23 09:02:11' };
  assert.equal((await receivePhoneEvent(db, out, { mode: 'live', now: NOW })).ignored, 'an outgoing call');
  assert.match((await receivePhoneEvent(db, { ...ANSWERED[0], type: 'call_transferred' }, { mode: 'live', now: NOW })).ignored, /unknown event type/);
  assert.equal(Number((await db.prepare('SELECT COUNT(*) n FROM call_events').get()).n), 0);
});

test('the answer does not wait: with the platform\'s waitUntil, the store is done and the call is settled after the answer', async () => {
  const db = await openDb(':memory:');
  const pending = [];
  for (const e of ANSWERED) {
    const r = await receivePhoneEvent(db, e, { mode: 'live', now: NOW, later: (p) => pending.push(p) });
    if (r.stored) assert.equal(r.later, true);
  }
  await Promise.all(pending);
  assert.equal(Number((await call(db, '1795421829.1642106')).picked_up), 1);
});

test('the gate: the token AND TeleGroup\'s address; either missing refuses; no secret configured refuses everything', () => {
  const url = (t) => new URL('http://x/api/inbound/phone-event' + (t == null ? '' : '?token=' + encodeURIComponent(t)));
  const req = (ip) => ({ headers: { 'x-real-ip': ip }, socket: { remoteAddress: '10.0.0.1' } });
  const V = { VERCEL: '1', PHONE_EVENT_SECRET: SECRET };
  assert.deepEqual(TELEGROUP_IPS, ['193.110.8.106']);
  assert.equal(phoneEventGate(req('193.110.8.106'), url(SECRET), V).ok, true);
  assert.equal(phoneEventGate(req('193.110.8.106'), url('wrong'), V).status, 401);
  assert.equal(phoneEventGate(req('193.110.8.106'), url(null), V).status, 401);
  assert.equal(phoneEventGate(req('193.110.8.107'), url(SECRET), V).status, 403, 'the right token from another address');
  assert.equal(phoneEventGate(req('193.110.8.106'), url(SECRET), { VERCEL: '1' }).status, 503, 'fails closed');
  assert.equal(phoneEventGate(req('193.110.8.106'), url(''), { VERCEL: '1', PHONE_EVENT_SECRET: '' }).status, 503);
  // on Vercel the extra local addresses are ignored, and the address is the platform's header, not the socket
  assert.equal(phoneEventGate(req('127.0.0.1'), url(SECRET), { ...V, PHONE_EVENT_LOCAL_IPS: '127.0.0.1' }).status, 403);
  assert.equal(sourceIp({ headers: { 'x-forwarded-for': '193.110.8.106, 10.1.1.1' } }, { VERCEL: '1' }), '193.110.8.106');
  assert.equal(sourceIp({ headers: { 'x-real-ip': '193.110.8.106' }, socket: { remoteAddress: '::ffff:127.0.0.1' } }, {}), '127.0.0.1', 'off Vercel: the socket, never a header');
  assert.equal(redactToken('POST /api/inbound/phone-event?token=abc123&x=1'), 'POST /api/inbound/phone-event?token=[redacted]&x=1');
});

// ------------------------------------------------------------------- the route --
function start(env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], { env: { ...process.env,
      PORT: '0', CRM_DB: ':memory:', DATASET: 'empty', CRM_AUTH: '1', CRM_SESSION_SECRET: crypto.randomBytes(32).toString('hex'),
      CRM_INSECURE_COOKIE: '1', CRM_PUBLIC: '', DATABASE_URL: '', DATABASE_URL_UNPOOLED: '', CRM_DB_DATABASE_URL_UNPOOLED: '',
      APP_ORIGIN: '', PHONE_EVENT_SECRET: SECRET, CHANNEL_MODE_PHONE: 'live', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const look = (d) => { out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, base: `http://127.0.0.1:${m[1]}`, log: () => out }); };
    child.stdout.on('data', look); child.stderr.on('data', look);
    child.on('exit', () => reject(new Error(out)));
  });
}
const send = (s, body, token = SECRET) => fetch(s.base + '/api/inbound/phone-event' + (token == null ? '' : '?token=' + token),
  { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));

test('the route, sign-in ON: ?token= from an allowed address is stored; unknown type is a 200; the token never reaches the log', async (t) => {
  const s = await start({ PHONE_EVENT_LOCAL_IPS: '127.0.0.1' });
  t.after(() => s.child.kill());
  for (const e of ANSWERED) assert.equal((await send(s, e)).status, 200, e.type);
  assert.equal((await send(s, { ...ANSWERED[0], type: 'something_new' })).status, 200, 'unknown type: 200, ignored');
  assert.equal((await send(s, ANSWERED[0], 'wrong')).status, 401);
  assert.equal((await send(s, ANSWERED[0], null)).status, 401);
  assert.ok(!s.log().includes(SECRET), 'the token is never written to the log');
});

test('the route: the right token from an address that is not TeleGroup\'s is refused (403), before anything is stored', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  const r = await send(s, ANSWERED[0]);
  assert.equal(r.status, 403);
  assert.equal(r.body.error, 'not from the phone system');
});
