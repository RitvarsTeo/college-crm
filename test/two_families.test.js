// Item 13, 30.09.2026: at most two visual families on the Journey and the person page.
// Rule 11 of show-dont-tell: things that belong together share one signature, and a
// third family is too much. Here the two are URGENCY (the red and amber badges) and the
// SIS chips. The next-step type marks were a third, drawn in the teal accent, so the eye
// had three signatures to learn on one card. Same marks, quiet ink.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');

test('the type marks are ink, not a third accent', () => {
  assert.match(APP, /html\.ui-c \.c-jnext svg\{color:var\(--t3\)\}/, 'the Journey card mark');
  assert.match(APP, /html\.ui-c \.c-tico\{[^}]*color:var\(--t3\)\}/, 'and the same mark elsewhere');
  assert.ok(!/html\.ui-c \.c-tico\{[^}]*color:var\(--pet\)\}/.test(APP), 'no teal on the type mark');
});

test('the two families that remain still carry their own colour', () => {
  // urgency: red for late, amber for today - since Q66 (07.10.2026) on the card's rail and its state word
  assert.match(APP, /--st-over:var\(--j-alarm\);--st-today:var\(--j-soon\)/, 'the tokens: overdue is the alarm, today its own');
  assert.match(APP, /\.c-jp\.c-rail-over\{border-left-color:var\(--st-over\)\}/, 'on the rail');
  assert.match(APP, /\.c-jp\.c-rail-today\{border-left-color:var\(--st-today\)\}/);
  // the SIS chips
  assert.match(APP, /border-left:2px solid var\(--c-sis\)/, 'the SIS chip on the card');
  assert.match(APP, /border-left:3px solid var\(--c-sis\)/, 'and on the person page');
});
