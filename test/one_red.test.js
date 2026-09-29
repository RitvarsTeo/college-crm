// Item 8, 30.09.2026: one red in the app, and late is red rather than amber.
// Rank 2 of the colour hierarchy gives each signal ONE meaning: red = late or alert,
// amber = today or needs you. C carried a second, softer red (#9f3a31) beside the
// kit's #b3261e, and in dark it painted "late" amber, which collided with "today".
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');

test('one red: the second red is gone', () => {
  assert.equal(APP.split('#9f3a31').length - 1, 0, 'the softer red is gone');
  assert.match(APP, /--bad:#b3261e/, 'light --bad is the kit red');
  assert.match(APP, /--c-bad:#b3261e/, 'and so is C');
});

test('late is red, today stays amber', () => {
  assert.ok(!/--late:#F7C04F/.test(APP), 'dark late is not the amber');
  assert.match(APP, /--late:#ffb0a8/, 'dark late is the dark red');
  assert.match(APP, /--warn:#F7C04F/, 'and amber is still amber, for today');
});

test('FAILED reads as a failure', () => {
  assert.match(APP, /\.no-tick\{color:var\(--bad\)/, 'red, not grey and not amber');
});

test('the SIS blue has a name', () => {
  assert.match(APP, /--c-sis:#29a8df/, 'declared in both palettes');
  assert.equal(APP.split('--c-sis:#29a8df').length - 1, 2, 'light and dark');
  assert.ok(!/border-left:\dpx solid #29a8df/.test(APP), 'no hex repeated in a rule');
  assert.match(APP, /border-left:3px solid var\(--c-sis\)/, 'the person-page fact');
  assert.match(APP, /border-left:2px solid var\(--c-sis\)/, 'the Journey card chip');
});
