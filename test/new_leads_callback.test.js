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

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const SYNC = fs.readFileSync(path.join(ROOT, 'src', 'sync.js'), 'utf8');

test('a New Leads row with no name shows the number, as a call link', () => {
  // the New Leads row specifically: seven places build a .c-who, and the Next Steps one comes
  // first in the file, so a looser anchor reads the wrong row and passes or fails for the wrong reason
  const anchor = '<div class="c-who"><b class="c-reach">';
  assert.equal(APP.split(anchor).length - 1, 1, 'exactly one row falls back to the number');
  const i = APP.indexOf(anchor);
  const row = APP.slice(i, i + 260);
  assert.match(row, /cTelLink\(\{ phone: r\.contact_phone \}\)/,
    'the number falls into the name slot when there is no name and no handle');
  assert.match(row, /\|\| 'Unknown'/, 'and Unknown is only the last resort, when there is no number either');
  assert.ok(row.indexOf('cTelLink') < row.indexOf("'Unknown'"),
    'the number comes BEFORE Unknown, otherwise it could never be reached');
  assert.match(row, /<b class="c-reach">/, 'so the link takes the one call / write look');
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
