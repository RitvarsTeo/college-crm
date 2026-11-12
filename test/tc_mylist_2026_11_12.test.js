// MY GRAND OPENING LIST (12.11.2026; his picks: folded tiles, "C1: tap a name", "Yes, build it", and "I need the full flow ...
// drag and dropped from company to company ... cant leave that page until they save the changes ... autosave ... undo button and
// a working ctrl+z function"). Every person and company here is invented.
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
  const co = async (name, country, address = null) => Number((await db.prepare(`INSERT INTO tc_companies (name, name_key, country, address, status, created_at) VALUES (?,?,?,?,?,?)`).run(name, nameKey(name), country, address, 'not_contacted', at)).lastInsertRowid);
  const a = await co('Alphaship Example AS', 'Norway', 'Harbour 1, Bergen');
  const b = await co('Betaline Example SIA', 'Latvia');
  const row = async (sender, ch, name, company, email, companyId, position = '') => {
    const id = Number((await db.prepare(`INSERT INTO tc_go_stage2 (ch_contact_id, sender, name, first_name, company, position, country, email, link_code, gone, loaded_at, loaded_by)
      VALUES (?,?,?,?,?,?,?,?,?,0,?,?)`).run(ch, sender, name, name.split(' ')[0], company, position, 'Norway', email, 'ml' + ch, at, 'test')).lastInsertRowid);
    if (companyId) await db.prepare(`INSERT INTO tc_company_contacts (company_id, name, email, ch_contact_id, created_at) VALUES (?,?,?,?,?)`).run(companyId, name, email, ch, at);
    return id;
  };
  const p1 = await row('JS', 'ML1', 'Anna Example', 'Alphaship Example AS', 'anna@alphaship-example.com', a, 'Crew Manager');
  const p2 = await row('JS', 'ML2', 'Ben Example', 'Alphaship Example AS', 'ben@alphaship-example.com', a);
  const p3 = await row('JS', 'ML3', 'Alphaship - Riga', 'Alphaship Example AS', 'riga@alphaship-example.com', a);
  const p4 = await row('JS', 'ML4', 'Carla Example', 'Betaline Example SIA', 'carla@betaline-example.com', b);
  const p5 = await row('JS', 'ML6', 'Eva Example', 'Freehand Example', 'eva@freehand-example.com', null);
  const d1 = await row('DS', 'ML5', 'Dora Example', 'Gammaport Example', 'dora@gammaport-example.com', null);
  return { a, b, A: 'id:' + a, B: 'id:' + b, p1, p2, p3, p4, p5, d1 };
}

test('who opens which list: the owner their own, an admin every list, nobody else; never a list that does not exist', () => {
  const js = { email: 'JS@novikontas.org' }, other = { email: 'someone@novikontas.org' };
  assert.equal(ml.ownCode(js), 'JS');
  assert.equal(ml.mayOpen(js, false, 'JS'), true);
  assert.equal(ml.mayOpen(js, false, 'DS'), false);
  assert.equal(ml.mayOpen(other, false, 'JS'), false);
  assert.equal(ml.mayOpen(null, false, 'JS'), false);
  assert.equal(ml.mayOpen(other, true, 'JS'), true);
  assert.equal(ml.mayOpen(other, true, 'NOPE'), false);
  assert.deepEqual(ml.openable(js, false), ['JS']);
  assert.equal(ml.openable(other, true).length, 6);
});

test('the list: companies with their people, a shared mailbox shown as its address, TOTAL is no country, people figures', async () => {
  const db = await openDb();
  const { a, A, p3 } = await seed(db);
  const L = await ml.myList(db, 'JS');
  assert.equal(L.people, 5); assert.equal(L.companies, 3);
  assert.deepEqual(L.figures, { todo: 5, invite: 0, no: 0 });
  const g = L.groups.find((x) => x.key === A);
  assert.equal(g.people.length, 3); assert.equal(g.address, 'Harbour 1, Bergen'); assert.equal(g.intake, true);
  assert.equal(g.people.find((p) => p.id === p3).label, 'riga@alphaship-example.com');
  assert.equal(L.groups.find((x) => x.key.startsWith('n:')).intake, false);
  assert.ok(!L.groups.some((x) => x.people.some((p) => p.label === 'Dora Example')));
  await db.prepare("UPDATE tc_companies SET country = 'TOTAL' WHERE id = ?").run(a);
  assert.equal((await ml.myList(db, 'JS')).groups.find((x) => x.key === A).country, 'Norway');
});

test('a draft is never the decision: autosave keeps it, nothing changes until Save; Save applies it and empties the draft', async () => {
  const db = await openDb();
  const { A, B, p2 } = await seed(db);
  const st = { picks: { [A]: { decision: 'invite', way: 'digital' }, [B]: { decision: 'no' } }, out: [p2], moves: {} };
  await ml.saveDraft(db, 'JS', st, 'Jānis Sticenko');
  let L = await ml.myList(db, 'JS');
  assert.deepEqual(L.figures, { todo: 5, invite: 0, no: 0 }, 'the draft decides nothing');
  assert.deepEqual(L.draft.state.picks[A], { decision: 'invite', way: 'digital' });
  assert.equal((await ml.digitalIds(db, 'JS')).size, 0, 'nobody is sent from a draft');
  L = await ml.saveState(db, 'JS', st, 'Jānis Sticenko');
  assert.deepEqual(L.figures, { todo: 1, invite: 2, no: 2 });
  assert.equal(L.draft, null);
  assert.equal((await ml.digitalIds(db, 'JS')).size, 2);
  await ml.saveDraft(db, 'JS', { ...st, out: [] }, 'J');
  await ml.dropDraft(db, 'JS');   // "Don't save"
  assert.equal((await ml.myList(db, 'JS')).draft, null);
  assert.deepEqual((await ml.myList(db, 'JS')).figures, { todo: 1, invite: 2, no: 2 }, 'what was saved stays');
  const log = await db.prepare('SELECT stage2_id, decision, way, by_name FROM tc_go_decision_log ORDER BY id').all();
  assert.equal(log.length, 4); assert.ok(log.every((r) => r.by_name === 'Jānis Sticenko'));
  await assert.rejects(ml.saveState(db, 'JS', { picks: { 'id:999999': { decision: 'invite' } }, out: [], moves: {} }, 'J'), /not on this list/);
  await assert.rejects(ml.saveState(db, 'JS', { picks: { [A]: { decision: 'invite', way: 'pigeon' } }, out: [], moves: {} }, 'J'), /Digital, in person or by post/);
  assert.equal(Number((await db.prepare('SELECT COUNT(*) AS n FROM tc_go_s2_sent').get()).n), 0, 'nothing is sent from here');
});

test('drag and drop: a person changes company only on Save, their Intake contact moves, the move is kept; only to a company in Intake', async () => {
  const db = await openDb();
  const { a, b, A, B, p1, p5, d1 } = await seed(db);
  await ml.saveDraft(db, 'JS', { picks: {}, out: [], moves: { [p1]: B } }, 'J');
  assert.equal(Number((await db.prepare("SELECT company_id FROM tc_company_contacts WHERE ch_contact_id = 'ML1' AND archived_at IS NULL").get()).company_id), a, 'a draft moves nobody');
  const L = await ml.saveState(db, 'JS', { picks: { [B]: { decision: 'invite', way: 'post' } }, out: [], moves: { [p1]: B, [p5]: A } }, 'Jānis Sticenko');
  assert.equal(Number((await db.prepare("SELECT company_id FROM tc_company_contacts WHERE ch_contact_id = 'ML1' AND archived_at IS NULL").get()).company_id), b);
  assert.equal(Number((await db.prepare("SELECT company_id FROM tc_company_contacts WHERE ch_contact_id = 'ML6' AND archived_at IS NULL").get()).company_id), a, 'a person without an Intake contact gets one');
  assert.equal(L.groups.find((g) => g.key === B).people.length, 2);
  assert.equal(L.groups.find((g) => g.key === A).people.length, 3);
  const moves = await db.prepare('SELECT stage2_id, from_key, to_key, by_name FROM tc_go_moves ORDER BY id').all();
  assert.deepEqual(moves.map((m) => [Number(m.stage2_id), m.to_key]), [[p1, B], [p5, A]]);
  assert.ok(Number((await db.prepare("SELECT COUNT(*) AS n FROM tc_activities WHERE body LIKE 'Contact moved%'").get()).n) >= 3);
  await assert.rejects(ml.saveState(db, 'JS', { picks: {}, out: [], moves: { [p1]: 'n:' + nameKey('Freehand Example') } }, 'J'), /only to a company in Intake/);
  await assert.rejects(ml.saveState(db, 'JS', { picks: {}, out: [], moves: { [d1]: A } }, 'J'), /not on this list/);
  const pc = await ml.postcardRows(db, ['JS']);
  assert.deepEqual(pc.map((r) => [r.person, r.company, r.way, r.owner]).sort(), [['Anna Example', 'Betaline Example SIA', 'post', 'Jānis Sticenko'], ['Carla Example', 'Betaline Example SIA', 'post', 'Jānis Sticenko']]);
});

// the page's own logic, read out of app.html between its markers and run here
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const BLOCK = APP.slice(APP.indexOf('// MLSTATE START'), APP.indexOf('// MLSTATE END'));
const P = new Function(`${BLOCK}; return { mlView, mlApply, mlShows, mlClone };`)();

test('the sandbox on the page: every change is a new state (Undo steps back through them), a pressed button again clears, a drag moves the person in the view', () => {
  const base = { groups: [{ key: 'id:1', name: 'A', intake: true, people: [{ id: 1, label: 'P1' }, { id: 2, label: 'P2' }] }, { key: 'id:2', name: 'B', intake: true, people: [{ id: 3, label: 'P3' }] }] };
  const s0 = { picks: {}, out: [], moves: {} };
  const undo = [];
  const step = (w, a) => { undo.push(P.mlClone(w)); return P.mlApply(w, a); };
  let w = step(s0, { type: 'decide', key: 'id:1', decision: 'invite' });
  w = step(w, { type: 'way', key: 'id:1', way: 'digital' });
  w = step(w, { type: 'out', id: 2 });
  w = step(w, { type: 'move', id: 3, key: 'id:1', home: 'id:2' });
  let V = P.mlView(base, w);
  assert.deepEqual(V.figures, { todo: 0, invite: 2, no: 1 });
  assert.equal(V.groups.length, 1, 'B is empty after the drag');
  assert.equal(V.groups[0].people.find((p) => p.id === 3).from, 'id:2');
  assert.deepEqual(P.mlShows(V.groups[0], 'todo'), false, 'a decided company leaves Still to decide');
  w = undo.pop(); w = undo.pop();   // Ctrl+Z twice: the drag and the tap-out are gone
  V = P.mlView(base, w);
  assert.deepEqual(V.figures, { todo: 1, invite: 2, no: 0 });
  w = P.mlApply(w, { type: 'decide', key: 'id:1', decision: 'invite' });   // the same button again clears, the way with it
  assert.deepEqual(w.picks['id:1'], { decision: null, way: null });
  assert.deepEqual(s0, { picks: {}, out: [], moves: {} }, 'a change never touches the state it came from');
});

test('the page: Still to decide first, Save / Undo / status line, Ctrl+Z, autosave as a draft, a leave prompt, the browser question on close, drag and drop', () => {
  assert.ok(APP.includes("else if (place === 'mylist') viewTcMyList(arg ? decodeURIComponent(arg) : '');"));
  assert.ok(APP.includes("filter: 'todo'"));
  assert.ok(APP.includes('onclick="tcMlSave()">Save</button>') && APP.includes('onclick="tcMlUndo()" title="Ctrl+Z">Undo</button>'));
  for (const t of ["'Saving…'", '`Saved ${tcMlTime(S.statusAt)}`', '`Unsaved changes · autosaved ${tcMlTime(S.statusAt)}`', "'Unsaved changes'"]) assert.ok(APP.includes(t), t);
  assert.ok(APP.includes("String(e.key).toLowerCase() === 'z') { e.preventDefault(); tcMlUndo(); }"));
  assert.ok(APP.includes("setInterval(tcMlAutosave, 90 * 1000)") && APP.includes("post('/api/tc/go/mylist/draft'"));
  assert.ok(APP.includes("if (typeof tcMlMayLeave === 'function' && !tcMlMayLeave(location.hash || '')) return;"));
  assert.ok(APP.includes("modal('Save the changes?'") && APP.includes(`onclick="tcMlLeave('save')">Save</button>`) && APP.includes(`onclick="tcMlLeave('drop')">Don't save</button>`) && APP.includes('onclick="closeModal()">Cancel</button>'));
  assert.ok(APP.includes("window.addEventListener('beforeunload'"));
  assert.ok(APP.includes('draggable="true"') && APP.includes('ondrop="tcMlDrop(event,'));
  assert.ok(APP.includes("else if (place === 'postcards') viewTcPostcards();") && APP.includes('href="/api/tc/go/postcards.xlsx" download'));
});

test('over the wire: an owner saves and drafts only their own list, an admin any; the postcard list is their own; signed out nothing', async (t) => {
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
  const js = session('js@novikontas.org', 'user'), ds = session('ds@novikontas.org', 'user'), ad = session('ritvars.vilcins@novikontas.org', 'admin');
  const get = (p, cookie) => fetch(s.base + p, { headers: cookie ? { cookie } : {} });
  const post = (p, cookie, b) => fetch(s.base + p, { method: 'POST', headers: { origin: s.base, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(b) });
  const st = { picks: { [ids.A]: { decision: 'invite', way: 'in_person' } }, out: [], moves: {} };
  assert.deepEqual((await (await get('/api/tc/go/mylist', js)).json()).lists, ['JS']);
  assert.equal((await get('/api/tc/go/mylist?sender=DS', js)).status, 403);
  assert.equal((await post('/api/tc/go/mylist/save', js, { sender: 'DS', state: { picks: {}, out: [], moves: {} } })).status, 403);
  assert.equal((await post('/api/tc/go/mylist/draft', js, { sender: 'DS', state: { picks: {}, out: [], moves: {} } })).status, 403);
  assert.equal((await post('/api/tc/go/mylist/save', js, { sender: 'JS', state: { picks: {}, out: [ids.d1], moves: {} } })).status, 400, 'a DS person through the JS list');
  assert.equal((await post('/api/tc/go/mylist/draft', js, { sender: 'JS', state: st })).status, 200);
  assert.equal((await post('/api/tc/go/mylist/save', js, { sender: 'JS', state: st })).status, 200);
  assert.equal((await (await get('/api/tc/go/postcards', js)).json()).rows.length, 3);
  assert.equal((await (await get('/api/tc/go/postcards', ds)).json()).rows.length, 0, 'DS sees only the DS rows');
  assert.equal((await get('/api/tc/go/postcards.xlsx', js)).status, 200);
  assert.equal((await get('/api/tc/go/mylist?sender=DS', ad)).status, 200);
  assert.equal((await (await get('/api/tc/go/postcards', ad)).json()).rows.length, 3);
  assert.notEqual((await get('/api/tc/go/mylist?sender=JS')).status, 200);
  assert.notEqual((await get('/api/tc/go/postcards')).status, 200);
  assert.notEqual((await post('/api/tc/go/mylist/save', null, { sender: 'JS', state: st })).status, 200);
});
