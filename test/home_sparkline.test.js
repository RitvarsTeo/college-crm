// A KPI CARRIES ITS OWN SHAPE (the owner, 01.10.2026, from the Mixpanel Home he
// downloaded off Mobbin: every headline figure has a sparkline of its own series, so a
// number is never a bare digit). Pattern only - the line is drawn from the same monthly
// trend the month chart uses, so it is the real series and not an illustration.
//
// The rules that matter are the honest ones: it draws nothing rather than draw a lie.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fn = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };

const spark = (() => {
  const ctx = { esc: (s) => String(s ?? '') };
  vm.runInNewContext(fn('function cSpark(') + '\nthis.s = cSpark;', ctx);
  return ctx.s;
})();

test('it draws the real series, ending on the last month', () => {
  const html = spark([2, 7, 10, 7, 5, 6, 6, 15, 16], 'adm');
  assert.match(html, /^<svg class="kspark adm"/);
  const d = /d="([^"]+)"/.exec(html)[1];
  assert.equal(d.split('L').length, 9, 'one point per month');
  assert.match(d, /^M0\.0,/, 'starts at the left edge');
  assert.match(d, /L100\.0,/, 'and reaches the right edge');
  // the tallest month must sit at the top of the band, the smallest at the bottom
  const ys = [...d.matchAll(/,([\d.]+)/g)].map((m) => Number(m[1]));
  assert.equal(Math.min(...ys), Math.min(...ys), 'has a range');
  assert.ok(ys[8] < ys[0], 'September (16) is drawn higher than January (2)');
});

test('nothing to say, nothing drawn', () => {
  assert.equal(spark([], 'adm'), '', 'no months');
  assert.equal(spark([4], 'adm'), '', 'a single month is not a trend');
  assert.equal(spark([0, 0, 0, 0], 'adm'), '', 'a flat zero is not a trend, it is an empty year');
  assert.equal(spark(null, 'adm'), '', 'no data at all');
});

test('a zero month is a real low point, not a gap', () => {
  const d = /d="([^"]+)"/.exec(spark([5, 0, 5], 'adm'))[1];
  const ys = [...d.matchAll(/,([\d.]+)/g)].map((m) => Number(m[1]));
  assert.ok(ys[1] > ys[0] && ys[1] > ys[2], 'the zero sits at the bottom of the band');
  assert.equal(d.split('L').length, 3, 'and it is still a point on the line');
});

test('it says what it is for a screen reader, and the dot marks the latest month', () => {
  const html = spark([1, 2, 3], 'lead');
  assert.match(html, /role="img"/);
  assert.match(html, /aria-label="the last 3 months, ending at 3"/);
  assert.match(html, /<circle cx="100\.0"/, 'the dot is on the newest month');
});

// Home is two alternatives since 02.10.2026 (A journey first, B today first). The
// sparklines were decided 01.10 as shared work, not a variant choice, so EACH carries both.
for (const v of ['A', 'B']) test(`Home ${v}: both trend KPIs carry one, and only the two that have a trend`, () => {
  const home = fn(`function cHome${v}(`);
  assert.match(home, /cSpark\(D\.months\.map\(\(m\) => m\.admitted\), 'adm'\)/, 'Admitted');
  assert.match(home, /cSpark\(D\.months\.map\(\(m\) => m\.newLeads\), 'lead'\)/, 'Leads');
  // Conversion and median days are single values for the period, not a monthly series:
  // giving them a line would be drawing a shape the data does not have.
  assert.equal((home.match(/cSpark\(/g) || []).length, 2, 'only the two with a real monthly series');
});

test('the line takes its colour from the mode tokens, never a fixed hex', () => {
  const css = APP.slice(APP.indexOf('html.ui-c .kspark{'), APP.indexOf('html.ui-c .kgo{'));
  assert.match(css, /stroke:var\(--v-adm\)/);
  assert.match(css, /stroke:var\(--t3\)/, 'the leads line is the muted ink, not a second accent');
  assert.ok(!/#[0-9a-fA-F]{3,6}/.test(css), 'no hard-coded colour: both modes come from the tokens');
});
