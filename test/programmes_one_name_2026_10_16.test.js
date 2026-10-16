// ONE NAME PER PROGRAMME (the owner, 16.10.2026, after Admissions filtered Journey by "OS" and saw only admitted
// students). The SIS writes OS, MTM, WTT, OR; leads carry MT OS, MT MTM, MT WTT, MT MR. config.sis.programmeMap maps
// them on every import (the SIS, the admissions sheet, a lead form's answers), an unknown code is kept as it came and
// counted, and a one-off for admins puts the rows stored before right: preview first, changing nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { syncSis, receiveSisApplication } from '../src/sync.js';
import { readRow } from '../src/sheetsync.js';
import { intakeProgramme, unknownProgramme, programmeNamesRepair, REPAIR_NOTE } from '../src/programmes.js';
import { applicationFunnel } from '../src/applications.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
const ON = { SIS_API_TOKEN: 'test-sis-token-not-real-0000', CHANNEL_MODE_SIS: 'test' };
const NOW = new Date('2026-10-16T05:00:00Z');
const app = (n, over = {}) => ({
  reference: 'ref-' + n, applicationId: 'app-' + n, givenName: 'Anna' + n, familyName: 'Ozola',
  email: `anna${n}@example.com`, phone: '+371 2999' + String(n).padStart(4, '0'), programmeCode: 'OS', status: 'started',
  registeredAt: '2026-10-15T08:00:00.000Z', submittedAt: null, changedAt: '2026-10-15T09:00:00.000Z', ...over,
});
const sis = (apps) => async () => ({ ok: true, status: 200, json: async () => ({ applicants: apps, nextCursor: null }) });

test('the owner\'s mapping is in config, documented, and maps to programmes Intake offers', () => {
  assert.deepEqual(CFG.sis.programmeMap, { OS: 'MT OS', MTM: 'MT MTM', WTT: 'MT WTT', OR: 'MT MR' });
  assert.match(CFG.sis._programmeMap, /never guessed/);
  for (const to of Object.values(CFG.sis.programmeMap)) assert.ok(CFG.programmes.includes(to), to);
  assert.equal(intakeProgramme('OS'), 'MT OS');
  assert.equal(intakeProgramme('OR'), 'MT MR');
  assert.equal(intakeProgramme(' MTM '), 'MT MTM', 'a stray space is still the code');
  for (const same of ['NAV', 'ENG', 'MT OS']) assert.equal(intakeProgramme(same), same);
  assert.equal(intakeProgramme('XYZ'), 'XYZ', 'unknown: kept as it came');
  assert.equal(intakeProgramme(null), null);
  assert.equal(unknownProgramme('XYZ'), true);
  assert.equal(unknownProgramme('OS'), false);
  assert.equal(unknownProgramme('NAV'), false);
  assert.equal(unknownProgramme(''), false);
});

test('SIS pull: OS arrives as MT OS on the person, their interest, the History line and the stored record', async () => {
  const db = await openDb(':memory:');
  const r = await syncSis(db, { now: NOW, env: ON, fetchImpl: sis([app(1), app(2, { programmeCode: 'WTT' }), app(3, { programmeCode: 'NAV' })]) });
  assert.equal(r.created, 3);
  const people = await db.prepare('SELECT id, email, programme FROM people ORDER BY email').all();
  assert.deepEqual(people.map((p) => p.programme), ['MT OS', 'MT WTT', 'NAV']);
  const interest = await db.prepare("SELECT value FROM field_values WHERE field = 'interest' ORDER BY value").all();
  assert.deepEqual(interest.map((x) => x.value), ['MT OS', 'MT WTT', 'NAV']);
  const codes = await db.prepare('SELECT programme_code FROM sis_applicants ORDER BY programme_code').all();
  assert.deepEqual(codes.map((x) => x.programme_code), ['MT OS', 'MT WTT', 'NAV']);
  const made = await db.prepare("SELECT body FROM events WHERE kind = 'create' AND person_id = ?").get(people[0].id);
  assert.equal(made.body, 'SIS: MT OS application started');
  assert.equal(r.unknownProgrammes, undefined, 'nothing unknown in this run');
  // Reports > Applications groups by the same one name
  const f = await applicationFunnel(db, { env: ON });
  assert.ok(f.programmes.some((x) => x.code === 'MT OS'));
  assert.ok(!f.programmes.some((x) => x.code === 'OS'));
  await db.close();
});

test('SIS webhook: the same door, the same name; an unknown code is kept as it came and counted by the pull', async () => {
  const db = await openDb(':memory:');
  const got = await receiveSisApplication(db, app(4, { programmeCode: 'OR' }), { now: NOW, env: ON });
  assert.equal(got.outcome, 'created');
  assert.equal((await db.prepare('SELECT programme FROM people').get()).programme, 'MT MR');
  const r = await syncSis(db, { now: NOW, env: ON, fetchImpl: sis([app(5, { programmeCode: 'XYZ' })]) });
  assert.deepEqual(r.unknownProgrammes, { XYZ: 1 }, 'reported in the run');
  const p = await db.prepare("SELECT programme FROM people WHERE email = 'anna5@example.com'").get();
  assert.equal(p.programme, 'XYZ', 'never guessed into one of ours');
  const detail = JSON.parse((await db.prepare("SELECT detail FROM sync_state WHERE name = 'sis'").get()).detail);
  assert.deepEqual(detail.unknownProgrammes, { XYZ: 1 }, 'and kept in the run\'s detail');
  await db.close();
});

test('the admissions sheet: an SIS code typed on the sheet is the same programme; anything else as it came', () => {
  assert.equal(readRow({ name: 'A', programme: 'OS' }).programme, 'MT OS');
  assert.equal(readRow({ name: 'A', programme: 'MT MTM' }).programme, 'MT MTM');
  assert.equal(readRow({ name: 'A', programme: 'Navigācija' }).programme, 'Navigācija');
  assert.equal(readRow({ name: 'A', programme: '' }).programme, null);
});

test('the imports all go through the one helper (no import writes a raw code)', () => {
  const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
  assert.match(src('sync.js'), /programme_code: intakeProgramme\(raw\.programme_code\)/);
  assert.match(src('sheetsync.js'), /programme: intakeProgramme\(r\.programme\)/);
  assert.match(src('leadanswers.js'), /const programme = intakeProgramme\(got\.programme\)/);
  assert.match(src('real.js'), /intakeProgramme\(p\.programme\)/);
});

// --------------------------------------------------------------------------------- the one-off --
async function seeded() {
  const db = await openDb(':memory:');
  const person = (id, programme) => db.prepare(`INSERT INTO people (id, name, programme, status, created_at)
    VALUES (?, ?, ?, 'Admitted', '2026-01-01T00:00:00Z')`).run(id, 'Name ' + id, programme);
  await person('p1', 'OS'); await person('p2', 'OS'); await person('p3', 'OR'); await person('p4', 'MTM');
  await person('p5', 'NAV'); await person('p6', 'MT OS'); await person('p7', 'XYZ'); await person('p8', null);
  const fv = (pid, field, value) => db.prepare(`INSERT INTO field_values (person_id, field, value, provenance, recorded_at, recorded_by)
    VALUES (?, ?, ?, 'provider', '2026-01-01T00:00:00Z', 'SIS')`).run(pid, field, value);
  await fv('p1', 'interest', 'OS'); await fv('p3', 'interest', 'OR'); await fv('p5', 'interest', 'NAV'); await fv('p1', 'email', 'OS');
  const sa = (ref, code) => db.prepare(`INSERT INTO sis_applicants (reference, application_id, programme_code, status, changed_at, synced_at)
    VALUES (?, ?, ?, 'admitted', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`).run(ref, 'a-' + ref, code);
  await sa('r1', 'OS'); await sa('r2', 'WTT'); await sa('r3', 'NAV');
  return db;
}
const snapshot = async (db) => JSON.stringify([
  await db.prepare('SELECT id, programme FROM people ORDER BY id').all(),
  await db.prepare('SELECT id, field, value FROM field_values ORDER BY id').all(),
  await db.prepare('SELECT reference, programme_code FROM sis_applicants ORDER BY reference').all(),
  await db.prepare('SELECT COUNT(*) AS n FROM events').get(),
  await db.prepare('SELECT COUNT(*) AS n FROM sync_state').get()]);

test('the preview counts old -> new per table, ids only, no names, and changes nothing', async () => {
  const db = await seeded();
  const before = await snapshot(db);
  const r = await programmeNamesRepair(db);
  assert.equal(r.applied, false);
  assert.deepEqual(r.people, { 'OS -> MT OS': 2, 'MTM -> MT MTM': 1, 'WTT -> MT WTT': 0, 'OR -> MT MR': 1 });
  assert.deepEqual(r.interest, { 'OS -> MT OS': 1, 'MTM -> MT MTM': 0, 'WTT -> MT WTT': 0, 'OR -> MT MR': 1 });
  assert.deepEqual(r.sisApplicants, { 'OS -> MT OS': 1, 'MTM -> MT MTM': 0, 'WTT -> MT WTT': 1, 'OR -> MT MR': 0 });
  assert.deepEqual(r.total, { people: 4, interest: 2, sisApplicants: 2 });
  assert.deepEqual(r.ids.people, ['p1', 'p2', 'p3', 'p4']);
  assert.deepEqual(r.unknown.people, { XYZ: 1 }, 'unknown values are counted and left alone');
  assert.ok(!JSON.stringify(r).includes('Name '), 'no names in the preview');
  assert.equal(await snapshot(db), before, 'the preview wrote nothing');
  await db.close();
});

test('apply rewrites them, logs a machine edit per person, and a second apply changes nothing', async () => {
  const db = await seeded();
  assert.equal((await programmeNamesRepair(db, { apply: true })).error, 'who is applying this?');
  const r = await programmeNamesRepair(db, { apply: true, by: 'Ritvars', at: '2026-10-16T12:00:00.000Z' });
  assert.deepEqual(r.done, { people: 4, interest: 2, sisApplicants: 2 });
  const people = Object.fromEntries((await db.prepare('SELECT id, programme FROM people').all()).map((p) => [p.id, p.programme]));
  assert.deepEqual(people, { p1: 'MT OS', p2: 'MT OS', p3: 'MT MR', p4: 'MT MTM', p5: 'NAV', p6: 'MT OS', p7: 'XYZ', p8: null });
  const fv = await db.prepare('SELECT field, value FROM field_values ORDER BY id').all();
  assert.deepEqual(fv.map((x) => `${x.field}=${x.value}`), ['interest=MT OS', 'interest=MT MR', 'interest=NAV', 'email=OS'],
    'only interest is a programme');
  assert.deepEqual((await db.prepare('SELECT programme_code FROM sis_applicants ORDER BY reference').all()).map((x) => x.programme_code),
    ['MT OS', 'MT WTT', 'NAV']);
  const ev = await db.prepare("SELECT * FROM events WHERE person_id = 'p1'").all();
  assert.equal(ev.length, 1);
  assert.equal(ev[0].subject, `Programme OS -> MT OS (${REPAIR_NOTE})`);
  assert.equal(ev[0].subject, 'Programme OS -> MT OS (one name per programme)');
  assert.equal(ev[0].origin, 'automatic', 'a machine edit');
  assert.equal(ev[0].kind, 'edit');
  assert.deepEqual([ev[0].field, ev[0].old_value, ev[0].new_value], ['programme', 'OS', 'MT OS']);
  assert.match(ev[0].body, /Ritvars/);
  const count = (await db.prepare('SELECT COUNT(*) AS n FROM events').get()).n;
  const again = await programmeNamesRepair(db, { apply: true, by: 'Ritvars' });
  assert.deepEqual(again.done, { people: 0, interest: 0, sisApplicants: 0 });
  assert.equal(again.total.people, 0);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM events').get()).n, count, 'no second History line');
  await db.close();
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

test('the one-off route: admins only; GET is the preview and changes nothing', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  const url = s.base + '/api/admin/people/programme-names';
  assert.equal((await fetch(url, { headers: { 'x-acting-as': 'Ieva' } })).status, 403);
  assert.equal((await fetch(url, { method: 'POST', headers: { 'x-acting-as': 'Ieva', 'content-type': 'application/json' },
    body: JSON.stringify({ apply: true }) })).status, 403);
  const look = await fetch(url, { headers: { 'x-acting-as': 'Ritvars' } }).then((r) => r.json());
  assert.equal(look.ok, true);
  assert.equal(look.applied, false);
  assert.equal(look.done, undefined);
});
