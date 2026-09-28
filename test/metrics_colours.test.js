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
  assert.deepEqual(light.slice(1).map((c) => c.toLowerCase()), ['#29a8df', '#0a2463', '#f7c04f', '#98a4b3']);
  const dark = APP.match(/--v-adm:(#\w+);--v-lead:(#\w+);--v-open:(#\w+);--v-np:(#\w+);--v-grid:#24507a;/);
  assert.ok(dark, 'the dark chart tokens');
  assert.equal(dark[1].toLowerCase(), '#53a7db', 'dark admitted = the brand blue');
  assert.equal(dark[3], '#F7C04F', 'dark open = the bright amber');
  assert.doesNotMatch(APP, /--v-(prog|chan):/, 'no extra chart colours');
});

test('the donut: Open yellow, Admitted blue, Not proceeding grey; every bar is the admitted blue', () => {
  assert.match(APP, /\['Open', nowOpen, 'open', 'journey'\], \['Admitted', [^\]]*'adm', 'Admitted'\]/);
  const bars = APP.match(/background:var\(--v-\$\{why \? 'np' : '(\w+)'\}\)/g) || [];
  assert.equal(bars.length, 2, 'Home bars and report bars');
  for (const b of bars) assert.match(b, /'adm'/);
});

test('light menu: the active item keeps the blue text and icon, with no block behind it', () => {
  assert.match(APP, /html\.ui-c:not\(\[data-theme="dark"\]\) \.cnav a\.on\{color:#0a2463;background:transparent\}/);
  assert.match(APP, /html\.ui-c:not\(\[data-theme="dark"\]\) \.cnav a\.on svg\{color:#29a8df;opacity:1\}/);
});
