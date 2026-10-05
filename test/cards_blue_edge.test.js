// CARDS 3 (the owner's pick, A/B batch step 2c, 05.10.2026), light mode: ONE rule for every card, a 3px
// Novikontas Blue top edge; Needs-you keeps amber; no boxes inside a card.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');

test('one rule names every card and gives it the white surface and the blue top edge', () => {
  const m = APP.match(/html\.ui-c:not\(\[data-theme="dark"\]\) #view :is\(([^)]*)\)\{\s*background:#ffffff;border:1px solid rgba\(10,36,99,\.07\);border-top:3px solid #53a7db;border-radius:14px;\s*box-shadow:0 1px 2px rgba\(10,36,99,\.06\),0 10px 24px rgba\(10,36,99,\.08\)\}/);
  assert.ok(m, 'the shared card rule');
  for (const c of ['.kstrip > div', '.kday-sheet', '.kday-side', '.c-todaystrip', '.c-sheet', '.c-apps', '.kflow.jband']) assert.ok(m[1].includes(c), c);
  assert.equal((APP.match(/border-top:3px solid #53a7db/g) || []).length, 2, 'one rule per mode, not one per screen');
});
test('the Needs-you card keeps its amber top, and outranks the shared rule', () => {
  assert.match(APP, /#view \.kday-sheet\.kday-sheet\.kday-sheet\{border-top-color:#F7C04F\}/);
});
test('no boxes inside a card: the Needs-you tiles and the band bookends are plain, split by hairlines', () => {
  assert.match(APP, /#view \.kneed\{background:transparent;border:0;border-left:1px solid #e3e9ef;border-radius:0;box-shadow:none;/);
  assert.match(APP, /#view \.jb-end\{background:transparent;border:0;border-radius:0;box-shadow:none;/);
});

test('dark matches: the same cards, solid (never glass), the same blue top, amber Needs-you, plain insides', () => {
  const m = APP.match(/html\.ui-c\[data-theme="dark"\] #view :is\(([^)]*)\)\{\s*background:#133a60;[^}]*border-top:3px solid #53a7db;border-radius:14px;[^}]*backdrop-filter:none\}/);
  assert.ok(m, 'the dark card rule');
  assert.equal(m[1], '.kstrip > div, .kday-sheet, .kday-side, .c-todaystrip, .c-sheet, .c-apps, .kflow.jband', 'the same list as light');
  assert.match(APP, /html\.ui-c\[data-theme="dark"\] #view \.kday-sheet\.kday-sheet\.kday-sheet\{border-top-color:#F7C04F\}/);
  assert.match(APP, /html\.ui-c\[data-theme="dark"\] #view \.kneed\{background:transparent;border:0;border-left:1px solid rgba\(194,211,222,\.14\)/);
  assert.match(APP, /html\.ui-c\[data-theme="dark"\] #view \.jb-end\{background:transparent;border:0;/);
});

// The owner, 05.10.2026: the old stacked sheets under the Needs-you card read as a broken grey (light) / dark
// strip under cards 3. They are gone in both modes; the card's own shadow is its depth.
test('the Needs-you card has no shelf under it', () => {
  assert.doesNotMatch(APP, /\.kday-sheet::(before|after)/);
});
