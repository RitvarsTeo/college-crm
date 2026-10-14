// The PBX incoming-call logger: the parts that can be tested without a network.
//
// SCOPE. This fetches, filters and maps calls, and nothing else. Storing them,
// matching the caller to a person and raising an Inbox item happen in
// src/sync.js, in the CRM's own database. No recordings, no transcription.
//
// THE TOKEN. It is read from process.env.PBX_API_TOKEN, it goes in the query
// string because that is the only authentication this API accepts, and it is
// never returned, logged, thrown or put in an error message. `redact()` below
// exists so that a failure that quotes a URL cannot leak it, and a test asserts
// that.

import { pollWindow, fromRigaStamp, toRigaStamp, ZONE } from './riga.js';

export const PBX_URL = 'https://novikontas.tg.lv/api/crm/pbx/calls/list/';

// THE PBX SPEAKS UTC, NOT RIGA (14.10.2026). A test call made at 09:59 Riga came back as created_at 06:59, and
// across all 71 stored calls the smallest gap between the stated call time and the moment Intake stored it was
// 183 minutes - never under the 3-hour summer offset. Reading the stamps as Riga put every call 3 hours early and
// sent every short pull window 3 hours into the future, so only the 48-hour sweep ever found a call. Both
// directions - the window we ask for and every created_at we read - are UTC. Riga stays for what people read.
export const PBX_ZONE = 'UTC';
export const WINDOW_MINUTES = 15;

// The three queues the college actually answers. Anything else is not ours.
export const QUEUES = ['1001*Q-ADMISSION', '1001*Q-COORDINATORS', '1001*Q-OTHER'];

const TOKEN_ENV = 'PBX_API_TOKEN';

// Never print a token, in any shape, from anywhere.
export function redact(text, token = process.env[TOKEN_ENV]) {
  let out = String(text ?? '');
  if (token) out = out.split(token).join('[redacted]');
  // and belt-and-braces: any token= in a url, whatever its value
  return out.replace(/([?&]token=)[^&\s]*/gi, '$1[redacted]');
}

// Named, never valued: a misconfiguration says which variable is missing and
// prints nothing that is present.
export function requiredEnv(name, env = process.env) {
  const value = env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

// ------------------------------------------------------------- the filter --
export const isOurs = (call) => Boolean(call)
  && call.destination === 'incoming'
  && QUEUES.includes(call.queue);

// ------------------------------------------------------------ the length --
// THE CALL'S LENGTH (14.10.2026, Ritvars: "WE need the length also"). TeleGroup sends `duration` (the whole call,
// ringing and queue included) and `duration_talk` (the talk time); their format was not yet seen, so both are read
// defensively: a number or a digit string is seconds, "MM:SS" or "H:MM:SS" is turned into seconds, and anything
// else - empty, negative, text, longer than a day - is null, never a guess. TeleGroup lists a call only when it
// ends, so the value is final when it is first read.
export const MAX_CALL_SECONDS = 24 * 3600;
export function toSeconds(value) {
  let sec = null;
  if (typeof value === 'number') sec = Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
  else if (typeof value === 'string') {
    const s = value.trim();
    let m;
    if (/^\d+$/.test(s)) sec = Number(s);
    else if ((m = /^(\d+):([0-5]\d)$/.exec(s))) sec = Number(m[1]) * 60 + Number(m[2]);
    else if ((m = /^(\d+):([0-5]\d):([0-5]\d)$/.exec(s))) sec = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  }
  return sec !== null && sec <= MAX_CALL_SECONDS ? sec : null;
}

// --------------------------------------------------------------- the map --
// Eight fields, exactly: the six the logger started with, plus the call's length in seconds (14.10.2026) -
// duration_sec from `duration`, talk_sec from `duration_talk`, each null when unreadable. Nothing else
// TeleGroup sends is kept: never the recording. `state === 'ANSWER'` is the only thing that counts as
// picked up; everything else, including a missing state, is a missed call.
export function toRow(call, zone = PBX_ZONE) {
  if (!call || !call.uniqueid) throw new TypeError('toRow: a call needs a uniqueid');
  if (!call.created_at) throw new TypeError(`toRow: ${call.uniqueid} has no created_at`);
  return {
    uniqueid: String(call.uniqueid),
    // the PBX writes UTC wall-clock (PBX_ZONE); the column holds an instant, so
    // the crossing is made explicitly here and nowhere else
    created_at: fromRigaStamp(call.created_at, zone).toISOString(),
    queue: String(call.queue),
    caller_num: call.caller_num ? String(call.caller_num) : null,
    picked_up: call.state === 'ANSWER',
    operator_name: call.operator_name ? String(call.operator_name) : null,
    duration_sec: toSeconds(call.duration),
    talk_sec: toSeconds(call.duration_talk),
  };
}

// The whole transformation, in one place: filter, map, and drop an exact repeat
// inside the same batch so the upsert is never handed two rows with one key.
export function rowsFrom(calls, zone = PBX_ZONE) {
  const kept = [];
  const seen = new Set();
  const skipped = { notIncoming: 0, otherQueue: 0, unusable: 0, duplicateInBatch: 0 };
  // HOW MANY OF EACH destination the list returned (07.10.2026): counts only, the cheapest proof of whether TeleGroup
  // lists OUTGOING calls (a callback), which first-reply time would need. A value is cut to 24 characters.
  const destinations = {};
  for (const call of Array.isArray(calls) ? calls : []) {
    const d = String((call && call.destination) || 'none').slice(0, 24);
    destinations[d] = (destinations[d] || 0) + 1;
    if (!call || call.destination !== 'incoming') { skipped.notIncoming++; continue; }
    if (!QUEUES.includes(call.queue)) { skipped.otherQueue++; continue; }
    let row;
    try { row = toRow(call, zone); } catch { skipped.unusable++; continue; }
    if (seen.has(row.uniqueid)) { skipped.duplicateInBatch++; continue; }
    seen.add(row.uniqueid);
    kept.push(row);
  }
  return { rows: kept, skipped, destinations };
}

// ------------------------------------------------------------- the fetch --
// A short window only. A wide range makes this API answer 500 with an empty
// body, so the window is a parameter with a small default and the caller has to
// go out of its way to ask for more.
export function buildRequest({ now = new Date(), minutes = WINDOW_MINUTES, env = process.env } = {}) {
  const token = requiredEnv(TOKEN_ENV, env);
  const w = pollWindow(minutes, now, PBX_ZONE);
  const url = new URL(PBX_URL);
  url.searchParams.set('token', token);
  url.searchParams.set('dateFrom', w.dateFrom);
  url.searchParams.set('dateTo', w.dateTo);
  return {
    url: url.toString(),
    // safe to log, and the only version anything is allowed to print
    safeUrl: `${PBX_URL}?token=[redacted]&dateFrom=${encodeURIComponent(w.dateFrom)}&dateTo=${encodeURIComponent(w.dateTo)}`,
    window: w,
  };
}

export async function fetchCalls({ now = new Date(), minutes = WINDOW_MINUTES,
  env = process.env, fetchImpl = fetch } = {}) {
  const req = buildRequest({ now, minutes, env });
  let res;
  try {
    res = await fetchImpl(req.url, { method: 'GET', headers: { accept: 'application/json' } });
  } catch (err) {
    throw new Error(`PBX request failed: ${redact(err && err.message, env[TOKEN_ENV])}`);
  }
  if (!res.ok) {
    let body = '';
    try { body = await res.text(); } catch { body = ''; }
    const err = new Error(`PBX returned ${res.status}: ${redact(body, env[TOKEN_ENV]).slice(0, 200)}`);
    err.status = res.status;
    // Q92: "slow down" from TeleGroup (429). Retry-After in seconds when it says one; read, never trusted past an hour.
    const after = Number(res.headers && res.headers.get && res.headers.get('retry-after'));
    if (Number.isFinite(after) && after > 0) err.retryAfterSec = Math.min(after, 3600);
    throw err;
  }
  let data;
  try { data = await res.json(); } catch {
    throw new Error('PBX returned a body that is not JSON');
  }
  if (!Array.isArray(data)) throw new Error('PBX returned something that is not a list of calls');
  return { calls: data, window: req.window, safeUrl: req.safeUrl };
}

// ---------------------------------------------------------- the cron gate --
// The route is a public URL, so it is guarded by a shared secret Vercel sends
// as a bearer token. A missing CRON_SECRET is a refusal, not an open door.
// A JSON answer in plain Node. Vercel's current Node runtime does not add Express's
// res.status() and res.json() to these functions, so every request to either cron
// route crashed with "res.status is not a function" - before the secret was even
// checked (found 28.09.2026 in the production log). The tests had passed because they
// handed the handler a fake response that had both methods.
export function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

export function authoriseCron(headerValue, env = process.env) {
  const secret = env.CRON_SECRET;
  if (!secret) return { ok: false, status: 500, error: 'Missing required environment variable CRON_SECRET' };
  const given = String(headerValue || '');
  if (!given.startsWith('Bearer ')) return { ok: false, status: 401, error: 'Unauthorized' };
  const token = given.slice(7);
  if (token.length !== secret.length) return { ok: false, status: 401, error: 'Unauthorized' };
  // constant time, so a wrong secret cannot be found one character at a time
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= token.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0 ? { ok: true } : { ok: false, status: 401, error: 'Unauthorized' };
}

// ------------------------------------------------ the live test (30.09.2026) --
// Ritvars' question: does the call list show a call while it RINGS and while it is ANSWERED, or only
// after it ends? The last 2 minutes, and per call only what answers that. Never the token; the
// caller's number cut to its last 4 digits.
export const LIVE_MINUTES = 2;
export async function pbxLive({ env = process.env, now = new Date(), fetchImpl = fetch } = {}) {
  const fetchedAt = now.toISOString();
  try {
    const got = await fetchCalls({ now, minutes: LIVE_MINUTES, env, fetchImpl });
    const calls = got.calls.map((c) => ({
      uniqueid: c.uniqueid ?? null, created_at: c.created_at ?? null, queue: c.queue ?? null,
      state: c.state ?? null, operator_name: c.operator_name ?? null,
      caller_last4: String(c.caller_num || '').replace(/\D/g, '').slice(-4) || null,
    }));
    return { ok: true, fetchedAt, minutes: LIVE_MINUTES, from: got.window.dateFrom, to: got.window.dateTo, count: calls.length, calls };
  } catch (err) {
    return { ok: false, fetchedAt, minutes: LIVE_MINUTES, error: redact(err && err.message ? err.message : 'the PBX call failed', env[TOKEN_ENV]) };
  }
}

export { ZONE, toRigaStamp, fromRigaStamp, pollWindow };
