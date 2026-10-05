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

test('immersive menu 3 in BOTH modes: glow, watermark, lift, glowing progress line; a frame', () => {
  const block = APP.slice(APP.indexOf('IMMERSIVE MENU 3'), APP.indexOf('the form controls keep their own white surfaces'));
  assert.match(block, /radial-gradient\(120% 60% at 50% 0%,#8fcbef 0%,rgba\(143,203,239,0\) 60%\),linear-gradient\(180deg,#5aaedf 0%,#53a7db 45%,#4497cf 100%\)/, 'light');
  assert.match(block, /html\.ui-c\[data-theme="dark"\] \.shell > nav\{background-color:#08182e;[^}]*radial-gradient\(120% 60% at 50% 0%,rgba\(23,69,110,\.9\) 0%/, 'dark, from the sea\'s own glow');
  assert.match(block, /html\.ui-c \.shell > nav::after\{content:"";position:absolute;z-index:-1;left:-40px;top:560px;width:1000px;[^}]*url\(\/assets\/NoAca_logo_whitehor\.svg\)[^}]*pointer-events:none\}/,
    'the official white logo watermark, both modes, never clickable');
  assert.match(block, /html\.ui-c\[data-theme="dark"\] \.cnav \.c-spine line\.on\{stroke:#8fcbef;stroke-width:3;filter:drop-shadow/, 'the dark progress line glows too');
  assert.match(block, /html\.ui-c:not\(\[data-theme="dark"\]\) \.cnav \.c-spine line\.on\{stroke:#ffffff;stroke-width:3;filter:drop-shadow/);
  assert.doesNotMatch(block, /border-radius/, 'no pills');
});

// "it changes the shade of the left card when switching through the tabs": the menu is as tall as
// the page, so a gradient sized to it stretched differently on every tab. One viewport tall, always.
test('the menu gradient is one viewport tall in both modes, so its shade never changes between tabs', () => {
  for (const mode of ['html\\.ui-c:not\\(\\[data-theme="dark"\\]\\)', 'html\\.ui-c\\[data-theme="dark"\\]']) {
    assert.match(APP, new RegExp(mode + ' \\.shell > nav\\{background-color:#[0-9a-f]{6};background-size:100% 100vh;background-repeat:no-repeat;'));
  }
});

// "it stops at people": the progress line runs to the PAGE you are on, so the child is lit with its parent
test('the progress line reaches the page: Journey, All people, Today and Inbox light with their parent', () => {
  const m = APP.slice(APP.indexOf('function markCNav('), APP.indexOf("document.querySelectorAll('.cnav a').forEach((a) => a.classList.toggle('on'", APP.indexOf('function markCNav(')));
  assert.match(m, /const parent = \{ today: 'admissions', leads: 'admissions' \}\[place\] \|\| place;/);
  assert.match(m, /page === 'journey' \? 'journey'/);
  assert.match(m, /const lit = \[parent, child\]\.filter\(Boolean\);/);
});

test('the form controls stay readable, the A/B is gone, dark is unchanged', () => {
  assert.match(APP, new RegExp(L + '\\.shell > nav select\\{color:#0a2463\\}'));
  assert.doesNotMatch(APP, /menu-a|menu-b|menuVariant|menuSetVariant|c-menuab|cMenuAb/);
  assert.match(APP, /html\.ui-c\[data-theme="dark"\] \.shell > nav\{background:linear-gradient\(180deg,rgba\(8,24,46,\.78\) 0%,rgba\(8,24,46,\.92\) 100%\)/);
});

// "IT JUST NEEDS TO whiten up the TEXT" (the owner, 05.10.2026): no white pill anywhere; the lit items (the
// page and its parent) keep the soft highlight and get white, bold words, icon and count
test('lit items get white bold text, icon and count on the soft highlight; no white pill', () => {
  assert.match(APP, /html\.ui-c:not\(\[data-theme="dark"\]\) \.cnav a\.on\{background:rgba\(255,255,255,\.34\);color:#ffffff;font-weight:700\}/);
  assert.match(APP, /html\.ui-c:not\(\[data-theme="dark"\]\) \.cnav a\.on svg\{color:#ffffff\}/);
  assert.match(APP, /\.cnav a\.on \.n, html\.ui-c:not\(\[data-theme="dark"\]\) \.cnav a\.on \.n\.warn\{color:#ffffff;font-weight:700\}/);
  assert.doesNotMatch(APP, /\.cnav a\.on[^{]*\{background:#ffffff/, 'no white pill on any lit item');
  assert.match(APP, /const lit = \[parent, child\]\.filter\(Boolean\);/, 'the page and its parent are both lit');
});
