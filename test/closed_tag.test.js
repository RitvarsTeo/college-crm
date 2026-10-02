// COLD IS NOT REJECTED (02.10.2026).
//
// Admissions, 30.09.2026, describing how the work is actually divided: under Not
// proceeding each person needs a tag, cold or reject. With cold no next activity is
// set on purpose, they are NOT rejected, and a cold one sometimes becomes an active
// lead again. A reject is often temporary - somebody who cannot yet, for example
// still at secondary school - and the contact is kept either way. The split is wanted
// for statistics and to aim marketing at the cold ones.
//
// The exact words are in docs/IEVA_AIGARS_FEEDBACK_VERBATIM.md. This file exists so
// the distinction cannot be flattened back into one bucket by somebody who reads only
// the code.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
const SERVER = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
const DB = fs.readFileSync(path.join(ROOT, 'src', 'db.js'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');

test('the two tags exist, and each says what it means', () => {
  const tags = CFG.closedTags || [];
  assert.equal(tags.length, 2, 'cold and reject, no more invented');
  assert.deepEqual(tags.map((t) => t.id), ['cold', 'reject']);
  for (const t of tags) assert.ok(t.what && t.what.length > 30, t.id + ' must say what it means');
});

test('cold is dormant and reject is not, which is the whole point of having both', () => {
  const by = Object.fromEntries((CFG.closedTags || []).map((t) => [t.id, t]));
  assert.equal(by.cold.dormant, true, 'a cold person is expected back');
  assert.equal(by.reject.dormant, false);
  assert.match(by.cold.what, /[Nn]ot rejected/, 'cold must say it is not a rejection');
  assert.match(by.reject.what, /contact is kept/i, 'the contact survives a reject');
});

test('the tag is a SECOND axis, not a second reason list', () => {
  const reasons = CFG.closedReasons || [];
  for (const t of CFG.closedTags || []) {
    assert.ok(!reasons.includes(t.label), t.label + ' must not also be a reason');
  }
  assert.ok(reasons.length >= 10, 'the ten reasons are untouched');
  assert.match(String(CFG._closedTags), /SECOND axis/, 'the config says why both exist');
});

test('the column exists and says what it is for', () => {
  assert.match(DB, /closed_tag TEXT,/, 'a person can carry the tag');
  assert.match(DB, /closed_reason says why we\s*\n?\s*--\s*stopped; this says what now|says what now/,
    'the schema distinguishes the two axes');
});

test('only Not proceeding may carry a tag, and it is cleared on the way back', () => {
  // A person who becomes active again is neither cold nor rejected. A stale tag would
  // quietly poison the statistics the split was asked for.
  const i = SERVER.indexOf('COLD IS NOT REJECTED');
  assert.ok(i > 0, 'the close route sets the tag');
  const block = SERVER.slice(i, i + 600);
  assert.match(block, /closedTags\.some/, 'an unknown tag is refused, never stored');
  assert.match(block, /SET closed_tag = NULL/, 'any other status clears it');
});

test('the dialog offers both and sends the chosen one', () => {
  assert.match(APP, /name="clTag"/, 'the choice is on the close dialog');
  assert.match(APP, /closedTag: tag \? tag\.value : null/, 'and it reaches the server');
  assert.match(APP, /CFG\.closedTags \|\| \[\]/, 'read from config, never a hand-written pair');
});

test('no colleague is named on screen', () => {
  // the attribution belongs in docs/IEVA_AIGARS_FEEDBACK_VERBATIM.md, not in the product
  const i = APP.indexOf('class="cltags"');
  assert.ok(i > 0);
  assert.ok(!APP.slice(i - 2000, i + 2000).includes('Ieva'), 'the screen says the thing, not who asked');
});
