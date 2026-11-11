// ADMITTED COUNTS PEOPLE, THE SAME ON EVERY SCREEN (the owner's pick B, 11.11.2026, under his rules: count people; one
// number, every figure clickable to its people). Home, the Journey and Reports count one list - every Admitted record,
// one per person, a dated record before an undated one - and the people with no admission date on any record are the
// clickable part under it. A bracketed note in a name ("(atsāk studijas)") or a second line is no part of the name, so
// the sheet's record and the SIS's record of one student are one person. Synthetic people only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { countPeople } from '../src/realpeople.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fn = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const line = (start) => { const i = APP.indexOf(start); assert.ok(i >= 0, start); return APP.slice(i, APP.indexOf('\n', i) + 1); };

const A = (id, name, extra = {}) => ({ id, name, status: 'Admitted', admitted_at: '2026-06-01', email: null, phone: null, programme: 'NAV', ...extra });
const PEOPLE = [
  A('g1', 'Gundega Paraudziņa (atsāk studijas)'), A('g2', 'Gundega Paraudziņa', { email: 'g@example.com', programme: 'MT WTT' }),   // one person
  A('p1', 'Anastasija Paraudziņa', { programme: 'MT OS' }), A('p2', 'Anastasija Paraudziņa', { programme: 'NAV' }),                  // one person, two programmes
  A('k1', 'Reinis Paraugs'), A('k2', 'Reinis Paraugs', { admitted_at: null }),                                                        // dated + undated: one, dated
  A('t1', 'Ričards Paraugs\nNatālija Paraudziņa (mamma)'), A('t2', 'Ričards Paraugs', { phone: '+371 2000 0001' }),                // a parent on line two
  A('u1', 'Undīne Paraudziņa', { admitted_at: null }), A('u2', 'Uldis Paraugs', { admitted_at: null }),                              // no date at all
  A('d1', 'Dace Paraudziņa'), A('d2', 'Dāvis Paraugs'), A('d3', 'Didzis Paraugs'),
  { id: 'n1', name: 'Nora Paraudziņa', status: 'New' },
];

function page() {
  const ctx = {};
  vm.runInNewContext([line('const cPersonName ='), fn('function cOnePerPerson('), fn('function cAdmittedOnce('),
    'this.once = cAdmittedOnce;'].join('\n'), ctx);
  return ctx;
}

test('one list: every Admitted record once per person, a dated record first; the undated part is the people with no date', () => {
  const once = Array.from(page().once(PEOPLE));   // out of the sandbox's own Array
  assert.equal(once.length, 9, '13 Admitted records = 9 people');
  assert.deepEqual([...once.map((p) => p.id)].sort(), ['d1', 'd2', 'd3', 'g1', 'k1', 'p1', 't1', 'u1', 'u2']);
  assert.deepEqual([...once.filter((p) => !p.admitted_at).map((p) => p.id)].sort(), ['u1', 'u2'], 'Reinis has a dated record: not undated');
  assert.equal(countPeople(PEOPLE.filter((p) => p.status === 'Admitted')), 9, 'the server counts the same people (Reports, the year compare)');
});

test('Home, the Journey and Reports count that one list, and each opens it', () => {
  const home = fn('async function cHomeData() {');
  assert.match(home, /const admitted = cAdmittedOnce\(people\);/);
  assert.match(home, /const undated = admitted\.filter\(\(p\) => !p\.admitted_at\);/);
  assert.match(APP, /<b>\$\{D\.admitted\.length\}<\/b><small>\$\{esc\(cScopeWord\(\)\)\}\$\{D\.undated\.length \? ` · <a class="rp-go" href="#\/people" onclick="cGoHomeUndated\(\);return false">\$\{D\.undated\.length\} without a date<\/a>` : ''\}<\/small>/);
  assert.match(fn('function cGoHomeUndated() {'), /ids: C_HOME_D\.undated\.map\(\(p\) => p\.id\)/, 'the undated part opens its people');
  assert.match(APP, /const adm = cAdmittedOnce\(all\)\.length;/, 'the Journey band');
  assert.match(fn('function cDrawJourney() {'), /\.filter\(\(p\) => p\.status !== 'Admitted' \|\| admOnce\.has\(p\.id\)\)/, 'the Journey board column opens the same people');
  assert.match(fn('function cDrawJourneyPool() {'), /people\.filter\(\(p\) => p\.status !== admitted \|\| admOnce\.has\(p\.id\)\)/, 'and its list');
  assert.match(APP, /const once = cAdmittedOnce\(people\);[^\n]*\n  const adm = once\.filter\(\(p\) => inP\(p\.admitted_at\)\);/, 'Reports');
  assert.match(APP, /undated: fig\('admitted:undated', 'Admitted · no admission date', once\.filter\(\(p\) => !p\.admitted_at\)\),/);
});
