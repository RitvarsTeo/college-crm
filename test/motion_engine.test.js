// THE MOTION ENGINE (demo/2026-10-07-motion-ab, MASTER CONTROL for the owner, Q65): src/assets/motion.js + motion.css,
// ?motion=a | b | off. These checks keep docs/MOTION_API.md's rules true in the code.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const APP = read('src', 'app.html'), JS = read('src', 'assets', 'motion.js'), CSS = read('src', 'assets', 'motion.css');
const SERVER = read('src', 'server.js');

test('ONE line loads the engine; the old inline ?motion=1 block is gone', () => {
  assert.equal((APP.match(/<script src="\/assets\/motion\.js" defer><\/script>/g) || []).length, 1);
  assert.doesNotMatch(APP, /MOTION DEMO \(\?motion=1\)/);
});
test('the server serves motion*.js|css (every lane\'s file) and nothing else by that rule', () => {
  const re = new RegExp(SERVER.match(/const mo = \/(.+)\/\.exec\(name\);/)[1]);
  for (const ok of ['motion.js', 'motion.css', 'motion-boards.js', 'motion-charts.css']) assert.ok(re.test(ok), ok);
  for (const no of ['motion.html', '../motion.js', 'motion-x/y.js', 'xmotion.js', 'motion-.js']) assert.ok(!re.test(no), no);
});
test('the switch: a | b | off, ?motion=1 = A, nothing chosen = today\'s app, kept in sessionStorage and in the address', () => {
  assert.match(JS, /if \(q === '1'\) q = 'a';/);
  assert.match(JS, /var M = window\.motion = \{ mode: chosen \|\| 'off' \};/);
  assert.match(JS, /sessionStorage\.setItem\(KEY, q\)/);
  assert.match(JS, /u\.searchParams\.set\('motion', M\.mode\)/);
  assert.match(JS, /if \(chosen === null\) return;/, 'no toggle unless a choice was made in this tab');
});
test('guards: nothing under reduced motion or in a hidden tab; a click, key or wheel finishes everything; capped', () => {
  assert.match(JS, /M\.live = function \(\) \{ return M\.mode !== 'off' && !reduced\(\) && !document\.hidden/);
  assert.match(JS, /\['pointerdown', 'keydown', 'wheel'\]\.forEach\(function \(t\) \{\s*addEventListener\(t, function \(ev\) \{ if \(ev\.isTrusted\) finishAll\(\); \}, true\);/);
  assert.match(JS, /var cap = function \(\) \{ return A\(\) \? 1200 : 1000; \};/);
  assert.match(JS, /setTimeout\(function \(\) \{ try \{ a\.finish\(\); \} catch \(e\) \{ \/\* gone \*\/ \} \}, cap\(\)\);/);
});
test('never on a reload or a redraw: only an arrival a click or key brought plays, never the same place again', () => {
  assert.match(JS, /var last = placeOf\(\);/, 'the place the app opened on, read when the engine installs');
  assert.match(JS, /if \(!g \|\| place === was \|\| !view\) \{ if \(held\) dropHeld\(\); return; \}/);
  assert.match(JS, /split\('\?'\)\[0\]\)\.split\('\/'\)\[1\]/, '#/journey?v=board is the Journey');
});
test("motion.run: a lane's custom animation on the engine's clock, nothing when motion is not live", () => {
  assert.match(JS, /M\.run = function \(el, frames, opts, pseudo\) \{ return M\.live\(\) \? run\(el, frames, opts, pseudo\) : null; \};/);
});
test('a data mark is uncovered, never scaled: rise is a clip from the baseline; the Journey bars rise, B fades them', () => {
  const rise = JS.match(/if \(kind === 'rise'\) \{([\s\S]*?)\}/)[1];
  assert.match(rise, /clipPath: 'inset\(100% -60px 0 -60px\)'/);
  assert.doesNotMatch(rise, /transform|scale/);
  assert.match(JS, /M\.stagger\(bars, \{ kind: 'rise', delay: 260 \+ after, step: 50 \}\);/, 'after the old page has left');
  assert.match(JS, /M\.stagger\(bars, \{ kind: 'fade', delay: 80, step: 30 \}\);/);
});
test('B has no flight and no held page: a settle at the target; the held page is A only', () => {
  assert.match(JS, /if \(!A\(\)\) \{\s*var b = run\(to, \[\{ opacity: 0\.35, transform: 'translateY\(4px\)' \}/);
  assert.match(JS, /if \(!view \|\| !A\(\) \|\| !M\.live\(\)\) return;/);
  assert.match(JS, /addEventListener\('hashchange', function \(\) \{ if \(M\.live\(\) && A\(\)\) M\.hold\(\); \}, true\);/);
});
test('the Inbox flight only after the save worked', () => {
  assert.match(JS, /await qualify\.apply\(this, arguments\);\s*var err = document\.getElementById\('qErr'\);\s*if \(err && err\.innerHTML\.trim\(\)\) return;/);
});
test('colours: blue for rings and pills, signal amber only for the changed mark, never the data mustard', () => {
  assert.doesNotMatch(JS + CSS, /#E0A526|224,\s*165,\s*38/i);
  assert.match(CSS, /\.mo-mark\.mo-mark-b\{background-image:linear-gradient\(#F7C04F,#F7C04F\)/);
  assert.match(CSS, /html\.mo-a \.m-bumped,html\.mo-b \.m-bumped\{animation:none !important\}/, 'the mark replaces the shake');
});
test('the held copy of the old page never replays its own opening and never covers the menu', () => {
  assert.match(CSS, /\.mo-held \*\{animation:none !important;transition:none !important\}/);
  assert.match(JS, /var c = old\.wrap\.firstChild;/, 'the content moves, its clip box stays');
});
// The owner on 896fe62 (07.10.2026): "there is small moment where both titles are at the same on and it seems laggy".
test('one page at a time: the next page is drawn unseen, the old one leaves first and fast, then the new one comes in', () => {
  assert.match(JS, /view\.style\.opacity = '0';\s*\/\/ the next page is drawn here unseen/);
  assert.match(JS, /anims\.push\(leave\(old, 110, -10 \* s\)\);\s*anims\.push\(run\(view, \[\{ opacity: 0, transform: 'translate3d\(' \+ 24 \* s \+ 'px,0,0\)' \}, \{ opacity: 1, transform: 'none' \}\], \{ duration: 300, delay: old \? 110 : 0, easing: OUT \}\)\);/,
    'push: out in 110 ms, in after it, 410 ms in all');
  assert.match(JS, /anims\.push\(leave\(old, 90, 0\)\);\s*anims\.push\(run\(view, \[\{ clipPath: start \}, \{ clipPath: 'inset\(0px 0px 0px 0px round 0px\)' \}\], \{ duration: 360, delay: 60, easing: OUT \}\)\);/,
    'deeper: the old page is gone in 90 ms, the iris 60-420 ms');
  assert.match(JS, /function dropHeld\(\) \{ if \(held\) \{ held\.wrap\.remove\(\); if \(held\.view\) held\.view\.style\.opacity = ''; held = null; \} \}/, 'a dropped copy never leaves the page hidden');
});
test('the demo build stamp: only with MOTION_BUILD=git, every motion script versioned, nothing kept in the browser', () => {
  assert.match(SERVER, /if \(process\.env\.MOTION_BUILD !== 'git'\) return null;/, 'off unless the demo server asks for it');
  assert.ok(SERVER.includes('if (build) page = page.replace('), 'every motion script address carries the build');
  assert.ok(SERVER.includes('`$1?v=${build}"`'), 'the build goes on as ?v=');
  assert.match(SERVER, /'cache-control': process\.env\.MOTION_BUILD \? 'no-store' : 'public, max-age=3600'/);
  assert.match(read('scripts', 'motion_demo_server.mjs'), /MOTION_BUILD: 'git'/);
  assert.match(JS, /M\.build = bm \? bm\[1\] : '';/);
  assert.match(JS, /l\.href = href \+ \(M\.build \?/, 'the stylesheets the engine loads carry the build too');
  assert.match(JS, /<small class="mo-build"/, 'the toggle shows the build');
});
