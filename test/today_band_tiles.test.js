// 06.10.2026, the owner on Today's "Needs you": "Today has a fucked up error". The lit columns (Overdue, Due today,
// No next step) were grey boxes with a thick navy bottom line and Coming up was not, so the band looked broken and
// uneven. Every column is Home's Needs you tile; lit is only a thin amber line, which does not change the tile.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const rule = (sel) => {
  const i = APP.indexOf(sel + '{');
  assert.ok(i > 0, 'rule exists: ' + sel);
  return APP.slice(i + sel.length + 1, APP.indexOf('}', i));
};

test('Today band: a lit column is the same tile as the others, no box, no navy line', () => {
  const on = rule('html.ui-c #view .pcards .p-card.on');
  assert.match(on, /background:transparent/);
  assert.match(on, /border-radius:0/);
  assert.match(on, /box-shadow:none/);
  assert.doesNotMatch(on, /c-sunk|j-to/, 'not the old grey box with the navy line');
  const mark = rule('html.ui-c #view .pcards .p-card.on::after');
  assert.match(mark, /height:3px/);
  assert.match(mark, /#F7C04F/i, "the band's signal amber");
  assert.match(mark, /position:absolute/, 'drawn over the tile, so the tile keeps its size');
});

test('Today band: every column is a Home Needs you tile (.kneed), Coming up included', () => {
  const i = APP.indexOf('function cPoolCards(');
  const fn = APP.slice(i, APP.indexOf('\n}\n', i));
  assert.match(fn, /class="kneed p-card/, 'one tile class for every column');
  assert.ok(!/\.p-card\.on[^{]*\{[^}]*background:var\(--c-sunk\)/.test(APP), 'no grey lit box anywhere');
});
