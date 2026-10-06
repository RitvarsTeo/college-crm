// BENCHMARKS on Reports > Conversion, variant A (the owner picked it 06.10.2026): our matured step rate as a dot on the
// grey "typical" band, the value above, the working (a -> b) under the name, a small source label under the band.
// Pinned here: a drawn benchmark always has its source; values come only from config; our dot is the server's figure;
// the dot and the working open exactly the people they count.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { report, maturedSteps, periodOf } from '../src/reports.js';
import { localDate } from '../src/bizday.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
const line = (start) => { const i = APP.indexOf(start); assert.ok(i >= 0, start); return APP.slice(i, APP.indexOf('\n', i)); };
const BLOCK = APP.slice(APP.indexOf('// ---------------------------------------------------- FULL REPORT, ONE LEVEL DEEPER (Q35)'),
  APP.indexOf('// apply.novikontas.org, from the SIS'));
const DAY = 86400000;
const ago = (d) => new Date(Date.now() - d * DAY).toISOString();
const NEEDS = ['definition', 'source', 'url', 'year', 'region', 'confidence'];

function load(cfg = CFG) {
  const ctx = {
    CFG: cfg, location: { hash: '#/reports' }, C_RPT_PRESET: 'year', RPT: { from: '', to: '' }, C_PCOHORT: null, C_PF: {}, C_PQ: '', C_PEDIT: null, C_PMSG: '', C_PTAB: 'journey',
    C_PF_EMPTY: () => ({}), viewJourneyPool() {}, C_JP: { col: null, view: 'board' }, C_STAGE_OF: new Map(),
    C_OUT_TAG: null, C_OUT_REASON: null, C_OUT_FILTER: null, C_JF_EMPTY: () => ({ stage: [] }), cPoolRouteJourney() {},
    esc: (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
    cDay: (iso) => String(iso || '').slice(0, 10),
    cStage: (id) => ((CFG.stages || []).find((s) => s.id === id) || {}).label || id || '',
    cChannel: (c) => [c || 'Not recorded', ''], cSheetNotice: () => '', cTodayIso: () => localDate(),
    cScopeWord: () => localDate().slice(0, 4), cScopeDates: () => [localDate().slice(0, 4) + '-01-01', ''],
  };
  vm.runInNewContext([line('const C_MONTHS ='), line('const C_TERMINAL ='), BLOCK,
    'this.X = { cRepModel, cRepHtml, cRepBench, cRepBenchRows, getCoh: () => C_REP_COH, setCoh: (c) => { C_REP_COH = c; } };'].join('\n'), ctx);
  return ctx;
}

// people: [id, daysAgo, status now, admitted?, stages they were moved to (History)]
async function dataset(rows) {
  const db = await openDb(':memory:');
  for (const [id, d, status, admitted, moved = []] of rows) {
    await db.prepare(`INSERT INTO people (id,name,status,owner,source_channel,created_at,last_contact_at,admitted_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run(id, 'Test ' + id, status, 'Admissions', 'website', ago(d), ago(d), admitted ? ago(d - 30) : null);
    let from = 'New';
    for (const to of moved) {
      await db.prepare(`INSERT INTO events (person_id,kind,direction,occurred_at,subject,body,actor,origin,field,old_value,new_value)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id, 'status', 'note', ago(d - 1), `Status: ${from} -> ${to}`, '', 'Admissions', 'manual', 'status', from, to);
      from = to;
    }
  }
  return db;
}
const YEAR_TO_TODAY = () => ({ from: '2000-01-01', to: localDate() });
const ROWS = [
  // matured (60+ days)
  ['m1', 200, 'Admitted', true, ['Application', 'Contract', 'Admitted']],
  ['m2', 150, 'Not proceeding', false, ['Application', 'Contract', 'Not proceeding']],   // reached Contract, then stopped
  ['m3', 120, 'Not proceeding', false, ['Contacted', 'Application', 'Not proceeding']],   // reached Application only
  ['m4', 100, 'Contacted', false, ['Contacted']],
  ['m5', 90, 'Contract', false, ['Application', 'Contract']],
  ['m6', 70, 'New', false],
  // too young to count
  ['y1', 20, 'Application', false, ['Application']],
  ['y2', 5, 'Admitted', true, ['Application', 'Contract', 'Admitted']],
];

test('config: every benchmark carries its value, definition and full source, next to targets', () => {
  const keys = Object.keys(CFG);
  assert.equal(keys.indexOf('benchmarks'), keys.indexOf('targets') + 2, 'beside targets (after its _note)');
  assert.equal(CFG.benchmarks.minN, 20);
  const rows = CFG.benchmarks.rows;
  assert.deepEqual(rows.map((b) => [b.id, b.step, b.low, b.high]), [
    ['lead_to_application', 'leadToApplication', 15, 35], ['contract_to_admitted', 'contractToAdmitted', 88, 93]]);
  for (const b of rows) {
    for (const f of NEEDS) assert.ok(b[f] != null && String(b[f]).trim(), `${b.id}: ${f}`);
    assert.match(b.url, /^https:\/\//, b.id);
    assert.match(b.source, /Noel-Levitz, 2010/);
    assert.equal(b.year, 2010);
  }
});

test('a benchmark without its source is never drawn, and the page holds no benchmark value of its own', () => {
  const { X } = load();
  const steps = { leadToApplication: { of: 30, pct: 40, ofIds: [], reachedIds: [] }, contractToAdmitted: { of: 5, pct: 80, ofIds: [], reachedIds: [] } };
  assert.equal(X.cRepBenchRows(steps, CFG.benchmarks).length, 2);
  for (const f of NEEDS) {
    const bad = { ...CFG.benchmarks, rows: CFG.benchmarks.rows.map((b, i) => (i === 0 ? { ...b, [f]: '' } : b)) };
    assert.deepEqual(X.cRepBenchRows(steps, bad).map((x) => x.b.id), ['contract_to_admitted'], `no ${f}: not drawn`);
  }
  assert.equal(X.cRepBenchRows({}, CFG.benchmarks).length, 0, 'no server figure: not drawn');
  // values live in config only
  const page = APP.slice(APP.indexOf('const C_BENCH_NEEDS'), APP.indexOf('// One figure, drawn as the click to its people.'));
  for (const hard of ['15', '35', '88', '93', 'Noel', '2010', 'typical colleges']) assert.ok(!page.includes(hard), 'hard-coded: ' + hard);
});

test('server: the step rates count matured people who EVER reached the stage, from History too', async () => {
  const db = await dataset(ROWS);
  const s = (await maturedSteps(db, periodOf(YEAR_TO_TODAY().from, YEAR_TO_TODAY().to))).steps;
  assert.deepEqual([s.leadToApplication.of, s.leadToApplication.reached, s.leadToApplication.pct], [6, 4, 66.7],
    'm1 m2 m3 m5 reached Application (m2 m3 stopped later); y1 y2 are too young');
  assert.deepEqual(s.leadToApplication.reachedIds, ['m1', 'm2', 'm3', 'm5']);
  assert.deepEqual([s.contractToAdmitted.of, s.contractToAdmitted.reached, s.contractToAdmitted.pct], [3, 1, 33.3], 'm1 m2 m5 reached Contract; m1 admitted');
  assert.deepEqual(s.contractToAdmitted.ofIds, ['m1', 'm2', 'm5']);
  const r = await report(db, YEAR_TO_TODAY());
  assert.deepEqual(r.steps.leadToApplication.reachedIds, s.leadToApplication.reachedIds, 'the report carries the same figure');
});

test('the page: our dot is the server figure; the track (dot) and the working open exactly its people; "~" and hollow under minN', async () => {
  const db = await dataset(ROWS);
  const r = await report(db, YEAR_TO_TODAY());
  const people = await db.prepare('SELECT * FROM people').all();
  const ctx = load();
  const M = ctx.X.cRepModel(r, people, CFG, localDate());
  const B = M.conversion.bench;
  assert.deepEqual(B.map((x) => [x.b.id, x.pct, x.few]), [['lead_to_application', 66.7, true], ['contract_to_admitted', 33.3, true]]);
  for (const x of B) {
    const s = r.steps[x.b.step];
    assert.equal(x.pct, s.pct, 'dot = server');
    assert.deepEqual([...M.coh[x.won.k].ids], s.reachedIds, 'the dot opens who reached');
    assert.deepEqual([...M.coh[x.base.k].ids], s.ofIds, 'the working opens the base');
  }
  const html = ctx.X.cRepBench(B);
  const row = (id) => html.slice(html.indexOf(`data-bench="${id}"`), html.indexOf('</div></div>', html.indexOf(`data-bench="${id}"`)));
  const a = row('lead_to_application');
  assert.match(a, /<b>Lead to application<\/b><small><a class="rp-go"[^>]*data-coh="(q\d+)"[^>]*>6<\/a> &rarr; <a class="rp-go"[^>]*>4<\/a><\/small>/, 'working in word order, both open their people');
  assert.match(a, /<span class="bm-band" style="left:15%;width:20%"><\/span>/);
  assert.match(a, />15-35% typical<small>US 4-year colleges, 2010<\/small>/);
  const won = B[0].won.k;
  assert.match(a, new RegExp(`<div class="bm-trackbox" tabindex="0" role="button" data-coh="${won}" data-kgo="cohort\|${won}" data-tip="Lead to application\|~66.7%\|15-35% typical · US 4-year colleges, 2010">`),
    'the whole track, dot included, is one click to the people the dot counts');
  assert.match(a, /<span class="bm-dot few" style="left:66.7%" data-v="~66.7%"><b>~66.7%<\/b><i><\/i><\/span>/, 'hollow and "~" under minN');
  assert.match(a, /<span class="bm-end bm-0">0<\/span><span class="bm-end bm-100">100%<\/span>/, 'the track says its scale');
  // enough people: solid dot, no "~"
  const many = ctx.X.cRepBench([{ ...B[0], few: false }]);
  assert.match(many, /<span class="bm-dot" style="left:66.7%" data-v="66.7%"><b>66.7%<\/b>/);
  // nobody matured: no dot, the band still there
  const none = ctx.X.cRepBench([{ ...B[0], pct: null }]);
  assert.ok(!none.includes('bm-dot') && none.includes('bm-band'));
});

test('on Reports > Conversion, above Where the rest are now, the old Reached block gone; colours from the metric palette, light and dark', async () => {
  assert.match(APP, /return `\$\{cRepBench\(C\.bench\)\}<div class="c-rgrid">\$\{cRepBlock\('Where the rest are now'/);
  assert.ok(!APP.includes("cRepBlock('Reached'") && !APP.includes('reachedApplication'), 'the old Reached block is gone: one figure, not two (06.10)');
  const css = APP.slice(APP.indexOf('/* BENCHMARKS on Reports > Conversion'), APP.indexOf('@media (max-width:700px){ html.ui-c .bm-row'));
  assert.match(css, /\.bm-dot i\{[^}]*background:#29a8df/);
  assert.match(css, /html\.ui-c\{--bm-band:#c9d3de;--bm-ring:#fff\}/);
  const dark = [...APP.matchAll(/html\.ui-c\[data-theme="dark"\]\{([^}]*)\}/g)].map((m) => m[1]);
  assert.equal(dark.length, 1, 'inside the one dark palette');
  assert.match(dark[0], /--bm-band:#3f5f80;--bm-ring:var\(--surface\)/);
  assert.ok(!/<p[ >]/.test(load().X.cRepBench([{ b: CFG.benchmarks.rows[0], few: false, pct: 40, base: { k: 'q1', n: 10 }, won: { k: 'q2', n: 4 } }])), 'no paragraphs');
});
