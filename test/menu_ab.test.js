// Q5, LEFT MENU A/B, LIGHT MODE ONLY (the owner, 04.10.2026). Both built, neither chosen.
//   A - the 15% Novikontas Blue tint arrives by half way and holds
//   B - solid brandbook blue #53a7db as the surface, navy words and icons, the black logo
// Dark mode is the same in both.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fn = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };

const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('the switch: ?menu=a|b, remembered, A by default', () => {
  const store = {};
  const ctx = { localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } }, URLSearchParams, location: { search: '' } };
  vm.runInNewContext(fn('function menuVariant(') + '\nthis.v = menuVariant;', ctx);
  assert.equal(ctx.v(), 'a');
  ctx.location.search = '?menu=b'; assert.equal(ctx.v(), 'b');
  ctx.location.search = ''; assert.equal(ctx.v(), 'b', 'remembered');
  assert.match(fn('function menuSetVariant('), /searchParams\.delete\('menu'\)/, 'a click is not undone by a ?menu= left in the address');
});

test('A: white at the top, the tint by half way, held to the foot', () => {
  assert.match(APP, /html\.ui-c\.menu-a:not\(\[data-theme="dark"\]\) \.shell > nav\{background:linear-gradient\(180deg,#ffffff 0%,#e5f2fa 50%,#e5f2fa 100%\)\}/);
});

test('B: the brandbook blue as the surface, navy on it, and navy passes where white fails', () => {
  assert.match(APP, /html\.ui-c\.menu-b:not\(\[data-theme="dark"\]\) \.shell > nav\{background:#53a7db;/);
  assert.ok(ratio('#0a2463', '#53a7db') >= 4.5, 'navy on the blue: ' + ratio('#0a2463', '#53a7db').toFixed(2));
  assert.ok(ratio('#ffffff', '#53a7db') < 4.5, 'white would fail, which is why it is not used');
  assert.match(APP, /html\.ui-c\.menu-b:not\(\[data-theme="dark"\]\) \.cnav \.n\.warn\{color:#0a2463/, 'the amber count turns navy: amber on the blue fails');
  assert.match(APP, /html\.ui-c\.menu-b:not\(\[data-theme="dark"\]\) nav \.brand \.logo\.onblue\{display:block\}/, 'the black logo on B');
  assert.match(APP, /src="\/assets\/NoAca_logo_blackhor\.svg"/, 'the official file, never a recoloured one');
});

test('dark mode is untouched: every A/B rule is light-only', () => {
  const rules = [...APP.matchAll(/html\.ui-c\.menu-[ab][^{]*\{/g)].map((m) => m[0]);
  assert.ok(rules.length >= 10);
  for (const r of rules) assert.match(r, /:not\(\[data-theme="dark"\]\)/, r);
});
