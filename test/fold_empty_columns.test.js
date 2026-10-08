// FOLDING EMPTY COLUMNS (the owner, 08.10.2026: "i think all three tabs can in some way value from folding"; shown on
// the real Inbox at 1440, "Build it"). On a wide screen a column with nobody in it folds to the strip Coming up already
// uses: number, name, count; a click opens it. The phone keeps its own rows (Q68). A column the board was narrowed to
// never folds. On the Journey the strip stays a drop target; Admitted and Not proceeding never fold.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const HELP = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'help.json'), 'utf8'));
const FOLD = APP.slice(APP.indexOf('const C_UNFOLD = '), APP.indexOf('let C_TP = '));

const run = (phone) => {
  const drawn = [];
  const ctx = { esc: (s) => String(s ?? '').replace(/"/g, '&quot;'), cPhone: () => phone,
    cInboxPool: () => drawn.push('inbox'), cTodayPool: () => drawn.push('due'), cDrawJourney: () => drawn.push('journey') };
  vm.runInNewContext(FOLD + '\nthis.fold = cFoldEmpty; this.unfold = cUnfold; this.strip = cFoldStrip;', ctx);
  return { ...ctx, drawn };
};

test('an empty column folds on a wide screen only, and a click opens it and redraws that board', () => {
  const W = run(false);
  assert.equal(W.fold('due', 'today', 0), true);
  assert.equal(W.fold('due', 'today', 2), false, 'a column with people never folds');
  W.unfold('due', 'today');
  assert.equal(W.fold('due', 'today', 0), false, 'opened, it stays open');
  assert.equal(W.fold('inbox', 'today', 0), true, 'per board');
  assert.deepEqual(W.drawn, ['due']);
  assert.equal(run(true).fold('due', 'today', 0), false, 'the phone keeps its own rows');
});

test('the strip: number, name and count; a click opens it, with the handler built the safe way', () => {
  const html = run(false).strip('journey', 'Follow-up', 3, 'Follow-up', 0, ' data-stage="Follow-up"');
  assert.match(html, /^<div class="c-col t-fold c-fold-empty c-drop" data-stage="Follow-up" role="button" tabindex="0"/);
  assert.match(html, /onclick="cUnfold\(&quot;journey&quot;, &quot;Follow-up&quot;\)"/);
  assert.match(html, /<span class="c-jn">3<\/span><span class="t-foldl">Follow-up<\/span><b>0<\/b><\/div>$/);
});

test('each board uses it: Due and the Inbox not when narrowed, the Journey never for an end column', () => {
  assert.match(APP, /const emptyFold = \(g\) => !folded\(g\) && !C_TP\.col && cFoldEmpty\('due', g\.id, g\.rows\.length\);/);
  assert.match(APP, /const emptyFold = \(c\) => !openId && !C_IP\.col && cFoldEmpty\('inbox', c\.id, c\.n\);/);
  assert.match(APP, /const jFold = \(s\) => !phone && !C_TERMINAL\.includes\(s\.id\) && cFoldEmpty\('journey', s\.id,/);
  assert.match(APP, /if \(jFold\(s\)\) return cFoldStrip\('journey', s\.id, i \+ 1, s\.label \|\| s\.id, 0, ` data-stage="\$\{esc\(s\.id\)\}"`\);/, 'a drop target');
});

test('the strip is a box, so on hover it comes forward; no outline', () => {
  assert.match(APP, /html\.ui-c \.t-fold:hover\{transform:translateY\(-2px\);box-shadow:var\(--sel-hover\)\}/);
  assert.doesNotMatch(APP, /\.t-fold:hover\{outline/);
});

test('the Help center says it in the same change', () => {
  for (const t of ['Inbox', 'Due', 'Journey']) {
    assert.match(HELP.tour.find((x) => x.title === t).body, /An empty column folds to a thin strip; click it to open it\./, t);
  }
});
