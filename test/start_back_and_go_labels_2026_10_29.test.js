// THE START PAGE, "<- Start" AND THE GRAND OPENING LABELS (29.10.2026): the Academy tile always moves (the start page owns
// #/start), both Home pages carry "<- Start", What came back has no Can't tell part, and no label says "nothing says why".
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');

test('the start page owns #/start and a tile click always moves', () => {
  assert.match(app, /if \(hash !== '#\/start'\) history\.replaceState\(history\.state, '', location\.pathname \+ location\.search \+ '#\/start'\);/);
  assert.match(app, /onclick="if\(!event\.target\.closest\('a'\)\)cGo\(this\.dataset\.home\)"/);
});

test('both Home pages carry "<- Start" for an account with both halves', () => {
  const back = app.slice(app.indexOf('function cBackLink('), app.indexOf('function installCViewState('));
  assert.match(back, /\(path === '#\/home' \|\| path === '#\/tc'\) && cAreas\(\)\.length > 1/);
  assert.match(back, /<a href="#\/start"[^>]*>← Start<\/a>/);
  assert.match(back, /if \(!from \|\| view\.querySelector\('\.c-crumb a'\)\) return;/, 'one way back, never two');
});

test('What came back shows no Can\'t tell part; the five are "Not in the approved send list"', () => {
  assert.match(app, /const seg = F\.cameBack\.filter\(\(x\) => x\.id !== 'cant_tell' && x\.id !== 'scanner'\);/);
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'tc.json'), 'utf8'));
  const inv = JSON.stringify(cfg);
  assert.ok(!inv.includes('nothing says why'));
  assert.ok(inv.includes('"Not in the approved send list"'));
});
