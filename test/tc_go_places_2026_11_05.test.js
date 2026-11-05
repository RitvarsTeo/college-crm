// THE PUZZLE PLACE ON YES AND THE PHYSICAL LIST (05.11.2026). Every company and person here is invented.
import test from 'node:test';
import assert from 'node:assert/strict';
const { openDb } = await import('../src/db.js');
const go = await import('../src/tcgo.js');

test('the 32 x 32 codes: 1,024, in the list order 1A..32A, 1B.., ending 32AF', () => {
  assert.equal(go.PLACE_CODES.length, 1024);
  assert.equal(new Set(go.PLACE_CODES).size, 1024);
  assert.deepEqual(go.PLACE_CODES.slice(0, 2), ['1A', '2A']);
  assert.equal(go.PLACE_CODES[32], '1B');
  assert.equal(go.PLACE_CODES.at(-1), '32AF');
  assert.equal(go.placeLink('13H'), 'https://novikontas.org/grand-opening?p=13H');
});

test('a Yes company gets the next free place, first Yes first; again changes nothing; maybe and no get none', async () => {
  const db = await openDb();
  const at = new Date().toISOString();
  const add = (id, company) => db.prepare(`INSERT INTO tc_go_stage2 (ch_contact_id, sender, name, company, position, country, email, gone, loaded_at, loaded_by)
    VALUES (?,?,?,?,?,?,?,0,?,?)`).run(id, 'JS', 'Person ' + id, company, '', 'Norway', id + '@example.com', at, 'test');
  await add('C1', 'Example Shipping AS'); await add('C2', 'Sample Marine'); await add('C3', 'EXAMPLE SHIPPING AS'); await add('C4', 'Other Ltd');
  const answers = [{ chContactId: 'C2', answer: 'yes', at: '2026-11-02T10:00:00Z' }, { chContactId: 'C1', answer: 'yes', at: '2026-11-03T10:00:00Z' },
    { chContactId: 'C3', answer: 'yes', at: '2026-11-04T10:00:00Z' }, { chContactId: 'C4', answer: 'maybe', at: '2026-11-01T10:00:00Z' }];
  const m = await go.placesForYes(db, answers);
  assert.deepEqual(m, { 'n:sample marine': '1A', 'n:example shipping as': '2A' });
  assert.deepEqual(await go.placesForYes(db, answers), m);
  await go.setGift(db, 'n:example shipping as', 'physical', 'Ritvars');
  const list = await go.physicalList(db, answers);
  assert.equal(list.length, 1);
  assert.equal(list[0].place, '2A'); assert.equal(list[0].yes, true); assert.equal(list[0].people.length, 2); assert.equal(list[0].lists, 'JS');
});
