// MASTER found it on the copy 27.11.2026: with "Still to decide" pressed, Invite (or No) made the company vanish at once, before
// Hand over in person / tapping a name / Done. A company being decided stays in place under any pressed box until Done; Done
// takes it out of the edit set, and then the box filters it out. Invented companies.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fn = (name) => { const i = APP.indexOf(`function ${name}(`); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const line = (name) => APP.match(new RegExp(`const ${name} = [^\n]+`))[0];
const wayParts = APP.slice(APP.indexOf('function mlWayParts(w)'), APP.indexOf('\n', APP.indexOf('function mlWayParts(w)')));
const src = [wayParts,line('mlPostcard'), line('mlShows'), line('mlNorm'), line('mlPersonHit'), fn('tcMlShown'), 'return tcMlShown;'].join('\n');
const shownWith = (T_ML) => new Function('T_ML', src)(T_ML);

const groups = [
  { key: 'a', name: 'Alpha Shipping', decision: 'invite', way: 'digital', people: [{ label: 'A One', decision: 'invite' }] },
  { key: 'b', name: 'Beta Tankers', decision: null, way: null, people: [{ label: 'B One', decision: null }] },
  { key: 'c', name: 'Gamma Crew', decision: 'no', way: null, people: [{ label: 'C One', decision: 'no' }] },
];

test('Still to decide: a company just given Invite or No stays on screen while it is being decided', () => {
  const S = { q: '', filter: 'todo', edit: new Set(['a', 'c']) };
  assert.deepEqual(shownWith(S)(groups).map((g) => g.key), ['a', 'b', 'c']);
});

test('after Done (out of the edit set) the pressed box filters it out', () => {
  const S = { q: '', filter: 'todo', edit: new Set() };
  assert.deepEqual(shownWith(S)(groups).map((g) => g.key), ['b']);
});

test('the same under the other boxes, and search still narrows', () => {
  assert.deepEqual(shownWith({ q: '', filter: 'no', edit: new Set(['b']) })(groups).map((g) => g.key), ['b', 'c']);
  assert.deepEqual(shownWith({ q: 'gamma', filter: 'todo', edit: new Set(['a', 'c']) })(groups).map((g) => g.key), ['c']);
});

test('Done takes the company out of the edit set before the list is drawn again', () => {
  const f = fn('tcMlFinish');
  assert.ok(f.indexOf('T_ML.edit.delete(key)') < f.indexOf('tcMlDraw()'));
});
