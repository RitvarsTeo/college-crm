// Q12, 05.10.2026: a person never reads a code name. The answers a form carries (src/adapters.js
// WEBSITE_ANSWERS, renamed FORM_ANSWERS by CHANNELS Q8) are stored under keys like form_programme;
// the chip on a person's page shows FIELD_LABEL's words for them, never the key. The keys are read
// from adapters.js itself, so an answer added there without a label fails here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const ADAPTERS = fs.readFileSync(path.join(ROOT, 'src', 'adapters.js'), 'utf8');

const block = APP.slice(APP.indexOf('const FIELD_LABEL = {'), APP.indexOf('const fieldCell ='));
const ctx = { esc: (s) => String(s), PROV_TITLE: {} };
vm.runInNewContext(block.replace(/^const /gm, 'var '), ctx);
// The map is WEBSITE_ANSWERS here and FORM_ANSWERS once CHANNELS Q8 (1ea73ae) lands: either name is read.
const MAP = ADAPTERS.match(/const (?:WEBSITE|FORM)_ANSWERS = (\{[^}]*\})/);
const keys = MAP ? Object.values(vm.runInNewContext('(' + MAP[1] + ')')) : null;

test('every form answer has a plain label on the person page, never its snake_case key', () => {
  assert.ok(keys, 'src/adapters.js has no const WEBSITE_ANSWERS or FORM_ANSWERS map: the form answers moved, so this test must be pointed at them');
  assert.deepEqual(keys.sort(), ['form_company', 'form_programme', 'form_study_form', 'heard_from']);
  for (const k of keys) {
    const label = ctx.FIELD_LABEL[k];
    assert.ok(label, k + ' has a label');
    assert.doesNotMatch(label, /_/, k + ' label is words, not a key');
    const chip = ctx.fieldChip({ field: k, value: 'x', provenance: 'provider' });
    assert.doesNotMatch(chip.match(/<i>([^<]*)<\/i>/)[1], /_/, k + ' shows no key on the chip');
  }
});

test('the four labels, in the owner\'s words', () => {
  assert.equal(ctx.FIELD_LABEL.form_programme, 'programme picked');
  assert.equal(ctx.FIELD_LABEL.form_study_form, 'study form');
  assert.equal(ctx.FIELD_LABEL.heard_from, 'heard about us from');
  assert.equal(ctx.FIELD_LABEL.form_company, 'company');
});
