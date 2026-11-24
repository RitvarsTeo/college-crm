// OWNERSHIP (29.10.2026): the owner's picks - Make mine, a company added by hand goes under its adder. The New additions tab, its
// approvals, flags and email were removed (patch 178, his words 24.11.2026 "also remove the tab new additions, doesnt make sense").
// Invented data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { openDb } = await import('../src/db.js');
const tc = await import('../src/tc.js');
const add = await import('../src/tcadd.js');
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SALES = { email: 'sales.person@example.lv', name: 'Sales Person' };
const OTHER = { email: 'other.person@example.lv', name: 'Other Person' };

test('Make mine: the person in charge becomes the signed-in account, with a log line', async () => {
  const db = await openDb();
  const { id } = await tc.addCompany(db, { name: 'Example Shipping', country: 'Norway' }, 'Ritvars');
  await add.claim(db, id, SALES);
  const c = await db.prepare('SELECT pic_name, pic_email FROM tc_companies WHERE id = ?').get(id);
  assert.deepEqual([c.pic_name, c.pic_email], [SALES.name, SALES.email]);
  assert.ok((await db.prepare('SELECT body FROM tc_activities WHERE company_id = ?').all(id)).some((r) => r.body === 'Made mine'));
});

test('a company added by hand goes under its adder; one with somebody in charge keeps them; nothing waits for an approver any more', async () => {
  const db = await openDb();
  const a = await tc.addCompany(db, { name: 'Sample Offshore', country: 'Latvia' }, SALES.name);
  await add.added(db, { kind: 'company', companyId: a.id }, SALES);
  assert.equal((await db.prepare('SELECT pic_email FROM tc_companies WHERE id = ?').get(a.id)).pic_email, SALES.email);
  await add.added(db, { kind: 'contact', companyId: a.id }, OTHER);
  assert.equal((await db.prepare('SELECT pic_email FROM tc_companies WHERE id = ?').get(a.id)).pic_email, SALES.email, 'the one in charge stays');
  assert.equal(Number((await db.prepare('SELECT COUNT(*) n FROM tc_additions').get()).n), 0, 'no review queue');
});

test('patch 178: the New additions and Same company? tabs, routes and email are gone; Make mine stays', () => {
  const srv = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
  assert.ok(srv.includes("/^\\/api\\/tc\\/companies\\/(\\d+)\\/mine$/"), 'Make mine');
  for (const gone of ["'/api/tc/additions", '/api\\/tc\\/additions', "'/api/tc/same'", '/api\\/tc\\/same', 'notify.sendMail(db, { to, subject: mail.subject']) assert.ok(!srv.includes(gone), 'gone: ' + gone);
  assert.match(srv, /await tcAddedNotify\(req, \[\{ kind: 'company', companyId: out\.id \}\]\);/);
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  assert.match(app, /\+ Make mine<\/span>/);
  for (const gone of ['New additions', '#/tc/additions', 'Same company?', '#/tc/same', 'viewTcSame', 'T_ADDN']) assert.ok(!app.includes(gone), 'gone: ' + gone);
  assert.deepEqual(Object.keys(add).sort(), ['added', 'claim']);
});
