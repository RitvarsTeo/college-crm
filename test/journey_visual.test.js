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
const FOLD = APP.slice(APP.indexOf('const C_UNFOLD = '), APP.indexOf('let C_TP = ')).replace(/^const /gm, 'var ') + '\n';   // the fold helper (08.10.2026), as vars so two boards can share one context
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
const fn = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const line = (start) => { const i = APP.indexOf(start); assert.ok(i >= 0, start); return APP.slice(i, APP.indexOf('\n', i)); };
// Q66 (07.10.2026): the state line, the rail and the column bands the card and the column draw with
const stateHelpers = () => [line('const cDaysLate ='), line('const C_ST ='), line('const C_ST_RAIL ='), fn('function cStateLine('), line('const cDdMm ='),
  fn('function cStepState('), line('const cStepGroup ='), line('const cChooseOnCard ='), line('const C_GRP ='), line('const cGroupBand =')].join('\n');

function sandbox(today = '2026-09-28') {
  const ctx = {
    esc: (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`),
    cTodayIso: () => today, cDay: (iso) => String(iso).slice(0, 10),
    // the card reads the configured next-step list now: the type mark is looked up by label
    CFG: CONFIG,
  };
  const iconStart = APP.indexOf('const C_JICON = {');
  const icons = APP.slice(iconStart, APP.indexOf('\n};', iconStart) + 3);
  vm.runInNewContext(`${line('const cWhenClass =')}\n${line('const cTask =')}\n${line('const cNotePreview =')}\n${line('const cComment =')}\n${icons}\n${fn('function groupForAction(')}\n${line('const cStepIcon =')}\n${fn('function cLifeFacts(')}\n${line('const C_SIS_HOLDS =')}
${line('const cSisHolds =')}
${line('const cSisHeld =')}
${line('const cChooseNext =')}\n${stateHelpers()}\n${fn('function cJourneyCard(')}\nthis.card = cJourneyCard;`, ctx);
  return ctx;
}
const person = { id: 'p1', name: 'Example Person' };
const task = (due) => ({ label: 'Send the invoice', due_at: `${due}T09:00:00.000Z` });

// Q66 (the owner's pick "B as drawn", 07.10.2026): every card ends with ONE state line in the same place - a bold word
// and its detail - and carries a 3px left rail in the state's colour. The badges and the "Choose next step" button left.
test('overdue: red word saying by how much, and a red rail on the card', () => {
  const html = sandbox().card(person, task('2026-09-26'), null);
  assert.match(html, /class="c-jp row c-rail c-rail-over is-over"/);
  assert.match(html, /<div class="c-st c-st-over"><span class="c-st-w">Overdue<\/span><span class="c-st-d">· 2 d<\/span><\/div><\/div>$/, 'the last line of the card');
});

test('today: "Due today" on an amber rail - distinct from overdue without more colour', () => {
  const html = sandbox().card(person, task('2026-09-28'), null);
  assert.match(html, /class="c-jp row c-rail c-rail-today is-today"/);
  assert.match(html, /<div class="c-st c-st-today"><span class="c-st-w">Due today<\/span><\/div>/);
  assert.doesNotMatch(html, /is-over|Overdue/);
  assert.match(APP, /html\.ui-c \.c-jp\.c-rail-today\{border-left-color:var\(--st-today\)\}/, 'on the rail only');
  assert.match(APP, /--st-today:var\(--st-track\)/, 'Q69: due today is on track, navy');
  assert.doesNotMatch(APP, /\.c-st-today \.c-st-w\{color:var\(--j-soon\)/, 'never amber text');
});

test('an ordinary day is quiet: "Due" and the date as dd.mm, the navy rail', () => {
  const html = sandbox().card(person, task('2026-10-02'), null);
  assert.match(html, /class="c-jp row c-rail c-rail-due"/);
  assert.match(html, /<div class="c-st c-st-due"><span class="c-st-w">Due<\/span><span class="c-st-d">· 02\.10<\/span><\/div>/);
});

test('the next step is the clearest line: its own element with an arrow, before the state line', () => {
  const html = sandbox().card(person, task('2026-10-02'), null);
  const next = html.indexOf('class="c-jnext"'), due = html.indexOf('class="c-st ');
  assert.ok(next > html.indexOf('<b>Example Person</b>') && next < due, 'name, then next step, then its date');
  assert.match(html, /<span class="c-jnext"><svg[^>]*>.*<\/svg><span>Send the invoice<\/span><\/span>/s);
  assert.match(APP, /html\.ui-c \.c-jnext\{[^}]*color:var\(--ink\)/, 'in full ink, not the quiet grey');
  const none = sandbox().card(person, undefined, null);
  // Q44 (05.10) made no-next-step an amber edge and a button; Q66 (07.10, "B as drawn") made it the grey rail and the
  // state line "No next step" carrying its action, Choose, which opens the next-step dialog for that person right there.
  // He was told the grey is quieter than the amber and chose it.
  assert.match(none, /class="c-jp row c-rail c-rail-none is-none"/, 'the grey rail marks the card');
  assert.match(none, /<div class="c-st c-st-none"><span class="c-st-w">No next step<\/span><button type="button" class="c-st-act" onclick="event\.stopPropagation\(\);openNewTask\((?:"|&#34;|&quot;)p1(?:"|&#34;|&quot;)\)"[^>]*>Choose ›<\/button><\/div>/);
  assert.doesNotMatch(none, /<small class="none">|c-choose/, 'no soft amber text, no button');
  assert.doesNotMatch(APP, /\.c-jp\.is-none[^{]*\{[^}]*#F7C04F/, 'the amber edge is gone from the cards');
  assert.doesNotMatch(APP, /\.c-jp small\.none\{color|\.c-what\.none\{color|\.c-next\.none\{[^}]*color:var\(--c-warn\)/, 'amber is never a text colour for no next step');
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
  const draw = (FOLD + fn('function cDrawJourney('));
  // Q57: the five stages as before; an end column joins them only when a way in targets it
  assert.match(draw, /const stages = \(CFG\.stages \|\| \[\]\)\.filter\(\(s\) => !C_TERMINAL\.includes\(s\.id\) \|\| ends\.includes\(s\.id\)\);/, 'the same stage list as before');
  let html = '';
  const ctx = { ...sandbox(), CFG: CONFIG, C_TERMINAL: ['Admitted', 'Not proceeding'], C_JSEL: null,
    C_PCOHORT: null, C_PF: {}, C_OUT_TAG: null, C_OUT_REASON: null, C_OUT_FILTER: null,
    C_JDATA: { people: [{ id: 'a', name: 'A', status: open[0].id }], taskOf: new Map() },
    cPersonCard: () => '', channelLabel: (c) => c, $: () => ({ set innerHTML(v) { html = v; } }), document: { querySelectorAll: () => [], querySelector: () => null, addEventListener: () => {} }, window: {} };
  const cardSrc = fn('function cJourneyCard(');
  const iconStart = APP.indexOf('const C_JICON = {');
  const filters = APP.slice(APP.indexOf('let C_JF = {'), APP.indexOf('function cDrawJourney('));   // the Journey filters (2A)
  ctx.C_JTALK = new Map();
  ctx.C_JTALK_BUSY = new Set();                        // the conversation: its own test owns it
  ctx.cTalkHtml = () => '<talk>';
  ctx.cJourneyTalk = async () => {};
  ctx.C_JEXITS = null;                            // no exit data: every mark reads zero
  ctx.cPeopleTabs = (which) => `<tabs ${which}>`; // the tabs have their own test
  ctx.cJourneySummary = () => '';                 // and so does the summary
  ctx.cPoolViewSwitch = () => '<switch>';        // Q47: List | Board, its own test
  ctx.cPoolWire = () => {}; ctx.cJourneyMini = () => {};   // Q68: the phone strip, its own test
  vm.runInNewContext(`${line('const cWhenClass =')}\n${line('const cTask =')}\n${line('const cNotePreview =')}\n${line('const cComment =')}\n${APP.slice(iconStart, APP.indexOf('\n};', iconStart) + 3)}\n${fn('function groupForAction(')}\n${line('const cStepIcon =')}\n${fn('function cLifeFacts(')}\n${line('const C_SIS_HOLDS =')}
${line('const cSisHolds =')}
${line('const cSisHeld =')}
${line('const cChooseNext =')}\n${line('const cPhone =')}\n${stateHelpers()}\n${cardSrc}\n${filters}\n${draw}\ncDrawJourney();`, ctx);
  // Q43: the header is the stage's number and name; its count is the band's (no <b>count</b> here any more)
  // an empty stage is folded to its strip (08.10.2026, "Build it"): the same number and label, in its place
  const heads = [...html.matchAll(/<h3><span class="c-jn">(\d+)<\/span>([^<]+?)(?:<button|<\/h3>)|<span class="c-jn">(\d+)<\/span><span class="t-foldl">([^<]+)<\/span>/g)]
    .map((m) => (m[1] ? [Number(m[1]), m[2]] : [Number(m[3]), m[4]]));
  assert.doesNotMatch(html, /<h3><span class="c-jn">\d+<\/span>[^<]+ <b>\d+<\/b>/, 'no stage count in the board header');
  assert.deepEqual(heads, open.map((s, i) => [i + 1, s.label || s.id]), 'numbered 1..n, labels exactly as configured');
  assert.equal((html.match(/<h3><span class="c-jn">/g) || []).length, 1, 'only the stage with a person is open');
});

test('how far: one brandbook hue getting darker per stage, a faint tint only - no rainbow', () => {
  assert.match(APP, /html\.ui-c\{--j-from:#53a7db;--j-to:#0a2463\}/, 'Novikontas Blue to Navy');
  assert.match(APP, /--jt:\$\{\(\(i \+ 1\) \/ stages\.length\)\.toFixed\(3\)\}/, 'each column its place in the order');
  assert.match(APP, /\.c-col\{background:color-mix\(in srgb,var\(--c-sunk\),var\(--j-from\) calc\(var\(--jt,0\) \* 7%\)\)/, 'at most a 7% tint');
});

test('dark mode keeps the rail (the glass border would hide it) and the numbers', () => {
  assert.match(APP, /html\.ui-c \.c-jp\.c-rail,html\.ui-c\[data-theme="dark"\] \.c-jp\.c-rail\{border-left:3px solid var\(--rule\);padding-left:8px\}/, 'dark named too');
  assert.match(APP, /html\.ui-c \.c-jp\.c-rail-over\{border-left-color:var\(--st-over\)\}/, 'the alarm rail, both themes');
  assert.match(APP, /--st-need:var\(--j-alarm\)/, 'Q69: needs you is the alarm red');
  assert.match(APP, /html\.ui-c\[data-theme="dark"\] \.c-col\{background:color-mix\(in srgb,rgba\(1,17,17,\.55\)/, 'dark columns deeper than their cards');
  assert.match(APP, /--j-from:#1d4d7a;--j-to:#8fcbef;   \/\* the Journey/, 'inside the one dark palette block');
});

test('phone widths: columns keep their minimum and scroll sideways as before; dates never wrap', () => {
  // every column keeps 150px; the column holding the opened person widens to 330px (02.10.2026)
  assert.match(APP, /sel && sel\.status === s\.id \? 'minmax\(330px, 2\.4fr\)' : jFold\(s\) \? '92px' : 'minmax\(150px, 1fr\)'/, 'an empty stage folds to 92px (08.10.2026)');
  assert.match(APP, /html\.ui-c \.c-cols\{display:grid;gap:10px;overflow-x:auto/);
  assert.match(APP, /html\.ui-c \.c-st-w\{font-weight:700;white-space:nowrap/, 'the state word never breaks');
});

test('no sentence explaining the Journey: the screen says it itself', () => {
  // the owner, 28.09.2026: "If you have to explain items, the UIUX can be better"
  assert.doesNotMatch(APP, /Where each open person is\. Drag a person when something real has happened\./);
  // Journey is one of two tabs inside People now (the owner, 01.10.2026), so the screen
  // is titled People and the tab says which view you are on. Still no explaining sentence.
  // the title carries no <p>; since 02.10.2026 Add lead sits beside it (leads are added with the leads)
  // 05.10.2026: People is everyone and Journey its child, so the screen is titled Journey under a People crumb
  // Q47: the Journey is everyone; the board carries the List | Board switch beside Add lead, no crumb
  assert.match((FOLD + fn('function cDrawJourney(')), /<div class="c-head"><div><h1>Journey<\/h1><\/div><div class="act">\$\{cPoolViewSwitch\(\)\}<button class="btn" onclick="openAdd\(\)">Add lead<\/button><\/div><\/div>/);
});

test('warnings look like warnings: overdue is a SOLID red badge with white words, 4.5:1 or more', () => {
  // Aigars: "warning messedzus bik cita krasa, sita tada draudziga, neliekas ka vispar kkas nav labi"
  const alarm = APP.match(/html\.ui-c\{--j-alarm:(#[0-9a-f]{6});--j-on-alarm:(#[0-9a-f]{6});/);
  assert.ok(alarm, 'one alarm pair for both themes');
  const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const lum = (h) => rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  assert.ok(cr(alarm[1], alarm[2]) >= 4.5, `badge words ${cr(alarm[1], alarm[2]).toFixed(2)}:1`);
  // Q66: the alarm is the card's rail, its state word and the Overdue band inside the column; the header pill is gone
  assert.match(APP, /html\.ui-c \.c-jp\.c-rail-over\{border-left-color:var\(--st-over\)\}/, 'the card rail');
  assert.match(APP, /html\.ui-c \.c-st-over \.c-st-w,html\.ui-c \.c-st-late \.c-st-w,html\.ui-c \.c-st-none \.c-st-w,html\.ui-c \.c-st-now \.c-st-w\{color:var\(--st-need\)\}/, 'the state word');
  assert.match(APP, /html\.ui-c \.c-grp-over,html\.ui-c \.c-grp-none\{[^}]*background:color-mix\(in srgb,var\(--st-need\),transparent 86%\);color:var\(--st-need\)/, 'the red bands');
  assert.match(APP, /html\.ui-c \.jb-s-need\{background:var\(--st-need\)\}/, 'and the graph, from the same token');
  assert.doesNotMatch(APP, /c-jover/, 'the header pill is gone: the band says it once');
  assert.match(APP, /html\.ui-c \.c-jp\.c-rail-today\{border-left-color:var\(--st-today\)\}/, 'today is on the rail (navy since Q69)');
});
