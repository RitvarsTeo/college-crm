// The charts and the menu in C, 28.09.2026 (Ritvars): "Priority is novikontas blue and yellow. for
// admissions you can use a navy blue line, admitted novikontas blue." Open = yellow/amber, Not
// proceeding = grey, programme and came-from bars = Novikontas Blue, no extra chart colours. The
// active menu item in light has no block behind it: "the home can just stay blue".
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');

test('chart colours: admitted Novikontas Blue, new leads a Navy line, open yellow, not proceeding grey', () => {
  const light = APP.match(/html\.ui-c\{--v-adm:(#\w+);--v-lead:(#\w+);--v-open:(#\w+);--v-np:(#\w+);--v-grid:#\w+\}/);
  assert.ok(light, 'the light chart tokens, and no others');
  assert.deepEqual(light.slice(1).map((c) => c.toLowerCase()), ['#29a8df', '#0a2463', '#e0a526', '#98a4b3']);
  const dark = APP.match(/--v-adm:(#\w+);--v-lead:(#\w+);--v-open:(#\w+);--v-np:(#\w+);--v-grid:#24507a;/);
  assert.ok(dark, 'the dark chart tokens');
  assert.equal(dark[1].toLowerCase(), '#29a8df', 'dark admitted = the logo blue, as in light (kit 13 rule 5)');
  // THE DATA YELLOW IS NOT THE SIGNAL AMBER (the owner, 02.10.2026, KB 08 P5): Open is a
  // quantity on a chart, so it takes the data mustard. Signal amber #F7C04F keeps one
  // meaning, today / needs you, and a slice of the donut is neither.
  assert.equal(dark[3], '#E0A526', 'dark open = the data mustard, not the signal amber');
  assert.doesNotMatch(APP, /--v-open:#F7C04F/i, 'no Open slice left on the signal amber, in either mode');
  assert.match(APP, /--c-warn:#F7C04F/, 'and the signal amber itself is untouched');
  assert.doesNotMatch(APP, /--v-(prog|chan):/, 'no extra chart colours');
});

// The donut went with the KPI Home (the owner, 01.10.2026): People -> Journey says the
// same thing with five stages instead of one lump, and marks where people left. The bar
// colours it shared with the report are unchanged, and are what this now guards.
test('every bar is the admitted blue, and not proceeding is the grey', () => {
  const bars = APP.match(/background:var\(--v-\$\{why \? 'np' : '(\w+)'\}\)/g) || [];
  assert.equal(bars.length, 2, 'both report bar groups');
  for (const b of bars) assert.match(b, /'adm'/);
});

test('light menu: the active item keeps the blue text and icon, with no block behind it', () => {
  assert.match(APP, /html\.ui-c:not\(\[data-theme="dark"\]\) \.cnav a\.on\{color:#0a2463;background:transparent\}/);
  assert.match(APP, /html\.ui-c:not\(\[data-theme="dark"\]\) \.cnav a\.on svg\{color:#29a8df;opacity:1\}/);
});
