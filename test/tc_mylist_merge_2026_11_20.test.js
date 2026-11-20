// A DIRECTOR'S WORK NEVER VANISHES (patch 155, 20.11.2026; his picks: hide the old gift switch, a red "Not saved" bar that stays,
// and "Data steps never make a director's open page stale" - "We need to fix this all!"). A page that loaded an older version
// sends its changes with what it saw before; the server puts them on top of the newest list and names only a company or person
// that somebody else changed in between. Every person and company here is invented.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './security_helpers.js';
const { openDb } = await import('../src/db.js');
const ml = await import('../src/tcmylist.js');
const { nameKey } = await import('../src/tc.js');
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const BLOCK = APP.slice(APP.indexOf('// MLSTATE START'), APP.indexOf('// MLSTATE END'));
const { mlChanges, mlClone } = new Function(BLOCK + '\nreturn { mlChanges, mlClone };')();

const at = new Date().toISOString();
async function seed(db) {
  const co = async (name) => Number((await db.prepare(`INSERT INTO tc_companies (name, name_key, country, status, created_at) VALUES (?,?,?,?,?)`).run(name, nameKey(name), 'Latvia', 'not_contacted', at)).lastInsertRowid);
  const ids = { a: await co('Alpha Example SIA'), b: await co('Beta Example AS'), c: await co('Gamma Example Ltd') };
  const row = async (ch, name, cid) => {
    const id = Number((await db.prepare(`INSERT INTO tc_go_stage2 (ch_contact_id, sender, name, company, email, gone, loaded_at, loaded_by) VALUES (?,?,?,?,?,0,?,?)`)
      .run(ch, 'Marcis', name, 'x', ch.toLowerCase() + '@example.com', at, 'test')).lastInsertRowid);
    await db.prepare(`INSERT INTO tc_company_contacts (company_id, name, email, ch_contact_id, created_at) VALUES (?,?,?,?,?)`).run(cid, name, ch.toLowerCase() + '@example.com', ch, at);
    return id;
  };
  ids.p1 = await row('M1', 'Anna Example', ids.a); ids.p2 = await row('M2', 'Ben Example', ids.a);
  ids.p3 = await row('M3', 'Carla Example', ids.b); ids.p4 = await row('M4', 'Dora Example', ids.c);
  ids.A = 'id:' + ids.a; ids.B = 'id:' + ids.b; ids.C = 'id:' + ids.c;
  return ids;
}
const pageOf = async (db) => { const L = await ml.myList(db, 'Marcis'); return { L, saved: ml.stateOf(L), version: L.version.id }; };
const change = (pg, f) => { const W = mlClone(pg.saved); f(W); return { W, ...mlChanges(W, pg.saved, pg.L) }; };

test('the page lists its changes with what it saw before; n counts them', async () => {
  const db = await openDb(); const s = await seed(db);
  const pg = await pageOf(db);
  const { changes, n } = change(pg, (W) => { W.picks[s.A] = { decision: 'invite', way: 'digital' }; W.out.push(s.p2); W.moves[s.p4] = s.B; });
  assert.deepEqual(changes, { picks: { [s.A]: null }, out: { [s.p2]: false }, moves: { [s.p4]: s.C } });
  assert.equal(n, 3);
  assert.equal(mlChanges(pg.saved, pg.saved, pg.L).n, 0, 'nothing changed = nothing waiting');
});

test('a data step or another save after the page loaded: the page\'s changes go on top, nothing of either side is lost', async () => {
  const db = await openDb(); const s = await seed(db);
  const page = await pageOf(db);                                    // Marcis opens his list (version 0)
  // meanwhile somebody else saves Beta as No (a data step, or an admin) - the list's version moves on
  await ml.saveState(db, 'Marcis', { picks: { [s.B]: { decision: 'no' } }, out: [], moves: {} }, 'Admin', 0);
  // Marcis, still on the old page, decides Alpha and taps Ben out
  const { W, changes } = change(page, (x) => { x.picks[s.A] = { decision: 'invite', way: 'digital' }; x.out.push(s.p2); });
  const L = await ml.saveState(db, 'Marcis', W, 'Mārcis', page.version, '', changes);
  assert.deepEqual(L.conflicts, []);
  const g = (k) => L.groups.find((x) => x.key === k);
  assert.equal(g(s.A).decision, 'invite'); assert.equal(g(s.A).way, 'digital');
  assert.equal(g(s.A).people.find((p) => p.id === s.p2).out, true);
  assert.equal(g(s.B).decision, 'no', 'the other change stays: his old page did not wipe it');
});

test('the same company changed by both: the newer one is kept and that company alone is named', async () => {
  const db = await openDb(); const s = await seed(db);
  const page = await pageOf(db);
  await ml.saveState(db, 'Marcis', { picks: { [s.A]: { decision: 'no' } }, out: [], moves: {} }, 'Admin', 0);
  const { W, changes } = change(page, (x) => { x.picks[s.A] = { decision: 'invite', way: 'post' }; x.picks[s.C] = { decision: 'invite', way: 'digital' }; });
  const L = await ml.saveState(db, 'Marcis', W, 'Mārcis', page.version, '', changes);
  assert.deepEqual(L.conflicts.map((c) => c.name), ['Alpha Example SIA']);
  assert.equal(L.groups.find((x) => x.key === s.A).decision, 'no', 'the newer choice is kept');
  assert.equal(L.groups.find((x) => x.key === s.C).decision, 'invite', 'his other change is saved');
});

test('both made the SAME choice: no conflict', async () => {
  const db = await openDb(); const s = await seed(db);
  const page = await pageOf(db);
  await ml.saveState(db, 'Marcis', { picks: { [s.A]: { decision: 'invite', way: 'digital' } }, out: [], moves: {} }, 'Admin', 0);
  const { W, changes } = change(page, (x) => { x.picks[s.A] = { decision: 'invite', way: 'digital' }; });
  assert.deepEqual((await ml.saveState(db, 'Marcis', W, 'Mārcis', page.version, '', changes)).conflicts, []);
});

test('a person dragged elsewhere by somebody else meanwhile: his drag of that person is named, not forced', async () => {
  const db = await openDb(); const s = await seed(db);
  const page = await pageOf(db);
  await ml.saveState(db, 'Marcis', { picks: {}, out: [], moves: { [s.p4]: s.A } }, 'Admin', 0);
  const { W, changes } = change(page, (x) => { x.moves[s.p4] = s.B; });
  const L = await ml.saveState(db, 'Marcis', W, 'Mārcis', page.version, '', changes);
  assert.deepEqual(L.conflicts.map((c) => c.name), ['Dora Example']);
  assert.equal(L.groups.find((x) => x.people.some((p) => p.id === s.p4)).key, s.A);
});

test('an old tab that sends no changes on an older version is still refused as before (it cannot overwrite)', async () => {
  const db = await openDb(); const s = await seed(db);
  const page = await pageOf(db);
  await ml.saveState(db, 'Marcis', { picks: { [s.B]: { decision: 'no' } }, out: [], moves: {} }, 'Admin', 0);
  await assert.rejects(ml.saveState(db, 'Marcis', { picks: { [s.A]: { decision: 'no' } }, out: [], moves: {} }, 'Mārcis', page.version), ml.MlConflict);
});

test('the page: a failed save keeps a red "Not saved - N changes waiting" bar with Retry; changes kept in this browser and saved on the next open', () => {
  assert.ok(APP.includes('<div class="tcml-unsaved" role="alert"><b>Not saved</b><span>${tcN(waiting)} ${waiting === 1 ? \'change\' : \'changes\'} waiting</span><button type="button" class="btn sm" onclick="tcMlSaveNow()">Retry</button></div>'));
  const save = APP.slice(APP.indexOf('async function tcMlSave()'), APP.indexOf('\n}\n', APP.indexOf('async function tcMlSave()')));
  assert.ok(save.includes('changes: ch.changes') && save.includes('T_ML.unsaved = true; tcMlKeep();') && save.includes('S.unsaved = false;'));
  assert.ok(APP.includes("localStorage.setItem(tcMlKeepKey(T_ML.code)") && APP.includes("localStorage.removeItem(tcMlKeepKey(T_ML.code))"));
  assert.ok(APP.includes('T_ML.saved = kept.saved; T_ML.version = Number(kept.version) || 0;'), 'a kept copy saves as a merge from the version it was made on');
  assert.ok(APP.includes('Changed by someone else meanwhile, their choice is kept: ${esc(T_ML.merged.join(\', \'))}'));
});
