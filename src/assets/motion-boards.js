/* INTAKE MOTION, THE BOARDS (Q65, MASTER CONTROL for the owner, 06-07.10.2026; branch motion/2026-10-07-boards).
 * Four moments for MAIN's areas, each in A (SKOLA-expressive) and B (calm), on top of src/assets/motion.js (the
 * engine, docs/MOTION_API.md). This file WRAPS app functions; it never edits the app's code.
 *
 *   1. Journey board drag: the card lifts, the target column makes room, on drop the card travels into the column
 *      (a forward move leans right, a back move left) BEFORE the note dialog; after the save it settles in place.
 *      A cancelled back move brings it home.
 *   2. Today board: a rescheduled card travels into Due today, or folds into the Coming up column; unfolding Coming
 *      up opens like a drawer.
 *   3. Inbox cards: "Set aside" slides the card out quietly. ("Make a lead" -> the Journey is the engine's own
 *      moment: its doQualify wrap already reads the open card, .c-jp.is-open.)
 *   4. Help center: the flow is told as a story on arrival - the line draws, the stops pop in order, the labels rise.
 *
 * The engine's rules hold here too: once per arrival by a click (never on a reload or a redraw inside a place); A at
 * most 1.2 s, B at most 1 s, a hard stop after that; any pointer down, key or wheel finishes everything at once; a
 * data mark is uncovered, never scaled (the cards and the flow's stops are not data marks); reduced motion or a
 * hidden tab = nothing; with motion off the app is untouched. Colours: Novikontas blue #29a8df only. */
(function () {
  'use strict';
  var M = window.motion;
  if (!M || typeof M.live !== 'function') return;   // no engine on this page: nothing to add
  var A = function () { return M.mode === 'a'; };
  var EASE = 'cubic-bezier(.65,0,.25,1)', SOFT = 'cubic-bezier(.22,.9,.3,1)';
  M.css('/assets/motion-boards.css');

  // ---- the same clock as the engine: registered, capped, finished by any click -----------------------------
  var running = new Set();
  var cap = function () { return A() ? 1200 : 1000; };
  function run(el, frames, o) {
    if (!el || !el.animate || !M.live()) return null;
    var opts = { duration: 300, easing: EASE, fill: 'both' };
    for (var k in (o || {})) opts[k] = o[k];
    var a;
    try { a = el.animate(frames, opts); } catch (e) { return null; }
    running.add(a);
    var end = function () { running.delete(a); };
    a.finished.then(end, end);
    setTimeout(function () { try { a.finish(); } catch (e) { /* gone */ } }, cap());
    return a;
  }
  var after = function (anims) {
    return Promise.all([].concat(anims).filter(Boolean).map(function (a) { return a.finished.catch(function () {}); })).then(function () {});
  };
  function finishAll() { running.forEach(function (a) { try { a.finish(); } catch (e) { /* gone */ } }); running.clear(); }
  ['pointerdown', 'keydown', 'wheel'].forEach(function (t) { addEventListener(t, finishAll, { capture: true, passive: true }); });

  // ---- arrival by a click: the last pointer or key, as the engine counts it --------------------------------
  var gestureAt = -1e9;
  addEventListener('pointerdown', function () { gestureAt = performance.now(); }, true);
  addEventListener('keydown', function () { gestureAt = performance.now(); }, true);
  var byClick = function () { return performance.now() - gestureAt < 1500; };

  // ---- a card that travels: a copy of it moves from where it was to where it is going ---------------------
  var rectOf = function (el) { return el && el.getBoundingClientRect ? el.getBoundingClientRect() : null; };
  function ghostOf(el, r) {
    r = r || rectOf(el);
    if (!el || !r || !r.width) return null;
    var g = el.cloneNode(true);
    g.removeAttribute('id'); g.removeAttribute('onclick'); g.removeAttribute('tabindex'); g.removeAttribute('draggable');
    g.removeAttribute('data-id'); g.removeAttribute('data-pid');   // a copy is never the app's card: no selector finds it
    g.querySelectorAll('[id]').forEach(function (n) { n.removeAttribute('id'); });
    g.classList.remove('mo-lift', 'is-open');
    g.classList.add('mo-ghost', 'mo-ghost-card');
    g.style.cssText += ';left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px';
    document.body.appendChild(g);
    return { node: g, rect: r };
  }
  // A: the copy travels on an eased path that leans the way the move goes (dx = +1 right, -1 left, 0 straight) and
  // may shrink into its target (fold). B: no travel; the target gets a quick fade-and-settle and the copy fades.
  function travel(ghost, to, o) {
    o = o || {};
    if (!ghost || !to) return Promise.resolve();
    var r = ghost.rect, t = rectOf(to);
    if (!t || !r.width) return Promise.resolve();
    // where the copy IS now (a copy that has travelled once sits at its target; a new run starts from there, not from
    // its origin), and where it goes: into the target's top (travel), its middle and small (shrink), or exactly onto
    // the target's rectangle (exact: the way home)
    var cur = ghost.node.getBoundingClientRect();
    var ox = cur.left - r.left, oy = cur.top - r.top, os = cur.width / r.width || 1;
    var endW = o.exact ? t.width : o.shrink ? Math.min(r.width, 44) : Math.min(r.width, Math.max(120, t.width - 16));
    var s = endW / r.width;
    var x = (o.exact ? t.left : o.shrink ? t.left + t.width / 2 - endW / 2 : t.left + 8) - r.left;
    var y = (o.exact ? t.top : o.shrink ? t.top + 14 : t.top + 8) - r.top;
    if (!A()) {
      var b = [run(ghost.node, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: SOFT }),
        run(to, [{ opacity: 0.55, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: SOFT, fill: 'none' })];
      return after(b);
    }
    var lean = (o.dx || 0) * 18;
    var a = run(ghost.node, [
      { transform: 'translate(' + ox + 'px,' + oy + 'px) scale(' + os + ')', opacity: 1 },
      { transform: 'translate(' + ((ox + x) * 0.5 + lean) + 'px,' + ((oy + y) * 0.5 - 16) + 'px) scale(' + ((os + s) * 0.5) + ')', opacity: 1, offset: 0.55 },
      { transform: 'translate(' + x + 'px,' + y + 'px) scale(' + s + ')', opacity: o.shrink ? 0.2 : 1 }],
      { duration: o.shrink ? 520 : 460 });
    return after(a);
  }
  // the real card, drawn again by the app: it arrives from where the copy ended (A), or settles (B)
  function settlePlan(el, fromGhost) {
    var t = rectOf(el);
    if (A() && fromGhost && t && t.width) {
      var g = fromGhost.node.getBoundingClientRect();
      var sc = Math.max(0.3, Math.min(1, g.width / t.width));   // a bigger card (the open one) grows from the copy's rectangle
      return { duration: sc < 1 ? 380 : 320, frames: [
        { transformOrigin: '0 0', transform: 'translate(' + (g.left - t.left) + 'px,' + (g.top - t.top) + 'px) scale(' + sc + ')', opacity: 0.6 },
        { transformOrigin: '0 0', transform: 'none', opacity: 1 }] };
    }
    return { duration: 240, frames: [{ opacity: 0.4, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }] };
  }
  function settle(el, fromGhost) {
    if (!el) return Promise.resolve();
    var plan = settlePlan(el, fromGhost);
    return after(run(el, plan.frames, { duration: plan.duration, easing: SOFT, fill: 'none' }));
  }
  // the same, on the card a selector finds; if the app draws the view again meanwhile (the Journey does, as soon as
  // the opened person's conversation arrives) the settle carries on from where it was, on the card drawn again
  function settleOn(q, fromGhost) {
    var el = document.querySelector(q);
    if (!el) return Promise.resolve();
    var plan = settlePlan(el, fromGhost), start = performance.now();
    var a = run(el, plan.frames, { duration: plan.duration, easing: SOFT, fill: 'none' });
    if (!a) return Promise.resolve();
    var view = document.getElementById('view');
    if (view && window.MutationObserver) {
      var mo = new MutationObserver(function () {
        if (document.contains(el)) return;
        var again = document.querySelector(q), gone = performance.now() - start;
        if (again && gone < plan.duration) { el = again; run(again, plan.frames, { duration: plan.duration, delay: -gone, easing: SOFT, fill: 'none' }); }
      });
      mo.observe(view, { childList: true });
      setTimeout(function () { mo.disconnect(); }, plan.duration + 100);
    }
    return after(a);
  }
  var drop = function (ghost) { if (ghost && ghost.node) ghost.node.remove(); if (ghost && flying === ghost) flying = null; };
  var flying = null;                                 // the Journey's one copy in the air (set below)

  function wire() {
    if (M.mode === 'off') return;                    // nothing chosen or off: the app as it is today

    // ======================================================== 1. the Journey board's drag
    var drag = null;                                 // { id, card, rect, at }
    addEventListener('dragstart', function (ev) {
      var card = ev.target && ev.target.closest ? ev.target.closest('.c-jp[draggable]') : null;
      if (!card || !M.live()) return;
      drag = { id: card.dataset.id, card: card, rect: rectOf(card), at: performance.now() };
      card.classList.add('mo-lift');
    }, true);
    addEventListener('dragend', function () {
      document.querySelectorAll('.mo-lift').forEach(function (c) { c.classList.remove('mo-lift'); });
      document.querySelectorAll('.c-drop.mo-room').forEach(function (c) { c.classList.remove('mo-room'); });
    }, true);
    addEventListener('dragover', function (ev) {
      var col = ev.target && ev.target.closest ? ev.target.closest('.c-drop') : null;
      if (!drag || !M.live()) return;
      document.querySelectorAll('.c-drop.mo-room').forEach(function (c) { if (c !== col) c.classList.remove('mo-room'); });
      if (col && col.dataset.stage && drag.card && !col.contains(drag.card)) col.classList.add('mo-room');
    }, true);
    addEventListener('dragleave', function (ev) {
      var col = ev.target && ev.target.closest ? ev.target.closest('.c-drop') : null;
      if (col && ev.relatedTarget && !col.contains(ev.relatedTarget)) col.classList.remove('mo-room');
    }, true);

    var parked = null;                               // the copy waiting at its new column until the app redraws
    // flying (above): the one copy in the air; a second drop lands the first at once
    if (typeof cAskMoveNote === 'function' && typeof cMoveDir === 'function') {
      var askMove = cAskMoveNote;
      // eslint-disable-next-line no-global-assign
      cAskMoveNote = async function (id, from, to) {
        var d = drag && drag.id === id && performance.now() - drag.at < 60000 ? drag : null;
        drag = null;
        document.querySelectorAll('.c-drop.mo-room').forEach(function (c) { c.classList.remove('mo-room'); });
        if (d) d.card.classList.remove('mo-lift');
        if (!d || !M.live()) return askMove.apply(this, arguments);
        var dir = cMoveDir(from, to);
        var col = document.querySelector('.c-drop[data-stage="' + CSS.escape(to) + '"]');
        var ghost = ghostOf(d.card, d.rect), dim = null;
        drop(flying); flying = ghost;
        if (ghost && col) {
          if (A()) {                                 // A: the copy travels into the column, the real card waits unseen
            d.card.classList.add('mo-hidden');
            await travel(ghost, col, { dx: dir === 'forward' ? 1 : dir === 'back' ? -1 : 0 });
          } else {                                   // B: no travel; the card dims where it is and the column settles
            drop(ghost); ghost = null;
            dim = run(d.card, [{ opacity: 1 }, { opacity: 0.35 }], { duration: 200, easing: SOFT });
            await after([dim, run(col, [{ opacity: 0.55, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: SOFT, fill: 'none' })]);
          }
        }
        var back = function () {                     // the real card as it was
          d.card.classList.remove('mo-hidden');
          if (dim) { try { dim.cancel(); } catch (e) { /* gone */ } dim = null; }
        };
        var ask;
        try { ask = await askMove.apply(this, arguments); } catch (e) { drop(ghost); back(); throw e; }
        if (!ask) {                                  // cancelled: the card comes home
          if (ghost && A()) { var home = d.card; await travel(ghost, home, { dx: 0, exact: true }); }
          drop(ghost);
          var dimmed = Boolean(dim); back();
          if (dimmed) run(d.card, [{ opacity: 0.35 }, { opacity: 1 }], { duration: 200, easing: SOFT, fill: 'none' });
          return ask;
        }
        // the copy (A) waits at its column until the app redraws and the fresh card settles; B waits with nothing in
        // the air and settles the fresh card softly
        var at = performance.now();
        parked = { id: id, ghost: ghost, at: at };
        // no redraw in 3 s (the save failed, the app alerted): the copy goes, the real card is back where it was
        setTimeout(function () { if (parked && parked.id === id && parked.at === at) { drop(ghost); parked = null; back(); } }, 3000);
        return ask;
      };
    }
    if (typeof viewJourneyC === 'function') {
      var drawJourney = viewJourneyC;
      // eslint-disable-next-line no-global-assign
      viewJourneyC = async function () {
        var r = await drawJourney.apply(this, arguments);
        var p = parked; parked = null;
        if (p) {
          // the app opens the moved person after a move (C_JSEL), so the card comes back expanded (.c-jexp), and it
          // draws the board again as soon as that person's conversation arrives: settleOn carries the settle over
          var sel = '[data-id="' + CSS.escape(p.id) + '"]';
          var g = p.ghost;
          settleOn('#view .c-jp' + sel + ', #view .c-jexp' + sel, g).then(function () { drop(g); });
        }
        return r;
      };
    }

    // ======================================================== 2. the Today board
    if (typeof cTodayMoveTo === 'function') {
      var moveTo = cTodayMoveTo;
      // eslint-disable-next-line no-global-assign
      cTodayMoveTo = async function (pid, from, day) {
        var card = document.querySelector('#view .t-card[data-pid="' + CSS.escape(String(pid)) + '"]');
        var toToday = typeof cTodayIso === 'function' && day === cTodayIso();
        var target = document.querySelector(toToday ? '#view .t-drop[data-col="today"]' : '#view .t-drop[data-col="later"]');
        var folded = Boolean(target && target.classList.contains('t-fold'));
        var ghost = card && target && M.live() ? ghostOf(card) : null;
        if (ghost) { card.classList.add('mo-hidden'); await travel(ghost, target, { dx: 0, shrink: folded }); }
        var r = await moveTo.apply(this, arguments);  // the app saves and redraws
        if (ghost) {
          if (folded) {
            var n = document.querySelector('#view .t-fold[data-col="later"] b');   // on a phone (Q68) other columns fold too: only Coming up's count
            drop(ghost); if (n) { M.count(n); M.ping(n); }
          } else {
            var fresh = document.querySelector('#view .t-card[data-pid="' + CSS.escape(String(pid)) + '"]');
            settle(fresh, ghost).then(function () { drop(ghost); });
            if (!fresh) drop(ghost);
          }
        }
        return r;
      };
    }
    if (typeof cTodayPool === 'function') {
      var todayPool = cTodayPool;
      // eslint-disable-next-line no-global-assign
      cTodayPool = function () {
        // the fold's click sets C_TP.upOpen BEFORE it calls here, so the state is no witness: the page is. Folded
        // before the redraw (.t-fold), open after it (.t-foldx) = Coming up unfolded now.
        var wasFolded = Boolean(document.querySelector('#view .t-fold[data-col="later"]'));   // Coming up itself, not any folded column (Q68)
        var r = todayPool.apply(this, arguments);
        var isOpen = Boolean(document.querySelector('#view .t-foldx'));
        if (wasFolded && isOpen && byClick() && M.live()) {   // Coming up unfolds: a drawer opens
          var fold = document.querySelector('#view .t-foldx');
          var col = fold ? fold.closest('.t-col') : null;
          if (col) {
            var anims = [A()
              ? run(col, [{ clipPath: 'inset(0 100% 0 0)', opacity: 0.6 }, { clipPath: 'inset(0 0% 0 0)', opacity: 1 }], { duration: 420, fill: 'none' })
              : run(col, [{ opacity: 0, transform: 'translateX(-10px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: SOFT, fill: 'none' })];
            after(anims);
            M.stagger(col.querySelectorAll('.t-card'), { kind: 'fade', delay: A() ? 180 : 80 });
          }
        }
        return r;
      };
    }

    // ======================================================== 3. the Inbox card set aside
    if (typeof doArchive === 'function') {
      var archive = doArchive;
      // eslint-disable-next-line no-global-assign
      doArchive = async function (id) {
        var card = document.querySelector('#view .ib-card[data-id="' + CSS.escape(String(id)) + '"]');
        var src = card && M.live() ? { node: card.cloneNode(true), rect: rectOf(card) } : null;
        var r = await archive.apply(this, arguments);
        var err = document.getElementById('arErr');
        if (err && err.innerHTML.trim()) return r;   // refused: nothing moved
        if (src) {                                    // saved: the copy slides out quietly while the board redraws
          var ghost = ghostOf(src.node, src.rect);
          if (ghost) {
            ghost.node.classList.add('mo-quiet');
            var a = A()
              ? run(ghost.node, [{ transform: 'none', opacity: 1 }, { transform: 'translateX(-28px) scale(.98)', opacity: 0 }], { duration: 320 })
              : run(ghost.node, [{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: SOFT });
            after(a).then(function () { drop(ghost); });
          }
        }
        return r;
      };
    }

    // ======================================================== 4. the Help center's flow, told as a story
    if (typeof viewHelpC === 'function') {
      var help = viewHelpC;
      // eslint-disable-next-line no-global-assign
      viewHelpC = function () {
        var r = help.apply(this, arguments);
        if (!byClick() || !M.live()) return r;
        var steps = Array.prototype.slice.call(document.querySelectorAll('#view .hf-step'));
        if (!steps.length) return r;
        M.drawBaseline(steps, { pseudo: '::before' });                                                   // the line draws
        M.stagger(document.querySelectorAll('#view .hf-ico'), { kind: 'pop', delay: A() ? 140 : 60 });     // the stops pop, in order
        M.stagger(document.querySelectorAll('#view .hf-node > b, #view .hf-node > small'), { kind: 'fade', delay: A() ? 420 : 160 });   // the labels rise
        M.stagger(document.querySelectorAll('#view .hf-chips'), { kind: 'fade', delay: A() ? 640 : 240 });
        return r;
      };
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
