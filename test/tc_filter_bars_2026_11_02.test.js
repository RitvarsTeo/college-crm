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

// patch 176 (his pick A, 24.11.2026): the same groups moved from the left panel into chips above the list; Courses kept
test('the screen: every group a row of chips with counts above the list, a second click takes the filter off', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  assert.match(app, /body: tcMapCard\(L\) \+ tcChipsCard\(L\)/);
  assert.match(app, /\['course', 'Courses', /);
  assert.match(app, /T_F\[k\] === v \? '' : String\(v\)/);
});

// patch 176 (his pick A, 24.11.2026): A-Z and the Grand Opening list owner filter the list and come back as counts
test('the letter and the Grand Opening list owner filter the list; trained / not yet, owners and letters come back with counts', async () => {
  const db = await openDb();
  const now = new Date('2026-11-24T09:00:00Z');
  const a = (await tc.addCompany(db, { name: 'Alpha Example Marine', country: 'Norway' }, 'Ritvars')).id;
  await tc.addCompany(db, { name: 'Ølen Example Yard', country: 'Norway' }, 'Ritvars');
  await tc.addCompany(db, { name: '3 Example Seas', country: 'Latvia' }, 'Ritvars');
  await db.prepare('INSERT INTO tc_company_courses (company_id, year, attendees, course_codes, recorded_at) VALUES (?,?,?,?,?)').run(a, 2025, 4, 'GWO', AT);
  await db.prepare(`INSERT INTO tc_company_contacts (company_id, name, email, ch_contact_id, created_at) VALUES (?,?,?,?,?)`).run(a, 'Pat Example', 'pat@alpha.example', 'C176', AT);
  await db.prepare(`INSERT INTO tc_go_stage2 (ch_contact_id, sender, name, company, email, gone, loaded_at) VALUES ('C176','JS','Pat Example','Alpha Example Marine','pat@alpha.example',0,?)`).run(AT);
  assert.equal(tc.letterOf('Ølen'), 'O'); assert.equal(tc.letterOf('Žagars'), 'Z'); assert.equal(tc.letterOf('"Baltic"'), 'B'); assert.equal(tc.letterOf('3 Seas'), '#');
  const L = await tc.listCompanies(db, {}, { size: 50, now });
  assert.deepEqual(L.facets.letters, [['#', 1], ['A', 1], ['O', 1]]);
  assert.deepEqual(L.facets.client, [['yes', 1], ['no', 2]]);
  assert.deepEqual(L.facets.go.map(([k, n]) => [k, n]), [['-', 2], ['JS', 1]]);
  assert.deepEqual((await tc.listCompanies(db, { letter: 'O' }, { size: 50, now })).rows.map((c) => c.name), ['Ølen Example Yard']);
  assert.deepEqual((await tc.listCompanies(db, { go: 'JS' }, { size: 50, now })).rows.map((c) => c.name), ['Alpha Example Marine']);
  assert.equal((await tc.listCompanies(db, { go: '-' }, { size: 50, now })).rows.length, 2);
  // the letters keep every letter of the filtered list, the chosen letter aside
  assert.deepEqual((await tc.listCompanies(db, { letter: 'O' }, { size: 50, now })).facets.letters.map(([l]) => l), ['#', 'A', 'O']);
  assert.ok(tc.FILTER_KEYS.includes('letter') && tc.FILTER_KEYS.includes('go'));
});

// patch 177 (his pick 24.11.2026 "Pasaules karte + zoom"): the whole world, every country, zoom buttons and drag
test('the Companies map: the whole world by default, World / Europe / + / -, drag; spellings the outline lacks map to it', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  assert.match(app, /const T_MAP_WORLD = \{ x: 0, y: 40, w: 1000, h: 390 \}/);
  assert.ok(app.includes(`onclick="tcMapZoom('world')">World</button>`) && app.includes(`onclick="tcMapZoom('europe')">Europe</button>`));
  assert.ok(app.includes('aria-label="Zoom in" onclick="tcMapZoom(0.6)"') && app.includes('aria-label="Zoom out" onclick="tcMapZoom(1.6)"'));
  assert.ok(app.includes("onclick=\"if(!T_MDRAG)tcFilter('country', "), 'a drag is never a tap');
  for (const a of ["'Russian Federation': 'Russia'", "UK: 'United Kingdom'", "'Cayman Islands': 'Cayman Is.'", "'Central African Republic': 'Central African Rep.'"]) assert.ok(app.includes(a), a);
  assert.ok(app.includes('two spellings of one country ("UK" and "United Kingdom") are one circle'));
});
