// THE LIGHT MENU (the owner, 04.10.2026): solid brandbook blue #53a7db (B of Q5), and on it
// VERSION 3 of four mockups: everything white, the official white logo file aligned to the text.
// White on #53a7db is 2.65:1, under 4.5:1: his decision, taken while looking at it (BACKLOG.md).
// The A/B is gone. Dark is unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const L = 'html\\.ui-c:not\\(\\[data-theme="dark"\\]\\) ';

test('the surface is the brandbook blue, one rule', () => {
  const navs = [...APP.matchAll(/html\.ui-c:not\(\[data-theme="dark"\]\) \.shell > nav\{background:([^;]*);/g)].map((m) => m[1]);
  assert.deepEqual(navs, ['#53a7db']);
});

test('version 3: words, counts, icons and hairlines white at full opacity; links 15.5px weight 800', () => {
  assert.match(APP, new RegExp(L + '\\.cnav a\\{color:#ffffff;font-size:15\\.5px;font-weight:800;'));
  assert.match(APP, new RegExp(L + '\\.cnav a svg\\{color:#ffffff;opacity:1\\}'));
  assert.match(APP, new RegExp(L + '\\.cnav \\.n, ' + L + '\\.cnav \\.n\\.warn\\{color:#ffffff;font-weight:800;opacity:1\\}'), 'the Today count too');
  assert.match(APP, new RegExp(L + '\\.shell > nav #ver, ' + L + '\\.shell > nav #tagline\\{color:#ffffff;opacity:1\\}'));
  assert.match(APP, new RegExp(L + '\\.cnav \\.c-spine line\\{stroke:#ffffff;stroke-width:1\\.5\\}'));
  assert.match(APP, new RegExp(L + '\\.cnav \\.c-spine line\\.on\\{stroke:#ffffff;stroke-width:3\\}'));
  assert.match(APP, new RegExp(L + '\\.cnav \\.kids\\{border-left:1\\.5px solid #ffffff\\}'));
  const block = APP.slice(APP.indexOf('VERSION 3, the owner'), APP.indexOf('.theme-switch button[aria-checked="true"]{color:#0a2463}'));
  assert.doesNotMatch(block, /text-shadow|-webkit-text-stroke|border-radius/, 'no text edge, no shadow, no pills');
});

test('the logo is the official white file, as it is, lined up with the text', () => {
  assert.match(APP, new RegExp(L + 'nav \\.brand \\.logo\\.light\\{display:none\\}'));
  assert.match(APP, new RegExp(L + 'nav \\.brand \\.logo\\.dark\\{display:block\\}'));
  assert.match(APP, /<img class="logo dark" src="\/assets\/NoAca_logo_whitehor\.svg"/);
  assert.doesNotMatch(APP, /blackhor\.svg" alt/, 'the black logo is no longer on the page');
  // the symbol starts 162.49 of 1500 units into the file; at 158px that is 17.12px
  const svg = fs.readFileSync(path.join(ROOT, 'src', 'assets', 'NoAca_logo_whitehor.svg'), 'utf8');
  assert.match(svg, /viewBox="0 0 1500 568\.72"/, 'the file is the one the offset was measured on');
  assert.ok(Math.abs((162.49 / 1500) * 158 - 17.12) < 0.01);
  assert.match(APP, /@media \(min-width:901px\)\{ html\.ui-c:not\(\[data-theme="dark"\]\) nav \.brand \.logo\.dark\{margin-left:-17\.12px\} \}/);
});

test('the form controls keep readable words on their own white surfaces', () => {
  assert.match(APP, new RegExp(L + '\\.shell > nav select\\{color:#0a2463\\}'));
  assert.match(APP, new RegExp(L + '\\.shell > nav \\.theme-switch button\\[aria-checked="true"\\]\\{color:#0a2463\\}'));
});

test('the A/B is gone and dark is unchanged', () => {
  assert.doesNotMatch(APP, /menu-a|menu-b|menuVariant|menuSetVariant|c-menuab|cMenuAb/);
  assert.match(APP, /localStorage\.removeItem\('menuvariant'\)/);
  assert.match(APP, /html\.ui-c\[data-theme="dark"\] \.shell > nav\{background:linear-gradient\(180deg,rgba\(8,24,46,\.78\) 0%,rgba\(8,24,46,\.92\) 100%\)/);
});
