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
// the Reports screen: its own block (Q35, B), up to the Applications chapter's loaders
const screen = APP.slice(APP.indexOf('// ---------------------------------------------------- FULL REPORT, ONE LEVEL DEEPER (Q35)'),
  APP.indexOf('// apply.novikontas.org, from the SIS'));

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

test('"Right now" is not on Reports: Today owns open / overdue / no next step (Q35)', () => {
  assert.ok(!screen.includes('c-nowbar') && !screen.includes('activeApplicants'));
});

test('By programme is bars on one scale, each with its own number and its own people', () => {
  const body = screen.slice(screen.indexOf('function cRepBody('));
  assert.match(body, /cRepBars\(A\.byProgramme, 'programme'/, 'admitted, on the Admitted tab');
  assert.match(body, /cRepBars\(L\.byProgramme, 'programme'/, 'people added, on the Leads tab');
  const bars = screen.slice(screen.indexOf('function cRepBars('), screen.indexOf('function cRepRates('));
  assert.match(bars, /const max = Math\.max\(1, \.\.\.list\.map\(\(x\) => x\.n\)\);/, 'one scale per block');
  assert.match(bars, /<b>\$\{x\.n\}<\/b>/, 'the value beside its own bar');
  assert.match(bars, /data-coh="\$\{x\.k\}"/, 'and the click to its people');
});

test('the maritime figure is a number with its people, beside the education coverage', () => {
  assert.match(screen, /<span class="rp-chip">maritime school \$\{cRepGo\(L\.maritime\)\}<\/span>/);
  assert.match(screen, /`\$\{pw\} · \$\{cRepGo\(L\.eduRecorded\)\} recorded`/);
});
