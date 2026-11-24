// THE GRAND OPENING PAGE (patch 164, his words and picks 23.11.2026): Grand Opening is the first tab and opens My Grand Opening list;
// the Client Journey is a quiet corner link (pick B); Check-in at the door is in the phone's More (pick B); the old Stage 2 lists
// panel and Stage 3 are gone; Invite · digital with the Postcard tile under it, and the postcard list lives in that tile.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './security_helpers.js';
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const BLOCK = APP.slice(APP.indexOf('// MLSTATE START'), APP.indexOf('// MLSTATE END'));
const P = new Function(`${BLOCK}; return { mlView, mlShows };`)();

test('the Postcard tile counts the invited people whose company also gets the postcard and letter; its filter shows those companies', () => {
  const base = { groups: [
    { key: 'id:1', name: 'A', people: [{ id: 1 }, { id: 2 }] },
    { key: 'id:2', name: 'B', people: [{ id: 3 }] },
    { key: 'id:3', name: 'C', people: [{ id: 4 }] }] };
  const W = { picks: { 'id:1': { decision: 'invite', way: 'digital,post' }, 'id:2': { decision: 'invite', way: 'digital' }, 'id:3': { decision: 'no' } }, out: [2], moves: {}, settled: [] };
  const V = P.mlView(base, W);
  assert.deepEqual(V.figures, { todo: 0, invite: 2, no: 2, postcard: 1 }, 'the tapped-out person of A is not counted');
  assert.deepEqual(V.groups.filter((g) => P.mlShows(g, 'postcard')).map((g) => g.name), ['A']);
});

test('the page: the tiles under each other, Download Excel in the Postcard tile, no Postcard list button; the corner link; the door in More; no Stage 3, no old panel', () => {
  assert.ok(APP.includes(`<div class="tcml-stack">\${fig('invite', F.invite, 'Invite · digital')}\${fig('postcard', F.postcard, 'Postcard · in person or by post')}</div>`));
  assert.ok(APP.includes(`T_ML.filter === 'postcard' && !T_ML.demo ? '<div class="tcml-pcbar"><a class="btn sm" href="/api/tc/go/postcards.xlsx" download>Download Excel</a></div>'`));
  assert.ok(!APP.includes('href="#/tc/postcards">Postcard list</a>'));
  assert.ok(APP.includes(`'<a class="tc-cj" href="/api/tc/go/demo" target="_blank" rel="noopener">Client Journey ↗</a>'`) && !APP.includes('▶ Demo'));
  assert.ok(APP.includes(`\${more('#/tc/door', TC_DOOR_ICON, 'Check-in at the door')}`), 'in the phone menu\'s More');
  assert.ok(!APP.includes('class="btn ghost tcgo-door"'), 'never on the page');
  assert.ok(!APP.includes("tb('s3'") && !APP.includes('<h2>Stage 2 lists</h2>'));
  assert.ok(APP.includes("const plan = [...(T_GO_ON ? [[T_GO_MINE ? '#/tc/mylist' : '#/tc/go', 'go', 'Grand Opening']] : []), week ?"), 'the first tab');
  const demo = fs.readFileSync(path.join(ROOT, 'src', 'go-demo', 'index.html'), 'utf8');
  assert.ok(demo.includes('<title>Client Journey</title>') && demo.includes('data-t="Your manager decides"'));
});
