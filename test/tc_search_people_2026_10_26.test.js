// SEARCH PEOPLE (26.10.2026): the owner's Client Hub pick 1, layout A, the Companies box also finds people. Every name,
// address and number here is invented.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { openDb } = await import('../src/db.js');
const tc = await import('../src/tc.js');
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const AT = '2026-10-26T08:00:00.000Z';

async function seeded() {
  const db = await openDb();
  const co = async (name, pic = null, archived = null) => Number((await db.prepare(`INSERT INTO tc_companies (name, name_key, status, pic_name, created_at, archived_at)
    VALUES (?,?,?,?,?,?)`).run(name, name.toLowerCase(), 'contacted', pic, AT, archived)).lastInsertRowid);
  const k = async (company, name, email, phone, archived = null) => Number((await db.prepare(`INSERT INTO tc_company_contacts
    (company_id, name, email, phone, created_at, archived_at) VALUES (?,?,?,?,?,?)`).run(company, name, email, phone, AT, archived)).lastInsertRowid);
  const a = await co('Example Shipping', 'Mārcis Žabovs');
  const b = await co('Sample Offshore');
  const gone = await co('Old Towage', null, AT);
  await k(a, 'Barbara Bławat', 'barbara@example.pl', '+48 605 345 550');
  await k(a, 'Anna Example', 'anna@example-shipping.com', null);
  await k(b, 'Joanna Sample', 'j.sample@sample-offshore.com', '+371 2000 1234');
  await k(b, 'Archived Anna', 'old@sample-offshore.com', null, AT);
  await k(gone, 'Anna Gone', 'anna@old-towage.com', null);
  return { db, a, b };
}

test('people are found by name (accents folded), email and phone digits; archived ones never', async () => {
  const { db, a, b } = await seeded();
  const names = async (q) => (await tc.searchPeople(db, q)).rows.map((r) => r.name);
  assert.deepEqual(await names('blawat'), ['Barbara Bławat'], 'no ł typed, still found');
  assert.deepEqual(await names('ANNA'), ['Anna Example', 'Joanna Sample'], 'any case; the archived contact and the archived company are left out');
  assert.deepEqual(await names('sample-offshore.com'), ['Joanna Sample']);
  assert.deepEqual(await names('2000 12'), ['Joanna Sample'], 'phone digits, spaces ignored');
  assert.deepEqual(await names('12'), [], 'two digits are too few for a phone');
  assert.deepEqual(await tc.searchPeople(db, 'a'), { total: 0, rows: [] }, 'one letter finds nothing');
  const r = (await tc.searchPeople(db, 'bławat')).rows[0];
  assert.deepEqual({ ...r, id: 0 }, { id: 0, name: 'Barbara Bławat', position: '', email: 'barbara@example.pl', phone: '+48 605 345 550', companyId: a, company: 'Example Shipping', pic: 'Mārcis Žabovs' });
  assert.equal((await tc.searchPeople(db, 'anna', { limit: 1 })).total, 2, 'the total counts every match; the list stops at the limit');
  assert.ok(b);
});

test('the page: the Companies box lists People under the companies; a person opens their company with the drawer open', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  assert.match(app, /placeholder="Search company, city, country or person"/);
  assert.match(app, /T_Q\.length >= 2 \? api\('\/api\/tc\/people\?q=' \+ encodeURIComponent\(T_Q\)\)/);
  assert.match(app, /\+ tcPeopleSheet\(\),/);
  assert.match(app, /href="#\/tc\/company\/\$\{Number\(k\.companyId\)\}" onclick="T_OPEN_CONTACT=\$\{Number\(k\.id\)\}"/);
  assert.match(app, /if \(T_OPEN_CONTACT\) \{ const k = T_OPEN_CONTACT; T_OPEN_CONTACT = null; tcContactOpen\(k\); \}/);
  const sheet = app.slice(app.indexOf('function tcPeopleSheet('), app.indexOf('function tcPeopleSheet(') + 1200);
  assert.doesNotMatch(sheet.replace(/esc\([^)]*\)/g, ''), /\$\{k\.(name|email|phone|position|company|pic)/, 'every value is escaped');
  const server = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
  assert.match(server, /if \(p === '\/api\/tc\/people' && req\.method === 'GET'\) return json\(res, 200, await tc\.searchPeople\(db, String\(url\.searchParams\.get\('q'\) \|\| ''\)\.slice\(0, 100\)\)\);/);
  const at = server.indexOf("'/api/tc/people'"), gate = server.indexOf('// ------------------------------------------------------- TRAINING CENTRE --');
  assert.ok(gate > 0 && at > gate, 'inside the Training Centre block, behind its gate');
});
