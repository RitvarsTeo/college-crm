// FIX AN ADDRESS THAT BOUNCED (28.10.2026, src/tcgo.js): the owner's pick A, fix in Intake, the send picks up a file;
// Intake writes nothing into Client Hub. Every name, company, address and id here is invented.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { openDb } = await import('../src/db.js');
const go = await import('../src/tcgo.js');
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const AT = '2026-10-28T08:00:00.000Z';

async function seeded() {
  const db = await openDb();
  const co = async (name, pic) => Number((await db.prepare(`INSERT INTO tc_companies (name, name_key, status, pic_name, created_at) VALUES (?,?,?,?,?)`)
    .run(name, name.toLowerCase(), 'contacted', pic, AT)).lastInsertRowid);
  const a = await co('Example Shipping', 'Mārcis Žabovs'), b = await co('Sample Offshore', null);
  const k = async (company, name, email, ch) => Number((await db.prepare(`INSERT INTO tc_company_contacts (company_id, name, email, ch_contact_id, created_at) VALUES (?,?,?,?,?)`)
    .run(company, name, email, ch, AT)).lastInsertRowid);
  const k1 = await k(a, 'Anna Example', 'anna@exampl-shipping.com', 'C1');
  const k2 = await k(b, 'Olga Sample', 'olga@sample-offshore.com', null);
  const g = async (ch, email, invitation) => Number((await db.prepare(`INSERT INTO tc_go_guests (ch_contact_id, ch_company, email_sha, invitation, imported_at) VALUES (?,?,?,?,?)`)
    .run(ch, 'X', go.emailSha(email), invitation, AT)).lastInsertRowid);
  return { db, a, b, k1, k2, g1: await g('C1', 'anna@exampl-shipping.com', 'bounced_hard'), g2: await g('C2', 'olga@sample-offshore.com', 'bounced_soft'),
    g3: await g('C3', 'ivan@demowind.lt', 'bounced_hard'), g4: await g('C4', 'peter@example.com', 'reached') };
}

test('the list: not reached people Intake holds as a contact, by person in charge, Mine; the rest only Client Hub has', async () => {
  const { db, g1, g2, a } = await seeded();
  const L = await go.bounceList(db, { email: 'marcis.zabovs@novikontas.org', name: 'Mārcis Žabovs' });
  assert.deepEqual([L.total, L.onlyCh, L.waiting], [2, 1, 0], 'G1 by its Client Hub id, G2 by its address; G3 only Client Hub has; G4 was reached');
  assert.deepEqual(L.rows.map((r) => [r.guestId, r.pic, r.mine, r.hard, r.why]),
    [[g1, 'Mārcis Žabovs', true, true, 'Address does not work'], [g2, '', false, false, 'Refused, can be tried again']], 'a person in charge first, nobody yet last');
  assert.equal(L.rows[0].companyId, a);
  assert.equal(L.rows[0].email, 'anna@exampl-shipping.com');
  assert.deepEqual((await go.bounceList(db, null)).rows.map((r) => r.mine), [false, false], 'nobody signed in: nothing is mine');
});

test('a fix: the contact takes the new address (logged), keeps its Client Hub id, and waits for the next send until Client Hub carries it', async () => {
  const { db, g2, g3, g4, k2, b } = await seeded();
  await assert.rejects(go.bounceFix(db, g2, 'not an address', 'Ritvars'), /does not look right/);
  await assert.rejects(go.bounceFix(db, g2, 'OLGA@sample-offshore.com', 'Ritvars'), /already has/);
  await assert.rejects(go.bounceFix(db, g3, 'ivan@demo-wind.lt', 'Ritvars'), /fixed in Client Hub/);
  await db.prepare(`INSERT INTO tc_company_contacts (company_id, name, email, created_at) VALUES (?,?,?,?)`).run(b, 'Peter Sample', 'peter@sample-offshore.com', AT);
  await assert.rejects(go.bounceFix(db, g2, 'peter@sample-offshore.com', 'Ritvars'), /Another contact of this company/);
  await assert.rejects(go.bounceFix(db, g4, 'peter@example.org', 'Ritvars'), /not on the not reached list/);
  assert.equal(Number((await db.prepare('SELECT COUNT(*) AS n FROM tc_go_fixes').get()).n), 0, 'a refused fix writes nothing');
  assert.deepEqual(await go.bounceFix(db, g2, ' Olga@Sample-Offshore.lv ', 'Ritvars'), { guestId: g2, fixed: 'olga@sample-offshore.lv' });
  const k = await db.prepare('SELECT email, ch_contact_id FROM tc_company_contacts WHERE id = ?').get(k2);
  assert.deepEqual([k.email, k.ch_contact_id], ['olga@sample-offshore.lv', 'C2']);
  const log = await db.prepare(`SELECT field, old_value, new_value, actor FROM tc_activities WHERE company_id = ? AND field = 'contact_email'`).get(b);
  assert.deepEqual([log.old_value, log.new_value, log.actor], ['olga@sample-offshore.com', 'olga@sample-offshore.lv', 'Ritvars']);
  const L = await go.bounceList(db, null);
  const row = L.rows.find((r) => r.guestId === g2);
  assert.deepEqual([row.fixed, row.email, L.waiting], ['olga@sample-offshore.lv', 'olga@sample-offshore.com', 1], 'still on the list, the old address beside the fix');
  assert.deepEqual((await go.bounceWaiting(db)).map((r) => [r.chContactId, r.oldEmail, r.newEmail, r.fixedBy]), [['C2', 'olga@sample-offshore.com', 'olga@sample-offshore.lv', 'Ritvars']]);
  // as an import does it (src/tcgo.js applyImport): the new address, its updated_at and a line in the import log
  await db.prepare('UPDATE tc_go_guests SET email_sha = ?, updated_at = ? WHERE id = ?').run(go.emailSha('olga@sample-offshore.lv'), '2026-10-29T08:00:00.000Z', g2);
  await db.prepare("INSERT INTO tc_go_imports (hash, counts, applied_at, applied_by) VALUES ('h2', '{}', '2026-10-29T08:00:00.000Z', 'Ritvars')").run();
  assert.equal((await go.bounceList(db, null)).waiting, 0, 'the next extract carries the new address: no longer waiting');
  assert.deepEqual(await go.bounceWaiting(db), []);
});

test('the page: Stage 1 under the three boxes, Mine / Team, the waiting file; the routes are behind the gate', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  const draw = app.slice(app.indexOf('function tcGoDraw('), app.indexOf('function tcGoStrip('));
  const iBoxes = draw.indexOf('tcgo-boxes'), iFix = draw.indexOf('<div id="tcFix">${tcFixHtml()}</div>'), i2 = draw.indexOf('Stage 2 · RSVP');
  assert.ok(iBoxes > 0 && iBoxes < iFix && iFix < i2, 'in Stage 1, after Not reached / Not in the invitation / Add to Calendar');
  const fn = app.slice(app.indexOf('function tcFixHtml('), app.indexOf('async function tcFixSave('));
  for (const t of ['Fix an address that bounced · ', 'Fixed, waiting for the next send · ', 'Intake writes nothing into Client Hub.', 'not reached only Client Hub has: fixed there, as today.', 'Nobody yet'])
    assert.ok(fn.includes(t), t);
  assert.match(fn, /\[\['mine', 'Mine'\], \['team', 'Team'\]\]/);
  assert.match(fn, /<a class="btn sm ghost" href="\/api\/tc\/go\/bounced\.xlsx" download>Download<\/a>/);
  assert.doesNotMatch(fn, /\b(late|overdue|failed|wrong|bad)\b/i, 'nothing reads as blame');
  const server = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
  const gate = server.indexOf('// ------------------------------------------------------- TRAINING CENTRE --');
  for (const route of ["p === '/api/tc/go/bounced' && req.method === 'GET'", "p === '/api/tc/go/bounced' && req.method === 'POST'", "p === '/api/tc/go/bounced.xlsx' && req.method === 'GET'"])
    assert.ok(server.indexOf(route) > gate && gate > 0, route);
  assert.match(server, /console\.log\(`tc download: \$\{me \? me\.email \|\| me\.name : 'unknown'\} fixed addresses/);
});

test('the lighter pages (29.10.2026): the company list and the guests are reused only while nothing they come from has changed', async () => {
  const tc = await import('../src/tc.js');
  const db = await openDb();
  const a = (await tc.addCompany(db, { name: 'Example Shipping', country: 'Latvia' }, 'Ritvars')).id;
  assert.equal((await tc.listCompanies(db, {}, { size: 10 })).rows[0].status, 'not_contacted');
  await tc.editCompany(db, a, { status: 'contacted' }, 'Ritvars');
  assert.equal((await tc.listCompanies(db, {}, { size: 10 })).rows[0].status, 'contacted', 'an edit shows at once');
  await tc.setNext(db, a, { due: '2026-11-03', label: 'Call' }, 'Ritvars');
  await tc.setNext(db, a, { due: '2026-11-05', label: 'Call' }, 'Ritvars');
  assert.equal((await tc.nextList(db, {})).rows[0].due, '2026-11-05', 'a moved date shows at once (no timestamp on the task)');
  const app = fs.readFileSync(path.join(ROOT, 'src', 'tc.js'), 'utf8');
  assert.match(app, /CASE WHEN TRIM\(COALESCE\(info_to_send, ''\)\) <> '' THEN 1 ELSE 0 END AS info_flag/, 'the text to send stays in the database');
  const fam = fs.readFileSync(path.join(ROOT, 'src', 'tcfam.js'), 'utf8');
  assert.match(fam, /AS web_domain FROM tc_companies/, 'families read only the web domain');
});
