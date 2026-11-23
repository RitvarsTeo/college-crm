// SAME COMPANY (patch 163; his pick "Auto obvious, tick rest", tick list "Yes, build it"). Invented companies only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import * as same from '../src/tcsame.js';
import * as cards from '../src/tccards.js';

const at = '2026-11-23T12:00:00Z';
async function co(db, id, name, country = null) {
  await db.prepare(`INSERT INTO tc_companies (id, name, name_key, country, status, created_at) VALUES (?,?,?,?,?,?)`).run(id, name, name.toLowerCase(), country, 'contacted', at);
}
async function person(db, companyId, email, ch) {
  await db.prepare(`INSERT INTO tc_company_contacts (company_id, name, email, ch_contact_id, created_at) VALUES (?,?,?,?,?)`).run(companyId, email.split('@')[0], email, ch, at);
}
// a card store in memory, with the merge function's rules
function memCards(rows) {
  cards.setStore({
    async link() { return null; },
    async all() { return rows.filter((r) => r.company_key); },
    async merge(db, from, to, keep, company) {
      const out = [];
      if (!keep) { if (rows.some((r) => r.company_key === from || r.company_key === to)) throw new Error('name the card to keep'); return out; }
      const k = rows.find((r) => r.code === keep && (r.company_key === from || r.company_key === to));
      if (!k) throw new Error('not one of these companies');
      k.company_key = to; k.company = company; out.push({ kept_code: k.code, kept_place: k.place });
      for (const r of rows.filter((x) => (x.company_key === from || x.company_key === to) && x.code !== keep)) {
        if (r.reserved) throw new Error('reserved');
        Object.assign(r, { company_key: null, company: null, linked_at: null }); out.push({ freed_code: r.code, freed_place: r.place });
      }
      return out;
    },
  });
}

test('the obvious key drops case, punctuation, spaces and legal forms, never a bracket; the loose key drops the bracket too', () => {
  assert.equal(same.obviousKey('GoTa Ship Management SIA'), same.obviousKey('GoTa Shipmanagement'));
  assert.equal(same.obviousKey('Stena Line'), same.obviousKey('StenaLine'));
  assert.equal(same.obviousKey('Vestland Marine Sp. z o.o.'), same.obviousKey('Vestlandmarine'));
  assert.equal(same.obviousKey('AS Latvenergo'), same.obviousKey('Latvenergo'));
  assert.notEqual(same.obviousKey('DFDS (Guernsey) Limited'), same.obviousKey('DFDS'), 'a bracket is his tick list');
  assert.equal(same.looseKey('DFDS (Guernsey) Limited'), same.looseKey('DFDS'));
});

test('findSame: obvious groups (most contacts kept first), and the tick list as groups of companies with people: a name that starts the other, or a bracket; Not the same is never asked again', async () => {
  const db = await openDb();
  await co(db, 1, 'Stena Line'); await co(db, 2, 'StenaLine'); await co(db, 3, 'Stena', 'United Kingdom');
  await co(db, 4, 'Chalmers'); await co(db, 5, 'Chalmers University of Technology', 'Sweden');
  await co(db, 6, 'DFDS'); await co(db, 7, 'DFDS (Guernsey) Limited'); await co(db, 8, 'Atlas'); await co(db, 9, 'Boskalis');
  await co(db, 12, 'DFDS Seaways /LT/');   // no people: on no list, so never asked
  await person(db, 1, 'a@stena.test', 'c1'); await person(db, 5, 'b@chalmers.test', 'c2'); await person(db, 5, 'b2@chalmers.test', 'c5');
  for (const [i, id] of [3, 4, 6, 7, 8, 9].entries()) await person(db, id, `p${i}@x.test`, 'cx' + i);
  const S = await same.findSame(db);
  assert.deepEqual(S.obvious.map((g) => g.map((c) => c.id)), [[1, 2]], 'Stena Line kept: it has a contact');
  const pairs = S.check.map((g) => g.map((c) => c.id).join('+')).sort();
  assert.deepEqual(pairs, ['1+3', '5+4', '6+7'].sort());
  await same.dismiss(db, 3, 1, 'Ritvars');
  assert.deepEqual((await same.findSame(db)).check.map((g) => g.map((c) => c.id).join('+')).sort(), ['5+4', '6+7'].sort());
});

test('merge: everything of the other company moves, the other is archived with a line on both; the card linked first stays, the other is freed', async () => {
  const db = await openDb();
  await co(db, 10, 'TB marine Riga', 'Latvia'); await co(db, 11, 'TB MArine', 'Germany');
  await person(db, 10, 'one@tb.test', 'k1'); await person(db, 11, 'two@tb.test', 'k2'); await person(db, 11, 'one@tb.test', null);
  await db.prepare(`INSERT INTO tc_go_company_picks (sender, company_key, decision, way, set_at, set_by) VALUES ('AB','id:11','invite','digital',?, 'AB')`).run(at);
  await db.prepare(`INSERT INTO tc_go_drafts (sender, editor, state, base, saved_at) VALUES ('MC','mc@x.test',?,0,?)`).run(JSON.stringify({ picks: { 'id:11': { decision: 'no' } }, out: {}, moves: { 5: 'id:11' } }), at);
  const rows = [{ code: 'k9rpcw', place: '6O', company_key: 'id:10', linked_at: '2026-11-16T14:29:20.018Z' }, { code: 'f5qx5n', place: '10T', company_key: 'id:11', linked_at: '2026-11-16T14:29:20.525Z' }];
  memCards(rows);
  try {
    const r = await same.merge(db, 10, 11, 'Ritvars', { mode: 'ticked', at });
    assert.equal(r.moved.contacts, 1, 'two@ moved; one@ was a twin');
    assert.equal(r.removed.contacts, 1);
    assert.equal((await db.prepare(`SELECT ch_contact_id FROM tc_company_contacts WHERE company_id = 10 AND email = 'one@tb.test'`).get()).ch_contact_id, 'k1');
    assert.equal((await db.prepare(`SELECT company_key FROM tc_go_company_picks WHERE sender = 'AB'`).get()).company_key, 'id:10');
    const d = JSON.parse((await db.prepare('SELECT state FROM tc_go_drafts').get()).state);
    assert.deepEqual([d.picks['id:10'], d.moves['5']], [{ decision: 'no' }, 'id:10'], 'an open draft follows');
    assert.match((await db.prepare('SELECT archived_by FROM tc_companies WHERE id = 11').get()).archived_by, /Same company: TB marine Riga/);
    assert.equal(Number((await db.prepare(`SELECT COUNT(*) n FROM tc_activities WHERE field = 'same_company'`).get()).n), 2);
    assert.deepEqual(r.cards, { kept: '6O', freed: ['10T'] });
    assert.deepEqual(rows.map((x) => [x.place, x.company_key]), [['6O', 'id:10'], ['10T', null]]);
    assert.equal(Number((await db.prepare('SELECT COUNT(*) n FROM tc_same_log').get()).n), 1);
    await assert.rejects(same.merge(db, 10, 11, 'Ritvars'), /not there any more/);
  } finally { cards.setStore(null); }
});

test('a director\'s own decision is never chosen for him: different decisions stop the automatic merge; ticked, the kept company\'s own stays and the other is logged', async () => {
  const db = await openDb();
  await co(db, 20, 'Zeaborn'); await co(db, 21, 'ZEABORN');
  await db.prepare(`INSERT INTO tc_go_company_picks (sender, company_key, decision, way, set_at) VALUES ('AB','id:20','invite','digital',?), ('AB','id:21','no',NULL,?)`).run(at, at);
  memCards([]);
  try {
    await assert.rejects(same.merge(db, 20, 21, 'x', { mode: 'auto' }), /tick list/);
    assert.equal((await db.prepare('SELECT archived_at FROM tc_companies WHERE id = 21').get()).archived_at, null, 'nothing changed');
    const r = await same.merge(db, 20, 21, 'Ritvars', { mode: 'ticked' });
    assert.deepEqual(r.conflicts, [{ sender: 'AB', kept: 'invite · digital', dropped: 'no' }]);
    assert.deepEqual((await db.prepare('SELECT company_key, decision FROM tc_go_company_picks').all()).map((p) => [p.company_key, p.decision]), [['id:20', 'invite'], ['merged:id:21', 'no']], 'set aside, never deleted');
  } finally { cards.setStore(null); }
});
