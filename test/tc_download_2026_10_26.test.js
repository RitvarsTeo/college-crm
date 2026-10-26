// DOWNLOAD THE LIST (26.10.2026): the owner's Client Hub pick 6, layout B, everyone in Training Centre. Every company,
// name and address here is invented.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { openDb } = await import('../src/db.js');
const tc = await import('../src/tc.js');
const { rowsToXlsx } = await import('../src/xlsx.js');
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const AT = '2026-10-26T08:00:00.000Z';

async function seeded() {
  const db = await openDb();
  const co = async (name, country, status) => Number((await db.prepare(`INSERT INTO tc_companies (name, name_key, country, status, pic_name, created_at)
    VALUES (?,?,?,?,?,?)`).run(name, name.toLowerCase(), country, status, 'Mārcis Žabovs', AT)).lastInsertRowid);
  const k = (company, name, email, archived = null) => db.prepare(`INSERT INTO tc_company_contacts (company_id, name, email, created_at, archived_at)
    VALUES (?,?,?,?,?)`).run(company, name, email, AT, archived);
  const a = await co('Example Shipping', 'Germany', 'met');
  const b = await co('Sample Offshore', 'Germany', 'contacted');
  const c = await co('Demo Wind', 'Latvia', 'contacted');
  await db.prepare(`INSERT INTO tc_company_courses (company_id, year, attendees, recorded_at) VALUES (?,?,?,?)`).run(a, 2025, 36, AT);
  await k(a, 'Anna Example', 'anna@example.com'); await k(a, 'Peter Example', 'peter@example.com'); await k(a, 'Gone Person', 'gone@example.com', AT);
  await k(c, 'Ivan Demo', 'ivan@demo.com');
  return { db, a, b, c };
}
const NOW = new Date('2026-10-26T10:00:00Z');

test('Companies: one row per company, exactly the filtered list, delegates per year', async () => {
  const { db } = await seeded();
  const out = await tc.exportRows(db, tc.readFilters(new URLSearchParams('country=Germany')), { now: NOW });
  assert.equal(out.companies, 2);
  const [head, ...rows] = out.rows;
  assert.deepEqual(head.slice(0, 6), ['Company', 'Country', 'City', 'Status', 'Areas', 'Person in charge']);
  assert.deepEqual(head.slice(6, 13), ['2020', '2021', '2022', '2023', '2024', '2025', '2026']);
  assert.deepEqual(rows.map((r) => [r[0], r[3]]), [['Example Shipping', 'Met'], ['Sample Offshore', 'Contacted']]);
  assert.equal(rows[0][head.indexOf('2025')], 36);
  assert.equal(rows[0][head.indexOf('Delegates in all')], 36);
  assert.ok(!head.includes('Email'), 'the companies file carries no contact details');
});

test('Companies with their people: one row per active contact; a company with none keeps one row', async () => {
  const { db } = await seeded();
  const out = await tc.exportRows(db, {}, { people: true, now: NOW });
  const [head, ...rows] = out.rows;
  const col = (n) => head.indexOf(n);
  assert.deepEqual(rows.map((r) => [r[0], r[col('Contact')], r[col('Email')]]), [
    ['Demo Wind', 'Ivan Demo', 'ivan@demo.com'],
    ['Example Shipping', 'Anna Example', 'anna@example.com'], ['Example Shipping', 'Peter Example', 'peter@example.com'],
    ['Sample Offshore', '', '']]);
  assert.deepEqual([out.companies, out.people], [3, 3], 'the archived contact is not in the file');
  assert.equal(await tc.peopleCount(db, [rows[1] && 1, 2, 3].filter(Boolean)), 3);
  const file = rowsToXlsx(out.rows, { bold: [0], sheetName: 'Companies and people', title: 'x' });
  assert.equal(file.subarray(0, 2).toString(), 'PK', 'a real Excel workbook');
});

test('the page: Download ▾ next to Add company with both files; the route is behind the Training Centre gate and logged', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  assert.match(app, /aria-label="Search companies and people">\$\{tcDownloadMenu\(\)\}<button class="btn" onclick="tcOpenAdd\(\)">Add company<\/button>/);
  assert.match(app, /<summary class="btn ghost">Download ▾<\/summary>/);
  assert.match(app, /href="\/api\/tc\/companies\.xlsx\?\$\{esc\(qs\.toString\(\)\)\}" download><b>Companies · \$\{n\}<\/b>/);
  assert.match(app, /href="\/api\/tc\/companies\.xlsx\?\$\{esc\(withPeople\.toString\(\)\)\}" download><b>Companies with their people/);
  const server = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
  const at = server.indexOf("p === '/api/tc/companies.xlsx'"), gate = server.indexOf('// ------------------------------------------------------- TRAINING CENTRE --');
  assert.ok(gate > 0 && at > gate, 'inside the Training Centre block, behind its gate');
  assert.match(server, /console\.log\(`tc download: \$\{me \? me\.email \|\| me\.name : 'unknown'\}/);
  assert.match(server, /'cache-control': 'no-store', 'content-disposition': `attachment; filename="\$\{name\}"`/);
});
