// THE AREAS (19.10.2026): which half of Intake an account opens. The first boot keeps everybody's Academy and gives the
// admins both, ONCE; a later account is never granted by accident; every change is logged; manage_users needs --areas.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

for (const k of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'CRM_DB_DATABASE_URL_UNPOOLED']) process.env[k] = '';
const { openDb } = await import('../src/db.js');
const areas = await import('../src/areas.js');
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const user = (db, id, role) => db.prepare(`INSERT INTO crm_users (id, email, display_name, role, active, session_version, created_at)
  VALUES (?,?,?,?,1,0,?)`).run(id, id + '@novikontas.org', id, role, '2026-10-19T08:00:00Z');

test('first boot: every account keeps Academy, admins get Training Centre too; once, so a later account gets nothing', async () => {
  const db = await openDb();
  await user(db, 'boss', 'admin'); await user(db, 'clerk', 'user');
  const r = await areas.backfillAreas(db);
  assert.deepEqual(r, { ran: true, accounts: 2, granted: 3 });
  assert.deepEqual(await areas.areasOf(db, 'boss'), ['academy', 'tc']);
  assert.deepEqual(await areas.areasOf(db, 'clerk'), ['academy']);
  await user(db, 'later', 'admin');
  assert.deepEqual(await areas.backfillAreas(db), { ran: false });
  assert.deepEqual(await areas.areasOf(db, 'later'), [], 'never granted by accident');
  const log = await db.prepare('SELECT COUNT(*) AS n FROM crm_user_area_log').get();
  assert.equal(Number(log.n), 3, 'every grant is on the log');
});

test('setArea gives and takes one area, logs it, and does nothing when it is already so', async () => {
  const db = await openDb();
  await user(db, 'tcperson', 'user');
  assert.deepEqual(await areas.setArea(db, { userId: 'tcperson', area: 'tc', on: true, by: 'Admin' }), { changed: true });
  assert.deepEqual(await areas.setArea(db, { userId: 'tcperson', area: 'tc', on: true, by: 'Admin' }), { changed: false });
  await areas.setArea(db, { userId: 'tcperson', area: 'tc', on: false, by: 'Admin' });
  const list = await areas.accessList(db);
  assert.deepEqual(list.log.map((l) => [l.action, l.area, l.by]), [['revoke', 'tc', 'Admin'], ['grant', 'tc', 'Admin']]);
  assert.ok(!JSON.stringify(list).includes('password'), 'never a password or a hash');
  await assert.rejects(areas.setArea(db, { userId: 'tcperson', area: 'finance', on: true, by: 'A' }), /unknown area/);
  assert.deepEqual(areas.parseAreas('Academy, tc,x'), { areas: ['academy', 'tc'], bad: ['x'] });
});

test('the gate rule: shared paths need only a session, tc paths need tc, everything else academy', () => {
  const u = (list) => ({ areas: list });
  assert.equal(areas.areaAllows(u(['tc']), '/api/tc/companies'), true);
  assert.equal(areas.areaAllows(u(['tc']), '/api/people'), false);
  assert.equal(areas.areaAllows(u(['academy']), '/api/admin/tc/import'), false);
  assert.equal(areas.areaAllows(u([]), '/api/whoami'), true);
  assert.equal(areas.areaAllows(null, '/api/people'), false, 'no user, no area');
});

test('manage_users.mjs refuses to create an account without --areas and can change them', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'manage_users.mjs'), 'utf8');
  assert.match(src, /if \(!raw\) die\(`--areas is required/);
  const add = src.slice(src.indexOf("if (cmd === 'add')"), src.indexOf("if (cmd === 'password')"));
  assert.ok(add.indexOf('areasFlag(args)') > 0 && add.indexOf('areasFlag(args)') < add.indexOf('INSERT INTO crm_users'), 'checked before the account is made');
  assert.match(src, /if \(cmd === 'areas'\)/);
});
