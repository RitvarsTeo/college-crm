// THE JOURNEY BAND (locked by the owner, 02.10.2026: "B for home. Then the journey displayed
// like the ui from A", and "Dots per person ... Cant count them really").
//
// The task the band serves: compare stage against stage, to spot pile-ups and overdue work.
// So: one column per configured stage, one shared baseline, one common scale, the count above,
// overdue as an always-drawn red base. These run cJourneyBand() and the Journey's own filter
// on known people and read what they draw and keep.
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
const css = (start) => { const i = APP.indexOf(start); assert.ok(i >= 0, start); return APP.slice(i, APP.indexOf('}', i) + 1); };

// the REAL configured stages, never a list of our own
const STAGES = (CONFIG.stages || []).filter((s) => !['Admitted', 'Not proceeding'].includes(s.id));

function band(stageFilter = []) {
  const ctx = { esc: (s) => String(s ?? ''), Math, C_JF: { stage: stageFilter },
    cWhenClass: (iso) => (iso === 'over' ? 'over' : iso === 'today' ? 'today' : '') };
  vm.runInNewContext(fn('function cJourneyBand(') + '\nthis.band = cJourneyBand;', ctx);
  return ctx.band;
}
const P = (id, status, due) => ({ id, status, due });
// Application 4 (3 late), Contract 2 (0 late), New 1 (1 late), the rest 0
const OPEN = [P('a1', STAGES[3].id, 'over'), P('a2', STAGES[3].id, 'over'), P('a3', STAGES[3].id, 'over'), P('a4', STAGES[3].id, 'today'),
  P('c1', STAGES[4].id, 'later'), P('c2', STAGES[4].id), P('n1', STAGES[0].id, 'over')];
const TASKS = new Map(OPEN.filter((p) => p.due).map((p) => [p.id, { due_at: p.due }]));
const OUT = { adm: 12, np: 17, admLabel: 'Admitted', npLabel: 'Not proceeding', unrecorded: 0, arrived: 63, year: 2026,
  tags: [['cold', 'Cold', 2], ['reject', 'Reject', 0]], play: true };
const exitMark = (id) => `<span class="c-exit" data-for="${id}"></span>`;
const draw = (f, out = OUT) => band(f)(OPEN, TASKS, STAGES, exitMark, out);
const cols = (html) => html.split('class="jb-cell"').slice(1).map((c) => ({
  n: Number(/class="jb-n">(\d+)/.exec(c)[1]),
  height: Number(/class="jb-bar" style="height:([\d.]+)%"/.exec(c)[1]),
  over: (/<em>(\d+)<\/em>/.exec(c) || [0, 0])[1] * 1,
  overHeight: Number((/class="jb-over" style="height:([\d.]+)%"/.exec(c) || [0, 0])[1]),
  label: /class="c-jn">\d+<\/span>([^<]+)</.exec(c)[1],
}));

test('one column per configured stage, in the configured order, and no other', () => {
  const c = cols(draw());
  assert.deepEqual(c.map((x) => x.label), STAGES.map((s) => s.label || s.id), 'only the real stages, their real names');
  assert.ok(!c.some((x) => /Admitted|Not proceeding|Arrived/.test(x.label)), 'Arrived and the outcomes are bookends, not columns');
});

test('the counts are the people standing in each stage, empty stages included as 0', () => {
  const c = cols(draw());
  assert.deepEqual(c.map((x) => x.n), STAGES.map((s) => OPEN.filter((p) => p.status === s.id).length));
  assert.equal(c[1].n, 0, 'an empty stage keeps its place and reads 0, it is not dropped');
});

test('ONE scale for every stage: heights are count / the biggest stage, never per-stage', () => {
  const c = cols(draw());
  const max = Math.max(...c.map((x) => x.n));
  for (const x of c) assert.ok(Math.abs(x.height - (x.n / max) * 100) < 0.01, `${x.label}: ${x.height}% for ${x.n} of ${max}`);
  assert.equal(c[3].height, 100, 'the biggest stage sets the scale');
  assert.equal(c[4].height, 50, 'half the people, half the column');
});

test('overdue is the red base of the column, on the SAME scale, counted from the late tasks', () => {
  const c = cols(draw());
  assert.equal(c[3].over, 3, 'three late in Application; due today is not overdue');
  assert.equal(c[0].over, 1);
  assert.equal(c[4].over, 0, 'nobody late in Contract, so no red and no number');
  // the segment is a share of its own column, so on the band's scale it is over / max
  assert.ok(Math.abs((c[3].overHeight / 100) * c[3].height - (3 / 4) * 100) < 0.01, 'Application: 3 of the band max 4');
  assert.ok(Math.abs((c[0].overHeight / 100) * c[0].height - (1 / 4) * 100) < 0.01, 'New: 1 of 4, comparable with Application');
});

test('overdue is visible without hovering: the red segment and its number are always drawn', () => {
  const html = draw();
  const app = html.split('class="jb-cell"')[4];
  assert.match(app, /class="jb-over"/, 'the segment is in the markup at rest');
  assert.match(app, /<em>3<\/em>/, 'and its count, beside the total');
  assert.match(app, /title="[^"]*3 overdue"/, 'hover only adds the words');
});

test('clicking a column IS the board stage filter, and clicking again clears it', () => {
  const off = draw();
  assert.match(off, /data-v="Application" onclick="cJfPick\('stage', this\.dataset\.v, !false\)"/);
  const on = draw(['Application']);
  assert.match(on, /class="jb-col on /, 'the chosen stage says so');
  assert.match(on, /aria-pressed="true"[^>]*data-v="Application"/);
  assert.match(on, /data-v="Application" onclick="cJfPick\('stage', this\.dataset\.v, !true\)"/, 'a second click clears it');
});

test('the board keeps exactly the chosen stage, and the other filters still combine with it', () => {
  const ctx = { CFG: CONFIG, C_SIS_HOLDS: [] };
  vm.runInNewContext([line('const cNotSaid = '), line('const cTask ='), fn('function groupForAction('),
    line('const C_SIS_HOLDS ='), line('const cSisHolds ='),
    "const cWhenClass = (iso) => (iso === 'over' ? 'over' : '');",
    fn('function cJourneyMatch('), 'this.match = cJourneyMatch;'].join('\n'), ctx);
  const people = [{ id: 1, status: 'Application', programme: 'ENG' }, { id: 2, status: 'Application', programme: 'NAV' },
    { id: 3, status: 'Contract', programme: 'ENG' }];
  const f = { programme: [], due: [], owner: [], source: [], stage: ['Application'], group: [], step: [] };
  assert.deepEqual(people.filter((p) => ctx.match(p, null, f)).map((p) => p.id), [1, 2], 'the stage the column chose');
  f.programme = ['ENG'];
  assert.deepEqual(people.filter((p) => ctx.match(p, null, f)).map((p) => p.id), [1], 'and an existing filter still narrows it');
});

test('Arrived and the outcomes are the real figures, a failed read is a dash', () => {
  const html = draw();
  assert.match(html, /<span>Arrived<\/span><b>63<\/b><small>2026<\/small>/);
  assert.match(html, /<span>Admitted<\/span><b>12<\/b>/);
  assert.match(html, /<span>Not proceeding<\/span><b>17<\/b>/);
  const failed = draw([], { ...OUT, arrived: null });
  assert.match(failed, /<span>Arrived<\/span><b><span class="kgapn"/, 'no number from earlier');
  assert.match(fn('async function viewJourneyC('), /rep\.summary\.newLeads/, 'Arrived is the same report figure Home reads');
});

// Q43, the owner 05.10.2026: Cold / Reject only in Outcomes; the band keeps the Not proceeding total.
test('the band shows no Cold / Reject chips; Not proceeding opens Outcomes, where the split is', () => {
  const html = draw();
  assert.doesNotMatch(html, /cGoClosedTag|kfl-tags|Cold <b>/, 'no chips on the band');
  assert.match(html, /onclick="C_OUTCOME='Not proceeding';C_OUT_TAG=null"/);
  assert.match(fn('function cGoClosedTag('), /C_OUTCOME = 'Not proceeding'; C_OUT_FILTER = null; C_OUT_TAG = id;/);
});

test('one scene, on arrival only; nothing on the columns scales', () => {
  assert.match(draw(), /class="kflow jband m-scene"/, 'the band plays when the Journey opens');
  assert.doesNotMatch(draw([], { ...OUT, play: false }), /m-scene/, 'a filter click redraws without replaying it');
  assert.doesNotMatch(draw(), /\bm-(pop|bar|grow|bump)\b/, 'columns fade in; a scaled column reads as a different count');
  const load = fn('async function viewJourneyC(');
  assert.match(load, /play: true/); assert.match(load, /C_JDATA\.play = false;/);
});

test('the columns are honest: flat, one colour, no light, no tilt; depth is the frame only', () => {
  const bar = css('  html.ui-c .jb-bar{');
  assert.match(bar, /background:var\(--v-open\)/, 'the quantitative mustard');
  assert.doesNotMatch(bar, /gradient|shadow|transform|filter|perspective/);
  assert.doesNotMatch(css('  html.ui-c .jb-over{'), /gradient|shadow|transform|filter/);
  assert.match(css('  html.ui-c .kflow{'), /background:var\(--k-well\)/, 'the lit well is the frame');
  assert.match(css('  html.ui-c .jb-plot{'), /align-items:flex-end/, 'every column stands on the same floor');
});

test('the layout reflows for a phone instead of scrolling sideways', () => {
  assert.match(APP, /@media \(max-width:900px\)\{\s*html\.ui-c \.jband-row\{grid-template-columns:1fr 1fr\}/);
  assert.match(APP, /@media \(max-width:520px\)\{[^@]*html\.ui-c \.jband-row\{grid-template-columns:1fr\}/);
  assert.match(css('  html.ui-c .jb-cols{'), /repeat\(var\(--n\),minmax\(0,1fr\)\)/, 'columns shrink, they never force width');
});

// Q41, a defect on production 05.10.2026: "the journey has broken line underneath, they are all not aligned to the
// bars." The line was a separate SVG at a fixed 132px; now each plot draws its piece at its own bottom, so the bar's
// bottom IS the line, the pieces meet across the gaps, and the tallest figure keeps headroom inside the band.
test('one baseline, every bar on it, the tallest label inside the band', () => {
  assert.doesNotMatch(APP, /class="jb-base"|\.jb-base\{|top:132px/, 'no separate line laid under the columns');
  assert.match(APP, /html\.ui-c \.jb-plot\{[^}]*align-items:flex-end;[^}]*height:147px;padding-top:36px;box-sizing:border-box;--jb-half-gap:4px\}/,
    'the bars stand on the plot floor, with 36px of headroom for the figure and badge');
  assert.match(APP, /html\.ui-c \.jb-plot::after\{content:"";position:absolute;left:calc\(-1 \* var\(--jb-half-gap\)\);right:calc\(-1 \* var\(--jb-half-gap\)\);bottom:0;height:0;\s*border-top:1\.5px solid #29a8df;/,
    'the line is the plot floor, reaching half the 8px gap each side, so the pieces meet');
  assert.match(APP, /html\.ui-c \.jb-cols\{position:relative;display:grid;grid-template-columns:repeat\(var\(--n\),minmax\(0,1fr\)\);gap:8px\}/, 'the 8px gap it bridges');
  assert.match(APP, /html\.ui-c \.jb-cols\{gap:4px\}\s*html\.ui-c \.jb-plot\{--jb-half-gap:2px\}/, 'and on a phone the 4px gap');
  assert.match(APP, /html\.ui-c\[data-theme="dark"\] \.jb-plot::after\{border-top-color:#8fcbef\}/, 'dark');
  assert.match(APP, /html\.ui-c \.jb-bar\{position:relative;z-index:1;display:block;width:min\(56px,60%\);min-height:2px;/, 'over the line, and 0 is a flat mark on it');
});
