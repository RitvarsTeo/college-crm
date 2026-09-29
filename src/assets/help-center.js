// THE HELP CENTER'S QUESTIONS. Part 3 (Help and feedback).
//
// The owner, 29.09.2026: the Help center "must carry inside Tour and the most frequently (have to
// figure this part out on the go) Q&A about the functions." So:
//   - the questions come from ONE list the app keeps (help/help.example.json shows the shape);
//   - a search box filters them as you type (accents ignored: "atskaite" finds "atskaitē");
//   - the MOST OPENED come first - counted on the server for everybody (routes helpOpened /
//     helpCounts), not guessed. Ties keep the order the list was written in;
//   - "Didn't find it? Ask a question" opens the SAME feedback box, on "A question", with what was
//     typed in the search already in it. The readers see which questions keep coming in the inbox
//     and add the answers to the list. That is the "figure it out on the go".
//
//   HelpCenter.mount(document.getElementById('helpFaq'), {
//     faq: [{ id: 'how-do-i-sign-in', q: '...', a: '...' }, ...],
//     onAsk: function (text) { feedback.open('QUESTION', text); },
//   });
//
// Options: faq (required), countsUrl ('/api/help/counts'), openedUrl ('/api/help/opened'), fetch,
// onAsk. Answers are plain text; nothing from the list is ever put in the page as HTML.
(function (root) {
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var fold = function (s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); };
  var ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  /** Most opened first; ties keep the list's own order. Pure, so it can be tested. */
  function order(faq, counts) {
    counts = counts || {};
    return faq.map(function (f, i) { return { f: f, i: i, n: Number(counts[f.id]) || 0 }; })
      .sort(function (a, b) { return (b.n - a.n) || (a.i - b.i); })
      .map(function (x) { return x.f; });
  }
  /** Does this question match what was typed? Every word must appear in the question or answer. */
  function matches(f, query) {
    var words = fold(query).split(/\s+/).filter(Boolean);
    var hay = fold(f.q + ' ' + f.a);
    return words.every(function (w) { return hay.indexOf(w) >= 0; });
  }

  function mount(el, opts) {
    opts = opts || {};
    var faq = (opts.faq || []).filter(function (f) { return f && ID.test(String(f.id)) && f.q && f.a; });
    var f = opts.fetch || (root.fetch ? root.fetch.bind(root) : null);
    var counts = {}, query = '', opened = {};

    function draw() {
      var list = order(faq, counts).filter(function (x) { return matches(x, query); });
      var body = el.querySelector('.hc-list');
      body.innerHTML = list.length
        ? list.map(function (x) {
            return '<details class="help-faq" data-id="' + esc(x.id) + '"><summary>' + esc(x.q) + '</summary><div>' + esc(x.a) + '</div></details>';
          }).join('')
        : '<p class="hc-none">No answer for that yet.</p>';
    }

    el.innerHTML = '<label class="hc-search"><span>Search the questions</span>'
      + '<input type="search" autocomplete="off" placeholder="For example: sign in, report, dark mode"></label>'
      + '<div class="hc-list kit-panel"></div>'
      + '<p class="hc-ask">Didn\'t find it? <button type="button" class="hc-ask-btn">Ask a question</button></p>';
    var input = el.querySelector('input');
    input.addEventListener('input', function () { query = input.value; draw(); });
    el.querySelector('.hc-ask-btn').addEventListener('click', function () { if (opts.onAsk) opts.onAsk(query.trim()); });
    // Count an OPEN once per question per page view: reopening the same answer is not a new question.
    el.addEventListener('toggle', function (e) {
      var d = e.target; if (!d.open || !d.getAttribute) return;
      var id = d.getAttribute('data-id'); if (!id || opened[id]) return;
      opened[id] = true;
      if (f) f(opts.openedUrl || '/api/help/opened', { method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: id }) }).catch(function () {});
    }, true);
    draw();
    if (f) {
      f(opts.countsUrl || '/api/help/counts', { credentials: 'same-origin' })
        .then(function (r) { return r.ok ? r.json() : { counts: {} }; })
        .then(function (b) { counts = (b && b.counts) || {}; draw(); }, function () { /* the list still shows, in its own order */ });
    }
    return { refresh: draw };
  }

  root.HelpCenter = { mount: mount, _order: order, _matches: matches, _esc: esc };
})(typeof window !== 'undefined' ? window : globalThis);
