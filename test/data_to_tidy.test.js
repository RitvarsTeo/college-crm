// 07.10.2026, the owner on the admin link "Data to tidy": "Fix the link". It opened the whole Journey; it now opens the
// Journey List filtered to "Programme not in the list", the same test its count uses, so the count on arrival is the figure.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');

test('Data to tidy opens the List filtered to the programmes not in the list', () => {
  const i = APP.indexOf('async function cHelpAdmin()');
  const fn = APP.slice(i, APP.indexOf('\n}\n', i));
  assert.match(fn, /href="#\/journey\?v=list&amp;p_data=odd"[^>]*>Data to tidy/);
  assert.match(fn, /people\.filter\(\(p\) => p\.programme && !known\.has\(p\.programme\)\)/, 'the count is the same test');
  assert.match(APP, /if \(f\.data === 'odd' && !\(p\.programme && !known\.has\(p\.programme\)\)\) return false;/, 'the filter is that test');
  assert.match(APP, /for \(const k of \['programme', 'due', 'owner', 'source', 'data', 'arrived', 'stage'\]\) C_PF\[k\] = g\('p_' \+ k\);/, 'the address sets it');
});
