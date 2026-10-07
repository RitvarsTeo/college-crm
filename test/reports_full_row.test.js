// NO EMPTY HALF ON REPORTS (the owner, 07.10.2026: "Reports: fill the empty half" -> "Yes"). A chapter whose two-column
// grid holds an odd number of blocks left the last one alone with an empty right half (Conversion's By channel, Leads'
// Nationality). The lone last block now takes the whole row; nothing is added to fill the space. This file RUNS
// cRepBody on the synthetic data for every chapter and holds each grid's blocks to the rule.
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

function load() {
  const ctx = {
    CFG, location: { hash: '#/reports' }, C_RPT_PRESET: 'year', RPT: { from: '', to: '' }, C_PCOHORT: null, C_PF: {}, C_PQ: '', C_PEDIT: null, C_PMSG: '', C_PTAB: 'journey',
    C_PF_EMPTY: () => ({}), viewJourneyPool() {}, C_JP: { col: null, view: 'board' }, C_STAGE_OF: new Map(),
    C_OUT_TAG: null, C_OUT_REASON: null, C_OUT_FILTER: null, C_JF_EMPTY: () => ({ stage: [] }), cPoolRouteJourney() {},
    esc: (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
    cDay: (iso) => String(iso || '').slice(0, 10),
    cStage: (id) => ((CFG.stages || []).find((s) => s.id === id) || {}).label || id || '',
    cChannel: (c) => [c || 'Not recorded', ''], cSheetNotice: () => '', cTodayIso: () => localDate(),
    cScopeWord: () => String(Y()), cScopeDates: () => [Y() + '-01-01', ''],
    cScopeList: () => [Y()], cScopeAllYears: () => [Y()], cNowYear: Y,
    C_SCOPE_YEARS: [], C_MONTHS_LONG: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  };
  vm.runInNewContext([line('const C_MONTHS ='), line('const C_TERMINAL ='), BLOCK, 'this.X = { cRepModel, cRepBody };'].join('\n'), ctx);
  return ctx;
}

// the top-level blocks inside each <div class="c-rgrid">, counted on the drawn HTML
function grids(html) {
  const out = [];
  let i = html.indexOf('<div class="c-rgrid">');
  while (i >= 0) {
    let depth = 0, j = i, blocks = 0;
    const tag = /<(\/?)(div|section)\b[^>]*>/g;
    tag.lastIndex = i;
    for (let m = tag.exec(html); m; m = tag.exec(html)) {
      if (m[1]) { depth -= 1; if (depth === 0) { j = tag.lastIndex; break; } }
      else { depth += 1; if (depth === 2 && m[2] === 'section') blocks += 1; }
    }
    out.push(blocks);
    i = html.indexOf('<div class="c-rgrid">', j);
  }
  return out;
}

test('the rule: a lone last block in a two-column report grid takes the whole row, on every screen width', () => {
  assert.match(APP, /html\.ui-c \.c-rgrid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\);gap:6px 34px\}\n  \/\* NO EMPTY HALF[\s\S]*?\*\/\n  html\.ui-c \.c-rgrid > :last-child:nth-child\(odd\)\{grid-column:1 \/ -1\}/);
  // a phone is one column already: the rule changes nothing there
  assert.match(APP, /@media \(max-width:900px\)\{ html\.ui-c \.c-rgrid\{grid-template-columns:1fr\} \}/);
});

test('every chapter, drawn from the synthetic data: the odd grids are the ones the rule fills, nothing was added', async () => {
  const db = await openDb(':memory:');
  await seed(db);
  const people = await db.prepare('SELECT * FROM people').all();
  const ctx = load();
  for (const period of [{ years: [Y()] }, { years: [Y() - 1, Y()] }, { from: `${Y()}-09-01`, to: `${Y()}-09-30` }]) {
    const r = await report(db, period);
    const M = ctx.X.cRepModel(r, people, CFG, localDate());
    const counts = Object.fromEntries(['admitted', 'leads', 'conversion', 'median'].map((id) => [id, grids(ctx.X.cRepBody(id, M))]));
    assert.deepEqual(counts, { admitted: [2], leads: [5], conversion: [3], median: [2] },
      'the same blocks as before the fix, in every period: Leads and Conversion end on a lone block, which now spans the row');
    assert.match(ctx.X.cRepBody('conversion', M), /<div class="c-rgrid"><section class="ksec rp-block"><div class="ksh"><h2>Where the rest are now<\/h2>[\s\S]*<h2>By programme<\/h2>[\s\S]*<h2>By channel<\/h2>/,
      'Conversion keeps its order: By channel is the last block, the one that takes the row');
  }
});
