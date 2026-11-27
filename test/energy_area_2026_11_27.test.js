// ENERGY: ITS OWN AREA NEXT TO TRAINING CENTRE (his pick A, 27.11.2026). The Training Centre's own screens, reused with a
// division filter (tc_company_areas ENERGY): Home's figures and the Companies list with every count beside it hold Energy
// companies only; Training Centre itself is unchanged. Invented names only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

for (const k of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'CRM_DB_DATABASE_URL_UNPOOLED', 'INTAKE_DATABASE_URL']) process.env[k] = '';
const { openDb } = await import('../src/db.js');
const tc = await import('../src/tc.js');
const th = await import('../src/tchome.js');
const areas = await import('../src/areas.js');

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');

async function world() {
  const db = await openDb();
  const co = async (name, country, years, list) => {
    const { id } = await tc.addCompany(db, { name, country, areas: list }, 'T');
    for (const [y, n] of Object.entries(years)) await tc.setCourseYear(db, id, { year: Number(y), attendees: n }, 'T');
    return id;
  };
  await co('Example Shipping AS', 'Norway', { 2025: 100 }, ['TC']);
  await co('Sample Wind GmbH', 'Germany', { 2025: 30 }, ['ENERGY']);
  await co('Demo Offshore Ltd', 'Denmark', { 2024: 7, 2025: 5 }, ['TC', 'ENERGY']);
  await co('Mock Turbines AB', 'Sweden', {}, ['ENERGY']);
  return db;
}

test('Energy Home counts Energy companies only; Training Centre Home is unchanged', async () => {
  const db = await world();
  const all = await th.homeYear(db, { year: 2025 });
  const en = await th.homeYear(db, { year: 2025, area: 'ENERGY' });
  assert.equal(all.delegates.n, 135);
  assert.equal(en.delegates.n, 35, '30 + 5, the TC-only company left out');
  assert.equal(en.clients.n, 2);
  assert.equal(en.donut.total, 3, 'three Energy companies, one with no course yet');
  assert.equal(en.countries.all, 3);
});

test('Energy opens on its latest year with courses, never a 0 the counts have not reached; 2026 can still be picked', async () => {
  const db = await world();
  // Training Centre has courses in 2026, Energy none yet
  const { id } = await tc.addCompany(db, { name: 'Example Tankers AS', country: 'Norway', areas: ['TC'] }, 'T');
  await tc.setCourseYear(db, id, { year: 2026, attendees: 9 }, 'T');
  const tcHome = await th.homeYear(db, {});
  const en = await th.homeYear(db, { area: 'ENERGY' });
  assert.equal(tcHome.year, 2026, 'Training Centre opens as before');
  assert.equal(en.year, 2025);
  assert.ok(en.delegates.n > 0, 'no Trained 0 on opening');
  assert.ok(en.years.includes(2026), 'the picker still offers 2026');
  assert.equal((await th.homeYear(db, { area: 'ENERGY', year: 2026 })).year, 2026);
  const book = await th.book(db, { div: 'ENERGY' });
  assert.equal(book.year, 2025);
  // every Client book figure is Energy only: 30 + 5 in 2025, not the TC-only company's 100
  assert.equal(book.cards.delegates.n, 35);
  assert.equal(book.cards.clients.ever, 2);
  assert.equal(book.cards.countries, 3);
  assert.equal((await th.book(db, { year: 2025 })).cards.delegates.n, 135, 'Training Centre\'s book unchanged');
});

test('switching division forgets the other division\'s year', () => {
  const at = APP.indexOf('function cSetArea(');
  const body = APP.slice(at, APP.indexOf('\n}\n', at));
  assert.match(body, /T_YEAR = null/);
  assert.match(APP, /if \(T_DIV\) qs\.set\('div', T_DIV\)/);
});

test('Energy Companies: the list and every count beside it are Energy only', async () => {
  const db = await world();
  const all = await tc.listCompanies(db, {});
  const en = await tc.listCompanies(db, {}, { div: 'ENERGY' });
  assert.equal(all.total, 4);
  assert.equal(en.total, 3);
  assert.ok(en.rows.every((c) => c.areas.includes('ENERGY')));
  assert.equal(en.facets.all, 3);
  assert.deepEqual(Object.fromEntries(en.facets.areas), { TC: 1, ENERGY: 3, OPITO: 0, PROJECTS: 0 });
  assert.ok(!en.facets.countries.some(([c]) => c === 'Norway'), 'the TC-only company\'s country is not on the Energy map');
  // an unknown division is ignored, never an empty list by accident
  assert.equal((await tc.listCompanies(db, {}, { div: 'NOPE' })).total, 4);
});

test('Energy opens with the Training Centre area and the same server gate (fail closed)', () => {
  assert.equal(areas.areaOfApi('/api/tc/overview'), 'tc');
  assert.equal(areas.areaOfApi('/api/tc/companies'), 'tc');
  // the start tile and the route both need the tc area; the server pins the data to Energy, the screen only asks
  assert.match(APP, /mine\.includes\('tc'\) \? tile\('#\/en', EN_ICON, 'Energy', 'Open Energy'\)/);
  assert.match(APP, /if \(!mine\.includes\('tc'\)\) \{ location\.replace\('#\/home'\); return true; \}\s*const en = hash\.startsWith\('#\/en'\)/);
});
