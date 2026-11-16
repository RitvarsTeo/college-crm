// THE DOOR BY CARD (patch 148, 16.11.2026; concept DOOR_SCANNER_concept_2026-11-16.png; LOCKED "Invitation QR only"). The five
// screens' rules: a card of a company = first guest (piece) or already here (no second piece); a card no company has = link it
// on the spot (only a free card, only a company without a card); anything else = not our QR, find the guest by name.
// The card store is an in-memory stand-in with the rules of intake_go.card_link / card_link_code. Every name here is invented.
import test from 'node:test';
import assert from 'node:assert/strict';
const { openDb } = await import('../src/db.js');
const cards = await import('../src/tccards.js');
const door = await import('../src/tcdoor.js');
const { nameKey } = await import('../src/tc.js');

const at = new Date().toISOString();
function store() {
  const rows = [['abcdef', '14H'], ['bcdefg', '22M'], ['cdefgh', '1A']].map(([code, place]) => ({ code, place, company_key: null, company: null }));
  return {
    rows,
    async link() { throw new Error('not used'); },
    async all() { return rows.filter((r) => r.company_key); },
    async byCode(db, code) { return rows.find((r) => r.code === code) || null; },
    async linkCode(db, code, key, company) {
      const c = rows.find((r) => r.code === code);
      if (!c) throw new Error('card_link_code: no such card');
      if (c.company_key === key) return c;
      if (c.company_key) throw new Error('card_link_code: this card belongs to another company');
      if (rows.some((r) => r.company_key === key)) throw new Error('card_link_code: this company already has a card');
      Object.assign(c, { company_key: key, company });
      return c;
    },
  };
}
async function setup(t) {
  const st = store(); cards.setStore(st); t.after(() => cards.setStore(null));
  const db = await openDb();
  const co = async (name) => Number((await db.prepare(`INSERT INTO tc_companies (name, name_key, country, status, created_at) VALUES (?,?,?,?,?)`).run(name, nameKey(name), 'Latvia', 'not_contacted', at)).lastInsertRowid);
  const ex = await co('Example Company'), other = await co('Example Shipping BV'), third = await co('Example Crewing AS');
  await db.prepare(`INSERT INTO tc_company_contacts (company_id, name, email, ch_contact_id, created_at) VALUES (?,?,?,?,?)`).run(ex, 'Mark Jansen', 'mark@example-company.com', 'C1', at);
  st.rows[0].company_key = 'id:' + ex; st.rows[0].company = 'Example Company';
  st.rows[2].company_key = 'id:' + third; st.rows[2].company = 'Example Crewing AS';
  const regs = [
    { regKey: 'Q:1', source: 'page', chContactId: '', name: 'Anna Bērziņa', email: 'anna@example-company.com', company: 'Example Company', card: 'abcdef' },
    { regKey: 'L:x:1', source: 'link', chContactId: 'C1', name: 'Mark Jansen', email: 'mark@example-company.com', company: '', card: '' },
    { regKey: 'Q:2', source: 'page', chContactId: '', name: 'Olga Petrova', email: 'olga@else.com', company: 'Example Company', card: '' },
    { regKey: 'Q:3', source: 'page', chContactId: '', name: 'Someone Else', email: 'se@else.com', company: 'Other Ltd', card: '' },
  ];
  return { db, st, ex, other, third, regs };
}

test('the code from a scan: the whole card link or the 6 characters; anything else is not ours', () => {
  assert.equal(cards.codeFrom('https://novikontas.org/grand-opening?k=ABCDEF'), 'abcdef');
  assert.equal(cards.codeFrom('novikontas.org/grand-opening?gift&k=abcdef#x'), 'abcdef');
  assert.equal(cards.codeFrom(' abcdef '), 'abcdef');
  assert.equal(cards.codeFrom('GO27-K7M2Q9XR4T'), '', 'an old ticket is not a card');
  assert.equal(cards.codeFrom('https://novikontas.org/grand-opening?c=abc123'), '', 'a personal link is not a card');
  assert.equal(cards.codeFrom('abcdel'), '', 'l is not in the card alphabet');
  assert.deepEqual(cards.placeParts('14H'), { col: 14, row: 'H', rowNo: 8 });
  assert.equal(cards.placeParts('36A'), null); assert.equal(cards.placeParts('1W'), null);
});

test('screen 2: the first guest - company, piece 14H column 14 row H, the people registered by this card or this company', async (t) => {
  const { db, regs } = await setup(t);
  const v = await door.scan(db, 'https://novikontas.org/grand-opening?k=abcdef', regs);
  assert.equal(v.state, 'first'); assert.equal(v.company, 'Example Company'); assert.equal(v.place, '14H'); assert.equal(v.col, 14); assert.equal(v.row, 'H');
  assert.deepEqual(v.people.map((p) => p.name).sort(), ['Anna Bērziņa', 'Mark Jansen', 'Olga Petrova'], 'by card, by contact, by the company written; not Someone Else');
  assert.ok(v.people.every((p) => !p.here));
  assert.deepEqual(v.totals, { companies: 0, people: 0 });
});

test('screen 2 -> 3: the piece is handed over once; the next guest of the company gets no second piece', async (t) => {
  const { db, regs } = await setup(t);
  let v = await door.handOver(db, 'abcdef', regs, 'Door 1');
  assert.equal(v.state, 'here'); assert.ok(v.handedAt); assert.equal(v.handedBy, 'Door 1');
  const first = v.handedAt;
  v = await door.handOver(db, 'abcdef', regs, 'Door 2');
  assert.equal(v.handedAt, first, 'the second press changes nothing'); assert.equal(v.handedBy, 'Door 1');
  v = await door.scan(db, 'abcdef', regs);
  assert.equal(v.state, 'here');
  assert.deepEqual(v.totals, { companies: 1, people: 0 });
});

test('tick who is here, tick off again; only a person of this card; add a person not on the list (ticked)', async (t) => {
  const { db, regs } = await setup(t);
  const v0 = await door.scan(db, 'abcdef', regs);
  const anna = v0.people.find((p) => p.name === 'Anna Bērziņa').key;
  let v = await door.tick(db, 'abcdef', anna, true, regs, 'Door 1');
  assert.equal(v.people.find((p) => p.key === anna).here, true);
  assert.equal(v.totals.people, 1);
  v = await door.tick(db, 'abcdef', anna, false, regs, 'Door 1');
  assert.equal(v.people.find((p) => p.key === anna).here, false);
  await assert.rejects(door.tick(db, 'abcdef', 'R:Q:3', true, regs, 'Door 1'), /not on this card/);
  v = await door.addPerson(db, 'abcdef', '  Jonas   Example ', regs, 'Door 1');
  const jonas = v.people.find((p) => p.name === 'Jonas Example');
  assert.ok(jonas && jonas.here && jonas.added);
  await assert.rejects(door.addPerson(db, 'abcdef', 'x', regs, 'Door 1'), /Type the guest/);
});

test('screen 4: a card no company has - link THIS card to a company without a card, then its piece shows; refusals say why', async (t) => {
  const { db, regs, other, ex } = await setup(t);
  let v = await door.scan(db, 'bcdefg', regs);
  assert.equal(v.state, 'unlinked'); assert.equal(v.place, '22M');
  await assert.rejects(door.link(db, 'bcdefg', ex, regs, 'Door 1'), /already has its own card/);
  await assert.rejects(door.link(db, 'bcdefg', 99999, regs, 'Door 1'), /Pick a company/);
  v = await door.link(db, 'bcdefg', other, regs, 'Door 1');
  assert.equal(v.state, 'first'); assert.equal(v.company, 'Example Shipping BV'); assert.equal(v.place, '22M');
  await assert.rejects(door.link(db, 'abcdef', other, regs, 'Door 1'), /another company/);
});

test('screen 5: anything else is not ours; find the guest by name or company, with their card when there is one', async (t) => {
  const { db, regs } = await setup(t);
  for (const x of ['GO27-K7M2Q9XR4T', 'hello', 'zzzzzz', '']) assert.equal((await door.scan(db, x, regs)).state, 'notours', x);
  const f = await door.find(db, 'berzina', regs);
  assert.deepEqual(f.rows[0], { name: 'Anna Bērziņa', company: 'Example Company', card: 'abcdef' }, 'accents do not matter');
  assert.equal((await door.find(db, 'olga', regs)).rows[0].card, 'abcdef', 'her company has a card');
  assert.equal((await door.find(db, 'someone', regs)).rows[0].card, '', 'no card for this company');
  assert.ok((await door.find(db, 'crewing', regs)).rows.some((r) => r.company === 'Example Crewing AS' && r.card === 'cdefgh'), 'a company with a card by its name');
  assert.deepEqual((await door.find(db, 'a', regs)).rows, [], 'two letters at least');
});

test('without the registrations the door still works (no people listed); without the cards it says so', async (t) => {
  const { db } = await setup(t);
  const v = await door.scan(db, 'abcdef', null);
  assert.equal(v.state, 'first'); assert.deepEqual(v.people, []); assert.equal(v.registrations, false);
  cards.setStore(null);
  await assert.rejects(door.scan(db, 'abcdef', null), /not reachable/);
});

test('patch 153: a card held by a company NAME (no key) is that company at the door, never "not linked"', async (t) => {
  const { db, st, regs } = await setup(t);
  Object.assign(st.rows[1], { company_key: null, company: 'Riva Exploitatie B.V.' });   // 22M, linked by name only
  const v = await door.scan(db, 'bcdefg', regs);
  assert.equal(v.state, 'first'); assert.equal(v.company, 'Riva Exploitatie B.V.'); assert.equal(v.place, '22M');
  assert.deepEqual(v.people, [], 'nobody registered through this card yet');
  assert.equal((await door.handOver(db, 'bcdefg', regs, 'Door 1')).state, 'here', 'its piece can be handed over');
});
