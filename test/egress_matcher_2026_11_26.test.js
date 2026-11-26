// PATCH 187 (26.11.2026, database traffic): "is this a known person?" asks the database only for the candidates,
// never the whole people table and every contact. The answers must stay exactly what the whole-table matcher gave.
// Every person here is invented.
import test from 'node:test';
import assert from 'node:assert/strict';

const { openDb } = await import('../src/db.js');
const { contactMatcher, onePersonFor, findMatches } = await import('../src/identity.js');
const AT = '2026-11-26T08:00:00.000Z';

async function seed() {
  const db = await openDb();
  const add = (id, name, email, phone) => db.prepare(`INSERT INTO people (id, name, email, phone, status, owner, source_channel, created_at)
    VALUES (?,?,?,?,?,?,?,?)`).run(id, name, email, phone, 'New', 'Ritvars', 'gmail', AT);
  await add('p1', 'Anna Example', '  Anna.Example@Mail.example ', '+371 2042 3829');
  await add('p2', 'Ēriks Paraugs', 'eriks@sample.example', '(371) 26-111-222');
  await add('p3', 'Anna Example', null, null);
  await add('p4', 'Third Person', 'third_x@sample.example', '37120423829');
  await add('p5', 'Under Score', 'thirdax@sample.example', null);
  await add('p6', 'No Contact', '', '');
  const fv = (pid, field, value) => db.prepare(`INSERT INTO field_values (person_id, field, value, provenance, recorded_at) VALUES (?,?,?,'typed',?)`).run(pid, field, value, AT);
  await fv('p3', 'email', 'Second.Address@Demo.example');
  await fv('p3', 'phone', '+44 7700 900123');
  await fv('p6', 'phone', '29 99 88 77');
  return db;
}

const ASKS = [
  { email: 'anna.example@mail.example' }, { email: 'ANNA.EXAMPLE@MAIL.EXAMPLE' }, { phone: '20423829' }, { phone: '+37120423829' },
  { phone: '26111222' }, { email: 'second.address@demo.example' }, { phone: '07700900123' }, { phone: '29998877' },
  { email: 'third_x@sample.example' }, { email: 'thirdax@sample.example' }, { email: 'nobody@none.example', phone: '12345678' },
  { name: 'anna example' }, { name: 'Ēriks Paraugs', email: 'other@x.example' }, { email: 'edu@novikontas.org' }, { phone: '123' }, {},
];

test('the candidates-only matcher answers every question exactly like the whole-table matcher', async () => {
  const db = await seed();
  const whole = await contactMatcher(db);
  for (const a of ASKS) {
    const narrow = await contactMatcher(db, [a]);
    assert.deepEqual(narrow(a).map((m) => [m.id, m.matchedOn]), whole(a).map((m) => [m.id, m.matchedOn]), JSON.stringify(a));
  }
  const many = await contactMatcher(db, ASKS);
  for (const a of ASKS) assert.deepEqual(many(a).map((m) => m.id), whole(a).map((m) => m.id), 'all at once: ' + JSON.stringify(a));
  assert.equal((await onePersonFor(db, { phone: '20423829' })), null, 'two people share that phone: nobody');
  assert.equal((await onePersonFor(db, { email: 'Second.Address@demo.example' })).id, 'p3', 'an extra contact counts (Q77)');
  assert.deepEqual((await findMatches(db, { name: 'Anna Example' })).map((m) => m.id).sort(), ['p1', 'p3']);
});

test('a known-person question reads only candidate rows, never the whole people table', async () => {
  const db = await seed();
  const seen = [];
  const real = db.prepare.bind(db);
  db.prepare = (sql) => { const st = real(sql); const all = st.all.bind(st);
    st.all = async (...a) => { const rows = await all(...a); seen.push({ sql: sql.replace(/\s+/g, ' '), n: rows.length }); return rows; }; return st; };
  await onePersonFor(db, { email: 'eriks@sample.example', phone: '26111222' });
  assert.ok(seen.length > 0);
  assert.ok(!seen.some((s) => /FROM people$/.test(s.sql.trim())), 'no unfiltered people read');
  assert.ok(!seen.some((s) => /FROM field_values WHERE person_id IS NOT NULL AND field IN/.test(s.sql)), 'no whole-contacts read');
  assert.ok(seen.every((s) => s.n <= 2), 'only the candidate rows come back');
});
