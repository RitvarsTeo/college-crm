// Q35, the owner 05.10.2026: "Next item is confusing in full report tab. we have the same metrics that are in the
// home. Lets not be redundant ok, but smartly make it obvious that full report page is going deeper on the metrics
// that are on home". Then: "path to path to path" (every figure opens its people) and "Nothing should be duplicated".
// Two ways were built (A stacked chapters, B one tab per Home figure); he PICKED B. This file pins B.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { seed } from '../src/seed.js';
import { report } from '../src/reports.js';
import { localDate } from '../src/bizday.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
const fnBody = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const line = (start) => { const i = APP.indexOf(start); assert.ok(i >= 0, start); return APP.slice(i, APP.indexOf('\n', i)); };
const BLOCK = APP.slice(APP.indexOf('// ---------------------------------------------------- FULL REPORT, ONE LEVEL DEEPER (Q35)'),
  APP.indexOf('// apply.novikontas.org, from the SIS'));
const ORDER = ['Admitted', 'Leads', 'Conversion', 'Median time to admission', 'Where everyone is now', 'Applications'];

function load() {
  const riga = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Riga', year: 'numeric', month: '2-digit', day: '2-digit' });
  const ctx = {
    CFG, location: { hash: '#/reports' }, C_RPT_PRESET: 'year', RPT: { from: '', to: '' }, C_PCOHORT: null, C_PF: { stage: 'x' }, C_PQ: 'q', C_PEDIT: 'p', C_PMSG: 'm', C_PTAB: 'journey',
    C_PF_EMPTY: () => ({ stage: '', programme: '', due: '', owner: '', source: '', data: '' }), viewPeopleC() { ctx.drew = true; },
    esc: (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
    cDay: (iso) => (iso ? riga.format(new Date(iso)) : ''),
    cStage: (id) => ((CFG.stages || []).find((s) => s.id === id) || {}).label || id || '',
    cChannel: (c) => (!c || c === 'unknown' ? ['Not recorded', 'no source was kept'] : [c, '']),
    cSheetNotice: () => '', cTodayIso: () => localDate(),
  };
  vm.runInNewContext([line('const C_MONTHS ='), line('const C_TERMINAL ='), BLOCK,
    'this.X = { cRepModel, cRepHtml, cRepBuckets, cRepPeriodWord, cRepPeriod, cGoCohort, setCoh: (c) => { C_REP_COH = c; }, setCh: (c) => { C_REP_CH = c; } };'].join('\n'), ctx);
  return ctx;
}

// The synthetic dataset, the report the server draws, and the people rows People lists.
async function data() {
  const db = await openDb(':memory:');
  await seed(db);
  const people = await db.prepare('SELECT * FROM people').all();
  return { db, people };
}
const year = () => localDate().slice(0, 4);
async function page(period = { from: `${year()}-01-01` }, ch = null) {
  const { db, people } = await data();
  const r = await report(db, period);
  const ctx = load();
  ctx.X.setCh(ch);
  const M = ctx.X.cRepModel(r, people, CFG, localDate());
  const [from, to] = r.period.label.split(' to ');
  return { db, people, r, M, ctx, html: ctx.X.cRepHtml(M, from, to) };
}

test('Reports is B: one tab per Home figure, Admitted open; A, the switch and the earlier report are gone', async () => {
  for (const gone of ['cRepMode(', 'cRepMode =', 'viewReportsDepth', "get('rep')", 'rp-index', 'rp-echo', 'c-nowbar', 'cAdmittedFrom', 'cProgBars', 'c-five'])
    assert.ok(!APP.includes(gone), 'gone: ' + gone);
  const view = fnBody('async function viewReportsC() {');
  assert.match(view, /^async function viewReportsC\(\) \{\n  const P = cRepPeriod\(\);/);
  assert.match(view, /\$\('#view'\)\.innerHTML = cRepHtml\(M, from, to\);/);
  const { html } = await page();
  assert.match(html, /^<div class="c-head"><div><h1>Reports<\/h1><p>/, 'titled Reports like the menu, no crumb');
  assert.doesNotMatch(html, /c-crumb|Full report/);
  assert.deepEqual([...html.matchAll(/<div class="rp-tab" role="tab" id="rep-tab-(\w+)" tabindex="0" aria-selected="(true|false)" aria-controls="rep-\1" onclick="cRepTab\('\1'\)"[^>]*><span>([^<]+)<\/span>/g)]
    .map((m) => [m[3], m[2]]), ORDER.map((l, i) => [l, String(i === 0)]), 'the tab row is Home\'s cards, in Home\'s order, Admitted open');
  const panels = [...html.matchAll(/<section class="rp-ch" id="rep-(\w+)" role="tabpanel" aria-labelledby="rep-tab-\1" data-ch="\1"( hidden)?>/g)];
  assert.deepEqual(panels.map((m) => [m[1], !!m[2]]), [['admitted', false], ['leads', true], ['conversion', true], ['median', true], ['now', true], ['applications', true]]);
  assert.match(fnBody('function cRepTab(id) {'), /s\.hidden = s\.dataset\.ch !== id;/, 'a tab shows its chapter and hides the rest');
  assert.match(APP, /html\.ui-c \.rp-tab\[aria-selected="false"\] \.rp-go\{pointer-events:none\}/, 'on a closed tab the whole card opens the chapter');
});

test('the time axis follows the period: months to this month, days, weeks; never past today', () => {
  const B = load().X.cRepBuckets;
  const plain = (v) => JSON.parse(JSON.stringify(v));   // arrays made inside the vm are of another realm
  const keys = (b) => plain(b.list.map((x) => x.key));
  const y = B('2026-01-01 to 2026-10-31', '2026-10-05');
  assert.equal(y.grain, 'month');
  assert.deepEqual(keys(y), ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'], 'the year: January to this month');
  const m = B('2026-10-01 to 2026-10-31', '2026-10-05');
  assert.equal(m.grain, 'day');
  assert.deepEqual(keys(m), ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'], 'this month: its days so far');
  assert.equal(B('2026-09-01 to 2026-09-30', '2026-10-05').list.length, 30, 'last month: every day');
  const w = B('2026-08-05 to 2026-09-30', '2026-10-05');
  assert.equal(w.grain, 'week');
  assert.deepEqual(plain(w.list.slice(0, 2).map((x) => [x.from, x.to])), [['2026-08-05', '2026-08-09'], ['2026-08-10', '2026-08-16']], 'Monday to Sunday, cut to the period');
  assert.equal(w.list.at(-1).to, '2026-09-30');
  const all = B('2024-11-15 to 2026-10-31', '2026-10-05');
  assert.equal(all.list[0].key, '2024-11');
  assert.equal(all.list[0].from, '2024-11-15', 'the first month starts where the period does');
  assert.equal(all.list.length, 24, 'everything: every month');
  assert.equal(load().X.cRepPeriodWord('2026-01-01 to 2026-10-31', '2026-10-05'), '2026', 'the header word matches the chart');
});

test('every figure counts the same people the server report counts, in every preset', async () => {
  const { db, people } = await data();
  const today = localDate();
  const [y, mo] = today.split('-').map(Number);
  const last0 = new Date(Date.UTC(y, mo - 2, 1)).toISOString().slice(0, 10), last1 = new Date(Date.UTC(y, mo - 1, 0)).toISOString().slice(0, 10);
  for (const period of [{ from: `${year()}-01-01` }, {}, { from: last0, to: last1 }, { from: '2000-01-01', to: today }]) {
    const r = await report(db, period);
    const M = load().X.cRepModel(r, people, CFG, today);
    const s = r.summary;
    assert.equal(M.leads.all.n, s.newLeads, 'leads');
    assert.equal(M.conversion.reachedApplication.n, s.applications, 'reached Application or beyond');
    assert.equal(M.conversion.won.n, s.conversionA, 'conversion a');
    assert.equal(M.conversion.base.n, s.conversionB, 'conversion b');
    assert.equal(M.conversion.pct, s.conversionPct, 'conversion %');
    assert.equal(M.median.days, s.medianDaysToAdmission, 'median');
    assert.equal(M.leads.maritime.n, s.maritimeGraduates, 'maritime school');
    assert.equal(M.leads.eduRecorded.n, r.coverage.education.filled, 'education recorded');
    assert.equal(M.leads.natRecorded.n, r.coverage.nationality.filled, 'nationality recorded');
    assert.equal(M.admitted.all.n, s.admitted, 'admitted (synthetic: every admitted_at is an Admitted person)');
    const byValue = (rows) => Object.fromEntries(rows.filter((x) => x.n || x.count).map((x) => [x.value, x.n ?? x.count]));
    for (const [mine, theirs] of [['byChannel', 'source'], ['byProgramme', 'programme'], ['byStudyForm', 'studyForm'], ['byEducation', 'education'], ['byNationality', 'nationality']])
      assert.deepEqual(byValue(M.leads[mine]), byValue(r.breakdowns[theirs]), mine);
    for (const x of r.programmes) assert.equal((M.admitted.byProgramme.find((z) => z.value === x.programme) || { n: 0 }).n, x.admitted, 'admitted ' + x.programme);
    // the time axis adds up to the period's figures, and a month agrees with the server's month
    const sum = (rows) => rows.reduce((a, x) => a + x.n, 0);
    assert.equal(sum(M.leads.byTime), M.leads.all.n, 'leads over time = leads');
    assert.equal(sum(M.admitted.byTime), M.admitted.all.n, 'admitted over time = admitted');
    if (M.grain === 'month') for (const t of r.trend) {
      const mine = M.leads.byTime.find((x) => x.key === t.month);
      if (mine && mine.from.endsWith('-01')) assert.equal(mine.n, t.newLeads, 'leads in ' + t.month);
    }
    const stage = Object.fromEntries(M.now.grid.map((g) => [g.stage, g.cells.reduce((a, c) => a + c.n, 0)]).filter(([, n]) => n));
    assert.deepEqual(stage, byValue(r.breakdowns.stage), 'stage by programme adds up to every stage');
    for (const [k, c] of Object.entries(M.coh)) assert.equal(new Set(c.ids).size, c.ids.length, k + ' counts nobody twice');
  }
});

// A tiny HTML walk: tags with their attributes and the text under them.
function walk(html, onText) {
  const stack = []; const re = /<(\/?)([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g; let m;
  const VOID = new Set(['input', 'br', 'img', 'hr']);
  while ((m = re.exec(html))) {
    if (m[4] !== undefined) { if (m[4].trim()) onText(m[4], stack); continue; }
    if (m[1]) { while (stack.length && stack.pop().tag !== m[2]) { /* close up to the match */ } continue; }
    if (!VOID.has(m[2]) && !/\/\s*$/.test(m[3])) stack.push({ tag: m[2], attrs: m[3] });
  }
}
const ALLOWED = (stack, text) => stack.some((e) => /data-coh=|data-kgo=/.test(e.attrs))      // a figure: its people
  || stack.some((e) => /class="[^"]*\b(kt2|ktgt-goal|c-head|c-periodbar)\b/.test(e.attrs))      // basis, config target, period
  || stack.some((e) => ['small', 'summary', 'th'].includes(e.tag))
  || /^(\d{1,2} )?[A-Z][a-z]{2} \d{4}( to .+)?$/.test(text.trim());                             // a day, week or month in a table

test('every figure on the page has a target, and the count on arrival is the figure', async () => {
  for (const period of [{ from: `${year()}-01-01` }, {}]) {
    const { M, html } = await page(period);
    const dead = [];
    walk(html, (text, stack) => { if (/\d/.test(text) && !ALLOWED(stack, text)) dead.push(text.trim()); });
    assert.deepEqual(dead, [], 'figures with nowhere to go');
    for (const m of html.matchAll(/data-n="(\d+)"[^>]*data-coh="(q\d+)"/g))
      assert.equal(M.coh[m[2]].ids.length, Number(m[1]), 'the people behind ' + M.coh[m[2]].label);
    for (const m of html.matchAll(/data-coh="(q\d+)"/g)) assert.ok(M.coh[m[1]], 'a known cohort ' + m[1]);
    for (const m of html.matchAll(/data-n="(\d+)" data-kgo="outcome\|([^"]+)"/g))
      assert.ok(['Admitted', 'Not proceeding'].includes(m[2]), 'Admitted and Not proceeding open Outcomes on that outcome');
    assert.doesNotMatch(html, /c-static/, 'no static bar left');
  }
});

test('a figure opens People on exactly its people, every other filter cleared', () => {
  const ctx = load();
  ctx.X.setCoh({ q7: { label: 'Leads · 2026 · came from Phone', ids: ['a', 'b', 'c'] } });
  ctx.X.cGoCohort('q7');
  assert.equal(ctx.location.hash, '#/people');
  assert.deepEqual([...ctx.C_PCOHORT.ids], ['a', 'b', 'c']);
  assert.equal(ctx.C_PQ, '');
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.C_PF)), ctx.C_PF_EMPTY());
  const draw = fnBody('function cDrawPeople() {');
  assert.match(draw, /if \(C_PCOHORT\) ps = ps\.filter\(\(p\) => C_PCOHORT\.ids\.has\(p\.id\)\);/, 'People lists only the cohort');
  assert.match(draw, /C_PCOHORT=null;cDrawPeople\(\)">Show everyone ✕/, 'and one click shows everyone again');
  assert.match(fnBody('function cChartGo(spec) {'), /if \(kind === 'cohort'\) \{ cGoCohort\(key\); return; \}/, 'bars and columns route through the same door');
  assert.match(fnBody('async function routeC(page, arg) {'), /if \(!\(place === 'people' && page !== 'journey'\)\) C_PCOHORT = null;/, 'a cohort never follows you elsewhere');
});

test('each tab starts with its Home card: the same label and the same figure', async () => {
  const { db, people, M, html } = await page();
  // what Home draws (cHomeData): /api/report for the calendar year, Admitted from the people rows
  const home = (await report(db, { from: `${year()}-01-01`, to: `${year()}-12-31` })).summary;
  const riga = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Riga', year: 'numeric', month: '2-digit', day: '2-digit' });
  const homeAdmitted = people.filter((p) => p.status === 'Admitted' && p.admitted_at && riga.format(new Date(p.admitted_at)).startsWith(year())).length;
  const want = { admitted: ['Admitted', `data-n="${homeAdmitted}"`], leads: ['Leads', `data-n="${home.newLeads}"`],
    conversion: ['Conversion', `data-v="${home.conversionPct}%"`], median: ['Median time to admission', `data-v="${home.medianDaysToAdmission}"`],
    now: ['Where everyone is now', `data-n="${people.length}"`] };
  assert.equal(M.pw, year(), 'This year reads as the year, as on Home');
  for (const [id, [label, fig]] of Object.entries(want)) {
    const tab = html.slice(html.indexOf(`<div class="rp-tab" role="tab" id="rep-tab-${id}"`));
    assert.match(tab, new RegExp(`^<div class="rp-tab"[^>]*><span>${label}</span><b><a class="rp-go" href="#/people" ${fig}`), id);
  }
  assert.match(html, new RegExp(`<span>Leads</span><b>[^]*?<small>${year()} · people added</small>`), 'a lead is a person added, not an Inbox row');
  assert.match(html, new RegExp(`<small>${year()} · admission date`), 'Admitted says its basis');
  assert.match(html, new RegExp(`<h2>By month</h2><span class="kt2">${year()} · admission date</span>`), 'the chart says the same period as the header');
});

test('no figure twice on the page', async () => {
  const { M, html } = await page();
  const seen = {};
  const outside = html.replace(/<details[^]*?<\/details>/g, '');        // "Show as a table" is the same chart, read as rows
  for (const m of outside.matchAll(/data-n="\d+"[^>]*data-coh="(q\d+)"/g)) seen[m[1]] = (seen[m[1]] || 0) + 1;
  const twice = Object.entries(seen).filter(([k, n]) => n > (k === M.leads.all.k ? 2 : 1)).map(([k]) => M.coh[k].label);
  assert.deepEqual(twice, [], 'shown twice');
  // the one allowed repeat: the leads under Conversion's 12 / 63, the working of the share, exactly as on Home's card
  assert.ok((seen[M.leads.all.k] || 0) <= 2);
  // open / overdue / no next step are Today's; why people stopped is Outcomes'
  assert.doesNotMatch(html, /c-nowbar|>overdue<|no next step|Why people did not proceed/);
  assert.doesNotMatch(html, /Stage right now/, 'the stage counts are Home and the Journey; Reports draws stage by programme');
});

test('nothing lost: every block of the earlier report has its tab', async () => {
  const { html } = await page();
  const tabOf = (id) => { const i = html.indexOf(`id="rep-tab-${id}"`); return html.slice(i, html.indexOf('</div><div class="rp-tab"', i) >>> 0); };
  const chapter = (id) => { const i = html.indexOf(`<section class="rp-ch" id="rep-${id}"`); const j = html.indexOf('<section class="rp-ch"', i + 10); return tabOf(id) + html.slice(i, j < 0 ? undefined : j); };
  const MAP = [
    ['New leads', 'leads', '<span>Leads</span>'],
    ['Applications (reached Application or beyond)', 'conversion', '<h2>Reached</h2>'],
    ['Admitted', 'admitted', '<span>Admitted</span>'],
    ['Conversion', 'conversion', '<span>Conversion</span>'],
    ['Median time to admission', 'median', '<span>Median time to admission</span>'],
    ['Twelve months: admitted', 'admitted', '<h2>By month</h2>'],
    ['Twelve months: new leads', 'leads', '<h2>By month</h2>'],
    ['By programme: admitted', 'admitted', '<h2>By programme</h2>'],
    ['By programme: new leads + Programme', 'leads', '<h2>By programme</h2>'],
    ['Where they came from', 'leads', '<h2>By channel</h2>'],
    ['Study form', 'leads', '<h2>Study form</h2>'],
    ['Education + its coverage', 'leads', '<h2>Education</h2>'],
    ['Nationality + its coverage', 'leads', '<h2>Nationality</h2>'],
    ['From a maritime school', 'leads', 'maritime school <a class="rp-go"'],
    ['Where admitted people came from', 'admitted', '<h2>By channel</h2>'],
    ['Stage right now', 'now', '<h2>Stage by programme</h2>'],
    ['Why people did not proceed (Outcomes, one click)', 'now', 'data-kgo="outcome|Not proceeding"'],
    ['Applications chapter', 'applications', 'id="cSis"'],
    ['Target meters', 'admitted', 'class="ktgt all"'],
  ];
  for (const [what, id, mark] of MAP) assert.ok(chapter(id).includes(mark), `${what} -> ${id}`);
  for (const k of ['month', 'last', 'year', 'all']) assert.ok(html.includes(`cReportPreset('${k}')`), 'preset ' + k);
  assert.ok(html.includes('onclick="openExport()">Download for management review'), 'the download');
  assert.match(fnBody('async function viewReportsC() {'), /cWebStats\(\);\n  cApplications\(\);/, 'Applications fills as before');
});

test('all four Home cards and #/reports/<chapter> open their tab', async () => {
  const ctx = { location: { hash: '#/home' }, cTodayIso: () => '2026-10-05', viewReportsC() {}, C_RPT_PRESET: 'month', RPT: {}, C_REP_CH: null };
  vm.runInNewContext(fnBody('function cGoReportYear(chapter) {'), ctx);
  ctx.cGoReportYear('median');
  assert.equal(ctx.C_REP_CH, 'median');
  assert.equal(ctx.location.hash, '#/reports');
  assert.match(fnBody('async function routeC(page, arg) {'), /if \(arg\) C_REP_CH = arg;/);
  for (const id of ['leads', 'median', 'applications']) {
    const { html } = await page(undefined, id);
    assert.match(html, new RegExp(`id="rep-tab-${id}" tabindex="0" aria-selected="true"`), id + ' tab open');
    assert.match(html, new RegExp(`<section class="rp-ch" id="rep-${id}" role="tabpanel" aria-labelledby="rep-tab-${id}" data-ch="${id}">`), id + ' panel shown');
  }
});

test('one card style, the two data colours, light and dark', () => {
  const css = APP.slice(APP.indexOf('/* REPORTS, ONE LEVEL DEEPER (Q35'), APP.indexOf('/* Feedback in C: one sheet, open first. */'));
  assert.ok(css.length > 500);
  assert.doesNotMatch(css, /border-top:3px|box-shadow:0 1px 2px/, 'no new card rule: the cards are CARDS 3 (.kstrip > div, .c-sheet)');
  assert.match(css, /\.rp \.kbt i\{background:var\(--v-adm\)\}/, 'counts in the logo blue #29a8df');
  assert.match(css, /\.rp \.rp-rate \.kbt i\{background:var\(--v-tgt\)\}/, 'rates and goals in the data mustard #E0A526');
  assert.match(APP, /html\.ui-c\{--v-tgt:#E0A526;/);
  assert.match(css, /html\.ui-c\[data-theme="dark"\] \.kstrip\.rp-tabs/, 'dark: no panel inside a panel');
});

test('the period is read in one function, so the app-wide year scope can feed it later', () => {
  const view = fnBody('async function viewReportsC() {');
  assert.match(view, /const P = cRepPeriod\(\);/);
  assert.doesNotMatch(view, /RPT\./, 'nothing else in the view reads the presets');
  const ctx = { RPT: { from: '', to: '' }, C_RPT_PRESET: 'month', cTodayIso: () => '2026-10-05' };
  vm.runInNewContext(fnBody('function cRepPeriod() {'), ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.cRepPeriod())), { from: '2026-01-01', to: '' }, 'no period chosen: the year, as Home');
  assert.equal(ctx.C_RPT_PRESET, 'year');
  ctx.RPT = { from: '2026-09-01', to: '2026-09-30' };
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.cRepPeriod())), { from: '2026-09-01', to: '2026-09-30' }, 'a chosen preset is kept');
});
