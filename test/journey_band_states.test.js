// Q66, THE JOURNEY GRAPH MATCHES THE CARDS (Ritvars, 07.10.2026: "THen Journey's graph please make it match the journey
// drag and drop colours"). Each stage bar is a stack of the five card states in the cards' own colours, overdue on the
// baseline, then due today, planned, no next step, with the SIS; the bar's height and the shared baseline stay exact;
// a segment opens that stage filtered to that state; the colours come from ONE place. These RENDER the band.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
const HELP = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'help.json'), 'utf8'));
const fn = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const line = (start) => { const i = APP.indexOf(start); assert.ok(i >= 0, start); return APP.slice(i, APP.indexOf('\n', i)); };
const css = (start) => { const i = APP.indexOf(start); assert.ok(i >= 0, start); return APP.slice(i, APP.indexOf('}', i) + 1); };
const STAGES = (CONFIG.stages || []).filter((s) => !['Admitted', 'Not proceeding'].includes(s.id));
const TODAY = '2026-10-07';

function draw(people, taskOf, stageFilter = []) {
  const ctx = { esc: (s) => String(s ?? ''), Math, Object, C_JF: { stage: stageFilter }, cTodayIso: () => TODAY, cDay: (iso) => (iso ? String(iso).slice(0, 10) : '') };
  vm.runInNewContext([line('const cWhenClass = '), line('const cDaysLate = '), line('const C_SIS_HOLDS = '), line('const cSisHolds = '), line('const C_ST = '),
    line('const cDdMm = '), fn('function cStepState('), fn('function cJourneyBand('), 'this.band = cJourneyBand;'].join('\n'), ctx);
  return ctx.band(people, taskOf, STAGES, (id) => `<exit ${id}>`, { adm: 1, np: 1, admLabel: 'Admitted', npLabel: 'Not proceeding', unrecorded: 0, arrived: 9, year: 2026, play: false });
}
const S = STAGES[3].id;   // Application: all five states in one stage
const PEOPLE = [
  { id: 'o1', status: S }, { id: 'o2', status: S }, { id: 't1', status: S }, { id: 'd1', status: S }, { id: 'd2', status: S }, { id: 'd3', status: S },
  { id: 'n1', status: S }, { id: 's1', status: S, first_channel: 'sis', sis: { status: 'submitted', label: 'Form submitted' } },
  { id: 'c1', status: STAGES[4].id }, { id: 'c2', status: STAGES[4].id },
];
const TASKS = new Map([['o1', { due_at: '2026-09-30T09:00:00Z' }], ['o2', { due_at: '2026-10-05T09:00:00Z' }], ['t1', { due_at: TODAY + 'T09:00:00Z' }],
  ['d1', { due_at: '2026-10-12T09:00:00Z' }], ['d2', { due_at: '2026-10-13T09:00:00Z' }], ['d3', { due_at: '2026-10-14T09:00:00Z' }], ['c1', { due_at: '2026-09-01T09:00:00Z' }]]);
const cellOf = (html, i) => html.split('class="jb-cell"')[i + 1];
const segsOf = (cell) => [...cell.matchAll(/<i class="jb-seg jb-s-(\w+)" style="bottom:([\d.]+)%;height:([\d.]+)%" title="([^"]+)" data-v="([^"]+)" data-st="(\w+)" onclick="event\.stopPropagation\(\);cJfState\(this\.dataset\.v, this\.dataset\.st\)"><\/i>/g)]
  .map((m) => ({ st: m[1], bottom: Number(m[2]), height: Number(m[3]), title: m[4], stage: m[5], dataSt: m[6] }));

test('a stage bar is a stack of the five states in the band order, overdue on the baseline, every segment exact', () => {
  const html = draw(PEOPLE, TASKS);
  const app = cellOf(html, 3);
  const segs = segsOf(app);
  assert.deepEqual(segs.map((s) => s.st), ['over', 'today', 'due', 'none', 'sis'], 'the five, in the column bands\' order');
  assert.deepEqual(segs.map((s) => s.height), [25, 12.5, 37.5, 12.5, 12.5], '2 + 1 + 3 + 1 + 1 of 8');
  assert.deepEqual(segs.map((s) => s.bottom), [0, 25, 37.5, 75, 87.5], 'each one sits on the one below; overdue on the baseline');
  assert.equal(segs.reduce((a, s) => a + s.height, 0), 100, 'the segments fill the bar: no gap, no overlap');
  assert.match(app, /class="jb-bar" style="height:100\.00%"/, 'the bar is the stage total on the one scale (8 of max 8)');
  assert.match(app, /<b class="jb-n">8<\/b>/, 'the total, and nothing beside it');
  assert.doesNotMatch(app, /<em>|jb-over/, 'the red count badge and the old overlay are gone');
  assert.deepEqual(segs.map((s) => s.title), ['Overdue: 2', 'Due today: 1', 'Due: 3', 'No next step: 1', 'With the SIS: 1']);
  assert.match(app, /title="Application: 8 people \(2 overdue, 1 due today, 3 due, 1 no next step, 1 with the sis\)"/);
});

test('a stage with one state is one segment; an empty stage has none; the scale stays the stage total', () => {
  const html = draw(PEOPLE, TASKS);
  const contract = segsOf(cellOf(html, 4));
  assert.deepEqual(contract.map((s) => [s.st, s.bottom, s.height]), [['over', 0, 50], ['none', 50, 50]]);
  assert.match(cellOf(html, 4), /class="jb-bar" style="height:25\.00%"/, '2 of 8');
  assert.equal(segsOf(cellOf(html, 0)).length, 0, 'nobody: no segment, the 2px grey mark only');
  assert.match(cellOf(html, 0), /class="jb-bar" style="height:0\.00%"><b class="jb-n">0<\/b><\/span>/);
});

test('every segment is a path to its people: the stage filtered to that state; the State filter offers the same five', () => {
  const segs = segsOf(cellOf(draw(PEOPLE, TASKS), 3));
  assert.ok(segs.every((s) => s.stage === S && s.dataSt === s.st));
  assert.match(fn('function cJfState('), /C_JF = \{ \.\.\.C_JF_EMPTY\(\), stage: \[stage\], due: \[st\] \}; C_JFOPEN = null; cDrawJourney\(\);/);
  assert.match(APP, /const C_JF_DUE = \[\['over', 'Overdue'\], \['today', 'Due today'\], \['due', 'Planned'\], \['none', 'No next step'\], \['sis', 'With the SIS'\]\];/);
  assert.match(APP, /\$\{box\('due', 'State', C_JF_DUE\)\}/, 'the filter box is named for what it holds');
  assert.match(fn('function cJourneyMatch('), /if \(!kept\('due', cStepState\(p, t\)\[0\]\)\) return false;/, 'the filter reads the same state as the card');
});

test('one place for the five colours: the rails, the state words, the bands and the graph read the same tokens', () => {
  assert.match(APP, /html\.ui-c\{--st-over:var\(--j-alarm\);--st-today:var\(--j-soon\);--st-due:#0a2463;--st-none:#b9c2cc;--st-sis:var\(--c-sis\)\}/);
  assert.match(APP, /--st-due:#8fb4e8;--st-none:#5b7391;   \/\* the five state colours in the dark/, 'the dark values inside the one dark palette');
  assert.equal((APP.match(/--st-over:/g) || []).length, 1, 'declared once');
  for (const k of ['over', 'today', 'due', 'none', 'sis']) {
    assert.match(APP, new RegExp(`html\\.ui-c \\.c-jp\\.c-rail-${k}\\{border-left-color:var\\(--st-${k}\\)\\}`), `the rail ${k}`);
    assert.match(APP, new RegExp(`html\\.ui-c \\.jb-s-${k}\\{background:var\\(--st-${k}\\)\\}`), `the segment ${k}`);
  }
  assert.match(APP, /html\.ui-c \.c-grp-over\{background:color-mix\(in srgb,var\(--st-over\),transparent 86%\);color:var\(--st-over\)/, 'the Overdue band');
  assert.match(APP, /html\.ui-c \.c-st-over \.c-st-w,html\.ui-c \.c-st-late \.c-st-w\{color:var\(--st-over\)\}/, 'the state word');
  assert.doesNotMatch(APP, /\.jb-over\{|\.jb-n em\{/, 'the old overlay and badge CSS are gone');
  const bar = css('  html.ui-c .jb-bar{'), seg = css('  html.ui-c .jb-seg{');
  assert.doesNotMatch(bar + seg, /gradient|shadow|transform|filter|perspective/, 'flat: depth never distorts comparison');
  assert.match(bar, /background:var\(--rule\)/, 'the grey shows only for nobody');
});

test('the Help center says it', () => {
  assert.match(HELP.tour.find((t) => t.title === 'Journey').body, /The graph above the board stacks the same colours per stage; click a colour to open those people\./);
  assert.match(HELP.faq.find((f) => f.id === 'card-states').a, /The Journey's graph stacks the same colours per stage, overdue at the bottom/);
});
