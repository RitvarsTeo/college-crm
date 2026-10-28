// THE SEA WITH CONTRAST (28.10.2026): the owner's picks for Intake's dark look - the sea stays; bright cards for the
// headline figures, deep cards for the lists and charts, the deep ones never darker than the side menu; every border
// (the Novikontas Blue top line, the amber lines) stays.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const lum = (hex) => { const c = hex.replace('#', '').match(/../g).map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('the sea stays, the deep card is never darker than the side menu, the bright card carries the headline figures', () => {
  const dark = APP.match(/html\.ui-c\[data-theme="dark"\]\{--paper:#0f2f4f;[^}]*\}/)[0];
  assert.match(dark, /--surface:#0d2a49;/);
  assert.match(APP, /--sea:radial-gradient\(120% 80% at 50% 0%,#17456e 0%,rgba\(23,69,110,0\) 60%\),linear-gradient\(180deg,#0f2f4f 0%,#0f2f4f 45%,#08182e 100%\)/, 'the sea, unchanged');
  assert.ok(lum('#0d2a49') >= lum('#0c2745'), 'the deep card is not darker than the side menu at its lightest');
  const bright = APP.match(/html\.ui-c\[data-theme="dark"\] body \.shell #view :is\(([^)]*)\)\{\s*background:#1b4a77;box-shadow:0 0 0 1px rgba\(255,255,255,\.30\)/);
  assert.ok(bright, 'the bright card rule');
  for (const c of ['.kstrip > div', '.kday-sheet', '.tcgo-strip', '.khero']) assert.ok(bright[1].includes(c), c);
  for (const [t, g] of [['#ffffff', '#1b4a77'], ['#e6eef5', '#1b4a77'], ['#c8d7e4', '#1b4a77'], ['#c8d7e4', '#0d2a49']]) assert.ok(ratio(t, g) >= 4.5, `${t} on ${g}`);
});

test('no border is overridden: the blue top line and the amber Needs-you line stay; the edge is a ring in the shadow', () => {
  const rule = APP.match(/html\.ui-c\[data-theme="dark"\] body \.shell #view :is\([^)]*\)\{[^}]*\}/)[0];
  assert.doesNotMatch(rule, /border/);
  assert.match(APP, /border-top:3px solid #53a7db;border-radius:14px;\n  box-shadow:0 0 0 1px rgba\(255,255,255,\.20\)/);
  assert.match(APP, /html\.ui-c\[data-theme="dark"\] #view \.kday-sheet\.kday-sheet\.kday-sheet\{border-top-color:#F7C04F\}/);
  assert.match(APP, /--glass:#0d2a49;/, 'the panels are the deep card, solid');
});
