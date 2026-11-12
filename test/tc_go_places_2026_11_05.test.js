// PLACE CODES OUT (12.11.2026, his pick "Yes, build it"; they came in 05.11.2026) AND THE PHYSICAL LIST, ONE ROW PER MOTHER
// COMPANY. Every company and person here is invented.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { openDb } = await import('../src/db.js');
const go = await import('../src/tcgo.js');

test('12.11 place codes are out: no place list, no place link, no place at the door, nothing gives a place; the Stage 2 list writes nothing when it is read', () => {
  for (const k of ['PLACE_CODES', 'placeLink', 'placeMap', 'placesForYes', 'placeFromText', 'doorCard', 'checkIn', 'yesCompanies']) assert.equal(go[k], undefined, k);
  const srv = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
  assert.ok(!srv.includes('placesForYes') && !srv.includes('tcgo.doorCard') && !srv.includes('tcgo.checkIn'));
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  assert.ok(app.includes(`\${yes ? '<span class="tcs2-yes">✓ Yes</span>' : ''}`), 'Stage 2 tiles: ✓ Yes only');
  assert.ok(!app.includes('T_S2.places') && !app.includes('Place code, like 13H'));
  for (const f of ['tcgomail.js', 'tctickets.js']) assert.ok(!fs.readFileSync(path.join(ROOT, 'src', f), 'utf8').includes('placeLink'), f);
});

test('the physical list: one row per mother company, no place column; a branch in a family counts under its mother; Yes and the people of all its companies', async () => {
  const db = await openDb();
  const at = new Date().toISOString();
  const co = async (name) => Number((await db.prepare('INSERT INTO tc_companies (name, name_key, country, address, status, created_at) VALUES (?,?,?,?,?,?)').run(name, (await import('../src/tc.js')).nameKey(name), 'Norway', name === 'Mother Example AS' ? 'Harbour 1' : null, 'not_contacted', at)).lastInsertRowid);
  const mother = await co('Mother Example AS'), branch = await co('Branch Example AS');
  const fam = Number((await db.prepare('INSERT INTO tc_families (parent_id, created_at) VALUES (?,?)').run(mother, at)).lastInsertRowid);
  await db.prepare('INSERT INTO tc_family_members (family_id, company_id, added_at) VALUES (?,?,?)').run(fam, branch, at);
  const add = async (ch, sender, company, companyId) => {
    await db.prepare(`INSERT INTO tc_go_stage2 (ch_contact_id, sender, name, company, position, country, email, gone, loaded_at, loaded_by) VALUES (?,?,?,?,?,?,?,0,?,?)`)
      .run(ch, sender, 'Person ' + ch, company, 'Crew', 'Norway', ch.toLowerCase() + '@example.com', at, 'test');
    if (companyId) await db.prepare('INSERT INTO tc_company_contacts (company_id, name, email, ch_contact_id, created_at) VALUES (?,?,?,?,?)').run(companyId, 'Person ' + ch, ch.toLowerCase() + '@example.com', ch, at);
  };
  await add('P1', 'JS', 'Mother Example AS', mother); await add('P2', 'MC', 'Branch Example AS', branch); await add('P3', 'JS', 'Other Example Ltd', null);
  await go.setGift(db, 'id:' + branch, 'physical', 'Ritvars');   // the branch's tile set to Physical
  const list = await go.physicalList(db, [{ chContactId: 'P2', answer: 'yes' }]);
  assert.equal(list.length, 1);
  assert.equal(list[0].company, 'Mother Example AS'); assert.equal(list[0].address, 'Harbour 1');
  assert.equal(list[0].people.length, 2); assert.equal(list[0].yes, true); assert.equal(list[0].lists, 'JS, MC');
  assert.equal(list[0].place, undefined);
  const srv = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
  assert.ok(srv.includes("[['Company', 'Answered Yes', 'List', 'People', 'Positions', 'Emails', 'Address', 'City', 'Country'],"));
});
