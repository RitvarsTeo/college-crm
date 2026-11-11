// THE ADMITTED FIGURE TELLS THE TRUTH (the owner, 05.11.2026: "A BUG LIKE THIS SHOULD NEVER BE ACCOUNTED FOR IN STATS!" on
// "Test New Student · Admitted 2026-10-29", and "do we really have 164 admitted students THIS YEAR ALONE?"; popup "Yes,
// fix all"). Two parts: a test or staff record is left out of every figure and every list the figures open
// (src/realpeople.js); and the students held twice (an Admissions sheet record + a record the SIS made) are joined by
// scripts/merge_admitted_doubles.mjs, preview + apply with its hash, the existing "Same person as..." merge.
// Synthetic people only.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './security_helpers.js';

for (const k of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'CRM_DB_DATABASE_URL_UNPOOLED', 'INTAKE_DATABASE_URL']) process.env[k] = '';
const { openDb } = await import('../src/db.js');
const { isTestPerson, REAL_PEOPLE, countPeople } = await import('../src/realpeople.js');
const { planDoubles } = await import('../scripts/merge_admitted_doubles.mjs');
const { mergeSisDuplicate } = await import('../src/sync.js');

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

test('a test or staff record: our own email domain, or a name that is "Test ..."', () => {
  assert.equal(isTestPerson({ name: 'Test New Student', email: 'test.newstudent@novikontas.org' }), true);
  assert.equal(isTestPerson({ name: 'Anna Paraudze', email: 'anna@novikontas.lv' }), true, 'staff, our own domain');
  assert.equal(isTestPerson({ name: 'test', email: '' }), true);
  assert.equal(isTestPerson({ name: 'New Test Student', email: 'n@example.com' }), true, '"Test" anywhere in the name, as a word (his pick (b))');
  assert.equal(isTestPerson({ name: 'Testers Kārlis', email: 'k@example.com' }), false, 'a surname that starts with Test is a person');
  assert.equal(isTestPerson({ name: 'Anna Paraudze', email: 'anna@gmail.com' }), false);
  assert.equal(isTestPerson({ name: 'Anna', email: 'anna@students-novikontas.example.com' }), false);
  for (const f of ['reports.js', 'intake.js', 'server.js']) assert.match(read('src', f), /import \{ REAL_PEOPLE[^}]*\} from '\.\/realpeople\.js';/, f + ' reads people through the rule');
  assert.doesNotMatch(read('src', 'reports.js'), /(FROM|JOIN) people\b/, 'every Reports query leaves the test records out');
});

const person = (db, id, p) => db.prepare(`INSERT INTO people (id, name, email, phone, programme, status, first_channel, created_at, admitted_at)
  VALUES (?,?,?,?,?,?,?,?,?)`).run(id, p.name, p.email || null, p.phone || null, p.programme || null, p.status || 'Admitted', p.first || null,
  p.created || '2026-01-10T08:00:00.000Z', p.admitted === undefined ? '2026-03-01T08:00:00.000Z' : p.admitted);

async function seed(db) {
  await person(db, 'r1', { name: 'Jakov Tešović', programme: 'NAV', admitted: '2026-09-21T08:00:00.000Z' });
  await person(db, 'sis1', { name: 'Jakov Tesovic', programme: 'NAV', first: 'sis', admitted: '2026-09-16T08:00:00.000Z', email: 'jakov@example.com' });
  await person(db, 'r2', { name: 'Sergejs Tribunskis', programme: 'MT OS', email: 's.t@example.com' });
  await person(db, 'sis2', { name: 'Tribunskis Sergejs', programme: 'MT MR', first: 'sis', email: 's.t@example.com' });   // the email decides
  await person(db, 'r3', { name: 'Ilze Ozola', programme: 'ENG' });
  await person(db, 'sis3', { name: 'Ilze Ozola', programme: 'NAV', first: 'sis' });             // shares nothing but the name: a person decides
  await person(db, 'r4', { name: 'Anastasija Plūme', programme: 'MT OS' });
  await person(db, 'r5', { name: 'Anastasija Plume', programme: 'NAV' });                      // twice in the sheet: listed, never joined
  await person(db, 'r6', { name: 'Edgars Kalns', programme: 'ENG' });
  await person(db, 'sis6', { name: 'Edgars Kalns', programme: 'ENG', first: 'sis' });
  await db.prepare('INSERT INTO person_not_same (person_a, person_b, marked_at, marked_by) VALUES (?,?,?,?)').run('r6', 'sis6', '2026-10-30T08:00:00.000Z', 'Admissions');
  await person(db, 'sis7', { name: 'Jānis Bērziņš', programme: 'NAV', first: 'sis', admitted: '2025-06-01T08:00:00.000Z' });
  await person(db, 'r7', { name: 'Janis Berzins', programme: 'NAV', admitted: '2025-06-03T08:00:00.000Z' });
  await person(db, 'test', { name: 'Test New Student', email: 'test.newstudent@novikontas.org', first: 'sis', admitted: '2026-10-29T08:00:00.000Z' });
  await person(db, 'lead', { name: 'Kārlis Testers', status: 'New', admitted: null });
}

test('one person, one count: records sharing a folded name, an email or a phone count once (his pick (c))', () => {
  assert.equal(countPeople([{ name: 'Jakov Tešović' }, { name: 'tesovic JAKOV' }]), 1, 'letters, case and word order folded');
  assert.equal(countPeople([{ name: 'A B', email: 'x@y.lv' }, { name: 'C D', email: 'X@Y.lv ' }]), 1, 'the same email');
  assert.equal(countPeople([{ name: 'E F', phone: '+371 2000 1234' }, { name: 'G H', phone: '20001234' }]), 1, 'the same phone');
  assert.equal(countPeople([{ name: 'Anna' }, { name: 'Anna' }]), 2, 'one word is not enough to call two records one person');
  assert.equal(countPeople([]), 0);
  const home = read('src', 'app.html');
  assert.match(home, /const admitted = cAdmittedOnce\(people\);/, 'Home counts the same way');
});

test('the plan: an SIS-made twin with exactly one sheet record that shares programme, email or phone; nothing else is joined', async () => {
  const db = await openDb();
  await seed(db);
  const rows = await db.prepare('SELECT id, name, email, phone, programme, status, first_channel, admitted_at FROM people').all();
  const notSame = await db.prepare('SELECT person_a, person_b FROM person_not_same').all();
  const plan = planDoubles(rows, notSame, 2026);
  assert.deepEqual(plan.join.map((j) => [j.sourceId, j.targetId]), [['sis1', 'r1']]);
  assert.deepEqual(plan.look.map((l) => l.name).sort(), ['Anastasija Plūme', 'Ilze Ozola', 'Tribunskis Sergejs'], 'shares nothing / twice in the sheet / another programme: for a person');
  assert.ok(!plan.join.some((j) => j.sourceId === 'sis6'), '"Not the same" is respected');
  assert.ok(!plan.join.some((j) => j.sourceId === 'sis7'), 'another year waits for its own run');
  assert.equal(planDoubles(rows, notSame, 2026).hash, plan.hash, 'the same rows, the same hash');
  assert.deepEqual(planDoubles(rows, notSame, 2025).join.map((j) => j.sourceId), ['sis7']);
  // the apply is the existing merge: the SIS record goes, everything it held moves, the sheet record stays
  for (const j of plan.join) assert.equal((await mergeSisDuplicate(db, j.sourceId, j.targetId, { by: 'Ritvars' })).ok, true);
  assert.equal(await db.prepare(`SELECT id FROM people WHERE id = 'sis1'`).get(), undefined);
  assert.ok(await db.prepare(`SELECT id FROM people WHERE id = 'sis2'`).get(), 'another programme: left alone');
  assert.equal((await db.prepare(`SELECT email FROM people WHERE id = 'r1'`).get()).email, 'jakov@example.com', 'an empty value is filled from the twin');
  const left = planDoubles(await db.prepare('SELECT id, name, email, phone, programme, status, first_channel, admitted_at FROM people').all(), notSame, 2026);
  assert.equal(left.join.length, 0, 'a second run finds nothing');
});

let srv = null;
after(() => { if (srv) srv.child.kill(); });
test('a running copy: the test record is in no figure and no list - Home, Reports, the people list - and opens by its link', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-truth-'));
  const file = path.join(dir, 'truth.db');
  const db = await openDb(file);
  await seed(db);
  await db.close();
  srv = await start({ CRM_DB: file, DATASET: '', CRM_AUTH: '', CRM_PUBLIC: '' });
  const get = async (p) => (await fetch(srv.base + p, { headers: { 'x-acting-as': 'Ritvars' } })).json();
  const ids = (await get('/api/people')).rows.map((p) => p.id);
  assert.ok(!ids.includes('test'), 'not in the people list (Home, Journey, Due read it)');
  assert.ok(ids.includes('lead'), '"Kārlis Testers" is a person');
  const rep = await get('/api/report?years=2026');
  assert.equal(rep.summary.admitted, 5, 'Reports: the 10 Admitted 2026 records are 5 people, the test record not counted');
  const sum = await get('/api/summary');
  assert.equal(sum.admittedTotal, 12, 'every Admitted record but the test one');
  assert.equal((await get('/api/people/test')).name, 'Test New Student', 'the record stays and opens by its link');
  assert.match(REAL_PEOPLE, /NOT \(LOWER\(COALESCE\(people\.email, ''\)\) LIKE '%@novikontas\.%'/);
});
