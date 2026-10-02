// WRITING A NOTE LEAVES YOU WHERE YOU WROTE IT (closure audit, 02.10.2026).
//
// Aigars's per-person comment thread lives on the Journey card (285d4ec), and Today has
// "Write what happened". Both open the one note dialog, and its save called viewPerson()
// unconditionally: the screen jumped to the person page while the address still said
// #/journey or #/today, so the writer lost their place, the note was never seen landing
// in the thread it was written into, and Back went somewhere unexpected. Found by
// writing a note on the running app.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');

async function save(hash) {
  const i = APP.indexOf('async function doNote(');
  assert.ok(i > 0);
  const src = APP.slice(i, APP.indexOf('\n}\n', i) + 2);
  const calls = [];
  const el = { value: 'note' };
  const ctx = { location: { hash }, CFG: { noteTypes: [] }, $: () => el,
    post: async () => ({}), closeModal: () => {}, viewPerson: (id) => calls.push('person:' + id),
    route: () => calls.push('route'), C_JTALK: new Map([['p1', []]]) };
  vm.runInNewContext(src + '\nthis.go = doNote;', ctx);
  await ctx.go('p1');
  if (ctx.C_JTALK.has('p1')) calls.push('STALE THREAD');
  return calls;
}

// The Journey keeps each person's thread in C_JTALK for the session. Without dropping it,
// the redraw shows the thread as it was BEFORE the note: the write is invisible until a reload.
test('from the Journey card, the Journey is redrawn and the address stays true', async () => {
  assert.deepEqual(await save('#/journey'), ['route']);
});

test('from Today, Today is redrawn', async () => {
  assert.deepEqual(await save('#/today'), ['route']);
});

test('from the person page, the person page is redrawn as before', async () => {
  assert.deepEqual(await save('#/person/p1'), ['person:p1']);
});
