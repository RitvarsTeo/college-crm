// Q68 THE BOARDS ON A PHONE (the owner's pick "B stacked stages", 07.10.2026, of a phone shot of the Journey: "mobile
// versions scrolling doesnt work like that"). At phone width every board stacks its columns, ONE open at a time, the
// rest folded to a row with their count; the band's bars / cards / days open a column, so does a folded row; nothing
// scrolls sideways; Move on the opened Journey card. A wide screen is unchanged. These RUN the three boards at phone
// width and at desktop width.
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
const STAGES = (CONFIG.stages || []).filter((s) => !['Admitted', 'Not proceeding'].includes(s.id));
const mq = (phone) => ({ matchMedia: (q) => ({ matches: phone && q === '(max-width:760px)' }) });

// ---- the Journey board ----
function journey(phone, people, setup = {}) {
  let html = '';
  const ctx = {
    CFG: CONFIG, C_TERMINAL: ['Admitted', 'Not proceeding'], C_JSEL: null, C_PEDIT: null, window: mq(phone),
    C_PCOHORT: null, C_PF: { stage: '', arrived: '' }, C_OUT_TAG: null, C_OUT_REASON: null, C_OUT_FILTER: null,
    C_JDATA: { people, taskOf: new Map(), play: false }, cSisHolds: () => false, C_JTALK: new Map(), C_JTALK_BUSY: new Set(),
    esc: (s) => String(s ?? ''), cDay: (d) => String(d || '').slice(0, 10), fmtDate: (d) => String(d || '').slice(0, 10), cWhenClass: () => '', cDaysLate: () => 0,
    cJourneySummary: () => '<summary>', cJourneyFilters: () => '<filters>', cPoolViewSwitch: () => '<switch>', cScenes() {}, cJFlipPlay() {}, cPoolWire() {},
    cJourneyCard: (p) => `<div class="c-jp" data-id="${p.id}">[${p.id}]</div>`, cPersonCard: (p) => `[open ${p.id}]`, cJEndCard: (p) => `[end ${p.id}]`,
    cJourneyTalk: async () => {}, cTagChip: (t) => `<tag ${t}>`, cColdWhy: () => '', cTagLabel: (p) => p.closed_tag,
    $: () => ({ set innerHTML(v) { html = v; } }),
    document: { querySelectorAll: () => [], querySelector: () => null, addEventListener() {}, documentElement: {} },
    getComputedStyle: () => ({ getPropertyValue: () => '0px' }),
    ...setup,
  };
  const filtersSrc = APP.slice(APP.indexOf('let C_JF = {'), APP.indexOf('// FOR MANAGEMENT (30.09.2026)'));
  vm.runInNewContext([line('const cPhone = '), 'var C_JP = { col: null, view: "board", open: null };', line('const C_JCOL_SHOW = '), line('const C_JCOLOPEN = '),
    line('const C_ST = '), line('const C_ST_RAIL = '), fn('function cStateLine('), line('const cDdMm = '), fn('function cStepState('), line('const cStepGroup = '), line('const C_GRP = '), line('const cGroupBand = '),
    fn('function cJUrgency('), fn('function cJSort('), fn('function cJColumn('), filtersSrc.replace('let C_JF = {', 'var C_JF = {'),
    fn('function cJTargetKeep('), line('const cJTargeted = '), line('const cMoveBody = '), fn('function cJTargetChips('), fn('function cJourneyMini('), fn('function cDrawJourney('),
    'this.draw = cDrawJourney; this.tap = cJStageTap; this.bar = cJBarTap; this.JP = () => C_JP; this.JF = () => C_JF; this.setOpen = (v) => { C_JP.open = v; };'].join('\n'), ctx);
  return { ctx, draw: () => { ctx.draw(); return html; }, last: () => html };
}
const P = (id, status) => ({ id, name: id, status });
const PEOPLE = [P('c1', STAGES[1].id), P('c2', STAGES[1].id), P('f1', STAGES[2].id), P('a1', STAGES[3].id), P('a2', STAGES[3].id), P('a3', STAGES[3].id)];
const folds = (html) => [...html.matchAll(/<div class="c-col is-fold"[^>]*><button type="button" class="c-foldrow" onclick="cJStageTap\((?:"|&#34;|&quot;)([^"&]+)(?:"|&#34;|&quot;)\)"><span class="c-jn">(\d)<\/span>([^<]+)<b>(\d+)<\/b><\/button><\/div>/g)].map((m) => [m[1], m[3], Number(m[4])]);
const opens = (html) => [...html.matchAll(/<div class="c-col" style="[^"]*"><h3><span class="c-jn">\d<\/span>([^<]+)<\/h3><div class="c-drop" data-stage="([^"]+)">/g)].map((m) => m[2]);

test('a phone: the stages stack, the first with people open, the rest folded to a row with their count; a wide screen is unchanged', () => {
  const J = journey(true, PEOPLE);
  const html = J.draw();
  assert.deepEqual(opens(html), [STAGES[1].id], 'New is empty, so Contacted opens');
  assert.deepEqual(folds(html), [[STAGES[0].id, STAGES[0].label || STAGES[0].id, 0], [STAGES[2].id, STAGES[2].label || STAGES[2].id, 1], [STAGES[3].id, STAGES[3].label || STAGES[3].id, 3]], 'four stages since Contract was removed (Q75)');
  assert.match(html, /\[c1\]/); assert.doesNotMatch(html, /\[a1\]/, 'a folded stage shows no card');
  assert.match(html, /<div class="j-sentinel" aria-hidden="true"><\/div><summary>/, 'the band has its sentinel: the strip goes compact once scrolled');
  const W = journey(false, PEOPLE);
  const wide = W.draw();
  assert.equal(folds(wide).length, 0, 'no fold on a wide screen');
  assert.equal(opens(wide).length, STAGES.length, 'every column open, as before');
});

test('a tap on a bar or a folded row opens that stage on a phone; on a wide screen the bar is the stage filter, as before', () => {
  const J = journey(true, PEOPLE);
  J.draw();
  J.ctx.bar(STAGES[3].id, false);
  assert.equal(J.ctx.JP().open, STAGES[3].id);
  assert.deepEqual(opens(J.last()), [STAGES[3].id], 'Application open now'); assert.match(J.last(), /\[a1\]/);
  assert.deepEqual(JSON.parse(JSON.stringify(J.ctx.JF().stage)), [], 'no filter was set on the phone');
  J.ctx.tap(STAGES[0].id);
  assert.deepEqual(opens(J.last()), [STAGES[0].id], 'an empty stage opens too (its row says 0)');
  const W = journey(false, PEOPLE);
  W.draw(); W.ctx.bar(STAGES[3].id, false);
  assert.deepEqual(JSON.parse(JSON.stringify(W.ctx.JF().stage)), [STAGES[3].id], 'wide: the filter, as before');
  assert.equal(W.ctx.JP().open, null);
  assert.match(fn('function cJourneyBand('), /onclick="cJBarTap\(this\.dataset\.v, \$\{on\(c\.id\)\}\)"/, 'the band\'s bars call it');
  assert.match(fn('function cJBarTap('), /if \(cPhone\(\)\) return cJStageTap\(id\);\s*cJfPick\('stage', id, !on\);/);
});

test('the opened Journey card carries Move on a phone (the wide screen drags); the address carries the open column', () => {
  assert.match(fn('function cPersonCard('), /\$\{open \? `<button class="btn sm ghost c-move" onclick="cEditFromJourney\(\$\{esc\(JSON\.stringify\(String\(p\.id \?\? ''\)\)\)\}\)">Move<\/button>` : ''\}/);
  assert.match(APP, /\n  html\.ui-c \.c-move\{display:none\}\n/); assert.match(APP, /@media \(max-width:760px\)\{[\s\S]*?html\.ui-c \.c-move\{display:inline-flex\}/);
  const ctx = { URLSearchParams, C_JP: { col: null, view: 'board', open: 'Contacted' }, C_JF: { stage: [] }, C_PF: {}, C_PQ: '', C_OUT_TAG: null, C_OUT_REASON: null, C_OUT_FILTER: null, C_PCOHORT: null,
    cCohortToken: () => '', C_TP: { col: null, programme: '', stage: '', source: '', upOpen: false, open: 'today' }, C_IP: { col: null, channel: '', kind: '', show: 'new', open: 'older' } };
  vm.runInNewContext(fn('function cViewState(place) {') + '\nthis.p = cViewState("people").toString(); this.t = cViewState("today").toString(); this.l = cViewState("leads").toString();', ctx);
  assert.equal(ctx.p, 'v=board&open=Contacted'); assert.equal(ctx.t, 'open=today'); assert.equal(ctx.l, 'open=older');
  const back = { URLSearchParams, C_JP: { col: null, view: 'board', open: null }, C_JF: {}, C_PF: {}, C_JF_EMPTY: () => ({}), C_PF_EMPTY: () => ({}), cList: (v) => (v ? v.split(',') : []),
    C_PQ: '', C_OUT_TAG: null, C_OUT_REASON: null, C_OUT_FILTER: null, C_PCOHORT: null, cCohortFrom: () => null, C_TERMINAL: [], C_OUTCOME: null, C_STATE_FROM_HASH: false,
    C_TP: { col: null, open: 'over' }, C_IP: { col: null, open: 'today' } };
  vm.runInNewContext(fn('function cApplyViewState(place, q) {') + '\ncApplyViewState("people", new URLSearchParams("open=Application")); cApplyViewState("today", new URLSearchParams("open=later")); cApplyViewState("leads", new URLSearchParams("open=week"));'
    + '\nthis.j = C_JP.open; this.t = C_TP.open; this.l = C_IP.open; cApplyViewState("today", new URLSearchParams("")); this.t0 = C_TP.open;', back);
  assert.equal(back.j, 'Application'); assert.equal(back.t, 'later'); assert.equal(back.l, 'week'); assert.equal(back.t0, 'over', 'nothing said: Overdue, the default');
});

// ---- the Due board ----
test('Due on a phone: Overdue open, Due today and Coming up folded to rows with their count; a card above opens its column', () => {
  const task = (id, pid, due) => ({ id, person_id: pid, name: pid, due_at: due, label: 'Call', programme: 'NAV', status: 'Application' });
  const D = { over: [task(1, 'p1', '2026-09-27T09:00:00Z'), task(2, 'p2', '2026-09-28T09:00:00Z')], today: [task(3, 'p3', '2026-10-07T09:00:00Z')], later: [task(4, 'p4', '2026-10-12T09:00:00Z')],
    byId: new Map(), done: () => '<done>' };
  const byPerson = (ts) => ts.map((t) => [t]);
  const groups = [{ id: 'over', label: 'Overdue', rows: byPerson(D.over), tone: 'over' }, { id: 'today', label: 'Due today', rows: byPerson(D.today), tone: 'today' },
    { id: 'later', label: 'Coming up', rows: byPerson(D.later), tone: 'later' }, { id: 'none', label: 'No next step', rows: [], tone: 'none' }];
  const run = (phone, tp = {}) => {
    const ctx = { window: mq(phone), C_TP: { col: null, programme: '', stage: '', source: '', upOpen: false, more: {}, pick: null, open: 'over', ...tp },
      cTodayIso: () => '2026-10-07', cDay: (iso) => String(iso).slice(0, 10), cWhenClass: () => 'over', cDaysLate: () => 1, esc: (s) => String(s ?? ''), fmtDate: (s) => s, cStage: (s) => s, cTask: (s) => s, cStepIcon: () => '', cSisHolds: () => false,
      cTodayPool() { ctx.redrawn = (ctx.redrawn || 0) + 1; }, redrawn: 0 };
    vm.runInNewContext([line('const cPhone = '), APP.match(/const C_TCOL_SHOW = \d+;/)[0], line('const C_ST = '), fn('function cStateLine('), line('const cDdMm = '), fn('function cStepState('),
      fn('function cTodayBoard(D, groups) {'), fn('function cTodayPick('), fn('function cTodayTap('), 'this.html = cTodayBoard(D, groups); this.pick = cTodayPick; this.tapRow = cTodayTap; this.TP = () => C_TP;'].join('\n'), Object.assign(ctx, { D, groups }));
    return ctx;
  };
  const p = run(true);
  assert.match(p.html, /<h3><span class="c-jn">1<\/span>Overdue<b class="c-count over">2<\/b>/, 'Overdue open');
  assert.match(p.html, /class="c-col t-col t-fold" data-col="today" role="button" tabindex="0" aria-label="Due today: 1, open"\s*onclick="cTodayTap\('today'\)"[^>]*><span class="t-foldl">Due today<\/span><b>1<\/b>/, 'Due today folded to its row');
  assert.match(p.html, /class="c-col t-col t-fold c-drop t-drop" data-col="later"[^>]*aria-label="Coming up: 1, open"\s*onclick="cTodayTap\('later'\)"/, 'Coming up folded, still the drop target');
  assert.doesNotMatch(p.html, /data-pid="p3"/, 'no card in a folded column');
  p.pick('today');
  assert.equal(p.TP().open, 'today'); assert.equal(p.TP().col, null); assert.equal(p.redrawn, 1, 'a Needs-you card opens its column, it does not narrow');
  p.tapRow('later'); assert.equal(p.TP().open, 'later'); assert.equal(p.TP().upOpen, true);
  const w = run(false);
  assert.match(w.html, /data-col="today">[\s\S]*data-pid="p3"/, 'wide: Due today is a column of cards');
  assert.doesNotMatch(w.html, /t-fold" data-col="today"/);
  w.pick('today'); assert.equal(w.TP().col, 'today', 'wide: a card narrows, as before');
});

// ---- the Inbox board ----
test('the Inbox on a phone: Today open, the other days folded to rows with their count; a bar opens its day', () => {
  class FixedDate extends Date { static now() { return Date.parse('2026-10-07T15:00:00Z'); } }
  const msg = (id, at) => ({ id, contact_name: 'P' + id, channel: 'gmail', received_at: at, body: 'Hello', fields: [], state: 'new', senderKind: 'possible_student' });
  const rows = [msg(1, '2026-10-07T12:00:00Z'), msg(2, '2026-10-06T12:00:00Z'), msg(3, '2026-10-04T12:00:00Z'), msg(4, '2026-09-20T12:00:00Z')];
  const run = (phone, ip = {}) => {
    const view = { innerHTML: '' };
    const ctx = { window: mq(phone), Date: FixedDate, C_IP: { col: null, channel: '', kind: '', show: 'new', open: 'today', ...ip }, C_LOPEN: null, cTodayIso: () => '2026-10-07', cDay: (iso) => String(iso).slice(0, 10),
      C_IPD: { rows, receipt: '', val: () => '', form: () => '' }, channelLabel: (c) => c, cTelLink: () => '', fmtDateTime: (iso) => iso, cCallLine: (b) => b, esc: (s) => String(s ?? ''),
      cPoolFrame: (o) => o.body, cPoolBand: () => '', cPoolSelect: () => '', cPoolFilters: () => '', $: () => view, cPoolWire() {}, cPoolOpened() {} };
    vm.runInNewContext([line('const cPhone = '), line('const C_IP_KIND = '), fn('function cInboxAge(iso) {'), line('const cAgo = '), line('const C_ST = '), line('const C_ST_RAIL = '), fn('function cStateLine('),
      'var CFG = globalThis.CFG || {};', fn('function cInboxPool() {'), fn('function cInboxPick('), fn('function cInboxTap('), 'cInboxPool(); this.pick = cInboxPick; this.IP = () => C_IP;'].join('\n'), ctx);
    return { html: view.innerHTML, ctx };
  };
  const p = run(true);
  assert.match(p.html, /<h3><span class="c-jn">1<\/span>Today<b>1<\/b><\/h3>/, 'Today open');
  const rowsF = [...p.html.matchAll(/<div class="c-col ib-col is-fold"><button type="button" class="c-foldrow" onclick="cInboxTap\('(\w+)'\)"><span class="c-jn">\d<\/span>([^<]+)<b>(\d+)<\/b><\/button><\/div>/g)].map((m) => [m[1], m[2], Number(m[3])]);
  assert.deepEqual(rowsF, [['yesterday', 'Yesterday', 1], ['week', 'Earlier this week', 1], ['older', 'Older', 1]]);
  assert.doesNotMatch(p.html, /data-id="2"/, 'no card in a folded day');
  const o = run(true, { open: 'older' });
  assert.match(o.html, /<h3><span class="c-jn">4<\/span>Older<b>1<\/b><\/h3>/); assert.match(o.html, /data-id="4"/);
  p.ctx.pick('week'); assert.equal(p.ctx.IP().open, 'week'); assert.equal(p.ctx.IP().col, null, 'a bar opens the day, it does not narrow');
  const w = run(false);
  assert.doesNotMatch(w.html, /is-fold/, 'wide: four columns of cards, as before');
  w.ctx.pick('week'); assert.equal(w.ctx.IP().col, 'week', 'wide: a bar narrows, as before');
});

test('nothing sideways at phone width; the band is the sticky strip; the Help center says it', () => {
  const block = APP.slice(APP.indexOf('/* Q68 THE BOARDS ON A PHONE'), APP.indexOf('html.ui-c .t-fold{cursor:pointer}'));
  assert.match(block, /@media \(max-width:760px\)\{\s*html\.ui-c \.c-cols\{display:block!important;overflow:visible;padding-bottom:0\}/);
  assert.match(block, /html\.ui-c \.c-summary\{position:sticky;top:var\(--p-top,0px\);z-index:19;background:var\(--paper\)/);
  assert.match(block, /html\.ui-c \.c-summary\.is-mini h4,html\.ui-c \.c-summary\.is-mini \.jb-end,html\.ui-c \.c-summary\.is-mini \.jb-outs/, 'compact once scrolled: the bars stay');
  assert.match(block, /html\.ui-c \.ib-board\{display:block!important\}/);
  assert.match(fn('function cJourneyMini('), /if \(!cPhone\(\)\) \{ b\.classList\.remove\('is-mini'\); return; \}/);
  assert.match(fn('function cDrawJourney('), /cPoolWire\(\); cJourneyMini\(\);/, 'the strip is wired on every draw');
  assert.match(HELP.tour.find((t) => t.title === 'Journey').body, /On a phone the stages stack one under the other, one open at a time: tap a bar or a folded stage to open it, and Move on the opened card changes the stage\./);
  assert.match(HELP.tour.find((t) => t.title === 'Due').body, /On a phone the columns stack: tap a card above or a folded column to open it\./);
  assert.match(HELP.tour.find((t) => t.title === 'Inbox').body, /On a phone the days stack: tap a bar or a folded day to open it\./);
});
