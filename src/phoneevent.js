// CALL EVENTS PUSHED BY THE PHONE SYSTEM (Q6, 04.10.2026).
//
// Ritvars, 04.10: "Build everything for calls as if they notify us on each call." So TeleGroup
// is treated as a provider that POSTs to us when a call RINGS, is ANSWERED and ENDS:
//
//   POST /api/inbound/phone-event      header x-crm-secret: <PHONE_EVENT_SECRET>
//
// TELEGROUP'S REAL FORMAT IS NOT KNOWN. Everything below `adaptPhoneEvent` speaks OUR field names
// (docs/channel-writeups/phone-events.md is the shape we will ask them for). adaptPhoneEvent is the
// one place that changes when their format is known, and it already accepts the names their call
// LIST uses today (uniqueid, caller_num, operator_name, created_at as Riga wall-clock).
//
// EACH EVENT IS STORED ONCE: call id + event is unique, so a retry is a repeat, not a second row.
//
// THE CALL ITSELF is stored when it ENDS, by storeCall() - the very function the daily pull uses,
// keyed on the same call id (TeleGroup's uniqueid). Whichever path sees the call first stores it;
// the other finds it in pbx_calls and skips it. So the daily pull stays as the safety net (a lost
// "ended" event is caught next morning) and the two can never make two leads for one call.

import { BadInbound } from './inbound.js';
import { storeCall } from './sync.js';
import { QUEUES } from '../lib/pbx.js';
import { fromRigaStamp } from '../lib/riga.js';

export const PHONE_EVENT_SECRET_ENV = 'PHONE_EVENT_SECRET';
export const EVENTS = ['ringing', 'answered', 'ended'];

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
function when(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' || /^\d{9,13}$/.test(String(v))) {
    const n = Number(v);
    return new Date(n < 1e12 ? n * 1000 : n).toISOString();
  }
  // their call list writes Riga wall-clock without a zone: read it as Riga, never as UTC
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(String(v).trim())) return fromRigaStamp(String(v)).toISOString();
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export function adaptPhoneEvent(raw, { now = new Date() } = {}) {
  if (!raw || typeof raw !== 'object') throw new BadInbound('phone-event: the body is not an object');
  const callId = first(raw, 'call_id', 'callId', 'uniqueid', 'unique_id', 'linkedid');
  if (!callId) throw new BadInbound('phone-event: no call_id, so this event cannot be deduplicated');
  const word = String(first(raw, 'event', 'type', 'state', 'status') || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const event = EVENT_WORDS[word];
  if (!event) throw new BadInbound(`phone-event: unknown event "${word || '(none)'}"; expected ringing, answered or ended`);
  const answeredFlag = first(raw, 'answered', 'picked_up');
  return {
    callId: String(callId),
    event,
    at: when(first(raw, 'at', 'time', 'timestamp', 'created_at')) || now.toISOString(),
    queue: first(raw, 'queue') != null ? String(first(raw, 'queue')) : null,
    callerNum: first(raw, 'caller', 'caller_num', 'from', 'number') != null ? String(first(raw, 'caller', 'caller_num', 'from', 'number')) : null,
    operator: first(raw, 'operator', 'operator_name', 'agent') != null ? String(first(raw, 'operator', 'operator_name', 'agent')) : null,
    extension: first(raw, 'extension', 'ext') != null ? String(first(raw, 'extension', 'ext')) : null,
    // on "ended", whether it was ever picked up, when the phone system says so itself
    answered: answeredFlag === null ? null : ['1', 'true', 'yes', 'answer'].includes(String(answeredFlag).toLowerCase()),
  };
}

// ---------------------------------------------------------- one event in --
export async function receivePhoneEvent(db, raw, { mode = 'test', now = new Date() } = {}) {
  const ev = adaptPhoneEvent(raw, { now });
  // the same filter as the daily pull: only the three college queues are ours
  if (ev.queue && !QUEUES.includes(ev.queue)) return { ok: true, ignored: 'not a college queue', event: ev.event };
  const at = now.toISOString();
  const source = mode === 'live' ? 'provider' : 'simulated';
  try {
    await db.prepare(`INSERT INTO call_events (call_id, event, at, queue, caller_num, operator, extension, source, received_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(ev.callId, ev.event, ev.at, ev.queue, ev.callerNum, ev.operator, ev.extension, source, at);
  } catch (err) {
    if (!/UNIQUE|duplicate key|unique constraint/i.test(String(err && err.message))) throw err;
    return { ok: true, duplicate: true, event: ev.event, callId: ev.callId };
  }
  let call = null;
  if (ev.event === 'ended') call = await settleCall(db, ev, mode, at);
  return { ok: true, stored: true, event: ev.event, callId: ev.callId, call };
}

// The call, as the daily pull would have stored it: when it started ringing, whether anybody
// picked up and who. A call the pull already stored is skipped by storeCall itself.
async function settleCall(db, ev, mode, at) {
  const all = await db.prepare('SELECT event, at, queue, caller_num, operator FROM call_events WHERE call_id = ? ORDER BY id').all(ev.callId);
  const ring = all.find((x) => x.event === 'ringing');
  const ans = all.find((x) => x.event === 'answered');
  const row = {
    uniqueid: ev.callId,
    created_at: (ring && ring.at) || ev.at,
    queue: ev.queue || (ring && ring.queue) || (ans && ans.queue) || QUEUES[0],
    caller_num: ev.callerNum || (ring && ring.caller_num) || (ans && ans.caller_num) || null,
    picked_up: ev.answered === null ? Boolean(ans) : ev.answered,
    operator_name: (ans && ans.operator) || ev.operator || null,
  };
  const out = { seen: 0, logged: 0, inbox: 0, again: 0, filtered: 0, noNumber: 0 };
  await storeCall(db, row, mode, at, out);
  return { ...out, pickedUp: row.picked_up };
}
