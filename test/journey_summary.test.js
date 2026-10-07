// Item 12, 30.09.2026: the summary for management above the Journey.
// Where the waiting is by stage, counted from the SAME set the columns are drawn from, so a
// column can never disagree with the board under it, and each column filters what it counted.
// The second cut, "What comes next" (by kind of step and step by step), was removed on
// 06.10.2026 at the owner's pick: it repeated Today and read "No group" on the real data.
//
// Measured on demo data at the time of writing: columns New 7, Contacted 1, Follow-up 0,
// Application 1, Contract 2 - and the stage bars read exactly the same.
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
const line = (start) => { const i = APP.indexOf(start); assert.ok(i >= 0, start); return APP.slice(i, APP.indexOf('\n', i)); };

const STAGES = (CONFIG.stages || []).filter((s) => !['Admitted', 'Not proceeding'].includes(s.id));
const label = (id) => (CONFIG.nextActions || []).flatMap((g) => g.items).find((i) => i.id === id).label;

// The summary also draws the exit marks and the outcomes band (01.10.2026), so it reads
// C_JEXITS (what the server counted per stage) and C_JDATA (the whole database, because
// admitted and not-proceeding people are NOT in the open set the bars are built from).
// Both default to nothing here: a summary with no exit data must still draw.
function sandbox(filters = {}, { exits = null, all = [] } = {}) {
  const ctx = { CFG: CONFIG, esc: (s) => String(s ?? ''), cTodayIso: () => '2026-10-07', cDay: (iso) => String(iso).slice(0, 10) };
  vm.runInNewContext([
    line('const cTask ='), fn('function groupForAction('),
    'let C_JF = { programme: [], due: [], owner: [], source: [], stage: [], group: [] };',
    'Object.assign(C_JF, ' + JSON.stringify(filters) + ');',
    line('const C_SIS_HOLDS ='), line('const cSisHolds ='),
    'let C_JEXITS = ' + JSON.stringify(exits) + ';',
    'let C_JDATA = { people: ' + JSON.stringify(all) + ' };',
    // the band (02.10.2026): a task due 'over' is overdue here, anything else is not
    "const cWhenClass = (iso) => (iso === 'over' ? 'over' : '');",
    line('const cDaysLate ='), line('const C_ST ='), line('const cDdMm ='), fn('function cStepState('),   // Q66: the stack
    fn('function cJourneyBand('),
    fn('function cJourneySummary('),
    'this.summary = cJourneySummary;',
  ].join('\n'), ctx);
  return ctx;
}

const person = (status, taskLabel) => ({ id: status + (taskLabel || 'none'), status, taskLabel });
const build = (people) => {
  const taskOf = new Map();
  for (const p of people) if (p.taskLabel) taskOf.set(p.id, { label: p.taskLabel });
  return taskOf;
};

test('a stage bar counts exactly what its column holds', () => {
  const people = [
    person(STAGES[0].id, label('call_interest')),
    person(STAGES[0].id, label('send_programme')),
    person(STAGES[1].id, label('invite_visit')),
    person(STAGES[2].id, null),
  ];
  const html = sandbox().summary(people, build(people), STAGES);
  // the band's columns, in board order (02.10.2026: columns on one baseline, not bars)
  const counts = [...html.matchAll(/class="jb-n">(\d+)/g)].map((m) => Number(m[1]));
  assert.deepEqual(counts.slice(0, STAGES.length),
    STAGES.map((st) => people.filter((p) => p.status === st.id).length),
    'every stage bar equals the people standing in that stage');
});

test('an empty STAGE is still drawn, in its place', () => {
  const people = [person(STAGES[0].id, label('call_interest'))];
  const html = sandbox().summary(people, build(people), STAGES);
  assert.ok(html.includes('>' + (STAGES[1].label || STAGES[1].id) + '<'), 'an empty stage keeps its place in the board order');
});

test('"What comes next" is gone: no step-kind rows, no step rows, no disclosure line (the owner, 06.10.2026)', () => {
  const people = [person(STAGES[0].id, label('call_interest')), person(STAGES[1].id, 'Get in touch'), person(STAGES[2].id, null)];
  const html = sandbox().summary(people, build(people), STAGES);
  assert.doesNotMatch(html, /What comes next|Step by step|No group|<details|c-sumrow|class="c-sum[ "]/);
  assert.doesNotMatch(APP, /C_JMORE|cJMore|\.c-sumrow\{|\.c-sum\{/, 'its state and styles went with it');
  assert.match(html, /class="jb-cols"/, 'the band stays');
});

test('each bar is the filter for what it counted, and toggles', () => {
  const html = sandbox().summary([person(STAGES[0].id, null)], new Map(), STAGES);
  assert.match(html, /onclick="cJBarTap\(this\.dataset\.v, false\)"/, 'clicking sets the stage filter (through cJBarTap, which opens the stage on a phone, Q68)');
  const on = sandbox({ stage: [STAGES[0].id] }).summary([person(STAGES[0].id, null)], new Map(), STAGES);
  assert.match(on, /class="jb-col on /, 'a chosen column says so');
  assert.match(on, /aria-pressed="true"/);
  assert.match(on, /onclick="cJBarTap\(this\.dataset\.v, true\)"/, 'and clicking again clears it');
});

// ============ the active journey, and the outcomes under it (01.10.2026) ============
// The owner: "Not proceeding is an exit from the active journey and can happen from any
// active stage. It is not simply the stage after Contract. Admitted is the successful
// terminal outcome and should not visually read as another active lead stage."

const OPEN3 = [person('New'), person('Contacted'), person('New')];
const ALL = [...OPEN3, { id: 'a1', status: 'Admitted' }, { id: 'a2', status: 'Admitted' },
  { id: 'n1', status: 'Not proceeding' }];

test('the five active stages sit above a rule, the two outcomes below it', () => {
  const s = sandbox({}, { all: ALL, exits: { byStage: { New: 1 }, total: 1, unrecorded: 0 } });
  const html = s.summary(OPEN3, build(OPEN3), STAGES);

  // 02.10.2026: the outcomes are the band's right-hand bookends, figures and NOT columns
  const active = html.indexOf('class="jb-cols"');
  const outcomes = html.indexOf('class="jb-outs"');
  assert.ok(active >= 0 && outcomes > active, 'active journey first, outcomes after it');

  // neither outcome is a stage button in the track
  const track = html.slice(active, outcomes);
  for (const word of ['Admitted', 'Not proceeding']) {
    assert.ok(!track.includes(word), word + ' is not drawn among the active stages');
  }
  assert.match(html.slice(outcomes), /Admitted/);
  assert.match(html.slice(outcomes), /Not proceeding/);
});

test('the outcomes count the whole database, not the open set the bars are built from', () => {
  const s = sandbox({}, { all: ALL });
  const html = s.summary(OPEN3, build(OPEN3), STAGES);
  const band = html.slice(html.indexOf('jb-outs'));
  assert.match(band, /<span>Admitted<\/span><b>2<\/b>/, 'both admitted people');
  assert.match(band, /<span>Not proceeding<\/span><b>1<\/b>/);
  // and the active heading counts only the people still moving
  assert.match(html, /Active journey <small><a class="c-jcount"[^>]*>3 people you are still working with/, 'and is a click to those people (Q36)');
});

// The mark lives INSIDE the stage's cell, not in a parallel row. A second row only lines
// up while the stages fit on one line; the moment it wrapped, every mark was still in its
// grid column but no longer under the stage it belonged to.
test('every active stage carries its own exit mark, inside its own cell', () => {
  const s = sandbox({}, { all: ALL, exits: { byStage: { New: 2, Application: 1 }, total: 3, unrecorded: 0 } });
  const html = s.summary(OPEN3, build(OPEN3), STAGES);
  const track = html.slice(html.indexOf('Active journey'), html.indexOf('class="jb-outs"'));

  const cells = track.split('class="jb-cell"').slice(1);
  assert.equal(cells.length, STAGES.length, 'one cell per stage');
  for (const [i, cell] of cells.entries()) {
    assert.match(cell, /class="c-exit/, STAGES[i].id + ' carries its mark in its own cell');
  }

  const markFor = (id) => cells[STAGES.findIndex((x) => x.id === id)];
  assert.match(markFor('New'), /<i><\/i>2<\/span>/, 'the two who left from New, on New');
  assert.match(markFor('Application'), /<i><\/i>1<\/span>/, 'the one who left from Application');
  assert.match(markFor('Contacted'), /c-exit none"[^>]*>.*<i><\/i>0<\/span>/,
    'a stage nobody left from keeps its mark and reads zero: a missing mark would look like missing data');

});

test('exits with no recorded stage are said out loud, never folded into a stage', () => {
  const s = sandbox({}, { all: ALL, exits: { byStage: {}, total: 1, unrecorded: 1 } });
  const html = s.summary(OPEN3, build(OPEN3), STAGES);
  assert.match(html, /0 with a recorded stage, 1 without/,
    'a figure on screen has to be one somebody can check');
});

test('the summary still draws when the exits endpoint gave nothing', () => {
  const s = sandbox({}, { all: ALL, exits: null });
  const html = s.summary(OPEN3, build(OPEN3), STAGES);
  assert.match(html, /Active journey/);
  assert.match(html, /jb-outs/);
  assert.equal((html.match(/class="c-exit none"/g) || []).length, STAGES.length,
    'every mark reads zero rather than the screen failing');
});

test('the filter model carries step beside group, and an untouched one holds nothing back', () => {
  assert.match(APP, /let C_JF = \{ programme: \[\], due: \[\], owner: \[\], source: \[\], stage: \[\], group: \[\], step: \[\] \}/);
  assert.match(APP, /const C_JF_EMPTY = \(\) => \(\{[^}]*step: \[\] \}\)/, 'and Clear clears it too');
  const match = APP.slice(APP.indexOf('function cJourneyMatch('), APP.indexOf('function cJourneyFilters('));
  assert.match(match, /kept\('step', t \? cTask\(t\.label\) : cSisHolds\(p\) \? null : 'No next step'\)/,
    'a person held by the SIS is not counted as having no step, same as the group rule');
});
