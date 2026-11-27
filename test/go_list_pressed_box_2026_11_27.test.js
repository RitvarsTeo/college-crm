// HIS PICK 27.11.2026 "A + coloured edge" (My Grand Opening list): the pressed number box is light blue with a blue frame, never the
// navy of an invited company ("dont make them the same shade of blue as other boxes, it mixes together"); a "Showing: ... · Show all"
// line says what the list shows; each company card has a coloured left edge (amber still to decide, teal invited, grey No).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fn = (name) => { const i = APP.indexOf(`function ${name}(`); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };

test('the pressed box is light blue with a blue frame, not the navy of an invited company', () => {
  const rule = APP.match(/html\.ui-c \.tcml-fig\[aria-pressed="true"\]\{[^}]+\}/)[0];
  assert.match(rule, /background:var\(--c-accent-bg\)/);
  assert.match(rule, /border:2px solid var\(--c-sis\)/);
  assert.doesNotMatch(rule, /--btn-bg/, 'never the navy of a done invited company');
  assert.match(APP, /html\.ui-c \.tcml-t\.done\.inv\{background:var\(--btn-bg\)/, 'invited companies stay navy');
});

test('a Showing line names the pressed box, counts the companies, and Show all goes back to everything', () => {
  const src = APP.match(/const TCML_FILTER_NAMES = [^\n]+/)[0] + '\n' + fn('tcMlShowing') + '\nreturn tcMlShowing;';
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const tcN = (n) => String(n);
  const make = (filter) => new Function('T_ML', 'esc', 'tcN', src)({ filter }, esc, tcN);
  assert.equal(make('all')(184), '', 'nothing when everything is shown');
  const todo = make('todo')(182);
  assert.match(todo, /Showing: <b>Still to decide<\/b> · 182 companies · /);
  assert.match(todo, /onclick="T_ML\.filter='all';tcMlDraw\(\)">Show all<\/button>/);
  assert.match(make('no')(1), /<b>No<\/b> · 1 company · /);
  assert.match(make('postcard')(3), /Postcard · in person or by post/);
  assert.ok(APP.includes('${tcMlShowing(shown.length)}<div class="tcml-find">'), 'drawn right above the search');
});

test('each company card has a coloured left edge: amber still to decide, teal invited, grey No', () => {
  assert.match(APP, /html\.ui-c \.tcml-t:not\(\.inv\):not\(\.no\)\{border-left:5px solid #d98a1e\}/);
  assert.match(APP, /html\.ui-c \.tcml-t\.inv\{border-left:5px solid var\(--ok\)\}/);
  assert.match(APP, /html\.ui-c \.tcml-t\.no\{border-left:5px solid #9aa3af\}/);
});
