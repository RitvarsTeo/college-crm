// Q57, the owner 06.10.2026: "I didnt ask you to turn journey's drag and drop into a list! what i explicitly remember
// is saying you that journey tab is the mosst advanced of them all listss!"
//
// The drag-and-drop BOARD is the Journey: it opens first, on every way in (the menu, Home's stage clicks, the donut,
// Reports figures, the old #/people and #/outcomes addresses, the Help flow), with the column the way in targets
// filtered on the board exactly as a band click does. List is the second option of the switch and is never
// remembered. Admitted and Not proceeding are the band's bookends; targeted, their column stands at the board's end.
// Dragging a card still posts the status move, a back move still asks its note first.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
const fn = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const line = (start) => { const i = APP.indexOf(start); assert.ok(i >= 0, start); return APP.slice(i, APP.indexOf('\n', i) + 1); };
const plain = (x) => JSON.parse(JSON.stringify(x));

// The ways in, wired to a router that does what routeC does for the Journey's addresses.
function app() {
  const drawn = [];
  const ctx = {
    CFG: CONFIG, C_TERMINAL: ['Admitted', 'Not proceeding'],
    C_PCOHORT: null, C_PQ: '', C_PEDIT: null, C_PMSG: '', C_PTAB: 'all', C_PSCROLL: false, C_JSEL: null, C_PDATA: null, C_JDATA: null,
    C_OUTCOME: 'Admitted', C_OUT_TAG: null, C_OUT_REASON: null, C_OUT_FILTER: null, C_TP: { col: null },
    C_STAGE_OF: new Map([['a', 'Contract'], ['b', 'Contract'], ['c', 'Admitted'], ['d', 'New']]),
    C_REP_COH: { q1: { label: 'Leads · 2026 · Contract', ids: ['a', 'b'] }, q2: { label: 'Leads · 2026', ids: ['a', 'c', 'd'] } },
    viewJourneyC: () => drawn.push('board'), viewJourneyPool: () => drawn.push('list'), cDrawJourneyPool: () => drawn.push('list'),
    viewTodayC: () => drawn.push('today'), cDrawJourney: () => drawn.push('board'),
  };
  let hash = '#/home';
  ctx.location = {
    get hash() { return hash; },
    set hash(h) {
      hash = h;
      const page = h.slice(2).split('/')[0];
      if (page !== 'journey' && page !== 'people' && page !== 'outcomes') return;
      if (page === 'journey') ctx.C_PCOHORT = null;   // as routeC: a Reports cohort lives on #/people only
      ctx.cPoolRouteJourney(page);
    },
  };
  const src = [line('const C_JF_EMPTY = '), line('const C_PF_EMPTY = '), 'var C_JF = C_JF_EMPTY(); var C_PF = C_PF_EMPTY(); var C_STATE_FROM_HASH = false;',
    line('let C_JP = ').replace('let ', 'var '),
    fn('function cGoStage('), fn('function cGoClosedTag('), fn('function cChartGo('), fn('function cGoPeople('), fn('function cHelpGo('),
    fn('async function viewOutcomesC('), fn('function cPoolRouteJourney('), fn('function cJColToBoard('), line('function cJBoardToCol('),
    APP.slice(APP.indexOf('function cEditFromJourney('), APP.indexOf('\n', APP.indexOf("if (location.hash.split('?')[0] === '#/journey') cPoolRouteJourney('journey'); else location.hash = '#/journey'; }", APP.indexOf('function cEditFromJourney('))) + 1),
    fn('function cGoCohort('),
  ].join('\n');
  vm.runInNewContext(src + '\nthis.X = { cGoStage, cGoClosedTag, cChartGo, cGoPeople, cHelpGo, viewOutcomesC, cPoolRouteJourney, cEditFromJourney, cGoCohort, get JP() { return C_JP; }, get JF() { return C_JF; }, get PF() { return C_PF; }, set JP(v) { C_JP = v; } };', ctx);
  return { ctx, X: ctx.X, drawn, go: (h) => { ctx.location.hash = h; } };
}

test('the Board is the default view, before anything is clicked', () => {
  assert.match(APP, /let C_JP = \{ col: null, view: 'board' \};/);
  const sw = fn('function cPoolViewSwitch(');
  assert.ok(sw.indexOf('>Board</button>') < sw.indexOf('>List</button>'), 'Board is the first option of the switch, List the second');
  assert.doesNotMatch(APP, /localStorage\.setItem\([^)]*(jview|journeyView|C_JP)/i, 'the view is never remembered');
});

test('every way in opens the Board, never the List', () => {
  const ways = [
    ['the menu (#/journey)', (A) => A.go('#/journey')],
    ['the old #/people', (A) => A.go('#/people')],
    ['the old #/people/all', (A) => A.go('#/people/all')],
    ['the old #/outcomes', (A) => A.go('#/outcomes')],
    ['a Home stage click', (A) => A.X.cGoStage('Application')],
    ['the donut Open', (A) => A.X.cChartGo('journey')],
    ['the donut centre', (A) => A.X.cChartGo('people')],
    ['the donut Not proceeding', (A) => A.X.cChartGo('outcome|Not proceeding')],
    ['a Home month bar', (A) => A.X.cChartGo('month|2026-09|September 2026')],
    ['Home Arrived', (A) => A.X.cGoPeople({ arrived: '2026' })],
    ['a Reports figure', (A) => A.X.cGoCohort('q1')],
    ['Cold / Reject', (A) => A.X.cGoClosedTag('cold')],
    ['the Help flow end chip', (A) => A.X.cHelpGo('Admitted')],
    ['the Help flow stage chip', (A) => A.X.cHelpGo('Contract')],
    ['Edit from the person page', (A) => A.X.cEditFromJourney('p1')],
  ];
  for (const [name, way] of ways) {
    const A = app();
    A.X.JP = { col: null, view: 'list' };   // even after somebody chose the List last time
    way(A);
    assert.equal(A.X.JP.view, 'board', name + ': the Board');
    assert.ok(A.drawn.includes('board'), name + ': the Board is drawn');
    assert.ok(!A.drawn.includes('list'), name + ': the List is not');
  }
});

test('the targeted column is the board filter, as a band click sets it', () => {
  const stageOf = (way) => { const A = app(); way(A); return [plain(A.X.JF.stage), A]; };
  assert.deepEqual(stageOf((A) => A.X.cGoStage('Application'))[0], ['Application'], 'Home stage');
  assert.deepEqual(stageOf((A) => A.X.cHelpGo('Contract'))[0], ['Contract'], 'Help flow stage');
  assert.deepEqual(stageOf((A) => A.X.cHelpGo('Admitted'))[0], ['Admitted'], 'Help flow end');
  assert.deepEqual(stageOf((A) => A.X.cChartGo('outcome|Not proceeding'))[0], ['Not proceeding'], 'donut slice');
  const [month, M] = stageOf((A) => A.X.cChartGo('month|2026-09|September 2026'));
  assert.deepEqual(month, ['Admitted'], 'a month bar: Admitted'); assert.equal(M.ctx.C_OUT_FILTER.key, '2026-09', 'in that month');
  const [cold, C] = stageOf((A) => A.X.cGoClosedTag('cold'));
  assert.deepEqual(cold, ['Not proceeding']); assert.equal(C.ctx.C_OUT_TAG, 'cold', 'with that tag');
  const [one, R] = stageOf((A) => A.X.cGoCohort('q1'));
  assert.deepEqual(one, ['Contract'], 'a cohort in one stage: that column'); assert.deepEqual([...R.ctx.C_PCOHORT.ids], ['a', 'b']);
  const [mixed] = stageOf((A) => A.X.cGoCohort('q2'));
  assert.deepEqual(mixed, [], 'a cohort across stages: the whole board, narrowed to the cohort');
  // a stage click from Home forgets what an earlier visit narrowed
  const A = app(); A.ctx.C_PCOHORT = { ids: new Set(['x']) }; A.X.cGoStage('New');
  assert.equal(A.ctx.C_PCOHORT, null); assert.deepEqual(plain(A.X.JF.stage), ['New']);
});

// The board itself, drawn with the real code and the real filters, a stub DOM under it.
function board(people, setup = {}) {
  let html = '';
  const handlers = {};
  const posts = [];
  const asked = [];
  const nodes = () => [...html.matchAll(/class="c-drop" data-stage="([^"]+)"/g)].map((m) => ({
    dataset: { stage: m[1] }, classList: { add() {}, remove() {} },
    addEventListener: (type, f) => { handlers[m[1] + ':' + type] = f; } }));
  const ctx = {
    CFG: CONFIG, C_TERMINAL: ['Admitted', 'Not proceeding'], C_JSEL: null, C_PEDIT: null, window: { matchMedia: () => ({ matches: false }) },
    C_PCOHORT: null, C_PF: { stage: '', arrived: '' }, C_OUT_TAG: null, C_OUT_REASON: null, C_OUT_FILTER: null,
    C_JDATA: { people, taskOf: new Map(), play: false }, cSisHolds: () => false, C_JTALK: new Map(), C_JTALK_BUSY: new Set(),
    esc: (s) => String(s ?? ''), cDay: (d) => String(d || '').slice(0, 10), fmtDate: (d) => String(d || '').slice(0, 10), cWhenClass: () => '',
    cJourneySummary: () => '<summary>', cJourneyFilters: () => '<filters>', cPoolViewSwitch: () => '<switch>', cScenes() {}, cJFlipPlay() {},
    cJourneyCard: (p) => `<div class="c-jp" draggable="true" data-id="${p.id}">[${p.id}]</div>`, cPersonCard: (p) => `[open ${p.id}]`,
    cJourneyTalk: async () => {}, cTagChip: (t) => `<tag ${t}>`, cColdWhy: (p) => p.closed_reason || 'reason not recorded',
    cTagLabel: (p) => p.closed_tag,
    $: () => ({ set innerHTML(v) { html = v; } }),
    document: { querySelectorAll: (sel) => (sel === '.c-drop' ? nodes() : []), querySelector: () => null, addEventListener() {} },
    cAskMoveNote: async (id, from, to) => { asked.push([id, from, to]); return { note: to === 'New' ? 'back to the start' : '' }; },
    post: async (url, body) => { posts.push([url, body]); }, viewJourneyC: async () => {}, cNavCounts() {}, alert: (m) => { throw new Error(m); },
    ...setup,
  };
  const filtersSrc = APP.slice(APP.indexOf('let C_JF = {'), APP.indexOf('// FOR MANAGEMENT (30.09.2026)'));
  vm.runInNewContext([line('const C_JCOL_SHOW = '), line('const C_JCOLOPEN = '), fn('function cJUrgency('), fn('function cJSort('),
    fn('function cJColumn('), fn('function cJEndCard('), filtersSrc.replace('let C_JF = {', 'var C_JF = {'),
    fn('function cJTargetKeep('), line('const cJTargeted = '), line('const cMoveBody = '), fn('function cJTargetChips('), fn('function cDrawJourney('),
    'this.draw = cDrawJourney; this.setJF = (v) => { C_JF = v; };'].join('\n'), ctx);
  return { ctx, draw: () => { ctx.draw(); return html; }, handlers, posts, asked };
}
const JF = (stage) => ({ programme: [], due: [], owner: [], source: [], stage, group: [], step: [] });
const P = (id, status, extra = {}) => ({ id, name: 'P ' + id, status, created_at: '2026-03-01T10:00:00Z', ...extra });
const PEOPLE = [P('n1', 'New'), P('c1', 'Contacted'), P('k1', 'Contract'), P('a1', 'Admitted', { admitted_at: '2026-09-10' }),
  P('a2', 'Admitted', { admitted_at: '2026-08-01' }), P('x1', 'Not proceeding', { closed_tag: 'cold', closed_reason: 'No response' }),
  P('x2', 'Not proceeding', { closed_tag: 'reject', closed_reason: 'Chose another school', created_at: '2025-05-01T10:00:00Z' })];

test('the board as it was: five stage columns, drop targets, no end columns until one is asked for', () => {
  const B = board(PEOPLE);
  const html = B.draw();
  const drops = [...html.matchAll(/class="c-drop" data-stage="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(drops, CONFIG.stages.filter((s) => !['Admitted', 'Not proceeding'].includes(s.id)).map((s) => s.id));
  assert.doesNotMatch(html, /c-col-end/);
  assert.match(html, /\[n1\]/); assert.doesNotMatch(html, /\[a1\]|\[x1\]/, 'finished people wait behind their bookend');
});

test('a bookend or a way in that targets an end shows its column at the end, filtered like a stage', () => {
  const B = board(PEOPLE);
  B.ctx.setJF(JF(['Admitted']));
  const html = B.draw();
  assert.match(html, /<div class="c-col c-col-end good"[^>]*><h3>Admitted<\/h3><div class="c-endcol" data-stage="Admitted">/);
  assert.match(html, /Admitted 2026-09-10/, 'the card says when'); assert.doesNotMatch(html, /\[n1\]/, 'the stages are filtered away');
  assert.doesNotMatch(html, /c-drop" data-stage="Admitted"/, 'an end column is not a drop target (a close needs its reason)');
  // a month bar: Admitted in that month only, with the chip that lets it go
  B.ctx.C_OUT_FILTER = { kind: 'month', key: '2026-09', label: 'Admitted in September 2026' };
  const month = B.draw();
  assert.match(month, /P a1/); assert.doesNotMatch(month, /P a2/);
  assert.match(month, /Admitted in September 2026 <button class="btn sm ghost" onclick="C_OUT_FILTER=null;cDrawJourney\(\)">Show everyone ✕/);
  // Cold on Not proceeding
  B.ctx.C_OUT_FILTER = null; B.ctx.C_OUT_TAG = 'cold'; B.ctx.setJF(JF(['Not proceeding']));
  const np = B.draw();
  assert.match(np, /c-col c-col-end"[^>]*><h3>Not proceeding<\/h3>/); assert.match(np, /P x1/); assert.doesNotMatch(np, /P x2/);
  assert.match(np, /<tag cold>No response/, 'the tag and the reason on the card');
});

test('a Reports cohort or Arrived narrows the board to exactly those people, end columns included', () => {
  const B = board(PEOPLE, { C_PCOHORT: { label: 'Leads · 2026', ids: new Set(['n1', 'a1']) } });
  const html = B.draw();
  assert.match(html, /\[n1\]/); assert.doesNotMatch(html, /\[c1\]|\[k1\]/);
  assert.match(html, /<h3>Admitted<\/h3>/); assert.match(html, /P a1/); assert.doesNotMatch(html, /Not proceeding<\/h3>/, 'no column for nobody');
  assert.match(html, /Leads · 2026 <button[^>]*onclick="C_PCOHORT=null;cDrawJourney\(\)"/);
  const A = board(PEOPLE, { C_PF: { stage: '', arrived: '2025' } }).draw();
  assert.match(A, /P x2/); assert.doesNotMatch(A, /\[n1\]|P x1/, 'arrived in 2025: only x2');
});

test('drag and drop posts the status move; a back move asks its note first and sends it', async () => {
  const B = board(PEOPLE);
  B.draw();
  const drop = (stage, id) => B.handlers[stage + ':drop']({ preventDefault() {}, dataTransfer: { getData: () => id } });
  await drop('Contract', 'c1');
  assert.deepEqual(plain(B.asked[0]), ['c1', 'Contacted', 'Contract']);
  assert.deepEqual(plain(B.posts[0]), ['/api/people/c1/status', { status: 'Contract' }], 'forward: the move');
  await drop('New', 'k1');
  assert.deepEqual(plain(B.posts[1]), ['/api/people/k1/status', { status: 'New', note: 'back to the start' }], 'back: the move with its note');
  B.ctx.cAskMoveNote = async () => null;
  await drop('New', 'c1');
  assert.equal(B.posts.length, 2, 'a cancelled back move saves nothing');
  await drop('Contacted', 'c1');
  assert.equal(B.posts.length, 2, 'dropped where it already is: nothing');
});

test('the Help flow step 2 is "New lead" (his pick, 06.10)', () => {
  const help = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'help.json'), 'utf8'));
  assert.equal(help.flow[1].name, 'New lead');
});
