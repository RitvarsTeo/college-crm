// THE SIS'S OWN DATE (Ritvars, 06.10.2026). The pull of 06.10 made 489 people out of the students the SIS
// loaded on 05.10, all Admitted on the day the pull ran. His decisions:
//   - re-date them to their real SIS date; the ones the SIS dates 2026 count as 2026 admissions
//   - from now on the pull uses the record's real date, never the day it ran
//   - "have to be sure, which one to not make a recycle bin": no usable date, no person
// NOTHING HERE CALLS THE SIS: a fake fetch and a fake token, made-up people.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { syncSis, receiveSisApplication } from '../src/sync.js';
import { sisAdmissionDate, redateSisAdmissions } from '../src/sisdates.js';
import { report } from '../src/reports.js';
import { toSisRow } from '../lib/sis.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ON = { SIS_API_TOKEN: 'test-sis-token-not-real-0000', CHANNEL_MODE_SIS: 'live' };
const NOW = new Date('2026-10-07T05:00:00Z');
const PULL = '2026-10-06T05:31:40.959Z';             // the old pull's own clock

// a student the SIS loaded on 05.10: registered and changed that day, submitted years ago
const student = (i, submittedAt, over = {}) => ({
  reference: `ref-${i}`, applicationId: `app-${i}`, givenName: 'Test', familyName: `Student${i}`,
  email: `student${i}@example.com`, phone: null, programmeCode: 'NAV', status: 'matriculated',
  registeredAt: '2026-10-05T10:20:00.000Z', submittedAt, changedAt: `2026-10-05T10:${String(20 + i).padStart(2, '0')}:00.000Z`, ...over,
});
const sis = (apps) => async () => ({ ok: true, status: 200, json: async () => ({ applicants: apps, nextCursor: null }) });
const pull = (db, apps, now = NOW) => syncSis(db, { now, env: ON, fetchImpl: sis(apps) });
const one = (db, email) => db.prepare('SELECT * FROM people WHERE email = ?').get(email);
const year = (y) => ({ from: `${y}-01-01`, to: `${y}-12-31` });

// -------------------------------------------------------------- the pull, from now on --

test('pull: a student the SIS dates 2015 is admitted, and arrived, in 2015; one dated 2026 stays 2026', async () => {
  const db = await openDb(':memory:');
  const r = await pull(db, [student(1, '2015-08-20T09:00:00.000Z'), student(2, '2026-08-14T09:00:00.000Z')]);
  assert.equal(r.created, 2);
  assert.equal(r.undated, 0);
  const old = await one(db, 'student1@example.com');
  assert.equal(old.status, 'Admitted');
  assert.equal(old.admitted_at, '2015-08-20T09:00:00.000Z', 'the SIS date, never the run');
  assert.equal(old.created_at, '2015-08-20T09:00:00.000Z', 'arrival is never after the admission');
  const now = await one(db, 'student2@example.com');
  assert.equal(now.admitted_at, '2026-08-14T09:00:00.000Z');
  for (const p of [old, now]) assert.notEqual(p.admitted_at.slice(0, 10), NOW.toISOString().slice(0, 10));
  // Reports (and Home, which counts the same admitted_at) put each in its own year
  assert.equal((await report(db, year(2026))).summary.admitted, 1);
  assert.equal((await report(db, year(2015))).summary.admitted, 1);
  assert.equal((await report(db, year(2026))).summary.newLeads, 1, 'the 2015 student did not arrive in 2026');
});

test('pull: a matriculated record with no usable date makes no person, no Inbox item; it is stored and counted', async () => {
  const db = await openDb(':memory:');
  const r = await pull(db, [student(3, null)]);
  assert.equal(r.created, 0);
  assert.equal(r.undated, 1);
  assert.equal(r.inbox, 0);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM people').get()).n, 0);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM inbound').get()).n, 0);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM events').get()).n, 0);
  const held = await db.prepare('SELECT status, person_id FROM sis_applicants WHERE reference = ?').get('ref-3');
  assert.deepEqual({ ...held }, { status: 'matriculated', person_id: null });
  const detail = JSON.parse((await db.prepare("SELECT detail FROM sync_state WHERE name = 'sis'").get()).detail);
  assert.equal(detail.undated, 1, 'the run detail says how many were held undated');
  // the SIS dates it later: now it becomes a person, in its own year
  const r2 = await pull(db, [student(3, '2019-07-01T08:00:00.000Z', { changedAt: '2026-10-06T09:00:00.000Z' })]);
  assert.equal(r2.created, 1);
  assert.equal((await one(db, 'student3@example.com')).admitted_at, '2019-07-01T08:00:00.000Z');
});

test('the webhook path follows the same rule: undated is held, dated lands in its year', async () => {
  const db = await openDb(':memory:');
  const env = ON;
  assert.equal((await receiveSisApplication(db, student(4, null), { now: NOW, env })).outcome, 'undated');
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM people').get()).n, 0);
  assert.equal((await receiveSisApplication(db, student(5, '2021-09-01T07:00:00.000Z'), { now: NOW, env })).outcome, 'created');
  assert.equal((await one(db, 'student5@example.com')).admitted_at, '2021-09-01T07:00:00.000Z');
});

test('an admission date of the SIS\'s own, if it ever sends one, is preferred over the submit date', async () => {
  assert.equal(toSisRow(student(6, '2020-05-01T00:00:00Z', { matriculatedAt: '2020-09-01T00:00:00Z' })).admitted_on, '2020-09-01T00:00:00.000Z');
  assert.equal(toSisRow(student(6, '2020-05-01T00:00:00Z', { admittedAt: 'not a date' })).admitted_on, null);
  assert.equal(sisAdmissionDate([{ status: 'matriculated', submitted_at: '2020-05-01T00:00:00Z', admitted_on: '2020-09-01T00:00:00Z' }]),
    '2020-09-01T00:00:00.000Z');
  assert.equal(sisAdmissionDate([{ status: 'submitted', submitted_at: '2020-05-01T00:00:00Z' }]), null, 'not admitted: no admission date');
  assert.equal(sisAdmissionDate([{ status: 'matriculated', submitted_at: '2015-01-01T00:00:00Z' },
    { status: 'admitted', submitted_at: '2024-02-01T00:00:00Z' }]), '2024-02-01T00:00:00.000Z', 'the latest admission');
  const db = await openDb(':memory:');
  await pull(db, [student(6, '2020-05-01T00:00:00Z', { matriculatedAt: '2020-09-01T00:00:00Z' })]);
  assert.equal((await one(db, 'student6@example.com')).admitted_at, '2020-09-01T00:00:00.000Z');
});

test('a person Intake already had, moved to Admitted by the SIS, gets the SIS date; undated leaves it empty', async () => {
  const db = await openDb(':memory:');
  for (const [id, email] of [['pa', 'student7@example.com'], ['pb', 'student8@example.com']]) {
    await db.prepare("INSERT INTO people (id, name, email, status, created_at) VALUES (?, 'Known', ?, 'Contract', '2026-03-01T10:00:00.000Z')")
      .run(id, email);
  }
  const r = await pull(db, [student(7, '2026-04-02T08:00:00.000Z'), student(8, null)]);
  assert.equal(r.moved, 2);
  assert.equal(r.undated, 1);
  const a = await db.prepare('SELECT status, admitted_at FROM people WHERE id = ?').get('pa');
  assert.deepEqual({ ...a }, { status: 'Admitted', admitted_at: '2026-04-02T08:00:00.000Z' });
  const b = await db.prepare('SELECT status, admitted_at FROM people WHERE id = ?').get('pb');
  assert.deepEqual({ ...b }, { status: 'Admitted', admitted_at: null }, 'never the day of the run');
  const ev = await db.prepare("SELECT body FROM events WHERE person_id = 'pb' AND kind = 'status'").get();
  assert.match(ev.body, /the SIS gives no admission date/);
});

// -------------------------------------------------------------- the re-date --

// The state the old pull left: a SIS-created person, Admitted on the pull's clock, its lifecycle facts
// recorded at the same instant. Plus the people who must never be touched.
async function oldState() {
  const db = await openDb(':memory:');
  const sisRow = (ref, personId, status, submitted) => db.prepare(`INSERT INTO sis_applicants (reference, application_id,
    status, registered_at, submitted_at, changed_at, person_id, synced_at) VALUES (?,?,?,?,?,?,?,?)`)
    .run(ref, 'a-' + ref, status, '2026-10-05T10:20:00.000Z', submitted, '2026-10-05T10:30:00.000Z', personId, PULL);
  const fact = (personId, ref, recorded) => db.prepare(`INSERT INTO lifecycle_events (person_id, fact, source, source_ref,
    occurred_at, recorded_at) VALUES (?, 'matriculated', 'sis', ?, '2026-10-05T10:30:00.000Z', ?)`).run(personId, ref + ':a-' + ref, recorded);
  const person = (id, firstChannel, admittedAt, status = 'Admitted') => db.prepare(`INSERT INTO people (id, name, status,
    created_at, admitted_at, first_channel, source_channel) VALUES (?, 'Made up', ?, '2026-10-05T10:20:00.000Z', ?, ?, ?)`)
    .run(id, status, admittedAt, firstChannel, firstChannel);
  // the SIS-created ones: 2014, 2014, 2023, 2026, and one the SIS never dated
  const made = [['s1', '2014-06-01T09:00:00.000Z'], ['s2', '2014-08-15T09:00:00.000Z'], ['s3', '2023-07-10T09:00:00.000Z'],
    ['s4', '2026-07-20T09:00:00.000Z'], ['s5', null]];
  for (const [id, submitted] of made) {
    await person(id, 'sis', PULL);
    await sisRow('r-' + id, id, 'matriculated', submitted);
    await fact(id, 'r-' + id, PULL);
  }
  // NEVER TOUCHED:
  await person('h1', null, '2026-10-06T09:00:00.000Z');                                   // admitted by a human that day
  await person('h2', 'sis', '2026-10-06T12:00:00.000Z');                                  // SIS-made, but a human dated it
  await sisRow('r-h2', 'h2', 'matriculated', '2012-01-01T00:00:00.000Z');
  await fact('h2', 'r-h2', PULL);
  await person('h3', null, PULL);                                                        // a known lead the pull moved on
  await sisRow('r-h3', 'h3', 'matriculated', '2025-09-01T00:00:00.000Z');
  await fact('h3', 'r-h3', PULL);
  await person('h4', 'sis', '2026-10-05T05:00:00.000Z');                                  // another day
  await sisRow('r-h4', 'h4', 'matriculated', '2016-01-01T00:00:00.000Z');
  await fact('h4', 'r-h4', '2026-10-05T05:00:00.000Z');
  await person('h5', 'sis', null, 'Application');                                         // not admitted
  await sisRow('r-h5', 'h5', 'started', null);
  return db;
}

async function snapshot(db) {
  const out = {};
  for (const t of ['people', 'events', 'lifecycle_events', 'sis_applicants', 'inbound']) {
    out[t] = await db.prepare(`SELECT * FROM ${t} ORDER BY 1, 2`).all();
  }
  return JSON.stringify(out);
}

test('re-date: the dry run writes nothing and reports the counts by year', async () => {
  const db = await oldState();
  const before = await snapshot(db);
  const r = await redateSisAdmissions(db, { now: NOW });
  assert.equal(await snapshot(db), before, 'not one row changed');
  assert.equal(r.ok, true);
  assert.equal(r.apply, false);
  assert.deepEqual(r.days, ['2026-10-06']);
  assert.equal(r.found, 5);
  assert.deepEqual(r.byYear, { 2014: 2, 2023: 1, 2026: 1 });
  assert.equal(r.moveToEarlierYears, 3);
  assert.equal(r.stayThisYear, 1);
  assert.equal(r.noDateLeft, 1);
  assert.deepEqual(r.notTouchedExistingPeople, { count: 1, byYear: { 2025: 1 }, noDate: 0 });
  assert.equal(r.changed, 0);
  assert.ok(!JSON.stringify(r).includes('s1') && !JSON.stringify(r).includes('Made up'), 'counts only, no person');
  // apply: true without a name is refused, and writes nothing either
  assert.equal((await redateSisAdmissions(db, { apply: true, now: NOW })).ok, false);
  assert.equal(await snapshot(db), before);
});

test('re-date: apply moves exactly the SIS-created people, with one History line each, and nobody else', async () => {
  const db = await oldState();
  const untouched = async () => JSON.stringify(await db.prepare(
    "SELECT * FROM people WHERE id IN ('h1','h2','h3','h4','h5','s5') ORDER BY id").all());
  const keep = await untouched();
  const r = await redateSisAdmissions(db, { apply: true, by: 'Ritvars', now: NOW });
  assert.equal(r.changed, 4);
  const got = Object.fromEntries((await db.prepare("SELECT id, admitted_at, created_at FROM people WHERE id IN ('s1','s2','s3','s4')").all())
    .map((p) => [p.id, [p.admitted_at, p.created_at]]));
  assert.deepEqual(got, {
    s1: ['2014-06-01T09:00:00.000Z', '2014-06-01T09:00:00.000Z'],
    s2: ['2014-08-15T09:00:00.000Z', '2014-08-15T09:00:00.000Z'],
    s3: ['2023-07-10T09:00:00.000Z', '2023-07-10T09:00:00.000Z'],
    s4: ['2026-07-20T09:00:00.000Z', '2026-07-20T09:00:00.000Z'],
  });
  assert.equal(await untouched(), keep, 'h1..h5 and the undated s5 are exactly as they were');
  const lines = await db.prepare("SELECT person_id, subject, actor, origin, field, old_value, new_value FROM events ORDER BY person_id").all();
  assert.deepEqual(lines.map((l) => l.person_id), ['s1', 's2', 's3', 's4'], 'one History line per re-dated person, nobody else');
  assert.deepEqual({ ...lines[0] }, { person_id: 's1', subject: 'Admission date set from SIS: 2014-06-01', actor: 'Ritvars',
    origin: 'manual', field: 'admitted_at', old_value: '2026-10-06', new_value: '2014-06-01' });
  // the lifecycle facts keep their own dates
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM lifecycle_events WHERE recorded_at = ?").get(PULL)).n, 7);
});

test('re-date: running apply a second time changes nothing', async () => {
  const db = await oldState();
  await redateSisAdmissions(db, { apply: true, by: 'Ritvars', now: NOW });
  const after = await snapshot(db);
  const again = await redateSisAdmissions(db, { apply: true, by: 'Ritvars', now: NOW });
  assert.equal(again.changed, 0);
  assert.equal(again.found, 1, 'only the undated one is still on the pull day');
  assert.equal(again.noDateLeft, 1);
  assert.equal(await snapshot(db), after);
});

test('re-date: Admitted for the year counts by the corrected date (Reports and Home)', async () => {
  const db = await oldState();
  // before: s1..s5, h1, h2, h3 all read as 2026; h4 too (05.10)
  assert.equal((await report(db, year(2026))).summary.admitted, 9);
  await redateSisAdmissions(db, { apply: true, by: 'Ritvars', now: NOW });
  // after: s4, s5 (left, undated by the SIS), h1, h2, h3, h4
  assert.equal((await report(db, year(2026))).summary.admitted, 6);
  assert.equal((await report(db, year(2014))).summary.admitted, 2);
  // Home counts the people list by the same column, so it moves with it
  const home = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  assert.match(home, /const admitted = people\.filter\(\(p\) => p\.status === 'Admitted' && inYear\(p\.admitted_at\)\);/);
  const people = await db.prepare('SELECT status, admitted_at FROM people').all();
  assert.equal(people.filter((p) => p.status === 'Admitted' && String(p.admitted_at || '').startsWith('2026')).length, 6);
});

test('re-date: another pull day can be named; a bad day is refused', async () => {
  const db = await oldState();
  const r = await redateSisAdmissions(db, { days: ['2026-10-05'], now: NOW });
  assert.equal(r.found, 1);
  assert.deepEqual(r.byYear, { 2016: 1 });
  assert.equal((await redateSisAdmissions(db, { days: ['06.10.2026'], now: NOW })).ok, false);
});

// -------------------------------------------------------------- the route --

function start(env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], { env: { ...process.env,
      PORT: '0', CRM_DB: ':memory:', DATASET: 'empty', CRM_AUTH: '', CRM_PUBLIC: '', DATABASE_URL: '',
      CRM_DB_DATABASE_URL_UNPOOLED: '', SIS_API_TOKEN: '', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const look = (d) => { out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, base: `http://127.0.0.1:${m[1]}` }); };
    child.stdout.on('data', look); child.stderr.on('data', look);
    child.on('exit', () => reject(new Error(out)));
  });
}

test('route: admins only; GET is the dry run, POST writes only with apply: true', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  const url = s.base + '/api/admin/sis/redate';
  assert.equal((await fetch(url, { headers: { 'x-acting-as': 'Ieva' } })).status, 403);
  assert.equal((await fetch(url, { method: 'POST', headers: { 'x-acting-as': 'Ieva', 'content-type': 'application/json' },
    body: JSON.stringify({ apply: true }) })).status, 403);
  const dry = await fetch(url, { headers: { 'x-acting-as': 'Ritvars' } }).then((x) => x.json());
  assert.equal(dry.ok, true);
  assert.equal(dry.apply, false);
  const noFlag = await fetch(url, { method: 'POST', headers: { 'x-acting-as': 'Ritvars', 'content-type': 'application/json' },
    body: JSON.stringify({}) }).then((x) => x.json());
  assert.equal(noFlag.apply, false, 'a POST without apply: true is still a dry run');
  const real = await fetch(url, { method: 'POST', headers: { 'x-acting-as': 'Ritvars', 'content-type': 'application/json' },
    body: JSON.stringify({ apply: true }) }).then((x) => x.json());
  assert.equal(real.apply, true);
  assert.equal(real.changed, 0, 'an empty copy has nobody to re-date');
});
