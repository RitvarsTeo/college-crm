// The owner's picks, 02.10.2026 (popup): Pitch Black #011111 is the strong accent as a short bar before each section
// heading. Both colours are the brandbook's own (Novikontas Blue #53a7db, Pitch Black #011111).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');

// the light menu gradient of 02.10 was replaced by solid brandbook blue (Q5 B, 04.10): test/menu_ab.test.js

test('Pitch Black marks every section heading, and stays visible in dark', () => {
  assert.match(APP, /html\.ui-c \.ksh h2::before\{content:"";[^}]*background:#011111\}/);
  assert.match(APP, /html\.ui-c\[data-theme="dark"\] \.ksh h2::before\{background:var\(--ink\)\}/,
    'black on the navy sea would vanish, so dark takes its own ink');
});
