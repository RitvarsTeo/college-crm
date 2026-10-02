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

test('the hero KPI leads, and the step is 40 over 30 rather than 54', () => {
  const all = APP.match(/html\.ui-c \.kstrip b\{display:block;font-size:(\d+)px/)[1];
  const hero = APP.match(/html\.ui-c \.kstrip \.khero b\{font-size:(\d+)px/)[1];
  // 28.09 rejected a 54px hero as "Weird size indifference!" and every number was levelled
  // to 30. That left the strip with no focal point at all. 30.09 sets the step at 40/30:
  // the hero leads without shouting, and 54 stays rejected.
  assert.equal(Number(hero), 40, 'the hero leads');
  assert.equal(Number(all), 30, 'the other three hold the line');
  assert.ok(Number(hero) < 54, 'and nothing is blown up to the size that was rejected');
});

test('what the screen says about feedback names nobody', () => {
  const i = APP.indexOf('const fbReaders = () =>');
  const ctx = { CFG: CONFIG };
  vm.runInNewContext(APP.slice(i, APP.indexOf('\n', i)) + '\nthis.r = fbReaders();', ctx);
  assert.equal(ctx.r, 'the people who build Intake');
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

// Renamed 30.09.2026: the tool is Intake, and it carries a slogan under the name. The owner set
// the pattern that day: a one-word name that says what the tool does, and one line that says the
// value it gives. He chose the slogan knowing it goes against his own rule that a screen never
// explains itself, and took it anyway, so it must not be deleted as a helper sentence.
test('the line under the logo reads "Intake · v1.0", lowercase v, with the slogan under it', () => {
  assert.equal(CONFIG.version, 'v1.0');
  assert.match(APP, /\$\('#ver'\)\.innerHTML = 'Intake &middot; ' \+ \(CFG\.version/);
  assert.match(APP, /html\.ui-c #ver\{text-transform:none\}/, 'not forced to capitals');

  assert.match(APP, /<span id="tagline">Every first contact, in one place<\/span>/,
    'the slogan is in the markup, so it renders before any script runs');
  // quiet, and not shouted: the name above it is the uppercase letter-spaced one
  const rule = APP.slice(APP.indexOf('html.ui-c #tagline{'), APP.indexOf('}', APP.indexOf('html.ui-c #tagline{')));
  assert.match(rule, /text-transform:none/, 'sentence case, not capitals');
  assert.match(rule, /letter-spacing:0/, 'no letter-spacing: it is a sentence, not a label');
});
