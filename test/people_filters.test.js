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
  vm.runInNewContext([line('const cWhenClass ='), line('const cNotSaid ='), fn('function cJourneyMatch('), line('const C_PF_EMPTY ='),
    line('const C_PF_DUE ='), line('const C_PF_DATA ='), fn('function cPeopleMatch('), 'let C_PF = C_PF_EMPTY();', fn('function cPeopleFilters('),
    'this.m = cPeopleMatch; this.f = (x) => { C_PF = { ...C_PF_EMPTY(), ...x }; return cPeopleFilters; }; this.draw = (ps) => cPeopleFilters(ps);'].join('\n'), ctx);
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

test('the pills are gone; six compact dropdowns in the Journey look, with Clear', () => {
  assert.doesNotMatch(APP, /class="c-chip" aria-pressed/);
  const { draw } = sandbox();
  const html = draw([P({}), P({ id: 'y', programme: null, owner: null })]);
  const labels = [...html.matchAll(/<span>([^<]+)<\/span><select aria-label="\1"/g)].map((x) => x[1]);
  assert.deepEqual(labels, ['Stage', 'Programme', 'Next step', 'Owner', 'Came from', 'Details']);
  assert.match(html, /class="c-jfilters" role="group" aria-label="Filter people"/);
  assert.match(html, /<option value="—">not recorded<\/option>/);
  assert.match(html, /<option value="Student Coordinator">Student Coordinator<\/option>/, 'every configured owner');
});
