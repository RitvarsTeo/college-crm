// THE LIGHT MENU, final (the owner, 04.10.2026): solid brandbook blue #53a7db, NAVY words, icons,
// counts and hairline ("actually the navy looks better"), the official WHITE logo file aligned to the
// slogan, no "Intake · v1.0" line, and immersive menu 3 on the desktop menu. Dark is unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const L = 'html\\.ui-c:not\\(\\[data-theme="dark"\\]\\) ';
const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('navy on the blue, and navy still reads on every stop of the immersive gradient', () => {
  assert.match(APP, new RegExp(L + '\\.shell > nav\\{background:#53a7db;[^}]*color:#0a2463;'));
  assert.match(APP, new RegExp(L + '\\.cnav a\\{color:#0a2463\\}'));
  assert.match(APP, new RegExp(L + '\\.cnav \\.n\\.warn\\{color:#0a2463'));
  for (const bg of ['#8fcbef', '#5aaedf', '#53a7db', '#4497cf']) {
    assert.ok(ratio('#0a2463', bg) >= 4.5, `navy on ${bg}: ${ratio('#0a2463', bg).toFixed(2)}`);
  }
  assert.doesNotMatch(APP, /VERSION 3, the owner/, 'the white version is gone');
});

test('the logo is the official white file, as it is, its left edge on the slogan', () => {
  assert.match(APP, new RegExp(L + 'nav \\.brand \\.logo\\.light\\{display:none\\}'));
  assert.match(APP, new RegExp(L + 'nav \\.brand \\.logo\\.dark\\{display:block\\}'));
  assert.match(APP, /<img class="logo dark" src="\/assets\/NoAca_logo_whitehor\.svg"/);
  const svg = fs.readFileSync(path.join(ROOT, 'src', 'assets', 'NoAca_logo_whitehor.svg'), 'utf8');
  assert.match(svg, /viewBox="0 0 1500 568\.72"/, 'the file the offset was measured on');
  assert.ok(Math.abs((162.49 / 1500) * 158 - 17.12) < 0.01);
  assert.match(APP, /@media \(min-width:901px\)\{ html\.ui-c:not\(\[data-theme="dark"\]\) nav \.brand \.logo\.dark\{margin-left:-17\.12px\} \}/);
});

test('"Intake · v1.0" is gone in both modes; the slogan stays', () => {
  assert.match(APP, /html\.ui-c #ver\{display:none\}/);
  assert.match(APP, /<span id="tagline">Every first contact, in one place<\/span>/);
});

test('immersive menu 3: glow, watermark, lift, glowing active line; desktop light only, a frame', () => {
  const block = APP.slice(APP.indexOf('IMMERSIVE MENU 3'), APP.indexOf('the form controls keep their own white surfaces'));
  assert.match(block, /radial-gradient\(120% 60% at 50% 0%,#8fcbef 0%,rgba\(143,203,239,0\) 60%\),linear-gradient\(180deg,#5aaedf 0%,#53a7db 45%,#4497cf 100%\)/);
  assert.match(block, /box-shadow:inset -1px 0 0 rgba\(255,255,255,\.35\),6px 0 24px rgba\(10,36,99,\.18\)/);
  assert.match(block, /::after\{content:"";position:absolute;z-index:-1;left:-40px;top:560px;width:1000px;[^}]*url\(\/assets\/NoAca_logo_whitehor\.svg\)[^}]*opacity:\.13;pointer-events:none\}/,
    'the official white file as a faint watermark, never clickable');
  assert.match(block, /\.c-spine line\.on\{stroke:#ffffff;stroke-width:3;filter:drop-shadow\(0 0 4px rgba\(255,255,255,\.9\)\)\}/);
  assert.match(APP, /@media \(min-width:901px\)\{\s*html\.ui-c:not\(\[data-theme="dark"\]\) \.shell > nav\{position:relative;overflow:hidden;z-index:2;/);
  assert.doesNotMatch(block, /border-radius/, 'no pills');
});

test('the form controls stay readable, the A/B is gone, dark is unchanged', () => {
  assert.match(APP, new RegExp(L + '\\.shell > nav select\\{color:#0a2463\\}'));
  assert.doesNotMatch(APP, /menu-a|menu-b|menuVariant|menuSetVariant|c-menuab|cMenuAb/);
  assert.match(APP, /html\.ui-c\[data-theme="dark"\] \.shell > nav\{background:linear-gradient\(180deg,rgba\(8,24,46,\.78\) 0%,rgba\(8,24,46,\.92\) 100%\)/);
});
