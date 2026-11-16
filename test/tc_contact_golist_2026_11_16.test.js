// A CONTACT STRAIGHT ONTO A GRAND OPENING LIST (Client Hub step 4, his pick "Yes, A, build it", 16.11.2026; picture
// _pictures/CH_step4_business_cards.html column A). The company page's Add contact form has one more box, "Grand Opening list":
// the six list owners by name and "Not on a list", pre-set to the owner who already has this company. Save contact adds the
// contact as before AND puts the person on that owner's list under this company, in the same transaction. A company already
// decided on that list keeps its Invite or No; the new person is still to decide there until the owner presses Done.
// Every person and company here is invented.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ROOT, start, session } from './security_helpers.js';
const { openDb } = await import('../src/db.js');
const ml = await import('../src/tcmylist.js');
const tc = await import('../src/tc.js');
const tcgo = await import('../src/tcgo.js');
const { nameKey } = tc;

const at = new Date().toISOString();
const JS = 'js@novikontas.org', AD = 'ritvars.vilcins@novikontas.org';
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');

async function seed(db) {
  const co = async (name) => Number((await db.prepare(`INSERT INTO tc_companies (name, name_key, country, status, created_at) VALUES (?,?,?,?,?)`)
    .run(name, nameKey(name), 'Norway', 'not_contacted', at)).lastInsertRowid);
  const one = await co('Onehold Example AS');      // on JS's list only
  const split = await co('Splitwave Example SIA'); // two on DS's list, one on JS's
  const none = await co('Nobodys Example Ltd');    // on no list
  const row = async (sender, ch, name, companyName, email, companyId) => {
    const id = Number((await db.prepare(`INSERT INTO tc_go_stage2 (ch_contact_id, sender, name, company, email, gone, loaded_at, loaded_by)
      VALUES (?,?,?,?,?,0,?,?)`).run(ch, sender, name, companyName, email, at, 'test')).lastInsertRowid);
    if (companyId) await db.prepare(`INSERT INTO tc_company_contacts (company_id, name, email, ch_contact_id, created_at) VALUES (?,?,?,?,?)`).run(companyId, name, email, ch, at);
    return id;
  };
  await row('JS', 'GL1', 'Olga Example', 'Onehold Example AS', 'olga@onehold-example.com', one);
  await row('DS', 'GL2', 'Sven Example', 'Splitwave Example SIA', 'sven@splitwave-example.com', split);
  await row('DS', 'GL3', 'Sara Example', 'Splitwave Example SIA', 'sara@splitwave-example.com', split);
  await row('JS', 'GL4', 'Simon Example', 'Splitwave Example SIA', 'simon@splitwave-example.com', split);
  return { one, split, none };
}
const add = (db, id, b, code) => tc.addContact(db, id, b, 'Test Person', code ? (tx, x) => ml.addContactToList(tx, { code, ...x }) : null);
const person = (L, email) => L.groups.flatMap((g) => g.people.map((p) => ({ ...p, key: g.key, gdecision: g.decision }))).find((p) => p.email === email);

test('the box is pre-set to the owner who has this company; split = the one with most people; none = Not on a list', async () => {
  const db = await openDb();
  const { one, split, none } = await seed(db);
  assert.equal(await ml.listHolding(db, one), 'JS');
  assert.equal(await ml.listHolding(db, split), 'DS', 'two people on DS, one on JS');
  assert.equal(await ml.listHolding(db, none), null);
  const box = await ml.listBox(db, one);
  assert.equal(box.options.length, 6, 'the six list owners');
  assert.ok(box.options.every((o) => o.code && o.name));
  assert.equal(box.has, 'JS');
});

test('a list code must be a real one; empty = Not on a list', () => {
  assert.equal(ml.checkListCode(''), '');
  assert.equal(ml.checkListCode(undefined), '');
  assert.equal(ml.checkListCode('JS'), 'JS');
  assert.throws(() => ml.checkListCode('NOPE'), /Pick a Grand Opening list/);
  assert.throws(() => ml.checkListCode('<script>'), /Pick a Grand Opening list/);
});

test('Save contact with a list: the contact as today, plus the person on that list under this company, still to decide, one log line', async () => {
  const db = await openDb();
  const { one } = await seed(db);
  const r = await add(db, one, { name: 'Peter Example', position: 'Technical Director', email: 'Peter@Onehold-example.com', phone: '+47 1' }, 'JS');
  assert.equal(r.list, 'added'); assert.equal(r.owner, 'Jānis Sticenko'); assert.equal(r.decided, false);
  const k = await db.prepare('SELECT * FROM tc_company_contacts WHERE id = ?').get(r.id);
  assert.equal(k.company_id, one); assert.equal(k.ch_contact_id, 'intake:' + r.id);
  const L = await ml.myList(db, 'JS');
  const p = person(L, 'peter@onehold-example.com');
  assert.equal(p.key, 'id:' + one, 'under this company, next to Olga');
  assert.equal(p.decision, null); assert.equal(p.fresh, false);
  assert.equal(L.groups.find((g) => g.key === 'id:' + one).people.length, 2);
  const log = await db.prepare("SELECT body, field, new_value FROM tc_activities WHERE company_id = ? AND field = 'go_list'").all(one);
  assert.deepEqual(log.map((x) => x.body), ['Added to the Grand Opening list of Jānis Sticenko']);
});

test('Not on a list: the contact only, as before', async () => {
  const db = await openDb();
  const { none } = await seed(db);
  const n0 = (await db.prepare('SELECT COUNT(*) AS n FROM tc_go_stage2').get()).n;
  const r = await add(db, none, { name: 'Nora Example', email: 'nora@nobodys-example.com' }, '');
  assert.ok(r.id); assert.equal(r.list, undefined);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM tc_go_stage2').get()).n, n0);
  assert.equal((await db.prepare('SELECT ch_contact_id FROM tc_company_contacts WHERE id = ?').get(r.id)).ch_contact_id, null);
});

test('a company on no list: picking an owner starts that company on their list', async () => {
  const db = await openDb();
  const { none } = await seed(db);
  const r = await add(db, none, { name: 'Nils Example', email: 'nils@nobodys-example.com' }, 'MC');
  assert.equal(r.list, 'added');
  const g = (await ml.myList(db, 'MC')).groups.find((x) => x.key === 'id:' + none);
  assert.equal(g.name, 'Nobodys Example Ltd'); assert.equal(g.people.length, 1); assert.equal(g.decision, null);
  assert.equal(await ml.listHolding(db, none), 'MC', 'the next contact is pre-set to MC');
});

test('a company split across two owners: the person goes on the list picked, nowhere else', async () => {
  const db = await openDb();
  const { split } = await seed(db);
  await add(db, split, { name: 'Stella Example', email: 'stella@splitwave-example.com' }, 'JS');
  assert.ok(person(await ml.myList(db, 'JS'), 'stella@splitwave-example.com'));
  assert.equal(person(await ml.myList(db, 'DS'), 'stella@splitwave-example.com'), undefined);
});

test('an email already on a list is not added twice; the contact is still added and the form says whose list it is on', async () => {
  const db = await openDb();
  const { one, split } = await seed(db);
  // Sven is on DS's list; he is now added as a contact of another company and JS is picked
  const r = await add(db, one, { name: 'Sven Example', email: 'SVEN@splitwave-example.com' }, 'JS');
  assert.equal(r.list, 'already'); assert.equal(r.owner, 'Dmitrijs Semjonovs');
  assert.ok(r.id, 'the contact is added');
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM tc_go_stage2 WHERE LOWER(email) = 'sven@splitwave-example.com'").get()).n, 1);
  assert.equal(person(await ml.myList(db, 'JS'), 'sven@splitwave-example.com'), undefined);
  // the same new person twice from the form: the second time is refused by the company (same email) - nothing on a list twice
  await add(db, split, { name: 'Tom Example', email: 'tom@splitwave-example.com' }, 'DS');
  await assert.rejects(add(db, split, { name: 'Tom Example', email: 'tom@splitwave-example.com' }, 'DS'), /already a contact/);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM tc_go_stage2 WHERE email = 'tom@splitwave-example.com'").get()).n, 1);
});

test('one transaction: if the list step fails, the contact is not added either', async () => {
  const db = await openDb();
  const { one } = await seed(db);
  const n0 = (await db.prepare('SELECT COUNT(*) AS n FROM tc_company_contacts').get()).n;
  await assert.rejects(tc.addContact(db, one, { name: 'Fail Example', email: 'fail@onehold-example.com' }, 'Test', async () => { throw new Error('boom'); }), /boom/);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM tc_company_contacts').get()).n, n0);
});

test('a company already decided Invite: the decision stays, the new person waits (New, still to decide, gets nothing) until Done + Save', async () => {
  const db = await openDb();
  const { one } = await seed(db);
  const K = 'id:' + one;
  await ml.saveState(db, 'JS', { picks: { [K]: { decision: 'invite', way: 'digital' } }, out: [], moves: {} }, 'Jānis', 0);
  const before = await ml.digitalIds(db, 'JS');
  const r = await add(db, one, { name: 'Pia Example', email: 'pia@onehold-example.com' }, 'JS');
  assert.equal(r.decided, true);
  let L = await ml.myList(db, 'JS');
  const g = L.groups.find((x) => x.key === K);
  assert.equal(g.decision, 'invite'); assert.equal(g.way, 'digital', 'the company decision is not changed');
  const p = person(L, 'pia@onehold-example.com');
  assert.equal(p.fresh, true); assert.equal(p.decision, null, 'still to decide');
  assert.equal(person(L, 'olga@onehold-example.com').decision, 'invite', 'the people already there keep theirs');
  assert.equal(L.figures.todo, 2, 'the new person counts as still to decide (with Simon, undecided at Splitwave)');
  assert.deepEqual([...(await ml.digitalIds(db, 'JS'))].sort(), [...before].sort(), 'no Stage 2 email for the new person yet');
  // Done on the company, then Save
  const v = L.version.id;
  L = await ml.saveState(db, 'JS', { ...ml.stateOf(L), settled: [p.id] }, 'Jānis', v);
  const q = person(L, 'pia@onehold-example.com');
  assert.equal(q.fresh, false); assert.equal(q.decision, 'invite');
  assert.ok((await ml.digitalIds(db, 'JS')).has(p.id));
  assert.ok((await db.prepare('SELECT settled_at FROM tc_go_people_new WHERE stage2_id = ?').get(p.id)).settled_at);
  assert.equal((await db.prepare("SELECT decision FROM tc_go_decision_log WHERE stage2_id = ? ORDER BY id DESC").get(p.id)).decision, 'invite');
});

test('a company already decided No: the new person waits, then follows No after Done; a settled id that is not new is ignored', async () => {
  const db = await openDb();
  const { one } = await seed(db);
  const K = 'id:' + one;
  await ml.saveState(db, 'JS', { picks: { [K]: { decision: 'no' } }, out: [], moves: {} }, 'Jānis', 0);
  await add(db, one, { name: 'Pia Example', email: 'pia@onehold-example.com' }, 'JS');
  let L = await ml.myList(db, 'JS');
  const p = person(L, 'pia@onehold-example.com'), olga = person(L, 'olga@onehold-example.com');
  assert.equal(p.decision, null); assert.equal(L.groups.find((x) => x.key === K).decision, 'no');
  L = await ml.saveState(db, 'JS', { ...ml.stateOf(L), settled: [p.id, olga.id, 999999] }, 'Jānis', L.version.id);
  assert.equal(person(L, 'pia@onehold-example.com').decision, 'no');
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM tc_go_people_new').get()).n, 1, 'only the new person has a row');
});

test('a Save without Done leaves the new person waiting; an old Client Hub split reload never marks them gone', async () => {
  const db = await openDb();
  const { one } = await seed(db);
  const K = 'id:' + one;
  await ml.saveState(db, 'JS', { picks: { [K]: { decision: 'invite', way: 'post' } }, out: [], moves: {} }, 'Jānis', 0);
  await add(db, one, { name: 'Pia Example', email: 'pia@onehold-example.com' }, 'JS');
  let L = await ml.myList(db, 'JS');
  L = await ml.saveState(db, 'JS', { picks: { ...ml.stateOf(L).picks, 'id:0': { decision: 'no' } }, out: [], moves: {} }, 'Jānis', L.version.id);
  assert.equal(person(L, 'pia@onehold-example.com').decision, null);
  assert.equal((await ml.postcardRows(db, ['JS'])).some((r) => r.person === 'Pia Example'), false, 'not on the postcard list while waiting');
  const rows = (await db.prepare("SELECT ch_contact_id, sender, name, company, email FROM tc_go_stage2 WHERE ch_contact_id NOT LIKE 'intake:%'").all());
  const out = await tcgo.stage2Load(db, rows, 'test', { apply: true });
  assert.equal(out.counts.gone, 0);
  assert.equal((await db.prepare("SELECT gone FROM tc_go_stage2 WHERE email = 'pia@onehold-example.com'").get()).gone, 0);
});

test('the page: the box under the fields, pre-set label, Not on a list, escaped; a new person shows New and keeps the company open until Done', () => {
  const box = APP.slice(APP.indexOf('function tcGoListBox('), APP.indexOf('\n}\n', APP.indexOf('function tcGoListBox(')));
  assert.ok(box.includes("' (has this company)'") && box.includes("opt('', 'Not on a list')") && box.includes('<label for="tckGo">Grand Opening list</label>'));
  assert.ok(box.includes('${esc(v)}') && box.includes('${esc(t)}'), 'escaped');
  assert.ok(APP.includes("goList: v('#tckGo')"));
  assert.ok(APP.includes('${tcGoListBox(c)}\n        <div id="tckErr"'), 'right under Email / Phone');
  // no New tag anywhere (the owner, 16.11.2026: "NELIEC APPA new!"): the person shows like everyone else, still to decide until Done
  assert.ok(!APP.includes('tcml-new') && !/\$\{tcN\(waiting\)\} new/.test(APP));
  const f = APP.slice(APP.indexOf('function tcMlFinish('), APP.indexOf('\n}\n', APP.indexOf('function tcMlFinish(')));
  assert.ok(f.includes("mlApply(T_ML.W, { type: 'settle', ids: waiting })") && f.includes('T_ML.undo.push(mlClone(T_ML.W));'), 'Done settles, Undo steps back');
  // the pure view: a waiting person is still to decide in an invited company; settled follows the company
  const BLOCK = APP.slice(APP.indexOf('// MLSTATE START'), APP.indexOf('// MLSTATE END'));
  const { mlView, mlApply, mlSame } = new Function(BLOCK + '\nreturn { mlView, mlApply, mlSame };')();
  const base = { groups: [{ key: 'id:1', name: 'X', people: [{ id: 1 }, { id: 2, fresh: true }] }] };
  const W = { picks: { 'id:1': { decision: 'invite', way: 'digital' } }, out: [], moves: {}, settled: [] };
  let V = mlView(base, W);
  assert.deepEqual(V.groups[0].people.map((p) => p.decision), ['invite', null]);
  assert.deepEqual(V.figures, { todo: 1, invite: 1, no: 0 });
  const W2 = mlApply(W, { type: 'settle', ids: [2] });
  V = mlView(base, W2);
  assert.deepEqual(V.groups[0].people.map((p) => p.decision), ['invite', 'invite']);
  assert.equal(mlSame(W, W2), false, 'Done on a new person is an unsaved change');
  assert.equal(mlSame(W, { ...W, settled: undefined }), true, 'an old draft without settled reads the same');
});

test('over HTTP: the company carries the box, a wrong code is refused, a real one adds; no sign-in = nothing', async (t) => {
  const keep = {};
  for (const k of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'CRM_DB_DATABASE_URL_UNPOOLED', 'INTAKE_DATABASE_URL']) { keep[k] = process.env[k]; process.env[k] = ''; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-golist-'));
  const file = path.join(dir, 'gl.db');
  const db = await openDb(file);
  const ids = await seed(db);
  for (const [id, email, role] of [['u_js', JS, 'user'], ['u_ad', AD, 'admin']]) {
    await db.prepare(`INSERT INTO crm_users (id, email, display_name, password_hash, role, active, session_version, created_at) VALUES (?,?,?,NULL,?,1,0,?)`).run(id, email, id, role, at);
    await db.prepare('INSERT INTO crm_user_areas (user_id, area, granted_at, granted_by) VALUES (?,?,?,?)').run(id, 'tc', at, 'test');
  }
  await db.prepare('INSERT INTO sync_state (name, value, ran_at) VALUES (?,?,?)').run('areas_backfill_2026_10', 'done', at);
  await db.close();
  for (const [k, v] of Object.entries(keep)) process.env[k] = v ?? '';
  const s = await start({ CRM_DB: file, DATASET: 'empty', CRM_RITVARS_PASSWORD: '', CRM_AIGARS_PASSWORD: '', CRM_ADMISSIONS_PASSWORD: '' });
  t.after(() => { s.child.kill(); });
  const js = session(JS, 'user');
  const get = (p, cookie) => fetch(s.base + p, { headers: cookie ? { cookie } : {} });
  const post = (p, cookie, b) => fetch(s.base + p, { method: 'POST', headers: { origin: s.base, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(b) });
  const c = await (await get('/api/tc/companies/' + ids.split, js)).json();
  assert.equal(c.goList.has, 'DS'); assert.equal(c.goList.options.length, 6);
  const bad = await post(`/api/tc/companies/${ids.split}/contacts`, js, { name: 'Wrong Example', email: 'w@splitwave-example.com', goList: 'NOPE' });
  assert.equal(bad.status, 400);
  const ok = await post(`/api/tc/companies/${ids.split}/contacts`, js, { name: 'Right Example', email: 'r@splitwave-example.com', goList: 'DS' });
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.list, 'added');
  const contacts = (await (await get('/api/tc/companies/' + ids.split, js)).json()).contacts.map((k) => k.email);
  assert.ok(contacts.includes('r@splitwave-example.com') && !contacts.includes('w@splitwave-example.com'), 'a refused list adds no contact either');
  assert.notEqual((await post(`/api/tc/companies/${ids.split}/contacts`, null, { name: 'Anon', goList: 'DS' })).status, 200);
});
