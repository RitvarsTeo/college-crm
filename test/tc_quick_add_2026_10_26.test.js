// QUICK ADD (26.10.2026): the owner's Client Hub pick 2, layout A, "+ Someone I met" on Training Centre Home. Every
// company, name and address here is invented.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { openDb } = await import('../src/db.js');
const tc = await import('../src/tc.js');
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const AT = '2026-10-20T08:00:00.000Z';

async function seeded() {
  const db = await openDb();
  const a = (await tc.addCompany(db, { name: 'Example Shipping', country: 'Germany' }, 'Ritvars')).id;
  await tc.addContact(db, a, { name: 'Anna Example', email: 'anna@example.com' }, 'Ritvars');
  const ev = Number((await db.prepare(`INSERT INTO tc_events (name, kind, starts_on, created_at) VALUES (?,?,?,?)`).run('OEEC Amsterdam', 'exhibition', '2026-11-18', AT)).lastInsertRowid);
  await db.prepare(`INSERT INTO tc_events (name, kind, created_at) VALUES (?,?,?)`).run('WindEnergy Hamburg', 'exhibition', AT);
  await db.prepare(`INSERT INTO tc_events (name, kind, created_at) VALUES (?,?,?)`).run('Calendars and gifts', 'calendars', AT);
  return { db, a, ev };
}
const history = async (db, co) => (await db.prepare(`SELECT kind, body, actor, contact_id FROM tc_activities WHERE company_id = ? ORDER BY id`).all(co));

test('a new person on a picked company, met at an exhibition: one Exhibition line in its history, last contact moves', async () => {
  const { db, a, ev } = await seeded();
  const r = await tc.quickAdd(db, { companyId: a, name: 'Peter Example', position: 'HR', email: 'Peter@Example.com', eventId: ev, note: 'Wants the 2027 dates.' }, 'Ritvars');
  assert.deepEqual([r.companyId, r.newCompany, r.newContact], [a, false, true]);
  const k = await db.prepare('SELECT name, position, email FROM tc_company_contacts WHERE id = ?').get(r.contactId);
  assert.deepEqual({ ...k }, { name: 'Peter Example', position: 'HR', email: 'peter@example.com' });
  const last = (await history(db, a)).at(-1);
  assert.deepEqual([last.kind, last.body, last.actor, Number(last.contact_id)], ['exhibition', 'Met Peter Example at OEEC Amsterdam. Wants the 2027 dates.', 'Ritvars', r.contactId]);
  assert.ok((await db.prepare('SELECT last_contact_at FROM tc_companies WHERE id = ?').get(a)).last_contact_at);
});

test('a new company by name; an existing name is used, not doubled; a known email is the same person', async () => {
  const { db, a } = await seeded();
  const n = await tc.quickAdd(db, { newCompany: 'Sample Offshore', name: 'Olga Sample' }, 'Ritvars');
  assert.equal(n.newCompany, true);
  assert.equal((await db.prepare('SELECT name FROM tc_companies WHERE id = ?').get(n.companyId)).name, 'Sample Offshore');
  assert.equal((await history(db, n.companyId)).at(-1).body, 'Met Olga Sample.', 'Other: a physical meeting, no place named');
  assert.equal((await history(db, n.companyId)).at(-1).kind, 'physical_meeting');
  const same = await tc.quickAdd(db, { newCompany: 'Example Shipping', name: 'Anna Example', email: 'anna@example.com' }, 'Ritvars');
  assert.deepEqual([same.companyId, same.newCompany, same.newContact], [a, false, false], 'the company and the person already here are used');
  assert.equal(Number((await db.prepare('SELECT COUNT(*) AS n FROM tc_company_contacts WHERE company_id = ?').get(a)).n), 1);
  await tc.addCompany(db, { name: 'Example Shipping', country: 'Norway' }, 'Ritvars');
  await assert.rejects(tc.quickAdd(db, { newCompany: 'example shipping', name: 'Z' }, 'Ritvars'), /2 companies called "example shipping": pick one/);
});

test('refused: no company, nobody, a wrong address, a Season entry that is not an exhibition', async () => {
  const { db, a } = await seeded();
  await assert.rejects(tc.quickAdd(db, { name: 'X' }, 'Ritvars'), /Pick the company/);
  await assert.rejects(tc.quickAdd(db, { companyId: a }, 'Ritvars'), /needs a name, an email or a phone/);
  await assert.rejects(tc.quickAdd(db, { companyId: a, email: 'nope' }, 'Ritvars'), /does not look right/);
  await assert.rejects(tc.quickAdd(db, { companyId: a, name: 'X', eventId: 3 }, 'Ritvars'), /not in the Season/);
  assert.deepEqual((await tc.metEvents(db)).map((e) => e.name), ['OEEC Amsterdam', 'WindEnergy Hamburg'], 'exhibitions only, dated first');
});

test('the page: "+ Someone I met" on TC Home opens the drawer; the routes are behind the Training Centre gate', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  assert.match(app, /<div class="tc-homeacts"><button class="btn" onclick="tcMetOpen\(\)">\+ Someone I met<\/button>\$\{tcYearSel\(D\)\}<\/div>/);
  const fn = app.slice(app.indexOf('async function tcMetOpen('), app.indexOf('function tcMetClose('));
  assert.match(fn, /aria-label="Someone I met"/);
  for (const l of ['Company', 'Name', 'Position', 'Email', 'Phone', 'Where we met', 'Note']) assert.ok(fn.includes(`>${l}</label>`) || fn.includes(`'${l}'`), l);
  assert.match(fn, /onclick="tcMetWhere\(null\)">Other<\/button>/);
  assert.match(app, /await post\('\/api\/tc\/met', \{ companyId: T_MET\.companyId, newCompany: T_MET\.newCompany/);
  const server = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
  const gate = server.indexOf('// ------------------------------------------------------- TRAINING CENTRE --');
  for (const route of ["p === '/api/tc/met/events'", "p === '/api/tc/met' && req.method === 'POST'"]) assert.ok(server.indexOf(route) > gate && gate > 0, route);
});
