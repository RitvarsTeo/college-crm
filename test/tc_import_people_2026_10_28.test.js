// IMPORT PEOPLE FROM A FILE (28.10.2026, src/tcpeople.js): the owner's Client Hub pick 4, layout A "on Companies". Every
// name, company and address here is invented.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { openDb } = await import('../src/db.js');
const tc = await import('../src/tc.js');
const imp = await import('../src/tcpeople.js');
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const AT = '2026-10-28T08:00:00.000Z';

async function seeded() {
  const db = await openDb();
  const co = async (name, country) => Number((await db.prepare(`INSERT INTO tc_companies (name, name_key, country, status, created_at) VALUES (?,?,?,?,?)`)
    .run(name, tc.nameKey(name), country, 'contacted', AT)).lastInsertRowid);
  const ids = { ex: await co('Example Shipping', 'Latvia'), sm1: await co('Sample Marine', 'Germany'), sm2: await co('Sample Marine', 'Netherlands'),
    dw: await co('Demo Wind Group', 'Lithuania') };
  await db.prepare(`INSERT INTO tc_company_contacts (company_id, name, email, position, created_at) VALUES (?,?,?,?,?)`).run(ids.ex, 'Anna Example', 'anna@example-shipping.com', 'Crewing', AT);
  await db.prepare(`INSERT INTO tc_company_contacts (company_id, name, email, created_at) VALUES (?,?,?,?)`).run(ids.dw, 'Ivan Demo', 'ivan@demowind.lt', AT);
  return { db, ...ids };
}
const FILE = [
  { name: 'Anna Example', email: 'ANNA@example-shipping.com', company: 'Example Shipping', position: 'Fleet manager' },   // update
  { name: 'Anna Example', email: 'anna@example-shipping.com', company: 'Example Shipping' },                               // twice
  { name: 'Peter Example', email: 'peter@example-shipping.com', company: 'Example Shipping' },                             // new, same name
  { name: 'Olga Sample', email: 'olga@sample.de', company: 'Sample Marine' },                                              // choose (2 Sample Marine)
  { name: 'Olga Two', email: 'olga2@sample.nl', company: 'Sample Marine', country: 'Netherlands' },                       // found by country
  { name: 'Rita Demo', email: 'rita@demowind.lt', company: '' },                                                           // found by email domain
  { name: 'New Person', email: 'np@brand-new.com', company: 'Brand New Offshore', country: 'Norway' },                     // new company
  { name: 'Second New', email: 'sn@brand-new.com', company: 'Brand New Offshore' },                                        // same new company
  { name: '', email: '', company: 'X' },                                                                                    // fix
  { name: 'Bad Mail', email: 'not-an-address', company: 'Example Shipping' },                                              // fix
  { name: 'Ivan Demo', email: 'ivan@demowind.lt', company: 'Demo Wind Group' },                                            // same
];

test('preview: new, update, already there, to fix; the company found by name, by country, by email domain, to pick, or new; writes nothing', async () => {
  const { db, ex, sm2, dw } = await seeded();
  const P = await imp.importPreview(db, FILE);
  assert.deepEqual(P.counts, { new: 6, update: 1, same: 1, fix: 3 });
  const s = P.rows.map((r) => [r.status, r.company && r.company.state]);
  assert.deepEqual(s, [['update', 'person'], ['fix', null], ['new', 'found'], ['new', 'choose'], ['new', 'found'], ['new', 'found'], ['new', 'new'], ['new', 'new'], ['fix', null], ['fix', null], ['same', 'person']]);
  assert.deepEqual(P.rows[0].changes, [{ field: 'position', from: 'Crewing', to: 'Fleet manager' }]);
  assert.equal(P.rows[2].company.id, ex);
  assert.equal(P.rows[4].company.id, sm2, 'two Sample Marine: the row country picks one');
  assert.deepEqual([P.rows[5].company.id, P.rows[5].company.how], [dw, 'same email domain']);
  assert.match(P.rows[1].why, /twice/);
  assert.equal(Number((await db.prepare('SELECT COUNT(*) AS n FROM tc_company_contacts').get()).n), 2, 'the preview wrote nothing');
  await assert.rejects(imp.importPreview(db, []), /no rows/);
});

test('apply: a row to pick must be picked; one new company per name; updates logged; nothing doubled', async () => {
  const { db, sm1 } = await seeded();
  await assert.rejects(imp.importApply(db, FILE, {}, 'Ritvars'), /Row 4 \(Olga Sample\): pick its company/);
  const out = await imp.importApply(db, FILE, { 3: String(sm1) }, 'Ritvars');
  assert.deepEqual(out, { added: 6, updated: 1, newCompanies: 1, skipped: 0, same: 1, fix: 3 });
  assert.equal((await db.prepare(`SELECT position FROM tc_company_contacts WHERE email = 'anna@example-shipping.com'`).get()).position, 'Fleet manager');
  const bn = await db.prepare(`SELECT id, country, source FROM tc_companies WHERE name = 'Brand New Offshore'`).all();
  assert.deepEqual([bn.length, bn[0].country, bn[0].source], [1, 'Norway', 'import']);
  assert.equal(Number((await db.prepare('SELECT COUNT(*) AS n FROM tc_company_contacts WHERE company_id = ?').get(bn[0].id)).n), 2);
  assert.equal(Number((await db.prepare(`SELECT COUNT(*) AS n FROM tc_activities WHERE actor = 'Ritvars' AND body LIKE '%import people from a file%'`).get()).n) >= 7, true);
  const again = await imp.importPreview(db, FILE);
  assert.equal(again.counts.new, 0, 'a second run adds nobody: they are all there now');
  const skip = await imp.importApply(db, [{ name: 'Skip Me', email: 'skip@other-new.com', company: 'Other New' }], { 0: 'skip' }, 'Ritvars');
  assert.deepEqual([skip.added, skip.skipped, skip.newCompanies], [0, 1, 0]);
});

test('the page: Import people on Companies, the four steps, the error file; the routes behind the gate', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  assert.match(app, /<a class="btn ghost" href="#\/tc\/families">Families<\/a><a class="btn ghost" href="#\/tc\/import">Import people<\/a>/);
  assert.match(app, /else if \(place === 'import'\) viewTcImport\(\);/);
  const fn = app.slice(app.indexOf('function tcImpDraw('), app.indexOf('// THE FAMILIES PAGE'));
  for (const t of ['Choose a file', 'Match the columns', 'Header row', 'Review · ', ' already there', 'Error file', '+ New company', 'Leave this person out', 'Imported']) assert.ok(fn.includes(t), t);
  assert.ok(app.includes("DecompressionStream('deflate-raw')"), 'Excel is read in the browser');
  const server = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
  const gate = server.indexOf('// ------------------------------------------------------- TRAINING CENTRE --');
  assert.ok(server.indexOf("(p === '/api/tc/import/people/preview' || p === '/api/tc/import/people/apply') && req.method === 'POST'") > gate && gate > 0);
});
