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

test('phone: the switch and the (c) line sit at the bottom of the page, not gone', () => {
  assert.match(APP, /<main id="view">[\s\S]{0,80}<\/main>\s*<div class="c-pagefoot"><div class="c-themebar" id="cThemeBar2"><\/div>\s*<div class="c-foot"><span>&copy; Novikontas Academy<\/span> <a href="#\/help">Help center<\/a><\/div><\/div>/);
  assert.match(APP, /@media \(max-width:760px\)\{ html\.ui-c nav \.c-themebar, html\.ui-c nav \.c-foot\{display:none\}\s*html\.ui-c \.c-pagefoot\{display:block/);
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

test('the four screen texts are a third of what they were, or less', () => {
  for (const [now, was] of [
    ['<p>What the team has to do.</p>', 'What the team has to do. Four states, and every open person is in exactly one of them.'],
    ['<p>New arrivals land here first.</p>', 'Who has just arrived and needs understanding. Everything that arrives comes here first; obvious junk is kept aside, never deleted.'],
    ['<p>Click a row to edit.</p>', 'Everyone, as a database you can work in. Click a row to edit it right here.'],
    [': `All ${people.length} people.`;', 'All 12 people. Each filter narrows the list, and this sentence says exactly what is left.'],
  ]) {
    assert.ok(APP.includes(now), now);
    assert.ok(!APP.includes(was), 'old text gone: ' + was.slice(0, 40));
    assert.ok(now.replace(/<\/?p>|: `|`;|\$\{people\.length\}/g, '').length * 3 <= was.length, now);
  }
});
