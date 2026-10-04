// HEADER 4 (the owner, 04.10.2026): the menu's blue glow flows into the page top, light only, laid
// over the locked sea (not a fork of it); page titles navy.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');

test('the glow is one layer over the locked sea, on the page, light only', () => {
  assert.match(APP, /html\.ui-c:not\(\[data-theme="dark"\]\) body\{background:radial-gradient\(70% 45% at 0% 0%,rgba\(83,167,219,\.22\) 0%,rgba\(83,167,219,0\) 70%\),var\(--sea\) fixed #f5f7fa\}/);
  assert.match(APP, /html\.ui-c\[data-theme="dark"\] body\{background:var\(--sea\) fixed #0f2f4f\}/, 'dark untouched');
  const sea = APP.match(/html\.ui-c\{--sea:([^}]*)\}/);
  assert.ok(sea && !sea[1].includes('83,167,219'), 'the sea itself is not forked');
});
test('page titles are navy in light', () => {
  assert.match(APP, /html\.ui-c:not\(\[data-theme="dark"\]\) #view h1\{[^}]*color:#0a2463\}/);
});
