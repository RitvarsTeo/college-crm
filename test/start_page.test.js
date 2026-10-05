// THE APP OPENS ON HOME (the owner, 05.10.2026): an empty address rendered Today, V1's old start page.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const SIGN = fs.readFileSync(path.join(ROOT, 'src', 'signinfirst.js'), 'utf8');
const fn = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const line = (start) => { const i = APP.indexOf(start); assert.ok(i >= 0, start); return APP.slice(i, APP.indexOf('\n', i) + 1); };

test('an empty address routes to Home and lights Home in the menu', () => {
  const ctx = { UI: 'c', location: { hash: '' } };
  vm.runInNewContext(line('const START = ') + fn('function cPlace(') + '\nthis.start = START; this.place = cPlace;', ctx);
  const hash = ctx.location.hash || ctx.start();
  assert.equal(hash, '#/home');
  const [, page] = hash.split('/');
  assert.equal(ctx.place(page), 'home', 'the page is Home, so markCNav lights the Home item');
  assert.match(fn('async function route('), /const hash = location\.hash \|\| START\(\);/);
  assert.doesNotMatch(APP, /location\.hash \|\| '#\/today'/, 'nothing defaults to Today any more');
});
test('the hidden classic view keeps Today, it has no Home', () => {
  const ctx = { UI: 'classic' };
  vm.runInNewContext(line('const START = ') + '\nthis.start = START;', ctx);
  assert.equal(ctx.start(), '#/today');
});
test('feedback is filed against the page actually shown', () => {
  assert.match(APP, /const fbPath = \(\) => location\.hash \|\| START\(\);/);
});
test('the sign-in return never sends a plain open somewhere else', () => {
  assert.match(SIGN, /x!=='#\/home'/, 'Home is not remembered as a route to come back to');
  assert.match(SIGN, /return '\/';/, 'an ordinary sign-in lands on /, which is Home');
});
