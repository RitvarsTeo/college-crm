// THE MONTH CHART ON A PHONE (the review, 29.09.2026). Home was deleted on 01.10 and
// brought back the same day, so this feedback is live again and had to be finished.
//
// The type was never the problem: it is already 12.5px on a phone, about 11.5px rendered.
// TWELVE labels in a 324px plot area gives each a 27px band, and a month name is about
// 22px wide, so they crowd and touch. The answer is to thin the LABELS, never the type.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fn = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function chart(n, { phone }) {
  const months = Array.from({ length: n }, (_, i) => ({
    month: `2026-${String(i + 1).padStart(2, '0')}`, admitted: i + 1, newLeads: (i + 1) * 2,
  }));
  const ctx = {
    C_MONTHS: MONTHS,
    esc: (s) => String(s ?? ''),
    window: { matchMedia: (q) => ({ matches: q.includes('max-width:760px') ? phone : false }) },
  };
  vm.runInNewContext(fn('function cMonthChart(') + '\nthis.c = cMonthChart;', ctx);
  return ctx.c(months, 2026);
}

const printed = (svg) => MONTHS.filter((m) => new RegExp(`>${m}</text>`).test(svg));

test('on a phone, twelve months print about six labels, not twelve', () => {
  const svg = chart(12, { phone: true });
  const shown = printed(svg);
  assert.ok(shown.length <= 7 && shown.length >= 5, `printed ${shown.length}: ${shown.join(',')}`);
});

test('and the LAST month is always one of them', () => {
  for (const n of [5, 7, 9, 11, 12]) {
    const shown = printed(chart(n, { phone: true }));
    assert.ok(shown.includes(MONTHS[n - 1]), `${n} months: the newest month keeps its label`);
  }
});

test('on a desktop every month still prints', () => {
  assert.equal(printed(chart(12, { phone: false })).length, 12);
});

test('a month that loses its printed tick does NOT lose its name', () => {
  const svg = chart(12, { phone: true });
  // every column keeps its own aria-label and its tooltip, so the name is still reachable
  for (const m of MONTHS) {
    assert.ok(svg.includes(`aria-label="${m} 2026:`), m + ' is still named for a screen reader');
    assert.ok(svg.includes(`data-tip="${m} 2026|`), m + ' is still named on hover');
  }
});

// The thing that must never come back.
test('the fix is never smaller type', () => {
  assert.match(APP, /html\.ui-c \.kt\{fill:var\(--t3\);font-size:11px/, 'the base label size is unchanged');
  assert.match(APP, /html\.ui-c \.kchart\.narrow \.kt\{font-size:12\.5px\}/,
    'and the phone label is BIGGER than the desktop one, not smaller');
  const f = fn('function cMonthChart(');
  assert.ok(!/font-size/.test(f), 'the chart never sets a font size of its own');
});

test('few months are all labelled: thinning only happens when it is needed', () => {
  for (const n of [3, 4, 5, 6]) {
    assert.equal(printed(chart(n, { phone: true })).length, n, n + ' months all fit');
  }
});
