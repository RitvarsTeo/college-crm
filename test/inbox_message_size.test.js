// "this is too much of font size! fix it!" (the owner on the production Inbox, 05.10.2026): a message body is a
// detail - 13px, slate, normal weight, two lines at most - and the sender keeps the name size.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');

test('the Inbox message text is detail size, slate, and clamped (three lines on the card, as pictured)', () => {
  // Q62 (06.10.2026): the Inbox is a board of cards (the owner's pick A); the message keeps the 05.10 rule - a detail,
  // 13px, slate - clamped to the three lines the picked picture showed; the open card shows it whole
  assert.match(APP, /html\.ui-c #view \.ib-card \.ib-msg\{font-size:var\(--type-detail\);font-weight:400;color:var\(--t3\);[^}]*-webkit-line-clamp:3;[^}]*overflow:hidden\}/);
  assert.match(APP, /html\.ui-c #view \.ib-card\.is-open \.ib-msg\{-webkit-line-clamp:unset;color:var\(--ink\)\}/);
  assert.match(APP, /<div class="c-jp row ib-card/, 'the rule targets the cards the view really draws');
  assert.match(APP, /--type-detail:13px/);
});
test('the note under a step follows the same rule', () => {
  assert.match(APP, /html\.ui-c #view \.c-nnote\{font-size:var\(--type-detail\);white-space:normal;[^}]*-webkit-line-clamp:2;/);
});
test('the sender keeps the name size', () => {
  assert.match(APP, /html\.ui-c #view \.c-who b, html\.ui-c #view \.c-jp > b, html\.ui-c #view \.c-card h2\{font-size:var\(--type-name\)/);
});
