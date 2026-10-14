// Q95 (the owner, 14.10.2026: "why the coming up is different?"). Due's Needs you tiles drew the default set the list opens
// on (Overdue, Due today, No next step) in the chosen frame, and Coming up without it. Every tile looks the same at rest;
// only the tile a person clicked is framed. The same on every band of tiles.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fn = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };

const ctx = { esc: (s) => String(s ?? '') };
vm.runInNewContext(fn('function cPoolCards(') + '\nthis.cards = cPoolCards;', ctx);
const TILES = [{ id: 'over', label: 'Overdue', n: 22, lit: true }, { id: 'today', label: 'Due today', n: 0, lit: true },
  { id: 'later', label: 'Coming up', n: 12, lit: false }, { id: 'none', label: 'No next step', n: 56, lit: true }];
const tiles = (html) => [...html.matchAll(/<button type="button" class="kneed p-card( on)?" style="--i:\d+" aria-pressed="(true|false)"[\s\S]*?<span>([^<]+)<\/span>/g)].map((m) => [m[3], Boolean(m[1]), m[2]]);

test('at rest every tile is drawn the same: the default set is not framed, Coming up is not left out', () => {
  assert.deepEqual(tiles(ctx.cards('Due', 'Needs you', TILES, null, 'cTodayPick')),
    [['Overdue', false, 'false'], ['Due today', false, 'false'], ['Coming up', false, 'false'], ['No next step', false, 'false']]);
});

test('a clicked tile, and only that one, is framed', () => {
  assert.deepEqual(tiles(ctx.cards('Due', 'Needs you', TILES, 'later', 'cTodayPick')).map(([l, on]) => [l, on]),
    [['Overdue', false], ['Due today', false], ['Coming up', true], ['No next step', false]]);
  const chips = ctx.cards('Due', 'Needs you', TILES, null, 'cTodayPick');
  assert.doesNotMatch(chips, /class="p-chip on/, 'the folded row of chips is alike at rest too');
});

test('the other bands frame only what was clicked', () => {
  assert.match(fn('function cPoolBand('), /class="jb-col\$\{on === c\.id \? ' on' : ''\}"/, 'the Inbox and Journey bands');
  assert.doesNotMatch(APP, /\$\{on === c\.id \|\| c\.lit \? ' on' : ''\}/, 'no default frame anywhere');
});
