// Q23, the owner 05.10.2026: "not all metrics are clickable with traced links to according tab, where it came from.
// The pie can be much bigger, to take up its space. The metrics in the cards admitted, leads, conversion, median
// time, can be bigger. ... Delete that above the graph 16 admitted. It is hover over info."
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fnBody = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const HOME = fnBody('function cHomeB(D) {');

test('every Home figure is a click to where it comes from', () => {
  // Needs you and the journey
  // Q36: Overdue / Due today open exactly that section of Today; No next step opens People on that filter
  assert.match(HOME, /need\('Overdue', D\.overdue, "cGoToday\('cTodayOver'\)", '#\/today', 0\)/);
  assert.match(HOME, /need\('Due today', D\.dueToday, "cGoToday\('cTodayDue'\)", '#\/today', 1\)/);
  assert.match(HOME, /need\('In the Inbox', D\.inbox, '', '#\/leads', 2\)/);
  assert.match(HOME, /need\('No next step', D\.noNext, "cGoPeople\(\{ due: 'none' \}\)", '#\/people', 3\)/);
  // the four cards: Admitted -> the year's admitted in Outcomes; the other three -> Reports on This year
  assert.match(HOME, /<div class="khero"><span>Admitted<\/span>[^\n]*onclick="cGoAdmittedYear\(\$\{D\.year\}\);return false">Outcomes →<\/a><\/div>/);
  for (const label of ['Leads', 'Conversion', 'Median time to admission'])
    assert.match(HOME, new RegExp(`<div><span>${label}</span>[^\\n]*onclick="cGoReportYear\\(\\);return false">Reports →</a></div>`), label);
  assert.doesNotMatch(HOME, /href="#\/leads">Inbox →/, 'Leads no longer opens the Inbox, which is not where its figure comes from');
  // the whole card is the click
  assert.match(APP, /html\.ui-c \.kb-strip > div > \.kgo::after\{content:"";position:absolute;inset:0;border-radius:inherit\}/);
  // the donut: slices, centre and legend rows
  const donut = fnBody('function cDonut(rows) {');
  assert.match(donut, /class="khole"[^>]*data-kgo="people"/, 'the centre opens People');
  assert.match(donut, /<li tabindex="0" role="button" data-tip="[^"]*"\s*data-kgo="\$\{go === 'journey' \? 'journey' : 'outcome\|' \+ go\}"/, 'legend rows go where their slice goes');
  assert.match(fnBody('function cChartGo(spec) {'), /if \(kind === 'people'\) \{ location\.hash = '#\/people'; return; \}/);
  assert.doesNotMatch(HOME, /cGoClosedTag/, 'Cold / Reject live in Outcomes only (Q43)');
});

test('the link helpers open the same period as the figure', () => {
  const ctx = { location: { hash: '#/home' }, cTodayIso: () => '2026-10-05', viewOutcomesC() {}, viewReportsC() {}, C_OUTCOME: '', C_OUT_TAG: 'cold', C_OUT_FILTER: null, C_RPT_PRESET: 'month', RPT: {} };
  vm.runInNewContext(fnBody('function cGoAdmittedYear(year) {') + fnBody('function cGoReportYear() {'), ctx);
  ctx.cGoAdmittedYear(2026);
  assert.equal(ctx.location.hash, '#/outcomes');
  assert.equal(ctx.C_OUTCOME, 'Admitted');
  assert.equal(ctx.C_OUT_TAG, null);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.C_OUT_FILTER)), { kind: 'year', key: '2026', label: 'admitted in 2026' });
  ctx.location.hash = '#/home';
  ctx.cGoReportYear();
  assert.equal(ctx.location.hash, '#/reports');
  assert.equal(ctx.C_RPT_PRESET, 'year');
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.RPT)), { from: '2026-01-01', to: '' });
});

test('bigger figures on the cards, Admitted still the focal point; a bigger donut that fits its column', () => {
  assert.match(APP, /html\.ui-c #view \.kstrip\.kb-strip > div:not\(\.khero\) > b\{font-size:42px\}/);
  assert.match(APP, /html\.ui-c #view \.kstrip\.kb-strip > \.khero > b\{font-size:54px\}/);
  assert.ok(APP.indexOf('.kstrip.kb-strip > div:not(.khero) > b{font-size:42px}') < APP.indexOf('.kstrip > div:not(.khero) > b{font-size:var(--type-figure)'),
    'it outranks the later type-token rule by weight, not by order');
  assert.match(APP, /html\.ui-c \.kb-top \.kdonut svg\{width:clamp\(150px,13vw,250px\)/);
  assert.match(APP, /html\.ui-c \.kb-top \.klegend\{font-size:15px;gap:12px;flex:0 1 15em;min-width:0\}/, 'the legend shrinks before it spills');
});

test('no figure is printed on one month: every month shows its figures on hover, the same', () => {
  const chart = fnBody('function cMonthChart(months, year) {');
  assert.doesNotMatch(chart, /kpeak|peakAt| admitted<\/text>/);
  assert.match(chart, /data-tip="\$\{mo\} \$\{m\.month\.slice\(0, 4\)\}\|\$\{m\.admitted\} admitted\|\$\{m\.newLeads\} new leads"/, 'the hover says it');
  assert.doesNotMatch(APP, /\.kpeak\{/);
});
