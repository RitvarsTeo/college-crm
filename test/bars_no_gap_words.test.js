// Item 11, 30.09.2026: no explanation inside a bar label. A bar chart is read by
// comparing lengths; a sentence wrapped under one label breaks the row heights and
// makes that bar shout. The gap label reads slate, and the reason is on hover.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');

test('no why text inside a bar label', () => {
  const bars = [
    APP.slice(APP.indexOf('function cBars('), APP.indexOf('function cWireCharts(')),
    APP.slice(APP.indexOf('function cRepBars('), APP.indexOf('function cRepRates(')),
  ];
  for (const b of bars) {
    assert.ok(b.includes('class="kbl"'), 'the label is still there');
    const label = b.slice(b.indexOf('class="kbl"'), b.indexOf('class="kbt"'));
    assert.ok(!label.includes('<small>'), 'no sentence inside the label: ' + label.slice(0, 90));
  }
});

test('a gap reads slate, and the reason is on hover', () => {
  const home = APP.slice(APP.indexOf('function cBars('), APP.indexOf('function cWireCharts('));
  assert.match(home, /\$\{why \? `<span class="c-gap">\$\{esc\(label\)\}<\/span>` : esc\(label\)\}/, 'slate label');
  assert.match(home, /data-tip="\$\{esc\(label\)\}\|\$\{n\} admitted\$\{why \? '\|' \+ esc\(why\) : ''\}"/, 'reason on hover');

  // Reports (Q35): the same slate label, and the reason on hover beside the basis
  const rep = APP.slice(APP.indexOf('function cRepBars('), APP.indexOf('function cRepRates('));
  assert.match(rep, /\$\{gap \? `<span class="c-gap">\$\{esc\(l\)\}<\/span>` : esc\(l\)\}/, 'slate label');
  assert.match(rep, /\$\{esc\(basis\)\}\$\{why \? ' · ' \+ esc\(why\) : ''\}"/, 'reason on hover');
});
