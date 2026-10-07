/* INTAKE MOTION - THE CHARTS (Q65, MASTER CONTROL for the owner, 07.10.2026; branch motion/2026-10-07-charts).
 * Runs on the engine (src/assets/motion.js, docs/MOTION_API.md): ?motion=a (SKOLA-expressive) | b (calm) | off.
 * The owner picks A, B or a hybrid; nothing here changes the app's code, it wraps three of its functions.
 *
 * THE MOMENTS, each in A and B:
 *   Home         the month chart: the bars are uncovered from the baseline in month order, then the leads line draws
 *                (A) / fades in (B) with its dots; the donut's segments draw on in order, clockwise from the top (A: a
 *                sweeping mask) / fade in in order (B); the target meters' fill is uncovered to its value and the
 *                target tick pops (A) / both fade in (B).
 *   Reports      the open chapter's bars are uncovered (columns from the baseline, rows from the left; B: fade); a tab
 *                switch slides the pill from the old tab to the new one and slides the panel in from that side; the
 *                benchmark rows: the grey band appears, then our dot travels along the track to its value (A) / fades
 *                in where it is (B), and the working a -> b counts up.
 *
 * THE ENGINE'S RULES, kept: once per ARRIVAL (a new place, or a tab clicked), never on a reload or a redraw; short (A
 * <= 1.2 s, B <= 1 s); any click, key or wheel finishes everything at once; a data mark is only UNCOVERED (clip,
 * opacity) or travels to its own place, never scaled or bounced, and its final geometry is exactly the app's; reduced
 * motion or a hidden tab = nothing (motion.live()). With motion off the app is untouched: every call returns at once.
 *
 * The engine's public calls cover the vertical uncover (stagger 'rise'), fades, pops, the pill and the count. A
 * sideways uncover, the donut's sweep, the panel slide and the dot's travel are not among them, so they run through
 * play() below, which keeps the same rules (live check, cap, finished by any click).
 */
(function () {
  'use strict';
  var M = window.motion;
  if (!M || typeof cOpenView !== 'function') return;          // no engine or not the app: nothing to do
  M.css('/assets/motion-charts.css');
  var A = function () { return M.mode === 'a'; };
  var EASE = 'cubic-bezier(.65,0,.25,1)', SOFT = 'cubic-bezier(.22,.9,.3,1)';
  var $$ = function (root, sel) { return root ? Array.prototype.slice.call(root.querySelectorAll(sel)) : []; };

  // ---- play: one Web Animation under the engine's rules ---------------------------------------------------------
  var running = new Set();
  function play(el, frames, o) {
    if (!M.live() || !el || !el.animate) return null;
    var opts = { duration: 300, easing: EASE, fill: 'backwards' };
    for (var k in (o || {})) opts[k] = o[k];
    var a;
    try { a = el.animate(frames, opts); } catch (e) { return null; }
    running.add(a);
    var end = function () { running.delete(a); };
    a.finished.then(end, end);
    setTimeout(function () { try { a.finish(); } catch (e) { /* gone */ } }, A() ? 1200 : 1000);
    return a;
  }
  ['pointerdown', 'keydown', 'wheel'].forEach(function (t) {
    addEventListener(t, function (ev) {
      if (!ev.isTrusted) return;
      running.forEach(function (a) { try { a.finish(); } catch (e) { /* gone */ } });
      running.clear();
    }, true);
  });
  var after = function (a, fn) { if (a) a.finished.then(fn, fn); else fn(); };

  // a long list keeps the whole moment under the cap: the steps share at most 560 ms
  var fit = function (els, step) { return Math.min(step, Math.floor(560 / Math.max(1, els.length))); };
  // a bar, a row or a fill uncovered from its LEFT edge (A) or faded in (B)
  function fromLeft(els, delay, step) {
    step = fit(els, step);
    els.forEach(function (el, i) {
      if (A()) play(el, [{ clipPath: 'inset(-4px 100% -4px 0)' }, { clipPath: 'inset(-4px 0 -4px 0)' }], { duration: 320, delay: delay + i * step });
      else play(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay: delay + i * Math.min(step, 30), easing: SOFT });
    });
  }
  // columns uncovered from the BASELINE (the engine's 'rise'), or faded in (B)
  function fromBase(els, delay, step) { M.stagger(els, { kind: A() ? 'rise' : 'fade', delay: delay, step: fit(els, A() ? step : 30) }); }

  // ---- HOME ----------------------------------------------------------------------------------------------------
  function monthChart(view) {
    var svg = view.querySelector('.kb-charts .kchart');
    if (!svg) return;
    var bars = $$(svg, '.kcol path'), line = svg.querySelector('.kline'), dots = $$(svg, '.kdot');
    var lineAt = A() ? 120 + Math.max(0, bars.length - 1) * 40 + 260 : 260;   // the line comes after the bars
    fromBase(bars, A() ? 120 : 0, 40);
    if (line) {
      if (A()) play(line, [{ strokeDasharray: '1 1', strokeDashoffset: 1 }, { strokeDasharray: '1 1', strokeDashoffset: 0 }], { duration: 320, delay: lineAt, easing: 'linear' });
      else play(line, [{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: lineAt, easing: SOFT });
    }
    var dotStep = dots.length > 1 ? (A() ? 320 : 120) / dots.length : 0;
    dots.forEach(function (d, i) { play(d, [{ opacity: 0 }, { opacity: 1 }], { duration: 160, delay: lineAt + i * dotStep, easing: SOFT }); });
  }

  var maskSeq = 0;
  function donut(view) {
    var ring = view.querySelector('.kb-charts .kdonut .kring');
    if (!ring) return;
    var segs = $$(ring, '.kseg'), wall = ring.querySelector('.kwall');
    if (!A()) { M.stagger(wall ? [wall].concat(segs) : segs, { kind: 'fade', delay: 60, step: 60 }); return; }
    if (!M.live()) return;
    // A: one mask over the whole ring, a sector that sweeps clockwise from twelve o'clock, so the segments (and the
    // plinth under them) are uncovered in their own order and land exactly where the app drew them
    var svg = ring.ownerSVGElement, NS = 'http://www.w3.org/2000/svg', id = 'mo-dmask-' + (++maskSeq);
    var defs = document.createElementNS(NS, 'defs'), mask = document.createElementNS(NS, 'mask'), c = document.createElementNS(NS, 'circle');
    mask.setAttribute('id', id); mask.setAttribute('maskUnits', 'userSpaceOnUse');
    mask.setAttribute('x', '0'); mask.setAttribute('y', '0'); mask.setAttribute('width', '140'); mask.setAttribute('height', '140');
    // centre and reach of the app's donut (cDonut: c 70, cy 62, R 54, plinth 11 below): a disc of radius 68
    c.setAttribute('cx', '70'); c.setAttribute('cy', '62'); c.setAttribute('r', '34'); c.setAttribute('fill', 'none');
    c.setAttribute('stroke', '#fff'); c.setAttribute('stroke-width', '68'); c.setAttribute('pathLength', '1');
    c.setAttribute('transform', 'rotate(-90 70 62)'); c.style.strokeDasharray = '1 1'; c.style.strokeDashoffset = '1';
    mask.appendChild(c); defs.appendChild(mask); svg.insertBefore(defs, svg.firstChild);
    ring.setAttribute('mask', 'url(#' + id + ')');
    var a = play(c, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 600, delay: 120, fill: 'both' });
    after(a, function () { ring.removeAttribute('mask'); defs.remove(); });
    if (!a) { ring.removeAttribute('mask'); defs.remove(); }
  }

  // the year's target: the fill uncovered to its value, then the target tick pops (A); both fade in (B)
  function meters(root) {
    var fills = $$(root, '.ktgt-track > i'), ticks = $$(root, '.ktgt-track > s');
    fromLeft(fills, A() ? 160 : 40, 90);
    M.stagger(ticks, { kind: A() ? 'pop' : 'fade', delay: A() ? 160 + 320 + 60 : 120, step: 90 });
  }

  function home(view) {
    monthChart(view);
    donut(view);
    meters(view.querySelector('.kstrip'));
  }

  // ---- REPORTS -------------------------------------------------------------------------------------------------
  function chapter(panel, delay) {
    if (!panel) return;
    fromBase($$(panel, '.rp-cols .rp-colt > i'), delay, 30);
    fromLeft($$(panel, '.kbars .kbt > i'), delay, 35);
    meters(panel);
    bench(panel, delay);
  }

  // the benchmark rows: the grey band appears, then our dot travels to its value (A) or fades in there (B); the
  // working a -> b counts up
  function bench(panel, delay) {
    $$(panel, '.bm-row').forEach(function (row, r) {
      var at = delay + r * 100;
      var band = row.querySelector('.bm-band'), label = row.querySelector('.bm-bandl'), dot = row.querySelector('.bm-dot');
      M.stagger([band, label].filter(Boolean), { kind: 'fade', delay: at, step: 40 });
      if (dot) {
        var box = row.querySelector('.bm-trackbox').getBoundingClientRect(), d = dot.getBoundingClientRect();
        var dx = Math.round(d.left - box.left);
        if (A() && dx > 0) play(dot, [{ transform: 'translateX(' + -dx + 'px)', opacity: 0 }, { transform: 'translateX(' + -dx + 'px)', opacity: 1, offset: 0.12 }, { transform: 'none', opacity: 1 }], { duration: 560, delay: at + 200 });
        else play(dot, [{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: at + 160, easing: SOFT });
      }
      $$(row, '.bm-name small .rp-go').forEach(function (n) { M.count(n); });
    });
  }

  function reports(view) {
    chapter(view.querySelector('.rp-b > .rp-ch:not([hidden])'), A() ? 260 : 80);
  }

  // a tab clicked: the pill slides from the old tab, the panel slides in from that side, its bars are uncovered
  if (typeof cRepTab === 'function') {
    var repTab = cRepTab;
    // eslint-disable-next-line no-global-assign
    cRepTab = function (id) {
      var tabs = document.querySelector('#view .rp-tabs');
      var old = tabs && tabs.querySelector('[aria-selected="true"]');
      var oldRect = old && old.getBoundingClientRect(), oldIdx = old ? $$(tabs, '.rp-tab').indexOf(old) : -1;
      var out = repTab.apply(this, arguments);
      var now = tabs && tabs.querySelector('[aria-selected="true"]');
      if (!now || now === old || !M.live()) return out;
      var dir = $$(tabs, '.rp-tab').indexOf(now) > oldIdx ? 1 : -1;
      M.pill(tabs, now, oldRect);
      var panel = document.getElementById('rep-' + id);
      if (panel) {
        if (A()) play(panel, [{ opacity: 0, transform: 'translateX(' + 28 * dir + 'px)' }, { opacity: 1, transform: 'none' }], { duration: 380 });
        else play(panel, [{ opacity: 0, transform: 'translateX(' + 8 * dir + 'px)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: SOFT });
      }
      chapter(panel, A() ? 180 : 60);
      return out;
    };
  }

  // ---- ARRIVALS: a new place only, never the first draw (a reload) and never a redraw in the same place --------
  // The place the page OPENED on is taken now, at install: the app may draw it before this file runs, so counting
  // calls would mistake the first click after a load for the load itself and swallow it.
  var place = function () {
    var h = (location.hash || (typeof START === 'function' ? START() : '#/home')).split('?')[0];
    return cPlace(h.split('/')[1] || 'home') || h.split('/')[1] || 'home';
  };
  var last = place();
  var openView = cOpenView;
  // eslint-disable-next-line no-global-assign
  cOpenView = function () {
    var out = openView.apply(this, arguments);
    var p = place(), was = last;
    last = p;
    if (p === was || !M.live()) return out;
    var view = document.getElementById('view');
    if (!view) return out;
    if (p === 'home') home(view);
    else if (p === 'reports') reports(view);
    return out;
  };
})();
