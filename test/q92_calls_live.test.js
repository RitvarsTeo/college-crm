// Q92 (14.10.2026, picked by Ritvars after Ieva: "tikko zvanīja, Laura pacēla, bet sistēmā tas nerādās ... uz koledžas
// numuru arī nāk diezgan daudz zvanu, kas nav ADMISSIONS"):
//   1. the TeleGroup pull every minute; a 429 makes it wait, never skip;
//   2. a phone card says each call plainly: when, the line, answered by whom or missed;
//   3. one click sets THAT call aside, no number is remembered (since the one rule, 14.10.2026, the same Set aside as
//      every card; "Not a lead" went); only a mark (Spam, Supplier or vendor, Internal) remembers one; a person in
//      Intake is never hidden;
//   4. a one-off admin action sets aside the phone items from before calls were live, logged, nothing deleted.
// Everything runs against a fake TeleGroup.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { syncPbx, SWEEP_PIECES, LATE_HOURS } from '../src/sync.js';
import { listInbound, archive, bringBack, receive, setAsideOldCalls, OLD_CALL_REASON, releaseNotAdmissions, RELEASED_NOTE, CONFIG, setMark } from '../src/intake.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ON = { PBX_API_TOKEN: 'test-pbx-token-not-real-0000', CHANNEL_MODE_PHONE: 'live' };
const call = (over = {}) => ({ uniqueid: 'c1', destination: 'incoming', queue: '1001*Q-ADMISSION',
  caller_num: '+37129111222', state: 'ANSWER', operator_name: 'Laura', created_at: '2026-10-14 08:58:00', ...over });   // 11:58 Riga
// A fake TeleGroup: the calls whose time falls inside the window asked for, like the real list. TeleGroup speaks
// UTC wall-clock both ways (14.10.2026: a 09:59 Riga call came back as 06:59), so every created_at below is UTC,
// 3 hours behind the Riga time the test reads (EEST).
function fakeTeleGroup(calls, { status = 200, retryAfter = null } = {}) {
  const seen = { requests: 0 };
  const fetchImpl = async (url) => {
    seen.requests++;
    if (seen.status429) return { ok: false, status: 429, headers: { get: (h) => (h === 'retry-after' ? retryAfter : null) }, text: async () => 'slow down' };
    const u = new URL(url);
    const from = u.searchParams.get('dateFrom'); const to = u.searchParams.get('dateTo');
    const inside = calls.filter((c) => c.created_at >= from && c.created_at <= to);
    return { ok: status === 200, status, headers: { get: () => null }, json: async () => inside, text: async () => '' };
  };
  return { fetchImpl, seen };
}
const at = (iso) => new Date(iso);
const run = (db, tg, now) => syncPbx(db, { now: at(now), env: ON, fetchImpl: tg.fetchImpl });

// ---------------------------------------------------------------------------- 1 --
test('1: the pull runs every minute; a caught-up run asks once and writes nothing new', async () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  assert.equal(vercel.crons.find((c) => c.path === '/api/cron/pbx-calls').schedule, '* 5-15 * * *');
  assert.match(fs.readFileSync(path.join(ROOT, 'api', 'cron', 'pbx-calls.js'), 'utf8'), /authoriseCron\(/, 'still CRON_SECRET');
  const db = await openDb(':memory:');
  const tg = fakeTeleGroup([call({ created_at: '2026-10-14 08:58:30' })]);
  await run(db, tg, '2026-10-14T08:59:00Z');                 // 11:59 Riga: the call is in
  assert.equal((await listInbound(db, { state: 'new' })).length, 1);
  const before = tg.seen.requests;
  const counts = async () => [(await db.prepare('SELECT COUNT(*) n FROM inbound').get()).n,
    (await db.prepare('SELECT COUNT(*) n FROM call_events').get()).n, (await db.prepare('SELECT COUNT(*) n FROM pbx_calls').get()).n];
  const had = await counts();
  const r = await run(db, tg, '2026-10-14T09:00:00Z');       // one minute later
  assert.equal(tg.seen.requests - before, 2 + SWEEP_PIECES, 'its own minute, the last hour in one request, plus SWEEP_PIECES pieces of the late sweep (14.10.2026)');
  assert.equal(r.seen, 1, 'the overlap sees the same call again, and knows it');
  assert.deepEqual(await counts(), had, 'nothing new is written');
});

test('1: TeleGroup answers 429 -> the pull waits (Retry-After), the bookmark stays, nothing is skipped', async () => {
  const db = await openDb(':memory:');
  const tg = fakeTeleGroup([call({ created_at: '2026-10-14 09:00:30' })], { retryAfter: '120' });
  await run(db, tg, '2026-10-14T08:59:00Z');
  const mark = (await db.prepare("SELECT value FROM sync_state WHERE name = 'pbx_until'").get()).value;
  tg.seen.status429 = true;
  const r = await run(db, tg, '2026-10-14T09:01:00Z');
  assert.equal(r.backingOff, true);
  assert.equal((await db.prepare("SELECT value FROM sync_state WHERE name = 'pbx_until'").get()).value, mark, 'bookmark untouched');
  const n = tg.seen.requests;
  const waiting = await run(db, tg, '2026-10-14T09:02:00Z');
  assert.equal(waiting.ran, false);
  assert.match(waiting.why, /slow down/);
  assert.equal(tg.seen.requests, n, 'not asked while waiting');
  tg.seen.status429 = false;
  const after = await run(db, tg, '2026-10-14T09:03:30Z');   // past the 120 seconds
  assert.equal(after.ran, true);
  assert.equal(after.inbox, 1, 'the call from the waiting minutes still arrives');
});

// ---------------------------------------------------------------------------- 2 --
test('2: a phone card lists each call: time, line, answered by whom or missed; newest first', async () => {
  const db = await openDb(':memory:');
  const tg = fakeTeleGroup([call(), call({ uniqueid: 'c2', state: 'NOANSWER', operator_name: '', created_at: '2026-10-14 09:20:00',
    queue: '1001*Q-COORDINATORS' })]);
  await run(db, tg, '2026-10-14T09:30:00Z');
  const [card] = await listInbound(db, { state: 'new' });
  assert.deepEqual(card.calls.map((c) => [c.line, c.answered, c.operator]),
    [['Student Coordinator', false, null], ['Admissions', true, 'Laura']]);
  assert.equal(card.calls[1].at, '2026-10-14T08:58:00.000Z');
  // the screen
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  const TZ = 'Europe/Riga';
  const fmt = app.slice(app.indexOf('const fmtDateTime = '), app.indexOf('// Today in RIGA.'));
  const fn = app.slice(app.indexOf('function cCallsHtml('), app.indexOf('async function cCallNote('));
  const ctx = { esc: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;'), TZ };
  vm.runInNewContext(`const TZ = ${JSON.stringify(TZ)};` + fmt + fn + '; this.calls = cCallsHtml;', ctx);
  const html = ctx.calls(card.calls);
  assert.match(html, /14\.10 12:20<\/span><span>Student Coordinator<\/span><b>Missed<\/b>/);
  assert.match(html, /14\.10 11:58<\/span><span>Admissions<\/span><b>Answered by Laura<\/b>/);
  assert.match(app, /r\.channel === 'phone' && \(r\.calls \|\| \[\]\)\.length \? cCallsHtml\(r\.calls\)/, 'the card uses it');
});

// ---------------------------------------------------------------------------- 3 --
// Rethink, Ritvars 14.10.2026 ("how do you know its 'Not Admissions'?" -> "Yes, this system"): calls run on facts.
// One rule on every card (14.10.2026): the phone card's own "Not a lead" went; it has the same one-click Set aside as
// every card, and Supplier or vendor, Internal, Spam are a mark on the number.
test('3: no Not a lead any more: the phone card has the same Set aside as every card; the marks are the three remembered ones', () => {
  assert.deepEqual(CONFIG.intake.archiveReasons, ['Not a prospective student', 'Supplier or vendor', 'Internal', 'Spam']);
  assert.deepEqual(CONFIG.intake.marks, ['Supplier or vendor', 'Internal', 'Spam']);
  assert.deepEqual(CONFIG.phoneFilter.filterArchivedAs, ['Spam', 'Supplier or vendor', 'Internal'], 'an old set-aside with one of these still counts as marked');
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  assert.doesNotMatch(app, /cNotALead|>Not a lead<|reason: 'Not a lead'/);
  assert.doesNotMatch(app, /Not Admissions/);
});

test('3: after Set aside, the next call from that number reaches the Inbox; a Spam mark sets later calls aside; a person never', async () => {
  const db = await openDb(':memory:');
  await run(db, fakeTeleGroup([call()]), '2026-10-14T09:00:00Z');
  const [card] = await listInbound(db, { state: 'new' });
  assert.equal((await archive(db, card.id, { reason: 'Not a prospective student', by: 'Laura' })).ok, true);
  const r = await run(db, fakeTeleGroup([call({ uniqueid: 'c2', caller_num: '29111222', created_at: '2026-10-14 09:10:00' })]),
    '2026-10-14T09:11:00Z');
  assert.equal(r.filtered, 0, 'no number is remembered');
  assert.equal(r.inbox, 1);
  // the mark is explicit, and it does remember
  const [second] = await listInbound(db, { state: 'new' });
  assert.deepEqual({ ...second.setAsideBefore, at: null }, { at: null, by: 'Laura', reason: 'Not a prospective student' }, 'it came back with "Set aside before"');
  assert.equal((await setMark(db, second.id, { mark: 'Spam', by: 'Laura' })).ok, true);
  const s2 = await run(db, fakeTeleGroup([call({ uniqueid: 'c3', created_at: '2026-10-14 09:20:00' })]), '2026-10-14T09:21:00Z');
  assert.equal(s2.filtered, 1);
  // the number becomes a person's: their calls go on their profile, whatever the filter says
  await db.prepare(`INSERT INTO people (id, name, phone, status, owner, created_at) VALUES ('p1', 'Anna', '+371 29 111 222', 'new', 'Ieva', '2026-10-14T09:22:00Z')`).run();
  const k = await run(db, fakeTeleGroup([call({ uniqueid: 'c4', created_at: '2026-10-14 09:25:00' })]), '2026-10-14T09:26:00Z');
  assert.equal(k.logged, 1);
  assert.equal(k.filtered, 0);
});

// a number set aside as Spam BEFORE the one rule (14.10.2026) still counts as marked: Bring back undoes that old one
test('3: an old Spam set-aside - Bring back undoes it, on the Spam card or on a later card of that number', async () => {
  for (const which of ['the card itself', 'a later filtered card']) {
    const db = await openDb(':memory:');
    await run(db, fakeTeleGroup([call()]), '2026-10-14T09:00:00Z');
    const [card] = await listInbound(db, { state: 'new' });
    await archive(db, card.id, { reason: 'Not a prospective student', by: 'Ieva' });
    await db.prepare("UPDATE inbound SET archive_reason = 'Spam' WHERE id = ?").run(card.id);   // as the old dialog left it: no mark row
    await run(db, fakeTeleGroup([call({ uniqueid: 'c2', created_at: '2026-10-14 09:10:00' })]), '2026-10-14T09:11:00Z');
    const later = await db.prepare("SELECT id FROM inbound WHERE state = 'filtered'").get();
    const back = which === 'the card itself' ? card.id : later.id;
    assert.equal((await bringBack(db, back, { by: 'Ieva', at: '2026-10-14T09:12:00Z' })).ok, true, which);
    const r = await run(db, fakeTeleGroup([call({ uniqueid: 'c3', created_at: '2026-10-14 09:20:00' })]), '2026-10-14T09:21:00Z');
    assert.equal(r.filtered, 0, which + ': no longer set aside');
    assert.equal(r.inbox + r.again, 1, which + ': it reaches the Inbox');
  }
});

test('3: release - calls set aside because their number was once "Not Admissions" come back, logged; the marked card stays', async () => {
  const db = await openDb(':memory:');
  // production as patch 44 left it: a card a person marked, and a later call the filter set aside because of it
  const marked = await receive(db, { channel: 'phone', externalId: 'm1', receivedAt: '2026-10-14T07:00:00Z', phone: '+37129111222',
    body: 'Incoming call', threadKey: 'phone:29111222', source: 'provider' });
  await db.prepare("UPDATE inbound SET state = 'archived', archive_reason = 'Not Admissions', processed_by = 'Ieva', processed_at = '2026-10-14T07:05:00Z' WHERE id = ?").run(marked.id);
  const held = await receive(db, { channel: 'phone', externalId: 'm2', receivedAt: '2026-10-14T08:00:00Z', phone: '+37129111222',
    body: 'Missed call', threadKey: 'phone:29111222', source: 'provider', filterWhy: RELEASED_NOTE });
  const look = await releaseNotAdmissions(db);
  assert.deepEqual([look.applied, look.count], [false, 1]);
  assert.equal((await db.prepare('SELECT state FROM inbound WHERE id = ?').get(held.id)).state, 'filtered', 'a preview moves nothing');
  assert.equal((await releaseNotAdmissions(db, { apply: true })).error, 'who is releasing these?');
  const done = await releaseNotAdmissions(db, { apply: true, by: 'Ritvars' });
  assert.equal(done.broughtBack, 1);
  assert.equal((await db.prepare('SELECT state FROM inbound WHERE id = ?').get(held.id)).state, 'new', 'back in the Inbox');
  assert.equal((await db.prepare('SELECT state FROM inbound WHERE id = ?').get(marked.id)).state, 'archived', 'the marked call stays a decision');
  const h = await db.prepare('SELECT action, actor FROM inbound_history WHERE inbound_id = ?').all(held.id);
  assert.deepEqual(h.map((x) => [x.action, x.actor]), [['brought_back', 'Ritvars']]);
  assert.equal((await db.prepare("SELECT value FROM sync_state WHERE name = 'not_admissions_released'").get()).value, '1');
  // and the next call from that number reaches the Inbox
  const r = await run(db, fakeTeleGroup([call({ uniqueid: 'c9', created_at: '2026-10-14 09:30:00' })]), '2026-10-14T09:31:00Z');
  assert.equal(r.filtered, 0);
});

// ---------------------------------------------------------------------------- 4 --
test('4: old calls - a preview moves nothing; apply sets aside only phone items from before the day, logged; Bring back works', async () => {
  const db = await openDb(':memory:');
  // both stamps are 13.10 in UTC; in Riga o1 is 23:50 on 13.10 and o2 is 00:10 on 14.10 - the day is Riga's
  await run(db, fakeTeleGroup([call({ uniqueid: 'o1', caller_num: '+37120000001', created_at: '2026-10-13 20:50:00' }),
    call({ uniqueid: 'o2', caller_num: '+37120000002', created_at: '2026-10-13 21:10:00' })]), '2026-10-14T06:00:00Z');
  const ids = Object.fromEntries((await db.prepare('SELECT uniqueid, inbound_id FROM pbx_calls').all()).map((c) => [c.uniqueid, c.inbound_id]));
  assert.deepEqual((await setAsideOldCalls(db, { before: '14.10' })).error, 'before must be a day, YYYY-MM-DD');
  const look = await setAsideOldCalls(db, { before: '2026-10-14' });
  assert.equal(look.applied, false);
  assert.equal(look.count, 1, '23:50 Riga on 13.10 is before; 00:10 on 14.10 is not');
  assert.equal((await listInbound(db, { state: 'new' })).length, 2, 'a preview moves nothing');
  const done = await setAsideOldCalls(db, { before: '2026-10-14', apply: true, by: 'Ritvars' });
  assert.equal(done.count, 1);
  const old = await db.prepare('SELECT state, archive_reason, processed_by FROM inbound WHERE id = ?').get(ids.o1);
  assert.deepEqual([old.state, old.archive_reason, old.processed_by], ['archived', OLD_CALL_REASON, 'Ritvars']);
  assert.equal((await db.prepare('SELECT state FROM inbound WHERE id = ?').get(ids.o2)).state, 'new');
  const h = await db.prepare("SELECT action, actor, reason FROM inbound_history WHERE inbound_id = ?").all(ids.o1);
  assert.deepEqual(h.map((x) => [x.action, x.actor, x.reason]), [['set_aside', 'Ritvars', OLD_CALL_REASON]]);
  assert.equal((await db.prepare("SELECT value FROM sync_state WHERE name = 'old_calls_set_aside'").get()).value, '1', 'the run is recorded');
  assert.ok(!CONFIG.phoneFilter.filterArchivedAs.includes(OLD_CALL_REASON), 'an old call never makes its number filtered');
  assert.equal((await bringBack(db, ids.o1, { by: 'Ieva' })).ok, true);
  assert.equal((await setAsideOldCalls(db, { before: '2026-10-14', apply: true, by: 'Ritvars' })).count, 1, 'a second run only finds what is waiting');
});

function start(env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], { env: { ...process.env,
      PORT: '0', CRM_DB: ':memory:', DATASET: 'empty', CRM_AUTH: '', CRM_PUBLIC: '', DATABASE_URL: '', CRM_DB_DATABASE_URL_UNPOOLED: '', ...env },
    stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const look = (d) => { out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, base: `http://127.0.0.1:${m[1]}` }); };
    child.stdout.on('data', look); child.stderr.on('data', look);
    child.on('exit', () => reject(new Error(out)));
  });
}

test('4: the old-calls action is for admins only; GET previews, POST applies', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  const url = s.base + '/api/admin/inbox/old-calls';
  const user = { 'x-acting-as': 'Ieva', 'content-type': 'application/json' };
  const admin = { 'x-acting-as': 'Ritvars', 'content-type': 'application/json' };
  assert.equal((await fetch(url + '?before=2026-10-14', { headers: user })).status, 403);
  const look = await fetch(url + '?before=2026-10-14', { headers: admin }).then((r) => r.json());
  assert.equal(look.applied, false);
  const bad = await fetch(url, { method: 'POST', headers: admin, body: JSON.stringify({ before: 'x', apply: true }) });
  assert.equal(bad.status, 400);
  const done = await fetch(url, { method: 'POST', headers: admin, body: JSON.stringify({ before: '2026-10-14', apply: true }) }).then((r) => r.json());
  assert.equal(done.applied, true);
  const rel = s.base + '/api/admin/inbox/release-not-admissions';
  assert.equal((await fetch(rel, { headers: user })).status, 403, 'release: admins only');
  assert.equal((await fetch(rel, { headers: admin }).then((r) => r.json())).applied, false);
  assert.equal((await fetch(rel, { method: 'POST', headers: admin, body: JSON.stringify({ apply: true }) }).then((r) => r.json())).applied, true);
});

test('the Channels screen says "Every minute"; Help says it, in the same change', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  const fn = app.slice(app.indexOf('function chEvery('), app.indexOf('function chWhen('));
  const ctx = {};
  vm.runInNewContext(fn + '; this.every = chEvery;', ctx);
  assert.equal(ctx.every('* * * * *'), 'Every minute');
  assert.equal(ctx.every('*/5 * * * *'), 'Every 5 min');
  assert.equal(ctx.every('* 5-15 * * *'), 'Every minute, 08:00-17:00');
  assert.equal(ctx.every('*/10 5-15 * * *'), 'Every 10 min, 08:00-17:00');
  const help = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'help.json'), 'utf8'));
  const q = help.faq.find((x) => x.id === 'phone-calls');
  assert.match(q.a, /every minute/);
  assert.match(q.a, /Set aside on a call card, then pick why/);   // one rule (14.10.2026): no Not a lead
  assert.doesNotMatch(q.a, /Not a lead/);
  assert.match(q.a, /Bring back/);
});

// ---------------------------------------------------------------- late-listed calls --
// 14.10.2026, live: TeleGroup's list did not show a 09:59 call for at least 9 minutes; a call listed late keeps its
// ORIGINAL time. A fake that lists a call only from a given moment on, with its original time.
function lateTeleGroup(list) {
  const seen = { requests: 0 };
  let clockNow = 0;
  const fetchImpl = async (url) => {
    seen.requests++;
    const u = new URL(url);
    const from = u.searchParams.get('dateFrom'); const to = u.searchParams.get('dateTo');
    const inside = list.filter((c) => clockNow >= Date.parse(c.listedFrom) && c.created_at >= from && c.created_at <= to)
      .map(({ listedFrom, ...c }) => c);
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => inside, text: async () => '' };
  };
  return { fetchImpl, seen, at: (iso) => { clockNow = Date.parse(iso); } };
}

test('recent: a long answered call, listed only when it ends but stamped with its start, is in within a minute of ending', async () => {
  // 14.10.2026: calls at 11:33 and 11:45 Riga waited for the sweep until 11:53; a 2-minute call at 11:25 was in at 11:27
  const db = await openDb(':memory:');
  const tg = lateTeleGroup([call({ uniqueid: 'long1', created_at: '2026-10-14 08:33:00', listedFrom: '2026-10-14T08:53:00Z' })]);
  let found = null;
  for (let m = 31; m <= 54 && !found; m++) {
    const now = new Date(Date.UTC(2026, 9, 14, 8, m)).toISOString();
    tg.at(now);
    await run(db, tg, now);
    if ((await db.prepare("SELECT COUNT(*) n FROM pbx_calls WHERE uniqueid = 'long1'").get()).n) found = now;
  }
  assert.equal(found, '2026-10-14T08:53:00.000Z', 'the first run after it is listed has it (11:53 Riga)');
  const lag = JSON.parse((await db.prepare("SELECT detail FROM sync_state WHERE name = 'pbx_lag'").get()).detail).calls;
  assert.equal(lag[0].by, 'recent', 'the last-hour re-read caught it, not the 48-hour sweep');
  assert.equal(lag[0].lagMin, 20, 'twenty minutes after it started = the moment it ended');
});

test('fields: the pull keeps the NAMES of the fields TeleGroup sends, never a value (14.10.2026, for the call length)', async () => {
  const db = await openDb(':memory:');
  const tg = fakeTeleGroup([call({ created_at: '2026-10-14 08:58:30', billsec: 754, recording: 'https://x.example/rec/1.mp3' })]);
  await run(db, tg, '2026-10-14T08:59:00Z');
  const row = await db.prepare("SELECT value, detail FROM sync_state WHERE name = 'pbx_fields'").get();
  assert.equal(row.value, 'billsec,caller_num,created_at,destination,operator_name,queue,recording,state,uniqueid');
  const all = row.value + row.detail;
  for (const secret of ['37129111222', 'Laura', '754', 'x.example', 'c1']) assert.ok(!all.includes(secret), `no value kept: ${secret}`);
});

test('late: a call TeleGroup lists 3 hours late, with its original time, is still caught by the sweep; recorded how late', async () => {
  const db = await openDb(':memory:');
  const tg = lateTeleGroup([call({ uniqueid: 'late1', created_at: '2026-10-14 06:59:00', listedFrom: '2026-10-14T09:58:00Z' })]);
  // every minute from 06:55 to 07:05 UTC: the call is not listed yet
  for (let m = 55; m <= 65; m++) {
    const now = new Date(Date.UTC(2026, 9, 14, 6, m)).toISOString();
    tg.at(now);
    await run(db, tg, now);
  }
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM pbx_calls').get()).n, 0, 'not listed yet');
  // TeleGroup lists it three hours later; the bookmark is long past 06:59. Run on, minute by minute, until the sweep reaches it.
  let found = null;
  for (let m = 0; m < 60 && !found; m++) {
    const now = new Date(Date.UTC(2026, 9, 14, 10, m)).toISOString();
    tg.at(now);
    const r = await run(db, tg, now);
    if (r.late) found = r;
  }
  assert.ok(found, 'the sweep found it within an hour of it being listed');
  assert.equal(found.late, 1);
  const row = await db.prepare("SELECT called_at, inbound_id FROM pbx_calls WHERE uniqueid = 'late1'").get();
  assert.equal(row.called_at, '2026-10-14T06:59:00.000Z', 'its own time, not the time it was found');
  assert.ok(row.inbound_id, 'it reached the Inbox');
  const lag = JSON.parse((await db.prepare("SELECT detail FROM sync_state WHERE name = 'pbx_lag'").get()).detail).calls;
  assert.equal(lag.length, 1);
  assert.equal(lag[0].by, 'sweep');
  assert.ok(lag[0].lagMin >= 180 && lag[0].lagMin <= 245, 'about three hours: ' + lag[0].lagMin);
  assert.ok(!JSON.stringify(lag).includes('29111222'), 'no phone number in the lag record');
});

test('late: the sweep covers the trailing 48 hours, never re-stores a call, and every run stays small', async () => {
  const db = await openDb(':memory:');
  const tg = lateTeleGroup([call({ uniqueid: 'old1', created_at: '2026-10-12 15:00:00', listedFrom: '2026-10-12T00:00:00Z' })]);
  const starts = [];
  let total = 0;
  for (let m = 0; m < 40; m++) {
    const now = new Date(Date.UTC(2026, 9, 14, 12, m)).toISOString();
    tg.at(now);
    const before = tg.seen.requests;
    await run(db, tg, now);
    if (m > 0) assert.ok(tg.seen.requests - before <= 2 + SWEEP_PIECES, 'after the first catch-up, at most 8 requests a run');
    starts.push((await db.prepare("SELECT value FROM sync_state WHERE name = 'pbx_sweep'").get()).value);
    total += tg.seen.requests - before;
  }
  assert.equal(LATE_HOURS, 48);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM pbx_calls WHERE uniqueid = 'old1'").get()).n, 1, 'found once, kept once');
  assert.ok(starts.some((s, i) => i > 0 && Date.parse(s) < Date.parse(starts[i - 1])), 'the cursor went round again');
});

// ------------------------------------------------------------------ the call's length --
// 14.10.2026, Ritvars: "WE need the length also". TeleGroup's duration (whole call, ringing included) and duration_talk
// (talk time) are stored in seconds; the card adds the talk time to an answered call and how long it rang to a missed one.
const cardHtml = (calls) => {
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  const fmt = app.slice(app.indexOf('const fmtDateTime = '), app.indexOf('// Today in RIGA.'));
  const fn = app.slice(app.indexOf('function cCallsHtml('), app.indexOf('async function cCallNote('));
  const ctx = { esc: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;') };
  vm.runInNewContext(`const TZ = 'Europe/Riga';` + fmt + fn + '; this.calls = cCallsHtml;', ctx);
  return ctx.calls(calls);
};

test('length: a stored call keeps both values; the card shows the talk time, how long a missed call rang, nothing when unknown', async () => {
  const db = await openDb(':memory:');
  const tg = fakeTeleGroup([
    call({ duration: '12:29', duration_talk: '12:04' }),                                              // 11:58 Riga, answered
    call({ uniqueid: 'c2', state: 'NOANSWER', operator_name: '', created_at: '2026-10-14 09:20:00', duration: 25, duration_talk: 0 }),
    call({ uniqueid: 'c3', state: 'NOANSWER', operator_name: '', created_at: '2026-10-14 09:25:00' }),  // no length at all
    call({ uniqueid: 'c4', created_at: '2026-10-14 09:26:00', operator_name: 'Ieva', duration: 'abc', duration_talk: '' }),
  ]);
  await run(db, tg, '2026-10-14T09:30:00Z');
  const rows = await db.prepare('SELECT uniqueid, duration_sec, talk_sec FROM pbx_calls ORDER BY uniqueid').all();
  assert.deepEqual(rows.map((r) => [r.uniqueid, r.duration_sec, r.talk_sec]),
    [['c1', 749, 724], ['c2', 25, 0], ['c3', null, null], ['c4', null, null]]);
  const [card] = await listInbound(db, { state: 'new' });
  assert.deepEqual(card.calls.map((c) => [c.talkSec, c.durationSec]), [[null, null], [null, null], [0, 25], [724, 749]], 'newest first');
  const html = cardHtml(card.calls);   // three at most on the card: the oldest (12:04) is shown on its own below
  assert.match(cardHtml(card.calls.slice(-1)), /11:58<\/span><span>Admissions<\/span><b>Answered by Laura · 12:04<\/b>/);
  assert.match(html, /12:20<\/span><span>Admissions<\/span><b>Missed · rang 0:25<\/b>/);
  assert.match(html, /12:25<\/span><span>Admissions<\/span><b>Missed<\/b>/, 'unknown length: nothing extra');
  assert.match(html, /12:26<\/span><span>Admissions<\/span><b>Answered by Ieva<\/b>/, 'unreadable length: nothing extra');
  assert.doesNotMatch(html, /0:00/, 'never a zero placeholder');
  // from an hour, h:mm:ss; a 0 talk time on an answered call adds nothing
  const long = cardHtml([{ at: '2026-10-14T08:58:00.000Z', line: 'Admissions', answered: true, operator: 'Ieva', talkSec: 3723, durationSec: 3750 },
    { at: '2026-10-14T08:50:00.000Z', line: 'Admissions', answered: true, operator: '<i>x</i>', talkSec: 0, durationSec: 10 }]);
  assert.match(long, /<b>Answered by Ieva · 1:02:03<\/b>/);
  assert.match(long, /<b>Answered by &lt;i>x&lt;\/i><\/b>/, 'escaped as before, no length for 0');
});

test('length: the re-read and the 48-hour sweep fill a stored call without a length, and change nothing else', async () => {
  const db = await openDb(':memory:');
  // stored before the length was read: TeleGroup's answer then had no duration fields
  const calls = [call({ uniqueid: 'r1', created_at: '2026-10-14 08:58:00' }),                       // the last hour at 09:30
    call({ uniqueid: 's1', state: 'NOANSWER', operator_name: '', caller_num: '+37129333444', created_at: '2026-10-13 20:00:00' })];
  const tg = fakeTeleGroup(calls);
  await run(db, tg, '2026-10-13T20:01:00Z');
  await run(db, tg, '2026-10-14T08:59:00Z');
  const snapshot = async () => ({
    counts: await Promise.all(['inbound', 'call_events', 'events', 'tasks', 'inbound_history', 'pbx_calls']
      .map(async (t) => (await db.prepare(`SELECT COUNT(*) n FROM ${t}`).get()).n)),
    inbound: await db.prepare('SELECT id, state, body, received_at, surface_at FROM inbound ORDER BY id').all(),
    calls: await db.prepare(`SELECT uniqueid, called_at, queue, caller_num, picked_up, operator_name, person_id, inbound_id, inserted_at
      FROM pbx_calls ORDER BY uniqueid`).all(),
  });
  const len = async () => (await db.prepare('SELECT uniqueid, duration_sec, talk_sec FROM pbx_calls ORDER BY uniqueid').all())
    .map((r) => [r.uniqueid, r.duration_sec, r.talk_sec]);
  assert.deepEqual(await len(), [['r1', null, null], ['s1', null, null]]);
  const before = await snapshot();
  // TeleGroup now sends the length
  calls[0] = { ...calls[0], duration: 760, duration_talk: '12:04' };
  calls[1] = { ...calls[1], duration: '0:25', duration_talk: 0 };
  const r = await run(db, tg, '2026-10-14T09:30:00Z');
  assert.deepEqual(await len(), [['r1', 760, 724], ['s1', null, null]], 'the last-hour re-read filled r1; s1 waits for the sweep');
  for (const k of ['logged', 'inbox', 'again', 'filtered', 'noNumber', 'callBack']) assert.equal(r[k], 0, k);
  assert.ok(r.seen >= 1);
  // the sweep walks the trailing 48 hours, minute by minute, until it re-reads 20:00 UTC the day before
  for (let m = 31; m < 120 && (await len())[1][1] === null; m++) {
    const out = await run(db, tg, new Date(Date.UTC(2026, 9, 14, 9, m)).toISOString());
    for (const k of ['logged', 'inbox', 'again', 'filtered', 'noNumber', 'callBack']) assert.equal(out[k], 0, k);
    assert.ok(!out.late, 'a fill is not a late-found call');
  }
  assert.deepEqual(await len(), [['r1', 760, 724], ['s1', 25, 0]], 'the sweep filled s1');
  assert.deepEqual(await snapshot(), before, 'no new Inbox item, event, task or history line; nothing else on the call changed');
  // a stored length is never overwritten
  calls[0] = { ...calls[0], duration: 999, duration_talk: 998 };
  await run(db, tg, '2026-10-14T11:31:00Z');
  assert.deepEqual((await len())[0], ['r1', 760, 724]);
});

test('length: a call the pushed events stored first (no length) gets it from the pull; the push path still stores', async () => {
  const { receivePhoneEvent } = await import('../src/phoneevent.js');
  const db = await openDb(':memory:');
  const now = at('2026-10-14T08:59:00Z');
  for (const event of ['ringing', 'answered', 'ended']) {
    await receivePhoneEvent(db, { call_id: 'p1', event, queue: '1001*Q-ADMISSION', caller: '+37129111222', operator: 'Laura',
      at: '2026-10-14 08:58:00' }, { mode: 'live', now });
  }
  assert.deepEqual({ ...(await db.prepare("SELECT picked_up, duration_sec, talk_sec FROM pbx_calls WHERE uniqueid = 'p1'").get()) },
    { picked_up: 1, duration_sec: null, talk_sec: null });
  const inboxBefore = (await db.prepare('SELECT COUNT(*) n FROM inbound').get()).n;
  await run(db, fakeTeleGroup([call({ uniqueid: 'p1', duration: 300, duration_talk: 280 })]), '2026-10-14T09:05:00Z');
  assert.deepEqual({ ...(await db.prepare("SELECT duration_sec, talk_sec FROM pbx_calls WHERE uniqueid = 'p1'").get()) },
    { duration_sec: 300, talk_sec: 280 });
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM inbound').get()).n, inboxBefore);
});

test('length: the columns are added by the boot migration, so an existing database (production Postgres) gets them', async () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'db.js'), 'utf8');
  assert.match(src, /\['pbx_calls', 'duration_sec', 'INTEGER'\]/);
  assert.match(src, /\['pbx_calls', 'talk_sec', 'INTEGER'\]/);
  // an older database file, made before the columns existed, gains them on the next open
  const os = await import('node:os');
  const { DatabaseSync } = await import('node:sqlite');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-len-'));
  const file = path.join(dir, 'old.db');
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE pbx_calls (uniqueid TEXT PRIMARY KEY, called_at TEXT NOT NULL, queue TEXT NOT NULL, caller_num TEXT,
    picked_up INTEGER NOT NULL, operator_name TEXT, person_id TEXT, inbound_id INTEGER, inserted_at TEXT NOT NULL);
    INSERT INTO pbx_calls VALUES ('o1', '2026-10-13T08:00:00.000Z', '1001*Q-ADMISSION', NULL, 1, 'Ieva', NULL, NULL, 'x');`);
  old.close();
  const db = await openDb(file);
  try {
    const cols = (await db.prepare("SELECT name FROM pragma_table_info('pbx_calls')").all()).map((c) => c.name);
    assert.ok(cols.includes('duration_sec') && cols.includes('talk_sec'), cols.join(','));
    assert.deepEqual({ ...(await db.prepare("SELECT duration_sec, talk_sec FROM pbx_calls WHERE uniqueid = 'o1'").get()) },
      { duration_sec: null, talk_sec: null }, 'the old row is kept, its length unknown');
  } finally {
    if (db.close) await db.close();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* Windows may still hold the file */ }
  }
});

test('length: Help says it, in the same change', () => {
  const help = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'help.json'), 'utf8'));
  assert.match(help.faq.find((x) => x.id === 'phone-calls').a, /how long the talk lasted, and a missed call how long it rang/);
});
