// A GROUP'S TOTAL ROW IS COUNTED ONCE (the owner, 20.10.2026). The Excel import holds a few groups twice: each subsidiary,
// and once more a company with country "TOTAL" whose delegates repeat the subsidiaries'. Every Training Centre figure that
// sums or counts leaves that row out; the row itself stays, unchanged and openable, and the search finds it. Invented names.
import test from 'node:test';
import assert from 'node:assert/strict';

for (const k of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'CRM_DB_DATABASE_URL_UNPOOLED']) process.env[k] = '';
const { openDb } = await import('../src/db.js');
const tc = await import('../src/tc.js');

async function world() {
  const db = await openDb();
  const add = (name, country, extra = {}) => tc.addCompany(db, { name, country, status: 'contacted', areas: ['TC'], ...extra }, 'T').then((r) => r.id);
  const nl = await add('Example Dredging BV', 'Netherlands');
  const de = await add('Example Dredging GmbH', 'Germany');
  const group = await add('Example Dredging Group', 'TOTAL');
  const lone = await add('Sample Towage AS', 'Norway', { status: 'not_contacted' });
  await tc.setCourseYear(db, nl, { year: 2025, attendees: 40 }, 'T');
  await tc.setCourseYear(db, de, { year: 2025, attendees: 25 }, 'T');
  await tc.setCourseYear(db, group, { year: 2025, attendees: 65 }, 'T');   // the same 65 delegates again
  await tc.setCourseYear(db, group, { year: 2024, attendees: 10 }, 'T');
  return { db, nl, de, group, lone };
}

test('Home: the TOTAL row adds no company, client, country or delegate', async () => {
  const { db } = await world();
  const h = await tc.home(db);
  assert.equal(h.cards.companies, 3);
  assert.equal(h.cards.activeClients, 2);
  assert.equal(h.cards.prospects, 1);
  assert.equal(h.cards.countries, 3, 'TOTAL is not a country');
  assert.equal(h.cards.delegates.total, 65);
  assert.deepEqual(h.cards.delegates.byYear, [{ year: 2025, n: 65 }], 'not 130, and no 2024 from the TOTAL row');
  assert.ok(tc.isTotalRow(' total ') && tc.isTotalRow('TOTAL') && !tc.isTotalRow('Totalia') && !tc.isTotalRow(''));
});

test('the lists: counted nowhere, found by the search, opened unchanged', async () => {
  const { db, group } = await world();
  const all = await tc.listCompanies(db, {}, { size: 2000 });
  assert.equal(all.total, 3);
  assert.ok(!all.rows.some((c) => c.id === group));
  assert.equal(all.counts.status.contacted, 2);
  assert.ok(!all.facets.countries.some(([c]) => c === 'TOTAL'), 'not offered as a country');
  assert.deepEqual(all.facets.areas.find(([a]) => a === 'TC'), ['TC', 3]);
  const clients = await tc.listCompanies(db, { client: 'yes' }, { size: 2000 });
  assert.equal(clients.total, (await tc.home(db)).cards.activeClients, 'Clients and its count on Home agree');
  const found = await tc.listCompanies(db, { q: 'dredging group' }, { size: 2000 });
  assert.deepEqual(found.rows.map((c) => c.id), [group], 'the search finds it');
  const c = await tc.getCompany(db, group);
  assert.deepEqual([c.name, c.country, c.delegates, c.client], ['Example Dredging Group', 'TOTAL', 75, true], 'its own page is unchanged');
  assert.ok(!(await tc.meta(db)).countries.includes('TOTAL'), 'Add company never suggests TOTAL as a country');
});

test('its work stays: a next contact on a TOTAL row is still in Needs you and Next contacts', async () => {
  const { db, group } = await world();
  await tc.setNext(db, group, { due: '2030-03-02' }, 'T');
  const h = await tc.home(db);
  assert.equal(h.next.total, 1);
  assert.ok((await tc.nextList(db, {})).rows.some((r) => r.companyId === group));
});
