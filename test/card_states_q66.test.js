// Q66 CARD STATES (the owner's pick "B as drawn", 07.10.2026, of the live Journey board: "Why is everyone so not
// organized? i see overdue all over the place, i see some without next action and some plan next action and they are
// all over the place"). ONE system on the Journey, Today and Inbox cards: the same state line, last on every card, and
// a 3px left rail in the state's colour; inside a Journey column, bands group the cards by state and count everyone in
// that state, the people behind "N more" too. These RUN the column, the Today board and the Inbox board and read
// what they draw.
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
const TODAY = '2026-10-07';
const helpers = () => [line('const cWhenClass = '), line('const cDaysLate = '), line('const C_SIS_HOLDS = '), line('const cSisHolds = '),
  line('const C_ST = '), line('const C_ST_RAIL = '), fn('function cStateLine('), line('const cDdMm = '), fn('function cStepState('),
  line('const cStepGroup = '), line('const cChooseOnCard = '), line('const C_GRP = '), line('const cGroupBand = ')].join('\n');
const base = () => ({
  esc: (s) => String(s ?? ''), cTodayIso: () => TODAY, cDay: (iso) => (iso ? String(iso).slice(0, 10) : ''), Date, Math, Set, Map,
  cTask: (s) => s, cStepIcon: () => '', cComment: () => '', cLifeFacts: () => [], CFG: CONFIG, C_TERMINAL: ['Admitted', 'Not proceeding'],
});
const cardsOf = (html) => [...html.matchAll(/<div class="(c-jp[^"]*)"[^>]*data-(?:id|pid)="([^"]+)"/g)].map((m) => [m[2], m[1]]);
const stateOf = (html, id) => { const i = html.indexOf(`data-id="${id}"`); const j = html.indexOf('<div class="c-st ', i); const k = html.indexOf('</div>', j); return html.slice(j, k + 6); };

// ---- the Journey column ------------------------------------------------------------------------------------------
const sis = { id: 'sis', name: 'Held', first_channel: 'sis', sis: { status: 'submitted', label: 'Form submitted' } };
const PEOPLE = ['late9', 'late2', 'today', 'soon', 'later', 'none1', 'none2', 'x1', 'x2'].map((id) => ({ id, name: id, status: 'Contacted' })).concat([sis]);
const TASKS = new Map([
  ['late9', { label: 'Get in touch (from the sheet)', due_at: '2026-09-28T09:00:00Z' }], ['late2', { label: 'Call', due_at: '2026-10-05T09:00:00Z' }],
  ['today', { label: 'Call', due_at: TODAY + 'T09:00:00Z' }], ['soon', { label: 'Call', due_at: '2026-10-09T09:00:00Z' }],
  ['later', { label: 'Call', due_at: '2026-10-20T09:00:00Z' }], ['x1', { label: 'Call', due_at: '2026-11-01T09:00:00Z' }], ['x2', { label: 'Call', due_at: '2026-11-02T09:00:00Z' }],
]);
function column(sel = null, open = false) {
  const ctx = { ...base(), C_PEDIT: null, cPersonCard: (p) => `[open ${p.id}]`, cJEndCard: (p) => `[end ${p.id}]`, cEditForm: () => '' };
  vm.createContext(ctx);
  vm.runInContext([helpers(), line('const C_JCOL_SHOW = '), line('const C_JCOLOPEN = '), fn('function cJUrgency('), fn('function cJSort('), fn('function cJourneyCard('), fn('function cJColumn(')].join('\n')
    + `\nif (${open}) C_JCOLOPEN.add('Contacted'); this.html = cJColumn('Contacted', PEOPLE, TASKS, SEL);`, Object.assign(ctx, { PEOPLE, TASKS, SEL: sel }));
  return ctx.html;
}

test('every card ends with ONE state line in the same form, and carries the rail of its state', () => {
  const html = column(null, true);
  const cards = cardsOf(html);
  assert.equal(cards.length, 10, 'everyone drawn when the column is open');
  for (const [id, cls] of cards) {
    assert.match(cls, /^c-jp row c-rail c-rail-(over|today|due|none|sis)\b/, `${id}: a rail`);
    const st = stateOf(html, id);
    assert.match(st, /^<div class="c-st c-st-(over|today|due|none|sis)"><span class="c-st-w">(Overdue|Due today|Due|No next step|With the SIS)<\/span>/, `${id}: the state line`);
    const card = html.slice(html.indexOf(`data-id="${id}"`), html.indexOf('<div class="c-jp', html.indexOf(`data-id="${id}"`) + 10) < 0 ? undefined : html.indexOf('<div class="c-jp', html.indexOf(`data-id="${id}"`) + 10));
    assert.equal((card.match(/class="c-st /g) || []).length, 1, `${id}: exactly one state line`);
    assert.ok(/<\/div><\/div>(<div class="c-grp|<div class="c-jp|<button|$)/.test(card), `${id}: the state line is the card's last line`);
  }
  assert.match(stateOf(html, 'late9'), /Overdue<\/span><span class="c-st-d">· 9 d<\/span>/, 'overdue by how much: the real date, untouched');
  assert.match(stateOf(html, 'late2'), /Overdue<\/span><span class="c-st-d">· 2 d<\/span>/);
  assert.match(stateOf(html, 'today'), /c-st-today"><span class="c-st-w">Due today<\/span><\/div>$/);
  assert.match(stateOf(html, 'soon'), /c-st-due"><span class="c-st-w">Due<\/span><span class="c-st-d">· 09\.10<\/span>/, 'dd.mm');
  assert.match(stateOf(html, 'none1'), /c-st-none"><span class="c-st-w">No next step<\/span><button type="button" class="c-st-act" onclick="event\.stopPropagation\(\);openNewTask\('none1'\)"[^>]*>Choose ›<\/button>/, 'the action on the line');
  assert.match(stateOf(html, 'sis'), /c-st-sis"><span class="c-st-w">With the SIS<\/span><span class="c-st-d">· Form submitted<\/span>/);
  assert.doesNotMatch(html, /c-jdue|c-choose"|Choose next step|c-jover/, 'the badges, the button and the header pill are gone');
});

test('the bands inside a column: one per state, in order, counting everyone in that state - the people behind "N more" too', () => {
  const closed = column();
  const bands = [...closed.matchAll(/<div class="c-grp c-grp-(\w+)"[^>]*><span>([^<]+)<\/span><b>(\d+)<\/b><\/div>/g)].map((m) => [m[1], m[2], Number(m[3])]);
  assert.deepEqual(bands, [['over', 'Overdue', 2], ['plan', 'Planned', 5]], 'closed: the five most urgent are shown, the bands count the whole column\'s group');
  assert.equal(cardsOf(closed).length, 5); assert.match(closed, />5 more<\/button>/);
  const open = column(null, true);
  const all = [...open.matchAll(/<div class="c-grp c-grp-(\w+)"[^>]*><span>([^<]+)<\/span><b>(\d+)<\/b><\/div>/g)].map((m) => [m[1], m[2], Number(m[3])]);
  assert.deepEqual(all, [['over', 'Overdue', 2], ['plan', 'Planned', 5], ['none', 'No next step', 2], ['sis', 'With the SIS', 1]]);
  assert.equal(all.reduce((a, b) => a + b[2], 0), PEOPLE.length, 'the counts add up to the column');
  // the order on the board follows the bands: overdue first, then planned, no next step, then the SIS-held
  const ids = cardsOf(open).map(([id]) => id);
  assert.deepEqual(ids, ['late9', 'late2', 'today', 'soon', 'later', 'x1', 'x2', 'none1', 'none2', 'sis']);
  assert.match(open, /<div class="c-grp c-grp-over" role="button" tabindex="0" onclick="event\.stopPropagation\(\);cJfOverdue\('Contacted'\)"/, 'the Overdue band opens the stage\'s overdue people, as the header pill did');
  // the opened person keeps the board's order (no second band for their group)
  const withSel = column(PEOPLE.find((p) => p.id === 'none2'));
  assert.equal((withSel.match(/c-grp-none/g) || []).length, 1);
  assert.match(withSel, /\[open none2\]/);
});

test('the board header lost its red pill: the band says the count once', () => {
  const draw = fn('function cDrawJourney(');
  assert.doesNotMatch(draw, /c-jover|overdue<\/button>/);
  assert.doesNotMatch(APP, /c-jover/);
  assert.match(draw, /cJColumn\(s\.id, ps, taskOf, sel\)/);
});

// ---- the Today board --------------------------------------------------------------------------------------------
test('a Today card: the same state line in its foot, Done beside it, the rail of its column', () => {
  const task = (id, pid, due, label = 'Call back') => ({ id, person_id: pid, name: pid, due_at: due, label, programme: 'NAV', status: 'Application' });
  const D = { over: [task(1, 'p1', '2026-09-27T09:00:00Z')], today: [task(2, 'p2', TODAY + 'T09:00:00Z')], later: [task(3, 'p3', '2026-10-12T09:00:00Z')],
    byId: new Map(), done: (t) => `<button data-done="${t.id}">Done</button>` };
  const byPerson = (ts) => ts.map((t) => [t]);
  const groups = [{ id: 'over', label: 'Overdue', rows: byPerson(D.over), tone: 'over' }, { id: 'today', label: 'Due today', rows: byPerson(D.today), tone: 'today' },
    { id: 'later', label: 'Coming up', rows: byPerson(D.later), tone: 'later' }, { id: 'none', label: 'No next step', rows: [], tone: 'none' }];
  const ctx = { ...base(), C_TP: { col: null, programme: '', stage: '', source: '', upOpen: true, more: {}, pick: null }, cStage: (s) => s, fmtDate: (s) => String(s).slice(0, 10) };
  vm.runInNewContext([helpers(), APP.match(/const C_TCOL_SHOW = \d+;/)[0], fn('function cTodayBoard(D, groups) {')].join('\n') + '\nthis.html = cTodayBoard(D, groups);', Object.assign(ctx, { D, groups }));
  const html = ctx.html;
  assert.match(html, /class="c-jp row t-card c-rail c-rail-over is-over"[\s\S]*?<div class="t-foot"><div class="c-st c-st-over"><span class="c-st-w">Overdue<\/span><span class="c-st-d">· 10 d<\/span><\/div><button data-done="1">Done<\/button><\/div>/);
  assert.match(html, /class="c-jp row t-card c-rail c-rail-today is-today"[\s\S]*?<div class="t-foot"><div class="c-st c-st-today"><span class="c-st-w">Due today<\/span><\/div><button data-done="2">Done<\/button><\/div>/);
  assert.match(html, /class="c-jp row t-card c-rail c-rail-due"[\s\S]*?<div class="t-foot"><div class="c-st c-st-due"><span class="c-st-w">Due<\/span><span class="c-st-d">· 12\.10<\/span><\/div><button data-done="3">Done<\/button><\/div>/);
  assert.doesNotMatch(html, /c-jdue|d\. overdue/);
});

// ---- the Inbox board --------------------------------------------------------------------------------------------
test('an Inbox card: the state line says New, Answer now, Late or Set aside and how long the message has waited; the rail matches', () => {
  class FixedDate extends Date { static now() { return Date.parse(TODAY + 'T15:00:00Z'); } }
  const msg = (id, at, extra = {}) => ({ id, contact_name: 'P' + id, channel: 'gmail', received_at: at, body: 'Hello', fields: [], state: 'new', senderKind: 'possible_student', ...extra });
  const rows = [msg(1, TODAY + 'T14:40:00Z'), msg(2, TODAY + 'T12:00:00Z', { answerNow: true }), msg(3, '2026-10-06T10:00:00Z', { aged: true })];
  const run = (show) => {
    const view = { innerHTML: '' };
    const ctx = { ...base(), Date: FixedDate, C_IP: { col: null, channel: '', kind: '', show }, C_LOPEN: null,
      C_IPD: { rows, receipt: '', val: () => '', form: () => '' }, channelLabel: (c) => c, cTelLink: () => '', fmtDateTime: (iso) => String(iso).slice(0, 16).replace('T', ' '), cCallLine: (b) => b,
      cPoolFrame: (o) => o.body, cPoolBand: () => '', cPoolSelect: () => '', cPoolFilters: () => '', $: () => view, cPoolWire() {}, cPoolOpened() {} };
    vm.runInNewContext([helpers(), line('const C_IP_KIND = '), fn('function cInboxAge(iso) {'), line('const cAgo = '), fn('function cInboxPool() {'), 'cInboxPool();'].join('\n'), ctx);
    return view.innerHTML;
  };
  const html = run('new');
  assert.match(html, /class="c-jp row ib-card c-rail c-rail-due" data-id="1"[\s\S]*?<div class="c-st c-st-new" title="[^"]+"><span class="c-st-w">New<\/span><span class="c-st-d">· 20 min<\/span><\/div>\s*<div class="ib-acts">/);
  assert.match(html, /class="c-jp row ib-card c-rail c-rail-today" data-id="2"[\s\S]*?<span class="c-st-w">Answer now<\/span><span class="c-st-d">· 3 h<\/span>/);
  assert.match(html, /class="c-jp row ib-card c-rail c-rail-over" data-id="3"[\s\S]*?<span class="c-st-w">Late<\/span><span class="c-st-d">· 1 d<\/span>/);
  assert.doesNotMatch(html, /c-late|c-answer|<small title=/, 'no chip and no second age: the state line says it once');
  const aside = run('archived');
  assert.match(aside, /class="c-jp row ib-card c-rail c-rail-none" data-id="1"[\s\S]*?<span class="c-st-w">Set aside<\/span>/);
  // with Bring back (CHANNELS 9bed85b, merged in rc/2026-10-07 as MASTER CONTROL approved): a set-aside card's one
  // action is Bring back; none of the Inbox's own actions
  assert.match(aside, /<div class="ib-acts"><button class="btn sm" onclick="event\.stopPropagation\(\);cBringBack\(1, this\)">Bring back<\/button><\/div>/);
  assert.doesNotMatch(aside, /Make a lead|class="ib-aside"/);
});

// ---- the look, and the Help center keeps up ---------------------------------------------------------------------
test('the rails and the state words: red alarm, amber signal, navy planned, grey no next step, blue SIS; dark named', () => {
  assert.match(APP, /html\.ui-c \.c-jp\.c-rail,html\.ui-c\[data-theme="dark"\] \.c-jp\.c-rail\{border-left:3px solid var\(--rule\);padding-left:8px\}/);
  assert.match(APP, /\.c-jp\.c-rail-over\{border-left-color:var\(--j-alarm\)\}/);
  assert.match(APP, /\.c-jp\.c-rail-today\{border-left-color:var\(--j-soon\)\}/);
  assert.match(APP, /\.c-jp\.c-rail-due\{border-left-color:#0a2463\}/);
  assert.match(APP, /\.c-jp\.c-rail-none\{border-left-color:#b9c2cc\}/, 'grey, as drawn - never amber again');
  assert.match(APP, /\.c-jp\.c-rail-sis\{border-left-color:var\(--c-sis\)\}/);
  assert.match(APP, /html\.ui-c\[data-theme="dark"\] \.c-jp\.c-rail-none\{border-left-color:#5b7391\}/);
  assert.doesNotMatch(APP, /\.c-jp\.is-none[^{]*\{[^}]*#F7C04F/, 'Q44\'s amber edge is gone');
  assert.match(APP, /html\.ui-c \.c-grp-over\{background:color-mix\(in srgb,var\(--j-alarm\),transparent 86%\);color:var\(--j-alarm\);cursor:pointer\}/, 'the Overdue band is pink');
  assert.match(APP, /html\.ui-c #view \.c-when, html\.ui-c #view \.c-jp \.c-st\{font-size:var\(--type-chip\)\}/, 'the chip token');
});

test('the Help center says it: the tour, the how-to and a question', () => {
  assert.match(HELP.tour.find((t) => t.title === 'Journey').body, /The last line of every card is its state - Overdue, Due today, Due, No next step or With the SIS - and the card's left edge has that colour/);
  assert.match(HELP.tour.find((t) => t.target === '.cnav a[data-c="today"]').body, /on a card with no next step, press Choose/);
  assert.ok(HELP.howto.some((h) => h.where.includes('Done or Choose on the card')));
  const q = HELP.faq.find((f) => f.id === 'card-states');
  assert.ok(q, 'the question');
  assert.match(q.a, /Red: Overdue[\s\S]*Amber: Due today[\s\S]*Navy: Due[\s\S]*Grey: No next step[\s\S]*Blue: With the SIS[\s\S]*New, Answer now or Late/);
  assert.doesNotMatch(JSON.stringify(HELP), /Choose next step/, 'the button is gone from the cards, so from the help too');
});
