// "this is too much of font size! fix it!" (the owner on the production Inbox, 05.10.2026): a message body is a
// detail - 13px, slate, normal weight, two lines at most - and the sender keeps the name size.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');

test('the Inbox message text is detail size, slate, and clamped to two lines', () => {
  assert.match(APP, /html\.ui-c #view \.c-lead \.c-what\{font-size:var\(--type-detail\);font-weight:400;color:var\(--t3\);[^}]*-webkit-line-clamp:2;[^}]*overflow:hidden\}/);
  assert.match(APP, /<div class="c-line row c-lead/, 'the rule targets the Inbox rows the view really draws');
  assert.match(APP, /--type-detail:13px/);
});
test('the note under a step follows the same rule', () => {
  assert.match(APP, /html\.ui-c #view \.c-nnote\{font-size:var\(--type-detail\);white-space:normal;[^}]*-webkit-line-clamp:2;/);
});
test('the sender keeps the name size', () => {
  assert.match(APP, /html\.ui-c #view \.c-who b, html\.ui-c #view \.c-jp > b, html\.ui-c #view \.c-card h2\{font-size:var\(--type-name\)/);
});
