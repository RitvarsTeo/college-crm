// HIS ASK 13.11.2026: "make sure, that invitee list and no go list can be saved and have 0 problems with interactivity". The
// end-to-end run on a local copy found one: leaving the list with unsaved changes and pressing Cancel left the motion engine's
// frozen copy of the page on screen for up to 3 seconds, with the real list hidden underneath taking the taps.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');

test('a refused leave drops the frozen copy and shows the real list at once', () => {
  const i = app.indexOf('function tcMlMayLeave('), fn = app.slice(i, app.indexOf('\n}\n', i) + 2);
  const removed = [], view = { style: { opacity: '0' } }, shown = [];
  const ctx = {
    T_ML: { dirty: true, hash: '#/tc/mylist' },
    history: { replaceState: (a, b, h) => shown.push(h) },
    modal: (title) => shown.push(title),
    document: { querySelectorAll: (q) => (q === '.mo-held' ? [{ remove: () => removed.push(1) }] : []), getElementById: (id) => (id === 'view' ? view : null) },
  };
  vm.runInNewContext(fn + '; this.out = tcMlMayLeave("#/tc/go");', ctx);
  assert.equal(ctx.out, false, 'the page stays');
  assert.deepEqual(shown, ['#/tc/mylist', 'Save the changes?']);
  assert.equal(removed.length, 1, 'the frozen copy is gone');
  assert.equal(view.style.opacity, '', 'the real list is visible again');
});

test('nothing unsaved: the move goes ahead and nothing is touched', () => {
  const i = app.indexOf('function tcMlMayLeave('), fn = app.slice(i, app.indexOf('\n}\n', i) + 2);
  const ctx = { T_ML: { dirty: false, hash: '#/tc/mylist' }, document: { querySelectorAll: () => { throw new Error('touched'); } } };
  vm.runInNewContext(fn + '; this.out = tcMlMayLeave("#/tc/go");', ctx);
  assert.equal(ctx.out, true);
});
