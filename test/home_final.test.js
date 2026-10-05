// Q20, the owner 05.10.2026: "Todays, but without the admitted by programme. So nothing after Admissions by months
// below it. AAAAANd lets have a fix for the black space below needs you card." Home ends with the Admissions by
// month row (the donut stays beside it). Nothing is lost: by programme and where admitted people came from live in
// Reports. The gap under Needs you: he picked option 1, the journey in two columns.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fnBody = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };

test('Home ends with the Admissions by month row; the donut stays, the bar sections are gone', () => {
  const home = fnBody('function cHomeB(D) {');
  assert.match(home, /\$\{cHomeMonths\(D\)\}/);
  assert.match(home, /<h2>Where everyone is now<\/h2>/);
  assert.doesNotMatch(home, /kthree|Admitted by programme|Where admitted people came from|cBars\(/);
  assert.doesNotMatch(APP, /const cHomeProg|const cHomeChan/);
  assert.equal((home.match(/\bm-scene\b/g) || []).length, 2, 'two scenes (KB 08 P5)');
});

test('nothing lost: Reports has By programme and, for good, Where admitted people came from; no Cold or reject there', () => {
  const rep = fnBody('async function viewReportsC() {');
  assert.match(rep, /<h2>By programme<\/h2>/);
  assert.match(rep, /\$\{cAdmittedFrom\(everyone, r\.period, bars\)\}/);
  assert.doesNotMatch(APP, /<h2>Cold or reject<\/h2>|cReportHome2/, 'cold / reject lives in Outcomes');
  const ctx = {};
  vm.runInNewContext(fnBody('function cAdmittedFrom(').replace(/^function /, 'var cAdmittedFrom = function '), ctx);
  const bars = (key, rows) => `[${key}:${rows.map((r) => r.value + '=' + r.count).join(',')}]`;
  const people = [
    { status: 'Admitted', admitted_at: '2026-03-01T10:00:00.000Z', source_channel: 'phone' },
    { status: 'Admitted', admitted_at: '2026-05-01T10:00:00.000Z', source_channel: 'phone' },
    { status: 'Admitted', admitted_at: '2026-05-02T10:00:00.000Z' },
    { status: 'Admitted', admitted_at: '2025-05-01T10:00:00.000Z', source_channel: 'website' },   // before the period
    { status: 'New', source_channel: 'phone' }];
  const out = ctx.cAdmittedFrom(people, { from: '2025-12-31T22:00:00.000Z', to: '2026-12-31T22:00:00.000Z' }, bars);
  assert.match(out, /<h2>Where admitted people came from<\/h2>.*\[source:phone=2,\(not recorded\)=1\]/s, 'admitted in the period, by channel, a gap said as a gap');
});

test('no empty band under Needs you: the journey in two columns; no switch left', () => {
  const home = fnBody('function cHomeB(D) {');
  assert.match(home, /<section class="kday kday-fit m-scene" aria-label="Needs you">/);
  assert.doesNotMatch(APP, /get\('gap'\)|\.gap-1|\.gap-2/, 'the A/B switch and option 2 are gone');
  assert.match(APP, /html\.ui-c \.kday\.kday-fit\{align-items:stretch;grid-template-columns:minmax\(0,1fr\) 340px\}/, 'both cards end on one line');
  assert.match(APP, /html\.ui-c \.kday-fit \.kday-side\{display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/, 'two columns of stages');
  assert.match(APP, /@media \(max-width:1100px\)\{ html\.ui-c \.kday,html\.ui-c \.kday\.kday-fit\{grid-template-columns:minmax\(0,1fr\)\}/, 'one column on a narrow screen');
});

test('Reports keeps its place in the menu; no switch moves it', () => {
  assert.doesNotMatch(fnBody('function installCNav() {'), /\.after\(/);
});
