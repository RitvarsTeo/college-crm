// THE TODAY BOARD (the owner's pick B from the A/B pictures, 06.10.2026, via MASTER CONTROL): Overdue and Due today as
// columns of cards in the Journey board's card style, Coming up FOLDED to its count (a click unfolds), No next step the
// list below with "Choose next step". Drag to reschedule: onto Due today = due today; onto Coming up = a small date
// picker on the card. Nothing is dragged into Overdue; no stage moves here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fnBody = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const line = (start) => { const i = APP.indexOf(start); assert.ok(i >= 0, start); return APP.slice(i, APP.indexOf('\n', i)); };

const TODAY = '2026-10-06';
const task = (id, pid, name, due, label = 'Call back') => ({ id, person_id: pid, name, due_at: due, label, programme: 'NAV', status: 'Application' });
function board(tp = {}, data = null) {
  const posted = [];
  const ctx = {
    C_TP: { col: null, programme: '', stage: '', source: '', upOpen: false, more: {}, pick: null, ...tp },
    C_JICON: { over: '<i-over>', today: '<i-today>' }, cTodayIso: () => TODAY,
    cWhenClass: (iso) => (iso.slice(0, 10) < TODAY ? 'over' : iso.slice(0, 10) === TODAY ? 'today' : ''),
    cDaysLate: (iso) => Math.round((Date.parse(TODAY) - Date.parse(iso.slice(0, 10))) / 86400000),
    esc: (s) => String(s ?? ''), fmtDate: (s) => String(s).slice(0, 10), cStage: (s) => s, cTask: (s) => s, cStepIcon: () => '',
    cDay: (iso) => String(iso).slice(0, 10), cSisHolds: () => false,
    post: async (url, body) => { posted.push([url, body]); return {}; }, viewTodayC: async () => {}, cNavCounts: () => {}, cTodayPool: () => {},
    alert: () => {}, posted, C_TPD: data,
  };
  vm.runInNewContext([line('const cPhone = '), APP.match(/const C_TCOL_SHOW = \d+;/)[0], line('const C_ST = '), fnBody('function cStateLine('), line('const cDdMm = '), fnBody('function cStepState('),   // Q66, Q68
    fnBody('function cTodayBoard(D, groups) {'),
    fnBody('function cTodayDrop(pid, from, to) {'), fnBody('async function cTodayMoveTo(pid, from, day) {')].join('\n'), ctx);
  return ctx;
}
const D = (over, today, later) => ({
  over, today, later, byId: new Map(), done: (t) => `<button data-done="${t.id}">Done</button>`,
});
const groupsOf = (d) => {
  const byPerson = (ts) => [...ts.reduce((m, t) => m.set(t.person_id, [...(m.get(t.person_id) || []), t]), new Map()).values()];
  return [{ id: 'over', label: 'Overdue', rows: byPerson(d.over), tone: 'over' }, { id: 'today', label: 'Due today', rows: byPerson(d.today), tone: 'today' },
    { id: 'later', label: 'Coming up', rows: byPerson(d.later), tone: 'later' }, { id: 'none', label: 'No next step', rows: [], tone: 'none' }];
};
const DATA = D(
  Array.from({ length: 9 }, (_, i) => task(i + 1, 'p' + (i + 1), 'Late ' + (i + 1), '2026-09-2' + i + 'T09:00:00Z')),
  [task(20, 'q1', 'Due One', TODAY + 'T09:00:00Z'), task(21, 'q2', 'Due Two', TODAY + 'T09:00:00Z')],
  [task(30, 'r1', 'Soon', '2026-10-09T09:00:00Z'), task(31, 'r1', 'Soon', '2026-10-10T09:00:00Z', 'Send the invoice')]);

test('the board: Overdue and Due today as columns, Coming up folded to its count, no list column', () => {
  const html = board().cTodayBoard(DATA, groupsOf(DATA));
  assert.match(html, /<div class="c-cols t-board" style="grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\) 92px">/);
  assert.match(html, /<span class="c-jn">1<\/span>Overdue<b class="c-count over">9<\/b>/);
  assert.match(html, /<span class="c-jn">2<\/span>Due today<b class="c-count today">2<\/b>/);
  assert.match(html, /class="c-col t-col t-fold c-drop t-drop" data-col="later"[^>]*aria-label="Coming up: 1, open"[\s\S]*?<span class="t-foldl">Coming up<\/span><b>1<\/b>/, 'one person, two steps: a count of people');
  assert.doesNotMatch(html, /data-col="none"/, 'No next step stays the list below');
});

test('cards: the Journey card style, one per person, the step and its date, Done; the first seven, then "N more"', () => {
  const html = board().cTodayBoard(DATA, groupsOf(DATA));
  const over = html.slice(html.indexOf('data-col="over"'), html.indexOf('data-col="today"'));
  assert.equal((over.match(/class="c-jp row t-card c-rail c-rail-over is-over"/g) || []).length, 7, 'seven shown, on the red rail (Q66)');
  assert.match(over, /<button type="button" class="c-jmore"[^>]*>2 more<\/button>/);
  assert.match(over, /draggable="true" data-pid="p1" data-col="over"/);
  assert.match(over, /<div class="t-foot"><div class="c-st c-st-over"><span class="c-st-w">Overdue<\/span><span class="c-st-d">· 16 d<\/span><\/div><button data-done="1">Done<\/button>/, 'the same state line as the Journey card');
  const open = board({ more: { over: true } }).cTodayBoard(DATA, groupsOf(DATA));
  assert.equal((open.match(/class="c-jp row t-card c-rail c-rail-over is-over"/g) || []).length, 9, '"2 more" shows them all');
  assert.match(open, />Show fewer<\/button>/);
});

test('unfolded, Coming up is a column of its own with a Fold; a band card narrows to its column', () => {
  const html = board({ upOpen: true }).cTodayBoard(DATA, groupsOf(DATA));
  assert.match(html, /grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\) minmax\(0,1fr\)/);
  const later = html.slice(html.indexOf('Coming up<b'));
  assert.match(later, /class="t-foldx" onclick="C_TP\.upOpen=false;cTodayPool\(\)">Fold</);
  assert.equal((later.match(/class="c-jp row t-card c-rail c-rail-due"/g) || []).length, 1, 'one card for the person, on the navy rail');
  assert.equal((later.match(/class="c-jnext"/g) || []).length, 2, 'with both of their steps');
  const only = board({ col: 'later' }).cTodayBoard(DATA, groupsOf(DATA));
  assert.doesNotMatch(only, /data-col="over"|t-fold"/, 'the Coming up card shows Coming up, unfolded, alone');
  assert.equal(board({ col: 'none' }).cTodayBoard(DATA, groupsOf(DATA)), '', 'No next step: the list only');
});

test('drag onto Due today: the person\'s steps from that column are due today', async () => {
  const b = board({}, DATA);
  await b.cTodayDrop('p1', 'over', 'today');
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(JSON.parse(JSON.stringify(b.posted)), [['/api/tasks/1/reschedule', { due: TODAY }]]);
});

test('drag onto Coming up: the date picker opens on the card, earliest tomorrow; Save moves the steps', async () => {
  const b = board();
  b.C_TP.pick = null;
  b.cTodayDrop('r1', 'today', 'later');
  assert.deepEqual(JSON.parse(JSON.stringify(b.C_TP.pick)), { pid: 'r1', from: 'today' });
  const d2 = D([], [task(20, 'q1', 'Due One', TODAY + 'T09:00:00Z')], []);
  const html = board({ pick: { pid: 'q1', from: 'today' } }).cTodayBoard(d2, groupsOf(d2));
  assert.match(html, /<div class="t-pick"[^>]*>[\s\S]*<input id="tPickDate" type="date" min="2026-10-07" value="2026-10-07">/);
  assert.match(html, /onclick="cTodayMoveTo\('q1', 'today', document\.getElementById\('tPickDate'\)\.value\)">Save<\/button>/);
  const m = board({}, DATA);
  await m.cTodayMoveTo('r1', 'later', '2026-10-15');
  assert.deepEqual(JSON.parse(JSON.stringify(m.posted)), [['/api/tasks/30/reschedule', { due: '2026-10-15' }], ['/api/tasks/31/reschedule', { due: '2026-10-15' }]]);
  const past = board({}, DATA);
  await past.cTodayMoveTo('r1', 'later', '2026-10-01');
  assert.equal(past.posted.length, 0, 'never into the past');
});

test('nothing is dropped into Overdue, and no stage moves on Today', () => {
  const wire = fnBody('function cTodayWire() {');
  assert.match(wire, /if \(to === 'over'\) return;   \/\/ nothing is moved into the past/);
  const all = fnBody('function cTodayBoard(D, groups) {') + fnBody('async function cTodayMoveTo(pid, from, day) {');
  assert.doesNotMatch(all, /\/status|cAskMoveNote/, 'stage moves (and their back-move note) stay on the Journey board');
  assert.match(all, /\/api\/tasks\/\$\{Number\(t\.id\)\}\/reschedule/);
});
