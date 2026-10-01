// Item 12, 30.09.2026: the summary for management above the Journey.
// Two rows of bars: where the waiting is by stage, and what the team is doing next by
// kind of step. Both are counted from the SAME set the columns are drawn from, so a bar
// can never disagree with the board under it, and each bar filters what it counted.
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
function sandbox(filters = {}, { exits = null, all = [], more = false } = {}) {
  const ctx = { CFG: CONFIG, esc: (s) => String(s ?? '') };
  vm.runInNewContext([
    line('const cTask ='), fn('function groupForAction('),
    'let C_JF = { programme: [], due: [], owner: [], source: [], stage: [], group: [] };',
    'Object.assign(C_JF, ' + JSON.stringify(filters) + ');',
    line('const C_SIS_HOLDS ='), line('const cSisHolds ='),
    'let C_JEXITS = ' + JSON.stringify(exits) + ';',
    'let C_JMORE = ' + JSON.stringify(Boolean(more)) + ';',   // the second half: closed unless asked
    'let C_JDATA = { people: ' + JSON.stringify(all) + ' };',
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
  const counts = [...html.matchAll(/<b>(\d+)<\/b>/g)].map((m) => Number(m[1]));
  // first row is the stages, in board order
  assert.deepEqual(counts.slice(0, STAGES.length),
    STAGES.map((st) => people.filter((p) => p.status === st.id).length),
    'every stage bar equals the people standing in that stage');
});

test('the kinds row counts the same people, grouped by what comes next', () => {
  const people = [
    person(STAGES[0].id, label('call_interest')),       // Conversation and information
    person(STAGES[0].id, label('send_programme')),      // Conversation and information
    person(STAGES[1].id, label('invite_visit')),        // Visit on site
    person(STAGES[2].id, null),                         // No next step
  ];
  const html = sandbox().summary(people, build(people), STAGES);
  // anchored on the heading that introduces it, not on "the row after the first one":
  // an exit row now sits between them, and the next thing inserted would break it again
  // bounded at the next heading: the step-by-step row below counts the SAME people a
  // second time, by their individual step, so an unbounded slice double-counts everybody
  const kinds = html.slice(html.indexOf('What comes next'), html.indexOf('Step by step'));
  const pairs = [...kinds.matchAll(/<b>(\d+)<\/b>.*?<span>([^<]+)<\/span>/gs)].map((m) => [m[2], Number(m[1])]);
  assert.deepEqual(pairs.find((x) => x[0] === 'Conversation and information'), ['Conversation and information', 2]);
  assert.deepEqual(pairs.find((x) => x[0] === 'Visit on site'), ['Visit on site', 1]);
  assert.deepEqual(pairs.find((x) => x[0] === 'No next step'), ['No next step', 1],
    'the number worth acting on is a bar of its own');
  assert.equal(pairs.reduce((a, x) => a + x[1], 0), people.length, 'everybody is in exactly one kind');
});

test('a bar with nothing in it is not drawn, but an empty STAGE still is', () => {
  const people = [person(STAGES[0].id, label('call_interest'))];
  const html = sandbox().summary(people, build(people), STAGES);
  assert.ok(html.includes('>' + (STAGES[1].label || STAGES[1].id) + '<'), 'an empty stage keeps its place in the board order');
  assert.ok(!html.includes('>Visit on site<'), 'a kind nobody is doing is not invented');
});

test('each bar is the filter for what it counted, and toggles', () => {
  const html = sandbox().summary([person(STAGES[0].id, null)], new Map(), STAGES);
  assert.match(html, /onclick="cJfPick\('stage', this\.dataset\.v, !false\)"/, 'clicking sets the stage filter');
  const on = sandbox({ stage: [STAGES[0].id] }).summary([person(STAGES[0].id, null)], new Map(), STAGES);
  assert.match(on, /class="c-sum on"/, 'a chosen bar says so');
  assert.match(on, /aria-pressed="true"/);
  assert.match(on, /onclick="cJfPick\('stage', this\.dataset\.v, !true\)"/, 'and clicking again clears it');
});

// Found in the screenshot pass, 30.09.2026. Every bar is drawn width:100% of its box, and the
// boxes were laid out with flex-wrap, so a box was as wide as its LABEL: "Application and
// documents" (1) drew a bar 2.4 times the ink of "Visit on site" (1). Each bar was individually
// correct, which is why only looking at the rendered screen found it.
test('the bar says the number and nothing else: the boxes are all one width', () => {
  const row = line('  html.ui-c .c-sumrow{');
  assert.match(row, /display:grid/, 'a grid, so every track is the same size');
  const tracks = /grid-template-columns:repeat\(auto-fit,minmax\([^)]*\)\)/.exec(row);
  assert.ok(tracks, 'one repeat() of one minmax: every column identical, on every line');
  assert.ok(!/flex-wrap/.test(row), 'not flex-wrap, which stretches whatever lands on the last line');

  // and the box may not grow to fit its label
  const box = APP.slice(APP.indexOf('  html.ui-c .c-sum{'), APP.indexOf('  html.ui-c .c-sum:hover'));
  assert.match(box, /min-width:0/, 'the box takes the track width, not the label width');
  assert.ok(!/min-width:\s*[1-9]/.test(box), 'no floor that a long label could push past');

  // the narrow layout is a grid too, or the last line stretches again below 760px
  const narrow = line('  @media (max-width:760px){ html.ui-c .c-sumrow{');
  assert.match(narrow, /grid-template-columns:repeat\(auto-fit,minmax\([^)]*\)\)/);
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

  const active = html.indexOf('Active journey');
  const outcomes = html.indexOf('Outcomes');
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
  const band = html.slice(html.indexOf('c-outcomes'));
  assert.match(band, /<b>2<\/b><span>Admitted<\/span>/, 'both admitted people');
  assert.match(band, /<b>1<\/b><span>Not proceeding<\/span>/);
  // and the active heading counts only the people still moving
  assert.match(html, /Active journey <small>3 people you are still working with/);
});

// The mark lives INSIDE the stage's cell, not in a parallel row. A second row only lines
// up while the stages fit on one line; the moment it wrapped, every mark was still in its
// grid column but no longer under the stage it belonged to.
test('every active stage carries its own exit mark, inside its own cell', () => {
  const s = sandbox({}, { all: ALL, exits: { byStage: { New: 2, Application: 1 }, total: 3, unrecorded: 0 } });
  const html = s.summary(OPEN3, build(OPEN3), STAGES);
  const track = html.slice(html.indexOf('Active journey'), html.indexOf('What comes next'));

  const cells = track.split('class="c-sumcell"').slice(1);
  assert.equal(cells.length, STAGES.length, 'one cell per stage');
  for (const [i, cell] of cells.entries()) {
    assert.match(cell, /class="c-exit/, STAGES[i].id + ' carries its mark in its own cell');
  }

  const markFor = (id) => cells[STAGES.findIndex((x) => x.id === id)];
  assert.match(markFor('New'), /<i><\/i>2<\/span>/, 'the two who left from New, on New');
  assert.match(markFor('Application'), /<i><\/i>1<\/span>/, 'the one who left from Application');
  assert.match(markFor('Contacted'), /c-exit none"[^>]*>.*<i><\/i>0<\/span>/,
    'a stage nobody left from keeps its mark and reads zero: a missing mark would look like missing data');

  // and the group row below gets no marks: people are not "leaving" a kind of next step
  const kinds = html.slice(html.indexOf('What comes next'));
  assert.ok(!kinds.includes('c-exit'), 'only the journey stages have exits');
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
  assert.match(html, /c-outcomes/);
  assert.equal((html.match(/class="c-exit none"/g) || []).length, STAGES.length,
    'every mark reads zero rather than the screen failing');
});

// ============== progressive disclosure on the Journey (01.10.2026) ==============
// The owner: "all together in screen 3 is just tooooo much". The screen opened with two
// full bar rows, the exit marks, the outcomes band, four filters, the person card and
// five columns, all at level one. What you need BEFORE asking a question is one thing:
// where the people you are working with are standing. The rest waits behind one line.

test('the active journey is open; the second cut and the outcomes wait behind one line', () => {
  const s = sandbox({}, { all: ALL, exits: { byStage: { New: 1 }, total: 1, unrecorded: 0 } });
  const html = s.summary(OPEN3, build(OPEN3), STAGES);

  const details = html.indexOf('<details class="c-more"');
  assert.ok(details > 0, 'there is a disclosure');
  assert.ok(html.indexOf('Active journey') < details, 'the active journey is above it, always open');
  assert.ok(!/<details class="c-more"[^>]* open/.test(html), 'and it starts closed');

  const inside = html.slice(details);
  assert.match(inside, /What comes next/, 'the second cut is inside');
  assert.match(inside, /c-outcomes/, 'and so are the outcomes');
});

test('the line says what is inside it, with the count, so opening it is not a lottery', () => {
  const s = sandbox({}, { all: ALL });
  const html = s.summary(OPEN3, build(OPEN3), STAGES);
  // ALL carries 2 admitted + 1 not proceeding
  assert.match(html, /<summary[^>]*>What comes next, and 3 finished<\/summary>/);
});

test('once opened it stays opened through a redraw', () => {
  const open = sandbox({}, { all: ALL, more: true }).summary(OPEN3, build(OPEN3), STAGES);
  assert.match(open, /<details class="c-more" open>/, 'a redraw does not slam it shut under the reader');
});

test('the stage row fills the width instead of stopping at 160px', () => {
  // the owner: "we have twice as much almost space horizontally". The tracks were capped,
  // so five stages used 800px of a 1400px page. They stay EQUAL, which is what stops two
  // equal counts drawing different amounts of ink.
  assert.match(APP, /html\.ui-c \.c-sumrow\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(104px,1fr\)\)/);
  assert.match(APP, /justify-content:stretch/);
});

// ============ item by item, not only by group (Ieva, open since 29.09.2026) ============
// The group row is the summary: four kinds of work. The step row is the WORK: the actual
// steps people are waiting on. Collapsing nineteen configured steps into four totals is
// the ambiguous aggregate she was pointing at.

const withSteps = [
  { id: 's1', status: 'New', taskLabel: 'call_interest' },
  { id: 's2', status: 'New', taskLabel: 'call_interest' },
  { id: 's3', status: 'Contacted', taskLabel: 'invite_visit' },
  { id: 's4', status: 'New' },
];
const stepTaskOf = () => {
  const m = new Map();
  for (const p of withSteps) if (p.taskLabel) m.set(p.id, { label: label(p.taskLabel) });
  return m;
};

test('each step somebody is waiting on is its own row, with its own count', () => {
  const s = sandbox({}, { all: withSteps });
  const html = s.summary(withSteps, stepTaskOf(), STAGES);
  const steps = html.slice(html.indexOf('Step by step'));
  const pairs = [...steps.matchAll(/<b>(\d+)<\/b>.*?<span>([^<]+)<\/span>/gs)].map((m) => [m[2], Number(m[1])]);

  assert.deepEqual(pairs.find((x) => x[0] === label('call_interest')), [label('call_interest'), 2],
    'two people waiting on the same step are one row of 2, not two rows');
  assert.deepEqual(pairs.find((x) => x[0] === label('invite_visit')), [label('invite_visit'), 1]);
  assert.deepEqual(pairs.find((x) => x[0] === 'No next step'), ['No next step', 1],
    'and having nothing planned is itself a step somebody must act on');
});

test('it lists the real queue, not the catalogue', () => {
  const s = sandbox({}, { all: withSteps });
  const html = s.summary(withSteps, stepTaskOf(), STAGES);
  const steps = html.slice(html.indexOf('Step by step'));
  const rows = (steps.match(/class="c-sum[ "]/g) || []).length;
  assert.equal(rows, 3, 'three steps are being waited on, so three rows - not all 19 configured');
  assert.match(html, /the 3 steps somebody is waiting on right now/);
});

test('the busiest step leads', () => {
  const s = sandbox({}, { all: withSteps });
  const steps = s.summary(withSteps, stepTaskOf(), STAGES).slice(0);
  const order = [...steps.slice(steps.indexOf('Step by step')).matchAll(/<span>([^<]+)<\/span>/g)].map((m) => m[1]);
  assert.equal(order[0], label('call_interest'), 'the step most people are waiting on is first');
});

test('each step row is its own filter, like the group rows above it', () => {
  const s = sandbox({}, { all: withSteps });
  const html = s.summary(withSteps, stepTaskOf(), STAGES);
  const steps = html.slice(html.indexOf('Step by step'));
  assert.match(steps, /cJfPick\('step',/, 'clicking a step filters the board by that step');
});

test('the filter model carries step beside group, and an untouched one holds nothing back', () => {
  assert.match(APP, /let C_JF = \{ programme: \[\], due: \[\], owner: \[\], source: \[\], stage: \[\], group: \[\], step: \[\] \}/);
  assert.match(APP, /const C_JF_EMPTY = \(\) => \(\{[^}]*step: \[\] \}\)/, 'and Clear clears it too');
  const match = APP.slice(APP.indexOf('function cJourneyMatch('), APP.indexOf('function cJourneyFilters('));
  assert.match(match, /kept\('step', t \? cTask\(t\.label\) : cSisHolds\(p\) \? null : 'No next step'\)/,
    'a person held by the SIS is not counted as having no step, same as the group rule');
});
