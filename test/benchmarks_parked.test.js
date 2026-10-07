// THE BENCHMARKS ARE PARKED (the owner, 07.10.2026: "from full reports lets just keep it very far backlog the industry
// benchmarks, they will not be in the final github push for quite a time"). ONE switch, config benchmarks.on false: Reports
// draws no benchmark row on any tab, phone or desktop; the code, the config values and the sources stay, parked. The
// first-reply RECORDING (the Gmail thread read, the PBX destination counts) is not touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { seed } from '../src/seed.js';
import { report } from '../src/reports.js';
import { localDate } from '../src/bizday.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
const line = (start) => { const i = APP.indexOf(start); assert.ok(i >= 0, start); return APP.slice(i, APP.indexOf('\n', i)); };
const BLOCK = APP.slice(APP.indexOf('// ---------------------------------------------------- FULL REPORT, ONE LEVEL DEEPER (Q35)'),
  APP.indexOf('// apply.novikontas.org, from the SIS'));
const Y = () => Number(localDate().slice(0, 4));

test('one switch, off; the rows, their values and sources are kept', () => {
  assert.equal(CFG.benchmarks.on, false);
  assert.match(CFG.benchmarks._on, /very far backlog the industry benchmarks/);
  assert.deepEqual(CFG.benchmarks.rows.map((b) => b.id), ['lead_to_application', 'contract_to_admitted', 'first_reply'], 'parked, not dropped');
  for (const b of CFG.benchmarks.rows) assert.ok(b.source && b.url && b.definition, b.id);
  assert.match(APP, /if \(\(bench \|\| \{\}\)\.on === false\) return \[\];/);
});

test('cRepBody for Conversion, RUN on the synthetic data in three periods: no benchmark row', async () => {
  const db = await openDb(':memory:');
  await seed(db);
  const people = await db.prepare('SELECT * FROM people').all();
  const ctx = {
    CFG, location: { hash: '#/reports' }, C_RPT_PRESET: 'year', RPT: { from: '', to: '' }, C_PCOHORT: null, C_PF: {}, C_PQ: '', C_PEDIT: null, C_PMSG: '', C_PTAB: 'journey',
    C_PF_EMPTY: () => ({}), viewJourneyPool() {}, C_JP: { col: null, view: 'board' }, C_STAGE_OF: new Map(),
    C_OUT_TAG: null, C_OUT_REASON: null, C_OUT_FILTER: null, C_JF_EMPTY: () => ({ stage: [] }), cPoolRouteJourney() {},
    esc: (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
    cDay: (iso) => String(iso || '').slice(0, 10), cStage: (id) => id, cChannel: (c) => [c || 'Not recorded', ''], cSheetNotice: () => '', cTodayIso: () => localDate(),
    cScopeWord: () => String(Y()), cScopeDates: () => [Y() + '-01-01', ''], cScopeList: () => [Y()], cScopeAllYears: () => [Y()], cNowYear: Y,
    C_SCOPE_YEARS: [], C_MONTHS_LONG: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  };
  vm.runInNewContext([line('const C_MONTHS ='), line('const C_TERMINAL ='), BLOCK, 'this.X = { cRepModel, cRepBody };'].join('\n'), ctx);
  for (const period of [{ years: [Y()] }, { years: [Y() - 1, Y()] }, { from: `${Y()}-09-01`, to: `${Y()}-09-30` }]) {
    const r = await report(db, period);
    assert.ok(r.steps.leadToApplication, 'the server still computes the step rates: only the display is parked');
    const M = ctx.X.cRepModel(r, people, CFG, localDate());
    assert.equal(M.conversion.bench.length, 0);
    const body = ctx.X.cRepBody('conversion', M);
    assert.doesNotMatch(body, /bm-row|class="bm"|typical/, 'no benchmark row, band or label');
    assert.match(body, /^<div class="c-rgrid"><section class="ksec rp-block"><div class="ksh"><h2>Where the rest are now<\/h2>/, 'the tab opens on its own blocks');
    for (const id of ['admitted', 'leads', 'median']) assert.doesNotMatch(ctx.X.cRepBody(id, M), /bm-row/, id);
  }
  await db.close();
});

test('the first-reply RECORDING stays on: the thread read and the phone counts are untouched', () => {
  const SYNC = fs.readFileSync(path.join(ROOT, 'src', 'sync.js'), 'utf8');
  assert.match(SYNC, /try \{ replies = await syncReplies\(db, \{ now, env, fetchImpl, refreshToken \}\); \}/);
  assert.match(SYNC, /\{ pieces, fetched, kept, skipped, destinations, \.\.\.out \}/);
});
