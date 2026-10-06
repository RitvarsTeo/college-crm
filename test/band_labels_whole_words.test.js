// The Journey band's labels never break inside a word (MASTER CONTROL for the owner, 06.10.2026, seen at 375 px:
// "Contac/ted", "Applic/ation"). Measured in the browser: a 375 px phone gives each stage column 55 px, and
// "Application" needs 61 px at 11 px; at 17cqi of the cell it is 9.3 px and fits; at 1440 the cap keeps 12 px.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');

test('a band label wraps only between words, never inside one', () => {
  const rule = APP.match(/html\.ui-c \.jb-l\{display:flex;[^}]*\}/)[0];
  assert.match(rule, /overflow-wrap:normal;word-break:normal;hyphens:manual/);
  assert.doesNotMatch(APP, /\.jb-l\{[^}]*overflow-wrap:anywhere/, 'the mid-word break is gone');
});

test('on a narrow column the label size follows the column, so the longest word fits', () => {
  assert.match(APP, /html\.ui-c \.jb-cell\{[^}]*container-type:inline-size\}/, 'the cell is the size container');
  assert.match(APP, /html\.ui-c \.jb-l\{display:flex;[^}]*font-size:clamp\(8\.5px,17cqi,12px\)/, 'wide screens keep 12 px');
  assert.match(APP, /html\.ui-c \.jb-l\{font-size:clamp\(8\.5px,17cqi,11px\)\}/, 'the phone rule follows the column too');
});
