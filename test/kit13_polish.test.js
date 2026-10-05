// Kit 13 polish, 28.09.2026 (the three-app dev-kit audit): on a phone the Light/System/Dark switch
// and the (c) line go to the bottom of the PAGE instead of disappearing; the light base neutrals are
// the brandbook's; dark takes kit 13's two lightened lines. And four screen texts cut to a third
// (Ritvars: "Shorten the texts at least 3 times").
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');

const L = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// 05.10.2026: the (c) line itself is now the shared foot of every page (#view::after, test/app_chrome.test.js)
test('phone: the switch and the Help center link sit at the bottom of the page, not gone', () => {
  assert.match(APP, /<main id="view">[\s\S]{0,80}<\/main>\s*<div class="c-pagefoot"><div class="c-themebar" id="cThemeBar2"><\/div>\s*<div class="c-foot"><a href="#\/help">Help center<\/a><\/div><\/div>/);
  // <= 900 px: every width where the menu is a top bar (Aigars UX pass, 28.09.2026)
  assert.match(APP, /@media \(max-width:900px\)\{ html\.ui-c nav \.c-themebar, html\.ui-c nav \.c-foot\{display:none\}\s*html\.ui-c \.c-pagefoot\{display:block/);
  assert.match(APP, /\.c-themebar, \.c-foot, \.c-pagefoot\{display:none\}/, 'hidden on desktop and in classic');
  assert.match(APP, /querySelectorAll\('#cThemeBar, #cThemeBar2'\)\) bar\.innerHTML = themeSwitchHtml\(\)/, 'both copies are filled');
  assert.doesNotMatch(APP, /@media \(max-width:760px\)\{ html\.ui-c \.c-themebar, html\.ui-c \.c-foot\{display:none\} \}/, 'the rule that hid them is gone');
});

test('light: brandbook neutrals, and every text colour passes on the page, panels and the menu', () => {
  const m = APP.match(/html\.ui-c\{--paper:(#\w+);--surface:(#\w+);--surface-2:#\w+;--shell:(#\w+);[^}]*?--ink:(#\w+);\s*--t2:(#\w+);--t3:(#\w+);--t4:(#\w+);[^}]*?--control-line:(#\w+);\s*--pet:(#\w+);/);
  assert.ok(m, 'the light C block');
  const [, paper, surface, shell, ink, t2, t3, t4, control, pet] = m;
  assert.equal(shell, '#e7ebf0', 'the side menu is brandbook Light Grey');
  assert.equal(ink, '#011111', 'body text Pitch Black');
  assert.equal(t2, '#415c8f', 'secondary text Steel Blue');
  assert.equal(pet, '#0a2463', 'focus and marks Navy, not the teal');
  for (const t of [ink, t2, t3, t4]) for (const g of [paper, surface, shell]) assert.ok(ratio(t, g) >= 4.5, `${t} on ${g}: ${ratio(t, g).toFixed(2)}`);
  for (const g of [surface, shell]) assert.ok(ratio(control, g) >= 3, `field edge ${control} on ${g}: ${ratio(control, g).toFixed(2)}`);
  assert.doesNotMatch(APP.match(/html\.ui-c\{--paper:[^}]*\}/)[0], /#f6f7f6|#f1f3f2|#2e6b70|#c9d0d3/, 'the green-grey and teal are gone from light');
});

test('dark: kit 13 lines - field edge #82a0ba, the menu tree line at 28%', () => {
  const dark = APP.match(/html\.ui-c\[data-theme="dark"\]\{--paper:#0f2f4f;[^}]*\}/)[0];
  assert.match(dark, /--control-line:#82a0ba;/);
  assert.ok(ratio('#82a0ba', '#17456e') >= 3, 'the edge holds 3:1 at the brightest point of the sea');
  assert.match(APP, /html\.ui-c\[data-theme="dark"\] \.cnav \.kids\{border-left-color:rgba\(194,211,222,\.28\)\}/);
  assert.match(dark, /--paper:#0f2f4f;--surface:#133a60;--surface-2:#17456e;--shell:#08182e;/, 'the sea itself is unchanged');
});

test('the screen texts are gone entirely, and the one that carries a count stays', () => {
  // 28.09 shortened them; 30.09 removed them. Both the long and the short form must be gone.
  for (const gone of [
    'What the team has to do. Four states, and every open person is in exactly one of them.',
    '<p>What the team has to do.</p>',
    'Who has just arrived and needs understanding. Everything that arrives comes here first; obvious junk is kept aside, never deleted.',
    '<p>New arrivals land here first.</p>',
    'Everyone, as a database you can work in. Click a row to edit it right here.',
    '<p>Click a row to edit.</p>',
    'All 12 people. Each filter narrows the list, and this sentence says exactly what is left.',
  ]) assert.ok(!APP.includes(gone), 'still on the screen: ' + gone.slice(0, 48));

  // the one that is a COUNT, not a sentence, stays - since Q47 (People became the Journey) the counts are the frozen
  // band's: every column prints its figure, and the menu's Journey count is everyone
  assert.ok(APP.includes('<b class="jb-n">${c.n}'), 'the row count is a value');
  assert.ok(APP.includes("put('#cnJourney', cBadge("), 'and everyone is the menu count');
});

test('panels are the kit card, and the card in dark is solid', () => {
  // The owner chose modern cards in the Client Hub on 30.09.2026 and asked for the decision to be
  // packaged for every app; then "Cards there too" for the Home KPI strip. Taken from the dev kit
  // (Component library, 2 App frame, academy-kit.css), not re-invented here.
  for (const theme of ['light', 'dark']) {
    const block = theme === 'light'
      ? APP.slice(APP.indexOf('html.ui-c{--paper:'), APP.indexOf('html.ui-c[data-theme="dark"]{--paper:'))
      : APP.slice(APP.indexOf('html.ui-c[data-theme="dark"]{--paper:'));
    assert.match(block, /--c-card-line:/, `${theme} defines the card edge`);
    assert.match(block, /--c-card-lift:/, `${theme} defines the card lift`);
  }
  // the kit's exact values, so the apps cannot drift apart
  assert.match(APP, /--c-card-line:rgba\(10,36,99,\.07\)/, 'light edge is the kit value');
  assert.match(APP, /--c-card-lift:0 1px 2px rgba\(10,36,99,\.06\),0 10px 28px rgba\(10,36,99,\.08\)/);
  assert.match(APP, /--c-card-line:rgba\(194,211,222,\.12\)/, 'dark edge is the kit value');

  // the panel and the KPI strip both take it
  assert.match(APP, /html\.ui-c \.c-sheet\{background:var\(--surface\);border:1px solid var\(--c-card-line\);border-radius:14px;\s*box-shadow:var\(--c-card-lift\)/);
  assert.match(APP, /html\.ui-c \.kstrip > div\{padding:16px 18px;min-width:0;background:var\(--surface\);\s*border:1px solid var\(--c-card-line\);border-radius:14px;box-shadow:var\(--c-card-lift\)\}/,
    'the Home figures are cards, not a hairline row');
  assert.doesNotMatch(APP, /html\.ui-c \.kstrip > div \+ div\{padding-left:18px;border-left/,
    'the dividing rules are gone');

  // NEVER glass in dark: --surface in ui-c dark is the solid #133a60, and the card uses --surface
  assert.match(APP, /html\.ui-c\[data-theme="dark"\]\{--paper:#0f2f4f;--surface:#133a60/,
    'the dark card surface is solid, the way the kit requires');
});
