// The phone filter before New Leads (Ritvars 01.10.2026: "there will be filtration", "build it now").
//
// Already decided, and kept: a known number goes on the person's timeline; an unknown caller goes
// to New Leads, which is where staff decide whether there is interest; nobody becomes a lead until
// a person qualifies them; a withheld number is only counted. The filter adds two explicit rules,
// both in config.phoneFilter, both counted in the run result, and nothing is ever dropped:
//   1. a number staff already archived as Spam, Supplier or vendor, or Internal is filtered
//      (stored, kept under "Not relevant" with the reason, never in the queue);
//   2. a number that already has an open New Leads item adds the call to THAT item, not a new row.

import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { syncPbx } from '../src/sync.js';
import { listInbound, archive, CONFIG } from '../src/intake.js';

const ON = { PBX_API_TOKEN: 'test-pbx-token-not-real-0000', CHANNEL_MODE_PHONE: 'live' };
const NOW = new Date('2026-10-01T09:05:00Z');
const call = (over = {}) => ({
  uniqueid: 'c1', destination: 'incoming', queue: '1001*Q-ADMISSION',
  caller_num: '+37129111222', state: 'ANSWER', operator_name: 'Ieva',
  created_at: '2026-10-01 11:58:00', ...over,
});
const pbxFetch = (calls) => async () => ({ ok: true, status: 200, json: async () => calls, text: async () => '' });
const run = (db, calls, now = NOW) => syncPbx(db, { now, env: ON, fetchImpl: pbxFetch(calls) });

test('phone filter: the rule is written down in config, where it can be read and changed', () => {
  assert.deepEqual(CONFIG.phoneFilter.filterArchivedAs, ['Spam', 'Supplier or vendor', 'Internal']);
  assert.equal(CONFIG.phoneFilter.oneOpenItemPerNumber, true);
  for (const r of CONFIG.phoneFilter.filterArchivedAs) assert.ok(CONFIG.intake.archiveReasons.includes(r), r);
});

test('phone filter: a first-time unknown caller with no notes reaches New Leads, not clear yet, and is nobody yet', async () => {
  const db = await openDb(':memory:');
  const r = await run(db, [call()]);
  assert.equal(r.inbox, 1);
  const [item] = await listInbound(db, { state: 'new' });
  assert.equal(item.contact_phone, '+37129111222');
  assert.notEqual(item.suggested, 'lead', 'an unknown number is not a lead by itself');
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM people').get()).n, 0, 'no person is created');
});

test('phone filter: a missed first call reaches New Leads too, with the number to ring back', async () => {
  const db = await openDb(':memory:');
  await run(db, [call({ state: 'NOANSWER', operator_name: '' })]);
  const [item] = await listInbound(db, { state: 'new' });
  assert.match(item.body, /^Missed call on button 1/);
  assert.equal(item.contact_phone, '+37129111222');
});

test('phone filter: the same unknown number calling again adds to its open item, one row in New Leads', async () => {
  const db = await openDb(':memory:');
  await run(db, [call()]);
  const r = await run(db, [call({ uniqueid: 'c2', state: 'NOANSWER', operator_name: '', created_at: '2026-10-01 12:20:00' })],
    new Date('2026-10-01T09:30:00Z'));
  assert.equal(r.inbox, 0);
  // One counter for this, not two. The channels lane called it folded and the intake-flow
  // lane called it again; the release keeps `again`, because that is the one the Channels
  // screen prints ("2 rang again") and a counted-but-never-shown number is not a count.
  assert.equal(r.again, 1);
  const open = await listInbound(db, { state: 'new' });
  assert.equal(open.length, 1);
  assert.match(open[0].body, /answered by Ieva/);
  // The second call reads as a LATER one and carries the time it came in, so the row can say
  // WHEN they last rang rather than printing the same sentence twice.
  assert.match(open[0].body, /Rang again 2026-10-01 12:20, missed call on button 1/);
  const calls = await db.prepare('SELECT uniqueid, inbound_id FROM pbx_calls ORDER BY uniqueid').all();
  assert.deepEqual(calls.map((c) => c.inbound_id), [open[0].id, open[0].id], 'every call is still kept, both on the item');
});

test('phone filter: a number archived as Spam, Supplier or vendor, or Internal is filtered next time, with the reason', async () => {
  for (const reason of ['Spam', 'Supplier or vendor', 'Internal']) {
    const db = await openDb(':memory:');
    await run(db, [call()]);
    const [first] = await listInbound(db, { state: 'new' });
    assert.equal((await archive(db, first.id, { reason, note: reason === 'Internal' ? 'our own line' : '', by: 'Ieva' })).ok, true);
    const r = await run(db, [call({ uniqueid: 'c2', created_at: '2026-10-01 12:20:00' })], new Date('2026-10-01T09:30:00Z'));
    assert.equal(r.filtered, 1, reason);
    assert.equal(r.inbox, 0, reason);
    assert.equal((await listInbound(db, { state: 'new' })).length, 0, `${reason}: not in the queue`);
    const gone = (await listInbound(db, { state: 'notrelevant' })).find((i) => i.external_id === 'c2');
    assert.ok(gone, `${reason}: kept under Not relevant, never dropped`);
    assert.equal(gone.state, 'filtered');
    assert.match(gone.archive_note, new RegExp(`archived before as "${reason}"`));
    assert.equal(gone.contact_phone, '+37129111222', 'the number is still there to look at');
    assert.match(gone.body || '', /Incoming call on button 1/, 'decision 1d: filtering never deletes the body at once');
    const row = await db.prepare('SELECT body_deleted_at FROM inbound WHERE id = ?').get(gone.id);
    assert.equal(row.body_deleted_at, null);
  }
});

test('phone filter: any other archive reason does not filter the number; the next call is assessed again', async () => {
  const db = await openDb(':memory:');
  await run(db, [call()]);
  const [first] = await listInbound(db, { state: 'new' });
  await archive(db, first.id, { reason: 'Not a prospective student', by: 'Ieva' });
  const r = await run(db, [call({ uniqueid: 'c2', created_at: '2026-10-01 12:20:00' })], new Date('2026-10-01T09:30:00Z'));
  assert.equal(r.inbox, 1);
  assert.equal(r.filtered, 0);
});

test('phone filter: a withheld number still only counts, and a known number still goes on the person', async () => {
  const db = await openDb(':memory:');
  await db.prepare('INSERT INTO people (id, name, phone, status) VALUES (?,?,?,?)').run('p1', 'Jonas', '+37129111222', 'New');
  const r = await run(db, [call(), call({ uniqueid: 'c2', caller_num: '' })]);
  assert.equal(r.logged, 1);
  assert.equal(r.noNumber, 1);
  assert.equal(r.inbox + r.again + r.filtered, 0);
});

// Ritvars 02.10.2026: "If they have numbers with names to them (existing leads) they get recorded for
// needs action which is today". A known lead who rang and nobody answered must reach Today as a step,
// not only a line on their history that nobody is asked to read.
test('a missed call from a known lead puts a Call back step in their Today', async () => {
  const db = await openDb(':memory:');
  await db.prepare('INSERT INTO people (id, name, phone, status) VALUES (?,?,?,?)').run('p1', 'Jonas', '+37129111222', 'Contacted');
  const r = await run(db, [call({ state: 'NOANSWER' })]);
  assert.equal(r.logged, 1, 'still logged on the person');
  const open = await db.prepare('SELECT * FROM tasks WHERE person_id = ? AND done_at IS NULL').all('p1');
  assert.equal(open.length, 1, 'one step');
  assert.equal(open[0].label, 'Call back');
  assert.ok(CONFIG.nextActions.some((g) => g.items.some((i) => i.label === 'Call back')), 'a configured step, not a word in the code');
  assert.equal(open[0].due_at, new Date('2026-10-01T08:58:00Z').toISOString(), 'due when they rang: they have waited since then');
});

test('a second missed call does not stack a second Call back', async () => {
  const db = await openDb(':memory:');
  await db.prepare('INSERT INTO people (id, name, phone, status) VALUES (?,?,?,?)').run('p1', 'Jonas', '+37129111222', 'Contacted');
  await run(db, [call({ state: 'NOANSWER' }), call({ uniqueid: 'c2', state: 'NOANSWER', created_at: '2026-10-01 12:03:00' })]);
  const open = await db.prepare("SELECT * FROM tasks WHERE person_id = ? AND done_at IS NULL AND label = 'Call back'").all('p1');
  assert.equal(open.length, 1);
});

test('an answered call, or a finished person, adds no step', async () => {
  const db = await openDb(':memory:');
  await db.prepare('INSERT INTO people (id, name, phone, status) VALUES (?,?,?,?)').run('p1', 'Jonas', '+37129111222', 'Contacted');
  await db.prepare('INSERT INTO people (id, name, phone, status) VALUES (?,?,?,?)').run('p2', 'Anna', '+37129333444', 'Admitted');
  await run(db, [call(), call({ uniqueid: 'c2', caller_num: '+37129333444', state: 'NOANSWER' })]);
  const n = (await db.prepare('SELECT COUNT(*) n FROM tasks').get()).n;
  assert.equal(Number(n), 0);
});
