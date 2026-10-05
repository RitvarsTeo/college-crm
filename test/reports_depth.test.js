// Q35, the owner 05.10.2026: "Next item is confusing in full report tab. we have the same metrics that are in the
// home. Lets not be redundant ok, but smartly make it obvious that full report page is going deeper on the metrics
// that are on home". Then: "path to path to path" (every figure opens its people) and "Nothing should be duplicated".
// Behind ?rep=a|b. A = chapters stacked under a sticky index; B = one tab per Home figure.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
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
  APP.indexOf('// -------------------------------------------------------------------- FEEDBACK'));

function load(search = '') {
  const riga = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Riga', year: 'numeric', month: '2-digit', day: '2-digit' });
  const ctx = {
    CFG, location: { search, hash: '#/reports' }, C_RPT_PRESET: 'year', C_PCOHORT: null, C_PF: { stage: 'x' }, C_PQ: 'q', C_PEDIT: 'p', C_PMSG: 'm', C_PTAB: 'journey',
    C_PF_EMPTY: () => ({ stage: '', programme: '', due: '', owner: '', source: '', data: '' }), viewPeopleC() { ctx.drew = true; },
    esc: (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
    cDay: (iso) => (iso ? riga.format(new Date(iso)) : ''),
    cStage: (id) => ((CFG.stages || []).find((s) => s.id === id) || {}).label || id || '',
    cChannel: (c) => (!c || c === 'unknown' ? ['Not recorded', 'no source was kept'] : [c, '']),
    cSheetNotice: () => '', URLSearchParams,
  };
  vm.runInNewContext([line('const C_MONTHS ='), line('const C_TERMINAL ='), BLOCK,
    'this.X = { cRepMode, cRepModel, cRepHtml, cRepPeriodWord, cGoCohort, setCoh: (c) => { C_REP_COH = c; } };'].join('\n'), ctx);
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

test('no switch: Reports is exactly as before; ?rep=a|b turns it on', () => {
  const body = fnBody('async function viewReportsC() {');
  assert.match(body, /^async function viewReportsC\(\) \{\n  const rep = cRepMode\(\); if \(rep\) return viewReportsDepth\(rep\);/, 'the switch is the first line, and only that');
  const before = body.replace(/\n  const rep = cRepMode\(\); if \(rep\) return viewReportsDepth\(rep\);[^\n]*/, '');
  assert.equal(crypto.createHash('sha256').update(before).digest('hex'), '82f4adf4e5d59d64b8f189165b33e682a40cd6606c930d9e05613fff8d7d1894',
    'the report drawn without the switch is byte for byte the one in release 5c3236a');
  for (const [q, want] of [['', null], ['?rep=a', 'a'], ['?rep=b', 'b'], ['?rep=c', null], ['?gap=1', null]])
    assert.equal(load(q).X.cRepMode(), want, q || 'no query');
});

test('every figure in the model counts the same people the server report counts', async () => {
  const { db, people } = await data();
  const today = localDate();
  for (const period of [{ from: `${year()}-01-01` }, {}, { from: '2000-01-01', to: today }]) {
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
    for (const x of r.programmes) assert.equal((M.admitted.byProgramme.find((y) => y.value === x.programme) || { n: 0 }).n, x.admitted, 'admitted ' + x.programme);
    const trend = r.trend.filter((m) => m.month <= today.slice(0, 7));
    assert.deepEqual(M.leads.byMonth.map((x) => x.n), trend.map((m) => m.newLeads), 'leads by month');
    assert.deepEqual(M.admitted.byMonth.map((x) => x.n), trend.map((m) => m.admitted), 'admitted by month');
    const stage = Object.fromEntries(M.now.grid.map((g) => [g.stage, g.cells.reduce((a, c) => a + c.n, 0)]).filter(([, n]) => n));
    assert.deepEqual(stage, byValue(r.breakdowns.stage), 'stage by programme adds up to every stage');
    // every cohort is exactly its count
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
  || stack.some((e) => /class="[^"]*\b(kt2|rp-n|ktgt-goal|c-head|c-periodbar|rp-index)\b/.test(e.attrs))   // basis, chapter no., config target, period
  || stack.some((e) => ['small', 'summary', 'th'].includes(e.tag))
  || /^[A-Z][a-z]{2} \d{4}$/.test(text.trim());                                                // a month's name in a table

async function pages() {
  const { db, people } = await data();
  const today = localDate();
  const r = await report(db, { from: `${year()}-01-01` });
  const ctx = load();
  const M = ctx.X.cRepModel(r, people, CFG, today);
  const [from, to] = r.period.label.split(' to ');
  return { db, people, r, M, ctx, a: ctx.X.cRepHtml('a', M, from, to), b: ctx.X.cRepHtml('b', M, from, to) };
}

test('every figure on the page has a target, and the count on arrival is the figure', async () => {
  const { M, a, b } = await pages();
  for (const html of [a, b]) {
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

test('each chapter starts with its Home card: the same label and the same figure', async () => {
  const { db, people, M, a, b } = await pages();
  // what Home draws (cHomeData): /api/report for the calendar year, Admitted from the people rows
  const home = (await report(db, { from: `${year()}-01-01`, to: `${year()}-12-31` })).summary;
  const riga = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Riga', year: 'numeric', month: '2-digit', day: '2-digit' });
  const homeAdmitted = people.filter((p) => p.status === 'Admitted' && p.admitted_at && riga.format(new Date(p.admitted_at)).startsWith(year())).length;
  const want = { admitted: ['Admitted', `data-n="${homeAdmitted}"`], leads: ['Leads', `data-n="${home.newLeads}"`],
    conversion: ['Conversion', `data-v="${home.conversionPct}%"`], median: ['Median time to admission', `data-v="${home.medianDaysToAdmission}"`],
    now: ['Where everyone is now', `data-n="${people.length}"`] };
  assert.equal(M.pw, year(), 'This year reads as the year, as on Home');
  for (const [id, [label, fig]] of Object.entries(want)) {
    const sec = a.slice(a.indexOf(`<section class="rp-ch" id="rep-${id}"`));
    assert.match(sec, new RegExp(`^<section class="rp-ch" id="rep-${id}" data-ch="${id}"><div class="kstrip rp-echo"><div><span class="rp-n">\\d</span><span>${label}</span><b><a class="rp-go" href="#/people" ${fig}`), 'A: ' + id);
    const tab = b.slice(b.indexOf(`<div class="rp-tab" role="tab" id="rep-tab-${id}"`));
    assert.match(tab, new RegExp(`^<div class="rp-tab"[^>]*><span>${label}</span><b><a class="rp-go" href="#/people" ${fig}`), 'B: ' + id);
  }
  assert.match(a, new RegExp(`<span>Leads</span><b>[^]*?<small>${year()} · people added</small>`), 'a lead is a person added, not an Inbox row');
  assert.match(a, new RegExp(`<small>${year()} · admission date`), 'Admitted says its basis');
  // A: the index mirrors the cards in Home's order; B: the tabs do
  const order = ['Admitted', 'Leads', 'Conversion', 'Median time to admission', 'Where everyone is now', 'Applications'];
  assert.deepEqual([...a.matchAll(/<div><a href="#\/reports\/\w+" onclick="cRepJump\('\w+'\);return false"><i>\d<\/i><span>([^<]+)<\/span>/g)].map((m) => m[1]), order);
  assert.deepEqual([...b.matchAll(/<div class="rp-tab" role="tab"[^>]*><span>([^<]+)<\/span>/g)].map((m) => m[1]), order);
  assert.match(APP, /html\.ui-c \.kstrip\.rp-index\{position:sticky;top:0/, 'A: the index stays on top');
});

test('no figure twice on the page', async () => {
  const { M, a, b } = await pages();
  for (const html of [a, b]) {
    const seen = {};
    const outside = html.replace(/<details[^]*?<\/details>/g, '');        // "Show as a table" is the same chart, read as rows
    for (const m of outside.matchAll(/data-n="\d+"[^>]*data-coh="(q\d+)"/g)) seen[m[1]] = (seen[m[1]] || 0) + 1;
    const twice = Object.entries(seen).filter(([k, n]) => n > (k === M.leads.all.k ? 2 : 1)).map(([k]) => M.coh[k].label);
    assert.deepEqual(twice, [], 'shown twice');
    // the one allowed repeat: the leads under Conversion's 12 / 63, the working of the share, exactly as on Home's card
    assert.ok((seen[M.leads.all.k] || 0) <= 2);
  }
  // open / overdue / no next step are Today's; why people stopped is Outcomes'
  for (const html of [a, b]) {
    assert.doesNotMatch(html, /c-nowbar|>overdue<|no next step|Why people did not proceed/);
    assert.doesNotMatch(html, /Stage right now/, 'the stage counts are Home and the Journey; Reports draws stage by programme');
  }
});

test('nothing lost: every block of today\'s report has its place in A and in B', async () => {
  const { a, b } = await pages();
  // a chapter: in B its tab (the Home card) and its panel; in A its section
  const tabOf = (html, id) => { const i = html.indexOf(`id="rep-tab-${id}"`); return i < 0 ? '' : html.slice(i, html.indexOf('</div><div class="rp-tab"', i) >>> 0); };
  const chapter = (html, id) => { const i = html.indexOf(`id="rep-${id}"`); const j = html.indexOf('<section class="rp-ch"', i + 10); return tabOf(html, id) + html.slice(i, j < 0 ? undefined : j); };
  // today's figure or block -> [chapter, what it is there]
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
  ];
  for (const html of [a, b]) {
    for (const [what, id, mark] of MAP) assert.ok(chapter(html, id).includes(mark), `${what} -> ${id}`);
    for (const k of ['month', 'last', 'year', 'all']) assert.ok(html.includes(`cReportPreset('${k}')`), 'preset ' + k);
    assert.ok(html.includes('onclick="openExport()">Download for management review'), 'the download');
  }
  assert.match(fnBody('async function viewReportsDepth(mode) {'), /cWebStats\(\);\n  cApplications\(\);/, 'Applications fills as today');
});

test('Home\'s cards land on their chapter; no switch, nothing reads it', () => {
  const ctx = { location: { hash: '#/home' }, cTodayIso: () => '2026-10-05', viewReportsC() {}, C_RPT_PRESET: 'month', RPT: {}, C_REP_CH: null };
  vm.runInNewContext(fnBody('function cGoReportYear(chapter) {'), ctx);
  ctx.cGoReportYear('median');
  assert.equal(ctx.C_REP_CH, 'median');
  assert.equal(ctx.location.hash, '#/reports');
  const depth = fnBody('async function viewReportsDepth(mode) {');
  assert.match(depth, /if \(mode === 'b'\) \{ if \(C_REP_CH\) cRepTab\(C_REP_CH\); \}\n  else if \(C_REP_CH\) \{ const ch = C_REP_CH; C_REP_CH = null; cRepJump\(ch\); \}/);
  assert.match(fnBody('async function routeC(page, arg) {'), /if \(arg\) C_REP_CH = arg;/, '#/reports/<chapter> opens it too');
  assert.ok(!fnBody('async function viewReportsC() {').includes('C_REP_CH'), 'the report without the switch never reads it');
});

test('one card style, the two data colours, light and dark', () => {
  const css = APP.slice(APP.indexOf('/* FULL REPORT, ONE LEVEL DEEPER (Q35'), APP.indexOf('/* Feedback in C: one sheet, open first. */'));
  assert.doesNotMatch(css, /border-top:3px|box-shadow:0 1px 2px/, 'no new card rule: the cards are CARDS 3 (.kstrip > div, .c-sheet)');
  assert.match(css, /\.rp \.kbt i\{background:var\(--v-adm\)\}/, 'counts in the logo blue #29a8df');
  assert.match(css, /\.rp \.rp-rate \.kbt i\{background:var\(--v-tgt\)\}/, 'rates and goals in the data mustard #E0A526');
  assert.match(APP, /html\.ui-c\{--v-tgt:#E0A526;/);
  assert.match(css, /html\.ui-c\[data-theme="dark"\] \.kstrip\.rp-echo/, 'dark: no panel inside a panel');
});
