// HOW OUR CLIENTS CHANGED (26.10.2026, src/tcmr.js): the management review in Intake, the owner's picks. Every company
// and figure here is invented.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { openDb } = await import('../src/db.js');
const tc = await import('../src/tc.js');
const mr = await import('../src/tcmr.js');
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function seeded() {
  const db = await openDb();
  const a = (await tc.addCompany(db, { name: 'Example Shipping SIA', country: 'Latvia' }, 'Ritvars')).id;
  const b = (await tc.addCompany(db, { name: 'Sample Offshore', country: 'Norway' }, 'Ritvars')).id;
  await tc.addCompany(db, { name: 'Demo Wind One', country: 'Germany' }, 'Ritvars');
  await tc.addCompany(db, { name: 'Demo Wind Two', country: 'Germany' }, 'Ritvars');
  return { db, a, b };
}
const ROWS = [
  { name: 'Example Shipping', year: 2022, trainees: 100 }, { name: 'Example Shipping', year: 2023, trainees: 100 },
  { name: 'Example Shipping', year: 2024, trainees: 100, rating: 4.6 }, { name: 'Example Shipping', year: 2025, trainees: 150, rating: 4.8 },
  { name: 'Sample', year: 2022, trainees: 50 }, { name: 'Sample', year: 2023, trainees: 50 }, { name: 'Sample', year: 2024, trainees: 80 }, { name: 'Sample', year: 2025, trainees: 40 },
  { name: 'Demo Wind', year: 2025, trainees: 10 },
  { name: 'Nobody Known', year: 2024, trainees: 5 }, { name: 'Nobody Known', year: 2025, trainees: 6 },
];

test('the loader: a preview writes nothing; names match once (same name, or one word only one company has), else stay names', async () => {
  const { db, a, b } = await seeded();
  const pre = await mr.mrLoad(db, ROWS, 'Ritvars');
  assert.deepEqual([pre.counts.rows, pre.counts.names, pre.counts.matched], [11, 4, 2], 'Example Shipping = Example Shipping SIA; Sample = Sample Offshore; Demo Wind is two companies; Nobody Known none');
  assert.equal(Number((await db.prepare('SELECT COUNT(*) AS n FROM tc_mr').get()).n), 0);
  await mr.mrLoad(db, ROWS, 'Ritvars', { apply: true });
  const names = Object.fromEntries((await db.prepare('SELECT review_name, company_id, matched_by FROM tc_mr_names').all()).map((r) => [r.review_name, [r.company_id ? Number(r.company_id) : null, r.matched_by]]));
  assert.deepEqual(names, { 'Example Shipping': [a, 'auto'], Sample: [b, 'auto'], 'Demo Wind': [null, null], 'Nobody Known': [null, null] });
  await db.prepare(`UPDATE tc_mr_names SET company_id = ?, matched_by = 'hand' WHERE review_name = 'Nobody Known'`).run(b);
  await mr.mrLoad(db, [{ name: 'Nobody Known', year: 2025, trainees: 7 }], 'Ritvars', { apply: true });
  assert.equal((await db.prepare(`SELECT matched_by FROM tc_mr_names WHERE review_name = 'Nobody Known'`).get()).matched_by, 'hand', 'a hand match stays');
  assert.equal(Number((await db.prepare(`SELECT trainees FROM tc_mr WHERE review_name = 'Nobody Known' AND year = 2025`).get()).trainees), 7, 'a newer figure replaces the old');
  await assert.rejects(mr.mrLoad(db, [{ name: 'X', year: 2025, rating: 7 }], 'R'), /not 0-5/);
  await assert.rejects(mr.mrLoad(db, [{ name: 'X', year: 2025 }, { name: 'X', year: 2025 }], 'R'), /twice/);
});

test('the chapter: totals per year beside the Excel, a repeated year is marked, Growing / Fewer against the year before; the company card', async () => {
  const { db, a } = await seeded();
  await mr.mrLoad(db, ROWS, 'Ritvars', { apply: true });
  const T = await mr.trends(db, { excelByYear: { 2024: 90, 2025: 200 } });
  assert.deepEqual(T.years, [2022, 2023, 2024, 2025]);
  assert.deepEqual([T.review[2024], T.review[2025], T.excel[2024], T.excel[2022]], [185, 206, 90, 0]);
  assert.deepEqual(T.repeats, [2023], '2023 repeats 2022 exactly');
  const by = Object.fromEntries(T.rows.map((r) => [r.name, r]));
  assert.equal(by['Example Shipping SIA'].trend, 'grow', 'shown with the Intake name; 150 against 100');
  assert.equal(by['Sample Offshore'].trend, 'fewer', '40 against 80');
  assert.equal(by['Demo Wind'].companyId, null, 'no link, still listed');
  assert.deepEqual(T.rows.map((r) => r.name).slice(0, 2), ['Example Shipping SIA', 'Sample Offshore'], 'biggest in the latest year first');
  assert.deepEqual(T.counts, { grow: 1, fewer: 1 });
  assert.deepEqual(T.ratingAvg, { 2024: 4.6, 2025: 4.8 });
  const card = await mr.companyMr(db, a);
  assert.deepEqual(card.years, { 2022: 100, 2023: 100, 2024: 100, 2025: 150 });
  assert.deepEqual(card.rating, [{ year: 2025, rating: 4.8 }, { year: 2024, rating: 4.6 }]);
  assert.deepEqual(await mr.trends(await openDb(), {}), { years: [], rows: [] }, 'nothing loaded: no chapter');
});

test('the page: the chapter at the end of the Client book, questions as headings; the card on the company page; the motion; the route behind the gate', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  const book = app.slice(app.indexOf('async function viewTcBook()'), app.indexOf('async function viewTcBook()') + 9000);
  assert.match(book, /<div id="tcTrends"><\/div>`;\n  cScenes\(\$\('#view'\)\);\n  tcTrendsLoad\(\);/);
  const html = app.slice(app.indexOf('function tcTrendsHtml('), app.indexOf('async function tcTrendsReload('));
  for (const q of ['How our clients changed', 'How many people did our business clients send us each year?', 'Which clients send us more, and which send fewer?']) assert.ok(html.includes(q), q);
  assert.match(app, /<div class="c-pmain">\$\{perYear\}\$\{tcMrCard\(\)\}/);
  assert.ok(app.includes('How has this client done with us over the years?'));
  assert.match(app, /@keyframes tct-barup\{0%\{transform:scaleY\(0\)\}75%\{transform:scaleY\(1\.08\)\}100%\{transform:scaleY\(1\)\}\}/, 'the Piemeri bar');
  assert.match(app, /const q = Math\.min\(1, \(t - t0\) \/ 1125\), e = 1 - Math\.pow\(1 - q, 3\);/, 'the Piemeri count-up');
  assert.match(app, /prefers-reduced-motion:reduce\)\{ html\.ui-c \.tct-mv \*\{animation:none!important\}/);
  assert.doesNotMatch(html.replace(/\/\/.*$/gm, ''), /\b(late|overdue|failed|lost)\b/i, 'nothing reads as blame');
  const server = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
  const gate = server.indexOf('// ------------------------------------------------------- TRAINING CENTRE --');
  assert.ok(server.indexOf("p === '/api/tc/trends' && req.method === 'GET'") > gate && gate > 0);
});
