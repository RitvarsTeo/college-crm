// Item 6, 30.09.2026: one state, one word. "Nothing planned", "nothing planned yet",
// "nothing scheduled" and "no next step" were the same fact written five ways across
// the Journey card, the Next Steps row, the People table, the person page and the
// classic tiles. A person reading two screens should not have to work out that two
// different sentences mean the same thing.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');

test('the state is written one way only', () => {
  for (const variant of ['nothing planned', 'Nothing planned', 'Nothing planned yet',
    'nothing scheduled', 'Nothing scheduled']) {
    assert.ok(!APP.includes(variant), 'still says: ' + variant);
  }
});

test('and that one way is on every screen that shows it', () => {
  // the Journey card, the Next Steps row, the People cell, the person page, the picker
  assert.ok(APP.split(/No next step/g).length - 1 >= 6, 'the one wording is used throughout');
  // Q44: on the Journey card and the Today row the words gave way to the action itself
  assert.match(APP, /cSisHolds\(p\) \? '' : cChooseNext\(p\.id\)\}/, 'the Journey card: Choose next step');
  assert.match(APP, /<option value="">No next step<\/option>/, 'the picker');
});
