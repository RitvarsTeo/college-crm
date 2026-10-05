// Unified audit 29.09.2026, items 3 + 4 (dev kit part 2, the app frame): the installed app's
// splash is white like the icon tile, the logo link names itself "Novikontas Academy - Home", the
// logo on light is the official two-tone, the icon comment says what the icon is, and C is Inter.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const SERVER = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');

test('manifest: a white splash behind the white icon tile; the window bar stays black', () => {
  assert.match(SERVER, /background_color: '#ffffff',/);
  assert.match(SERVER, /theme_color: '#000000',/);
});

test('the logo is a link to Home that says so, two-tone on light and white on dark', () => {
  assert.match(APP, /<a class="brand" href="#\/today" title="Home" aria-label="Novikontas Academy - Home">\s*<img class="logo light" src="\/assets\/NoAca_logo_twotonehor\.svg" alt=""[^>]*>\s*<img class="logo dark" src="\/assets\/NoAca_logo_whitehor\.svg" alt=""/);
  assert.match(SERVER, /'NoAca_logo_twotonehor\.svg': 'image\/svg\+xml; charset=utf-8'/, 'the server serves it');
  const svg = fs.readFileSync(path.join(ROOT, 'src', 'assets', 'NoAca_logo_twotonehor.svg'), 'utf8');
  assert.match(svg, /#29a8df/i, 'the A stroke is the logo blue');
  assert.match(svg, /#022367/i, 'the rest is the official navy');
});

test('no comment still calls the icon a navy tile', () => {
  assert.doesNotMatch(APP, /navy tile/);
  assert.doesNotMatch(SERVER, /navy tile/);
});

test('C is Inter: no C rule asks for the serif, and headings in the work area inherit', () => {
  const cRules = [...APP.matchAll(/html\.ui-c[^{]*\{[^}]*\}/g)].map((m) => m[0]);
  assert.deepEqual(cRules.filter((r) => /font-family:var\(--serif\)/.test(r)), []);
  assert.match(APP, /html\.ui-c #view h1, html\.ui-c #view h2, html\.ui-c #view h3, html\.ui-c \.card h3\{font-family:inherit\}/);
});

test('Home and Reports are as wide as every other screen: no page cap of their own', () => {
  // 29.09.2026, Ritvars, from a screenshot: "a lot of space here". Home was held at 1080px by
  // .kpage inside a main that allows 1320, and main is left-aligned, so on a 1920 screen 576px
  // sat empty down the right while Journey and People used the full width. Measured, not guessed.
  assert.match(APP, /html\.ui-c \.kpage\{position:relative\}/,
    '.kpage carries no max-width of its own');
  assert.doesNotMatch(APP, /\.kpage\{[^}]*max-width/,
    'and no rule anywhere gives it one back');
  // 30.09.2026, from a screenshot again: "still so much more space you can use". main itself
  // carried max-width:1320px, which left 332px of a 1890px window empty, 18% of the screen, on
  // EVERY screen and not only Home. There is no page cap at all now.
  assert.doesNotMatch(APP, /\nmain\{[^}]*max-width/,
    'main carries no cap either: the window is the width');
});

test('the month chart is drawn wider on a wide screen, and TALLER where Home has room (Q46)', () => {
  // 30.09: drawn 1100 wide on a wide screen, so the type kept its size. 05.10.2026 the owner, on Home's empty
  // space under it: "can be taller" - his newer word replaces the 30.09 "wider, not bigger" lock. The width stays
  // the drawing's (so the type keeps its size) and the HEIGHT is measured for the screen, 260 to 460 px.
  assert.match(APP, /matchMedia\('\(min-width:1500px\)'\)/, 'there is a wide branch');
  assert.match(APP, /const W = narrow \? 360 : wide \? 1100 : 640, H = narrow \? 230 : fitH \|\| 210/,
    'wider drawing; the height is the fitted one, a phone keeps 230');
  assert.match(APP, /const want = Math\.max\(260, Math\.min\(460, box\.height \+ spare\)\)/, 'filled to the bottom, 260 to 460 px');
  assert.match(APP, /svg\.classList\.contains\('narrow'\)\) return false/, 'a phone keeps its height');
  assert.match(APP, /C_HOME_D = D;\n  cFitMonthChart\(D\);\n  cWireCharts\(\);/, 'fitted before the hover is wired');
  assert.match(APP, /html\.ui-c \.kb-top > \.ksec:last-child > \.kdonut\{flex:1\}/, 'the donut stays centred in the taller row');

  // the CSS cap must step at the SAME width, or the two disagree and the chart jumps
  assert.match(APP, /@media \(min-width:1500px\)\{ html\.ui-c \.kchart\{max-width:1500px\} \}/,
    'the cap steps where the drawing does');
});

test('the open / overdue / no next step strip is not on Reports: Today owns it (Q35)', () => {
  // 30.09.2026 it lit up one figure at a time; 05.10.2026 the owner: "Nothing should be duplicated", so it left Reports
  assert.doesNotMatch(APP, /c-nowbar/);
});
