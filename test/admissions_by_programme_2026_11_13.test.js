// HOME'S ADMISSIONS BY MONTH, BY PROGRAMME (the owner's pick A, 13.11.2026; Admissions: short and long programmes are KPIs
// of their own): a Programme picker - All, each group of config.programmeGroups (Long = NAV + ENG, Short = the four MT
// programmes), each programme - redraws the chart and its table from the server's months per programme, which add up to
// the months of everybody; a month opens the admitted people of that pick. Synthetic people only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

for (const k of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'CRM_DB_DATABASE_URL_UNPOOLED', 'INTAKE_DATABASE_URL']) process.env[k] = '';
const { openDb } = await import('../src/db.js');
const { report } = await import('../src/reports.js');
const { localDate } = await import('../src/bizday.js');

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
const fn = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const Y = Number(localDate().slice(0, 4));
const at = (m, d = 10) => `${Y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T09:00:00.000Z`;

test('the grouping is config: Long = NAV + ENG, Short = the four MT programmes', () => {
  assert.deepEqual(CFG.programmeGroups.map((g) => [g.id, g.label, g.programmes]),
    [['long', 'Long', ['NAV', 'ENG']], ['short', 'Short', ['MT OS', 'MT MR', 'MT MTM', 'MT WTT']]]);
  assert.doesNotMatch(fn('function cHomeProgPicks() {'), /'NAV'|'MT OS'/, 'never written into the page');
});

test('the server: months per programme add up to the months of everybody, each person once under their earliest record', async () => {
  const db = await openDb(':memory:');
  const add = (id, name, status, created, adm, programme, email = null) => db.prepare(`INSERT INTO people (id, name, email, status, created_at, admitted_at, programme)
    VALUES (?,?,?,?,?,?,?)`).run(id, name, email, status, created, adm, programme);
  await add('a1', 'Anna Paraudziņa', 'Admitted', at(1, 2), at(2), 'NAV');
  await add('a2', 'Pēteris Paraugs', 'Admitted', at(1, 3), at(2), 'MT OS');
  await add('g1', 'Gundega Paraudziņa (atsāk studijas)', 'Admitted', at(1, 4), at(3), 'ENG');
  await add('g2', 'Gundega Paraudziņa', 'Admitted', at(2, 4), at(3), 'MT WTT', 'g@example.com');   // one person: ENG (earliest)
  await add('l1', 'Laura Paraudziņa', 'Follow-up', at(2, 5), null, 'MT MR');
  await add('l2', 'Toms Paraugs', 'New', at(3, 5), null, null);
  const r = await report(db, { years: [Y] });
  const mine = (m) => r.trend.find((x) => x.month === `${Y}-${m}`);
  for (const t of r.trend) {
    const sum = (k) => Object.values(r.trendByProgramme).reduce((a, ms) => a + (ms.find((x) => x.month === t.month) || {})[k], 0);
    assert.equal(sum('admitted'), t.admitted, t.month + ' admitted adds up');
    assert.equal(sum('newLeads'), t.newLeads, t.month + ' new leads add up');
  }
  const p = (prog, m) => r.trendByProgramme[prog].find((x) => x.month === `${Y}-${m}`);
  assert.equal(p('ENG', '03').admitted, 1, 'the student counts under ENG, their earliest record');
  assert.equal((r.trendByProgramme['MT WTT'] || []).length, 0, 'never under the second record\'s programme');
  assert.equal(p('(not recorded)', '03').newLeads, 1);
  assert.equal(mine('02').admitted, 2);
});

test('the page: the picker sums the programmes of the pick; a month opens that pick\'s admitted people', () => {
  const ctx = { CFG, C_HOME_PROG: '' };
  vm.runInNewContext(['let C_HOME_PROG = \'\';', fn('function cHomeProgPicks() {'), fn('function cHomeMonthsFor(D) {'),
    'this.picks = cHomeProgPicks; this.for = cHomeMonthsFor; this.set = (k) => { C_HOME_PROG = k; };'].join('\n'), ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.picks().map(([k, l]) => [k, l]))),
    [['', 'All'], ['g:long', 'Long'], ['g:short', 'Short'], ...CFG.programmes.map((p) => ['p:' + p, p])]);
  const D = { months: [{ month: '2026-02', admitted: 5, newLeads: 9 }],
    progMonths: { NAV: [{ month: '2026-02', admitted: 2, newLeads: 3 }], ENG: [{ month: '2026-02', admitted: 1, newLeads: 1 }], 'MT OS': [{ month: '2026-02', admitted: 2, newLeads: 5 }] } };
  assert.equal(ctx.for(D)[0].admitted, 5, 'All: the months of everybody');
  ctx.set('g:long');
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.for(D)[0])), { month: '2026-02', admitted: 3, newLeads: 4, progs: ['NAV', 'ENG'] });
  ctx.set('p:MT OS');
  assert.equal(ctx.for(D)[0].admitted, 2);
  assert.match(APP, /data-kgo="month\|\$\{m\.month\}\|\$\{mo\} \$\{m\.month\.slice\(0, 4\)\}\$\{m\.progs \? '\|' \+ m\.progs\.join\(','\) : ''\}"/);
  assert.match(fn('function cChartGo(spec) {'), /progs: progList\.split\(','\)/);
  assert.match(APP, /if \(oF\.progs\) list = list\.filter\(\(p\) => oF\.progs\.includes\(p\.programme\)\);/, 'Outcomes keeps that pick');
});
