// THE DEMO LIST (his picks 24.11.2026: "the demo with a mockup profile, mockup list, but for reals ...", "Same screen, demo data";
// "Are you sure?" before Pass on and Waiver). #/tc/mylist/demo is the real page with an invented owner and list: every change stays
// in the browser tab, nothing reaches the server.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fn = (head) => { const at = APP.indexOf(head); assert.ok(at >= 0, head); return APP.slice(at, APP.indexOf('\n}\n', at) + 2); };

test('the route and the fixture: invented people on example.com only, the real page draws it', () => {
  assert.match(APP, /else if \(place === 'mylist' && arg === 'demo'\) viewTcMyListDemo\(\);/);
  const base = fn('function tcMlDemoBase(');
  const mails = [...base.matchAll(/'([^'\s]+@[^'\s]+)'/g)].map((m) => m[1]);
  assert.ok(mails.length >= 10 && mails.every((m) => m.endsWith('@example.com')), 'only example.com addresses');
  assert.match(fn('function viewTcMyListDemo('), /T_ML = \{ demo: true,[\s\S]*tcMlDraw\(\);/);
});

test('in the demo nothing goes to the server: save, draft, keep, email, pass, accept, waiver, take, leave', () => {
  assert.match(fn('async function tcMlSave('), /if \(T_ML\.demo\) \{ T_ML\.saved = mlClone\(T_ML\.W\);[^\n]*return true; \}\n  T_ML\.seq\+\+;/);
  assert.match(fn('function tcMlKeep('), /if \(!T_ML \|\| T_ML\.demo\) return;/);
  assert.match(fn('async function tcMlAutosave('), /T_ML\.demo \|\|/);
  assert.match(fn('function tcMlAutosaveNow('), /T_ML\.demo \|\|/);
  assert.match(fn('function tcMlMayLeave('), /T_ML\.demo \|\|/);
  for (const head of ['async function tcMlAddEmail(', 'async function tcWvPut(', 'async function tcWvTake(', 'async function tcPoPass(', 'async function tcPoAccept(']) {
    const src = fn(head), demoAt = src.indexOf('T_ML.demo'), postAt = src.indexOf('post(');
    assert.ok(demoAt > 0 && demoAt < postAt, head + ': the demo branch returns before any post');
  }
  assert.match(fn('async function tcMlReload('), /if \(T_ML && T_ML\.demo\) \{ tcMlDraw\(\); return; \}/);
  assert.match(APP, /T_ML\.filter === 'postcard' && !T_ML\.demo \?/, 'no real postcard export from the demo');
});

test('Are you sure? before Pass on and before Waiver, on every list', () => {
  assert.match(APP, /onclick="tcPoAsk\(\$\{Number\(p\.id\)\}\)">Pass on<\/button>/);
  assert.match(APP, /onclick="tcWvAsk\(\$\{Number\(p\.id\)\}\)">Waiver<\/button>/);
  assert.match(fn('function tcPoAsk('), /modal\('Pass on\?'[\s\S]*closeModal\(\);tcPoPass\(/);
  assert.match(fn('function tcWvAsk('), /modal\('Put on the shared list\?'[\s\S]*closeModal\(\);tcWvPut\(/);
  assert.doesNotMatch(APP, /onclick="tcPoPass\(\$\{Number\(p\.id\)\}\)"/, 'no Pass on without the question');
});
