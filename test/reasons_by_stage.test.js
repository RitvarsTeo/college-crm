// WHY THEY STOPPED, BY WHERE THEY STOPPED (the owner, 02.10.2026): "an algorithm that depends on
// persons journey. There can be groups. The goal is for shorter list ... the outcomes impossible are
// not shown ... lets create mvp."
//
// config.closedReasonsByStage names, for each open stage, the reasons that can happen when somebody
// leaves from there. Every list is a subset of config.closedReasons, which the server still enforces
// whole, so nothing recorded earlier ever becomes invalid. "Other" is always offered. Stage unknown =
// the whole list.
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
const ctx = { CFG };
vm.runInNewContext(fn('function reasonsForStage(') + '\nthis.r = reasonsForStage;', ctx);

test('every open stage has its reasons, each one from the enforced list, Other always there', () => {
  for (const s of CFG.stageOrder.filter((x) => !CFG.terminalStages.includes(x))) {
    const l = CFG.closedReasonsByStage[s];
    assert.ok(Array.isArray(l), s);
    for (const r of l) assert.ok(CFG.closedReasons.includes(r), `${s}: ${r} is not an enforced reason`);
    assert.ok(l.includes('Other'), s + ' offers Other');
    assert.ok(l.length < CFG.closedReasons.length, s + ' is shorter than the whole list');
  }
});

test('the impossible ones are not offered', () => {
  assert.ok(!ctx.r('New').includes('Requirements not met'), 'nothing has been checked yet at New');
  assert.ok(!ctx.r('Application').includes('Duplicate'), 'a duplicate is found long before a submitted application');
  assert.equal(CFG.closedReasonsByStage.Contract, undefined, 'no reasons for a stage that was removed (Q75)');
});

test('stage unknown: the whole list, as before', () => {
  assert.deepEqual([...ctx.r(null)], CFG.closedReasons);
});

test('both close paths ask by stage', () => {
  assert.match(APP, /reasonsForStage\(C_STAGE_OF\.get\(id\)\)/, 'the close dialog');
  assert.match(APP, /reasonsForStage\(p\.status\)/, 'the People quick edit');
});
