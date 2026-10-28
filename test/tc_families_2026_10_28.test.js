// COMPANY FAMILIES (28.10.2026, src/tcfam.js): the owner's Client Hub pick 5, layout B "suggest + confirm". Every company
// and figure here is invented.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { openDb } = await import('../src/db.js');
const tc = await import('../src/tc.js');
const fam = await import('../src/tcfam.js');
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const AT = '2026-10-28T08:00:00.000Z';

async function seeded() {
  const db = await openDb();
  const co = async (name, country, web) => Number((await db.prepare(`INSERT INTO tc_companies (name, name_key, country, status, extra, created_at) VALUES (?,?,?,?,?,?)`)
    .run(name, tc.nameKey(name), country, 'contacted', web ? JSON.stringify({ web_domain: web }) : null, AT)).lastInsertRowid);
  const ids = {
    g: await co('Example Shipping Group', 'Denmark', 'example-shipping.com'),
    lv: await co('SIA Example Shipping Latvia', 'Latvia', 'example-shipping.com'),
    no: await co('Example Shipping Norway', 'Norway', 'www.example-shipping.com'),
    s1: await co('Sample Marine', 'Germany', null), s2: await co('Sample Marine Services', 'Germany', null),
    one: await co('Lonely Offshore', 'Norway', null),
    tot: await co('Example Shipping', 'TOTAL', 'example-shipping.com'),
  };
  for (const [id, n] of [[ids.g, 2], [ids.lv, 1]]) for (let i = 0; i < n; i++) await db.prepare(`INSERT INTO tc_company_contacts (company_id, name, created_at) VALUES (?,?,?)`).run(id, 'P' + i, AT);
  await db.prepare(`INSERT INTO tc_company_courses (company_id, year, attendees, recorded_at) VALUES (?,?,?,?)`).run(ids.g, 2025, 10, AT);
  await db.prepare(`INSERT INTO tc_company_courses (company_id, year, attendees, recorded_at) VALUES (?,?,?,?)`).run(ids.lv, 2025, 4, AT);
  return { db, ...ids };
}

test('suggestions: same web domain first, then same name start (legal forms skipped); a group TOTAL row and a lone company never', async () => {
  const { db, g, lv, no, s1, s2, tot } = await seeded();
  assert.equal(fam._test.firstWord('SIA Example Shipping Latvia'), 'example');
  const S = await fam.suggestions(db);
  assert.deepEqual(S.rows.map((s) => [s.key, s.why, s.members.map((c) => c.id).sort((a, b) => a - b)]),
    [['web:example-shipping.com', 'same web domain', [g, lv, no].sort((a, b) => a - b)], ['name:sample', 'same name start', [s1, s2].sort((a, b) => a - b)]],
    'the name suggestion "example" is not repeated: all its companies are in the web one');
  assert.ok(!S.rows.some((s) => s.members.some((c) => c.id === tot)), 'the TOTAL row is never a member');
  await fam.dismissSuggestion(db, 'name:sample', 'Ritvars');
  assert.deepEqual((await fam.suggestions(db)).rows.map((s) => s.key), ['web:example-shipping.com'], 'Not a family is not shown again');
});

test('confirm: the parent among the members, one family per company; the family on each member and in the Companies list; unlink', async () => {
  const { db, g, lv, no, s1 } = await seeded();
  await assert.rejects(fam.confirmFamily(db, { parentId: s1, memberIds: [g, lv] }, 'Ritvars'), /Pick the parent among/);
  await assert.rejects(fam.confirmFamily(db, { parentId: g, memberIds: [g] }, 'Ritvars'), /at least two/);
  await fam.confirmFamily(db, { parentId: g, memberIds: [g, lv, no], suggestion: 'web:example-shipping.com' }, 'Ritvars');
  await assert.rejects(fam.confirmFamily(db, { parentId: s1, memberIds: [s1, no] }, 'Ritvars'), /already in a family/);
  const F = await fam.familyOf(db, lv);
  assert.deepEqual([F.name, F.members.map((c) => [c.id, c.parent]), F.people, F.delegates], ['Example Shipping Group', [[g, true], [no, false], [lv, false]], 3, 14]);
  assert.deepEqual((await fam.suggestions(db)).rows.map((x) => x.key), ['name:sample'], 'a confirmed family leaves the suggestions');
  const L = await tc.listCompanies(db, { q: 'example shipping group' }, { size: 50 });
  assert.deepEqual(L.rows.map((c) => c.id).sort((a, b) => a - b), [g, lv, no].sort((a, b) => a - b), 'the search finds the family');
  assert.deepEqual(L.rows.find((c) => c.id === no).family, { name: 'Example Shipping Group', n: 3 });
  assert.deepEqual((await fam.familiesList(db)).map((f) => [f.name, f.companies, f.people, f.delegates]), [['Example Shipping Group', 3, 3, 14]]);
  await fam.unlinkCompany(db, no, 'Ritvars');
  assert.deepEqual((await fam.familyOf(db, g)).members.map((c) => c.id), [g, lv]);
  await fam.unlinkCompany(db, lv, 'Ritvars');
  assert.equal(await fam.familyOf(db, g), null, 'one company left: the family ends');
  assert.equal(Number((await db.prepare('SELECT COUNT(*) AS n FROM tc_family_members').get()).n), 3, 'nothing is deleted');
});

test('the page: Families on Companies, the route, the card on the company page, the tag; routes behind the gate', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  assert.match(app, /act: `<a class="btn ghost" href="#\/tc\/families">Families<\/a><input class="c-search" id="tcQ"/);
  assert.match(app, /else if \(place === 'families'\) await viewTcFamilies\(\);/);
  assert.match(app, /\$\{tcMrCard\(\)\}\$\{tcFamCard\(\)\}/);
  assert.match(app, /family · \$\{Number\(c\.family\.n\)\}<\/span>/);
  const fn = app.slice(app.indexOf('function tcFamDraw('), app.indexOf('function tcFamPick('));
  for (const t of ['Confirmed <b>', 'To look at <b>', '>Confirm</button>', '>Not a family</button>']) assert.ok(fn.includes(t), t);
  assert.ok(app.includes('Confirm the family</button>'));
  const server = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
  const gate = server.indexOf('// ------------------------------------------------------- TRAINING CENTRE --');
  for (const route of ["p === '/api/tc/families' && req.method === 'GET'", 'const famAct = p.match(']) assert.ok(server.indexOf(route) > gate && gate > 0, route);
});
