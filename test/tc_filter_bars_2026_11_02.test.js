// THE BARS ON THE LEFT (02.11.2026): the owner's pick B - Area, Courses (new: GWO, BST ...), Country, Status, Last course,
// each value a bar with its count; a click filters. Every company here is invented.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { openDb } = await import('../src/db.js');
const tc = await import('../src/tc.js');
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const AT = '2026-11-02T08:00:00.000Z';

test('the codes in a course cell', () => {
  assert.deepEqual(tc.courseCodes('GWO BST, irata/FOET; 80ABC + 12'), ['GWO', 'BST', 'IRATA', 'FOET', '80ABC']);
  assert.deepEqual(tc.courseCodes(''), []);
});

test('Courses and Last course filter the list, and come back as facets with counts', async () => {
  const db = await openDb();
  const add = async (name, rows) => { const { id } = await tc.addCompany(db, { name, country: 'Norway' }, 'Ritvars');
    for (const [y, n, codes] of rows) await db.prepare('INSERT INTO tc_company_courses (company_id, year, attendees, course_codes, recorded_at) VALUES (?,?,?,?,?)').run(id, y, n, codes, AT); return id; };
  await add('Example Wind', [[2025, 12, 'GWO BST'], [2022, 3, 'IRATA']]);
  await add('Sample Offshore', [[2021, 5, 'BOSIET HUET']]);
  await add('Demo Shipping', []);
  const now = new Date('2026-11-02T09:00:00Z');
  const L = await tc.listCompanies(db, {}, { size: 50, now });
  assert.deepEqual(Object.fromEntries(L.facets.courses), { BOSIET: 1, BST: 1, GWO: 1, HUET: 1, IRATA: 1 });
  assert.deepEqual(Object.fromEntries(L.facets.since), { recent: 1, mid: 0, old: 1, none: 1 });
  assert.deepEqual((await tc.listCompanies(db, { course: 'gwo' }, { size: 50, now })).rows.map((c) => c.name), ['Example Wind']);
  assert.deepEqual((await tc.listCompanies(db, { since: 'none' }, { size: 50, now })).rows.map((c) => c.name), ['Demo Shipping']);
  assert.ok(tc.FILTER_KEYS.includes('course') && tc.FILTER_KEYS.includes('since'));
});

test('the screen: the panel on the left of the list, a bar per value, a second click takes the filter off', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  assert.match(app, /body: `<div class="tc-fside">\$\{tcFilterBars\(L, M\)\}<div class="tc-flist">/);
  assert.match(app, /\['course', 'Courses', /);
  assert.match(app, /T_F\[k\] === v \? '' : String\(v\)/);
  assert.match(app, /html\.ui-c \.tc-fside\{display:grid;grid-template-columns:250px minmax\(0,1fr\)/);
});
