// Q20, the owner 05.10.2026: "Todays, but without the admitted by programme. So nothing after Admissions by months
// below it. AAAAANd lets have a fix for the black space below needs you card." Home ends with the Admissions by
// month row (the donut stays beside it). Nothing is lost: by programme and where admitted people came from live in
// Reports. The gap under Needs you: he picked 1, with "Open the Journey" in the free cell after the last stage.
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
  // Q35 (B): both live on the Admitted tab, following the period chosen there
  const body = fnBody('function cRepBody(id, M) {');
  const adm = body.slice(body.indexOf("if (id === 'admitted')"), body.indexOf("if (id === 'leads')"));
  assert.match(adm, /cRepBlock\('By programme', [^\n]*cRepBars\(A\.byProgramme,/);
  assert.match(adm, /cRepBlock\('By channel', `\$\{pw\} · where they came from`, cRepBars\(A\.byChannel,/);
  assert.doesNotMatch(APP, /<h2>Cold or reject<\/h2>|cReportHome2/, 'cold / reject lives in Outcomes');
});

test('Needs you is the whole row; the journey card and its two-column layout are gone (Q37)', () => {
  const home = fnBody('function cHomeB(D) {');
  assert.match(home, /<section class="kday m-scene" aria-label="Needs you">/);
  assert.doesNotMatch(APP, /kday-side|kday-st|kday-fit|kgrp-go|The journey now<\/h3>/, 'nothing of it is left');
  assert.match(APP, /html\.ui-c \.kday\{display:grid;grid-template-columns:minmax\(0,1fr\);/, 'one column');
});

test('Reports keeps its place in the menu; no switch moves it', () => {
  assert.doesNotMatch(fnBody('function installCNav() {'), /\.after\(/);
});

test('phone: the Needs-you figures sit in one row, smaller (the owner, 05.10.2026)', () => {
  const i = APP.indexOf('/* PHONE: the Needs-you figures in ONE row');
  assert.ok(i > APP.indexOf('html.ui-c[data-theme="dark"] #view .kneed:first-child'), 'after the light and dark card rules, so it outranks them');
  const css = APP.slice(i, APP.indexOf('\n}\n', i));
  assert.match(css, /@media \(max-width:760px\)\{/);
  assert.match(css, /html\.ui-c #view \.kday \.kday-row\{grid-template-columns:none;grid-auto-flow:column;grid-auto-columns:minmax\(0,1fr\)\}/, 'one column per figure');
  assert.match(css, /html\.ui-c #view \.kday \.kneed b\{font-size:28px\}/);
});
