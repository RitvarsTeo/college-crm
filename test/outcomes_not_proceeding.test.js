// Q33, the owner 05.10.2026: "In peoples tab, the outcomes, we have only admitted, we dont see the not proceeding. ...
// we dont have the people also! SO we have only a number. And cant find them even to check if they match someone in
// the app being ina different stage maybe falsely." Picked: the people first, the reasons under them (only the ones
// somebody has), and a "same person" mark on a Not proceeding row that matches someone in a different stage.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fnBody = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const BLOCK = APP.slice(APP.indexOf('// THE SAME PERSON (Q33'), APP.indexOf('function cColdGroups(list, people) {'));

function load() {
  const ctx = { esc: (s) => String(s), cStage: (s) => s };
  vm.runInNewContext(BLOCK.replace(/^const /gm, 'var '), ctx);
  return ctx;
}
const p = (id, status, extra = {}) => ({ id, name: 'P' + id, status, ...extra });

test('the people come first, the reasons under them', () => {
  const out = fnBody('async function viewOutcomesC() {');
  const list = out.indexOf("C_OUTCOME !== 'Admitted' && C_OUT_TAG ? cColdGroups(list, people)");
  const reasons = out.indexOf('cReasonBreakdown(np, noReason)');
  const split = out.indexOf('cTagSplit(np)');
  assert.ok(split > 0 && list > split && reasons > list, 'toggle, Cold / Reject split, the people, then Why they stopped');
});

test('same person: the duplicate rule (email lower case, phone on its last 8 digits), a different stage only', () => {
  const c = load();
  const people = [
    p('np1', 'Not proceeding', { phone: '+371 20 423 829' }),
    p('a1', 'Application', { phone: '20423829' }),                                 // same number, written without the country code
    p('np2', 'Not proceeding', { email: ' Anna@Example.LV ' }),
    p('c1', 'Contract', { email: 'anna@example.lv' }),
    p('np3', 'Not proceeding', { phone: '+371 29 000 111' }),
    p('np4', 'Not proceeding', { phone: '+371 29 000 111' }),                      // same stage: not a mark
    p('np5', 'Not proceeding', { phone: '12345' }),                                 // too short to compare
    p('x1', 'New', { phone: '12345' }),
  ];
  assert.equal(c.cSamePerson(people[0], people).id, 'a1');
  assert.equal(c.cSamePerson(people[2], people).id, 'c1');
  assert.equal(c.cSamePerson(people[4], people), null, 'another Not proceeding is not a different stage');
  assert.equal(c.cSamePerson(people[6], people), null, 'a 5-digit phone is not compared');
  assert.equal(c.cSamePerson(p('np6', 'Not proceeding'), people), null, 'no email or phone, no mark');
  assert.match(c.cSameMark(people[0], people), /<a class="c-same" href="#\/person\/a1" onclick="event\.stopPropagation\(\)">Same person · Pa1 · Application<\/a>/);
  assert.equal(c.cSameMark(people[4], people), '');
});

test('the mark is shown on Not proceeding rows only', () => {
  const out = fnBody('async function viewOutcomesC() {');
  assert.match(out, /\$\{C_OUTCOME !== 'Admitted' \? cSameMark\(p, people\) : ''\}/, 'not on the Admitted list');
  assert.match(fnBody('function cColdGroups(list, people) {'), /cSameMark\(p, people\)/, 'the Cold / Reject lists are Not proceeding too');
  const uses = (APP.match(/cSameMark\(/g) || []).length;
  assert.equal(uses, 2, 'used on the two Not proceeding lists and nowhere else');
});
