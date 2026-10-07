/* INTAKE MOTION ENGINE (demo/2026-10-07-motion-ab, 06-07.10.2026; MASTER CONTROL for the owner, Q65).
 *
 * ?motion=a  A, SKOLA-expressive: iris out of the clicked thing, draw-on lines, pop in reading order, curved flights,
 *            marching dashes, highlighter, sliding pill, ping. One moment <= 1.2 s.
 * ?motion=b  B, calm: opacity + an 8-12 px slide, 200-300 ms, no flights (a fade-and-settle at the target), an
 *            underline instead of the highlighter, no marching dashes. One moment <= 1 s.
 * ?motion=off or nothing ever chosen: today's app, untouched. ?motion=1 = A. The choice lives in sessionStorage.
 *
 * Rules (docs/MOTION_API.md): once per arrival by a click, never on a reload or a redraw; a click / key / wheel
 * finishes everything at once; a data mark is uncovered, never scaled; reduced motion or a hidden tab = nothing.
 * The SKOLA ease cubic-bezier(.65,0,.25,1) for travel, a soft settle for B. Every animation is Web Animations, so the
 * engine can finish all of them at once.
 */
(function () {
  'use strict';
  // RELEASE (the owner picked A for page moves, board actions and charts, 07.10.2026): A only, always on; no switch,
  // no stamp. prefers-reduced-motion or a hidden tab still means nothing moves (M.live).
  var M = window.motion = { mode: 'a' };
  var root = document.documentElement;
  var EASE = 'cubic-bezier(.65,0,.25,1)', SOFT = 'cubic-bezier(.22,.9,.3,1)';
  // A's page changes (the owner picked A 07.10.2026, "if the transition was smoother"): the arriving page decelerates
  // into place (ease-out quint), the leaving one only fades and drifts a little, so no two pages fight on screen
  var OUT = 'cubic-bezier(.22,1,.36,1)', LEAVE = 'cubic-bezier(.4,0,1,1)';
  var reduced = function () { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; };
  var A = function () { return M.mode === 'a'; };
  M.live = function () { return !reduced() && !document.hidden && typeof Element.prototype.animate === 'function'; };
  root.classList.add('mo-a');

  // ---- the clock: every animation is registered, capped, and finished by any click ------------------------------
  var running = new Set();
  var cap = function () { return A() ? 1200 : 1000; };
  function run(el, frames, o, pseudo) {
    if (!el || !el.animate) return null;
    var opts = { duration: 300, easing: EASE, fill: 'backwards' };
    for (var k in (o || {})) opts[k] = o[k];
    if (pseudo) opts.pseudoElement = pseudo;
    var a;
    try { a = el.animate(frames, opts); } catch (e) { return null; }
    running.add(a);
    var end = function () { running.delete(a); };
    a.finished.then(end, end);
    setTimeout(function () { try { a.finish(); } catch (e) { /* gone */ } }, cap());
    return a;
  }
  // the engine's own clock for a lane's custom animation: nothing when motion is not live, capped, finished by a click
  M.run = function (el, frames, opts, pseudo) { return M.live() ? run(el, frames, opts, pseudo) : null; };
  var all = function (anims) {
    return Promise.all([].concat(anims).filter(Boolean).map(function (a) { return a.finished.catch(function () {}); })).then(function () {});
  };
  function finishAll() { running.forEach(function (a) { try { a.finish(); } catch (e) { /* gone */ } }); running.clear(); }
  ['pointerdown', 'keydown', 'wheel'].forEach(function (t) {
    addEventListener(t, function (ev) { if (ev.isTrusted) finishAll(); }, true);
  });
  var list = function (x) { return !x ? [] : (x.length !== undefined && !x.nodeType ? Array.prototype.slice.call(x) : [x]); };
  var rectOf = function (x) { return !x ? null : (x.getBoundingClientRect ? x.getBoundingClientRect() : x); };
  var done = Promise.resolve();

  M.css = function (href) {
    if (document.querySelector('link[data-mo="' + href + '"]')) return;
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; l.setAttribute('data-mo', href);
    document.head.appendChild(l);
  };
  M.css('/assets/motion.css');

  // ---- ping: one ring where you land --------------------------------------------------------------------------
  M.ping = function (el) {
    if (!M.live() || !el || !el.getBoundingClientRect) return done;
    var r = el.getBoundingClientRect(); if (!r.width) return done;
    var ring = document.createElement('div'); ring.className = 'mo-ring'; ring.setAttribute('aria-hidden', 'true');
    var radius = getComputedStyle(el).borderRadius;
    ring.style.cssText = 'left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px;border-radius:' + (radius && radius !== '0px' ? radius : '10px');
    document.body.appendChild(ring);
    var a = A()
      ? run(ring, [{ boxShadow: '0 0 0 2px rgba(41,168,223,1)', opacity: 1 }, { boxShadow: '0 0 0 14px rgba(41,168,223,0)', opacity: 0 }], { duration: 420, fill: 'both' })
      : run(ring, [{ boxShadow: '0 0 0 2px rgba(41,168,223,.75)', opacity: 1 }, { boxShadow: '0 0 0 2px rgba(41,168,223,0)', opacity: 0 }], { duration: 320, easing: SOFT, fill: 'both' });
    return all(a).then(function () { ring.remove(); });
  };

  // ---- count: the kit's count-up (part 9), landing on the exact text -------------------------------------------
  M.count = function (el) {
    if (!M.live() || !el || !window.Motion || !window.Motion.count) return done;
    return new Promise(function (res) { window.Motion.count(el, { ms: A() ? 900 : 600, done: res }); setTimeout(res, cap()); });
  };

  // ---- drawBaseline: a line draws left to right (A), or fades in (B) -------------------------------------------
  M.drawBaseline = function (els, o) {
    o = o || {}; els = list(els);
    if (!M.live() || !els.length) return done;
    var total = o.total || 300, seg = total / els.length, delay = o.delay || 0;
    return all(els.map(function (el, i) {
      return A()
        ? run(el, [{ transform: 'scaleX(0)', transformOrigin: 'left center' }, { transform: 'scaleX(1)', transformOrigin: 'left center' }],
          { duration: seg, delay: delay + i * seg, easing: 'linear' }, o.pseudo)
        : run(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: delay, easing: SOFT }, o.pseudo);
    }));
  };

  // ---- stagger: in reading order. 'rise' = a DATA mark uncovered from its baseline (clip, never scaled) ----------
  M.stagger = function (els, o) {
    o = o || {}; els = list(els);
    if (!M.live() || !els.length) return done;
    var kind = o.kind || 'fade', delay = o.delay || 0;
    return all(els.map(function (el, i) {
      if (!A()) {
        var f = kind === 'pop' ? [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }] : [{ opacity: 0 }, { opacity: 1 }];
        return run(el, f, { duration: 220, delay: delay + i * (o.step || 30), easing: SOFT });
      }
      if (kind === 'rise') {
        return run(el, [{ clipPath: 'inset(100% -60px 0 -60px)' }, { clipPath: 'inset(-60px -60px 0 -60px)' }],
          { duration: 280, delay: delay + i * (o.step || 50), easing: OUT });
      }
      if (kind === 'pop') {
        return run(el, [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1.06)', offset: 0.7 }, { opacity: 1, transform: 'none' }],
          { duration: 360, delay: delay + i * (o.step || 60), easing: 'ease-out' });
      }
      return run(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: delay + i * (o.step || 50), easing: SOFT });
    }));
  };

  // ---- mark: a number that changed since the last visit (replaces the shake) -----------------------------------
  M.mark = function (el) {
    if (M.mode === 'off' || reduced() || !el) return done;
    var tn = null;
    (function find(n) { for (var c = n.firstChild; c && !tn; c = c.nextSibling) { if (c.nodeType === 3 && /\d/.test(c.nodeValue)) tn = c; else if (c.nodeType === 1 && !c.classList.contains('mo-mark')) find(c); } })(el);
    if (!tn) return done;
    var span = tn.parentNode.classList && tn.parentNode.classList.contains('mo-mark') ? tn.parentNode : null;
    if (!span) { span = document.createElement('mo-mark'); span.className = 'mo-mark';   // its own tag: no app style for spans (the card labels) reaches it
      tn.parentNode.insertBefore(span, tn); span.appendChild(tn); }
    span.classList.add(A() ? 'mo-mark-a' : 'mo-mark-b');
    if (document.hidden) return done;
    var a = A()
      ? run(span, [{ backgroundSize: '0% 100%' }, { backgroundSize: '100% 100%' }], { duration: 450 })
      : run(span, [{ backgroundSize: '0% 2px' }, { backgroundSize: '100% 2px' }], { duration: 300, easing: SOFT });
    return all(a);
  };

  // ---- pill: slides from the old choice to the new one, then melts into the choice's own look ------------------
  M.pill = function (group, active, from) {
    if (!M.live() || !group || !active) return done;
    var g = group.getBoundingClientRect(), t = active.getBoundingClientRect(), f = rectOf(from);
    if (!t.width || !f || !f.width) return done;
    if (getComputedStyle(group).position === 'static') group.style.position = 'relative';
    group.classList.add('mo-pillg');
    var pill = document.createElement('i'); pill.className = 'mo-pill'; pill.setAttribute('aria-hidden', 'true');
    var radius = getComputedStyle(active).borderRadius;
    pill.style.cssText = 'left:' + (t.left - g.left + group.scrollLeft) + 'px;top:' + (t.top - g.top) + 'px;width:' + t.width + 'px;height:' + t.height + 'px;border-radius:' + (radius && radius !== '0px' ? radius : '8px');
    group.insertBefore(pill, group.firstChild);
    var dx = f.left - t.left, dy = f.top - t.top, sx = f.width / t.width, sy = f.height / t.height;
    var a = run(pill, [
      { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')', transformOrigin: '0 0', opacity: 1 },
      { transform: 'none', transformOrigin: '0 0', opacity: 1, offset: 0.75 },
      { transform: 'none', transformOrigin: '0 0', opacity: 0 }],
      { duration: A() ? 460 : 300, easing: A() ? OUT : SOFT, fill: 'both' });
    return all(a).then(function () { pill.remove(); });
  };

  // ---- flight: A = a copy travels on a curve onto the target, which pings; B = the target fades and settles ----
  M.flight = function (src, to) {
    if (!M.live() || !to) return done;
    var t = to.getBoundingClientRect();
    if (!A()) {
      var b = run(to, [{ opacity: 0.35, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: SOFT });
      return all(b).then(function () { return M.ping(to); });
    }
    var r = src && (src.rect || rectOf(src)), node = src && (src.node || (src.cloneNode ? src.cloneNode(true) : null));
    if (!r || !node || !t.width) return M.ping(to);
    node.removeAttribute('id'); node.removeAttribute('onclick'); node.removeAttribute('tabindex');
    node.classList.add('mo-ghost');
    node.style.cssText += ';left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px';
    document.body.appendChild(node);
    var x = t.left + Math.min(12, t.width / 2) - r.left, y = t.top + t.height / 2 - 8 - r.top, s = Math.min(1, 40 / r.width);
    var a = run(node, [
      { transform: 'translate(0px,0px) scale(1)', opacity: 1 },
      { transform: 'translate(' + x * 0.55 + 'px,' + (y * 0.55 - 24) + 'px) scale(' + (0.35 + s * 0.4) + ')', opacity: 1, offset: 0.55 },
      { transform: 'translate(' + x + 'px,' + y + 'px) scale(' + s + ')', opacity: 0.15 }],
      { duration: 560, fill: 'both' });
    return all(a).then(function () { node.remove(); return M.ping(to); });
  };

  // ---- march: marching dashes on a dashed SVG stroke (A only), until switched off ------------------------------
  M.march = function (el, on) {
    if (!el) return;
    if (el._moMarch) { el._moMarch.cancel(); el._moMarch = null; }
    if (on === false || !A() || !M.live() || !el.animate) return;
    if (!el.getAttribute('stroke-dasharray') && !el.style.strokeDasharray) el.style.strokeDasharray = '6 6';
    el._moMarch = el.animate([{ strokeDashoffset: 0 }, { strokeDashoffset: -12 }], { duration: 700, iterations: Infinity });
  };

  // ---- enter: a place arriving. deeper = out of the clicked rectangle; forward / back = a push ------------------
  // ONE PAGE AT A TIME (the owner on 896fe62, 07.10.2026: "there is small moment where both titles are at the same on
  // and it seems laggy"). The page being left is held as a copy while the next one is drawn INVISIBLE underneath; on
  // arrival the copy leaves first and fast (about 110 ms), and only then does the new page come in (about 300 ms), so
  // no frame ever shows two pages. The whole change stays at or under about 420 ms.
  var held = null;                                   // A: the page being left, and the view hidden until it arrives
  function dropHeld() { if (held) { held.wrap.remove(); if (held.view) held.view.style.opacity = ''; held = null; } }
  M.hold = function () {                             // the engine calls this when a place is being left
    dropHeld();
    var view = document.getElementById('view');
    if (!view || !A() || !M.live()) return;
    var r = view.getBoundingClientRect();
    var wrap = document.createElement('div'); wrap.className = 'mo-held'; wrap.setAttribute('aria-hidden', 'true');
    wrap.style.cssText = 'left:' + r.left + 'px;width:' + r.width + 'px';
    var c = view.cloneNode(false);                   // only the blocks on screen are copied; the rest keep their height
    Array.prototype.forEach.call(view.children, function (b) {
      var br = b.getBoundingClientRect();
      if (br.bottom > 0 && br.top < innerHeight) c.appendChild(b.cloneNode(true));
      else { var gap = document.createElement('div'); gap.style.height = br.height + 'px'; c.appendChild(gap); }
    });
    // THE COPY KEEPS id="view" (the owner, 07.10.2026: "the needs you turns into grey small boxes once clicked to
    // reports"): 56 of the app's rules are written '#view ...' (the cards, the Needs-you tiles), and a copy without the
    // id lost them, so its tiles fell back to their old boxed look for the moment it was on screen. The copy is placed
    // AFTER the real page, so getElementById('view') and querySelector('#view ...') still find the real one first; the
    // ids inside it go, so no lookup by id can land in the copy; it takes no pointer and no focus (inert).
    c.querySelectorAll('[id]').forEach(function (n) { n.removeAttribute('id'); });
    c.style.cssText = 'position:absolute;left:0;top:' + r.top + 'px;width:' + r.width + 'px;margin:0';
    wrap.setAttribute('inert', '');
    wrap.appendChild(c); document.body.appendChild(wrap);
    view.style.opacity = '0';                        // the next page is drawn here unseen; the copy shows the old one
    held = { wrap: wrap, view: view };
    setTimeout(function () { if (held && held.wrap === wrap) dropHeld(); }, 3000);
  };
  // the copy leaves (fast, fading), and is removed when it has
  function leave(old, ms, dx) {
    if (!old) return null;
    var c = old.wrap.firstChild; c.style.willChange = 'transform, opacity';
    var a = run(c, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: dx ? 'translateX(' + dx + 'px)' : 'none' }],
      { duration: ms, easing: LEAVE, fill: 'forwards' });   // the content moves, its clip box stays: never over the menu
    var gone = function () { old.wrap.remove(); };
    if (a) a.finished.then(gone, gone); else gone();
    return a;
  }
  M.enter = function (placeId, from, o) {
    o = o || {};
    var view = o.view || document.getElementById('view');
    var old = held; held = null;
    var show = function () { if (old && old.view) old.view.style.opacity = ''; };
    if (!M.live() || !view) { if (old) old.wrap.remove(); show(); return done; }
    var r = rectOf(from), dir = o.dir || (r ? 'deeper' : null);
    view.querySelectorAll('.v-open').forEach(function (b) { b.classList.remove('v-open'); });   // the engine carries this opening
    var anims = [];
    if (A()) {
      view.classList.add('mo-front');
      view.style.willChange = 'transform, opacity';
      if (dir === 'deeper' && r && r.width) {
        var v = view.getBoundingClientRect(), px = function (n) { return Math.max(0, Math.round(n)) + 'px'; };
        var start = 'inset(' + px(r.top - v.top) + ' ' + px(v.right - r.right) + ' ' + px(v.bottom - r.bottom) + ' ' + px(r.left - v.left) + ' round 14px)';
        anims.push(leave(old, 90, 0));
        anims.push(run(view, [{ clipPath: start }, { clipPath: 'inset(0px 0px 0px 0px round 0px)' }], { duration: 360, delay: 60, easing: OUT }));
      } else if (dir === 'forward' || dir === 'back') {
        var s = dir === 'forward' ? 1 : -1;
        anims.push(leave(old, 110, -10 * s));
        anims.push(run(view, [{ opacity: 0, transform: 'translate3d(' + 24 * s + 'px,0,0)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay: old ? 110 : 0, easing: OUT }));
      } else {
        anims.push(leave(old, 110, 0));
        anims.push(run(view, [{ opacity: 0, transform: 'translate3d(0,10px,0)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay: old ? 110 : 0, easing: OUT }));
      }
    } else {
      var from0 = dir === 'forward' ? 'translateX(10px)' : dir === 'back' ? 'translateX(-10px)' : dir === 'deeper' ? 'translateY(8px)' : 'none';
      anims.push(run(view, [{ opacity: 0, transform: from0 }, { opacity: 1, transform: 'none' }], { duration: dir ? 260 : 220, easing: SOFT }));
    }
    show();                                          // the arrival's own first frame (opacity 0 or the clip) takes over now
    return all(anims).then(function () { view.classList.remove('mo-front'); view.style.willChange = ''; if (old) old.wrap.remove(); });
  };

  // ---- the demo toggle: Motion A | B | off, bottom-left, once a choice was made in this tab ---------------------
  function drawToggle() {
    return;                                          // release: no demo toggle
    var t = document.getElementById('moToggle');
    if (!t) { t = document.createElement('div'); t.id = 'moToggle'; t.setAttribute('role', 'group'); t.setAttribute('aria-label', 'Motion'); document.body.appendChild(t); }
    t.innerHTML = '<span>Motion</span>' + [['a', 'A'], ['b', 'B'], ['off', 'off']].map(function (m) {
      return '<button type="button" data-m="' + m[0] + '" aria-pressed="' + (M.mode === m[0]) + '">' + m[1] + '</button>';
    }).join('') + (M.build ? '<small class="mo-build" title="The demo build you are looking at">' + M.build + '</small>' : '');
  }
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('#moToggle button');
    if (!b) return;
    var was = document.querySelector('#moToggle [aria-pressed="true"]'), wr = was && was.getBoundingClientRect();
    setMode(b.getAttribute('data-m')); drawToggle();
    try {                                            // the address says the choice too, so a reload keeps it
      var u = new URL(location.href); u.searchParams.set('motion', M.mode); history.replaceState(history.state, '', u.toString());
    } catch (e) { /* old browser */ }
    var now = document.querySelector('#moToggle [aria-pressed="true"]');
    if (wr) M.pill(document.getElementById('moToggle'), now, wr);
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', drawToggle); else drawToggle();

  // =================================================================================================================
  // INTAKE WIRING: the moments the engine plays by itself. Runs once the app's own scripts exist; does nothing when
  // the app is not there (the engine can be loaded by any page).
  // =================================================================================================================
  function wire() {
    if (typeof cOpenView !== 'function' || typeof cPlace !== 'function') return;
    var placeOf = function (h) { return cPlace((((h || location.hash || (typeof START === 'function' ? START() : '#/home')).split('?')[0]).split('/')[1]) || 'home'); };   // #/journey?v=board: the view after '?' is not the place
    var menuIndex = function (place) {
      var links = Array.prototype.slice.call(document.querySelectorAll('.cnav a[href^="#/"]'));
      for (var i = 0; i < links.length; i++) if (placeOf(links[i].getAttribute('href')) === place) return i;
      return -1;
    };
    var gesture = null;                              // the last thing pressed: what, where, when
    var PILLS = '.c-seg, .jb-cols, .p-mini, [data-mo-pill]';
    var ACTIVE = '[aria-pressed="true"], [aria-selected="true"], .on';
    var pillFrom = null;
    addEventListener('pointerdown', function (ev) {
      var el = ev.target.closest ? ev.target : null; if (!el) return;
      var card = el.closest('#view .kb-strip > div, #view .kneed, #view .rp-tab, #view [data-kgo], #view .kbar, #view .jb-col, #view .c-line, #view a, #view button');
      gesture = { at: performance.now(), inNav: Boolean(el.closest('.cnav, nav')), card: card, rect: card ? card.getBoundingClientRect() : null,
        back: Boolean(el.closest('[data-back], .c-back, [aria-label^="Back"], [title^="Back"]')) };
      var group = el.closest(PILLS);
      if (group) {
        var old = group.querySelector(ACTIVE);
        var all = Array.prototype.slice.call(document.querySelectorAll(PILLS));
        pillFrom = { at: performance.now(), key: group.className + '#' + all.indexOf(group), rect: old ? old.getBoundingClientRect() : null, group: group.getBoundingClientRect() };
      }
    }, true);
    addEventListener('keydown', function () { gesture = { at: performance.now(), key: true }; }, true);
    var recent = function (x) { return x && performance.now() - x.at < 1500; };

    document.addEventListener('change', function (ev) {
      var box = ev.target; if (!box.matches || !box.matches('.c-jfmenu input[type="checkbox"]') || !box.checked) return;
      var v = box.value;
      setTimeout(function () { var b = document.querySelector('.c-jfmenu input[value="' + v + '"]'); if (b && b.checked) M.ping(b.closest('label') || b); }, 60);
    }, true);
    // the page being left is held (A) BEFORE the router draws the next one: a capture listener runs first
    var stack = [location.hash];
    addEventListener('hashchange', function () { if (M.live() && A()) M.hold(); }, true);

    // pills: after any redraw, a group whose choice was just pressed slides its pill
    var view0 = document.getElementById('view');
    if (view0 && window.MutationObserver) {
      var queued = false;
      new MutationObserver(function () {
        if (queued || !recent(pillFrom)) return; queued = true;
        setTimeout(function () {
          queued = false; var p = pillFrom; if (!recent(p) || !p.rect) return;
          var groups = Array.prototype.slice.call(document.querySelectorAll(PILLS));
          var g = groups.filter(function (x, i) { return x.className.replace(' mo-pillg', '') + '#' + i === p.key.replace(' mo-pillg', ''); })[0];
          var act = g && g.querySelector(ACTIVE);
          if (act) {               // the old choice's place INSIDE its group: the group may sit elsewhere after a redraw
            pillFrom = null; var gr = g.getBoundingClientRect();
            M.pill(g, act, { left: gr.left + p.rect.left - p.group.left, top: gr.top + p.rect.top - p.group.top, width: p.rect.width, height: p.rect.height });
          }
        }, 16);
      }).observe(view0, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-pressed', 'aria-selected', 'class'] });
    }

    // every place arriving: one transition with meaning, the Journey's own opening, the landing tab's ping, the marks
    var last = placeOf();                            // the place the app opened on: it was drawn before this file ran
    var openView = cOpenView;
    // eslint-disable-next-line no-global-assign
    cOpenView = function () {
      var seenBefore = {};
      try { seenBefore = JSON.parse(localStorage.getItem('intakeSeen') || '{}') || {}; } catch (e) { /* private */ }
      openView.apply(this, arguments);
      var place = placeOf(), was = last, g = recent(gesture) ? gesture : null;
      last = place;
      var prevHash = stack[stack.length - 2]; stack.push(location.hash); if (stack.length > 30) stack.shift();
      var view = document.getElementById('view');
      marks(view, seenBefore);
      if (!g || place === was || !view) { if (held) dropHeld(); return; }   // never on a reload (no click), never on a redraw
      var dir = null, from = null;
      if (g && g.back) dir = 'back';
      else if (g && g.inNav) { var a = menuIndex(was), b = menuIndex(place); dir = a < 0 || b < 0 ? null : (b > a ? 'forward' : 'back'); }
      else if (g && g.rect) { dir = 'deeper'; from = g.rect; }
      else if (prevHash && location.hash === prevHash) dir = 'back';
      gesture = null;
      if (place === 'people' && view.querySelector('.jband .jb-col')) { journeyOpening(view); return; }
      M.enter(place, from, { dir: dir }).then(function () {
        if (place === 'reports') { var tab = view.querySelector('.rp-tabs [aria-selected="true"]'); if (tab && dir === 'deeper') M.ping(tab); }
      });
    };

    // a number that changed since this viewer's last visit: the mark replaces the shake (counts land first)
    function marks(view, before) {
      if (M.mode === 'off' || !view || typeof C_METRICS === 'undefined' || typeof cMetricKey !== 'function') return;
      var after = {};
      try { after = JSON.parse(localStorage.getItem('intakeSeen') || '{}') || {}; } catch (e) { return; }
      view.querySelectorAll(C_METRICS).forEach(function (el, i) {
        var k = cMetricKey(el, i);
        if (Object.prototype.hasOwnProperty.call(before, k) && before[k] !== after[k]) setTimeout(function () { M.mark(el); }, 1250 + Math.min(i, 12) * 40);
      });
    }

    // THE JOURNEY OPENING: the line draws, the stage columns rise out of it in stage order, the counts land last
    function journeyOpening(view) {
      var band = view.querySelector('.jband');
      var plots = band.querySelectorAll('.jb-cols .jb-plot'), bars = band.querySelectorAll('.jb-cols .jb-bar');
      var after = 0;                                 // one page at a time: the copy of the old page leaves first
      if (held) {
        var old = held; held = null; after = 100;
        leave(old, 100, 0);
        if (A()) run(view, [{ opacity: 0 }, { opacity: 1 }], { duration: 160, delay: after, easing: OUT });
        view.style.opacity = '';
      }
      view.querySelectorAll('.v-open').forEach(function (b) { if (b.contains(band)) b.classList.remove('v-open'); });
      if (A()) {
        M.drawBaseline(plots, { pseudo: '::after', total: 300, delay: after });
        M.stagger(bars, { kind: 'rise', delay: 260 + after, step: 50 });
      } else {
        M.drawBaseline(plots, { pseudo: '::after' });
        M.stagger(bars, { kind: 'fade', delay: 80, step: 30 });
      }
    }

    // INBOX "ADD TO ADMISSIONS": the message travels to the Journey (A), or the Journey settles (B). Only after the
    // save worked: a refusal or a possible duplicate moves nothing.
    if (typeof doQualify === 'function') {
      var qualify = doQualify;
      // eslint-disable-next-line no-global-assign
      doQualify = async function () {
        var row = document.querySelector('#view .ib-card.is-open, #view .c-lead.is-open, #view .c-jp.is-open');
        var src = row ? { rect: row.getBoundingClientRect(), node: row.cloneNode(true) } : null;
        await qualify.apply(this, arguments);
        var err = document.getElementById('qErr');
        if (err && err.innerHTML.trim()) return;
        M.flight(src, document.querySelector('.cnav a[href="#/journey"]'));
      };
    }

    // a menu badge whose number GREW pings once; an incoming-call card pings once
    var badges = {};
    var readBadges = function (quiet) {
      document.querySelectorAll('.cnav .n[id]').forEach(function (b) {
        var n = parseInt(b.textContent, 10) || 0, was = badges[b.id];
        badges[b.id] = n;
        if (!quiet && was !== undefined && n > was) M.ping(b.textContent.trim() ? b : b.parentNode);
      });
    };
    readBadges(true);
    var nav = document.querySelector('.cnav');
    if (nav && window.MutationObserver) new MutationObserver(function () { readBadges(false); }).observe(nav, { childList: true, subtree: true, characterData: true });
    var lastCall = null;                             // one look per batch of changes, not one per added node
    if (window.MutationObserver) {
      new MutationObserver(function () {
        var card = document.querySelector('#callpop .cp-card');
        if (card && card !== lastCall) { lastCall = card; setTimeout(function () { M.ping(card); }, 120); }
        if (!card) lastCall = null;
      }).observe(document.body, { childList: true, subtree: true });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
