// THE PBX OUTAGE (16.11.2026). From 13.11 08:00 Riga every pull failed ("fetch failed"); the last good one ended
// 12.11 17:00 Riga. Once it works again the pull must reach back over the whole gap, and - the owner's pick
// "History only" - a call from inside the outage goes on a known person's history with no Call back step, and an
// unknown number's call is stored but set aside, never an Inbox card. A short blip is no outage.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { syncPbx, OUTAGE_WHY } from '../src/sync.js';

const ON = { PBX_API_TOKEN: 'test-pbx-token-not-real-0000', CHANNEL_MODE_PHONE: 'live' };
const LAST_GOOD = '2026-11-12T15:00:00.000Z';
const FIRST_FAIL = new Date('2026-11-13T06:00:41Z');
const BACK = new Date('2026-11-16T10:00:00Z');

const state = async (db, name) => db.prepare('SELECT value FROM sync_state WHERE name = ?').get(name);
const setState = (db, name, value) => db.prepare('INSERT INTO sync_state (name, value, ran_at, detail) VALUES (?,?,?,?)')
  .run(name, value, LAST_GOOD, '{}');
const call = (id, at, over = {}) => ({ uniqueid: id, destination: 'incoming', queue: '1001*Q-ADMISSION',
  caller_num: '+37120000001', state: 'NO ANSWER', operator_name: null, created_at: at, ...over });
// TeleGroup's list, honestly: only the calls inside the window asked for (UTC wall-clock both ways)
const pbxList = (calls) => async (url) => {
  const u = new URL(url);
  const from = Date.parse(u.searchParams.get('dateFrom').replace(' ', 'T') + 'Z');
  const to = Date.parse(u.searchParams.get('dateTo').replace(' ', 'T') + 'Z');
  const inside = calls.filter((c) => { const t = Date.parse(c.created_at.replace(' ', 'T') + 'Z'); return t >= from && t <= to; });
  return { ok: true, status: 200, json: async () => inside, text: async () => '' };
};
const down = async () => { throw Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('connect'), { code: 'ECONNREFUSED' }) }); };

async function person(db, phone) {
  const id = 'p' + Math.random().toString(36).slice(2, 7);
  await db.prepare('INSERT INTO people (id, name, phone, status) VALUES (?,?,?,?)').run(id, 'Known Caller', phone, 'New');
  return id;
}

test('a failed pull notes where the last good one ended, once, and still fails the run', async () => {
  const db = await openDb(':memory:');
  await setState(db, 'pbx_until', LAST_GOOD);
  await assert.rejects(syncPbx(db, { now: FIRST_FAIL, env: ON, fetchImpl: down }), /fetch failed \(ECONNREFUSED\)/);
  assert.equal((await state(db, 'pbx_down_since')).value, LAST_GOOD);
  // a later failure keeps the first note
  await assert.rejects(syncPbx(db, { now: new Date('2026-11-14T08:00:00Z'), env: ON, fetchImpl: down }));
  assert.equal((await state(db, 'pbx_down_since')).value, LAST_GOOD);
});

test('back after 3 days: the whole gap is read, outage calls are history only, and the next new call is normal', async () => {
  const db = await openDb(':memory:');
  await setState(db, 'pbx_until', LAST_GOOD);
  await setState(db, 'pbx_down_since', LAST_GOOD);
  const known = await person(db, '+371 29 111 222');
  const calls = [
    call('out.unknown', '2026-11-13 09:00:00'),                                            // unknown, missed, day 1
    call('out.known', '2026-11-14 12:30:00', { caller_num: '+37129111222' }),               // known, missed, day 2
    call('out.answered', '2026-11-16 09:30:00', { caller_num: '+37120000003', state: 'ANSWER' }), // unknown, half an hour before the fix
  ];
  const r = await syncPbx(db, { now: BACK, env: ON, fetchImpl: pbxList(calls) });
  assert.equal(r.ok, true);
  assert.equal(r.caughtUp, true, 'the whole 3-day gap fits in one run when every piece answers at once');
  assert.equal(r.history, 3, 'all three are history only');
  assert.equal(r.inbox, 0, 'no Inbox card for any of them');
  assert.ok(r.outage, 'the run reports the outage window');
  // the outage window is stored, the down note is gone
  assert.equal((await state(db, 'pbx_outage')).value, `${LAST_GOOD}|${BACK.toISOString()}`);
  assert.equal(await state(db, 'pbx_down_since'), undefined);
  // every call is stored
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM pbx_calls').get()).n, 3);
  // the unknown numbers: stored and set aside with the outage reason, never waiting in the Inbox
  const items = await db.prepare("SELECT state FROM inbound WHERE channel = 'phone'").all();
  assert.equal(items.length, 2);
  assert.ok(items.every((i) => i.state === 'filtered'), 'set aside, not new');
  // the known person: on their history, no Call back step
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM events WHERE person_id = ?').get(known)).n >= 1, true);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM tasks WHERE person_id = ? AND label = 'Call back'").get(known)).n, 0);

  // five minutes later a NEW missed call from an unknown number: handled as always, an Inbox card
  const later = new Date(BACK.getTime() + 5 * 60000);
  const r2 = await syncPbx(db, { now: later, env: ON,
    fetchImpl: pbxList([...calls, call('new.unknown', '2026-11-16 10:03:00', { caller_num: '+37120000009' })]) });
  assert.equal(r2.inbox, 1);
  assert.equal(r2.history || 0, 0);
  assert.equal((await db.prepare("SELECT state FROM inbound WHERE external_id = 'new.unknown'").get()).state, 'new');
});

test('the reason on a set-aside outage call says why', async () => {
  assert.match(OUTAGE_WHY, /history only/);
});

test('a blip under an hour is no outage: its calls are handled as always', async () => {
  const db = await openDb(':memory:');
  const t0 = '2026-11-16T09:40:00.000Z';
  await setState(db, 'pbx_until', t0);
  await setState(db, 'pbx_down_since', t0);
  const r = await syncPbx(db, { now: new Date('2026-11-16T10:00:00Z'), env: ON,
    fetchImpl: pbxList([call('blip.unknown', '2026-11-16 09:50:00')]) });
  assert.equal(r.inbox, 1);
  assert.equal(r.history || 0, 0);
  assert.equal(await state(db, 'pbx_outage'), undefined);
  assert.equal(await state(db, 'pbx_down_since'), undefined);
});

test('a weekend gap without a failure is NOT an outage: nothing changes for it', async () => {
  const db = await openDb(':memory:');
  await setState(db, 'pbx_until', '2026-11-13T15:00:00.000Z');   // Friday 17:00 Riga, no failure noted
  const r = await syncPbx(db, { now: new Date('2026-11-16T06:00:41Z'), env: ON,
    fetchImpl: pbxList([call('mon.unknown', '2026-11-16 05:50:00')]) });
  assert.equal(r.history || 0, 0);
  assert.equal(r.inbox, 1);
  assert.equal(await state(db, 'pbx_outage'), undefined);
});
