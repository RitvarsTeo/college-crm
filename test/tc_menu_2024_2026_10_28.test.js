// THE COMPACT MENU and THE 2024 HOLE (28.10.2026): the owner's pick B (Home · Plan · Clients · Help center, the pages as
// tabs) and his pick "Use the review for 2024" on TC Home's Delegates by year. Every company and figure is invented.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { openDb } = await import('../src/db.js');
const tc = await import('../src/tc.js');
const home = await import('../src/tchome.js');
const mr = await import('../src/tcmr.js');
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const AT = '2026-10-28T08:00:00.000Z';

test('Delegates by year: 2024 shows the management review, marked, the Excel figure kept beside it; other years stay the Excel', async () => {
  const db = await openDb();
  const a = (await tc.addCompany(db, { name: 'Example Shipping', country: 'Latvia' }, 'Ritvars')).id;
  for (const [y, n] of [[2023, 100], [2024, 10], [2025, 120]]) await db.prepare('INSERT INTO tc_company_courses (company_id, year, attendees, recorded_at) VALUES (?,?,?,?)').run(a, y, n, AT);
  await mr.mrLoad(db, [{ name: 'Example Shipping', year: 2024, trainees: 90 }, { name: 'Sample Offshore', year: 2024, trainees: 40 }, { name: 'Example Shipping', year: 2025, trainees: 999 }], 'Ritvars', { apply: true });
  const H = await home.homeYear(db, { year: 2025, now: new Date('2026-10-28T09:00:00Z') });
  const by = Object.fromEntries(H.byYear.map((r) => [r.year, r]));
  assert.deepEqual([by[2024].n, by[2024].clients, by[2024].source, by[2024].excel], [130, 2, 'review', 10]);
  assert.deepEqual([by[2025].n, by[2025].source], [120, undefined], '2025 stays the Excel');
  assert.deepEqual([by[2023].n, by[2023].source], [100, undefined]);
  assert.equal(H.delegates.prev.n, by[H.delegates.prev.year].n, 'the comparison year reads the same figure as its column');
  assert.deepEqual(H.delegates.spark, H.byYear.map((r) => r.n), 'the Delegates card line too');
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'tc.json'), 'utf8'));
  assert.deepEqual(cfg.homeReviewYears.years, [2024]);
  const server = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
  assert.match(server, /\[r\.year, r\.excel \?\? r\.n\]/, 'the Client book chapter still compares the review with the Excel\'s own figure');
});

test('the menu and the tabs: Home · Plan · Clients · Help center; Plan = My week · Season · Grand Opening, Clients = Companies · Client book', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  const nav = app.slice(app.indexOf('function tcInstallNav('), app.indexOf('function tcMore(open)'));
  assert.match(nav, /data-c="tc-plan"[^>]*>\$\{C_ICON\.next\}<span>Plan<\/span>/);
  assert.match(nav, /data-c="tc-companies"[^>]*>\$\{T_ICON\.co\}<span>Clients<\/span>/);
  assert.match(nav, /tab\(week \? '#\/tc\/week' : '#\/tc\/next', 'plan', C_ICON\.next, 'Plan'\)\}\$\{tab\('#\/tc\/companies', 'clients', T_ICON\.co, 'Clients'\)\}/, 'the phone too');
  const tabs = app.slice(app.indexOf('function tcPageTabs('), app.indexOf('function tcTabsPut('));
  for (const t of ["'My week'", "'Season'", "'Grand Opening'", "'Companies'", "'Client book'"]) assert.ok(tabs.includes(t), t);
  assert.match(app, /new MutationObserver\(\(\) => tcTabsPut\(\)\)\.observe\(v, \{ childList: true \}\)/, 'the strip comes back when a page redraws');
  assert.match(app, /'<li><span>\* management review<\/span><\/li>'/);
  assert.match(app, /\$\{Number\(r\.year\)\}\$\{rv \? '\*' : ''\}<\/text>/);
  const help = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'help.json'), 'utf8'));
  const where = help.tc.howto.map((h) => h.where);
  assert.ok(where.includes('Plan, Grand Opening') && where.includes('Clients, Client book'));
});
