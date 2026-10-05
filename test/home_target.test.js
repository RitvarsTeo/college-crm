// D-C6 / Q13, 05.10.2026: the year's target on Home. Ritvars DECIDED Home shows it; HOW is an A/B he has
// not picked (?target=a in the Admitted card, ?target=b the year against it), so with no switch Home is
// unchanged. The figures are config: 140 and 70% from "0. NJK KPI 2026.xlsx", sheet Admissions, B2;
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

function load(search = '') {
  const ctx = { CFG: CONFIG, C_MONTHS: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    esc: (s) => String(s), cTodayIso: () => '2026-10-05', cDay: (d) => String(d || '').slice(0, 10),
    location: { search }, URLSearchParams };
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

test('the switch: only ?target=a|b|c|d; with none Home is unchanged', () => {
  assert.equal(load('').cTargetMode(), '');
  assert.equal(load('?target=a').cTargetMode(), 'a');
  assert.equal(load('?target=b').cTargetMode(), 'b');
  assert.equal(load('?target=c').cTargetMode(), 'c');
  assert.equal(load('?target=d').cTargetMode(), 'd');
  assert.equal(load('?target=e').cTargetMode(), '');
  const home = APP.slice(APP.indexOf('function cHomeB(D) {'), APP.indexOf('// A stage on Home opens the Journey'));
  assert.match(home, /\$\{tmode === 'a' && goal \? cTargetMeter\(goal\) : ''\}/);
  assert.match(home, /\$\{tmode === 'b' && goal \? cTargetYear\(D, goal\) : ''\}/);
  assert.match(home, /\$\{tmode === 'c' && goal \? cTargetYear\(D, goal\) : ''\}\s*<div class="kthree">/, 'C: the year card under Admissions by month');
  assert.match(home, /\$\{tmode === 'd' && goal \? cTargetMini\(goal, D\.year\) : ''\}/, 'D: the compact card under Needs you');
  assert.equal((home.match(/cTargetMeter\(|cTargetYear\(|cTargetMini\(/g) || []).length, 4, 'drawn nowhere else on Home');
});

test('A: each meter fills exactly its share of its own target', () => {
  const html = load('?target=a').cTargetMeter(load().cTarget(D));
  const widths = [...html.matchAll(/width:([\d.]+)%/g)].map((m) => Number(m[1]));
  assert.deepEqual(widths, [Number((4 / 140 * 100).toFixed(2)), Number((3 / 98 * 100).toFixed(2))]);
  assert.match(html, /<strong>3%<\/strong> of <strong class="ktgt-goal">140</);
  assert.match(html, /NAV \+ ENG<\/span> <strong>3<\/strong> · <strong>3%<\/strong> of <strong class="ktgt-goal">98</);
});

test('B: cumulative columns on ONE baseline, both target lines on the same scale', () => {
  const svg = load('?target=b').cTargetYear(D, load().cTarget(D));
  const rects = [...svg.matchAll(/<rect x="[\d.]+" y="([\d.]+)" width="[\d.]+" height="([\d.]+)"/g)].map((m) => Number(m[1]) + Number(m[2]));
  assert.ok(rects.length > 0);
  assert.ok(rects.every((b) => Math.abs(b - rects[0]) < 1e-6), 'every column stands on the same baseline');
  const lines = [...svg.matchAll(/<line x1="[\d.]+" x2="[\d.]+" y1="([\d.]+)" y2="[\d.]+" class="ktgt-line/g)].map((m) => Number(m[1]));
  assert.equal(lines.length, 2, 'the 140 line and the 98 line');
  const base = rects[0], top = 14;
  // y(v) = top + (base - top) * (1 - v / max): the two lines sit at 140 and 98 on that scale
  const max = 150, y = (v) => top + (base - top) * (1 - v / max);
  assert.ok(Math.abs(lines[0] - y(140)) < 1e-6 && Math.abs(lines[1] - y(98)) < 1e-6);
  assert.match(svg, /<title>Oct: 4 admitted so far<\/title>/);
  assert.match(svg, /<title>Oct: 3 admitted in NAV \+ ENG so far<\/title>/);
  assert.doesNotMatch(svg, /Nov: |Dec: /, 'no column for a month that has not happened');
  assert.doesNotMatch(svg, /\bm-scene\b/, 'no third scene on Home (KB 08 P5: two per tab)');
  assert.match(svg, /<section class="ksec c-sheet ktgt-sec">/, 'a card through the shared CARDS 3 rule, not a rule of its own');
});

test('D: compact, one column per target, the share filled exactly', () => {
  const html = load('?target=d').cTargetMini(load().cTarget(D), 2026);
  assert.match(html, /<h2>Target 2026<\/h2>/);
  assert.match(html, /<span>Admitted<\/span>\s*<b>4<em> \/ 140<\/em><\/b>/);
  assert.match(html, /<span>NAV \+ ENG<\/span>\s*<b>3<em> \/ 98<\/em><\/b>/);
  const widths = [...html.matchAll(/width:([\d.]+)%/g)].map((m) => Number(m[1]));
  assert.deepEqual(widths, [Number((4 / 140 * 100).toFixed(2)), Number((3 / 98 * 100).toFixed(2))]);
});

test('?first=kpi puts the four cards above Needs you; without it Needs you stays first (his 02.10 pick)', () => {
  const home = APP.slice(APP.indexOf('function cHomeB(D) {'), APP.indexOf('// A stage on Home opens the Journey'));
  assert.match(home, /\$\{first === 'kpi' \? kpis \+ needsYou : needsYou \+ kpis\}/);
});
