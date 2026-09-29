// Aigars' feedback #2, 28.09.2026: the Journey shows how far each person is, their next step
// is the clearest line on the card, overdue is unmistakable and today is distinct from it -
// restrained, on the brandbook blue. The stages, their order and the workflow do not change.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
const fn = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const line = (start) => { const i = APP.indexOf(start); assert.ok(i >= 0, start); return APP.slice(i, APP.indexOf('\n', i)); };

function sandbox(today = '2026-09-28') {
  const ctx = {
    esc: (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`),
    cTodayIso: () => today, cDay: (iso) => String(iso).slice(0, 10),
    // the card reads the configured next-step list now: the type mark is looked up by label
    CFG: CONFIG,
  };
  const iconStart = APP.indexOf('const C_JICON = {');
  const icons = APP.slice(iconStart, APP.indexOf('\n};', iconStart) + 3);
  vm.runInNewContext(`${line('const cWhenClass =')}\n${line('const cTask =')}\n${line('const cNotePreview =')}\n${line('const cComment =')}\n${icons}\n${fn('function groupForAction(')}\n${line('const cStepIcon =')}\n${fn('function cLifeFacts(')}\n${fn('function cJourneyCard(')}\nthis.card = cJourneyCard;`, ctx);
  return ctx;
}
const person = { id: 'p1', name: 'Example Person' };
const task = (due) => ({ label: 'Send the invoice', due_at: `${due}T09:00:00.000Z` });

test('overdue: red words saying by how much, and a red edge on the card', () => {
  const html = sandbox().card(person, task('2026-09-26'), null);
  assert.match(html, /class="c-jp row is-over"/);
  assert.match(html, /<small class="c-jdue over">.*2 d\. overdue<\/small>/s);
});

test('today: amber "Today", no edge - distinct from overdue without more colour', () => {
  const html = sandbox().card(person, task('2026-09-28'), null);
  assert.match(html, /class="c-jp row is-today"/);
  assert.match(html, /<small class="c-jdue today">.*Today<\/small>/s);
  assert.doesNotMatch(html, /is-over|overdue/);
  assert.doesNotMatch(APP, /\.c-jp\.is-today\{[^}]*border/, 'today never gets the warning edge');
});

test('an ordinary day is quiet: just the date, no state class', () => {
  const html = sandbox().card(person, task('2026-10-02'), null);
  assert.match(html, /class="c-jp row"/);
  assert.match(html, /<small class="c-jdue">2026-10-02<\/small>/);
});

test('the next step is the clearest line: its own element with an arrow, before the date', () => {
  const html = sandbox().card(person, task('2026-10-02'), null);
  const next = html.indexOf('class="c-jnext"'), due = html.indexOf('class="c-jdue');
  assert.ok(next > html.indexOf('<b>Example Person</b>') && next < due, 'name, then next step, then its date');
  assert.match(html, /<span class="c-jnext"><svg[^>]*>.*<\/svg><span>Send the invoice<\/span><\/span>/s);
  assert.match(APP, /html\.ui-c \.c-jnext\{[^}]*color:var\(--ink\)/, 'in full ink, not the quiet grey');
  const none = sandbox().card(person, undefined, null);
  assert.match(none, /<small class="none">No next step<\/small>/, 'no step stays the amber warning it was');
});

test('a next step says what KIND it is: one mark per group, and no new colour', () => {
  // Aigars, 29.09.2026: "a colour or icon per next-step type". An icon, because amber and red
  // already mean today and overdue on this card - a colour per type would argue with the only
  // two colours on the screen that currently mean anything.
  const ic = APP.indexOf('const C_JICON = {');
  const block = APP.slice(APP.indexOf('  type: {', ic), APP.indexOf('\n};', ic));
  const groups = (CONFIG.nextActions || []).map((g) => g.group);
  assert.ok(groups.length >= 3, 'the configured list still has its groups');
  for (const g of groups) {
    assert.ok(block.includes(`'${g}':`), `no mark for the group "${g}" - a new group needs one here`);
  }

  const s = sandbox();
  const iconOf = (label) => {
    const m = s.card(person, { label, due_at: '2026-10-02T09:00:00.000Z' }, null)
      .match(/<span class="c-jnext">(<svg.*?<\/svg>)/s);
    return m && m[1];
  };
  const pay = iconOf('Send the invoice');                  // Contract and payment
  const talk = iconOf('Call and establish interest');      // Conversation and information
  const imported = iconOf('Get in touch (from the sheet)');// the 23.09 import: in no group at all
  assert.ok(pay && talk && imported, 'every card still draws a mark');
  assert.notEqual(pay, talk, 'two different groups, two different marks');
  assert.match(imported, /M3 8h9M8\.5 4\.5 12 8l-3\.5 3\.5/,
    'a step that matches no configured type keeps the plain arrow instead of being put in a group');

  // one colour for all of them, and none smuggles its own in
  assert.match(APP, /html\.ui-c \.c-tico\{[^}]*color:var\(--t3\)\}/, 'the marks share one quiet ink');
  assert.doesNotMatch(block, /fill="#|stroke="#|style="/, 'no mark carries a colour of its own');
});

test('every next step the demo plans is one of the configured types', () => {
  // Two had drifted from the list they are supposed to come from: "Check the documents" for
  // "Check the submitted documents", and "Collect the medical certificate" for "Medical
  // certificate". A task stores its WORDS and not an id, so a label that is not in the list can
  // never be matched back to a type again - not for the mark on the card, and not for any count
  // of steps by kind. Both were found by reading the running demo, not the source.
  const demo = fs.readFileSync(path.join(ROOT, 'src', 'demo.js'), 'utf8');
  const known = new Set();
  for (const g of (CONFIG.nextActions || [])) for (const i of g.items) known.add(i.label);
  const used = [...demo.matchAll(/next: '([^']+)'/g)].map((m) => m[1]);
  assert.ok(used.length >= 10, 'the demo still plans next steps');
  assert.deepEqual([...new Set(used)].filter((l) => !known.has(l)), [],
    'every demo next step must be a label from config.nextActions');
});

test('every Journey stage still appears, in the same order, with its own label', () => {
  const open = (CONFIG.stages || []).filter((s) => !['Admitted', 'Not proceeding'].includes(s.id));
  assert.ok(open.length >= 3);
  const draw = fn('function cDrawJourney(');
  assert.match(draw, /const stages = \(CFG\.stages \|\| \[\]\)\.filter\(\(s\) => !C_TERMINAL\.includes\(s\.id\)\);/, 'the same stage list as before');
  let html = '';
  const ctx = { ...sandbox(), CFG: CONFIG, C_TERMINAL: ['Admitted', 'Not proceeding'], C_JSEL: null,
    C_JDATA: { people: [{ id: 'a', name: 'A', status: open[0].id }], taskOf: new Map() },
    cPersonCard: () => '', channelLabel: (c) => c, $: () => ({ set innerHTML(v) { html = v; } }), document: { querySelectorAll: () => [], querySelector: () => null, addEventListener: () => {} }, window: {} };
  const cardSrc = fn('function cJourneyCard(');
  const iconStart = APP.indexOf('const C_JICON = {');
  const filters = APP.slice(APP.indexOf('let C_JF = {'), APP.indexOf('function cDrawJourney('));   // the Journey filters (2A)
  vm.runInNewContext(`${line('const cWhenClass =')}\n${line('const cTask =')}\n${line('const cNotePreview =')}\n${line('const cComment =')}\n${APP.slice(iconStart, APP.indexOf('\n};', iconStart) + 3)}\n${fn('function groupForAction(')}\n${line('const cStepIcon =')}\n${fn('function cLifeFacts(')}\n${cardSrc}\n${filters}\n${draw}\ncDrawJourney();`, ctx);
  const heads = [...html.matchAll(/<h3><span class="c-jn">(\d+)<\/span>([^<]+) <b>/g)].map((m) => [Number(m[1]), m[2]]);
  assert.deepEqual(heads, open.map((s, i) => [i + 1, s.label || s.id]), 'numbered 1..n, labels exactly as configured');
});

test('how far: one brandbook hue getting darker per stage, a faint tint only - no rainbow', () => {
  assert.match(APP, /html\.ui-c\{--j-from:#53a7db;--j-to:#0a2463\}/, 'Novikontas Blue to Navy');
  assert.match(APP, /--jt:\$\{\(\(i \+ 1\) \/ stages\.length\)\.toFixed\(3\)\}/, 'each column its place in the order');
  assert.match(APP, /\.c-col\{background:color-mix\(in srgb,var\(--c-sunk\),var\(--j-from\) calc\(var\(--jt,0\) \* 7%\)\)/, 'at most a 7% tint');
});

test('dark mode keeps the warning edge (the glass border would hide it) and the numbers', () => {
  assert.match(APP, /html\.ui-c\[data-theme="dark"\] \.c-jp\.is-over\{border-left:3px solid var\(--j-alarm\)/);
  assert.match(APP, /html\.ui-c\[data-theme="dark"\] \.c-col\{background:color-mix\(in srgb,rgba\(1,17,17,\.55\)/, 'dark columns deeper than their cards');
  assert.match(APP, /--j-from:#1d4d7a;--j-to:#8fcbef;   \/\* the Journey/, 'inside the one dark palette block');
});

test('phone widths: columns keep their minimum and scroll sideways as before; dates never wrap', () => {
  assert.match(APP, /repeat\(\$\{stages\.length\}, minmax\(150px, 1fr\)\)/);
  assert.match(APP, /html\.ui-c \.c-cols\{display:grid;gap:10px;overflow-x:auto/);
  assert.match(APP, /html\.ui-c \.c-jp small\.c-jdue\{white-space:nowrap\}/);
});

test('no sentence explaining the Journey: the screen says it itself', () => {
  // the owner, 28.09.2026: "If you have to explain items, the UIUX can be better"
  assert.doesNotMatch(APP, /Where each open person is\. Drag a person when something real has happened\./);
  assert.match(fn('function cDrawJourney('), /<div class="c-head"><div><h1>Journey<\/h1><\/div><\/div>/);
});

test('warnings look like warnings: overdue is a SOLID red badge with white words, 4.5:1 or more', () => {
  // Aigars: "warning messedzus bik cita krasa, sita tada draudziga, neliekas ka vispar kkas nav labi"
  const alarm = APP.match(/html\.ui-c\{--j-alarm:(#[0-9a-f]{6});--j-on-alarm:(#[0-9a-f]{6});/);
  assert.ok(alarm, 'one alarm pair for both themes');
  const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const lum = (h) => rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  assert.ok(cr(alarm[1], alarm[2]) >= 4.5, `badge words ${cr(alarm[1], alarm[2]).toFixed(2)}:1`);
  assert.match(APP, /html\.ui-c \.c-jp small\.c-jdue\.over\{background:var\(--j-alarm\);color:var\(--j-on-alarm\)/, 'the card badge');
  assert.match(APP, /html\.ui-c \.c-jover\{[^}]*background:var\(--j-alarm\);color:var\(--j-on-alarm\)/, 'the column count badge');
  assert.match(APP, /html\.ui-c \.c-jp small\.c-jdue\.today\{background:var\(--j-soon\);color:var\(--j-on-soon\)/, 'today is a SOLID amber badge');
});
