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
    // '.cnav .n.warn' left the list with Q51: the menu count's signal colour is on its NEW mark only, never the figures
    'button[data-t="light"]',   // the light-theme sun
    '.c-what.none',             // no next step: needs you
    '.c-when.today',            // today
    '.c-next.none',             // no next step
    '.c-jp small.none',         // no next step, on the card
    '.c-still b',               // the still-open count
    '.kattn-row b.kattn-on',   // Home: active with no next step - the needs-you meaning
    '.c-reasonbar em',         // Outcomes: a recorded reason that is NOT in the list - drift, needs somebody
    '.chwho-none',            // Channels: not receiving and NOBODY is named to fix it - needs somebody
  ];
  const lines = APP.split('\n').filter((l) => l.includes('var(--c-warn)'));
  for (const l of lines) {
    assert.ok(allowed.some((a) => l.includes(a)), 'amber used somewhere new: ' + l.trim().slice(0, 90));
  }
  assert.ok(lines.length >= 4, 'the real amber signals are still there');
});

// EVERY TOKEN IS A REAL TOKEN (01.10.2026). I wrote background:var(--hover) into the
// Channels board. There is no --hover in this file; the rule simply did nothing, and
// 913 other tests stayed green. A colour that silently does nothing is the same class
// of fault as a wrong colour, and it is cheap to make impossible.
//
// It found two more on its first run. --jt is real: the journey columns declare it
// inline, on the element that uses it, so the whole file is read and not only the
// stylesheet. --t1 was not real. The ramp is --t2/--t3/--t4 and starts at --ink, so
// the sign-in input had been asking for a colour that does not exist.
test('every var(--token) is a token this file declares', () => {
  const css = APP.slice(0, APP.indexOf('</style>'));
  const declared = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]));
  for (const m of APP.matchAll(/style="[^"]*?(--[a-z0-9-]+)\s*:/gi)) declared.add(m[1]);
  const used = new Set([...css.matchAll(/var\((--[a-z0-9-]+)/gi)].map((m) => m[1]));
  const missing = [...used].filter((t) => !declared.has(t));
  assert.deepEqual(missing, [], 'invented tokens: ' + missing.join(', '));
  assert.ok(declared.size > 20, 'the tokens were actually found');
});

// A BROKEN FILE MUST NOT PASS (01.10.2026). A cherry-pick left conflict markers in
// the stylesheet and all 918 tests passed, because every test reads this file as text
// or runs a NAMED SLICE of it, and no slice covered the corrupted lines. The served
// page would have been broken. The cheapest possible check, and it has to exist.
test('no conflict markers survive anywhere in the app', () => {
  const bad = APP.split('\n')
    .map((l, i) => [i + 1, l])
    .filter(([, l]) => /^(<{7}|={7}|>{7})(\s|$)/.test(l));
  assert.deepEqual(bad, [], 'conflict markers at lines ' + bad.map((b) => b[0]).join(', '));
});
