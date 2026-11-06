// THE PUZZLE PLACE ON YES AND THE PHYSICAL LIST (05.11.2026). Every company and person here is invented.
import test from 'node:test';
import assert from 'node:assert/strict';
const { openDb } = await import('../src/db.js');
const go = await import('../src/tcgo.js');

test('06.11 his pick B: the 45 x 25 codes, 1,125, in the list order 1A..45A, 1B.., ending 45Y', () => {
  assert.equal(go.PLACE_CODES.length, 1125);
  assert.equal(new Set(go.PLACE_CODES).size, 1125);
  assert.deepEqual(go.PLACE_CODES.slice(0, 2), ['1A', '2A']);
  assert.equal(go.PLACE_CODES[45], '1B');
  assert.equal(go.PLACE_CODES.at(-1), '45Y');
  assert.ok(go.PLACE_CODES.includes('1A') && go.PLACE_CODES.includes('13H') && !go.PLACE_CODES.includes('32AF'));
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

test('check-in at the door: the QR link or the code finds the place; Arrived with a count; again updates it', async () => {
  const db = await openDb();
  assert.equal(go.placeFromText('https://novikontas.org/grand-opening?p=13H'), '13H');
  assert.equal(go.placeFromText(' 13h '), '13H');
  assert.equal(go.placeFromText('46A'), ''); assert.equal(go.placeFromText('1Z'), ''); assert.equal(go.placeFromText('45y'), '45Y');
  assert.equal(go.placeFromText('https://evil.example/?p=1A&x'), '1A');
  await assert.rejects(go.doorCard(db, 'hello'), /not a place code/);
  const at = new Date().toISOString();
  await db.prepare(`INSERT INTO tc_go_stage2 (ch_contact_id, sender, name, company, position, country, email, gone, loaded_at, loaded_by) VALUES (?,?,?,?,?,?,?,0,?,?)`)
    .run('D1', 'MC', 'Anna Example', 'Door Example AS', '', 'Norway', 'd1@example.com', at, 'test');
  const answers = [{ chContactId: 'D1', answer: 'yes', people: 2, at }];
  const places = await go.placesForYes(db, answers);
  const code = places['n:door example as'];
  let c = await go.doorCard(db, code, answers);
  assert.equal(c.company, 'Door Example AS'); assert.equal(c.expected, 2); assert.equal(c.arrived, null);
  await go.checkIn(db, code, 2, 'Ritvars');
  await go.checkIn(db, code, 3, 'Ritvars');
  c = await go.doorCard(db, code, answers);
  assert.equal(Number(c.arrived.people), 3); assert.equal(c.totals.companies, 1); assert.equal(c.totals.people, 3);
  await assert.rejects(go.checkIn(db, code, 0, 'Ritvars'), /How many/);
});
