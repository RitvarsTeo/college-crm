// THE CIRCLE'S SHADOW ON HOME'S OTHER VISUALS (the owner, 02.10.2026). Depth belongs to the
// frame, never the mark (KB 08 P5): so every shadow is the same solid plinth for every mark, and
// it is offset only ACROSS the value axis. A shadow along the axis would make a bar look longer
// or a column taller than it counts.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const rule = (sel) => { const i = APP.indexOf(sel + '{'); assert.ok(i >= 0, sel); return APP.slice(i, APP.indexOf('}', i) + 1); };

test('horizontal bars: the shadow drops straight down, so the length is untouched', () => {
  assert.match(rule('  html.ui-c .kpage.kb .kbt i'), /box-shadow:0 3px 0 var\(--k-plinth\)/);
});
test('columns: the shadow steps sideways, so the height is untouched', () => {
  assert.match(rule('  html.ui-c .kpage.kb .kchart .kcol path'), /drop-shadow\(3px 0 0 var\(--k-plinth\)\)/);
});
test('lines: the shadow drops below, the same for every point', () => {
  assert.match(rule('  html.ui-c .kpage.kb .kchart .kline'), /drop-shadow\(0 3px 0 var\(--k-plinth\)\)/);
  assert.match(rule('  html.ui-c .kpage.kb .kspark path'), /drop-shadow\(0 2px 0 var\(--k-plinth\)\)/);
});
test('every Home shadow is the plinth colour with no blur, and Reports stays flat', () => {
  const block = APP.slice(APP.indexOf("THE CIRCLE'S SHADOW ON HOME"), APP.indexOf('kspark path{filter'));
  for (const m of block.matchAll(/(?:box-shadow|drop-shadow)[:(]\s*([^;)]*)/g)) {
    const parts = m[1].trim().split(/\s+/);
    assert.equal(parts[2], '0', 'no blur: ' + m[1]);
    assert.match(m[1], /var\(--k-plinth/, 'the frame colour, never a data colour');
  }
  assert.doesNotMatch(APP, /html\.ui-c \.kbt i\{[^}]*shadow/, 'the shared bar rule (Reports) has none');
});
