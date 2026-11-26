// THE WORD "undefined" ON THE TC CLIENTS PAGE (patch 186, 26.11.2026): cPoolFrame printed ${band}, and the Training Centre list passes
// no band since its status chart was removed. Every part the frame prints now defaults to nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fn = (name) => { const at = APP.indexOf(name); assert.ok(at >= 0, name); return APP.slice(at, APP.indexOf('\n}\n', at) + 3); };

test('a frame without band, filters or body prints none of them as text', () => {
  const ctx = { esc: (s) => String(s) };
  vm.runInNewContext(fn('function cPoolFrame(') + '\nthis.f = cPoolFrame;', ctx);
  const html = ctx.f({ title: 'Clients', crumb: '310 companies match', act: '<a>Add</a>' });
  assert.doesNotMatch(html, /undefined/);
  assert.match(html, /<h1>Clients<\/h1>/);
  assert.match(ctx.f({ title: 'X', band: '<b>band</b>', filters: '<i>f</i>', body: 'rows' }), /<b>band<\/b><i>f<\/i><div class="p-body">rows<\/div>/);
});

test('the Training Centre list still passes no band, so the default is what keeps it clean', () => {
  const list = fn('function tcDrawCompanies(');
  assert.doesNotMatch(list, /\bband:/);
});
