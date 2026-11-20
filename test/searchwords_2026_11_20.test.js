// Find a person by the words you remember (20.11.2026): src/searchwords.js, and the page's copy of it (src/app.html cWordsHit).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wordsHit, wordsOf } from '../src/searchwords.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('every typed word, any order, any field; case and accents ignored', () => {
  const p = ['Francisco Javier Gustafsson', 'someone@example.com', '+371 2000 0000'];
  assert.ok(wordsHit('Francisco Gustafsson', p));
  assert.ok(wordsHit('  gustafsson   FRANCISCO ', p));
  assert.ok(wordsHit('gustafsson example', p), 'a word may sit in another field');
  assert.ok(!wordsHit('Francisco Smith', p), 'every word must be there');
  assert.ok(wordsHit('berzins', ['Jānis Bērziņš']), 'accents do not matter');
  assert.ok(wordsHit('Bērziņš', ['Janis Berzins']));
  assert.ok(wordsHit('', p) && wordsHit('   ', p), 'an empty search finds everyone');
  assert.deepEqual(wordsOf(' A  b '), ['a', 'b']);
  assert.ok(wordsHit('x', [null, undefined, 'x']));
});

test('the page uses the same rule in its search boxes, not the old whole-text match', () => {
  const html = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  assert.match(html, /function cWordsHit\(q, values\)/);
  assert.match(html, /if \(C_PQ\) all = all\.filter\(\(p\) => cWordsHit\(C_PQ, \[p\.name, p\.email, p\.phone\]\)\)/);
  assert.match(html, /\.filter\(\(p\) => cWordsHit\(q, \[p\.name, p\.email, p\.phone\]\)\)/);
  // the page's copy runs the same as the module on the same cases
  const src = html.slice(html.indexOf('function cWordsHit'), html.indexOf('function cMergeCandidates'));
  const cWordsHit = new Function(`${src}; return cWordsHit;`)();
  for (const [q, v] of [['Francisco Gustafsson', ['Francisco Javier Gustafsson']], ['berzins', ['Jānis Bērziņš']], ['Francisco Smith', ['Francisco Javier Gustafsson']], ['', ['x']]]) {
    assert.equal(cWordsHit(q, v), wordsHit(q, v), q);
  }
});
