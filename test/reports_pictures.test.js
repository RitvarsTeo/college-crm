// Item 9, 30.09.2026: Reports says it in pictures. The sentences that described
// numbers are drawn instead, and the two prose blocks leave the screen but stay in
// the export, which is where somebody reconciling the figures needs them.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const REPORTS = fs.readFileSync(path.join(ROOT, 'src', 'reports.js'), 'utf8');
// the Reports view only: from its own declaration to whatever top-level function follows it
const rStart = APP.indexOf('async function viewReportsC');
const rEnd = APP.slice(rStart + 10).search(/\n(async )?function /) + rStart + 10;
const screen = APP.slice(rStart, rEnd);

test('none of those sentences is on the screen', () => {
  for (const s of [
    'Right now, whatever the period',
    'with an overdue step',
    'What the CRM cannot measure yet',
    'Counted from the education field',
    'The real number is at least this.',
  ]) assert.ok(!screen.includes(s), 'still on screen: ' + s);
  assert.ok(!screen.includes('r.honesty'), 'the honesty paragraph is off the screen');
  assert.ok(!screen.includes('notMeasured'), 'and so is the cannot-measure block');
});

test('the export still carries both', () => {
  assert.match(REPORTS, /notMeasured: await notMeasured\(db, p\)/, 'the report still computes them');
  assert.match(REPORTS, /for \(const n of r\.notMeasured\) rows\.push/, 'the export writes the gaps table');
  assert.match(REPORTS, /Every figure above is a count of rows in Intake/, 'and the honesty line');
});

test('"Right now" is three badges, and the count is bigger than its label', () => {
  assert.match(screen, /<a class="c-nowbar" href="#\/next">/);
  for (const w of ['>open<', '>overdue<', '>no next step<']) assert.ok(screen.includes(w), w);
  assert.match(APP, /html\.ui-c \.c-nowbar b\{font-size:24px/, 'the number leads');
  assert.match(APP, /html\.ui-c \.c-nowbar span\{[^}]*font-size:12px/, 'the label follows');
  assert.match(APP, /html\.ui-c \.c-nowbar span\.is-late b\{color:var\(--c-bad\)\}/, 'late is the one red');
});

test('By programme is paired bars on one blue ramp, each with its own number', () => {
  assert.match(screen, /\$\{cProgBars\(r\.programmes \|\| \[\]\)\}/);
  assert.ok(!screen.includes('<th>New leads</th><th>Admitted</th>'), 'the two-number table is gone');
  const fn = APP.slice(APP.indexOf('function cProgBars('), APP.indexOf('function cMonthChart('));
  assert.match(fn, /i class="lead"/);
  assert.match(fn, /i class="adm"/);
  assert.match(fn, /<em>\$\{Number\(x\.newLeads\) \|\| 0\}<\/em>/, 'the value sits beside its own bar');
  assert.match(APP, /html\.ui-c \.c-pbar i\.lead\{background:var\(--c-accent-bg\)\}/, 'one ramp, light');
  assert.match(APP, /html\.ui-c \.c-pbar i\.adm\{background:var\(--v-adm\)\}/, 'one ramp, solid');
});

test('the maritime figure is a normal number with its coverage as a / b', () => {
  assert.ok(!screen.includes('<p class="c-big">${s.maritimeGraduates'), 'no longer hero sized');
  assert.match(screen, /<p class="c-num">\$\{s\.maritimeGraduates \?\? 0\}<\/p>/);
  assert.match(screen, /\$\{cov\.education\?\.filled \?\? 0\} \/ \$\{cov\.education\?\.of \?\? 0\} have an education recorded/);
});
