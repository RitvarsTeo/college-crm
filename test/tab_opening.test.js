// EVERY TAB OPENS LIKE A SLIDE, AND EVERY FIGURE COUNTS (the owner, 02.10.2026). The bump after
// counting stays only for a figure that changed since this viewer last saw it. These run
// cOpenView() against a stub page and a stub kit, so they prove which figures count and bump.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fn = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const line = (start) => { const i = APP.indexOf(start); assert.ok(i >= 0, start); return APP.slice(i, APP.indexOf(';\n', i) + 2); };

function page(figures, { on = true, stored = null } = {}) {
  const els = figures.map(([label, text]) => {
    const cls = new Set();
    return { textContent: text, classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), has: (c) => cls.has(c) },
      closest: () => ({ dataset: { v: label } }), parentElement: null };
  });
  const blocks = [0, 1, 2].map(() => { const st = {}; const cls = new Set();
    return { style: { setProperty: (k, v) => { st[k] = v; } }, st, cls, classList: { add: (c) => cls.add(c) }, children: [] }; });
  const store = stored ? { intakeSeen: JSON.stringify(stored) } : {};
  const counted = [];
  const ctx = {
    location: { hash: '#/home' }, JSON, Object, Math, String,
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
    $: () => ({ children: blocks, querySelectorAll: () => els }),
    window: { Motion: { on, count: (el, o) => { counted.push(el); el.classList.add('m-bumped'); o.done(); } } },
  };
  const k = APP.indexOf('const cMetricKey = ');
  vm.runInNewContext(line('const C_METRICS = ') + APP.slice(k, APP.indexOf('\n};\n', k) + 4) + fn('function cOpenView(') + '\nthis.open = cOpenView;', ctx);
  ctx.open();
  return { els, blocks, counted, store };
}

test('every figure counts; a dash from a failed read does not', () => {
  const r = page([['Overdue', '21'], ['Leads', '63'], ['Inbox', '—']]);
  assert.equal(r.counted.length, 2);
});

test('the first visit bumps nothing: nothing has changed yet', () => {
  const r = page([['Overdue', '21'], ['Leads', '63']]);
  assert.ok(r.els.every((e) => !e.classList.has('m-bumped')), 'the shake is removed after counting');
  assert.deepEqual(JSON.parse(r.store.intakeSeen), { '#/home|Overdue': '21', '#/home|Leads': '63' }, 'and what was seen is remembered');
});

test('a figure that CHANGED since last seen keeps its bump; an unchanged one does not', () => {
  const r = page([['Overdue', '22'], ['Leads', '63']], { stored: { '#/home|Overdue': '21', '#/home|Leads': '63' } });
  assert.ok(r.els[0].classList.has('m-bumped'), 'Overdue went 21 -> 22, so it bumps');
  assert.ok(!r.els[1].classList.has('m-bumped'), 'Leads is still 63, so it only counts');
});

test('the screen opens block by block, in order', () => {
  const r = page([['Overdue', '21']]);
  assert.deepEqual(r.blocks.map((b) => b.st['--vi']), [0, 1, 2]);
  assert.ok(r.blocks.every((b) => b.cls.has('v-open')));
});

test('reduced motion: nothing moves, nothing counts', () => {
  const r = page([['Overdue', '21']], { on: false });
  assert.equal(r.counted.length, 0);
  assert.ok(r.blocks.every((b) => !b.cls.has('v-open')));
});

test('it runs once per tab change from the router, never on a redraw inside the tab', () => {
  assert.match(APP, /markCNav\(page\); await routeC\(page, arg\); cOpenView\(\);/);
  assert.doesNotMatch(fn('function cDrawJourney('), /cOpenView/, 'a filter click does not replay the opening');
  assert.match(APP, /@keyframes v-open\{from\{opacity:0;transform:translateY\(10px\)\}to\{opacity:1;transform:none\}\}/, 'a fade and a lift, never a scale');
});
