// Item 4, 30.09.2026: no sentence on a screen explaining how to use the screen.
// The kit's First rule: if a screen needs a sentence, fix the screen.
//
// STATUS LINES STAY. A count, a date, a character counter and a refusal are what a
// screen is for; only the prose that teaches the user how to operate it goes.
// The Help center keeps its descriptions: explaining is its job.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');

const REMOVED = [
  'What the team has to do.',
  'New arrivals land here first.',
  'Click a row to edit.',
  'a programme that is not one of the list.',
  'Read from the message. Leave it if it is right, change it if it is not.',
  'The message did not say. If you already know, say so here.',
  'Required: nobody is in Admissions without a next step.',
  'Change the date here, or mark it done - done asks for the next step.',
  'Finished journeys have no next step.',
  'The CRM journey ends here.',
  'A dashed chip was read by the machine and nobody confirmed it. It is not counted anywhere.',
  'It is not hidden from you by this page alone',
  'Change it to anything else.',
  'Required. Nobody sits in Admissions without somebody scheduled to act.',
];

test('every helper sentence is gone, named one by one', () => {
  const left = REMOVED.filter((s) => APP.includes(s));
  assert.deepEqual(left, [], 'these still explain the screen to the user');
});

test('the status lines that carry a value are still there', () => {
  assert.match(APP, /\$\{\(p\.notes \|\| ''\)\.length\} characters/, 'the note counter is a value');
  assert.match(APP, /Handed to the SIS on \$\{fmtDate\(p\.sis_handoff_at\)\}/, 'the handoff date is a value');
  assert.match(APP, /'Data to tidy', `\$\{odd\} not in the list`/, 'the count stays, the sentence went');
  assert.match(APP, /Admins only\./, 'a refusal still says no');
});

test('the Help center still explains itself', () => {
  assert.match(APP, /<b>Next Steps<\/b><small>What the team has to do: overdue, due today, coming up/,
    'explaining is what a help page is for');
});
