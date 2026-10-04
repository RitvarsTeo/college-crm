// THE JOURNEY CARD'S EDIT BUTTON WAS DEAD (closure audit, 02.10.2026).
//
// Aigars asked for quick edit wherever somebody is working (backlog rows 47 and 116). The
// Journey person card has an Edit button for it. It set location.hash = '#/people', but the
// Journey already lives at #/people, so no hashchange fired; and from #/journey the router
// kept C_PTAB on 'journey' because '#/people' without '/all' does not switch the tab. Either
// way the screen did not move. Found by clicking it, not by reading it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');

function run(startHash) {
  const i = APP.indexOf('function cEditFromJourney(');
  assert.ok(i > 0);
  const src = APP.slice(i, APP.indexOf('\n', i));
  const drawn = [];
  const ctx = { location: { hash: startHash }, C_PF: null, C_PQ: 'x', C_PEDIT: null, C_PMSG: 'x',
    C_PSCROLL: false, C_PTAB: 'journey', C_PF_EMPTY: () => ({}), viewPeopleC: () => drawn.push('all') };
  vm.runInNewContext(src + '\ncEditFromJourney("p1");', ctx);
  return { ctx, drawn };
}

for (const start of ['#/people', '#/journey', '#/people/all']) {
  test(`Edit on the Journey card opens the edit form, starting from ${start}`, () => {
    const { ctx, drawn } = run(start);
    assert.equal(ctx.C_PEDIT, 'p1', 'the person to edit is set');
    assert.equal(ctx.C_PTAB, 'all', 'the All people tab is the one drawn');
    const moved = ctx.location.hash !== start;
    assert.ok(moved || drawn.length === 1, 'either the hash changes, or the list is drawn directly');
  });
}
