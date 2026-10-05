// D-C6, 05.10.2026: the year's target on Home. Ritvars DECIDED Home shows it and kept the bars on the Admitted card
// ("Yes, keep them"). The figures are config: 140 and 70% from "0. NJK KPI 2026.xlsx", sheet Admissions, B2;
// officer programmes = NAV + ENG (Ritvars, 05.10.2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
const BLOCK = APP.slice(APP.indexOf("// ---- THE YEAR'S TARGET (D-C6"), APP.indexOf('// ---- B: TODAY FIRST'));

function load() {
  const ctx = { CFG: CONFIG, esc: (s) => String(s) };
  vm.runInNewContext(BLOCK.replace(/^const /gm, 'var '), ctx);
  return ctx;
}
const person = (programme, at) => ({ programme, admitted_at: at, status: 'Admitted' });
const D = { year: 2026, admitted: [person('NAV', '2026-03-10'), person('ENG', '2026-07-02'), person('MT OS', '2026-07-20'), person('ENG', '2026-09-30')] };

test('the target is config, the officer share and its programmes too', () => {
  const t = CONFIG.targets['2026'];
  assert.equal(t.admitted, 140);
  assert.equal(t.officerPct, 70);
  assert.deepEqual(t.officerProgrammes, ['NAV', 'ENG']);
  assert.match(t.source, /0\. NJK KPI 2026\.xlsx/);
  assert.doesNotMatch(BLOCK.replace(/\/\/[^\n]*/g, ''), /\b(140|98)\b|\b0?\.7\b|70 \/ 100|'NAV'|'ENG'/, 'nothing of the target is written in the code');
});

test('cTarget: 140, and 70% of it = 98 in NAV + ENG, counted from the admitted people', () => {
  const G = load().cTarget(D);
  assert.equal(G.goal, 140);
  assert.equal(G.rows.length, 4);
  assert.equal(G.off.goal, 98);
  assert.equal(G.off.label, 'NAV + ENG');
  assert.equal(G.off.rows.length, 3);
  assert.equal(load().cTarget({ ...D, year: 2027 }), null, 'no target for a year the config does not name');
});

test('each meter fills exactly its share of its own target', () => {
  const html = load().cTargetMeter(load().cTarget(D));
  const widths = [...html.matchAll(/width:([\d.]+)%/g)].map((m) => Number(m[1]));
  assert.deepEqual(widths, [Number((4 / 140 * 100).toFixed(2)), Number((3 / 98 * 100).toFixed(2))]);
  assert.match(html, /<strong>3%<\/strong> of <strong class="ktgt-goal">140</);
  assert.match(html, /NAV \+ ENG<\/span> <strong>3<\/strong> · <strong>3%<\/strong> of <strong class="ktgt-goal">98</);
});

test('the bars are on the Admitted card, always; every target switch is gone', () => {
  const home = APP.slice(APP.indexOf('function cHomeB(D) {'), APP.indexOf('// A stage on Home opens the Journey'));
  assert.match(home, /<div class="khero"><span>Admitted<\/span>[^\n]*\$\{goal \? cTargetMeter\(goal\) : ''\}/);
  assert.doesNotMatch(APP, /cTargetMode|cTargetYear|cTargetMini|get\('target'\)|get\('first'\)|get\('home2'\)|cHome2Mode|cHomeVitals/);
});
