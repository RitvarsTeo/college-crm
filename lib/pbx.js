// The PBX incoming-call logger: the parts that can be tested without a network.
//
// SCOPE. This collects structured incoming-call rows and nothing else. No call
// UI, no notifications, no person matching, no CRM activity, no lead creation,
// no recordings, no transcription, no dashboard. Something later can read the
// table; this file only fills it honestly.
//
// THE TOKEN. It is read from process.env.PBX_API_TOKEN, it goes in the query
// string because that is the only authentication this API accepts, and it is
// never returned, logged, thrown or put in an error message. `redact()` below
// exists so that a failure that quotes a URL cannot leak it, and a test asserts
// that.

import { pollWindow, fromRigaStamp, toRigaStamp, ZONE } from './riga.js';

export const PBX_URL = 'https://novikontas.tg.lv/api/crm/pbx/calls/list/';
export const WINDOW_MINUTES = 15;

// The three queues the college actually answers. Anything else is not ours.
export const QUEUES = ['1001*Q-ADMISSION', '1001*Q-COORDINATORS', '1001*Q-OTHER'];
export const TABLE = 'pbx_incoming_calls';

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

// --------------------------------------------------------------- the map --
// Seven fields, exactly. `state === 'ANSWER'` is the only thing that counts as
// picked up; everything else, including a missing state, is a missed call.
export function toRow(call, zone = ZONE) {
  if (!call || !call.uniqueid) throw new TypeError('toRow: a call needs a uniqueid');
  if (!call.created_at) throw new TypeError(`toRow: ${call.uniqueid} has no created_at`);
  return {
    uniqueid: String(call.uniqueid),
    // the PBX writes Riga wall-clock; the column is timestamptz, so the crossing
    // is made explicitly here and nowhere else
    created_at: fromRigaStamp(call.created_at, zone).toISOString(),
    queue: String(call.queue),
    caller_num: call.caller_num ? String(call.caller_num) : null,
    picked_up: call.state === 'ANSWER',
    operator_name: call.operator_name ? String(call.operator_name) : null,
  };
}

// The whole transformation, in one place: filter, map, and drop an exact repeat
// inside the same batch so the upsert is never handed two rows with one key.
export function rowsFrom(calls, zone = ZONE) {
  const kept = [];
  const seen = new Set();
  const skipped = { notIncoming: 0, otherQueue: 0, unusable: 0, duplicateInBatch: 0 };
  for (const call of Array.isArray(calls) ? calls : []) {
    if (!call || call.destination !== 'incoming') { skipped.notIncoming++; continue; }
    if (!QUEUES.includes(call.queue)) { skipped.otherQueue++; continue; }
    let row;
    try { row = toRow(call, zone); } catch { skipped.unusable++; continue; }
    if (seen.has(row.uniqueid)) { skipped.duplicateInBatch++; continue; }
    seen.add(row.uniqueid);
    kept.push(row);
  }
  return { rows: kept, skipped };
}

// ------------------------------------------------------------- the fetch --
// A short window only. A wide range makes this API answer 500 with an empty
// body, so the window is a parameter with a small default and the caller has to
// go out of its way to ask for more.
export function buildRequest({ now = new Date(), minutes = WINDOW_MINUTES, env = process.env } = {}) {
  const token = requiredEnv(TOKEN_ENV, env);
  const w = pollWindow(minutes, now);
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
    throw new Error(`PBX returned ${res.status}: ${redact(body, env[TOKEN_ENV]).slice(0, 200)}`);
  }
  let data;
  try { data = await res.json(); } catch {
    throw new Error('PBX returned a body that is not JSON');
  }
  if (!Array.isArray(data)) throw new Error('PBX returned something that is not a list of calls');
  return { calls: data, window: req.window, safeUrl: req.safeUrl };
}

// ------------------------------------------------------------ the upsert --
// PostgREST, the same thin client the other Novikontas hubs use, rather than a
// new SDK dependency for one table. `Prefer: resolution=merge-duplicates` with
// `on_conflict` IS the upsert, and it is required because the 15-minute windows
// overlap on purpose.
export function supabaseConfig(env = process.env) {
  const url = requiredEnv('SUPABASE_URL', env).replace(/\/+$/, '');
  // The org convention is SUPABASE_SERVICE_KEY; the brief named
  // SUPABASE_SERVICE_ROLE_KEY. Accept either rather than demand a second
  // variable holding the same secret.
  const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Missing required environment variable SUPABASE_SERVICE_KEY');
  return { url, key };
}

export async function upsertRows(rows, { env = process.env, fetchImpl = fetch } = {}) {
  if (!rows.length) return { upserted: 0 };
  const { url, key } = supabaseConfig(env);
  const res = await fetchImpl(`${url}/rest/v1/${TABLE}?on_conflict=uniqueid`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    let body = '';
    try { body = await res.text(); } catch { body = ''; }
    throw new Error(`Supabase upsert returned ${res.status}: ${String(body).slice(0, 200)}`);
  }
  return { upserted: rows.length };
}

// ------------------------------------------------------------- one poll ---
export async function runPoll({ now = new Date(), minutes = WINDOW_MINUTES,
  env = process.env, fetchImpl = fetch } = {}) {
  const { calls, window, safeUrl } = await fetchCalls({ now, minutes, env, fetchImpl });
  const { rows, skipped } = rowsFrom(calls);
  const { upserted } = await upsertRows(rows, { env, fetchImpl });
  return {
    ok: true,
    window: { from: window.dateFrom, to: window.dateTo, zone: window.zone, minutes: window.minutes },
    fetched: calls.length,
    kept: rows.length,
    upserted,
    skipped,
    safeUrl,
  };
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

export { ZONE, toRigaStamp, fromRigaStamp, pollWindow };
