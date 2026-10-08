// CHOSEN AND HOVER, ONE LOOK ON EVERY TAB (the owner, 08.10.2026, directly in the MAIN session):
// "All tabs must match similarly." / the Reports box, "make the box more bold, so it stands out" / "When hover over it
// to choose, it comes forward. when clicked on, it pops even a bit more, than returns to the position 2, slightly out
// and the blue frame is a like a 3d frame, that gives it depth." / "For graphs (all types) they also should sort of come
// out and pop when clicked." Depth belongs to the frame, never to the mark (KB 08 P5): bars never leave their baseline.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const BLOCK = APP.slice(APP.indexOf('/* CHOSEN AND HOVER, ONE LOOK ON EVERY TAB'), APP.indexOf('</style>', APP.indexOf('/* CHOSEN AND HOVER')));
const CHOSEN = ':is(.pcards .p-card.on,.kstrip.rp-tabs > div[aria-selected="true"])';
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('one chosen look on Due, Reports and the Journey and Inbox columns: the same bold 3D frame', () => {
  assert.match(BLOCK, new RegExp(esc(':is(.pcards .p-card.on,.kstrip.rp-tabs > div[aria-selected="true"],.jb-col.on)::before{') + '[^}]*padding:3px;[^}]*linear-gradient\\(180deg,var\\(--sel-1\\) 0%,var\\(--sel-2\\) 45%,var\\(--sel-3\\) 100%\\)'),
    'a 3px ring, light at the top, deep at the bottom');
  assert.match(BLOCK, /--sel-1:#8fd3f2;--sel-2:#29a8df;--sel-3:#146f9c;/, 'the logo blue in the middle');
  assert.match(BLOCK, /html\.ui-c #view \.pcards \.p-card\.on::after\{display:none\}/, 'Due\'s old yellow line is gone');
  assert.match(BLOCK, /html\.ui-c #view \.kstrip\.rp-tabs > div\[aria-selected="true"\]\{outline:0\}/, 'Reports\' thin outline gives way to the frame');
  assert.match(BLOCK, /\.pcards \.p-card\.on\{position:relative;padding:8px 14px 10px;border:0;border-radius:12px\}/, 'every chosen card has its own round plate');
});

test('hover comes forward 2px, a press 6px, and the chosen one settles back to 3px from the pop', () => {
  assert.match(BLOCK, /:not\(\.on\):not\(\[aria-selected="true"\]\):hover\{transform:translateY\(-2px\);box-shadow:var\(--sel-hover\)\}/);
  assert.match(BLOCK, /:active\{transform:translateY\(-6px\);box-shadow:var\(--sel-lift\)\}/);
  assert.match(BLOCK, new RegExp(esc(CHOSEN) + '\\{transform:translateY\\(-3px\\);box-shadow:var\\(--sel-lift\\);[^}]*animation:c-sel-settle'));
  assert.match(BLOCK, /@keyframes c-sel-settle\{0%\{transform:translateY\(-6px\) scale\(1\.015\)\}100%\{transform:translateY\(-3px\)\}\}/);
  assert.match(BLOCK, /prefers-reduced-motion:reduce/, 'reduced motion: no movement, the frame stays');
});

test('people cards, Home cards and every chart mark respond too', () => {
  assert.match(BLOCK, /:is\(\.c-jp,\.ib-card\):hover\{transform:translateY\(-2px\)/);
  assert.match(BLOCK, /:is\(\.kneed:not\(\.p-card\),a\.kgo,\.khero\):hover\{transform:translateY\(-2px\)\}/);
  assert.match(BLOCK, /:is\(\.kcol,\.kseg,\.rp-col,\.rp-split,\.ktgt-track\):hover\{filter:brightness\(1\.07\) drop-shadow/);
  assert.match(BLOCK, /:is\(\.kcol,\.kseg,\.rp-col,\.rp-split,\.ktgt-track\):active\{filter:brightness\(1\.12\) drop-shadow/);
});

test('depth belongs to the frame: no column or chart mark ever moves off its baseline', () => {
  for (const mark of ['jb-col', 'kcol', 'kseg', 'rp-col', 'rp-split', 'ktgt-track', 'jb-seg', 'kbar']) {
    const rules = [...BLOCK.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(([, sel]) => new RegExp('\\.' + mark + '\\b').test(sel) && !/prefers-reduced/.test(sel));
    for (const [, sel, body] of rules) assert.doesNotMatch(body, /transform:translate|scale\(/, `${mark}: ${sel.trim()}`);
  }
});

test('dark mode has its own shadows, inside the one dark palette', () => {
  assert.match(APP, /--sel-lift:0 10px 24px rgba\(0,0,0,\.45\),0 2px 6px rgba\(0,0,0,\.30\);--sel-hover:0 6px 14px rgba\(0,0,0,\.35\)\}/);
});

// "i dont like hovering frame where there is no box" (08.10.2026): a band column and a bar row get no plate on hover
test('no hover plate where there is no box: a column or bar row only lights its bar', () => {
  assert.doesNotMatch(BLOCK, /\.jb-col:not\(\.on\):hover\{/, 'no plate on the column');
  assert.doesNotMatch(BLOCK, /\.kbar:hover\{/, 'no plate on the row');
  assert.match(BLOCK, /\.jb-col:not\(\.on\):hover \.jb-bar\{filter:brightness\(1\.07\) drop-shadow/);
  assert.match(BLOCK, /\.kbar:hover \.kbt\{filter:brightness\(1\.07\) drop-shadow/);
});
