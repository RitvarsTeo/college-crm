// Item 12, 30.09.2026: the summary for management above the Journey.
// Two rows of bars: where the waiting is by stage, and what the team is doing next by
// kind of step. Both are counted from the SAME set the columns are drawn from, so a bar
// can never disagree with the board under it, and each bar filters what it counted.
//
// Measured on demo data at the time of writing: columns New 7, Contacted 1, Follow-up 0,
// Application 1, Contract 2 - and the stage bars read exactly the same.
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

const STAGES = (CONFIG.stages || []).filter((s) => !['Admitted', 'Not proceeding'].includes(s.id));
const label = (id) => (CONFIG.nextActions || []).flatMap((g) => g.items).find((i) => i.id === id).label;

function sandbox(filters = {}) {
  const ctx = { CFG: CONFIG, esc: (s) => String(s ?? '') };
  vm.runInNewContext([
    line('const cTask ='), fn('function groupForAction('),
    'let C_JF = { programme: [], due: [], owner: [], source: [], stage: [], group: [] };',
    'Object.assign(C_JF, ' + JSON.stringify(filters) + ');',
    fn('function cJourneySummary('),
    'this.summary = cJourneySummary;',
  ].join('\n'), ctx);
  return ctx;
}

const person = (status, taskLabel) => ({ id: status + (taskLabel || 'none'), status, taskLabel });
const build = (people) => {
  const taskOf = new Map();
  for (const p of people) if (p.taskLabel) taskOf.set(p.id, { label: p.taskLabel });
  return taskOf;
};

test('a stage bar counts exactly what its column holds', () => {
  const people = [
    person(STAGES[0].id, label('call_interest')),
    person(STAGES[0].id, label('send_programme')),
    person(STAGES[1].id, label('invite_visit')),
    person(STAGES[2].id, null),
  ];
  const html = sandbox().summary(people, build(people), STAGES);
  const counts = [...html.matchAll(/<b>(\d+)<\/b>/g)].map((m) => Number(m[1]));
  // first row is the stages, in board order
  assert.deepEqual(counts.slice(0, STAGES.length),
    STAGES.map((st) => people.filter((p) => p.status === st.id).length),
    'every stage bar equals the people standing in that stage');
});

test('the kinds row counts the same people, grouped by what comes next', () => {
  const people = [
    person(STAGES[0].id, label('call_interest')),       // Conversation and information
    person(STAGES[0].id, label('send_programme')),      // Conversation and information
    person(STAGES[1].id, label('invite_visit')),        // Visit on site
    person(STAGES[2].id, null),                         // No next step
  ];
  const html = sandbox().summary(people, build(people), STAGES);
  const kinds = html.slice(html.indexOf('</div><div class="c-sumrow">'));
  const pairs = [...kinds.matchAll(/<b>(\d+)<\/b>.*?<span>([^<]+)<\/span>/gs)].map((m) => [m[2], Number(m[1])]);
  assert.deepEqual(pairs.find((x) => x[0] === 'Conversation and information'), ['Conversation and information', 2]);
  assert.deepEqual(pairs.find((x) => x[0] === 'Visit on site'), ['Visit on site', 1]);
  assert.deepEqual(pairs.find((x) => x[0] === 'No next step'), ['No next step', 1],
    'the number worth acting on is a bar of its own');
  assert.equal(pairs.reduce((a, x) => a + x[1], 0), people.length, 'everybody is in exactly one kind');
});

test('a bar with nothing in it is not drawn, but an empty STAGE still is', () => {
  const people = [person(STAGES[0].id, label('call_interest'))];
  const html = sandbox().summary(people, build(people), STAGES);
  assert.ok(html.includes('>' + (STAGES[1].label || STAGES[1].id) + '<'), 'an empty stage keeps its place in the board order');
  assert.ok(!html.includes('>Visit on site<'), 'a kind nobody is doing is not invented');
});

test('each bar is the filter for what it counted, and toggles', () => {
  const html = sandbox().summary([person(STAGES[0].id, null)], new Map(), STAGES);
  assert.match(html, /onclick="cJfPick\('stage', this\.dataset\.v, !false\)"/, 'clicking sets the stage filter');
  const on = sandbox({ stage: [STAGES[0].id] }).summary([person(STAGES[0].id, null)], new Map(), STAGES);
  assert.match(on, /class="c-sum on"/, 'a chosen bar says so');
  assert.match(on, /aria-pressed="true"/);
  assert.match(on, /onclick="cJfPick\('stage', this\.dataset\.v, !true\)"/, 'and clicking again clears it');
});
