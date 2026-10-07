// THE BOARD MOMENTS (motion/2026-10-07-boards, MAIN for MASTER CONTROL and the owner, Q65): src/assets/motion-boards.js
// + motion-boards.css on top of the engine (src/assets/motion.js, docs/MOTION_API.md). The file WRAPS the app's
// functions and never edits the app; these checks keep that, and the engine's rules, true in the code.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const APP = read('src', 'app.html'), JS = read('src', 'assets', 'motion-boards.js'), CSS = read('src', 'assets', 'motion-boards.css');
const SERVER = read('src', 'server.js');

test('ONE line loads the boards file, after the help scripts; nothing local-only is left in the app or the server', () => {
  assert.equal((APP.match(/<script src="\/assets\/motion-boards\.js" defer><\/script>/g) || []).length, 1);
  assert.ok(APP.indexOf('/assets/help-center.js') < APP.indexOf('/assets/motion-boards.js'), 'after the help scripts');
  assert.doesNotMatch(APP + SERVER, /TEMP-LOCAL-ONLY/);
});
test('without the engine the file does nothing; with motion off the app is untouched; the CSS comes with the file', () => {
  assert.match(JS, /var M = window\.motion;\s*if \(!M \|\| typeof M\.live !== 'function'\) return;/);
  assert.match(JS, /if \(M\.mode === 'off'\) return;/);
  assert.match(JS, /M\.css\('\/assets\/motion-boards\.css'\);/);
});
test("the engine's clock: capped A 1.2 s / B 1 s, any click, key or wheel finishes everything, live() gates every run", () => {
  assert.match(JS, /var cap = function \(\) \{ return A\(\) \? 1200 : 1000; \};/);
  assert.match(JS, /setTimeout\(function \(\) \{ try \{ a\.finish\(\); \} catch \(e\) \{ \/\* gone \*\/ \} \}, cap\(\)\);/);
  assert.match(JS, /\['pointerdown', 'keydown', 'wheel'\]\.forEach\(function \(t\) \{ addEventListener\(t, finishAll, \{ capture: true, passive: true \}\); \}\);/);
  assert.match(JS, /if \(!el \|\| !el\.animate \|\| !M\.live\(\)\) return null;/);
});
test('it wraps the app\'s own functions, each still there under that name; it never writes the app\'s markup', () => {
  const wrapped = ['cAskMoveNote', 'viewJourneyC', 'cTodayMoveTo', 'cTodayPool', 'doArchive', 'viewHelpC'];
  for (const f of wrapped) {
    assert.match(JS, new RegExp(`if \\(typeof ${f} === 'function'`), `${f} is checked before it is wrapped`);
    assert.match(JS, new RegExp(`\\n\\s+${f} = (async )?function \\(`), `${f} is wrapped`);
    assert.match(APP, new RegExp(`(async )?function ${f}\\(`), `${f} exists in the app`);
  }
  for (const f of ['cMoveDir', 'cTodayIso']) assert.match(APP, new RegExp(`function ${f}\\(|const ${f} = `), `${f}, read by the wraps, exists`);
  assert.doesNotMatch(JS, /innerHTML\s*=[^=]/, 'no markup written');
});
test('the marks the wraps read are in the app\'s markup (a rename here breaks a moment, not the app)', () => {
  for (const mark of ['class="c-drop" data-stage=', 'class="c-jexp" data-id=', 'draggable="true" data-id=', 'draggable="true" data-pid=',
    "class=\"c-col t-col t-fold${g.id === 'later' ? ' c-drop t-drop' : ''}\" data-col=\"${g.id}\"", 'class="t-foldx"', 'class="c-drop t-drop" data-col=', 'ib-card', 'class="ib-aside"',
    'id="arErr"', 'class="hf-step', 'class="hf-ico"', 'class="hf-node"', 'class="hf-chips"']) assert.ok(APP.includes(mark), mark);
});
test('1. the Journey: lift, room, the copy travels into the column BEFORE the note dialog, a cancel brings it home', () => {
  assert.match(CSS, /\.c-jp\.mo-lift\{/); assert.match(CSS, /\.c-drop\.mo-room\{/);
  assert.ok(JS.indexOf('await travel(ghost, col, { dx: dir') < JS.indexOf('ask = await askMove.apply(this, arguments)'), 'travel first, then the dialog');
  assert.match(JS, /var dir = cMoveDir\(from, to\);/, 'forward leans right, back leans left, by the app\'s own direction');
  assert.match(JS, /if \(!ask\) \{[\s\S]*?await travel\(ghost, home, \{ dx: 0, exact: true \}\);[\s\S]*?drop\(ghost\);\s*var dimmed = Boolean\(dim\); back\(\);/);
  assert.match(JS, /dim = run\(d\.card, \[\{ opacity: 1 \}, \{ opacity: 0\.35 \}\]/, 'B: no travel, the card dims where it is and the column settles');
  assert.match(JS, /#view \.c-jp' \+ sel \+ ', #view \.c-jexp' \+ sel/, 'after a move the app opens the moved person: the card comes back expanded');
  assert.match(JS, /drop\(flying\); flying = ghost;/, 'one copy in the air');
});
test('2. Today: into Due today the copy travels, into a folded Coming up it shrinks and the count bumps; unfolding is a drawer', () => {
  assert.match(JS, /var folded = Boolean\(target && target\.classList\.contains\('t-fold'\)\);/);
  assert.match(JS, /await travel\(ghost, target, \{ dx: 0, shrink: folded \}\);/);
  assert.match(JS, /if \(n\) \{ M\.count\(n\); M\.ping\(n\); \}/);
  // Q68: on a phone every column can fold, so the count and the witness name Coming up itself
  assert.match(JS, /document\.querySelector\('#view \.t-fold\[data-col="later"\] b'\)/);
  assert.match(JS, /var wasFolded = Boolean\(document\.querySelector\('#view \.t-fold\[data-col="later"\]'\)\);/, 'the page is the witness, not C_TP (the click sets it first)');
  assert.match(JS, /clipPath: 'inset\(0 100% 0 0\)'/);
});
test('3. the Inbox: Set aside slides the copy out only after the save worked; Make a lead stays the engine\'s moment', () => {
  assert.match(JS, /var err = document\.getElementById\('arErr'\);\s*if \(err && err\.innerHTML\.trim\(\)\) return r;/);
  assert.match(JS, /translateX\(-28px\) scale\(\.98\)/);
  assert.doesNotMatch(JS, /\n\s+doQualify = /, 'the flight to the Journey is the engine\'s: no second wrap');
});
test('4. Help: the story plays once, on an arrival by a click; the line draws, the stops pop, the labels rise', () => {
  assert.match(JS, /if \(!byClick\(\) \|\| !M\.live\(\)\) return r;/);
  assert.match(JS, /M\.drawBaseline\(steps, \{ pseudo: '::before' \}\);/);
  assert.match(JS, /M\.stagger\(document\.querySelectorAll\('#view \.hf-ico'\), \{ kind: 'pop'/);
});
test('a copy is never the app\'s card; colours: blue only, never amber or the data mustard; no data mark is scaled', () => {
  assert.match(JS, /g\.removeAttribute\('data-id'\); g\.removeAttribute\('data-pid'\);/);
  assert.match(JS, /g\.classList\.add\('mo-ghost', 'mo-ghost-card'\);/, 'the engine\'s fixed copy');
  assert.doesNotMatch(JS + CSS, /#E0A526|#F7C04F|224,\s*165,\s*38/i);
  assert.match(CSS, /41,168,223/, 'Novikontas blue');
  assert.doesNotMatch(JS, /\.c-jbar|\.k-bar|\.m-bar|svg rect/, 'no data mark is touched here');
});
