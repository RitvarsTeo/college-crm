// MY GRAND OPENING LIST (12.11.2026; his picks: folded tiles, "C1: tap a name", "Yes, build it"). Every person and company
// here is invented.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ROOT, start, session } from './security_helpers.js';
const { openDb } = await import('../src/db.js');
const ml = await import('../src/tcmylist.js');
const { nameKey } = await import('../src/tc.js');

const at = new Date().toISOString();
async function seed(db) {
  const co = async (name, country) => Number((await db.prepare(`INSERT INTO tc_companies (name, name_key, country, status, created_at) VALUES (?,?,?,?,?)`).run(name, nameKey(name), country, 'not_contacted', at)).lastInsertRowid);
  const a = await co('Alphaship Example AS', 'Norway');
  const row = async (sender, ch, name, company, email, companyId, position = '') => {
    const id = Number((await db.prepare(`INSERT INTO tc_go_stage2 (ch_contact_id, sender, name, first_name, company, position, country, email, link_code, gone, loaded_at, loaded_by)
      VALUES (?,?,?,?,?,?,?,?,?,0,?,?)`).run(ch, sender, name, name.split(' ')[0], company, position, 'Norway', email, 'ml' + ch, at, 'test')).lastInsertRowid);
    if (companyId) await db.prepare(`INSERT INTO tc_company_contacts (company_id, name, email, ch_contact_id, created_at) VALUES (?,?,?,?,?)`).run(companyId, name, email, ch, at);
    return id;
  };
  const p1 = await row('JS', 'ML1', 'Anna Example', 'Alphaship Example AS', 'anna@alphaship-example.com', a, 'Crew Manager');
  const p2 = await row('JS', 'ML2', 'Ben Example', 'Alphaship Example AS', 'ben@alphaship-example.com', a);
  const p3 = await row('JS', 'ML3', 'Alphaship - Riga', 'Alphaship Example AS', 'riga@alphaship-example.com', a);
  const p4 = await row('JS', 'ML4', 'Carla Example', 'Betaline Example', 'carla@betaline-example.com', null);
  const d1 = await row('DS', 'ML5', 'Dora Example', 'Gammaport Example', 'dora@gammaport-example.com', null);
  return { a, p1, p2, p3, p4, d1 };
}

test('who opens which list: the owner their own, an admin every list, nobody else; never a list that does not exist', () => {
  const js = { email: 'JS@novikontas.org' }, ds = { email: 'ds@novikontas.org' }, other = { email: 'someone@novikontas.org' };
  assert.equal(ml.ownCode(js), 'JS');
  assert.equal(ml.mayOpen(js, false, 'JS'), true);
  assert.equal(ml.mayOpen(js, false, 'DS'), false);
  assert.equal(ml.mayOpen(ds, false, 'JS'), false);
  assert.equal(ml.mayOpen(other, false, 'JS'), false);
  assert.equal(ml.mayOpen(null, false, 'JS'), false);
  assert.equal(ml.mayOpen(other, true, 'JS'), true);
  assert.equal(ml.mayOpen(other, true, 'NOPE'), false);
  assert.deepEqual(ml.openable(js, false), ['JS']);
  assert.deepEqual(ml.openable(other, false), []);
  assert.equal(ml.openable(other, true).length, 6);
});

test('the list: companies with their people, a shared mailbox shown as its address, the people figures', async () => {
  const db = await openDb();
  const { a, p3 } = await seed(db);
  const L = await ml.myList(db, 'JS');
  assert.equal(L.people, 4); assert.equal(L.companies, 2);
  assert.deepEqual(L.figures, { todo: 4, invite: 0, no: 0 });
  const g = L.groups[0];
  assert.equal(g.key, 'id:' + a); assert.equal(g.name, 'Alphaship Example AS'); assert.equal(g.people.length, 3);
  assert.equal(g.people.find((p) => p.id === p3).label, 'riga@alphaship-example.com');
  assert.equal(g.people.find((p) => p.label === 'Anna Example').position, 'Crew Manager');
  assert.ok(!L.groups.some((x) => x.people.some((p) => p.label === 'Dora Example')));   // DS's person is not on JS's list
  assert.equal(ml.personLabel('', 'X', 'x@example.com'), 'x@example.com');
  await db.prepare("UPDATE tc_companies SET country = 'TOTAL' WHERE id = ?").run(a);
  assert.equal((await ml.myList(db, 'JS')).groups[0].country, 'Norway');   // a group row's TOTAL is not a country
  assert.equal(ml.personLabel('Anna Example', 'Alphaship Example AS', 'a@example.com'), 'Anna Example');
});

test('one Invite / No per company; a tapped name is left out of the invitation; the way only after Invite; every result kept', async () => {
  const db = await openDb();
  const { a, p1, p2, p4, d1 } = await seed(db);
  const key = 'id:' + a;
  let L = await ml.decide(db, 'JS', key, 'invite', 'Jānis Sticenko');
  assert.deepEqual(L.figures, { todo: 1, invite: 3, no: 0 });
  L = await ml.toggleOut(db, 'JS', p2, 'Jānis Sticenko');
  assert.deepEqual(L.figures, { todo: 1, invite: 2, no: 1 });
  assert.equal(L.groups.find((g) => g.key === key).people.find((p) => p.id === p2).out, true);
  await assert.rejects(ml.setWay(db, 'JS', 'n:' + nameKey('Betaline Example'), 'post', 'J'), /Invite the company first/);
  L = await ml.setWay(db, 'JS', key, 'in_person', 'Jānis Sticenko');
  assert.equal(L.groups.find((g) => g.key === key).way, 'in_person');
  await assert.rejects(ml.setWay(db, 'JS', key, 'pigeon', 'J'), /Digital, in person or by post/);
  L = await ml.toggleOut(db, 'JS', p2, 'Jānis Sticenko');   // back in
  assert.deepEqual(L.figures, { todo: 1, invite: 3, no: 0 });
  L = await ml.decide(db, 'JS', 'n:' + nameKey('Betaline Example'), 'no', 'Jānis Sticenko');
  assert.deepEqual(L.figures, { todo: 0, invite: 3, no: 1 });
  L = await ml.decide(db, 'JS', key, 'invite', 'Jānis Sticenko');   // the same button again clears it, and the way with it
  assert.equal(L.groups.find((g) => g.key === key).decision, null);
  assert.deepEqual(L.figures, { todo: 3, invite: 0, no: 1 });
  await assert.rejects(ml.toggleOut(db, 'JS', d1, 'J'), /not on this list/);   // another owner's person
  await assert.rejects(ml.decide(db, 'JS', 'id:999999', 'invite', 'J'), /not on this list/);
  const log = await db.prepare('SELECT stage2_id, decision, way, by_name FROM tc_go_decision_log WHERE stage2_id = ? ORDER BY id').all(p1);
  assert.ok(log.length >= 4 && log.every((r) => r.by_name === 'Jānis Sticenko'));
  assert.deepEqual(log.slice(0, 3).map((r) => r.decision), ['invite', 'invite', 'invite']);
  assert.equal(log.find((r) => r.way === 'in_person').decision, 'invite');
  assert.equal(Number((await db.prepare('SELECT COUNT(*) AS n FROM tc_go_s2_sent').get()).n), 0);   // nothing is sent from here
  assert.ok(p4);
});

test('over the wire: an owner opens and changes only their own list, an admin any; signed out nothing', async (t) => {
  const keep = {};
  for (const k of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'CRM_DB_DATABASE_URL_UNPOOLED', 'INTAKE_DATABASE_URL']) { keep[k] = process.env[k]; process.env[k] = ''; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-mylist-'));
  const file = path.join(dir, 'ml.db');
  const db = await openDb(file);
  const ids = await seed(db);
  for (const [id, email, role] of [['u_js', 'js@novikontas.org', 'user'], ['u_ds', 'ds@novikontas.org', 'user'], ['u_ad', 'ritvars.vilcins@novikontas.org', 'admin']]) {
    await db.prepare(`INSERT INTO crm_users (id, email, display_name, password_hash, role, active, session_version, created_at) VALUES (?,?,?,NULL,?,1,0,?)`).run(id, email, id, role, at);
    await db.prepare('INSERT INTO crm_user_areas (user_id, area, granted_at, granted_by) VALUES (?,?,?,?)').run(id, 'tc', at, 'test');
  }
  await db.prepare('INSERT INTO sync_state (name, value, ran_at) VALUES (?,?,?)').run('areas_backfill_2026_10', 'done', at);
  await db.close();
  for (const [k, v] of Object.entries(keep)) process.env[k] = v ?? '';
  const s = await start({ CRM_DB: file, DATASET: 'empty', CRM_RITVARS_PASSWORD: '', CRM_AIGARS_PASSWORD: '', CRM_ADMISSIONS_PASSWORD: '' });
  t.after(() => { s.child.kill(); });
  const js = session('js@novikontas.org', 'user'), ad = session('ritvars.vilcins@novikontas.org', 'admin');
  const get = (p, cookie) => fetch(s.base + p, { headers: cookie ? { cookie } : {} });
  const post = (p, cookie, b) => fetch(s.base + p, { method: 'POST', headers: { origin: s.base, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(b) });
  assert.deepEqual((await (await get('/api/tc/go/mylist', js)).json()).lists, ['JS']);
  assert.equal((await get('/api/tc/go/mylist?sender=JS', js)).status, 200);
  assert.equal((await get('/api/tc/go/mylist?sender=DS', js)).status, 403);
  assert.equal((await post('/api/tc/go/mylist/decide', js, { sender: 'DS', key: 'n:' + nameKey('Gammaport Example'), decision: 'invite' })).status, 403);
  assert.equal((await post('/api/tc/go/mylist/out', js, { sender: 'JS', id: ids.d1 })).status, 400);   // DS's person through JS's list
  assert.equal((await post('/api/tc/go/mylist/decide', js, { sender: 'JS', key: 'id:' + ids.a, decision: 'invite' })).status, 200);
  assert.equal((await get('/api/tc/go/mylist?sender=DS', ad)).status, 200);
  assert.notEqual((await get('/api/tc/go/mylist?sender=JS')).status, 200);   // signed out
  assert.notEqual((await post('/api/tc/go/mylist/decide', null, { sender: 'JS', key: 'id:' + ids.a, decision: 'no' })).status, 200);
});

test('the screen: folded tiles, Show people, one Invite / No, the three ways after Invite, no button per person', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  assert.ok(app.includes("else if (place === 'mylist') viewTcMyList(arg);"));
  assert.ok(app.includes('Show people ▾') && app.includes('Hide people ▴') && app.includes("[['digital', 'Digital'], ['in_person', 'In person'], ['post', 'By post']]"));
  const draw = app.slice(app.indexOf('function tcMlDraw() {'), app.indexOf('function tcMlFold('));
  assert.ok(draw.includes('onclick="tcMlOut(${Number(p.id)})"') && !/Invite<\/button>[^]*tcMlOut/.test(draw.slice(draw.indexOf('tcml-ppl'), draw.indexOf('tcml-yn'))));
});
