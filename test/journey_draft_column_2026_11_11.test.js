// THE JOURNEY COLUMN "DRAFT IN SIS" (the owner 11.11.2026, "Yes, build it", on the admissions team's feedback: a form begun in the SIS
// is not yet anything to call about). Between Follow-up and Submitted application, unnumbered, its own count, clickable
// like every column; whoever is a draft in the SIS sits there whatever their stage says (people moved to Application by
// hand included); Admitted and Not proceeding stay at the ends. Every column's count equals the people its click keeps,
// and the active total, Arrived, Admitted and Not proceeding do not change. Runs the page's own code on known people.
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

function page(stageFilter = []) {
  const ctx = { CFG: CONFIG, esc: (s) => String(s ?? ''), Math, C_JF: { stage: stageFilter }, cTodayIso: () => '2026-11-11',
    cDay: (iso) => String(iso).slice(0, 10), cTask: (l) => l, groupForAction: () => null, cNotSaid: '(not said)',
    cWhenClass: (iso) => (iso === 'over' ? 'over' : iso === 'today' ? 'today' : '') };
  vm.runInNewContext([line('const cDaysLate = '), line('const C_SIS_HOLDS = '), line('const cSisHolds = '), line('const C_ST = '), line('const cDdMm = '),
    fn('function cStepState('), line('const cIsDraft ='), line('const C_JDRAFT ='), line('const cJStage ='), fn('function cJStagesOpen('),
    line('const cJNum ='), line('const C_TERMINAL ='), line('const C_ST_GROUPS = '), fn('function cJourneyBand('), fn('function cJourneyMatch('),
    'this.band = cJourneyBand; this.match = cJourneyMatch; this.stages = cJStagesOpen; this.stageOf = cJStage;'].join('\n'), ctx);
  return ctx;
}
// the live shape of 11.11.2026, small: drafts at New, Follow-up and Application (one moved there by hand), a draft already
// closed, a submitted applicant, and people with no SIS at all
const P = (id, status, draft = 0, due = null) => ({ id, status, sis_draft: draft, due });
const PEOPLE = [P('n1', 'New'), P('n2', 'New', 1), P('c1', 'Contacted'), P('f1', 'Follow-up', 0, 'over'), P('f2', 'Follow-up', 1, 'over'),
  P('a1', 'Application'), P('a2', 'Application', 1), P('a3', 'Application', 1), P('x1', 'Not proceeding', 1), P('ad1', 'Admitted')];
const OPEN = PEOPLE.filter((p) => !['Admitted', 'Not proceeding'].includes(p.status));
const TASKS = new Map(PEOPLE.filter((p) => p.due).map((p) => [p.id, { due_at: p.due }]));
const OUT = { adm: 1, np: 1, admLabel: 'Admitted', npLabel: 'Not proceeding', unrecorded: 0, arrived: 10, year: 2026, play: false };
const cells = (html) => html.split('class="jb-cell"').slice(1).map((c) => ({
  v: /data-v="([^"]+)"/.exec(c)[1], n: Number(/class="jb-n">(\d+)/.exec(c)[1]), num: /<span class="c-jn">([^<]+)<\/span>/.exec(c)[1] }));
const EMPTY = { programme: [], due: [], owner: [], source: [], stage: [], group: [], step: [] };

test('the column sits between Follow-up and Submitted application, unnumbered; the steps keep 1..n', () => {
  const ctx = page();
  const ids = ctx.stages().map((s) => s.id);
  const app = CONFIG.stageRoles.application;
  assert.equal(ids[ids.indexOf(app) - 1], 'Draft in SIS');
  assert.equal(ids[ids.indexOf('Draft in SIS') - 1], 'Follow-up');
  const got = cells(ctx.band(OPEN, TASKS, ctx.stages(), () => '', OUT));
  assert.deepEqual(got.map((c) => c.num), ['1', '2', '3', '·', '4'].slice(0, got.length));
});

test('every column counts exactly the people its click keeps; the active total and the ends do not change', () => {
  const ctx = page();
  const got = cells(ctx.band(OPEN, TASKS, ctx.stages(), () => '', OUT));
  const counts = Object.fromEntries(got.map((c) => [c.v, c.n]));
  assert.deepEqual(counts, { New: 1, Contacted: 1, 'Follow-up': 1, 'Draft in SIS': 4, Application: 1 });
  for (const c of got) {
    const kept = OPEN.filter((p) => ctx.match(p, TASKS.get(p.id), { ...EMPTY, stage: [c.v] }));
    assert.equal(kept.length, c.n, c.v + ': the click opens the people the column counts');
  }
  assert.equal(got.reduce((a, c) => a + c.n, 0), OPEN.length, 'the active total is unchanged: nobody hidden, nobody twice');
  const html = ctx.band(OPEN, TASKS, ctx.stages(), () => '', OUT);
  assert.match(html, /<span>Admitted<\/span><b>1<\/b>/);
  assert.match(html, /<span>Not proceeding<\/span><b>1<\/b>/, 'a closed draft stays closed, at the end');
  assert.match(html, /<span>Arrived<\/span><b>10<\/b>/);
  assert.equal(ctx.stageOf(PEOPLE.find((p) => p.id === 'x1')), 'Not proceeding');
  assert.equal(ctx.stageOf(PEOPLE.find((p) => p.id === 'a2')), 'Draft in SIS', 'moved to Application by hand, still a draft: the draft column');
});

test('a draft is never red: its overdue step counts on track in the draft column', () => {
  const ctx = page();
  const html = ctx.band(OPEN, TASKS, ctx.stages(), () => '', OUT);
  const draftCell = html.split('class="jb-cell"').find((c) => c.includes('data-v="Draft in SIS"'));
  assert.doesNotMatch(draftCell, /jb-s-need/, 'no red segment');
  const fu = html.split('class="jb-cell"').find((c) => c.includes('data-v="Follow-up"'));
  assert.match(fu, /jb-s-need/, 'the real overdue one is still red');
});

test('the board: the column is drawn, a card dropped on it moves nobody, and the stage itself is never written as "Draft in SIS"', () => {
  const draw = fn('function cDrawJourney() {');
  assert.match(draw, /const stages = \[\.\.\.cJStagesOpen\(\),/);
  assert.match(draw, /if \(!p \|\| col\.dataset\.stage === C_JDRAFT \|\| p\.status === col\.dataset\.stage\) return;/);
  assert.match(fn('function cDrawJourneyPool() {'), /const stages = cJStagesOpen\(\);/, 'the list view has the same column and Stage choice');
  assert.doesNotMatch(APP, /status:\s*C_JDRAFT|status = C_JDRAFT/, 'never saved as a stage');
});
