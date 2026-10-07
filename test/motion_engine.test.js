// INTAKE MOTION (Q65): the owner picked A everywhere, 07.10.2026 (page moves, board actions, charts, the small signals:
// "A, yes, lock in"). src/assets/motion.js + motion.css, always on. These checks keep docs/MOTION_API.md's rules true.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const APP = read('src', 'app.html'), JS = read('src', 'assets', 'motion.js'), CSS = read('src', 'assets', 'motion.css');
const SERVER = read('src', 'server.js');

test('the page loads the engine, then the charts, then the boards, once each', () => {
  const lines = APP.match(/<script src="\/assets\/motion[a-z-]*\.js" defer><\/script>/g) || [];
  assert.deepEqual(lines, ['<script src="/assets/motion.js" defer></script>', '<script src="/assets/motion-charts.js" defer></script>',
    '<script src="/assets/motion-boards.js" defer></script>']);
  assert.ok(APP.indexOf('/assets/motion.js') > APP.indexOf('/assets/help-center.js'), 'after the app\'s own scripts are declared');
});
test('the server serves motion*.js|css and nothing else by that rule, never kept stale', () => {
  const m = SERVER.match(/const mo = \/(.+)\/\.exec\(name\);/);
  assert.ok(m, 'the motion route');
  const re = new RegExp(m[1]);
  for (const ok of ['motion.js', 'motion.css', 'motion-boards.js', 'motion-charts.css']) assert.ok(re.test(ok), ok);
  for (const no of ['motion.html', '../motion.js', 'motion-x/y.js', 'xmotion.js', 'motion-.js']) assert.ok(!re.test(no), no);
  assert.ok(SERVER.includes("'cache-control': 'no-cache' });\n        return res.end(fs.readFileSync(path.join(ROOT, 'src', 'assets', name)));"));
  assert.ok(!SERVER.includes('MOTION_BUILD'), 'no demo build stamp');
});
test('A only, always on: no switch, no toggle, no stamp, nothing demo-only', () => {
  assert.ok(JS.includes("var M = window.motion = { mode: 'a' };"));
  for (const demo of ['URLSearchParams', 'sessionStorage', 'moToggle', '?motion', 'M.build', 'setMode', 'mo-mark-b']) {
    assert.ok(!JS.includes(demo), 'motion.js has no ' + demo);
  }
  for (const demo of ['#moToggle', 'mo-build', 'html.mo-b', 'mo-mark-b']) assert.ok(!CSS.includes(demo), 'motion.css has no ' + demo);
  assert.ok(!/\bA\(\)/.test(JS), 'no A/B branch is left in the engine');
});
test('nothing moves under reduced motion or in a hidden tab; a click, key or wheel finishes everything; capped at 1.2 s', () => {
  assert.ok(JS.includes("M.live = function () { return !reduced() && !document.hidden && typeof Element.prototype.animate === 'function'; };"));
  assert.match(JS, /\['pointerdown', 'keydown', 'wheel'\]\.forEach\(function \(t\) \{\s*addEventListener\(t, function \(ev\) \{ if \(ev\.isTrusted\) finishAll\(\); \}, true\);/);
  assert.ok(JS.includes('var cap = function () { return 1200; };'));
  assert.ok(JS.includes("setTimeout(function () { try { a.finish(); } catch (e) { /* gone */ } }, cap());"));
  assert.ok(JS.includes('M.run = function (el, frames, opts, pseudo) { return M.live() ? run(el, frames, opts, pseudo) : null; };'));
});
test('never on a reload or a redraw: only an arrival a click or key brought plays', () => {
  assert.ok(JS.includes('var last = placeOf();'));
  assert.ok(JS.includes("if (!g || place === was || !view) { if (held) dropHeld(); return; }"));
  assert.ok(JS.includes(".split('?')[0]).split('/')[1]"), '#/due?... is the Due place');
});
test('one page at a time: the next page is drawn unseen, the old one leaves first (110 ms), then the new one (300 ms)', () => {
  assert.match(JS, /view\.style\.opacity = '0';\s*\/\/ the next page is drawn here unseen/);
  assert.ok(JS.includes("anims.push(leave(old, 110, -10 * s));"));
  assert.ok(JS.includes("{ duration: 300, delay: old ? 110 : 0, easing: OUT }"));
  assert.ok(JS.includes("anims.push(leave(old, 90, 0));"), 'deeper: out in 90 ms, then the iris');
  assert.ok(JS.includes("function dropHeld() { if (held) { held.wrap.remove(); if (held.view) held.view.style.opacity = ''; held = null; } }"));
});
test('the leaving page looks exactly as it did: the copy keeps id="view", loses the ids inside, takes no input', () => {
  assert.ok(!JS.includes("c.removeAttribute('id')"), 'the root keeps id="view" (56 rules are #view ...)');
  assert.ok(JS.includes("c.querySelectorAll('[id]').forEach(function (n) { n.removeAttribute('id'); });"));
  assert.ok(JS.includes("wrap.setAttribute('inert', '');"));
  assert.ok(CSS.includes('.mo-held *{animation:none !important;transition:none !important}'));
});
test('a data mark is uncovered, never scaled: rise is a clip from the baseline', () => {
  const rise = JS.match(/if \(kind === 'rise'\) \{([\s\S]*?)\}/)[1];
  assert.ok(rise.includes("clipPath: 'inset(100% -60px 0 -60px)'"));
  assert.ok(!/transform|scale/.test(rise));
  assert.ok(JS.includes("M.stagger(bars, { kind: 'rise', delay: 260 + after, step: 50 });"));
});
test('the phone: the bottom bar counts as the menu, the flight lands on the Journey link that can be seen, its counts ring', () => {
  assert.ok(JS.includes("inNav: Boolean(el.closest('.cnav, nav, .ctabs'))"));
  assert.ok(JS.includes(`document.querySelectorAll('.cnav a[href="#/journey"], .ctabs a[href="#/journey"]')`));
  assert.ok(JS.includes("document.querySelectorAll('.cnav .n[id], .ctabs .n[id]')"));
  assert.ok(APP.includes("tab('#/journey', 'people', C_ICON.journey, 'Journey', 'ctJourney')"), 'the bar the engine reads');
});
test('the Inbox flight only after the save worked', () => {
  assert.match(JS, /await qualify\.apply\(this, arguments\);\s*var err = document\.getElementById\('qErr'\);\s*if \(err && err\.innerHTML\.trim\(\)\) return;/);
});
test('every app function the motion files wrap still exists', () => {
  const files = JS + read('src', 'assets', 'motion-charts.js') + read('src', 'assets', 'motion-boards.js');
  const names = [...new Set([...files.matchAll(/typeof ([A-Za-z_]\w*) [!=]== 'function'/g)].map((m) => m[1]))];
  assert.ok(names.length >= 10, 'found the wrapped names: ' + names.join(', '));
  for (const n of names) assert.match(APP, new RegExp(String.raw`(function|const|let|var)\s+${n}\b`), n + ' exists in app.html');
});
test('colours: blue for rings and pills, signal amber only for the changed mark, never the data mustard', () => {
  assert.ok(!/#E0A526|224,\s*165,\s*38/i.test(JS + CSS));
  assert.ok(CSS.includes('html.mo-a .m-bumped{animation:none !important}'), 'the mark replaces the shake');
});
