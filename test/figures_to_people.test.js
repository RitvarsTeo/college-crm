// Q36, the owner 05.10.2026: "the main of the app is to find people, find who they are, or where they are, whats going
// on with them, how can we help ... So everything has to be connected with each other, path to path to path." And:
// "Nothing should be duplicated. Its confusing." Every figure on MAIN's screens is a click to the people it counts,
// with the filter that counts it, so the count on arrival is the figure. This walks them.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fnBody = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };

// [screen, figure, where its code is, the target it must carry]
const FIGURES = [
  ['Home', 'Overdue', 'function cHomeB(D) {', /need\('Overdue', D\.overdue, "cGoToday\('cTodayOver'\)"/],
  ['Home', 'Due today', 'function cHomeB(D) {', /need\('Due today', D\.dueToday, "cGoToday\('cTodayDue'\)"/],
  ['Home', 'In the Inbox', 'function cHomeB(D) {', /need\('In the Inbox', D\.inbox, '', '#\/leads'/],
  ['Home', 'No next step', 'function cHomeB(D) {', /need\('No next step', D\.noNext, "cGoPeople\(\{ due: 'none' \}\)"/],
  ['Home', 'Admitted card', 'function cHomeB(D) {', /onclick="cGoAdmittedYear\(\$\{D\.year\}\);return false">Outcomes →/],
  ['Home', 'Leads / Conversion / Median cards', 'function cHomeB(D) {', /onclick="cGoReportYear\(\);return false">Reports →/],
  ['Home', 'Donut slices and legend', 'function cDonut(rows) {', /data-kgo="\$\{go === 'journey' \? 'journey' : 'outcome\|' \+ go\}"/],
  ['Home', 'Donut centre', 'function cDonut(rows) {', /data-kgo="people"/],
  ['Home', 'Cold / Reject', 'function cHomeB(D) {', /cGoClosedTag\('\$\{esc\(id\)\}'\)/],
  ['Home', 'Month bands', 'function cMonthChart(months, year) {', /data-kgo="month\|\$\{m\.month\}\|/],
  ['Today', 'planned %', 'async function viewTodayC() {', /<a class="c-planned" href="#\/people" onclick="cGoPeople\(\{ stage: 'open' \}\);return false">/],
  ['Journey', 'Active journey count', 'function cJourneySummary(', /class="c-jcount" href="#\/people" onclick="cGoPeople\(\{ stage: 'open' \}\)/],
  ['Journey', 'What comes next cells', 'function cJourneySummary(', /onclick="cJfPick\('\$\{key\}', this\.dataset\.v/],
  ['Journey', 'Arrived', 'function cJourneyBand(', /onclick="cGoPeople\(\{ arrived: '\$\{out\.year\}' \}\);return false"><span>Arrived/],
  ['Journey', 'Stage columns', 'function cJourneyBand(', /onclick="cJfPick\('stage', this\.dataset\.v/],
  ['Journey', 'Admitted / Not proceeding', 'function cJourneyBand(', /onclick="C_OUTCOME='Not proceeding';C_OUT_TAG=null"/],
  ['Journey', 'Board column "N overdue"', 'function cDrawJourney() {', /<button type="button" class="c-jover" onclick="cJfOverdue\('\$\{esc\(s\.id\)\}'\)">/],
  ['Outcomes', 'Admitted / Not proceeding toggle', 'async function viewOutcomesC() {', /onclick="C_OUTCOME='Admitted';viewOutcomesC\(\)"/],
  ['Outcomes', 'Everybody / Cold / Reject', 'function cTagSplit(', /C_OUT_TAG=/],
  ['Outcomes', 'Why they stopped bars', 'function cReasonBreakdown(', /onclick="C_OUT_REASON=this\.dataset\.r;viewOutcomesC\(\)/],
  ['Menu', 'Today and Inbox badges', 'function installCNav() {', /<a href="#\/today" data-c="today"[^>]*><span>Today<\/span><span class="n" id="cnNext">/],
];

for (const [screen, figure, where, target] of FIGURES) {
  test(`${screen} · ${figure} opens its people`, () => {
    assert.match(fnBody(where), target);
  });
}

test('Today drops its strip: Home\'s Needs you already says it (no duplicate)', () => {
  const today = fnBody('async function viewTodayC() {');
  assert.doesNotMatch(today.replace(/\/\/[^\n]*/g, ''), /c-todaystrip|waiting in the Inbox/);
  assert.match(today, /sect\('Overdue', over, tRow, 'over', 'cTodayOver'\)\}\$\{sect\('Due today', today, tRow, 'today', 'cTodayDue'\)\}/, 'the sections keep their counts and carry the anchors');
});

test('the helpers land on exactly the cohort', () => {
  const ctx = { location: { hash: '#/home' }, C_PDATA: null, cDrawPeople() {}, viewTodayC() {}, cDrawJourney() {},
    C_PF: null, C_PQ: 'x', C_PEDIT: 'p1', C_PMSG: 'x', C_PTAB: 'journey', C_JF: null, C_JFOPEN: 'y' };
  vm.runInNewContext([APP.match(/const C_PF_EMPTY = [^\n]*/)[0].replace('const ', 'var '), APP.match(/const C_JF_EMPTY = [^\n]*/)[0].replace('const ', 'var '),
    fnBody('function cGoPeople(filter) {'), APP.match(/function cGoToday\(section\) [^\n]*/)[0], 'var C_TODAY_AT = "";',
    APP.match(/function cJfOverdue\(stage\) [^\n]*/)[0]].join('\n'), ctx);
  ctx.cGoPeople({ due: 'none' });
  assert.equal(ctx.location.hash, '#/people');
  assert.equal(ctx.C_PF.due, 'none');
  assert.equal(ctx.C_PF.stage, '', 'nothing else narrows it');
  assert.equal(ctx.C_PQ, '');
  ctx.location.hash = '#/home'; ctx.cGoToday('cTodayOver');
  assert.equal(ctx.location.hash, '#/today'); assert.equal(ctx.C_TODAY_AT, 'cTodayOver');
  ctx.cJfOverdue('Application');
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.C_JF.stage)), ['Application']);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.C_JF.due)), ['over']);
  assert.match(fnBody('function cPeopleMatch('), /if \(f\.arrived && !cDay\(p\.created_at\)\.startsWith\(f\.arrived\)\) return false;/, 'People can count who arrived in a year');
});
