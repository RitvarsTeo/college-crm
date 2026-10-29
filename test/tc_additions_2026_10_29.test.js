// OWNERSHIP AND NEW ADDITIONS (29.10.2026): the owner's picks - Make mine, additions go under the adder, the approvers
// (Ritvars, Aleksejs Bogdaņecs, Jānis Sticenko) approve or flag, Flag = hidden from lists until approved. Invented data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { openDb } = await import('../src/db.js');
const tc = await import('../src/tc.js');
const add = await import('../src/tcadd.js');
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MARCIS = { email: 'marcis.zabovs@novikontas.org', name: 'Mārcis Žabovs' };
const JANIS = { email: 'js@novikontas.org', name: 'Jānis Sticenko' };

test('the approvers are the three the owner named', () => {
  assert.deepEqual(add.APPROVERS.map((a) => a.email), ['ritvars.vilcins@novikontas.org', 'ab@novikontas.org', 'js@novikontas.org']);
  assert.equal(add.isApprover('JS@novikontas.org'), true);
  assert.equal(add.isApprover(MARCIS.email), false);
});

test('Make mine: the person in charge becomes the signed-in account, with a log line', async () => {
  const db = await openDb();
  const { id } = await tc.addCompany(db, { name: 'Example Shipping', country: 'Norway' }, 'Ritvars');
  await add.claim(db, id, MARCIS);
  const c = await db.prepare('SELECT pic_name, pic_email FROM tc_companies WHERE id = ?').get(id);
  assert.deepEqual([c.pic_name, c.pic_email], [MARCIS.name, MARCIS.email]);
  assert.ok((await db.prepare('SELECT body FROM tc_activities WHERE company_id = ?').all(id)).some((r) => r.body === 'Made mine'));
});

test('an addition goes under its adder and waits for an approver; an approver\'s own counts as approved', async () => {
  const db = await openDb();
  const a = await tc.addCompany(db, { name: 'Sample Offshore', country: 'Latvia' }, MARCIS.name);
  assert.deepEqual(await add.added(db, { kind: 'company', companyId: a.id }, MARCIS), { id: 1, toReview: true });
  assert.equal((await db.prepare('SELECT pic_email FROM tc_companies WHERE id = ?').get(a.id)).pic_email, MARCIS.email);
  const b = await tc.addCompany(db, { name: 'Demo Wind', country: 'Lithuania' }, JANIS.name);
  assert.equal((await add.added(db, { kind: 'company', companyId: b.id }, JANIS)).toReview, false);
  const L = await add.list(db);
  assert.deepEqual([L.toReview.length, L.approved.length, L.toReview[0].by], [1, 1, MARCIS.name]);
  assert.equal(await add.reviewCount(db), 1);
});

test('Flag hides the company from the lists (nothing deleted); Approve shows it again; only an approver decides', async () => {
  const db = await openDb();
  const a = await tc.addCompany(db, { name: 'Flag Me AS', country: 'Norway' }, MARCIS.name);
  const r = await add.added(db, { kind: 'company', companyId: a.id }, MARCIS);
  await assert.rejects(add.decide(db, r.id, 'flag', MARCIS), /Only an approver/);
  await add.decide(db, r.id, 'flag', JANIS);
  assert.ok(!(await tc.listCompanies(db, {}, { size: 500 })).rows.some((c) => c.name === 'Flag Me AS'), 'hidden');
  assert.ok(await db.prepare('SELECT id FROM tc_companies WHERE id = ?').get(a.id), 'still there');
  await add.decide(db, r.id, 'approve', JANIS);
  assert.ok((await tc.listCompanies(db, {}, { size: 500 })).rows.some((c) => c.name === 'Flag Me AS'), 'back');
  const k = await tc.addContact(db, a.id, { name: 'Olga Hidden', email: 'olga@flag-me.no' }, MARCIS.name);
  const rk = await add.added(db, { kind: 'contact', companyId: a.id, contactId: k.id }, MARCIS);
  await add.decide(db, rk.id, 'flag', JANIS);
  assert.ok(!(await tc.getCompany(db, a.id)).contacts.some((x) => x.name === 'Olga Hidden'), 'a flagged person is hidden on the company page');
});

test('the routes and the screens: Make mine, New additions tab for approvers, the email links to it', () => {
  const srv = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
  for (const r of ["/^\\/api\\/tc\\/companies\\/(\\d+)\\/mine$/", "'/api/tc/additions/count'", "'/api/tc/additions'", "/^\\/api\\/tc\\/additions\\/(\\d+)$/"]) assert.ok(srv.includes(r), r);
  assert.match(srv, /await tcAddedNotify\(req, \[\{ kind: 'company', companyId: out\.id \}\]\);/);
  assert.match(fs.readFileSync(path.join(ROOT, 'src', 'tcadd.js'), 'utf8'), /\$\{origin\}\/#\/tc\/additions/);
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  assert.match(app, /\+ Make mine<\/span>/);
  assert.match(app, /New additions to review · \$\{Number\(T_ADDN\.n\)\}/);
});
