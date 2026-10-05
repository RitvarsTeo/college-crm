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
  const src = APP.slice(i, APP.indexOf('\n}\n', i) + 2);
  const drawn = [];
  const ctx = { location: { hash: startHash }, C_PF: null, C_PQ: 'x', C_PEDIT: null, C_PMSG: 'x',
    C_PSCROLL: false, C_PTAB: 'journey', C_PF_EMPTY: () => ({}), viewJourneyPool: () => drawn.push('all'), C_JP: { col: 'Contract', view: 'list' }, C_JDATA: null };
  vm.runInNewContext(src + '\ncEditFromJourney("p1");', ctx);
  return { ctx, drawn };
}

// Admissions 05.10 (editing a person threw them to the People page; edit right on the Journey): on the Board the
// opened card becomes the edit form right there - no other page, no other view
test('Edit on the Board edits in place: the opened card is the form', () => {
  const i = APP.indexOf('function cEditFromJourney(');
  const drawn = [];
  const ctx = { location: { hash: '#/journey' }, C_PEDIT: null, C_PMSG: 'x', C_JSEL: null, C_JDATA: { people: [] },
    C_JP: { col: null, view: 'board' }, cDrawJourney: () => drawn.push('board'), viewJourneyPool: () => drawn.push('list') };
  vm.runInNewContext(APP.slice(i, APP.indexOf('\n}\n', i) + 2) + '\ncEditFromJourney("p1");', ctx);
  assert.equal(ctx.C_PEDIT, 'p1'); assert.equal(ctx.C_JSEL, 'p1', 'the card stays open');
  assert.deepEqual(drawn, ['board']); assert.equal(ctx.location.hash, '#/journey'); assert.equal(ctx.C_JP.view, 'board');
  assert.match(APP, /\$\{C_PEDIT === p\.id \? `<div class="c-card c-jedit">\$\{cEditForm\(p, taskOf\.get\(p\.id\)\)\}<\/div>` : cPersonCard\(p, taskOf\.get\(p\.id\)\)\}/);
  assert.match(APP, /if \(C_JP\.view === 'board'\) await viewJourneyC\(\); else await viewJourneyPool\(\);/, 'Save stays where you are');
});

for (const start of ['#/people', '#/journey', '#/people/all']) {
  test(`Edit on the Journey card opens the edit form, starting from ${start}`, () => {
    const { ctx, drawn } = run(start);
    assert.equal(ctx.C_PEDIT, 'p1', 'the person to edit is set');
    assert.equal(ctx.C_PTAB, 'all', 'the All people tab is the one drawn');
    // Q47: everyone, as the list, where the row opens in place
    assert.equal(ctx.C_JP.col, null); assert.equal(ctx.C_JP.view, 'list');
    const moved = ctx.location.hash !== start;
    assert.ok(moved || drawn.length === 1, 'either the hash changes, or the list is drawn directly');
  });
}
