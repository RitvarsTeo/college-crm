// WHY PEOPLE STOP (Admissions, open since 29.09.2026).
//
// The reason model was never missing. config.closedReasons holds ten, the status route
// refuses a close without one of them, and the picker is built from it. What was missing
// was any way to SEE the list against real use: the screen carried a tag saying the list
// was "to agree" while the server was already enforcing it.
//
// Showing it decides nothing. It makes confirming the list a glance instead of a meeting.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
const SERVER = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
const fn = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };

const breakdown = (() => {
  const ctx = { CFG: CONFIG, esc: (s) => String(s ?? '') };
  vm.runInNewContext(fn('function cReasonBreakdown(') + '\nthis.b = cReasonBreakdown;', ctx);
  return ctx.b;
})();

const closed = (reason) => ({ status: 'Not proceeding', closed_reason: reason });

test('the model is real: a taxonomy, enforced by the server, driving the picker', () => {
  assert.ok(Array.isArray(CONFIG.closedReasons) && CONFIG.closedReasons.length >= 5,
    'the reasons are configured, not invented at the screen');
  assert.match(SERVER, /const allowed = CONFIG\.closedReasons \|\| \[\];/, 'the server reads the same list');
  // since 02.10.2026 by stage (test/reasons_by_stage.test.js), still from the same configured list
  assert.match(APP, /reasonsForStage\(p\.status\)\.map\(\(r\) => `<option>/, 'and so does the picker');
  assert.match(APP, /const all = CFG\.closedReasons \|\| \[\];/, 'which reads the same list');
});

test('every configured reason is shown, including the ones nobody has used', () => {
  const html = breakdown([closed('No response'), closed('No response'), closed('Not eligible')], 0);
  for (const r of CONFIG.closedReasons) {
    assert.ok(html.includes('>' + r), r + ' is listed');
  }
  assert.match(html, /class="c-reasonbar none"/, 'an unused reason is listed quietly, at zero');
});

test('the counts are the real ones, biggest bar to the most used', () => {
  const html = breakdown([closed('No response'), closed('No response'), closed('Not eligible')], 0);
  const row = (label) => {
    const i = html.indexOf('>' + label);
    return html.slice(i, html.indexOf('</div>', i));
  };
  assert.match(row('No response'), /width:100%/, 'the most used fills the bar');
  assert.match(row('No response'), /<b>2<\/b>/);
  assert.match(row('Not eligible'), /<b>1<\/b>/);
});

// If the configured list changes under data already written, hiding the old values would
// hide the drift. They are shown and marked instead.
test('a recorded reason that is NOT in the list is shown and marked', () => {
  const html = breakdown([closed('Some reason from an older list')], 0);
  assert.match(html, /Some reason from an older list <em>not in the list<\/em>/);
});

test('it says how many have no reason at all, without pretending they have one', () => {
  const html = breakdown([closed('No response'), closed(null)], 1);
  assert.match(html, /1 of 2 recorded/);
  assert.match(html, /1 person has no recorded reason yet/);
  assert.ok(!html.includes('<b>2</b>'), 'the missing one is not quietly added to a reason');
});

test('nobody has stopped, nothing is drawn', () => {
  assert.equal(breakdown([], 0), '');
});

test('it states what the list is for, and that changing it is a config change', () => {
  const html = breakdown([closed('No response')], 0);
  assert.match(html, new RegExp('These are the ' + CONFIG.closedReasons.length + ' reasons Intake accepts today'));
  assert.match(html, /config change, not a rebuild/);
  // and the stale tag that said the list was still to agree is gone
  assert.ok(!APP.includes('reasons list to agree'),
    'the screen no longer says the list is unsettled while the server enforces it');
});
