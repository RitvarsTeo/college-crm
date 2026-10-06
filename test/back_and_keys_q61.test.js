// Q61 (the owner, 06.10.2026: "could benefit from hot keys (shortcuts) for faster navigation, right? First priority
// would be back one step, especially useful when jumping between tabs and links to tabs especially"). Every view
// writes its state into the address after the page, so Back lands on exactly that view; a page reached through a
// link says where it came from; G then H / I / T / J / R, "/", Esc and "?" work, and never while typing.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const LAYER = APP.slice(APP.indexOf('// ---------------------------------------------------------------- BACK ONE STEP (Q61)'), APP.indexOf('async function route() {'));
const line = (start) => { const i = APP.indexOf(start); assert.ok(i >= 0, start); return APP.slice(i, APP.indexOf('\n', i)); };

function sandbox(hash = '#/home') {
  const store = new Map();
  const ctx = {
    location: { hash, href: 'http://x/' + hash, pathname: '/', search: '' },
    history: { state: null, replaced: [], replaceState(st, _t, url) { this.state = st; this.replaced.push(url); ctx.location.hash = String(url).replace(/^[^#]*/, ''); } },
    sessionStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    document: { querySelector: () => null, addEventListener: () => {} }, esc: (s) => String(s ?? ''), URLSearchParams,
    C_TERMINAL: ['Admitted', 'Not proceeding'], C_OUTCOME: 'Admitted', C_REP_CH: null,
    C_TP: { col: null, programme: '', stage: '', source: '', upOpen: false, more: {}, pick: null },
    C_IP: { col: null, channel: '', kind: '', show: 'new' }, C_JP: { col: null, view: 'board' },
    C_PQ: '', C_OUT_TAG: null, C_OUT_REASON: null, C_OUT_FILTER: null, C_PCOHORT: null,
  };
  vm.runInNewContext([line('const C_JF_EMPTY = '), line('const C_PF_EMPTY = '), 'var C_JF = C_JF_EMPTY(); var C_PF = C_PF_EMPTY();',
    APP.slice(APP.indexOf('function cPlace('), APP.indexOf('\n}\n', APP.indexOf('function cPlace(')) + 2),
    LAYER.replace(/^(let|const) /gm, 'var '),
    'this.L = { cViewState, cApplyViewState, cViewPath, cRouteState, cShortcut, get JF() { return C_JF; }, get PF() { return C_PF; }, set JF(v) { C_JF = v; }, set PF(v) { C_PF = v; }, get FROM() { return C_STATE_FROM_HASH; } };'].join('\n'), ctx);
  return ctx;
}

test('the Journey writes its view into the address, and the same address brings that exact view back', () => {
  const a = sandbox('#/journey');
  a.C_JP.view = 'list'; a.C_JP.col = 'Application';
  a.L.JF = { ...a.L.JF, stage: ['Application'], programme: ['NAV', 'ENG'] };
  a.L.PF = { ...a.L.PF, arrived: '2025', owner: 'Admissions' };
  a.C_PQ = 'anna'; a.C_OUT_TAG = 'cold';
  a.C_PCOHORT = { label: 'Leads 2026', ids: new Set(['p1', 'p2']) };
  const qs = a.L.cViewState('people').toString();
  assert.match(qs, /v=list/); assert.match(qs, /js=Application/); assert.match(qs, /jp=NAV%2CENG/); assert.match(qs, /p_arrived=2025/);
  assert.match(qs, /q=anna/); assert.match(qs, /tag=cold/); assert.match(qs, /coh=c/);
  // a fresh tab-world (another session's variables), the same sessionStorage: apply the address
  const b = sandbox('#/journey?' + qs);
  b.sessionStorage.setItem = a.sessionStorage.setItem; b.sessionStorage.getItem = a.sessionStorage.getItem;
  b.L.cApplyViewState('people', new URLSearchParams(qs));
  assert.equal(b.C_JP.view, 'list'); assert.equal(b.C_JP.col, 'Application');
  assert.deepEqual([...b.L.JF.stage], ['Application']); assert.deepEqual([...b.L.JF.programme], ['NAV', 'ENG']);
  assert.equal(b.L.PF.arrived, '2025'); assert.equal(b.L.PF.owner, 'Admissions');
  assert.equal(b.C_PQ, 'anna'); assert.equal(b.C_OUT_TAG, 'cold');
  assert.deepEqual([...b.C_PCOHORT.ids], ['p1', 'p2'], 'a Reports figure\'s people come back');
  assert.equal(b.L.FROM, true, 'and the Journey draws the view the address names (the List too), not the default way in');
  assert.match(APP, /if \(C_STATE_FROM_HASH\) \{ C_STATE_FROM_HASH = false; return C_JP\.view === 'list' \? viewJourneyPool\(\) : viewJourneyC\(\); \}/);
});

test('what the address does not say is the fresh view, so Back never inherits a later filter', () => {
  const c = sandbox();
  c.L.JF = { ...c.L.JF, programme: ['NAV'] }; c.C_OUT_REASON = 'Price';
  c.L.cApplyViewState('people', new URLSearchParams('v=board&js=Contract'));
  assert.deepEqual([...c.L.JF.programme], [], 'the later NAV filter is not carried back');
  assert.equal(c.C_OUT_REASON, null);
  assert.deepEqual([...c.L.JF.stage], ['Contract']);
});

test('Today and the Inbox keep their card, filters and folds in the address', () => {
  const t = sandbox('#/today');
  t.C_TP = { ...t.C_TP, col: 'over', programme: 'ENG', upOpen: true };
  const qs = t.L.cViewState('today').toString();
  assert.equal(qs, 'card=over&prog=ENG&up=1');
  const t2 = sandbox(); t2.L.cApplyViewState('today', new URLSearchParams(qs));
  assert.equal(t2.C_TP.col, 'over'); assert.equal(t2.C_TP.programme, 'ENG'); assert.equal(t2.C_TP.upOpen, true);
  const i = sandbox('#/leads'); i.C_IP = { ...i.C_IP, col: 'week', channel: 'gmail', show: 'filtered' };
  const iq = i.L.cViewState('leads').toString();
  const i2 = sandbox(); i2.L.cApplyViewState('leads', new URLSearchParams(iq));
  assert.deepEqual({ col: i2.C_IP.col, ch: i2.C_IP.channel, show: i2.C_IP.show }, { col: 'week', ch: 'gmail', show: 'filtered' });
});

test('the page part: old names land on their page; Reports keeps its open tab in the path', () => {
  const s = sandbox();
  assert.equal(s.L.cViewPath('people', '#/people/all'), '#/journey');
  assert.equal(s.L.cViewPath('leads', '#/inbox'), '#/leads');
  s.C_REP_CH = 'conversion';
  assert.equal(s.L.cViewPath('reports', '#/reports'), '#/reports/conversion');
  assert.equal(s.L.cViewPath('settings', '#/help'), '#/help');
});

test('a new step remembers where it came from, unless the menu or a G shortcut took it there', () => {
  const s = sandbox('#/journey');
  vm.runInNewContext('C_LAST_PATH = "#/home"; C_LAST_LABEL = "Home"; C_VIA_MENU = false;', s);
  s.L.cRouteState('#/journey', undefined);
  assert.deepEqual({ ...s.history.state }, { from: 'Home' });
  const m = sandbox('#/journey');
  vm.runInNewContext('C_LAST_PATH = "#/home"; C_LAST_LABEL = "Home"; C_VIA_MENU = true;', m);
  m.L.cRouteState('#/journey', undefined);
  assert.deepEqual({ ...m.history.state }, { from: '' }, 'the menu is not a link inside a page');
  // Back and Forward carry their own record: it is never overwritten
  const b = sandbox('#/journey'); b.history.state = { from: 'Reports' };
  b.L.cRouteState('#/journey', 'v=board');
  assert.deepEqual({ ...b.history.state }, { from: 'Reports' });
  assert.match(LAYER, /<p class="c-back"><a href="#" onclick="history\.back\(\);return false"[^>]*>← \$\{esc\(from\)\}<\/a><\/p>/);
});

test('the router reads the page before "?", the exact comparisons too, and a change inside a page is never a new step', () => {
  assert.match(APP, /const full = location\.hash \|\| START\(\);\s*const \[hash, qs\] = full\.split\('\?'\);\s*if \(UI === 'c'\) cRouteState\(hash, qs\);/);
  assert.doesNotMatch(APP, /location\.hash === '#\//, 'no exact comparison of the whole address is left');
  assert.match(LAYER, /if \(want !== full\) history\.replaceState\(history\.state, '', location\.pathname \+ location\.search \+ want\);/, 'replaced, not pushed');
  assert.match(LAYER, /if \(!href\.includes\('\?'\) && cHashIs\(href\) && !e\.defaultPrevented\) \{ e\.preventDefault\(\);/, 'the page you are on is not a new step');
  assert.doesNotMatch(LAYER, /C_SCOPE/, 'the year is the Period dropdown\'s own lane, not written here');
});

test('shortcuts: G then a letter goes to the place; nothing happens while typing; "?" and "/" do their job', () => {
  const s = sandbox('#/home');
  const ev = (key, target = { closest: () => null }, extra = {}) => ({ key, target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra });
  s.L.cShortcut(ev('g')); s.L.cShortcut(ev('t'));
  assert.equal(s.location.hash, '#/today');
  s.L.cShortcut(ev('g')); s.L.cShortcut(ev('J'));
  assert.equal(s.location.hash, '#/journey', 'either case');
  for (const [k, where] of [['h', '#/home'], ['i', '#/leads'], ['r', '#/reports']]) { s.L.cShortcut(ev('g')); s.L.cShortcut(ev(k)); assert.equal(s.location.hash, where); }
  const typing = { closest: (sel) => (sel.includes('input') ? {} : null) };
  s.location.hash = '#/home';
  s.L.cShortcut(ev('g', typing)); s.L.cShortcut(ev('t', typing));
  assert.equal(s.location.hash, '#/home', 'typing in a field is never a shortcut');
  s.L.cShortcut(ev('g', { closest: () => null }, { ctrlKey: true })); s.L.cShortcut(ev('t'));
  assert.equal(s.location.hash, '#/home', 'Ctrl+G is the browser\'s');
  assert.match(LAYER, /if \(k === '\?'\) \{ e\.preventDefault\(\); return cKeysOpen\(\); \}/);
  assert.match(LAYER, /document\.querySelector\('#cPQ, #view input\.c-search, #helpFaq input, #view input\[type="search"\]'\)/);
  assert.match(LAYER, /if \(document\.querySelector\('dialog\[open\]'\)\) return;\s*\/\/ a dialog takes the keys/);
});

test('the shortcut list: one source for the dialog and the Help center, under How to', () => {
  const keys = vm.runInNewContext(LAYER.slice(LAYER.indexOf('const C_KEYS = '), LAYER.indexOf('const C_GO = ')).replace('const ', 'var ') + '; C_KEYS');
  assert.deepEqual(JSON.parse(JSON.stringify(keys.map((k) => k[0]))), ['Alt + ←', 'G then H', 'G then I', 'G then T', 'G then J', 'G then R', '/', 'Esc', '?']);
  assert.match(APP, /\$\{cHelpFlow\(\)\}\$\{cHelpHowTo\(\)\}\$\{cKeysHelp\(\)\}/, 'Help center: How to, then Keyboard');
  assert.match(LAYER, /<dialog id="cKeys" class="c-keys" aria-labelledby="cKeysH">/, 'a dialog, not a page');
});
