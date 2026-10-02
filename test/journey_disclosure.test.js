// SCREEN 3, ONE LEVEL AT A TIME (the owner, 01.10.2026: "all together is just tooooo much").
// Each Journey column opens with its most urgent people and one line for the rest. These run
// cJColumn() on known people and tasks and read what it draws.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fn = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const line = (start) => { const i = APP.indexOf(start); assert.ok(i >= 0, start); return APP.slice(i, APP.indexOf('\n', i) + 1); };

const TODAY = '2026-10-02';
const ctx = {
  esc: (s) => String(s ?? ''), Date, Math, Set, Map,
  cTodayIso: () => TODAY,
  cDay: (iso) => (iso ? String(iso).slice(0, 10) : ''),
  // the card is stubbed to its id so the order can be read straight off the output
  cJourneyCard: (p) => `[${p.id}]`,
  // the opened person is drawn as the quick view in place (02.10.2026), stubbed the same way
  cPersonCard: (p) => `[${p.id}]`,
};
vm.createContext(ctx);
vm.runInContext([
  line('const cWhenClass = '), line('const cDaysLate = '),
  line('const C_JCOL_SHOW = '), line('const C_JCOLOPEN = '),
  fn('function cJUrgency('), fn('function cJSort('), fn('function cJColumn('),
].join('\n') + '\nthis.col = cJColumn; this.open = C_JCOLOPEN; this.SHOW = C_JCOL_SHOW;', ctx);

const P = (id) => ({ id });
const people = ['none', 'later', 'today', 'late2', 'late9', 'soon', 'late5', 'x1', 'x2'].map(P);
const taskOf = new Map([
  ['later', { due_at: '2026-10-20T09:00:00Z' }], ['soon', { due_at: '2026-10-05T09:00:00Z' }],
  ['today', { due_at: '2026-10-02T09:00:00Z' }],
  ['late2', { due_at: '2026-09-30T09:00:00Z' }], ['late9', { due_at: '2026-09-23T09:00:00Z' }], ['late5', { due_at: '2026-09-27T09:00:00Z' }],
  ['x1', { due_at: '2026-11-01T09:00:00Z' }], ['x2', { due_at: '2026-11-02T09:00:00Z' }],
]);
const ids = (html) => [...html.matchAll(/\[([\w]+)\]/g)].map((m) => m[1]);

test('the most urgent come first: most days late, then today, then the next date, then no next step', () => {
  ctx.open.clear();
  ctx.open.add('S');
  assert.deepEqual(ids(ctx.col('S', people, taskOf, null)), ['late9', 'late5', 'late2', 'today', 'soon', 'later', 'x1', 'x2', 'none']);
});

test('closed, a column shows its five most urgent and says how many more', () => {
  ctx.open.clear();
  const html = ctx.col('S', people, taskOf, null);
  assert.equal(ctx.SHOW, 5);
  assert.deepEqual(ids(html), ['late9', 'late5', 'late2', 'today', 'soon']);
  assert.match(html, />4 more<\/button>/);
});

test('nobody overdue is ever behind the line while somebody less urgent is shown', () => {
  ctx.open.clear();
  const html = ctx.col('S', people, taskOf, null);
  const shown = new Set(ids(html));
  for (const late of ['late9', 'late5', 'late2']) assert.ok(shown.has(late), late);
});

test('the person whose card is open is always on the board', () => {
  ctx.open.clear();
  const sel = people.find((p) => p.id === 'none');
  assert.ok(ids(ctx.col('S', people, taskOf, sel)).includes('none'));
});

test('opened, every card shows and the line offers to fold it again; a short column has no line', () => {
  ctx.open.clear(); ctx.open.add('S');
  const html = ctx.col('S', people, taskOf, null);
  assert.equal(ids(html).length, 9);
  assert.match(html, />Show fewer<\/button>/);
  ctx.open.clear();
  assert.doesNotMatch(ctx.col('S', people.slice(0, 3), taskOf, null), /<button/);
});

test('the board uses it, and the toggle redraws without dropping the filters', () => {
  assert.match(fn('function cDrawJourney('), /cJColumn\(s\.id, ps, taskOf, sel\)/);
  assert.match(fn('function cJColToggle('), /cDrawJourney\(\)/);
  assert.doesNotMatch(fn('function cJColToggle('), /C_JF\s*=/, 'opening a column never resets a filter');
});

// THE QUICK VIEW OPENS IN PLACE (the owner, 02.10.2026): nobody is shown until clicked; the card
// grows out of the spot that was clicked, the others move aside, the rest darkens a little.
test('the opened person is drawn as the quick view exactly where their card was', () => {
  ctx.open.clear();
  const sel = people.find((p) => p.id === 'late2');
  const html = ctx.col('S', people, taskOf, sel);
  assert.match(html, /<div class="c-jexp" data-id="late2">/, 'the quick view carries the same id, so it grows from that card');
  assert.ok(html.indexOf('data-id="late2"') > html.indexOf('[late5]'), 'in its own place in the urgency order');
  assert.match(html, /onclick="event\.stopPropagation\(\);cJClose\(\)"/, 'with a cross that closes it');
});
test('the board shows nobody until a click, widens the opened column, darkens the rest, and moves cards', () => {
  const draw = fn('function cDrawJourney(');
  assert.match(draw, /const sel = open\.find\(\(p\) => p\.id === C_JSEL\) \|\| null;/);
  assert.match(draw, /<div class="c-jveil" onclick="cJClose\(\)"><\/div>/);
  assert.match(draw, /cJFlipPlay\(\);/);
  assert.match(fn('function cJOpen('), /C_JFLIP = cJFlipMeasure\(\); C_JSEL = id; cDrawJourney\(\);/, 'measured BEFORE the redraw');
  assert.match(fn('function cJFlipPlay('), /prefers-reduced-motion/, 'reduced motion: it just appears');
  assert.match(APP, /onclick="cJOpen\('\$\{esc\(p\.id\)\}'\)"/, 'a board card opens it');
});
test('only the quick view scales; every other card slides, so no words are stretched', () => {
  assert.match(fn('function cJFlipPlay('), /sx = grow \? a\.width \/ b\.width : 1, sy = grow \? a\.height \/ b\.height : 1/);
});
