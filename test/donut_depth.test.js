// DEPTH BELONGS TO THE FRAME, NEVER TO THE MARK (the owner, 02.10.2026, KB 08 P5).
//
// The donut's solid used to be every segment drawn again in its own colour, darkened and
// dropped. A slice at six o'clock then showed a full coloured wall and a slice at three or
// nine o'clock almost none: coloured ink that came from WHERE the slice sat, not from what
// it counted (found by the QA session, 02.10.2026). The solid is now one neutral ring under
// the whole object. These run cDonut() and read what it draws.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fn = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };

const donut = (() => {
  const ctx = { esc: (s) => String(s ?? ''), Math };
  vm.runInNewContext(fn('function cDonut(') + '\nthis.d = cDonut;', ctx);
  return ctx.d;
})();
const rows = [['Open', 35, 'open', 'journey'], ['Admitted', 12, 'adm', 'Admitted'], ['Not proceeding', 17, 'np', 'Not proceeding']];

test('the solid under the ring is ONE path, in a frame colour, never a data colour', () => {
  const html = donut(rows);
  const walls = html.match(/class="kwall"/g) || [];
  assert.equal(walls.length, 1, 'one plinth for the whole object, not one wall per slice');
  const wall = /<path[^>]*class="kwall"[^>]*>/.exec(html)[0];
  assert.match(wall, /fill:var\(--k-plinth\)/);
  assert.doesNotMatch(wall, /--v-/, 'no data token on the plinth');
  assert.doesNotMatch(html, /brightness/, 'no slice drawn twice in its own colour');
});

test('the plinth is declared in both modes, as a frame colour', () => {
  const dark = [...APP.matchAll(/html\.ui-c\[data-theme="dark"\]\{([^}]*)\}/g)].map((m) => m[1]);
  assert.match(dark[0], /--k-plinth:#[0-9a-f]{6}/i, 'in the one dark palette');
  assert.match(APP, /html\.ui-c:not\(\[data-theme="dark"\]\)\{--k-plinth:#[0-9a-f]{6}\}/i, 'and in light');
});

test('the reading surface is still exact: each face sweeps its share of the circle', () => {
  const html = donut(rows);
  const faces = html.split('<path').filter((p) => p.includes('class="kseg"'))
    .map((p) => /d="M([\d.-]+),([\d.-]+) A54,54 0 (\d) 1 ([\d.-]+),([\d.-]+)/.exec(p));
  assert.equal(faces.length, 3);
  const ang = (x, y) => Math.atan2(Number(y) - 62, Number(x) - 70);
  const total = 64;
  faces.forEach((f, k) => {
    let sweep = ang(f[4], f[5]) - ang(f[1], f[2]);
    while (sweep <= 0) sweep += Math.PI * 2;
    const want = (rows[k][1] / total) * Math.PI * 2 - 0.035;   // minus the one fixed gap
    assert.ok(Math.abs(sweep - want) < 0.01, `${rows[k][0]}: sweep ${sweep.toFixed(3)} vs share ${want.toFixed(3)}`);
  });
});

test('nothing to draw, no plinth pretending there is an object', () => {
  assert.doesNotMatch(donut([['Open', 0, 'open', 'journey']]), /class="kwall"/);
});
