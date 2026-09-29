// Aigars' feedback 2A, 28.09.2026: real Journey filters - Programme, Overdue / Today, Owner, Came
// from - as compact dropdowns that combine, offering only the values the data has.
//
// 29.09.2026: each one now holds a LIST, so several values can be ticked. An empty list means all.
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
const DASH = '—';

function load(today = '2026-09-28') {
  const ctx = { CFG: CONFIG, esc: (s) => String(s ?? ''), channelLabel: (c) => `label:${c}`, cTodayIso: () => today, cDay: (iso) => String(iso).slice(0, 10) };
  const i = APP.indexOf('let C_JF = {'); const j = APP.indexOf('function cJourneyMatch(');
  vm.runInNewContext([line('const cWhenClass ='), APP.slice(i, j), fn('function cJourneyMatch('), fn('function cJourneyFilters('),
    'this.match = cJourneyMatch; this.filters = cJourneyFilters; this.setF = (f) => { C_JF = f; };',
    'this.setOpen = (k) => { C_JFOPEN = k; }; this.empty = C_JF_EMPTY;'].join('\n'), ctx);
  return ctx;
}
const due = (d) => ({ due_at: `${d}T09:00:00.000Z` });
const PEOPLE = [
  { id: 'a', programme: 'NAV', owner: 'Admissions', source_channel: 'website', t: due('2026-09-26') },
  { id: 'b', programme: 'ENG', owner: 'Admissions', source_channel: 'phone', t: due('2026-09-28') },
  { id: 'c', programme: 'NAV', owner: 'Marketing', source_channel: 'website', t: due('2026-10-02') },
  { id: 'd', programme: null, owner: null, source_channel: null, t: null },
];
const run = (f) => { const c = load(); return PEOPLE.filter((p) => c.match(p, p.t, { ...c.empty(), ...f })).map((p) => p.id); };

test('each filter on its own', () => {
  assert.deepEqual(run({}), ['a', 'b', 'c', 'd'], 'no filter shows everybody');
  assert.deepEqual(run({ programme: ['NAV'] }), ['a', 'c']);
  assert.deepEqual(run({ due: ['over'] }), ['a']);
  assert.deepEqual(run({ due: ['today'] }), ['b']);
  assert.deepEqual(run({ owner: ['Marketing'] }), ['c']);
  assert.deepEqual(run({ source: ['phone'] }), ['b']);
  assert.deepEqual(run({ programme: [DASH] }), ['d'], '"not recorded" finds the people with nothing recorded');
});

test('several values in one filter: any of them counts', () => {
  assert.deepEqual(run({ programme: ['NAV', 'ENG'] }), ['a', 'b', 'c']);
  assert.deepEqual(run({ owner: ['Admissions', 'Marketing'] }), ['a', 'b', 'c']);
  assert.deepEqual(run({ source: ['phone', 'website'] }), ['a', 'b', 'c']);
  // this is the pair that used to be a third option of its own and was dropped as a designed
  // choice; as two ticks it is the manager's own choice and costs nothing
  assert.deepEqual(run({ due: ['over', 'today'] }), ['a', 'b'], 'overdue AND today, together again');
  assert.deepEqual(run({ programme: ['NAV', DASH] }), ['a', 'c', 'd'], 'a real value and "not recorded" together');
});

test('filters still combine: every one that is set must hold', () => {
  assert.deepEqual(run({ programme: ['NAV'], source: ['website'] }), ['a', 'c']);
  assert.deepEqual(run({ programme: ['NAV'], due: ['over'] }), ['a']);
  assert.deepEqual(run({ programme: ['NAV'], owner: ['Admissions'], due: ['today'] }), [], 'nobody matches all three');
  assert.deepEqual(run({ programme: ['NAV', 'ENG'], due: ['over', 'today'] }), ['a', 'b'], 'two lists, both must hold');
});

test('a filter left as a plain string filters NOTHING rather than the wrong people', () => {
  // 'over'.includes('') is true, so a string passes both .length and .includes and would quietly
  // keep the people it was meant to remove. Wrong type must be visible, not silently wrong.
  assert.deepEqual(run({ due: 'over' }), ['a', 'b', 'c', 'd'], 'ignored, not half-applied');
  assert.deepEqual(run({ programme: 'NAV' }), ['a', 'b', 'c', 'd']);
});

test('the tick lists offer only real values; Owner lists every configured role, Student Coordinator too', () => {
  const c = load();
  const ticks = (label) => {
    c.setOpen(null);
    const all = {};
    for (const k of ['programme', 'due', 'owner', 'source']) {
      c.setOpen(k);
      const html = c.filters(PEOPLE);
      const s = html.slice(html.indexOf('<div class="c-jfmenu"'));
      all[k] = [...s.slice(0, s.indexOf('</div>')).matchAll(/<input type="checkbox" value="([^"]*)"/g)].map((m) => m[1]);
    }
    return all[label];
  };
  assert.deepEqual(ticks('programme'), ['NAV', 'ENG', DASH], 'no empty "All" option: an empty list already means all');
  assert.deepEqual(ticks('due'), ['over', 'today']);
  for (const role of CONFIG.owners) assert.ok(ticks('owner').includes(role), `${role} is offered`);
  assert.ok(ticks('owner').includes('Student Coordinator'));
  assert.deepEqual(ticks('source').sort(), ['phone', 'website', DASH].sort());
  c.setOpen(null);
  assert.doesNotMatch(c.filters(PEOPLE), /Clear/, 'no Clear button while nothing is set');
});

test('a set filter says so: Navy edge, what is ticked, and a Clear button', () => {
  const c = load();
  c.setF({ ...c.empty(), programme: ['NAV'] });
  const one = c.filters(PEOPLE);
  assert.match(one, /<div class="c-jf c-jfm on"><span>Programme<\/span>/);
  assert.match(one, />NAV<\/button>/, 'one value: the button says which');
  assert.match(one, />Clear<\/button>/);
  assert.match(APP, /html\.ui-c \.c-jf\.on\{border-color:var\(--j-to\)/);

  c.setF({ ...c.empty(), programme: ['NAV', 'ENG'] });
  assert.match(c.filters(PEOPLE), />NAV \+1<\/button>/, 'several: the first one and how many more');
});

test('the tick list opens and closes without leaving listeners behind', () => {
  const draw = fn('function cDrawJourney(');
  assert.match(draw, /if \(!window\.__cJfWired\)/, 'wired once for the life of the page, not once per redraw');
  assert.match(draw, /e\.key === 'Escape'/, 'Escape closes it');
  assert.match(APP, /onclick="event\.stopPropagation\(\);cJfToggle\(/, 'the button does not trip the close-on-outside-click');
});

test('compact on a phone: two by two, labels never wrap', () => {
  assert.match(APP, /@media \(max-width:760px\)\{ html\.ui-c \.c-jfilters\{display:grid;grid-template-columns:1fr 1fr\}/);
  assert.match(APP, /html\.ui-c \.c-jf > span\{white-space:nowrap\}/);
  assert.match(APP, /html\.ui-c \.c-jf select,html\.ui-c \.c-jfb\{flex:1;min-width:0;max-width:none\}/, 'the button shrinks like the old select did');
});
