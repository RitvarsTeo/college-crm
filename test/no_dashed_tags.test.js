// Item 5, 30.09.2026: the dashed amber "to agree" tag is gone from the C screens.
// A stage list that is still being agreed is a project fact, not something the screen
// should nag about every time somebody opens it. A value outside the configured list is
// a FACT about the data, so it reads in slate; amber stays rank 2 - today, or needs you.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');

test('no c-dec anywhere, and no "to agree" tag on any screen', () => {
  assert.equal(APP.split('c-dec').length - 1, 0, 'the dashed tag class is gone');
  for (const s of ['Stages to agree', 'Stages and next steps to agree']) {
    assert.ok(!APP.includes(s), s);
  }
});

test('"not in list" reads in slate, with a solid border', () => {
  assert.match(APP, /html\.ui-c \.c-tag\{[^}]*color:var\(--t3\)[^}]*border:1px solid var\(--rule\)/,
    'slate ink, solid hairline, no amber and no dashes');
  assert.match(APP, /<span class="c-tag">not in list<\/span>/, 'People and the person page still mark it');
});

test('amber is only ever today, a count, or needs-you', () => {
  const allowed = [
    '.cnav .n.warn',            // the sidebar count
    'button[data-t="light"]',   // the light-theme sun
    '.c-what.none',             // no next step: needs you
    '.c-when.today',            // today
    '.c-next.none',             // no next step
    '.c-jp small.none',         // no next step, on the card
    '.c-still b',               // the still-open count
    '.kattn-row b.kattn-on',   // Home: active with no next step - the needs-you meaning
    '.c-reasonbar em',         // Outcomes: a recorded reason that is NOT in the list - drift, needs somebody
    '.chwho b.chwho-none',    // Channels: not receiving and NOBODY is named to fix it - needs somebody
  ];
  const lines = APP.split('\n').filter((l) => l.includes('var(--c-warn)'));
  for (const l of lines) {
    assert.ok(allowed.some((a) => l.includes(a)), 'amber used somewhere new: ' + l.trim().slice(0, 90));
  }
  assert.ok(lines.length >= 5, 'the real amber signals are still there');
});
