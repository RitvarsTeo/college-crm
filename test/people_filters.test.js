// Aigars (28.09, under the People screenshot): "vajag ari filturs uzlikt nevis vnk pills ar vienu
// izveli". People has the Journey's compact dropdowns - Stage, Programme, Next step, Owner, Came
// from, Details - that combine, and keeps every filter the pills had.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fn = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const line = (start) => { const i = APP.indexOf(start); assert.ok(i >= 0, start); return APP.slice(i, APP.indexOf('\n', i)); };

function sandbox() {
  const ctx = { C_TERMINAL: ['Admitted', 'Not proceeding'], cTodayIso: () => '2026-09-29', cDay: (s) => String(s).slice(0, 10),
    esc: (s) => String(s ?? ''), channelLabel: (c) => c, CFG: { programmes: ['NAV', 'ENG'], owners: ['Admissions', 'Student Coordinator'],
      stages: [{ id: 'New', label: 'New' }, { id: 'Admitted', label: 'Admitted' }] } };
  vm.runInNewContext([line('const cWhenClass ='), line('const cNotSaid ='), line('const cTask ='), fn('function groupForAction('), fn('function cJourneyMatch('), line('const C_PF_EMPTY ='),
    line('const C_PF_DUE ='), line('const C_PF_DATA ='), line('const C_SIS_HOLDS ='), line('const cSisHolds ='), fn('function cPeopleMatch('), 'let C_PF = C_PF_EMPTY();',
    'this.m = cPeopleMatch;'].join('\n'), ctx);
  return ctx;
}
const known = new Set(['NAV', 'ENG']);
const P = (o) => ({ id: 'x', name: 'A', status: 'New', programme: 'NAV', owner: 'Admissions', source_channel: 'email', email: 'a@x', phone: null, ...o });
const T = (due) => ({ due_at: `${due}T09:00:00.000Z` });

test('every old pill is still a filter, now in a dropdown, and they combine', () => {
  const { m } = sandbox();
  const f = (o) => ({ stage: '', programme: '', due: '', owner: '', source: '', data: '', ...o });
  assert.equal(m(P({}), null, f({ stage: 'open' }), known), true);
  assert.equal(m(P({ status: 'Admitted' }), null, f({ stage: 'open' }), known), false, 'Open');
  assert.equal(m(P({}), null, f({ due: 'none' }), known), true, 'No next step');
  assert.equal(m(P({}), T('2026-09-20'), f({ due: 'none' }), known), false);
  assert.equal(m(P({}), T('2026-09-20'), f({ due: 'over' }), known), true, 'Overdue');
  assert.equal(m(P({}), T('2026-10-20'), f({ due: 'over' }), known), false);
  assert.equal(m(P({ email: null }), null, f({ data: 'nocontact' }), known), true, 'No contact details');
  assert.equal(m(P({}), null, f({ data: 'nocontact' }), known), false);
  assert.equal(m(P({ programme: 'MT X' }), null, f({ data: 'odd' }), known), true, 'Programme not in the list');
  assert.equal(m(P({}), null, f({ programme: 'ENG' }), known), false, 'Programme');
  assert.equal(m(P({}), T('2026-09-20'), f({ stage: 'New', due: 'over', owner: 'Admissions', source: 'email' }), known), true, 'combined');
  assert.equal(m(P({}), T('2026-09-20'), f({ stage: 'New', due: 'over', owner: 'Student Coordinator' }), known), false);
});

test('the pills are gone; compact dropdowns in the Journey look, with Clear, on one line (Q47)', () => {
  assert.doesNotMatch(APP, /class="c-chip" aria-pressed/);
  // Q47: People is the Journey; the stage is its column, so the filter row is the rest. Three on show (one line at
  // 1440), Owner, Details and Arrived behind More filters, which opens by itself while one of them is set.
  const pool = fn('function cDrawJourneyPool(');
  const labels = [...pool.matchAll(/box\('(\w+)', '([^']+)'/g)].map((x) => x[2]);
  assert.deepEqual(labels, ['Programme', 'Next step', 'Came from', 'Owner', 'Details', 'Arrived']);   // Arrived: Q36
  assert.match(pool, /const more = C_JPMORE \|\| Boolean\(C_PF\.owner \|\| C_PF\.data \|\| C_PF\.arrived\);/);
  assert.match(pool, /more \? box\('owner', 'Owner', owners\.map/);
  assert.match(pool, /\$\{more \? 'Fewer filters' : 'More filters'\}/);
  assert.match(APP, /<div class="c-jfilters p-filters" role="group" aria-label="Filter \$\{esc\(name\)\}">/);
  assert.match(pool, /const name = \(k, v\) => \(v === cNotSaid \? 'not recorded' :/);
  assert.match(pool, /const owners = \[\.\.\.new Set\(\[\.\.\.\(CFG\.owners \|\| \[\]\), \.\.\.distinct\('owner'\)\]\)\];/, 'every configured owner');
  assert.match(pool, /any \? "C_PF=C_PF_EMPTY\(\);C_OUT_TAG=null;cDrawJourneyPool\(\)" : ''/, 'with Clear');
});
