// THE TOUR. Part 3 (Help and feedback): started from the Help center, and optionally on a first visit.
//
// Harvested from Talent Acquisition (openTour / drawTour / spotlight / dismissTourForever, live).
// What it keeps from there, because each rule was paid for:
//   - EVERY STEP RINGS THE REAL THING ON SCREEN. A step about something the reader cannot see is
//     worth little, so a step names an element (a CSS selector) and it is ringed while the step is up.
//   - THE CARD GOES WHERE THERE IS ROOM. The space above and below the ringed element is measured
//     against the card's own height; it takes the side it fits in (on a phone "the other half" is
//     not enough).
//   - SKIP IS NOT "DON'T SHOW AGAIN". Skip = not now. Don't show again = never, and the app can store
//     that on the ACCOUNT (saveNever), not just in one browser.
//   - IT SAYS WHERE TO FIND IT AGAIN, so dismissing it is not a one-way door.
//   - Focus goes to Next, Escape closes, focus returns to what opened it, and a reader who asked
//     for less motion gets no smooth scrolling.
//
//   var tour = HelpTour.create({ steps: [{ title, body, target: '#nextSteps' }, ...] });
//   button.onclick = function () { tour.open(button); };
//   if (tour.shouldAutoOpen()) tour.open();          // first visit, optional
//
// Options: steps (required; body is plain text), storageKey ('appTour'), findAgain ('You can find
// this tour again in the Help center.'), isNever / saveNever (the account's own preference; default
// this browser), onClose.
(function (root) {
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function store(key) {
    return {
      get: function (k) { try { return root.localStorage.getItem(key + ':' + k); } catch (e) { return null; } },
      set: function (k, v) { try { root.localStorage.setItem(key + ':' + k, v); } catch (e) { /* private window */ } },
    };
  }

  function create(opts) {
    opts = opts || {};
    var doc = opts.document || root.document;
    var steps = (opts.steps || []).filter(function (s) { return s && s.title; });
    var mem = store(opts.storageKey || 'appTour');
    var isNever = opts.isNever || function () { return mem.get('never') === '1'; };
    var saveNever = opts.saveNever || function () { mem.set('never', '1'); };
    var findAgain = opts.findAgain || 'You can find this tour again in the Help center.';
    var at = 0, spot = null, opener = null;
    var lessMotion = function () { try { return root.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

    function clearSpot() { if (spot) spot.classList.remove('ht-spot'); spot = null; }

    function place(el) {
      var ov = doc.getElementById('helpTour'); if (!ov) return;
      var card = ov.querySelector('.ht-card');
      if (!el) { ov.classList.remove('ht-top'); return; }
      var box = el.getBoundingClientRect();
      var h = card ? card.getBoundingClientRect().height : 240, pad = 32;
      var above = box.top - pad, below = root.innerHeight - box.bottom - pad;
      ov.classList.toggle('ht-top', below < h && above > below);
    }

    function spotlight(s) {
      clearSpot();
      if (!s.target) { place(null); return; }
      var el = doc.querySelector(s.target);
      if (!el) { place(null); return; }
      spot = el; el.classList.add('ht-spot');
      var block = root.innerWidth <= 620 ? 'start' : 'center';
      try { el.scrollIntoView({ block: block, behavior: lessMotion() ? 'auto' : 'smooth' }); } catch (e) { el.scrollIntoView(); }
      place(el);
      if (!lessMotion() && root.requestAnimationFrame) root.requestAnimationFrame(function () { place(el); });
    }

    function close() {
      mem.set('seen', '1');
      clearSpot();
      var ov = doc.getElementById('helpTour'); if (ov) ov.parentNode.removeChild(ov);
      doc.removeEventListener('keydown', onKey, true);
      if (opener && doc.contains(opener)) { try { opener.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
      opener = null;
      if (opts.onClose) opts.onClose();
    }

    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }

    function draw() {
      var s = steps[at];
      if (!s) return close();
      var ov = doc.getElementById('helpTour');
      if (!ov) {
        ov = doc.createElement('div');
        ov.id = 'helpTour'; ov.className = 'ht-ov';
        ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'htTitle');
        doc.body.appendChild(ov);
        doc.addEventListener('keydown', onKey, true);
      }
      var last = at === steps.length - 1;
      ov.innerHTML = '<div class="ht-card">'
        + '<div class="ht-step">Step ' + (at + 1) + ' of ' + steps.length + '</div>'
        + '<h2 class="ht-title" id="htTitle">' + esc(s.title) + '</h2>'
        + '<p class="ht-body">' + esc(s.body) + '</p>'
        + '<div class="ht-foot">'
        + (at > 0 ? '<button type="button" class="ht-quiet" data-ht="back">Back</button>' : '')
        + '<button type="button" class="ht-main" data-ht="next">' + (last ? 'Done' : 'Next') + '</button>'
        + '<button type="button" class="ht-quiet" data-ht="skip">Skip the tour</button>'
        + '<button type="button" class="ht-quiet" data-ht="never">Don\'t show again</button>'
        + '<span class="ht-dots" aria-hidden="true">' + steps.map(function (_, i) { return '<i class="' + (i === at ? 'on' : '') + '"></i>'; }).join('') + '</span>'
        + '</div><p class="ht-hint">' + esc(findAgain) + '</p></div>';
      ov.onclick = function (e) {
        var b = e.target.closest ? e.target.closest('[data-ht]') : null; if (!b) return;
        var a = b.getAttribute('data-ht');
        if (a === 'next') { at += 1; draw(); }
        else if (a === 'back') { at = Math.max(0, at - 1); draw(); }
        else if (a === 'skip') close();
        else if (a === 'never') { Promise.resolve(saveNever()).then(close, close); }
      };
      setTimeout(function () { spotlight(s); }, 30);
      var next = ov.querySelector('[data-ht="next"]');
      try { next.focus({ preventScroll: true }); } catch (e) { next.focus(); }
    }

    return {
      open: function (from) { if (!steps.length) return; at = 0; opener = from || doc.activeElement; draw(); },
      close: close,
      shouldAutoOpen: function () { return steps.length > 0 && !isNever() && mem.get('seen') !== '1'; },
      steps: steps,
    };
  }

  root.HelpTour = { create: create, _esc: esc };
})(typeof window !== 'undefined' ? window : globalThis);
