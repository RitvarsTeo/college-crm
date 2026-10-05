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
  ['Home', 'Admitted card', 'function cHomeB(D) {', /onclick="cGoReportYear\('admitted'\);return false">Reports →/],   // Q35: all four cards open their Reports tab
  ['Home', 'Leads / Conversion / Median cards', 'function cHomeB(D) {', /onclick="cGoReportYear\('(?:leads|conversion|median)'\);return false">Reports →/],
  ['Home', 'Donut slices and legend', 'function cDonut(rows) {', /data-kgo="\$\{go === 'journey' \? 'journey' : 'outcome\|' \+ go\}"/],
  ['Home', 'Donut centre', 'function cDonut(rows) {', /data-kgo="people"/],
  ['Home', 'Month bands', 'function cMonthChart(months, year, fitH = 0) {', /data-kgo="month\|\$\{m\.month\}\|/],
  ['Today', 'planned %', 'function cTodayPool() {', /<a class="c-planned" href="#\/journey" onclick="cGoPeople\(\{ stage: 'open' \}\);return false">/],
  // Q47: the same card one level deeper - Home's Needs you is Today's band, each card the click to its people
  ['Today', 'Needs you cards', 'function cTodayPool() {', /band: cPoolCards\('Today', 'Needs you', groups\.map/],
  ['Today', 'a card narrows the list', 'function cPoolCards(', /onclick="\$\{pick\}\(this\.dataset\.v\)"><span>\$\{esc\(c\.label\)\}<\/span><b>\$\{c\.n\}<\/b>/],
  ['Inbox', 'age columns', 'function cInboxPool() {', /band: cPoolBand\('Inbox', cols, C_IP\.col, 'cInboxPick'\)/],
  ['Journey', 'pool columns', 'function cDrawJourneyPool() {', /band: cPoolBand\('The journey', cols, C_JP\.col, 'cJourneyPick'\)/],
  ['Journey', 'Active journey count', 'function cJourneySummary(', /class="c-jcount" href="#\/people" onclick="cGoPeople\(\{ stage: 'open' \}\)/],
  ['Journey', 'What comes next cells', 'function cJourneySummary(', /onclick="cJfPick\('\$\{key\}', this\.dataset\.v/],
  ['Journey', 'Arrived', 'function cJourneyBand(', /onclick="cGoPeople\(\{ arrived: '\$\{out\.year\}' \}\);return false"><span>Arrived/],
  ['Journey', 'Stage columns', 'function cJourneyBand(', /onclick="cJfPick\('stage', this\.dataset\.v/],
  ['Journey', 'Admitted / Not proceeding', 'function cJourneyBand(', /onclick="C_OUTCOME='Not proceeding';C_OUT_TAG=null"/],
  ['Journey', 'Board column "N overdue"', 'function cDrawJourney() {', /<button type="button" class="c-jover" onclick="cJfOverdue\('\$\{esc\(s\.id\)\}'\)">/],
  // Q47: Outcomes are the Journey's last two columns, Cold / Reject the filter on Not proceeding
  ['Outcomes', 'Admitted / Not proceeding columns', 'function cDrawJourneyPool() {', /\{ id: admitted, label: admitted, n: base\.filter\(\(p\) => p\.status === admitted\)\.length, tone: 'good', sep: true \}/],
  ['Outcomes', 'Everybody / Cold / Reject', 'function cDrawJourneyPool() {', /cPoolSelect\('Cold \/ Reject', C_OUT_TAG \|\| '', tags, 'C_OUT_TAG=this\.value/],
  ['Outcomes', 'Why they stopped bars', 'function cReasonBreakdown(', /onclick="C_OUT_REASON=this\.dataset\.r;viewOutcomesC\(\)/],
  ['Menu', 'Today and Inbox badges', 'function installCNav() {', /<a href="#\/today" data-c="today"[^>]*>\$\{C_ICON\.next\}<span>Today<\/span><span class="n" id="cnNext">/],
  ['Menu', 'Journey badge', 'function installCNav() {', /<a href="#\/journey" data-c="people"[^>]*>\$\{C_ICON\.journey\}<span>Journey<\/span><span class="n" id="cnJourney">/],
];

for (const [screen, figure, where, target] of FIGURES) {
  test(`${screen} · ${figure} opens its people`, () => {
    assert.match(fnBody(where), target);
  });
}

test('Today drops its strip: Home\'s Needs you already says it (no duplicate)', () => {
  const today = fnBody('async function viewTodayC() {') + fnBody('function cTodayPool() {');
  assert.doesNotMatch(today.replace(/\/\/[^\n]*/g, ''), /c-todaystrip|waiting in the Inbox/);
  // Q47: Home's figures land on their card, and a section heading keeps its count (people)
  assert.match(today, /C_TP\.col = \{ cTodayOver: 'over', cTodayDue: 'today', cTodayNone: 'none' \}\[C_TODAY_AT\] \|\| null;/, 'Home lands on the card');
  assert.match(today, /<h3>\$\{g\.label\}<b\$\{g\.tone && g\.rows\.length && g\.tone !== 'none' \? ` class="c-count \$\{g\.tone\}"` : ''\}>\$\{g\.rows\.length\}<\/b><\/h3>/, 'the sections keep their counts');
});

test('the helpers land on exactly the cohort', () => {
  const ctx = { location: { hash: '#/home' }, C_PDATA: null, viewTodayC() {}, cDrawJourney() {}, cPoolRouteJourney() {},
    C_PF: null, C_PQ: 'x', C_PEDIT: 'p1', C_PMSG: 'x', C_PTAB: 'journey', C_JF: null, C_JFOPEN: 'y',
    C_TP: { col: null }, C_JP: { col: 'Application', view: 'board' } };
  vm.runInNewContext([APP.match(/const C_PF_EMPTY = [^\n]*/)[0].replace('const ', 'var '), APP.match(/const C_JF_EMPTY = [^\n]*/)[0].replace('const ', 'var '),
    fnBody('function cGoPeople(filter) {'), APP.match(/function cGoToday\(section\) [^\n]*/)[0], 'var C_TODAY_AT = "";',
    APP.match(/function cJfOverdue\(stage\) [^\n]*/)[0]].join('\n'), ctx);
  // Q47: Home's No next step opens Today on that card; any other People filter opens the Journey, everyone, as a list
  ctx.cGoPeople({ due: 'none' });
  assert.equal(ctx.location.hash, '#/today');
  assert.equal(ctx.C_TP.col, 'none');
  ctx.location.hash = '#/home';
  ctx.cGoPeople({ arrived: '2026' });
  assert.equal(ctx.location.hash, '#/journey');
  assert.equal(ctx.C_PF.arrived, '2026');
  assert.equal(ctx.C_PF.stage, '', 'nothing else narrows it');
  assert.equal(ctx.C_JP.col, null); assert.equal(ctx.C_JP.view, 'list');
  assert.equal(ctx.C_PQ, '');
  ctx.location.hash = '#/home'; ctx.cGoToday('cTodayOver');
  assert.equal(ctx.location.hash, '#/today'); assert.equal(ctx.C_TODAY_AT, 'cTodayOver');
  ctx.cJfOverdue('Application');
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.C_JF.stage)), ['Application']);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.C_JF.due)), ['over']);
  assert.match(fnBody('function cPeopleMatch('), /if \(f\.arrived && !cDay\(p\.created_at\)\.startsWith\(f\.arrived\)\) return false;/, 'People can count who arrived in a year');
});

// Q43, the owner 05.10.2026: Today lists ONE row per PERSON in Overdue and Due today, so Home's figure (people) is the
// number of rows that open, even when somebody has two overdue tasks.
test('Home\'s Overdue equals Today\'s rows when a person has two overdue tasks', () => {
  const ctx = {};
  vm.runInNewContext(fnBody('function cByPerson(tasks) {'), ctx);
  const over = [{ id: 1, person_id: 'a' }, { id: 2, person_id: 'a' }, { id: 3, person_id: 'b' }, { id: 4, person_id: 'c' }];
  const rows = ctx.cByPerson(over);
  const homeOverdue = new Set(over.map((t) => t.person_id)).size;   // how Home counts it (cHomeData)
  assert.equal(rows.length, homeOverdue, 'three people, three rows');
  assert.deepEqual(JSON.parse(JSON.stringify(rows.map((r) => r.map((t) => t.id)))), [[1, 2], [3], [4]], 'a person keeps both tasks, in order');
  assert.match(fnBody('async function cHomeData() {'), /overdueRows \? new Set\(overdueRows\.map\(\(t\) => t\.person_id\)\)\.size : null/);
  assert.match(fnBody('async function viewTodayC() {'), /const pTasks = \(ts\) => ts\.length === 1 \? tRow\(ts\[0\]\) :/, 'one task: the row as before; several: all inside the row');
});

// Q43 picks: Cold / Reject only in Outcomes; the donut is Open + Not proceeding; the board headers carry no stage number.
test('Cold / Reject only in Outcomes, the donut without Admitted, the board headers without their number', () => {
  const home = fnBody('function cHomeB(D) {');
  assert.doesNotMatch(home, /cGoClosedTag|ktags/, 'no Cold / Reject on Home');
  assert.doesNotMatch(fnBody('function cJourneyBand('), /cGoClosedTag|kfl-tags/, 'none on the Journey band');
  assert.match(fnBody('function cDrawJourneyPool() {'), /isNp && tags\.length \? cPoolSelect\('Cold \/ Reject'/, 'they are on the Journey\'s Not proceeding (Outcomes)');
  assert.match(home, /\['Open', D\.open\.length, 'open', 'journey'\], \['Not proceeding', D\.closed\.length, 'np', 'Not proceeding'\]\]/);
  assert.doesNotMatch(home, /'Admitted', D\.allAdmitted/);
  assert.doesNotMatch(fnBody('function cDrawJourney() {'), /\$\{esc\(s\.label \|\| s\.id\)\} <b>\$\{ps\.length\}<\/b>/, 'the band keeps the stage counts');
});
