// THE LIGHT MENU IS SOLID BRANDBOOK BLUE (the owner picked B of Q5, 04.10.2026). The A/B is
// gone: no A, no ?menu= switch, no "Menu A B" control, no remembered choice. Dark is unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');

const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('B is the light menu: the brandbook blue as the surface, navy on it', () => {
  const navs = [...APP.matchAll(/html\.ui-c:not\(\[data-theme="dark"\]\) \.shell > nav\{([^}]*)\}/g)].map((m) => m[1]);
  assert.equal(navs.length, 1, 'one light menu rule, no second one fighting it');
  assert.match(navs[0], /background:#53a7db;/);
  assert.ok(ratio('#0a2463', '#53a7db') >= 4.5, 'navy on the blue: ' + ratio('#0a2463', '#53a7db').toFixed(2));
  assert.ok(ratio('#ffffff', '#53a7db') < 4.5, 'white would fail, which is why it is not used');
  assert.match(APP, /html\.ui-c:not\(\[data-theme="dark"\]\) \.cnav a\{color:#0a2463\}/);
  assert.match(APP, /html\.ui-c:not\(\[data-theme="dark"\]\) \.cnav \.n\.warn\{color:#0a2463/, 'the amber count turns navy');
  assert.match(APP, /html\.ui-c:not\(\[data-theme="dark"\]\) nav \.brand \.logo\.onblue\{display:block\}/, 'the black logo on it');
  assert.match(APP, /src="\/assets\/NoAca_logo_blackhor\.svg"/, 'the official file, never a recoloured one');
});

test('the A/B is gone: no A, no switch, no control, and the stored choice is cleared', () => {
  assert.doesNotMatch(APP, /menu-a|menu-b|menuVariant|menuSetVariant|c-menuab|cMenuAb/);
  assert.doesNotMatch(APP, /get\('menu'\)/, 'nothing reads ?menu= any more');
  assert.doesNotMatch(APP, /#e5f2fa/, 'the tint of A and of the earlier gradient is gone');
  assert.match(APP, /localStorage\.removeItem\('menuvariant'\)/);
});

test('dark mode is unchanged', () => {
  assert.match(APP, /html\.ui-c\[data-theme="dark"\] \.shell > nav\{background:linear-gradient\(180deg,rgba\(8,24,46,\.78\) 0%,rgba\(8,24,46,\.92\) 100%\)/);
});
