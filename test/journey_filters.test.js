// Aigars' feedback 2A, 28.09.2026: real Journey filters - Programme, Overdue / Today, Owner, Came
// from - as compact dropdowns that combine, offering only the values the data has.
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
    'this.match = cJourneyMatch; this.filters = cJourneyFilters; this.setF = (f) => { C_JF = f; };'].join('\n'), ctx);
  return ctx;
}
const due = (d) => ({ due_at: `${d}T09:00:00.000Z` });
const PEOPLE = [
  { id: 'a', programme: 'NAV', owner: 'Admissions', source_channel: 'website', t: due('2026-09-26') },
  { id: 'b', programme: 'ENG', owner: 'Admissions', source_channel: 'phone', t: due('2026-09-28') },
  { id: 'c', programme: 'NAV', owner: 'Marketing', source_channel: 'website', t: due('2026-10-02') },
  { id: 'd', programme: null, owner: null, source_channel: null, t: null },
];
const run = (f) => { const c = load(); return PEOPLE.filter((p) => c.match(p, p.t, { programme: '', due: '', owner: '', source: '', ...f })).map((p) => p.id); };



test('each filter on its own', () => {
  assert.deepEqual(run({}), ['a', 'b', 'c', 'd'], 'no filter shows everybody');
  assert.deepEqual(run({ programme: 'NAV' }), ['a', 'c']);
  assert.deepEqual(run({ due: 'over' }), ['a']);
  assert.deepEqual(run({ due: 'today' }), ['b']);
  assert.deepEqual(run({ owner: 'Marketing' }), ['c']);
  assert.deepEqual(run({ source: 'phone' }), ['b']);
  assert.deepEqual(run({ programme: DASH }), ['d'], '"not recorded" finds the people with nothing recorded');
});

test('filters combine: every one set must hold', () => {
  assert.deepEqual(run({ programme: 'NAV', source: 'website' }), ['a', 'c']);
  assert.deepEqual(run({ programme: 'NAV', due: 'over' }), ['a']);
  assert.deepEqual(run({ programme: 'NAV', owner: 'Admissions', due: 'today' }), [], 'nobody matches all three');
});

test('the dropdowns offer only real values; Owner lists every configured role, Student Coordinator too', () => {
  const c = load();
  const html = c.filters(PEOPLE);
  const opts = (label) => { const s = html.slice(html.indexOf(`aria-label="${label}"`)); return [...s.slice(0, s.indexOf('</select>')).matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]); };
  assert.deepEqual(opts('Programme'), ['', 'NAV', 'ENG', DASH]);
  assert.deepEqual(opts('Overdue / Today'), ['', 'over', 'today'], '"Overdue or today" is gone - it was just the two together');
  for (const role of CONFIG.owners) assert.ok(opts('Owner').includes(role), `${role} is offered`);
  assert.ok(opts('Owner').includes('Student Coordinator'));
  assert.deepEqual(opts('Came from').slice(1).sort(), ['phone', 'website', DASH].sort());
  assert.doesNotMatch(html, /Clear/, 'no Clear button while nothing is set');
});

test('a set filter says so: Navy edge, its value shown, and a Clear button', () => {
  const c = load();
  c.setF({ programme: 'NAV', due: '', owner: '', source: '' });
  const html = c.filters(PEOPLE);
  assert.match(html, /<label class="c-jf on"><span>Programme<\/span>/);
  assert.match(html, /<option value="NAV" selected>NAV<\/option>/);
  assert.match(html, />Clear<\/button>/);
  assert.match(APP, /html\.ui-c \.c-jf\.on\{border-color:var\(--j-to\)/);
});

test('compact on a phone: two by two, labels never wrap', () => {
  assert.match(APP, /@media \(max-width:760px\)\{ html\.ui-c \.c-jfilters\{display:grid;grid-template-columns:1fr 1fr\}/);
  assert.match(APP, /html\.ui-c \.c-jf > span\{white-space:nowrap\}/);
});
