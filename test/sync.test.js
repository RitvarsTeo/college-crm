// The PBX and SIS pollers, end to end against a real database.
//
// NOTHING HERE CALLS THE PBX OR THE SIS AND NOTHING NEEDS A REAL TOKEN. Every
// test hands in a fake fetch and a token that announces itself as fake.

import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { syncPbx, syncSis, channelMode } from '../src/sync.js';
import { buildUrl, fetchPage, SIS_URL } from '../lib/sis.js';

const PBX_TOKEN = 'test-pbx-token-not-real-0000';
const SIS_TOKEN = 'test-sis-token-not-real-0000';
const ON = { PBX_API_TOKEN: PBX_TOKEN, SIS_API_TOKEN: SIS_TOKEN,
  CHANNEL_MODE_PHONE: 'live', CHANNEL_MODE_SIS: 'live' };
const NOW = new Date('2026-09-28T09:05:00Z');

async function fresh() {
  const db = await openDb(':memory:');
  return db;
}

async function person(db, over = {}) {
  const p = { id: 'p' + Math.random().toString(36).slice(2, 7), name: 'Jonas Berzins', email: null,
    phone: null, status: 'New', ...over };
  await db.prepare('INSERT INTO people (id, name, email, phone, status) VALUES (?,?,?,?,?)')
    .run(p.id, p.name, p.email, p.phone, p.status);
  return p;
}

const events = (db, personId) => db.prepare('SELECT * FROM events WHERE person_id = ? ORDER BY id').all(personId);
const inbox = (db, channel) => (channel
  ? db.prepare('SELECT * FROM inbound WHERE channel = ? ORDER BY id').all(channel)
  : db.prepare('SELECT * FROM inbound ORDER BY id').all());
// Since 30.09.2026 an applicant nobody has seen is created by the SIS (test/application_first.test.js).
// The New Leads path is for somebody already waiting there: an email from the same address, unconfirmed.
async function waitingEmail(db, email = 'jonas@example.com') {
  const { receive } = await import('../src/intake.js');
  await receive(db, { channel: 'email', externalId: 'mail-' + email, email, body: 'Hello', source: 'simulated' });
}

// ------------------------------------------------------------------ PBX ----

const call = (over = {}) => ({
  uniqueid: '1727514000.1', destination: 'incoming', queue: '1001*Q-ADMISSION',
  caller_num: '+37129111222', state: 'ANSWER', operator_name: 'Ieva',
  created_at: '2026-09-28 11:58:00', ...over,
});
const pbxFetch = (calls) => async () => ({ ok: true, status: 200, json: async () => calls, text: async () => '' });

test('phone: off by default, and then nothing is fetched', async () => {
  const db = await fresh();
  let called = false;
  const r = await syncPbx(db, { now: NOW, env: { PBX_API_TOKEN: PBX_TOKEN }, fetchImpl: async () => { called = true; } });
  assert.equal(r.ran, false);
  assert.equal(called, false);
  assert.equal(await channelMode(db, 'phone', {}), 'off');
});

test('phone: a known caller is logged on the person, not sent to the Inbox', async () => {
  const db = await fresh();
  const p = await person(db, { phone: '+371 29 111 222' });
  const r = await syncPbx(db, { now: NOW, env: ON, fetchImpl: pbxFetch([call()]) });
  assert.equal(r.logged, 1);
  assert.equal(r.inbox, 0);
  const ev = (await events(db, p.id)).filter((e) => e.kind === 'call');
  assert.equal(ev.length, 1);
  assert.equal(ev[0].subject, 'Incoming call on button 1 (Admissions), answered by Ieva');
  assert.equal(ev[0].origin, 'automatic');
  assert.equal(ev[0].occurred_at, '2026-09-28T08:58:00.000Z', 'Riga 11:58 in summer is 08:58 UTC');
  const row = await db.prepare('SELECT * FROM people WHERE id = ?').get(p.id);
  assert.equal(row.last_contact_at, '2026-09-28T08:58:00.000Z');
  assert.equal((await inbox(db)).length, 0);
});

test('phone: an unknown caller goes to the Inbox, and a missed call says so', async () => {
  const db = await fresh();
  const r = await syncPbx(db, { now: NOW, env: ON,
    fetchImpl: pbxFetch([call({ state: 'NOANSWER', operator_name: '', queue: '1001*Q-OTHER' })]) });
  assert.equal(r.inbox, 1);
  const [item] = await inbox(db);
  assert.equal(item.channel, 'phone');
  assert.equal(item.external_id, '1727514000.1');
  assert.equal(item.contact_phone, '+37129111222');
  assert.equal(item.source, 'provider');
  assert.match(item.body, /^Missed call on button 3/);
  const stored = await db.prepare('SELECT * FROM pbx_calls').all();
  assert.equal(stored.length, 1);
  assert.equal(stored[0].picked_up, 0);
  assert.equal(stored[0].inbound_id, item.id);
});

test('phone: the overlapping window never logs a call twice', async () => {
  const db = await fresh();
  const p = await person(db, { phone: '29111222' });
  const calls = [call(), call({ uniqueid: 'x2', caller_num: '+37120000001' })];
  await syncPbx(db, { now: NOW, env: ON, fetchImpl: pbxFetch(calls) });
  const again = await syncPbx(db, { now: new Date(NOW.getTime() + 300000), env: ON, fetchImpl: pbxFetch(calls) });
  assert.equal(again.seen, 2);
  assert.equal(again.logged + again.inbox, 0);
  assert.equal((await events(db, p.id)).filter((e) => e.kind === 'call').length, 1);
  assert.equal((await inbox(db)).length, 1);
});

test('phone: a withheld number is kept for the counts but raises nothing', async () => {
  const db = await fresh();
  const r = await syncPbx(db, { now: NOW, env: ON, fetchImpl: pbxFetch([call({ caller_num: '' })]) });
  assert.equal(r.noNumber, 1);
  assert.equal((await inbox(db)).length, 0);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM pbx_calls').get()).n, 1);
});

test('phone: two people with the same number is a question for a human', async () => {
  const db = await fresh();
  await person(db, { phone: '+37129111222' });
  await person(db, { name: 'Other', phone: '29111222' });
  const r = await syncPbx(db, { now: NOW, env: ON, fetchImpl: pbxFetch([call()]) });
  assert.equal(r.logged, 0);
  assert.equal(r.inbox, 1);
});

test('phone: a test mode run is marked simulated, so it never proves a channel connected', async () => {
  const db = await fresh();
  await syncPbx(db, { now: NOW, env: { ...ON, CHANNEL_MODE_PHONE: 'test' }, fetchImpl: pbxFetch([call()]) });
  assert.equal((await inbox(db))[0].source, 'simulated');
});

// ------------------------------------------------------------------ SIS ----

const app = (over = {}) => ({
  reference: 'ref-1', applicationId: 'app-1', givenName: 'Jonas', familyName: 'Berzins',
  email: 'jonas@example.com', phone: '+371 20000000', programmeCode: 'NAV',
  programmeName: 'Maritime Transport', status: 'submitted',
  registeredAt: '2026-09-28T07:40:11.000Z', submittedAt: '2026-09-28T07:58:02.000Z',
  changedAt: '2026-09-28T07:58:02.000Z', ...over,
});

// ------------------------------------------------ phone catch-up (29.09.2026) ---
// TeleGroup fails on a wide window, so a run walks forward in 15-minute pieces from the
// bookmark to now. Once a day on Hobby therefore still brings in the whole day.

function recordingPbx(calls = () => []) {
  const seen = [];
  const fetchImpl = async (url) => {
    const u = new URL(url);
    seen.push({ from: u.searchParams.get('dateFrom'), to: u.searchParams.get('dateTo') });
    return { ok: true, status: 200, json: async () => calls(seen.length), text: async () => '' };
  };
  return { seen, fetchImpl };
}

test('phone catch-up: the first run reads the last 24 hours in 96 pieces of 15 minutes, back to back', async () => {
  const db = await fresh();
  const pbx = recordingPbx();
  const r = await syncPbx(db, { now: NOW, env: ON, fetchImpl: pbx.fetchImpl });
  assert.equal(r.pieces, 96);
  assert.equal(r.caughtUp, true);
  for (let i = 1; i < pbx.seen.length; i++) assert.equal(pbx.seen[i].from, pbx.seen[i - 1].to, 'no gap between pieces');
  assert.equal(pbx.seen[0].from, '2026-09-27 12:05:00', '24 hours back, in Riga time');
  assert.equal(pbx.seen.at(-1).to, '2026-09-28 12:05:00');
});

test('phone catch-up: the next run starts from the bookmark (2 minutes early), not from 24 hours back', async () => {
  const db = await fresh();
  await syncPbx(db, { now: NOW, env: ON, fetchImpl: recordingPbx().fetchImpl });
  const pbx = recordingPbx();
  const later = new Date(NOW.getTime() + 3 * 3600000);
  const r = await syncPbx(db, { now: later, env: ON, fetchImpl: pbx.fetchImpl });
  assert.equal(pbx.seen[0].from, '2026-09-28 12:03:00');
  assert.equal(pbx.seen.at(-1).to, '2026-09-28 15:05:00');
  assert.equal(r.pieces, 13, '3 hours and 2 minutes = 12 full pieces and a short one');
});

test('phone catch-up: a call found in the morning piece of a daily run is stored once', async () => {
  const db = await fresh();
  const pbx = recordingPbx((n) => (n === 10 ? [call({ uniqueid: 'morning-1', caller_num: '+37120000009' })] : []));
  const r = await syncPbx(db, { now: NOW, env: ON, fetchImpl: pbx.fetchImpl });
  assert.equal(r.inbox, 1);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM pbx_calls').get()).n, 1);
});

test('phone catch-up: a run that runs out of time saves how far it got, and the next run carries on', async () => {
  const db = await fresh();
  let t = 0;
  const clock = () => (t += 1000);           // every look at the clock is one second later
  const first = await syncPbx(db, { now: NOW, env: ON, fetchImpl: recordingPbx().fetchImpl, budgetMs: 10000, clock });
  assert.equal(first.caughtUp, false);
  assert.ok(first.pieces > 0 && first.pieces < 96);
  const pbx = recordingPbx();
  const second = await syncPbx(db, { now: NOW, env: ON, fetchImpl: pbx.fetchImpl });
  assert.equal(second.caughtUp, true);
  const mark = Date.parse((await db.prepare("SELECT value FROM sync_state WHERE name = 'pbx_until'").get()).value);
  assert.equal(mark, NOW.getTime(), 'the bookmark ends at now');
  const { toRigaStamp } = await import('../lib/riga.js');
  const stopped = NOW.getTime() - 24 * 3600000 + first.pieces * 15 * 60000;
  assert.equal(pbx.seen[0].from, toRigaStamp(new Date(stopped - 2 * 60000)), 'carries on from where the first run stopped');
  assert.equal(first.pieces + second.pieces, 97, 'the one extra piece is the 2-minute overlap');
});

test('phone catch-up: a failed piece keeps the bookmark at the last good piece', async () => {
  const db = await fresh();
  let n = 0;
  const fetchImpl = async () => (++n === 5 ? { ok: false, status: 500, text: async () => '' }
    : { ok: true, status: 200, json: async () => [], text: async () => '' });
  await assert.rejects(syncPbx(db, { now: NOW, env: ON, fetchImpl }), /PBX returned 500/);
  const mark = await db.prepare("SELECT value FROM sync_state WHERE name = 'pbx_until'").get();
  assert.equal(mark.value, new Date(NOW.getTime() - 24 * 3600000 + 4 * 15 * 60000).toISOString());
});

// ---------------------------------------------------- retention, 13 months ---

test('retention: a phone call older than 13 months is deleted, a newer one is kept, the timeline entry stays', async () => {
  const db = await fresh();
  const p = await person(db, { phone: '29111222' });
  const old = new Date(NOW.getTime() - 400 * 86400000);
  await syncPbx(db, { now: old, env: ON, fetchImpl: pbxFetch([call({ uniqueid: 'old-1', created_at: '2025-08-24 11:00:00' })]) });
  await db.prepare("DELETE FROM sync_state WHERE name = 'pbx_until'").run();
  const r = await syncPbx(db, { now: NOW, env: ON, fetchImpl: pbxFetch([call({ uniqueid: 'new-1' })]) });
  assert.equal(r.purged, 1);
  const left = (await db.prepare('SELECT uniqueid FROM pbx_calls').all()).map((x) => x.uniqueid);
  assert.deepEqual(left, ['new-1']);
  assert.equal((await events(db, p.id)).filter((e) => e.kind === 'call').length, 2, 'the person keeps both calls');
});

test('retention: the cutoff is 13 calendar months back', async () => {
  const { retentionCutoff } = await import('../src/sync.js');
  assert.equal(retentionCutoff(new Date('2026-09-29T10:00:00.000Z')), '2025-08-29T10:00:00.000Z');
});

// A fake SIS: pages of applicants, and a record of every request it was sent.
function fakeSis(pages) {
  const seen = [];
  const fetchImpl = async (url, opts) => {
    seen.push({ url: String(url), auth: opts.headers.authorization });
    const u = new URL(url);
    const i = u.searchParams.get('cursor') ? Number(u.searchParams.get('cursor')) : 0;
    const page = pages[i] || [];
    return { ok: true, status: 200,
      json: async () => ({ applicants: page, nextCursor: i + 1 < pages.length ? String(i + 1) : null }) };
  };
  return { fetchImpl, seen };
}

test('sis: off by default, and then nothing is fetched', async () => {
  const db = await fresh();
  const sis = fakeSis([[app()]]);
  const r = await syncSis(db, { now: NOW, env: { SIS_API_TOKEN: SIS_TOKEN }, fetchImpl: sis.fetchImpl });
  assert.equal(r.ran, false);
  assert.equal(sis.seen.length, 0);
});

test('sis: one matching person by email moves forward by themselves', async () => {
  const db = await fresh();
  const p = await person(db, { email: 'Jonas@Example.com' });
  const r = await syncSis(db, { now: NOW, env: ON, fetchImpl: fakeSis([[app()]]).fetchImpl });
  assert.equal(r.linked, 1);
  assert.equal(r.moved, 1);
  assert.equal(r.inbox, 0);
  assert.equal((await db.prepare('SELECT status FROM people WHERE id = ?').get(p.id)).status, 'Application');
  const ev = await events(db, p.id);
  assert.ok(ev.some((e) => e.subject === 'Linked to the SIS applicant record'));
  const move = ev.find((e) => e.kind === 'status');
  assert.equal(move.subject, 'Status: New -> Application');
  assert.equal(move.actor, 'SIS');
  assert.equal(move.origin, 'automatic');
});

test('sis: admitted moves the person to Admitted and stamps the day', async () => {
  const db = await fresh();
  const p = await person(db, { phone: '20000000', status: 'Contract' });
  await syncSis(db, { now: NOW, env: ON, fetchImpl: fakeSis([[app({ status: 'admitted' })]]).fetchImpl });
  const row = await db.prepare('SELECT status, admitted_at FROM people WHERE id = ?').get(p.id);
  assert.equal(row.status, 'Admitted');
  assert.equal(row.admitted_at, NOW.toISOString());
});

test('sis: a stage never moves backwards, and a closed person is never reopened', async () => {
  const db = await fresh();
  const ahead = await person(db, { email: 'jonas@example.com', status: 'Contract' });
  const closed = await person(db, { name: 'Anna', email: 'anna@example.com', status: 'Not proceeding' });
  await syncSis(db, { now: NOW, env: ON, fetchImpl: fakeSis([[
    app(), app({ reference: 'ref-2', applicationId: 'app-2', email: 'anna@example.com', status: 'admitted' }),
  ]]).fetchImpl });
  assert.equal((await db.prepare('SELECT status FROM people WHERE id = ?').get(ahead.id)).status, 'Contract');
  assert.equal((await db.prepare('SELECT status FROM people WHERE id = ?').get(closed.id)).status, 'Not proceeding');
});

test('sis: an applicant already waiting in New Leads goes to the Inbox once, not every five minutes', async () => {
  const db = await fresh();
  await waitingEmail(db);
  const first = await syncSis(db, { now: NOW, env: ON, fetchImpl: fakeSis([[app()]]).fetchImpl });
  assert.equal(first.inbox, 1);
  const [item] = await inbox(db, 'sis');
  assert.equal(item.channel, 'sis');
  assert.equal(item.contact_name, 'Jonas Berzins');
  assert.equal(item.contact_email, 'jonas@example.com');
  assert.equal(item.body, 'SIS: NAV application submitted');
  const second = await syncSis(db, { now: NOW, env: ON,
    fetchImpl: fakeSis([[app({ status: 'admitted', changedAt: '2026-09-28T08:30:00.000Z' })]]).fetchImpl });
  assert.equal(second.inbox, 0);
  assert.equal((await inbox(db, 'sis')).length, 1);
});

test('sis: once a person confirms the Inbox item, the next run links and moves them', async () => {
  const db = await fresh();
  await waitingEmail(db);
  await syncSis(db, { now: NOW, env: ON, fetchImpl: fakeSis([[app()]]).fetchImpl });
  const [item] = await inbox(db, 'sis');
  // what the Inbox's qualify step leaves behind, without an email on the person
  const p = await person(db, { name: 'J. Berzins' });
  await db.prepare("UPDATE inbound SET state = 'qualified', person_id = ? WHERE id = ?").run(p.id, item.id);
  const r = await syncSis(db, { now: NOW, env: ON, fetchImpl: fakeSis([[]]).fetchImpl });
  assert.equal(r.linked, 1);
  assert.equal((await db.prepare('SELECT status FROM people WHERE id = ?').get(p.id)).status, 'Application');
});

test('sis: an Inbox item a person archived is never raised again', async () => {
  const db = await fresh();
  await waitingEmail(db);
  await syncSis(db, { now: NOW, env: ON, fetchImpl: fakeSis([[app()]]).fetchImpl });
  await db.prepare("UPDATE inbound SET state = 'archived' WHERE channel = 'sis'").run();
  await syncSis(db, { now: NOW, env: ON,
    fetchImpl: fakeSis([[app({ status: 'admitted', changedAt: '2026-09-28T09:00:00.000Z' })]]).fetchImpl });
  assert.equal((await inbox(db, 'sis')).length, 1);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM people').get()).n, 0, 'and nobody is created');
});

test('sis: rejected or withdrawn is written on the timeline, and the stage is left to a human', async () => {
  const db = await fresh();
  const p = await person(db, { email: 'jonas@example.com' });
  await syncSis(db, { now: NOW, env: ON, fetchImpl: fakeSis([[app()]]).fetchImpl });
  await syncSis(db, { now: NOW, env: ON,
    fetchImpl: fakeSis([[app({ status: 'withdrawn', changedAt: '2026-09-28T08:00:00.000Z' })]]).fetchImpl });
  assert.equal((await db.prepare('SELECT status FROM people WHERE id = ?').get(p.id)).status, 'Application');
  assert.ok((await events(db, p.id)).some((e) => e.subject === 'SIS: NAV application withdrawn'));
});

test('sis: the furthest application wins when a person applied to two programmes', async () => {
  const db = await fresh();
  const p = await person(db, { email: 'jonas@example.com' });
  await syncSis(db, { now: NOW, env: ON, fetchImpl: fakeSis([[
    app(), app({ applicationId: 'app-2', programmeCode: 'ENG', status: 'admitted' }),
  ]]).fetchImpl });
  assert.equal((await db.prepare('SELECT status FROM people WHERE id = ?').get(p.id)).status, 'Admitted');
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM sis_applicants').get()).n, 2);
});

test('sis: an older copy arriving late changes nothing', async () => {
  const db = await fresh();
  await syncSis(db, { now: NOW, env: ON,
    fetchImpl: fakeSis([[app({ status: 'admitted', changedAt: '2026-09-28T09:00:00.000Z' })]]).fetchImpl });
  await syncSis(db, { now: NOW, env: ON, fetchImpl: fakeSis([[app()]]).fetchImpl });
  assert.equal((await db.prepare('SELECT status FROM sis_applicants').get()).status, 'admitted');
});

test('sis: every page is followed, and the next run asks only for what changed since', async () => {
  const db = await fresh();
  const sis = fakeSis([
    [app({ reference: 'a', changedAt: '2026-09-28T07:00:00.000Z' })],
    [app({ reference: 'b', changedAt: '2026-09-28T08:00:00.000Z' })],
  ]);
  const r = await syncSis(db, { now: NOW, env: ON, fetchImpl: sis.fetchImpl });
  assert.equal(r.pages, 2);
  assert.equal(r.stored, 2);
  assert.equal(r.next, '2026-09-28T08:00:00.000Z');
  assert.ok(!new URL(sis.seen[0].url).searchParams.has('since'), 'the first run asks for everyone');
  assert.equal(new URL(sis.seen[1].url).searchParams.get('cursor'), '1');

  const later = fakeSis([[]]);
  await syncSis(db, { now: NOW, env: ON, fetchImpl: later.fetchImpl });
  assert.equal(new URL(later.seen[0].url).searchParams.get('since'), '2026-09-28T08:00:00.000Z');
});

test('sis: the token goes only in the Authorization header, and never into an error', async () => {
  const sis = fakeSis([[app()]]);
  await fetchPage({ env: ON, fetchImpl: sis.fetchImpl });
  assert.equal(sis.seen[0].auth, `Bearer ${SIS_TOKEN}`);
  assert.ok(!sis.seen[0].url.includes(SIS_TOKEN));
  assert.equal(new URL(buildUrl({ since: '2026-09-28T00:00:00Z' })).origin
    + new URL(buildUrl({})).pathname, SIS_URL);

  await assert.rejects(fetchPage({ env: ON, fetchImpl: async () => ({ ok: false, status: 404 }) }),
    (err) => { assert.match(err.message, /wrong or revoked/); assert.ok(!err.message.includes(SIS_TOKEN)); return true; });
  await assert.rejects(fetchPage({ env: ON, fetchImpl: async () => { throw new Error(`boom Bearer ${SIS_TOKEN}`); } }),
    (err) => { assert.ok(!err.message.includes(SIS_TOKEN)); return true; });
  await assert.rejects(fetchPage({ env: {}, fetchImpl: sis.fetchImpl }), /SIS_API_TOKEN/);
});

test('sis: a failed run keeps the bookmark, so nothing is skipped', async () => {
  const db = await fresh();
  await syncSis(db, { now: NOW, env: ON, fetchImpl: fakeSis([[app()]]).fetchImpl });
  await assert.rejects(syncSis(db, { now: NOW, env: ON, fetchImpl: async () => ({ ok: false, status: 429 }) }));
  assert.equal((await db.prepare("SELECT value FROM sync_state WHERE name = 'sis'").get()).value,
    '2026-09-28T07:58:02.000Z');
});

// -------------------------------------------- SIS -> lifecycle facts (29.09.2026) ---
// The sync hands every linked row to src/lifecycle.js, which writes "Application form started" and
// "Matriculated" once each, dated by the SIS record (PROVISIONAL mapping, docs/LIFECYCLE.md).

test('sis -> lifecycle: a linked "started" row writes Application form started once, dated by changedAt', async () => {
  const db = await fresh();
  const p = await person(db, { email: 'jonas@example.com' });
  const started = app({ status: 'started', changedAt: '2026-09-28T07:45:00.000Z' });
  const r1 = await syncSis(db, { now: NOW, env: ON, fetchImpl: fakeSis([[started]]).fetchImpl });
  assert.equal(r1.facts, 1);
  const r2 = await syncSis(db, { now: NOW, env: ON, fetchImpl: fakeSis([[started]]).fetchImpl });
  assert.equal(r2.facts, 0, 'the same record again writes nothing');
  const { lifecycleOf } = await import('../src/lifecycle.js');
  assert.deepEqual((await lifecycleOf(db, p.id)).map((f) => [f.fact, f.at]), [['form_started', '2026-09-28T07:45:00.000Z']]);
});

test('sis -> lifecycle: matriculated arrives later and is added; the first fact keeps its date', async () => {
  const db = await fresh();
  const p = await person(db, { email: 'jonas@example.com' });
  await syncSis(db, { now: NOW, env: ON, fetchImpl: fakeSis([[app({ status: 'started', changedAt: '2026-09-28T07:45:00.000Z' })]]).fetchImpl });
  const r = await syncSis(db, { now: NOW, env: ON, fetchImpl: fakeSis([[app({ status: 'matriculated', changedAt: '2026-10-05T09:00:00.000Z' })]]).fetchImpl });
  assert.equal(r.facts, 1);
  const { lifecycleOf } = await import('../src/lifecycle.js');
  assert.deepEqual((await lifecycleOf(db, p.id)).map((f) => [f.fact, f.at]),
    [['form_started', '2026-09-28T07:45:00.000Z'], ['matriculated', '2026-10-05T09:00:00.000Z']]);
});

test('sis -> lifecycle: submitted = form started by its submit date; registered writes nothing', async () => {
  const db = await fresh();
  const p = await person(db, { email: 'jonas@example.com' });
  const r = await syncSis(db, { now: NOW, env: ON, fetchImpl: fakeSis([[app({ status: 'submitted' }),
    app({ reference: 'ref-2', applicationId: 'app-9', email: 'nobody@example.com', phone: null, status: 'started' }),
    app({ reference: 'ref-3', applicationId: null, email: 'reg@example.com', phone: null, status: 'registered', submittedAt: null })]]).fetchImpl });
  assert.equal(r.facts, 2, 'the matched submitted one, and the started one the SIS created');
  assert.equal(r.created, 2, 'the two unknown are created by the SIS (30.09.2026)');
  assert.equal(r.inbox, 0);
  const { lifecycleOf } = await import('../src/lifecycle.js');
  assert.deepEqual((await lifecycleOf(db, p.id)).map((f) => [f.fact, f.at]), [['form_started', '2026-09-28T07:58:02.000Z']]);
  const reg = await db.prepare("SELECT person_id FROM sis_applicants WHERE reference = 'ref-3'").get();
  assert.deepEqual(await lifecycleOf(db, reg.person_id), [], 'registered only: no fact');
});

test('sis -> lifecycle: a fact on the second page is found (the cursor is followed)', async () => {
  const db = await fresh();
  await person(db, { email: 'jonas@example.com' });
  const sis = fakeSis([[app({ reference: 'ref-0', applicationId: null, email: 'other@example.com', phone: null,
    status: 'registered', submittedAt: null })],
    [app({ status: 'started' })]]);
  const r = await syncSis(db, { now: NOW, env: ON, fetchImpl: sis.fetchImpl });
  assert.equal(sis.seen.length, 2);
  assert.match(sis.seen[1].url, /cursor=1/);
  assert.doesNotMatch(sis.seen[1].url, /since=/, 'the cursor page carries no since');
  assert.equal(r.facts, 1);
});

// ---------------------------------------------- one number, one thing to look at
// Ritvars, 01.10.2026: "Leads become those who have some interest. How can we know
// about a caller with no notes? So a new number called first time sits in to look at."
// A stranger who rings three times is one person to call back, not three. Before
// this, every call wrote its own queue row, because the only de-duplication was on
// the call's own uniqueid and each call has a different one.
test('phone: the same unknown number ringing again joins the row it already has', async () => {
  const db = await fresh();
  const first = call({ uniqueid: 'c1', state: 'NOANSWER', operator_name: '',
    queue: '1001*Q-OTHER', created_at: '2026-09-28 11:58:00' });
  const second = call({ uniqueid: 'c2', state: 'NOANSWER', operator_name: '',
    queue: '1001*Q-OTHER', caller_num: '371 29 111 222', created_at: '2026-09-28 12:01:00' });

  const a = await syncPbx(db, { now: NOW, env: ON, fetchImpl: pbxFetch([first]) });
  assert.equal(a.inbox, 1);
  const [one] = await inbox(db);

  const b = await syncPbx(db, { now: new Date(NOW.getTime() + 300000), env: ON,
    fetchImpl: pbxFetch([second]) });
  assert.equal(b.inbox, 0, 'the second call is not a second thing to look at');
  assert.equal(b.again, 1, 'it is counted as the same number ringing again');

  const rows = await inbox(db);
  assert.equal(rows.length, 1, 'one number, one row');
  assert.match(rows[0].body, /Missed call on button 3/);
  assert.match(rows[0].body, /rang again/i, 'the row says they rang again');

  // THE CLOCK DOES NOT RESTART. Somebody who keeps ringing has waited LONGER, not
  // less, so a repeat call must never push them back down the queue or clear "late".
  assert.equal(rows[0].received_at, one.received_at);
  assert.equal(rows[0].surface_at, one.surface_at);

  // both calls are kept, and both point at the one row
  const stored = await db.prepare('SELECT * FROM pbx_calls ORDER BY uniqueid').all();
  assert.equal(stored.length, 2);
  assert.deepEqual(stored.map((s) => s.inbound_id), [rows[0].id, rows[0].id]);
});

test('phone: a number that rings again AFTER its row was dealt with starts a new one', async () => {
  const db = await fresh();
  const first = call({ uniqueid: 'c1', state: 'NOANSWER', operator_name: '', queue: '1001*Q-OTHER' });
  await syncPbx(db, { now: NOW, env: ON, fetchImpl: pbxFetch([first]) });
  const [one] = await inbox(db);
  await db.prepare("UPDATE inbound SET state = 'archived' WHERE id = ?").run(one.id);

  const r = await syncPbx(db, { now: new Date(NOW.getTime() + 300000), env: ON,
    fetchImpl: pbxFetch([call({ uniqueid: 'c2', state: 'NOANSWER', operator_name: '', queue: '1001*Q-OTHER' })]) });
  assert.equal(r.inbox, 1, 'the queue is empty for them again, so this is new');
  assert.equal((await inbox(db)).length, 2);
});
