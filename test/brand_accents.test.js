// The owner's picks, 02.10.2026 (popup): the menu in light goes white into a soft Novikontas
// Blue tint, and Pitch Black #011111 is the strong accent as a short bar before each section
// heading. Both colours are the brandbook's own (Novikontas Blue #53a7db, Pitch Black #011111).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');

test('the light menu runs white into a 15% Novikontas Blue tint', () => {
  const m = APP.match(/html\.ui-c:not\(\[data-theme="dark"\]\) \.shell > nav\{\s*background:linear-gradient\(180deg,#ffffff 0%,#ffffff 40%,(#[0-9a-f]{6}) 100%\)/);
  assert.ok(m, 'the gradient is there');
  // #53a7db at 15% on white
  const mix = [0x53, 0xa7, 0xdb].map((c) => Math.round(255 - (255 - c) * 0.15).toString(16)).join('');
  assert.equal(m[1], '#' + mix);
});

test('Pitch Black marks every section heading, and stays visible in dark', () => {
  assert.match(APP, /html\.ui-c \.ksh h2::before\{content:"";[^}]*background:#011111\}/);
  assert.match(APP, /html\.ui-c\[data-theme="dark"\] \.ksh h2::before\{background:var\(--ink\)\}/,
    'black on the navy sea would vanish, so dark takes its own ink');
});
