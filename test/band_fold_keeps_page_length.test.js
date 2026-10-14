// THE BAND FOLD KEEPS THE PAGE'S LENGTH (the owner, 14.10.2026, a photo from a big monitor: scrolling the Inbox showed the
// folded row of chips and the big chart at once). Measured in a browser at 1920x1080 on a page 140-200 px taller than the
// window: folding took 128 px off the page, the browser pulled the scroll back to the new end, the band unfolded, scroll
// anchoring put the scroll back, the band folded again - every frame, about 60 flips a second, while the tab sat still.
// Now the height a band gives up when it folds is kept as space above the element after it, so folding never changes the
// page's length and the fold depends on the scroll position alone. Two more things measured on a phone Journey: one
// layout with the page shorter, mid-fold, took all of the scroll away (the page jumped to the top), so the whole height is
// reserved before the folded one is measured; and space kept as the sticky band's OWN margin pushed the strip up under the
// top bar at the end of the page, so it is the next element's margin. Layout cannot run in node, so a small page model
// stands in for the browser: a sticky band, the element after it, block margins that collapse, the scroll clamped to the
// page's end and anchored to the content.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fn = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const line = (start) => { const i = APP.indexOf(start); assert.ok(i >= 0, start); return APP.slice(i, APP.indexOf('\n', i)); };

// The page around a band: the sentinel at 85 px, the band (178 px full, 50 px folded: the Inbox, measured; 14 px margin
// below it from the stylesheet), then the next element (the filter row, its own margin-top `had`). The two margins
// collapse, as block margins do. Every read of offsetHeight / offsetTop is a layout the browser really does: `layouts`
// keeps where the next element (and so everything after it, and the page's end) was at each one.
const SENT = 85;
function page(full = 178, mini = 50, css = 14, had = 0) {
  const cls = new Set();
  const b = {
    style: {},
    classList: { contains: (c) => cls.has(c), add: (c) => cls.add(c), remove: (c) => cls.delete(c),
      toggle: (c, on) => { if (on) cls.add(c); else cls.delete(c); } },
    get h() { return cls.has('is-mini') ? mini : full; },
    get offsetHeight() { P.layouts.push(n.top); return b.h; },
    mb: css,
  };
  const n = {
    style: { marginTop: '' },
    get mt() { return n.style.marginTop ? parseFloat(n.style.marginTop) : had; },
    get top() { return SENT + b.h + Math.max(b.mb, n.mt); },
    get offsetTop() { P.layouts.push(n.top); return n.top; },
  };
  b.nextElementSibling = n;
  const P = { b, n, layouts: [] };
  return P;
}
const load = (src) => {
  const ctx = { getComputedStyle: (e) => ({ marginTop: (e.mt ?? 0) + 'px', marginBottom: (e.mb ?? 0) + 'px' }) };
  vm.runInNewContext(src + '\nthis.fold = cBandFold;', ctx);
  return ctx.fold;
};
const NEW = load(line('const cFoldWant = ') + '\n' + fn('function cBandFold('));
// the fold as it was until patch 51: the class alone, the band's height leaves the page
const OLD = (b, y) => b.classList.toggle('is-mini', b.classList.contains('is-mini') ? y < -8 : y < -48);

// Each frame the band folds or unfolds from where the sentinel is; the page's end clamps the scroll; when what is under
// the band moves down, anchoring moves the scroll with it (what Chrome did in the measurement).
function scrollTo(fold, overflow, target, frames = 240) {
  const P = page(), VH = 1080;
  const rest = VH + overflow - P.n.top;   // everything from the next element down: the full page overflows by `overflow`
  const len = () => P.n.top + rest;
  let y = Math.min(target, len() - VH), flips = 0;   // the person scrolls to `target` and lets go
  const ys = [];
  for (let f = 0; f < frames; f++) {
    const was = P.b.classList.contains('is-mini'), before = P.n.top;
    fold(P.b, SENT - y);
    if (P.b.classList.contains('is-mini') !== was) flips++;
    const d = P.n.top - before;
    y = Math.min(Math.max(0, y), len() - VH);          // the page's end
    if (d > 0 && y + VH < len()) y = Math.min(y + d, len() - VH);   // anchoring follows the content down
    ys.push(y);
  }
  return { flips, end: y, mini: P.b.classList.contains('is-mini'), moved: new Set(ys.slice(-20)).size > 1 };
}

test('the model shows the bug: with the old fold a page 140-180 px taller than the window flips every frame', () => {
  for (const over of [140, 160, 176]) {
    const r = scrollTo(OLD, over, over);
    assert.ok(r.flips > 100, `overflow ${over}: ${r.flips} flips in 240 frames`);
    assert.ok(r.moved, `overflow ${over}: the scroll keeps moving by itself`);
  }
});

test('folded, nothing under the band moves: the page is exactly as long folded as unfolded, and never shorter mid-fold', () => {
  for (const [full, mini, had] of [[178, 50, 0], [212, 84, 0], [96, 40, 20], [50, 50, 0], [542, 157, 0], [542, 157, 30]]) {
    const P = page(full, mini, 14, had);
    const open = P.n.top;
    P.layouts.length = 0;
    NEW(P.b, -200);
    assert.ok(P.b.classList.contains('is-mini'));
    assert.equal(P.n.top, open, `${full}/${mini}: the next element at ${P.n.top}, was ${open}`);
    // a page shorter even for the one layout that measures the folded band lost all of its scroll on a phone
    assert.ok(Math.min(...P.layouts) >= open, `${full}/${mini}: never shorter mid-fold (${P.layouts.join(', ')})`);
    assert.equal(P.b.style.marginBottom, undefined, 'the sticky band\'s own margin is never touched: it would push the strip up at the page end');
    NEW(P.b, 0);
    assert.ok(!P.b.classList.contains('is-mini'));
    assert.equal(P.n.style.marginTop, '', 'unfolded, the stylesheet margin is back');
    assert.equal(P.n.top, open);
  }
});

test('on any page length the band folds at most once and the scroll never moves by itself', () => {
  for (let over = 0; over <= 400; over += 4) {
    for (const target of [over, Math.floor(over / 2)]) {
      const r = scrollTo(NEW, over, target);
      assert.ok(r.flips <= 1, `overflow ${over}, scrolled to ${target}: ${r.flips} flips`);
      assert.ok(!r.moved, `overflow ${over}: the scroll stays where it was put`);
      assert.equal(r.end, Math.min(target, over), `overflow ${over}: the end of the page stays reachable`);
      assert.equal(r.mini, Math.min(target, over) > SENT + 48, `overflow ${over}, at ${target}: folded only past the fold line`);
    }
  }
});

test('two fold lines: between them the band stays as it is, both ways', () => {
  const { b } = page();
  for (const y of [0, -8, -20, -48]) { NEW(b, y); assert.ok(!b.classList.contains('is-mini'), `unfolded at ${y}`); }
  NEW(b, -49); assert.ok(b.classList.contains('is-mini'), 'folds past 48 px');
  for (const y of [-48, -20, -9]) { NEW(b, y); assert.ok(b.classList.contains('is-mini'), `still folded at ${y}`); }
  NEW(b, -8); assert.ok(!b.classList.contains('is-mini'), 'unfolds at 8 px');
});

test('every folding band uses the one fold: the Inbox, Due and Journey list bands, and the Journey strip on a phone', () => {
  assert.match(fn('function cPoolMini('), /cBandFold\(b, s\.getBoundingClientRect\(\)\.top - top\);/);
  assert.match(fn('function cJourneyMini('), /if \(!cPhone\(\)\) \{ cBandFold\(b, 0\); return; \}/);
  assert.match(fn('function cJourneyMini('), /cBandFold\(b, s\.getBoundingClientRect\(\)\.top - top\);/);
  assert.doesNotMatch(APP, /classList\.toggle\('is-mini'/, 'no fold left that drops the band\'s height from the page');
  assert.match(fn('function cPoolWire('), /addEventListener\('resize', \(\) => \{ document\.querySelectorAll\('\.pband\.is-mini, \.c-summary\.is-mini'\)\.forEach\(\(b\) => cBandFold\(b, 0\)\); cPoolMini\(\); \}\)/,
    'a new width unfolds first, so the next fold measures the band again');
  // every band is followed by its filter row, the element that carries the kept space
  assert.match(fn('function cPoolFrame('), /\$\{band\}\$\{filters\}/);
  assert.match(APP, /\$\{cJourneySummary\(everyone, taskOf, [^\n]+\n\s+\$\{cJourneyFilters\(everyone\)\}/);
});
