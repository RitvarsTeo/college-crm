// MY GRAND OPENING LIST (12.11.2026; his picks: folded tiles, "C1: tap a name", "Yes, build it", and "I need the full flow ...
// drag and dropped from company to company ... cant leave that page until they save the changes ... autosave ... undo button and
// a working ctrl+z function"), with the fixes from the audit of 12.11.2026 (1-9). Every person and company here is invented.
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
const JS = 'js@novikontas.org', AD = 'ritvars.vilcins@novikontas.org';
const E = { picks: {}, out: [], moves: {} };
async function seed(db) {
  const co = async (name, country, address = null) => Number((await db.prepare(`INSERT INTO tc_companies (name, name_key, country, address, status, created_at) VALUES (?,?,?,?,?,?)`).run(name, nameKey(name), country, address, 'not_contacted', at)).lastInsertRowid);
  const a = await co('Alphaship Example AS', 'Norway', 'Harbour 1, Bergen');
  const b = await co('Betaline Example SIA', 'Latvia');
  const row = async (sender, ch, name, company, email, companyId, position = '', code = 'ml' + ch) => {
    const id = Number((await db.prepare(`INSERT INTO tc_go_stage2 (ch_contact_id, sender, name, first_name, company, position, country, email, link_code, gone, loaded_at, loaded_by)
      VALUES (?,?,?,?,?,?,?,?,?,0,?,?)`).run(ch, sender, name, name.split(' ')[0], company, position, 'Norway', email, code, at, 'test')).lastInsertRowid);
    if (companyId) await db.prepare(`INSERT INTO tc_company_contacts (company_id, name, email, ch_contact_id, created_at) VALUES (?,?,?,?,?)`).run(companyId, name, email, ch, at);
    return id;
  };
  const p1 = await row('JS', 'ML1', 'Anna Example', 'Alphaship Example AS', 'anna@alphaship-example.com', a, 'Crew Manager');
  const p2 = await row('JS', 'ML2', 'Ben Example', 'Alphaship Example AS', 'ben@alphaship-example.com', a);
  const p3 = await row('JS', 'ML3', 'Alphaship - Riga', 'Alphaship Example AS', 'riga@alphaship-example.com', a);
  const p4 = await row('JS', 'ML4', 'Carla Example', 'Betaline Example SIA', 'carla@betaline-example.com', b);
  const p5 = await row('JS', 'ML6', 'Eva Example', 'Freehand Example', 'eva@freehand-example.com', null);
  const d1 = await row('DS', 'ML5', 'Dora Example', 'Gammaport Example', 'dora@gammaport-example.com', null);
  return { a, b, A: 'id:' + a, B: 'id:' + b, N: 'n:' + nameKey('Freehand Example'), p1, p2, p3, p4, p5, d1 };
}
const contactCo = async (db, ch) => Number((await db.prepare('SELECT company_id FROM tc_company_contacts WHERE ch_contact_id = ? AND archived_at IS NULL').get(ch)).company_id);

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

test('the list: companies with their people, a shared mailbox shown as its address, TOTAL is no country, people figures, version 0', async () => {
  const db = await openDb();
  const { a, A, p3 } = await seed(db);
  const L = await ml.myList(db, 'JS');
  assert.equal(L.people, 5); assert.equal(L.companies, 3);
  assert.deepEqual(L.figures, { todo: 5, invite: 0, no: 0 });
  assert.deepEqual(L.version, { id: 0, at: null, by: '' });
  const g = L.groups.find((x) => x.key === A);
  assert.equal(g.people.length, 3); assert.equal(g.address, 'Harbour 1, Bergen'); assert.equal(g.intake, true);
  assert.equal(g.people.find((p) => p.id === p3).label, 'riga@alphaship-example.com');
  assert.equal(L.groups.find((x) => x.key.startsWith('n:')).intake, false);
  assert.ok(!L.groups.some((x) => x.people.some((p) => p.label === 'Dora Example')));
  await db.prepare("UPDATE tc_companies SET country = 'TOTAL' WHERE id = ?").run(a);
  assert.equal((await ml.myList(db, 'JS')).groups.find((x) => x.key === A).country, 'Norway');
});

test('1. two editors: Save refused when someone saved since the page loaded ("Saved by ... - load it?"); only changed companies are stamped; a draft per editor', async () => {
  const db = await openDb();
  const { A, B } = await seed(db);
  // both open version 0; the owner saves Alphaship
  let L = await ml.saveState(db, 'JS', { ...E, picks: { [A]: { decision: 'invite', way: 'digital' } } }, 'Jānis Sticenko', 0, JS);
  assert.equal(L.version.id > 0, true); assert.equal(L.version.by, 'Jānis Sticenko');
  // the admin's page still holds version 0: refused, nothing written, the message names who and when (full weekday)
  await assert.rejects(ml.saveState(db, 'JS', { ...E, picks: { [B]: { decision: 'no' } } }, 'Ritvars', 0, AD), (e) => e instanceof ml.MlConflict && /^Saved by Jānis Sticenko at [A-Z][a-z]+day \d+ [A-Z][a-z]+ 2026, \d\d:\d\d - load it\?$/.test(e.message));
  assert.equal((await ml.myList(db, 'JS')).groups.find((g) => g.key === B).decision, null);
  // on the version it loaded, the admin's Save goes through and stamps ONLY Betaline; Alphaship keeps the owner's stamp
  const v = (await ml.myList(db, 'JS')).version.id;
  await ml.saveState(db, 'JS', { ...E, picks: { [A]: { decision: 'invite', way: 'digital' }, [B]: { decision: 'no' } } }, 'Ritvars', v, AD);
  const stamps = Object.fromEntries((await db.prepare('SELECT company_key, set_by FROM tc_go_company_picks').all()).map((r) => [r.company_key, r.set_by]));
  assert.deepEqual(stamps, { [A]: 'Jānis Sticenko', [B]: 'Ritvars' });
  // one draft per editor: the owner's draft is not the admin's
  const v2 = (await ml.myList(db, 'JS')).version.id;
  await ml.saveDraft(db, 'JS', { ...E, out: [] , picks: { [A]: { decision: 'no' } } }, 'Jānis Sticenko', v2, JS);
  await ml.saveDraft(db, 'JS', { ...E, picks: { [B]: { decision: 'invite', way: 'post' } } }, 'Ritvars', v2, AD);
  assert.deepEqual((await ml.myList(db, 'JS', JS)).draft.state.picks, { [A]: { decision: 'no', way: null } });
  assert.deepEqual((await ml.myList(db, 'JS', AD)).draft.state.picks, { [B]: { decision: 'invite', way: 'post' } });
  assert.equal((await ml.myList(db, 'JS')).draft, null, 'no editor, no draft');
});

test('2. a late autosave after Save never comes back: a draft on an older version is ignored by the server', async () => {
  const db = await openDb();
  const { A } = await seed(db);
  await ml.saveDraft(db, 'JS', { ...E, picks: { [A]: { decision: 'no' } } }, 'J', 0, JS);
  const L = await ml.saveState(db, 'JS', { ...E, picks: { [A]: { decision: 'invite', way: 'post' } } }, 'J', 0, JS);
  assert.equal(L.draft, null);
  // the autosave that was on its way still carries version 0: ignored, and no draft is offered back
  assert.deepEqual(await ml.saveDraft(db, 'JS', { ...E, picks: { [A]: { decision: 'no' } } }, 'J', 0, JS), { ok: true, ignored: true });
  assert.equal((await ml.myList(db, 'JS', JS)).draft, null);
  // an old draft row from before the Save is not offered either
  await db.prepare("UPDATE tc_go_drafts SET state = ?, base = 0 WHERE editor = ?").run(JSON.stringify({ ...E, picks: { [A]: { decision: 'no' } } }), JS);
  assert.equal((await ml.myList(db, 'JS', JS)).draft, null);
});

test('3. a stale draft never blocks Save: companies and people no longer on the list are dropped; a wrong value is still refused', async () => {
  const db = await openDb();
  const { A, p1, d1 } = await seed(db);
  const L = await ml.saveState(db, 'JS', { picks: { [A]: { decision: 'invite', way: 'digital' }, 'id:999999': { decision: 'invite', way: 'post' } }, out: [p1, 888888, d1], moves: { 777777: A } }, 'J', 0, JS);
  assert.equal(L.groups.find((g) => g.key === A).decision, 'invite');
  assert.deepEqual((await db.prepare('SELECT stage2_id FROM tc_go_people_out WHERE out_flag = 1').all()).map((r) => Number(r.stage2_id)), [p1], 'a DS person through the JS list is not touched');
  await assert.rejects(ml.saveState(db, 'JS', { ...E, picks: { [A]: { decision: 'maybe' } } }, 'J'), /Invite or No/);
  await assert.rejects(ml.saveState(db, 'JS', { ...E, picks: { [A]: { decision: 'invite', way: 'pigeon' } } }, 'J'), /Digital, in person or by post/);
});

test('4. Invite without a way reaches nobody: its people stay Still to decide, out of the send and the postcards', async () => {
  const db = await openDb();
  const { A } = await seed(db);
  let L = await ml.saveState(db, 'JS', { ...E, picks: { [A]: { decision: 'invite' } } }, 'J');
  assert.deepEqual(L.figures, { todo: 5, invite: 0, no: 0 });
  assert.equal(L.groups.find((g) => g.key === A).decision, 'invite', 'the tile still shows Invite pressed');
  assert.equal((await ml.digitalIds(db, 'JS')).size, 0);
  assert.equal((await ml.postcardRows(db, ['JS'])).length, 0);
  L = await ml.saveState(db, 'JS', { ...E, picks: { [A]: { decision: 'invite', way: 'in_person' } } }, 'J');
  assert.deepEqual(L.figures, { todo: 2, invite: 3, no: 0 });
  assert.equal((await ml.postcardRows(db, ['JS'])).length, 3);
});

test('5. Save with nothing changed writes nothing and stamps nothing (Ctrl+S on a saved list)', async () => {
  const db = await openDb();
  const { A } = await seed(db);
  const st = { ...E, picks: { [A]: { decision: 'no' } } };
  const v1 = (await ml.saveState(db, 'JS', st, 'Jānis Sticenko', 0, JS)).version;
  const again = await ml.saveState(db, 'JS', st, 'Ritvars', v1.id, AD);
  assert.equal(again.unchanged, true);
  assert.deepEqual((await ml.myList(db, 'JS')).version, v1, 'no new version');
  assert.equal((await db.prepare('SELECT set_by FROM tc_go_company_picks').get()).set_by, 'Jānis Sticenko');
  assert.equal(Number((await db.prepare('SELECT COUNT(*) AS n FROM tc_go_decision_log').get()).n), 3);
});

test('7. drag: on THIS list only - the shared Intake contact stays where it is; a person with no Intake company gets a contact there', async () => {
  const db = await openDb();
  const { a, A, B, N, p1, p5, d1 } = await seed(db);
  await ml.saveDraft(db, 'JS', { ...E, moves: { [p1]: B } }, 'J', 0, JS);
  let L = await ml.saveState(db, 'JS', { picks: { [B]: { decision: 'invite', way: 'post' } }, out: [], moves: { [p1]: B, [p5]: A } }, 'Jānis Sticenko', 0, JS);
  assert.equal(await contactCo(db, 'ML1'), a, 'Anna is still an Alphaship contact in Intake');
  assert.equal(Number((await db.prepare("SELECT COUNT(*) AS n FROM tc_company_contacts WHERE ch_contact_id = 'ML1' AND archived_at IS NOT NULL").get()).n), 0, 'nobody archived');
  assert.equal(await contactCo(db, 'ML6'), a, 'Eva had no Intake company: she is an Alphaship contact now');
  assert.deepEqual(L.groups.find((g) => g.key === B).people.map((p) => [p.label, p.moved]).sort(), [['Anna Example', true], ['Carla Example', false]]);
  assert.equal(L.groups.find((g) => g.key === A).people.length, 3);
  assert.ok(!L.groups.some((g) => g.key === N));
  const pc = await ml.postcardRows(db, ['JS']);
  assert.deepEqual(pc.map((r) => [r.person, r.company]).sort(), [['Anna Example', 'Betaline Example SIA'], ['Carla Example', 'Betaline Example SIA']]);
  // dragged back home: the list's own placement is cleared, the Intake contact never moved
  L = await ml.saveState(db, 'JS', { ...E, picks: { [B]: { decision: 'invite', way: 'post' } }, moves: { [p1]: A } }, 'J', L.version.id, JS);
  assert.equal(L.groups.find((g) => g.key === A).people.some((p) => p.id === p1 && !p.moved), true);
  assert.deepEqual((await db.prepare('SELECT stage2_id, to_key FROM tc_go_moves ORDER BY id').all()).map((m) => [Number(m.stage2_id), m.to_key]), [[p1, B], [p5, A], [p1, A]]);
  // a drag onto a company not in Intake, or of somebody from another list, is dropped
  L = await ml.saveState(db, 'JS', { ...E, picks: { [B]: { decision: 'invite', way: 'post' } }, moves: { [p1]: 'n:nowhere', [d1]: A } }, 'J', L.version.id, JS);
  assert.equal(L.unchanged, true);
});

test('9. a Save of a whole list (130 companies, 400 people) is a few batched statements and quick', async () => {
  const db = await openDb();
  const ins = db.prepare(`INSERT INTO tc_go_stage2 (ch_contact_id, sender, name, company, email, link_code, gone, loaded_at) VALUES (?,?,?,?,?,?,0,?)`);
  for (let i = 0; i < 400; i++) await ins.run('B' + i, 'JS', 'Person ' + i, 'Company ' + (i % 130), `p${i}@example.com`, 'c' + i, at);
  const L = await ml.myList(db, 'JS');
  assert.equal(L.companies, 130);
  const picks = Object.fromEntries(L.groups.map((g, i) => [g.key, { decision: i % 3 ? 'invite' : 'no', way: ['digital', 'in_person', 'post'][i % 3] }]));
  let n = 0;
  const counting = { ...db, prepare: (sql) => { n++; return db.prepare(sql); }, transaction: (fn) => db.transaction((tx) => fn({ ...tx, prepare: (sql) => { n++; return tx.prepare(sql); } })) };
  const t0 = Date.now();
  const after = await ml.saveState(counting, 'JS', { picks, out: [], moves: {} }, 'J', 0, JS);
  assert.equal(after.figures.todo, 0);
  assert.ok(n < 40, `statements: ${n}`);
  assert.ok(Date.now() - t0 < 5000);
});

// the page's own logic, read out of app.html between its markers and run here
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const BLOCK = APP.slice(APP.indexOf('// MLSTATE START'), APP.indexOf('// MLSTATE END'));
const P = new Function(`${BLOCK}; return { mlView, mlApply, mlShows, mlClone, mlSame };`)();

test('the sandbox on the page: Undo steps back, a pressed button again clears, a drag moves the person in the view, Invite without a way is still to decide', () => {
  const base = { groups: [{ key: 'id:1', name: 'A', intake: true, people: [{ id: 1, label: 'P1' }, { id: 2, label: 'P2' }] }, { key: 'id:2', name: 'B', intake: true, people: [{ id: 3, label: 'P3' }] }] };
  const s0 = { picks: {}, out: [], moves: {} };
  const undo = [];
  const step = (w, a) => { undo.push(P.mlClone(w)); return P.mlApply(w, a); };
  let w = step(s0, { type: 'decide', key: 'id:1', decision: 'invite' });
  assert.deepEqual(P.mlView(base, w).figures, { todo: 3, invite: 0, no: 0 }, '4. Invite without a way');
  assert.equal(P.mlShows(P.mlView(base, w).groups[0], 'todo'), true);
  w = step(w, { type: 'way', key: 'id:1', way: 'digital' });
  w = step(w, { type: 'out', id: 2 });
  w = step(w, { type: 'move', id: 3, key: 'id:1', home: 'id:2' });
  let V = P.mlView(base, w);
  assert.deepEqual(V.figures, { todo: 0, invite: 2, no: 1 });
  assert.equal(V.groups.length, 1, 'B is empty after the drag');
  assert.equal(V.groups[0].people.find((p) => p.id === 3).from, 'id:2');
  assert.equal(P.mlShows(V.groups[0], 'todo'), false);
  w = undo.pop(); w = undo.pop();   // Ctrl+Z twice: the drag and the tap-out are gone
  assert.deepEqual(P.mlView(base, w).figures, { todo: 1, invite: 2, no: 0 });
  w = P.mlApply(w, { type: 'decide', key: 'id:1', decision: 'invite' });   // the same button again clears, the way with it
  assert.deepEqual(w.picks['id:1'], { decision: null, way: null });
  assert.deepEqual(s0, { picks: {}, out: [], moves: {} }, 'a change never touches the state it came from');
  // 2. a draft equal to what is saved is no unsaved change, whatever its order
  assert.equal(P.mlSame({ picks: { b: { decision: 'no' }, a: { decision: 'invite', way: 'post' } }, out: [3, 1], moves: {} }, { picks: { a: { decision: 'invite', way: 'post' }, b: { decision: 'no', way: null }, c: { decision: null, way: null } }, out: [1, 3], moves: {} }), true);
  assert.equal(P.mlSame({ picks: {}, out: [1], moves: {} }, { picks: {}, out: [], moves: {} }), false);
});

test('the page: Save / Undo / status with the full date, Ctrl+Z, Ctrl+S on nothing does nothing, autosave soon after a change and as the page hides, an old autosave ignored, the leave prompt, errors on the page', () => {
  const fn = (name) => { const i = APP.indexOf(`function ${name}(`); return APP.slice(i, APP.indexOf('\n}\n', i)); };
  assert.ok(APP.includes("else if (place === 'mylist') viewTcMyList(arg ? decodeURIComponent(arg) : '');"));
  assert.ok(APP.includes("filter: 'all'"), 'B. All is on by default');
  assert.ok(APP.includes('onclick="tcMlSave()">Save</button>') && APP.includes('onclick="tcMlUndo()" title="Ctrl+Z">Undo</button>'));
  assert.ok(APP.includes("return `${o.weekday} ${o.day} ${o.month}, ${o.hour}:${o.minute}`;"), '6. full date and time');
  for (const t of ["'Saving…'", '`Saved ${tcMlTime(S.statusAt)}`', '`Unsaved changes · autosaved ${tcMlTime(S.statusAt)}`', "'Unsaved changes'"]) assert.ok(APP.includes(t), t);
  assert.ok(APP.includes("String(e.key).toLowerCase() === 'z') { e.preventDefault(); tcMlUndo(); }"));
  assert.match(fn('tcMlSave'), /if \(!T_ML\.dirty\) return true;/, '5. nothing to save');
  assert.match(fn('tcMlSave'), /T_ML\.seq\+\+/, '2. an autosave on its way is ignored');
  assert.match(fn('tcMlSave'), /base: T_ML\.version/, '1. the version the page loaded');
  assert.doesNotMatch(fn('tcMlSave'), /alert\(/, '3. errors on the page');
  assert.match(fn('tcMlAutosave'), /S\.seq !== seq/);
  assert.match(fn('viewTcMyList'), /!mlSame\(base\.draft\.state, T_ML\.saved\)/, '2. a draft equal to the saved list is no change');
  assert.ok(APP.includes('TCML_SOON = setTimeout(tcMlAutosave, 4000)'), '6. a few seconds after a change');
  assert.ok(APP.includes("window.addEventListener('pagehide', tcMlAutosaveNow)") && APP.includes("document.visibilityState === 'hidden') tcMlAutosaveNow()") && APP.includes('keepalive: true'), '6. phones');
  assert.ok(APP.includes('onclick="tcMlReload()">Load it</button>'), '1. load it');
  assert.ok(APP.includes("if (typeof tcMlMayLeave === 'function' && !tcMlMayLeave(location.hash || '')) return;"));
  assert.ok(APP.includes("modal('Save the changes?'") && APP.includes(`onclick="tcMlLeave('save')">Save</button>`) && APP.includes(`onclick="tcMlLeave('drop')">Don't save</button>`) && APP.includes('onclick="closeModal()">Cancel</button>'));
  assert.ok(APP.includes("window.addEventListener('beforeunload'"));
  assert.ok(APP.includes('draggable="true"') && APP.includes('ondrop="tcMlDrop(event,'));
  assert.ok(APP.includes("else if (place === 'postcards') viewTcPostcards();") && APP.includes('href="/api/tc/go/postcards.xlsx" download'));
  assert.ok(APP.includes('onclick="tcS2xNoCode(') && APP.includes('without an email or link'), '8. the people the email cannot reach');
});

test('the proposals he said yes to (12.11.2026): A outlined until picked, B All, C Pick a way, D No address, E Move to on a phone, F owner names', () => {
  // A: Invite and No outlined; the pick fills (Invite blue, No grey); the tile border follows
  assert.ok(APP.includes('class="btn sm yes" aria-pressed=') && APP.includes('class="btn sm nay" aria-pressed='));
  assert.ok(APP.includes(".tcml-yn .btn.btn.yes[aria-pressed=\"true\"]{background:var(--btn-bg)") && APP.includes(".tcml-yn .btn.btn.nay[aria-pressed=\"true\"]{background:#5b6472"));
  assert.ok(APP.includes("g.decision === 'invite' ? ' inv' : g.decision === 'no' ? ' no' : ''") && APP.includes('.tcml-t.no{border:2px solid #9aa3af'));
  // B: All, first, and it shows every company
  assert.ok(APP.includes("${fig('all', F.todo + F.invite + F.no, 'All')}${fig('todo'"));
  const g = { people: [{ decision: 'invite' }] };
  assert.equal(P.mlShows(g, 'all'), true); assert.equal(P.mlShows(g, 'todo'), false);
  // C
  assert.ok(APP.includes(`\${g.way ? '' : '<div class="tcml-pick">Pick a way</div>'}`));
  // D
  assert.ok(APP.includes("noaddr: (x) => !String(x.address || '').trim()") && APP.includes("${fig('noaddr', 'No address')}"));
  // E: no drag on a phone, a Move to… list instead, onto a company in Intake only
  assert.ok(APP.includes("window.matchMedia('(max-width: 760px)')") && APP.includes('onchange="tcMlMoveTo(${Number(p.id)}, this.value)"><option value="">Move to…</option>'));
  assert.ok(APP.includes('const targets = T_ML.base.groups.filter((g) => g.intake)'));
  assert.ok(APP.includes("const drop = g.intake && !narrow ?"));
  // F
  assert.ok(APP.includes('>${esc(T_ML.names[c] || c)}</button>'));
  assert.deepEqual(ml.listNames(['JS', 'DS']), { JS: 'Jānis Sticenko', DS: 'Dmitrijs Semjonovs' });
});

test('over the wire: own list only, an admin any; 409 with who and when on an old version; the postcard list is their own; signed out nothing', async (t) => {
  const keep = {};
  for (const k of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'CRM_DB_DATABASE_URL_UNPOOLED', 'INTAKE_DATABASE_URL']) { keep[k] = process.env[k]; process.env[k] = ''; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-mylist-'));
  const file = path.join(dir, 'ml.db');
  const db = await openDb(file);
  const ids = await seed(db);
  for (const [id, email, role] of [['u_js', JS, 'user'], ['u_ds', 'ds@novikontas.org', 'user'], ['u_ad', AD, 'admin']]) {
    await db.prepare(`INSERT INTO crm_users (id, email, display_name, password_hash, role, active, session_version, created_at) VALUES (?,?,?,NULL,?,1,0,?)`).run(id, email, id, role, at);
    await db.prepare('INSERT INTO crm_user_areas (user_id, area, granted_at, granted_by) VALUES (?,?,?,?)').run(id, 'tc', at, 'test');
  }
  await db.prepare('INSERT INTO sync_state (name, value, ran_at) VALUES (?,?,?)').run('areas_backfill_2026_10', 'done', at);
  await db.close();
  for (const [k, v] of Object.entries(keep)) process.env[k] = v ?? '';
  const s = await start({ CRM_DB: file, DATASET: 'empty', CRM_RITVARS_PASSWORD: '', CRM_AIGARS_PASSWORD: '', CRM_ADMISSIONS_PASSWORD: '' });
  t.after(() => { s.child.kill(); });
  const js = session(JS, 'user'), ds = session('ds@novikontas.org', 'user'), ad = session(AD, 'admin');
  const get = (p, cookie) => fetch(s.base + p, { headers: cookie ? { cookie } : {} });
  const post = (p, cookie, b) => fetch(s.base + p, { method: 'POST', headers: { origin: s.base, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(b) });
  const st = { picks: { [ids.A]: { decision: 'invite', way: 'in_person' } }, out: [], moves: {} };
  assert.deepEqual((await (await get('/api/tc/go/mylist', js)).json()).lists, ['JS']);
  assert.equal((await (await get('/api/tc/go/mylist', ad)).json()).names.JS, 'Jānis Sticenko', 'F. the admin sees the names');
  assert.equal((await get('/api/tc/go/mylist?sender=DS', js)).status, 403);
  assert.equal((await post('/api/tc/go/mylist/save', js, { sender: 'DS', state: E })).status, 403);
  assert.equal((await post('/api/tc/go/mylist/draft', js, { sender: 'DS', state: E })).status, 403);
  assert.equal((await post('/api/tc/go/mylist/draft', js, { sender: 'JS', state: st, base: 0 })).status, 200);
  assert.ok((await (await get('/api/tc/go/mylist?sender=JS', js)).json()).draft, 'the owner gets their draft back');
  assert.equal((await (await get('/api/tc/go/mylist?sender=JS', ad)).json()).draft, null, 'the admin does not get the owner draft');
  assert.equal((await post('/api/tc/go/mylist/save', js, { sender: 'JS', state: st, base: 0 })).status, 200);
  const late = await post('/api/tc/go/mylist/save', ad, { sender: 'JS', state: { ...st, picks: { [ids.B]: { decision: 'no' } } }, base: 0 });
  assert.equal(late.status, 409);
  const body = await late.json();
  assert.equal(body.conflict, true); assert.match(body.error, /^Saved by .+ - load it\?$/);
  assert.equal((await (await get('/api/tc/go/postcards', js)).json()).rows.length, 3);
  assert.equal((await (await get('/api/tc/go/postcards', ds)).json()).rows.length, 0, 'DS sees only the DS rows');
  assert.equal((await get('/api/tc/go/postcards.xlsx', js)).status, 200);
  assert.equal((await get('/api/tc/go/mylist?sender=DS', ad)).status, 200);
  assert.equal((await (await get('/api/tc/go/postcards', ad)).json()).rows.length, 3);
  assert.notEqual((await get('/api/tc/go/mylist?sender=JS')).status, 200);
  assert.notEqual((await get('/api/tc/go/postcards')).status, 200);
  assert.notEqual((await post('/api/tc/go/mylist/save', null, { sender: 'JS', state: st })).status, 200);
});
