// THE SPINE (the owner, 02.10.2026): "a hairline BEHIND the logos of the menu tabs, with a
// flow to it". It is the children's existing hairline carried up through the top-level
// icons, so it must meet the icons where they are DRAWN, stop short of each one so it reads
// as running behind it, and be blue from Home down to the place you are in.
//
// cSpine() runs here against a stub menu whose boxes are known, so the test proves the
// geometry it produces rather than the text of the function.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fn = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };

const rect = (top, h = 17, left = 10, w = 17) => ({ top, bottom: top + h, left, width: w, height: h });

// Home, Admissions, People, Reports icons at known heights; the nav box starts at 100
function run(activeTop) {
  const icons = [rect(110), rect(140), rect(220), rect(300)].map((r) => ({ getBoundingClientRect: () => r }));
  const svg = { innerHTML: '' };
  const active = activeTop == null ? [] : [{ getBoundingClientRect: () => rect(activeTop, 30) }];
  const nav = {
    getBoundingClientRect: () => ({ top: 100, left: 0 }),
    querySelector: (q) => (q === '.c-spine' ? svg : null),
    querySelectorAll: (q) => (q.includes('> svg') ? icons : q.startsWith('a.on') ? active : []),
    insertAdjacentHTML: () => {},
  };
  const ctx = { document: { querySelector: (q) => (q === '.cnav' ? nav : null) } };
  vm.runInNewContext(fn('function cSpine(') + '\nthis.f = cSpine;', ctx);
  ctx.f();
  return [...svg.innerHTML.matchAll(/<line( class="on")? x1="([\d.]+)" x2="[\d.]+" y1="([\d.]+)" y2="([\d.]+)"/g)]
    .map((m) => ({ on: Boolean(m[1]), x: Number(m[2]), y1: Number(m[3]), y2: Number(m[4]) }));
}

test('one segment between each pair of icons, at the icons own centre line', () => {
  const base = run(null).filter((s) => !s.on);
  assert.equal(base.length, 3, 'Home-Admissions, Admissions-People, People-Reports');
  for (const s of base) assert.equal(s.x, 18.5, 'the icon centre, the same x as the children hairline');
});

test('it runs BEHIND the icons: every segment stops short of the icon above and below', () => {
  const base = run(null).filter((s) => !s.on);
  // icons occupy 10-27, 40-57, 120-137, 200-217 relative to the nav
  assert.deepEqual(base.map((s) => [s.y1, s.y2]), [[30, 37], [60, 117], [140, 197]]);
});

test('the flow: blue from Home down to the place you are in, and not beyond', () => {
  // People is active: its link centre is at 220 + 15 - 100 = 135
  const on = run(220).filter((s) => s.on);
  assert.deepEqual(on.map((s) => [s.y1, s.y2]), [[30, 37], [60, 117]], 'Home to People lit, People to Reports not');
  assert.equal(run(null).filter((s) => s.on).length, 0, 'nowhere active, nothing lit');
});

test('it is measured, hidden on a phone, and never on Settings', () => {
  assert.match(APP, /@media \(max-width:900px\)\{ html\.ui-c \.cnav \.c-spine\{display:none\} \}/);
  assert.match(fn('function cSpine('), /:not\(\.c-navfoot\)/, 'Settings sits apart and is not on the journey');
  assert.match(fn('function markCNav('), /cSpine\(\)/, 'redrawn whenever the place changes');
});

test('the childrens hairline is unchanged, so the spine is the same line and not a second one', () => {
  assert.match(APP, /html\.ui-c \.cnav \.kids\{margin:1px 0 6px 18px;padding-left:10px;border-left:1px solid var\(--rule\)\}/);
  assert.match(APP, /html\.ui-c:not\(\[data-theme="dark"\]\) \.cnav \.kids\{border-left-color:#bcdcf1\}/);
  assert.match(APP, /html\.ui-c \.cnav \.c-spine line\{stroke:#bcdcf1;/, 'the spine takes the same light colour');
});
