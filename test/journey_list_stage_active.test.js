// Admissions, 16.10.2026: the ACTIVE leads of one programme could not be filtered in Journey -> List; it showed
// everyone, so "who in MTM is active right now?" had no quick answer. The owner: "Lets fix!"
// The List's filter row gets a Stage box right after Programme: All, Active (every open stage: not the two finished
// stages config.stageRoles names, Admitted and Not proceeding), then each stage. It drives the band's own column, so a
// band click and the box agree; each choice carries its count; Clear resets it. Came from moves behind More filters
// to keep three boxes on show at 1440.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const PROTO = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
const HELP = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'help.json'), 'utf8'));
const fn = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const line = (start) => { const i = APP.indexOf(start); assert.ok(i >= 0, start); return APP.slice(i, APP.indexOf('\n', i)); };

function load(people) {
  const view = { innerHTML: '', addEventListener: () => {} };
  const ctx = {
    CFG: { programmes: PROTO.programmes, owners: ['Admissions'], stages: PROTO.stages, stageRoles: PROTO.stageRoles, closedTags: [] },
    C_TERMINAL: ['Admitted', 'Not proceeding'], cTodayIso: () => '2026-10-16', cDay: (s) => String(s || '').slice(0, 10),
    esc: (s) => String(s ?? ''), channelLabel: (c) => c, $: () => view, view, document: { querySelector: () => null },
    cJSort: (ps) => ps, cPoolWire: () => {}, cPoolOpened: () => {}, cPoolViewSwitch: () => '', cReasonBreakdown: () => '',
    cColdGroups: () => '', cPoolFrame: (o) => { ctx.frame = o; return ''; },
    cPoolBand: (name, cols, on) => { ctx.band = { cols, on }; return ''; },
    cPoolRows: (rows) => { ctx.listed = Array.from(rows, (p) => p.id); return ''; },
    C_PCOHORT: null, C_PQ: '', C_PMSG: '', C_PEDIT: null, C_PSCROLL: false, C_JPMORE: false,
    C_OUT_TAG: null, C_OUT_REASON: null, C_OUT_FILTER: null, C_OUTCOME: null, C_JF: {}, C_JF_EMPTY: () => ({}),
  };
  vm.runInNewContext([line('const cWhenClass ='), line('const cNotSaid ='), line('const cTask ='), fn('function groupForAction('),
    line('const cDaysLate ='), line('const cDdMm ='), fn('function cStepState('), fn('function cJourneyMatch('), line('const C_PF_EMPTY ='),
    line('const C_PF_DUE ='), line('const C_PF_DATA ='), line('const C_SIS_HOLDS ='), line('const cSisHolds ='), fn('function cPeopleMatch('),
    APP.slice(APP.indexOf('const cPoolSelect ='), APP.indexOf('function cPoolFrame(')),
    fn('function cJColToBoard('), fn('function cJourneyPick('), fn('function cJourneyStage('), fn('function cDrawJourneyPool('),
    'var C_PF = C_PF_EMPTY(); var C_JP = { col: null, view: "list", open: null };',
    `var C_JPD = { people: ${JSON.stringify(people)}, taskOf: new Map() };`].join('\n').replace(/^const /gm, 'var '), ctx);
  ctx.draw = () => { ctx.cDrawJourneyPool(); return ctx; };
  return ctx.draw();
}
const P = (id, status, programme = 'MT MTM') => ({ id, name: 'P' + id, status, programme, owner: 'Admissions', source_channel: 'email',
  email: id + '@x.lv', created_at: '2026-10-01T09:00:00Z' });
const PEOPLE = [P('1', 'New'), P('2', 'Contacted'), P('3', 'Follow-up'), P('4', 'Follow-up'), P('5', 'Application'),
  P('6', 'Admitted'), P('7', 'Not proceeding'), P('8', 'Follow-up', 'NAV'), P('9', 'Admitted', 'NAV')];
const stageBox = (ctx) => /<span>Stage<\/span><select[^>]*>([\s\S]*?)<\/select>/.exec(ctx.frame.filters)[1];
const opts = (ctx) => [...stageBox(ctx).matchAll(/<option value="([^"]*)"( selected)?>([^<]*)<\/option>/g)].map((m) => ({ v: m[1], on: Boolean(m[2]), t: m[3] }));
const chosen = (ctx) => (opts(ctx).find((o) => o.on) || { v: '' }).v;

test('Active excludes Admitted and Not proceeding, read from config.stageRoles', () => {
  const ctx = load(PEOPLE);
  ctx.cJourneyStage('open');
  assert.equal(ctx.C_PF.stage, 'open');
  assert.equal(ctx.C_JP.col, null, 'no single column');
  assert.deepEqual(ctx.listed, ['1', '2', '3', '4', '5', '8'], 'every open stage, nobody admitted or not proceeding');
  const draw = fn('function cDrawJourneyPool(');
  assert.match(draw, /const closed = roles\.closed \|\| 'Not proceeding', admitted = roles\.admitted \|\| 'Admitted';/, 'the finished stages come from stageRoles');
  assert.match(draw, /const base = active \? all\.filter\(\(p\) => p\.status !== admitted && p\.status !== closed\) : all;/);
});

test('Programme MT MTM + Stage Active = exactly the open MTM people, and the count is on the Active choice', () => {
  const ctx = load(PEOPLE);
  ctx.C_PF.programme = 'MT MTM';
  ctx.cJourneyStage('open');
  assert.deepEqual(ctx.listed, ['1', '2', '3', '4', '5']);
  assert.equal(opts(ctx).find((o) => o.v === 'open').t, 'Active 5', 'the count beside Active');
  assert.equal(chosen(ctx), 'open');
  // the band counts the same five; the finished columns are empty under Active
  const n = Object.fromEntries(ctx.band.cols.map((c) => [c.id, c.n]));
  assert.deepEqual(n, { New: 1, Contacted: 1, 'Follow-up': 2, Application: 1, Admitted: 0, 'Not proceeding': 0 });
  // the other choices keep their own counts under the programme, so Admitted 1 is still there to pick
  assert.deepEqual(opts(ctx).map((o) => [o.v, o.t]), [['', 'All'], ['open', 'Active 5'], ['New', 'New 1'], ['Contacted', 'Contacted 1'],
    ['Follow-up', 'Follow-up 2'], ['Application', 'Submitted application 1'], ['Admitted', 'Admitted 1'], ['Not proceeding', 'Not proceeding 1']]);
});

test('the band click and the Stage box are one setting', () => {
  const ctx = load(PEOPLE);
  ctx.cJourneyPick('Follow-up');                      // a band click
  assert.equal(chosen(ctx), 'Follow-up', 'the box shows the clicked stage');
  assert.equal(ctx.band.on, 'Follow-up');
  assert.deepEqual(ctx.listed, ['3', '4', '8']);
  ctx.cJourneyStage('Application');                   // the box
  assert.equal(ctx.band.on, 'Application', 'the band shows the picked stage');
  assert.equal(ctx.C_JP.col, 'Application');
  ctx.cJourneyStage('open');                          // Active: no band column
  assert.equal(ctx.band.on, null);
  ctx.cJourneyPick('Admitted');                       // a band click replaces Active
  assert.equal(ctx.C_PF.stage, '');
  assert.equal(chosen(ctx), 'Admitted');
  assert.deepEqual(ctx.listed, ['6', '9']);
  ctx.cJourneyPick('Admitted');                       // the second click on the band shows everyone again
  assert.equal(chosen(ctx), '');
  assert.equal(ctx.listed.length, PEOPLE.length);
  ctx.cJourneyStage('');                              // All
  assert.equal(ctx.C_PF.stage, ''); assert.equal(ctx.C_JP.col, null);
});

test('Clear resets the Stage box with the others, and a set Stage shows Clear', () => {
  const ctx = load(PEOPLE);
  assert.doesNotMatch(ctx.frame.filters, /c-jf-clear/, 'nothing set, no Clear');
  ctx.cJourneyPick('New');
  assert.match(ctx.frame.filters, /c-jf-clear/, 'a band column is a filter Clear resets');
  ctx.cJourneyStage('open'); ctx.C_PF.programme = 'MT MTM'; ctx.draw();
  const clear = /class="btn sm ghost c-jf-clear" onclick="([^"]*)"/.exec(ctx.frame.filters)[1];
  vm.runInContext(clear, ctx);
  assert.equal(ctx.C_PF.stage, ''); assert.equal(ctx.C_PF.programme, ''); assert.equal(ctx.C_JP.col, null);
  assert.equal(chosen(ctx), '');
  assert.equal(ctx.listed.length, PEOPLE.length, 'everyone again');
});

test('the row: Programme, Stage, Next step on show; Came from behind More filters, opening it by itself when set', () => {
  const ctx = load(PEOPLE);
  const shown = () => [...ctx.frame.filters.matchAll(/<label class="c-jf[^"]*"><span>([^<]+)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(shown(), ['Programme', 'Stage', 'Next step']);
  ctx.C_PF.source = 'email'; ctx.draw();
  assert.deepEqual(shown(), ['Programme', 'Stage', 'Next step', 'Came from', 'Owner', 'Details', 'Arrived']);
  ctx.C_PF.source = ''; ctx.C_JPMORE = true; ctx.draw();
  assert.deepEqual(shown(), ['Programme', 'Stage', 'Next step', 'Came from', 'Owner', 'Details', 'Arrived']);
});

test('to the Board and back: Active is what the board already shows, so it is let go', () => {
  const ctx = load(PEOPLE);
  ctx.cJourneyStage('open');
  ctx.cJColToBoard();
  assert.equal(ctx.C_PF.stage, '');
});

test('Help says it in one plain sentence', () => {
  const q = HELP.faq.find((f) => f.id === 'active-in-a-programme');
  assert.ok(q, 'the question exists');
  assert.match(q.a, /Programme/); assert.match(q.a, /Stage to Active/); assert.match(q.a, /Admitted or Not proceeding/);
  assert.equal(q.a.split(/[.!?](\s|$)/).filter((x) => x && x.trim()).length, 1, 'one sentence');
});
