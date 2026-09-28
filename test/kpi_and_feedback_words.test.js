// 28.09.2026, Ritvars on two screenshots: "Weird size indifference!" (a 54 px Admitted beside
// 30 px KPIs) and "Anonymize!" (the feedback box said "Read by Aigars and Ritvars").
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));

test('every KPI number on Home is the same size', () => {
  const all = APP.match(/html\.ui-c \.kstrip b\{display:block;font-size:(\d+)px/)[1];
  const hero = APP.match(/html\.ui-c \.kstrip \.khero b\{font-size:(\d+)px/)[1];
  assert.equal(hero, all, 'the first KPI is not blown up');
});

test('what the screen says about feedback names nobody', () => {
  const i = APP.indexOf('const fbReaders = () =>');
  const ctx = { CFG: CONFIG };
  vm.runInNewContext(APP.slice(i, APP.indexOf('\n', i)) + '\nthis.r = fbReaders();', ctx);
  assert.equal(ctx.r, 'the people who build the CRM');
  for (const name of CONFIG.feedbackReaders) assert.ok(!ctx.r.includes(name), `${name} is not shown`);
  assert.doesNotMatch(APP, /Read by Aigars|Reaches the CRM admins|It reaches the CRM admins/);
});

test('who may READ feedback is unchanged - still the separate list, not every admin', () => {
  assert.match(APP, /mayReadFeedback = \(\) => \(CFG\.feedbackReaders/);
  assert.ok(CONFIG.feedbackReaders.length >= 1);
});

test('label, number and note line up across the strip even when a label wraps', () => {
  assert.match(APP, /html\.ui-c \.kstrip > div\{display:grid;grid-row:span 3;grid-template-rows:subgrid/);
});

test('the line under the logo reads "CRM · v1.0", lowercase v', () => {
  assert.equal(CONFIG.version, 'v1.0');
  assert.match(APP, /\$\('#ver'\)\.innerHTML = 'CRM &middot; ' \+ \(CFG\.version/);
  assert.match(APP, /html\.ui-c #ver\{text-transform:none\}/, 'not forced to capitals');
});
