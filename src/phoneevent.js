// CALL EVENTS PUSHED BY THE PHONE SYSTEM (Q6, 04.10.2026; TeleGroup's real format 23.11.2026).
//
// TeleGroup POSTs one JSON event per request to
//
//   POST /api/inbound/phone-event?token=<PHONE_EVENT_SECRET>      from 193.110.8.106 only
//
// (their spec "Telephony call events webhook" v1.0, 23.11.2026: no custom headers, no retries, answer 2xx in under 1 s,
// unknown types and fields ignored). Both the token AND the source address are required; a missing secret refuses
// everything (phoneEventGate below). The token is never written to a log.
//
// THEIR EVENTS, ONE CALL PER CALL ID (uniqueid):
//   join_queue      the caller entered a queue (carries `queue`)        -> ringing
//   dial_ringing    an agent's phone rings, once per agent and attempt  -> ringing (the first one counts)
//   dial_connected  an agent answered (destination_name = who)          -> answered
//   status_hangup   the call ended (extraParams.holdtime / talktime)    -> ended
//   missed          an incoming call ended unanswered (carries `queue`) -> ended, not answered
// `date` is Europe/Riga wall-clock. A filled caller_sip is an OUTGOING call by that agent: ignored, as the pull did.
// A call is OURS only through a college queue (lib/pbx.js QUEUES): only join_queue and missed name a queue, so the
// other events of a call are kept only once its college queue is known; any other division's call is never stored.
//
// EACH EVENT IS STORED ONCE: call id + event is unique, so a repeat (theirs or ours) is not a second row.
//
// THE CALL ITSELF is stored when it ENDS, by storeCall() - the very function the daily pull uses, keyed on the same
// call id. Whichever path sees the call first stores it; the other finds it in pbx_calls and skips it.
//
// The older generic shape (call_id / event: ringing|answered|ended, header x-crm-secret) still reads, for the
// console's simulated calls.

import crypto from 'node:crypto';
import { BadInbound } from './inbound.js';
import { storeCall } from './sync.js';
import { QUEUES, PBX_ZONE } from '../lib/pbx.js';
import { fromRigaStamp, ZONE } from '../lib/riga.js';
import { knock } from './webpush.js';

export const PHONE_EVENT_SECRET_ENV = 'PHONE_EVENT_SECRET';
export const EVENTS = ['ringing', 'answered', 'ended'];
// the one address TeleGroup sends from (their spec, section 2)
export const TELEGROUP_IPS = Object.freeze(['193.110.8.106']);
// TeleGroup's event types, in our three words
export const TELEGROUP_TYPES = Object.freeze({
  join_queue: 'ringing', dial_ringing: 'ringing', dial_connected: 'answered', status_hangup: 'ended', missed: 'ended',
});

// ---------------------------------------------------------------- the gate --
// Where the request came from. On Vercel the platform sets x-real-ip (a caller cannot set it); anywhere else the
// socket's own address. A local run may name extra addresses in PHONE_EVENT_LOCAL_IPS (tests); on Vercel it is ignored.
export function sourceIp(req, env = process.env) {
  const h = (req && req.headers) || {};
  const raw = env.VERCEL
    ? String(h['x-real-ip'] || String(h['x-forwarded-for'] || '').split(',')[0] || '')
    : String((req && req.socket && req.socket.remoteAddress) || '');
  return raw.trim().replace(/^::ffff:/, '');
}
const same = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
};
/** Both the secret (?token=, or the older x-crm-secret header) AND a known source address. Fails closed. */
export function phoneEventGate(req, url, env = process.env) {
  const want = String(env[PHONE_EVENT_SECRET_ENV] || '');
  if (!want) return { ok: false, status: 503, error: 'phone events are not configured here', missing: PHONE_EVENT_SECRET_ENV };
  const got = (url && url.searchParams.get('token')) || String((req.headers || {})['x-crm-secret'] || '');
  if (!same(want, got)) return { ok: false, status: 401, error: 'shared secret did not match' };
  const allowed = [...TELEGROUP_IPS, ...(env.VERCEL ? [] : String(env.PHONE_EVENT_LOCAL_IPS || '').split(',').map((s) => s.trim()).filter(Boolean))];
  if (!allowed.includes(sourceIp(req, env))) return { ok: false, status: 403, error: 'not from the phone system' };
  return { ok: true };
}
/** A request line as it may be logged: never the token. */
export const redactToken = (s) => String(s || '').replace(/([?&]token=)[^&#\s]*/gi, '$1[redacted]');

// ------------------------------------------------------------ the adapter --
const EVENT_WORDS = {
  ringing: 'ringing', ring: 'ringing', ringing_start: 'ringing', incoming: 'ringing', new: 'ringing',
  answered: 'answered', answer: 'answered', connected: 'answered', pickup: 'answered',
  ended: 'ended', end: 'ended', hangup: 'ended', hang_up: 'ended', completed: 'ended', missed: 'ended', noanswer: 'ended',
};
const first = (raw, ...names) => {
  for (const n of names) if (raw[n] !== undefined && raw[n] !== null && raw[n] !== '') return raw[n];
  return null;
};
const str = (v) => (v === undefined || v === null || v === '' ? null : String(v));
const secs = (v) => { const n = Number(v); return v === undefined || v === null || v === '' || !Number.isFinite(n) || n < 0 ? null : Math.round(n); };
function when(v, zone = PBX_ZONE) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' || /^\d{9,13}$/.test(String(v))) {
    const n = Number(v);
    return new Date(n < 1e12 ? n * 1000 : n).toISOString();
  }
  // a wall-clock time without a zone: TeleGroup's push writes Riga time; their call list (the pull) UTC (PBX_ZONE)
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(String(v).trim())) return fromRigaStamp(String(v), zone).toISOString();
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}
export const isTeleGroup = (raw) => Boolean(raw && typeof raw === 'object' && typeof raw.type === 'string' && raw.uniqueid !== undefined && raw.date !== undefined);

export function adaptPhoneEvent(raw, { now = new Date() } = {}) {
  if (!raw || typeof raw !== 'object') throw new BadInbound('phone-event: the body is not an object');
  if (isTeleGroup(raw)) {
    const type = String(raw.type).trim().toLowerCase();
    const event = TELEGROUP_TYPES[type];
    if (!event) return { ignore: `unknown event type "${type}"` };
    if (!str(raw.uniqueid)) throw new BadInbound('phone-event: no uniqueid, so this event cannot be grouped');
    if (str(raw.caller_sip)) return { ignore: 'an outgoing call' };
    const x = raw.extraParams && typeof raw.extraParams === 'object' ? raw.extraParams : {};
    return {
      tg: true, type, callId: String(raw.uniqueid), event,
      at: when(raw.date, ZONE) || now.toISOString(),
      queue: str(raw.queue),
      callerNum: str(raw.caller_num),
      operator: str(raw.destination_name),
      extension: str(raw.destination_num),
      answered: type === 'missed' ? false : null,
      holdSec: secs(x.holdtime), talkSec: secs(x.talktime),
    };
  }
  const callId = first(raw, 'call_id', 'callId', 'uniqueid', 'unique_id', 'linkedid');
  if (!callId) throw new BadInbound('phone-event: no call_id, so this event cannot be deduplicated');
  const word = String(first(raw, 'event', 'type', 'state', 'status') || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const event = EVENT_WORDS[word];
  if (!event) return { ignore: `unknown event "${word || '(none)'}"` };
  const answeredFlag = first(raw, 'answered', 'picked_up');
  return {
    callId: String(callId),
    event,
    at: when(first(raw, 'at', 'time', 'timestamp', 'created_at')) || now.toISOString(),
    queue: str(first(raw, 'queue')),
    callerNum: str(first(raw, 'caller', 'caller_num', 'from', 'number')),
    operator: str(first(raw, 'operator', 'operator_name', 'agent')),
    extension: str(first(raw, 'extension', 'ext')),
    // on "ended", whether it was ever picked up, when the phone system says so itself
    answered: answeredFlag === null ? null : ['1', 'true', 'yes', 'answer'].includes(String(answeredFlag).toLowerCase()),
    holdSec: null, talkSec: null,
  };
}

// ---------------------------------------------------------- one event in --
// `later` (the route passes the platform's waitUntil) takes the work after the store - the browser knock and, on
// "ended", the call itself - so the phone system has its answer at once. Without it the work is awaited here.
export async function receivePhoneEvent(db, raw, { mode = 'test', now = new Date(), later = null } = {}) {
  const ev = adaptPhoneEvent(raw, { now });
  if (ev.ignore) return { ok: true, ignored: ev.ignore };
  // only the three college queues are ours
  if (ev.queue && !QUEUES.includes(ev.queue)) return { ok: true, ignored: 'not a college queue', event: ev.event };
  if (ev.tg && !ev.queue) {
    // TeleGroup names the queue only on join_queue and missed: an event without one belongs to us only when this call
    // already entered a college queue
    const known = await db.prepare(`SELECT queue FROM call_events WHERE call_id = ? AND queue IN (${QUEUES.map(() => '?').join(',')}) ORDER BY id LIMIT 1`)
      .get(ev.callId, ...QUEUES);
    if (!known) return { ok: true, ignored: 'no college queue for this call', event: ev.event };
    ev.queue = known.queue;
  }
  const at = now.toISOString();
  const source = mode === 'live' ? 'provider' : 'simulated';
  try {
    await db.prepare(`INSERT INTO call_events (call_id, event, at, queue, caller_num, operator, extension, source, received_at, hold_sec, talk_sec)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(ev.callId, ev.event, ev.at, ev.queue, ev.callerNum, ev.operator, ev.extension, source, at, ev.holdSec, ev.talkSec);
  } catch (err) {
    if (!/UNIQUE|duplicate key|unique constraint/i.test(String(err && err.message))) throw err;
    return { ok: true, duplicate: true, event: ev.event, callId: ev.callId };
  }
  const work = async () => {
    // knock on the browsers that should hear about it (src/webpush.js); never fails the store
    const pushed = await knock(db, { event: ev.event, operator: ev.operator, queue: ev.queue, callerNum: ev.callerNum });
    const call = ev.event === 'ended' ? await settleCall(db, ev, mode, at) : null;
    return { pushed, call };
  };
  if (typeof later === 'function') {
    later(work().catch((err) => console.error(`phone-event ${ev.event}: ${err && err.message ? err.message : err}`)));
    return { ok: true, stored: true, event: ev.event, callId: ev.callId, later: true };
  }
  const done = await work();
  return { ok: true, stored: true, event: ev.event, callId: ev.callId, ...done };
}

// The call, as the daily pull would have stored it: when it started ringing, whether anybody picked up and who, how
// long the caller waited (duration - talk, as the pull's duration/duration_talk) and talked. A call the pull already
// stored is skipped by storeCall itself.
async function settleCall(db, ev, mode, at) {
  const all = await db.prepare('SELECT event, at, queue, caller_num, operator, hold_sec, talk_sec FROM call_events WHERE call_id = ? ORDER BY id').all(ev.callId);
  const ring = all.find((x) => x.event === 'ringing');
  const ans = all.find((x) => x.event === 'answered');
  const queue = ev.queue || (all.find((x) => QUEUES.includes(x.queue)) || {}).queue || (ev.tg ? null : QUEUES[0]);
  if (!queue) return { ignored: 'no college queue for this call' };
  const pickedUp = ev.answered === null ? Boolean(ans) : ev.answered;
  const start = (ring && ring.at) || ev.at;
  let duration = null, talk = ev.talkSec;
  if (ev.holdSec != null || ev.talkSec != null) duration = (ev.holdSec || 0) + (ev.talkSec || 0);
  else if (ev.tg) duration = Math.max(0, Math.round((Date.parse(ev.at) - Date.parse(start)) / 1000));
  if (talk == null && ev.tg && !pickedUp) talk = 0;
  const row = {
    uniqueid: ev.callId,
    created_at: start,
    queue,
    caller_num: ev.callerNum || (ring && ring.caller_num) || (ans && ans.caller_num) || null,
    picked_up: pickedUp,
    // TeleGroup's hangup names the last agent rung even when nobody answered: only an answered call has an operator
    operator_name: (ans && ans.operator) || (!ev.tg || pickedUp ? ev.operator : null) || null,
    duration_sec: duration, talk_sec: talk,
  };
  const out = { seen: 0, logged: 0, inbox: 0, again: 0, filtered: 0, noNumber: 0 };
  await storeCall(db, row, mode, at, out);
  return { ...out, pickedUp: row.picked_up };
}
