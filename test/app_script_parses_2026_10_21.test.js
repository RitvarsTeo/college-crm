// Every inline script in src/app.html must parse (21.10.2026): a stray line comment once cut a one-line .then(...) in two
// and the whole page stayed on "Loading..."; the other tests read pieces of the page and did not notice.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');

test('every inline <script> in app.html parses', () => {
  const blocks = [...APP.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).filter((s) => s.trim());
  assert.ok(blocks.length >= 1, 'the page has its script');
  for (const [i, code] of blocks.entries()) {
    assert.doesNotThrow(() => new vm.Script(code, { filename: `app.html script ${i + 1}` }), `script ${i + 1} parses`);
  }
});
