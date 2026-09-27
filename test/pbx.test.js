// The PBX incoming-call logger.
//
// NOTHING HERE TOUCHES THE REAL API AND NOTHING HERE NEEDS THE REAL TOKEN. Every
// test injects a fake token and a fake fetch, so the suite runs on any machine,
// in any timezone, with no secret configured.
//
// The timezone tests deliberately assert Europe/Riga behaviour rather than the
// machine's own zone, and cover both EET (+02:00) and EEST (+03:00) plus the two
// Sundays the clocks move.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  QUEUES, TABLE, PBX_URL, WINDOW_MINUTES,
  isOurs, toRow, rowsFrom, buildRequest, fetchCalls, upsertRows, runPoll,
  authoriseCron, redact, requiredEnv, supabaseConfig,
} from '../lib/pbx.js';
import { toRigaStamp, fromRigaStamp, offsetMinutesAt, pollWindow, ZONE } from '../lib/riga.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// A token shape that is obviously fake and could never be the real one.
const FAKE_TOKEN = 'test-token-not-a-real-secret-0000';
const ENV = {
  PBX_API_TOKEN: FAKE_TOKEN,
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_KEY: 'fake-service-key',
  CRON_SECRET: 'fake-cron-secret',
};

const call = (over = {}) => ({
  uniqueid: '1700000000.1',
  destination: 'incoming',
  queue: '1001*Q-ADMISSION',
  caller_num: '+37129111222',
  state: 'ANSWER',
  operator_name: 'Ieva',
  created_at: '2026-09-23 14:05:00',
  ...over,
});

const okFetch = (payload, status = 200) => async () => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => payload,
  text: async () => JSON.stringify(payload),
});

// ======================================================= 1-4. the filter ====

test('1. an incoming call on one of our queues is accepted', async () => {
  assert.equal(isOurs(call()), true);
});

test('2. an outgoing call is rejected', async () => {
  assert.equal(isOurs(call({ destination: 'outgoing' })), false);
  const { rows, skipped } = rowsFrom([call({ destination: 'outgoing' })]);
  assert.equal(rows.length, 0);
  assert.equal(skipped.notIncoming, 1);
});

test('3. each of the three allowed queues is accepted', async () => {
  assert.deepEqual(QUEUES, ['1001*Q-ADMISSION', '1001*Q-COORDINATORS', '1001*Q-OTHER']);
  for (const queue of QUEUES) {
    assert.equal(isOurs(call({ queue })), true, queue + ' must be kept');
  }
  const { rows } = rowsFrom(QUEUES.map((queue, i) => call({ queue, uniqueid: 'q' + i })));
  assert.equal(rows.length, 3);
});

test('4. any other queue is rejected', async () => {
  for (const queue of ['1001*Q-SALES', '1002*Q-ADMISSION', 'Q-ADMISSION', '', null]) {
    assert.equal(isOurs(call({ queue })), false, JSON.stringify(queue) + ' must be dropped');
  }
  const { skipped } = rowsFrom([call({ queue: '1001*Q-SALES' })]);
  assert.equal(skipped.otherQueue, 1);
});

// ======================================================= 5-9. the mapping ===

test('5. ANSWER maps to picked_up true', async () => {
  assert.equal(toRow(call({ state: 'ANSWER' })).picked_up, true);
});

test('6. NOANSWER, and anything else, maps to picked_up false', async () => {
  for (const state of ['NOANSWER', 'BUSY', 'FAILED', '', null, undefined, 'answer']) {
    assert.equal(toRow(call({ state })).picked_up, false, JSON.stringify(state) + ' is not answered');
  }
});

test('7. operator_name is preserved when present', async () => {
  assert.equal(toRow(call({ operator_name: 'Laura' })).operator_name, 'Laura');
});

test('8. a missed call with no operator_name is allowed, and stored as null', async () => {
  const row = toRow(call({ state: 'NOANSWER', operator_name: '' }));
  assert.equal(row.picked_up, false);
  assert.equal(row.operator_name, null, 'empty string must not be stored as a name');
  assert.equal(toRow(call({ operator_name: undefined })).operator_name, null);
});

test('9. the mapping preserves uniqueid, and refuses a call without one', async () => {
  assert.equal(toRow(call({ uniqueid: '1758632400.42' })).uniqueid, '1758632400.42');
  assert.throws(() => toRow(call({ uniqueid: undefined })), /uniqueid/);
  assert.throws(() => toRow(call({ created_at: undefined })), /created_at/);
});

test('the row carries exactly the seven fields asked for, and nothing else', async () => {
  const row = toRow(call({ recording_url: 'https://example/rec.mp3', duration: 96 }));
  assert.deepEqual(Object.keys(row).sort(),
    ['caller_num', 'created_at', 'operator_name', 'picked_up', 'queue', 'uniqueid'].sort(),
    'inserted_at is the database default; nothing else may be collected');
});

// ============================================== 10. duplicates and upsert ====

test('10. a duplicate uniqueid is handled through upsert semantics', async () => {
  // within one batch it is collapsed, so the upsert never sees two rows with one key
  const { rows, skipped } = rowsFrom([call(), call(), call({ uniqueid: 'other' })]);
  assert.equal(rows.length, 2);
  assert.equal(skipped.duplicateInBatch, 1);

  // and the request itself asks PostgREST to merge on that key
  let seen = null;
  await upsertRows(rows, {
    env: ENV,
    fetchImpl: async (url, opts) => { seen = { url, opts }; return { ok: true, status: 201, text: async () => '' }; },
  });
  assert.match(seen.url, new RegExp(`/rest/v1/${TABLE.replace('*', '\\*')}\\?on_conflict=uniqueid$`));
  assert.match(seen.opts.headers.Prefer, /resolution=merge-duplicates/);
});

test('an empty batch makes no request at all', async () => {
  let called = false;
  const r = await upsertRows([], { env: ENV, fetchImpl: async () => { called = true; } });
  assert.equal(r.upserted, 0);
  assert.equal(called, false);
});

// ================================== 11. the window, explicitly Europe/Riga ===

test('11. the window is 15 minutes, in Riga wall clock, in the API format', async () => {
  const now = new Date('2026-09-23T11:05:00.000Z');       // 14:05 Riga, EEST
  const w = pollWindow(WINDOW_MINUTES, now);
  assert.equal(w.dateTo, '2026-09-23 14:05:00');
  assert.equal(w.dateFrom, '2026-09-23 13:50:00');
  assert.match(w.dateFrom, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.equal(w.to - w.from, 15 * 60000, 'fifteen real minutes, whatever the clock says');
  assert.equal(w.zone, 'Europe/Riga');
});

test('the window is Riga time, not the machine timezone or UTC', async () => {
  const now = new Date('2026-07-15T21:40:00.000Z');       // 00:40 on the 16th in Riga
  const w = pollWindow(15, now);
  assert.equal(w.dateTo, '2026-07-16 00:40:00', 'the Riga date has already rolled over');
  assert.notEqual(w.dateTo, '2026-07-15 21:40:00', 'UTC would be wrong');
});

test('EET, winter: Riga is two hours ahead of UTC', async () => {
  assert.equal(offsetMinutesAt(new Date('2026-01-15T12:00:00Z'), ZONE), 120);
  assert.equal(toRigaStamp('2026-01-15T12:00:00Z'), '2026-01-15 14:00:00');
  assert.equal(fromRigaStamp('2026-01-15 14:00:00').toISOString(), '2026-01-15T12:00:00.000Z');
});

test('EEST, summer: Riga is three hours ahead of UTC', async () => {
  assert.equal(offsetMinutesAt(new Date('2026-07-15T12:00:00Z'), ZONE), 180);
  assert.equal(toRigaStamp('2026-07-15T12:00:00Z'), '2026-07-15 15:00:00');
  assert.equal(fromRigaStamp('2026-07-15 15:00:00').toISOString(), '2026-07-15T12:00:00.000Z');
});

test('no offset is hardcoded anywhere in the timezone module', async () => {
  const src = fs.readFileSync(path.join(ROOT, 'lib', 'riga.js'), 'utf8');
  const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  for (const bad of ['+02:00', '+03:00', '+0200', '+0300', '* 120', '* 180']) {
    assert.ok(!code.includes(bad), 'a fixed offset appears in the code: ' + bad);
  }
  assert.match(code, /timeZone: zone/, 'the offset is asked of the zone database');
});

test('the clocks going forward is handled, not guessed', async () => {
  // Latvia springs forward on the last Sunday in March 2026: 29 March,
  // 03:00 EET becomes 04:00 EEST.
  assert.equal(offsetMinutesAt(new Date('2026-03-29T00:00:00Z'), ZONE), 120, 'before: EET');
  assert.equal(offsetMinutesAt(new Date('2026-03-29T02:00:00Z'), ZONE), 180, 'after: EEST');

  // a window that straddles the change is still exactly 15 real minutes
  const now = new Date('2026-03-29T01:05:00.000Z');   // 04:05 EEST
  const w = pollWindow(15, now);
  assert.equal(w.to - w.from, 15 * 60000);
  assert.equal(w.dateTo, '2026-03-29 04:05:00');
  assert.equal(w.dateFrom, '2026-03-29 02:50:00', 'the wall clock jumped, the interval did not');
});

test('the clocks going back is handled, and the ambiguity is documented', async () => {
  // 25 October 2026: 04:00 EEST becomes 03:00 EET.
  assert.equal(offsetMinutesAt(new Date('2026-10-25T00:00:00Z'), ZONE), 180, 'before: EEST');
  assert.equal(offsetMinutesAt(new Date('2026-10-25T02:00:00Z'), ZONE), 120, 'after: EET');

  const now = new Date('2026-10-25T01:05:00.000Z');
  const w = pollWindow(15, now);
  assert.equal(w.to - w.from, 15 * 60000, 'still fifteen real minutes');

  // 03:30 happens twice; we take the first, and lib/riga.js says so in words
  const src = fs.readFileSync(path.join(ROOT, 'lib', 'riga.js'), 'utf8');
  assert.match(src, /AMBIGUITY, STATED/);
  const first = fromRigaStamp('2026-10-25 03:30:00');
  assert.equal(offsetMinutesAt(first, ZONE), 180, 'the first occurrence, on the summer offset');
});

test('a round trip through Riga and back is the same instant, in both seasons', async () => {
  for (const iso of ['2026-01-15T08:17:31.000Z', '2026-07-15T08:17:31.000Z',
    '2026-03-29T00:30:00.000Z', '2026-10-25T00:30:00.000Z']) {
    const back = fromRigaStamp(toRigaStamp(iso)).toISOString();
    assert.equal(back.slice(0, 19), iso.slice(0, 19), 'round trip failed for ' + iso);
  }
});

test('a PBX created_at is read as Riga, not as UTC, in both seasons', async () => {
  assert.equal(toRow(call({ created_at: '2026-01-15 14:00:00' })).created_at, '2026-01-15T12:00:00.000Z');
  assert.equal(toRow(call({ created_at: '2026-07-15 15:00:00' })).created_at, '2026-07-15T12:00:00.000Z');
});

// ======================================== 12-14. failure, secrets, logging ===

test('12. a PBX failure is handled safely', async () => {
  await assert.rejects(
    fetchCalls({ env: ENV, fetchImpl: async () => ({ ok: false, status: 500, text: async () => '' }) }),
    /PBX returned 500/);
  await assert.rejects(
    fetchCalls({ env: ENV, fetchImpl: async () => { throw new Error('socket hang up'); } }),
    /PBX request failed/);
  await assert.rejects(
    fetchCalls({ env: ENV, fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad'); } }) }),
    /not JSON/);
  await assert.rejects(
    fetchCalls({ env: ENV, fetchImpl: okFetch({ message: 'no token' }) }),
    /not a list of calls/);
});

test('13. a missing PBX_API_TOKEN fails clearly and names only the variable', async () => {
  assert.throws(() => buildRequest({ env: {} }), (err) => {
    assert.match(err.message, /Missing required environment variable PBX_API_TOKEN/);
    assert.ok(!err.message.includes(FAKE_TOKEN));
    return true;
  });
  assert.throws(() => requiredEnv('ANYTHING', {}), /Missing required environment variable ANYTHING/);
});

test('14. no secret reaches a log, an error or a returned value', async () => {
  // the redactor removes the token by value AND any token= in a url
  assert.equal(redact(`x ${FAKE_TOKEN} y`, FAKE_TOKEN), 'x [redacted] y');
  assert.match(redact('https://p/?token=abc123&dateFrom=x'), /token=\[redacted\]/);
  assert.ok(!redact('https://p/?token=abc123').includes('abc123'));

  // the request the poller offers for logging never carries it
  const req = buildRequest({ env: ENV, now: new Date('2026-09-23T11:05:00Z') });
  assert.ok(req.url.includes(FAKE_TOKEN), 'the real request does carry it, in the query string');
  assert.ok(!req.safeUrl.includes(FAKE_TOKEN), 'the loggable one does not');
  assert.match(req.safeUrl, /token=\[redacted\]/);

  // an upstream error that quotes the url back at us is still safe
  await assert.rejects(
    fetchCalls({ env: ENV, fetchImpl: async () => ({ ok: false, status: 503, text: async () => `bad url ?token=${FAKE_TOKEN}` }) }),
    (err) => {
      assert.ok(!err.message.includes(FAKE_TOKEN), 'the token leaked into an error');
      return true;
    });

  // and a successful poll returns only the redacted url
  const result = await runPoll({
    env: ENV, now: new Date('2026-09-23T11:05:00Z'),
    fetchImpl: async (url) => (String(url).includes('supabase')
      ? { ok: true, status: 201, text: async () => '' }
      : { ok: true, status: 200, json: async () => [call()], text: async () => '[]' }),
  });
  assert.ok(!JSON.stringify(result).includes(FAKE_TOKEN));
});

test('no real-looking secret is committed in any source file', async () => {
  // The needle is assembled at runtime, so this test cannot match its own source
  // and report itself as a leak - which is exactly what a naive version did.
  const NAME = ['PBX', 'API', 'TOKEN'].join('_');
  const assigned = new RegExp(NAME + String.raw`\s*[:=]\s*["'][^"']{12,}["']`);
  const anyLongSecret = /(?:token|secret|service_key)["']?\s*[:=]\s*["'][A-Za-z0-9._-]{24,}["']/i;

  for (const rel of ['lib/pbx.js', 'lib/riga.js', 'api/cron/pbx-calls.js',
    'vercel.json', '.env.example', 'sql/001_pbx_incoming_calls.sql']) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.ok(!assigned.test(text), rel + ' assigns a literal value to ' + NAME);
    assert.ok(!anyLongSecret.test(text), rel + ' looks like it holds a secret');
  }
  // the test file itself may only carry a token that is obviously not real
  assert.match(FAKE_TOKEN, /test|fake|not-a-real/i, 'the test token must announce itself as fake');
});

// =============================================== 15. the cron authorisation ==

test('15. the cron route refuses a missing or wrong secret', async () => {
  assert.equal(authoriseCron(`Bearer ${ENV.CRON_SECRET}`, ENV).ok, true);
  assert.equal(authoriseCron(undefined, ENV).ok, false);
  assert.equal(authoriseCron('', ENV).ok, false);
  assert.equal(authoriseCron('Bearer wrong-secret-x', ENV).ok, false);
  assert.equal(authoriseCron(ENV.CRON_SECRET, ENV).ok, false, 'the Bearer prefix is required');
  assert.equal(authoriseCron(`Bearer ${ENV.CRON_SECRET}x`, ENV).ok, false);
  assert.equal(authoriseCron(`bearer ${ENV.CRON_SECRET}`, ENV).ok, false);
});

test('a missing CRON_SECRET closes the route rather than opening it', async () => {
  const r = authoriseCron('Bearer anything', {});
  assert.equal(r.ok, false);
  assert.equal(r.status, 500);
  assert.match(r.error, /Missing required environment variable CRON_SECRET/);
});

test('a refusal says Unauthorized and nothing about the secret', async () => {
  const r = authoriseCron('Bearer nope', ENV);
  assert.equal(r.status, 401);
  assert.equal(r.error, 'Unauthorized');
  assert.ok(!r.error.includes(ENV.CRON_SECRET));
});

// ========================================================= the whole poll ====

test('one poll filters, maps and upserts, and reports what it did', async () => {
  const calls = [
    call({ uniqueid: 'a', state: 'ANSWER', operator_name: 'Ieva' }),
    call({ uniqueid: 'b', state: 'NOANSWER', operator_name: '', queue: '1001*Q-COORDINATORS' }),
    call({ uniqueid: 'c', destination: 'outgoing' }),
    call({ uniqueid: 'd', queue: '1001*Q-SALES' }),
    call({ uniqueid: 'a' }),
  ];
  let sent = null;
  const result = await runPoll({
    env: ENV, now: new Date('2026-09-23T11:05:00Z'),
    fetchImpl: async (url, opts) => {
      if (String(url).includes('supabase')) { sent = JSON.parse(opts.body); return { ok: true, status: 201, text: async () => '' }; }
      return { ok: true, status: 200, json: async () => calls, text: async () => '[]' };
    },
  });
  assert.equal(result.fetched, 5);
  assert.equal(result.kept, 2);
  assert.equal(result.upserted, 2);
  assert.equal(result.skipped.notIncoming, 1);
  assert.equal(result.skipped.otherQueue, 1);
  assert.equal(result.skipped.duplicateInBatch, 1);
  assert.equal(result.window.zone, 'Europe/Riga');
  assert.deepEqual(sent.map((r) => r.uniqueid), ['a', 'b']);
  assert.equal(sent[1].picked_up, false);
  assert.equal(sent[1].operator_name, null);
});

test('the request goes to the documented endpoint, with the token as a query parameter', async () => {
  const req = buildRequest({ env: ENV, now: new Date('2026-09-23T11:05:00Z') });
  const u = new URL(req.url);
  assert.equal(u.origin + u.pathname, PBX_URL);
  assert.equal(u.searchParams.get('token'), FAKE_TOKEN, 'query param, because headers are refused by this API');
  assert.equal(u.searchParams.get('dateFrom'), '2026-09-23 13:50:00');
  assert.equal(u.searchParams.get('dateTo'), '2026-09-23 14:05:00');
});

test('the window asked for is short, because a wide one makes the API fail', async () => {
  assert.equal(WINDOW_MINUTES, 15);
  assert.ok(WINDOW_MINUTES <= 60, 'never ask this API for months or years');
});

test('Supabase config follows the org convention and accepts the brief name too', async () => {
  assert.equal(supabaseConfig(ENV).key, 'fake-service-key');
  assert.equal(supabaseConfig({ SUPABASE_URL: 'https://x', SUPABASE_SERVICE_ROLE_KEY: 'alias' }).key, 'alias');
  assert.throws(() => supabaseConfig({ SUPABASE_URL: 'https://x' }), /SUPABASE_SERVICE_KEY/);
  assert.equal(supabaseConfig({ ...ENV, SUPABASE_URL: 'https://x/' }).url, 'https://x');
});

// ================================================== the cron wiring itself ===

// NO CRON IS DECLARED, ON PURPOSE, 27.09.2026. The Vercel team is on Hobby, which only
// runs a cron once a day and REJECTS the deploy of anything more frequent. Daily would
// quietly miss almost every call against a 15-minute window, so the schedule is left
// out rather than degraded. The route stays, ready for a trigger that can run every
// five minutes. See docs/BACKLOG.md, 27.09.2026.
test('no cron is declared on Hobby, and the route a five-minute trigger will call exists', async () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  assert.equal(vercel.crons, undefined, 'a sub-daily cron fails the deploy on Hobby');
  assert.ok(fs.existsSync(path.join(ROOT, 'api', 'cron', 'pbx-calls.js')),
    'the route a trigger will call must exist');
});

test('the migration turns RLS on and grants nothing to anon or authenticated', async () => {
  const sql = fs.readFileSync(path.join(ROOT, 'sql', '001_pbx_incoming_calls.sql'), 'utf8');
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on public\.pbx_incoming_calls from anon, authenticated/i);
  assert.match(sql, /uniqueid\s+text primary key/i);
  assert.match(sql, /picked_up\s+boolean not null/i);
  assert.match(sql, /created_at\s+timestamptz not null/i);
  assert.match(sql, /inserted_at\s+timestamptz not null default now\(\)/i);
  assert.ok(!/create policy/i.test(sql), 'no permissive policy may be added without a decision');
  assert.match(sql, /NOT YET APPLIED/, 'a file that is not applied must say so');
});

test('the env example names every variable and gives none of them a value', async () => {
  const env = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
  for (const name of ['PBX_API_TOKEN', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'CRON_SECRET']) {
    assert.match(env, new RegExp('^' + name + '=\\s*$', 'm'), name + ' must be named and empty');
  }
});
