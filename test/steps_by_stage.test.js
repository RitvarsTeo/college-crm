// THE NEXT STEPS FOLLOW THE LEAD'S STAGE (Ritvars 02.10.2026): "lets create a algorithm that depends on
// at what stage the lead is! There can be groups. The goal is for shorter list ... that the outcomes
// impossible are not shown ... lets create mvp."
//
// The rule lives in config.stepGroupsByStage: each open stage names the step GROUPS that fit it. A
// step marked anyStage (Answer the question, Call back) fits every stage. A step already planned for
// the person is always kept, so the picker can never hide what is there. No stage known = every step,
// which keeps the classic view and any unforeseen caller exactly as before.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
const fn = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };

const ctx = { CFG, esc: (s) => String(s ?? ''), cStepIn: (d) => d + ' days' };   // Q70: the deadline words, stubbed
vm.runInNewContext(fn('function stepsForStage(') + fn('function nextActionOptions(') + '\nthis.f = nextActionOptions; this.s = stepsForStage;', ctx);
const labels = (html) => [...html.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]);
const all = CFG.nextActions.flatMap((g) => g.items.map((i) => i.label));

test('every open stage has a rule, and every group it names exists', () => {
  const groups = new Set(CFG.nextActions.map((g) => g.group));
  for (const s of CFG.stageOrder.filter((x) => !CFG.terminalStages.includes(x))) {
    assert.ok(Array.isArray(CFG.stepGroupsByStage[s]), s + ' has a rule');
    for (const g of CFG.stepGroupsByStage[s]) assert.ok(groups.has(g), g);
  }
});

test('each stage offers a SHORTER list than everything', () => {
  for (const s of Object.keys(CFG.stepGroupsByStage)) {
    const n = labels(ctx.f(null, s)).length;
    assert.ok(n > 0 && n < all.length, `${s}: ${n} of ${all.length}`);
  }
});

test('a new lead is not offered the contract; a submitted application is not offered a first visit, and keeps the contract steps', () => {
  assert.ok(!labels(ctx.f(null, 'New')).includes('Prepare the study contract'));
  assert.ok(!labels(ctx.f(null, 'Application')).includes('Invite to a visit on site'));
  for (const l of ['Prepare the study contract', 'Sign the contract', 'Send the invoice', 'Chase the payment', 'Confirm the payment']) {
    assert.ok(labels(ctx.f(null, 'Application')).includes(l), 'the Contract stage folded in (Q75): ' + l);
  }
  assert.equal(CFG.stepGroupsByStage.Contract, undefined);
});

test('answering a question and calling back fit every stage', () => {
  for (const s of Object.keys(CFG.stepGroupsByStage)) {
    const l = labels(ctx.f(null, s));
    assert.ok(l.includes('Answer the question') && l.includes('Call back'), s);
  }
});

test('the step already planned is never hidden', () => {
  const l = labels(ctx.f('Invite to a visit on site', 'Application'));
  assert.ok(l.includes('Invite to a visit on site'));
});

test('no stage known: the whole list, as before', () => {
  assert.equal(labels(ctx.f(null)).length, all.length);
});

test('every dialog in the main view passes the stage', () => {
  assert.match(APP, /nextActionOptions\(null, C_STAGE_OF\.get\(personId\)\)/, 'Plan a next step');
  assert.match(APP, /nextActionOptions\(null, p\.status\)/, 'People quick edit');
  assert.match(APP, /function openComplete\(taskId, label, finished, personId\)/, 'Done carries the person');
});
