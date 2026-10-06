// A missed call you can ring back (29.09.2026). The phone job put 9 real calls into New Leads and
// every row read "Unknown" with no number anywhere on it, so the one thing an operator needs after
// a missed call - the number - was the one thing the screen did not show. The inbound row had it
// all along: sync.js storeCall passes phone: r.caller_num into receive(), and listInbound selects
// i.*, so contact_phone reaches the browser. Only the row template dropped it.
//
// The classic view (?ui=classic) had always printed it in a sub-line; concept C never did.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const SYNC = fs.readFileSync(path.join(ROOT, 'src', 'sync.js'), 'utf8');

test('an Inbox card with no name shows the number, as a call link', () => {
  // Q62 (06.10.2026): the Inbox is a board of cards; the card's name slot is built in ONE place, who(r)
  const anchor = "const who = (r) => esc(r.contact_name || r.contact_handle || '')";
  assert.equal(APP.split(anchor).length - 1, 1, 'exactly one place falls back to the number');
  const i = APP.indexOf(anchor);
  const row = APP.slice(i, i + 160);
  assert.match(row, /cTelLink\(\{ phone: r\.contact_phone \}\)/,
    'the number falls into the name slot when there is no name and no handle');
  assert.match(row, /\|\| 'Unknown'/, 'and Unknown is only the last resort, when there is no number either');
  assert.ok(row.indexOf('cTelLink') < row.indexOf("'Unknown'"),
    'the number comes BEFORE Unknown, otherwise it could never be reached');
  assert.match(APP, /<b class="c-reach">\$\{who\(r\)\}<\/b>/, 'so the link takes the one call / write look, on the card');
});

test('the number really is on the inbound row, not only in pbx_calls', () => {
  // if this ever stops being true the screen goes quietly back to "Unknown"
  assert.match(SYNC, /phone: r\.caller_num/, 'storeCall hands the caller number to receive()');
});

test('no sentence was added to explain it: the number is the whole change', () => {
  // his standing rule: the screen says it itself
  assert.doesNotMatch(APP, /Missed call from this number/i);
  assert.doesNotMatch(APP, /call them back/i);
});

// ---------------------------------------------------- one row, however many calls
// Ritvars, 01.10.2026. A stranger ringing three times is one person to ring back, so
// sync.js keeps them on one row and appends a line per call. Printed raw that is
// three near-identical sentences on a queue you SCAN, which is the fault P5 names:
// the row must show what you decide on, not everything that is known.
test('a number that rang more than once reads as a count, not a wall of sentences', () => {
  const vm = require('node:vm');
  const i = APP.indexOf('function cCallLine(');
  assert.ok(i >= 0, 'cCallLine exists');
  const ctx = {};
  vm.runInNewContext(APP.slice(i, APP.indexOf('\n}\n', i) + 2) + '\nthis.line = cCallLine;', ctx);

  const one = 'Missed call on button 3 (Other)';
  assert.equal(ctx.line(one), one, 'one call is its own sentence, untouched');

  const three = [one,
    'Rang again 2026-10-01 11:31, missed call on button 3 (Other)',
    'Rang again 2026-10-01 11:52, incoming call on button 1 (Admissions), answered by Ieva'].join('\n');
  assert.equal(ctx.line(three), '3 calls, last answered 11:52');

  const twoMissed = [one, 'Rang again 2026-10-01 11:31, missed call on button 3 (Other)'].join('\n');
  assert.equal(ctx.line(twoMissed), '2 calls, last missed 11:31',
    'missed is the word that decides whether somebody rings back');

  assert.equal(ctx.line(''), '', 'an empty body stays empty, it never reads "0 calls"');
});

// Only a phone row is summarised. A WhatsApp message with line breaks is one message,
// and counting its lines as calls would be a lie on the screen.
test('the count is applied to phone rows only', () => {
  // the Inbox row, not the Next Steps one: both build a .c-what and Next Steps comes
  // first in the file, which is the trap this file was written about
  const i = APP.indexOf('cCallLine(r.body)');
  assert.ok(i >= 0, 'the Inbox card calls cCallLine');
  const row = APP.slice(APP.lastIndexOf('<div class="ib-msg">', i), i + 90);   // Q62: the card's message line
  assert.match(row, /r\.channel === 'phone' \? cCallLine\(r\.body\)/);
  assert.match(row, /: \(r\.body \|\| D\.val\(r, 'question'\) \|\| ''\)/);
});
