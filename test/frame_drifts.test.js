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
