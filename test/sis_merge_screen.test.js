// APPLICATIONS lane, item 3: the undo for a wrong match, on screen. DECIDED by Ritvars 30.09.2026
// (popup): "Same person as..." on a person the SIS created; the SIS link and history move to the
// real person and the extra record goes. The endpoint (POST /api/people/<id>/merge-into) is tested
// in sis_merge.test.js; nothing on the page called it, so a duplicate could not be undone by the
// people who see it. This reads the page's own code.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fn = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };

function candidates() {
  const ctx = {};
  vm.runInNewContext(fn('function cMergeCandidates(') + 'this.pick = cMergeCandidates;', ctx);
  return (...a) => JSON.parse(JSON.stringify(ctx.pick(...a)));
}

const PEOPLE = [
  { id: 'twin', name: 'Liene Kalna', email: 'liene.kalna@example.com', first_channel: 'sis' },
  { id: 'real', name: 'Liene Kalniņa', email: 'liene@inbox.lv', phone: '+37129990002', first_channel: 'phone' },
  { id: 'other', name: 'Jānis Ozols', email: 'janis@example.com', first_channel: 'website' },
];

test('merge screen: the list never offers the person themselves, and finds by name, email or phone', () => {
  const pick = candidates();
  assert.deepEqual(pick(PEOPLE, 'twin', '').map((p) => p.id), ['real', 'other']);
  assert.deepEqual(pick(PEOPLE, 'twin', 'kaln').map((p) => p.id), ['real']);
  assert.deepEqual(pick(PEOPLE, 'twin', 'INBOX.LV').map((p) => p.id), ['real']);
  assert.deepEqual(pick(PEOPLE, 'twin', '29990002').map((p) => p.id), ['real']);
  assert.deepEqual(pick(PEOPLE, 'twin', 'nobody').map((p) => p.id), []);
});

test('merge screen: at most 20 rows, so a long People list stays a list', () => {
  const many = Array.from({ length: 50 }, (_, i) => ({ id: 'p' + i, name: 'Person ' + i }));
  assert.equal(candidates()(many, 'p0', '').length, 20);
});

test('merge screen: the button is on the person page only for a person the SIS created, and calls merge-into', () => {
  const page = fn('async function viewPersonC(');
  assert.match(page, /p\.first_channel === 'sis' \? `[^`]*openSisMerge\(/, 'gated on first_channel sis');
  const open = fn('async function doSisMerge(');
  assert.match(open, /\/merge-into/);
  assert.match(open, /targetId/);
});
