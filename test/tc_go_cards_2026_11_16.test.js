// THE GRAND OPENING CARDS (patch 147, 16.11.2026; his picks "Automatic (Recommended)", "A: card table (Rec.)", "Yes
// (Recommended)"). A company saved as Invite gets the next free card in board order; a card stays its company's for good;
// No = out of the export, Invite again = the same card; the export is signed-in only and fails closed without the cards.
// The card store here is an in-memory stand-in with the same rules as intake_go.card_link (docs/client-hub/intake_go_cards.sql).
// Every person and company here is invented.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ROOT, start, session } from './security_helpers.js';
const { openDb } = await import('../src/db.js');
const ml = await import('../src/tcmylist.js');
const cards = await import('../src/tccards.js');
const { nameKey } = await import('../src/tc.js');

const at = new Date().toISOString();
const PLACES = ['1A', '1B', '1V', '2A', '9V', '10A', '35V'];
function fakeStore(places = PLACES) {
  const rows = places.map((p, i) => ({ code: 'abcde' + 'fghjkmn'[i], place: p, company_key: null, company: null, linked_at: null }));
  const calls = [];
  return {
    rows, calls,
    async link(db, key, company, by) {
      calls.push(key);
      if (!/^(id:[0-9]{1,12}|n:.{1,200})$/.test(key)) throw new Error('card_link: not a company key');
      const had = rows.find((r) => r.company_key === key);
      if (had) return { code: had.code, place: had.place };
      const free = rows.filter((r) => !r.company_key).sort((a, b) => cards.placeOrder(a.place, b.place))[0];
      if (!free) throw new Error('card_link: no free card');
      Object.assign(free, { company_key: key, company, linked_at: at, linked_by: by });
      return { code: free.code, place: free.place };
    },
    async all() { return rows.filter((r) => r.company_key); },
  };
}

async function seed(db) {
  const co = async (name) => Number((await db.prepare(`INSERT INTO tc_companies (name, name_key, country, status, created_at) VALUES (?,?,?,?,?)`).run(name, nameKey(name), 'Norway', 'not_contacted', at)).lastInsertRowid);
  const a = await co('Alphaport Example AS'), b = await co('Betaship Example SIA'), d = await co('Deltaline Example Ltd');
  const row = async (sender, ch, name, company, email, companyId) => {
    const id = Number((await db.prepare(`INSERT INTO tc_go_stage2 (ch_contact_id, sender, name, company, email, gone, loaded_at, loaded_by) VALUES (?,?,?,?,?,0,?,?)`)
      .run(ch, sender, name, company, email, at, 'test')).lastInsertRowid);
    if (companyId) await db.prepare(`INSERT INTO tc_company_contacts (company_id, name, email, ch_contact_id, created_at) VALUES (?,?,?,?,?)`).run(companyId, name, email, ch, at);
    return id;
  };
  await row('JS', 'CD1', 'Anna Example', 'Alphaport Example AS', 'anna@alphaport-example.com', a);
  await row('JS', 'CD2', 'riga@alphaport-example.com', 'Alphaport Example AS', 'riga@alphaport-example.com', a);
  await row('JS', 'CD3', 'Ben Example', 'Alphaport Example AS', 'ben@alphaport-example.com', a);
  await row('JS', 'CD4', 'Carla Example', 'Betaship Example SIA', 'carla@betaship-example.com', b);
  await row('JS', 'CD5', 'Nils Example', 'Namesonly Example', 'nils@namesonly-example.com', null);
  await row('DS', 'CD6', 'Dora Example', 'Deltaline Example Ltd', 'dora@deltaline-example.com', d);
  return { A: 'id:' + a, B: 'id:' + b, D: 'id:' + d, N: 'n:' + nameKey('Namesonly Example') };
}
const save = async (db, code, picks, out = []) => { const L = await ml.myList(db, code); return ml.saveState(db, code, { picks, out, moves: {} }, 'Tester', L.version.id); };

test('board order: 1A 1B ... 1V, 2A ... 9V, 10A ... 35V (the number as a number)', () => {
  assert.deepEqual(['10A', '2A', '1V', '35V', '1A', '9V', '1B'].sort(cards.placeOrder), ['1A', '1B', '1V', '2A', '9V', '10A', '35V']);
  assert.equal(cards.qrUrl('abcdef'), 'https://novikontas.org/grand-opening?k=abcdef');
});

test('no card store (the local prototype): nothing is linked, the Save still works, the export says not reachable', async () => {
  cards.setStore(null);
  const db = await openDb();
  const { A } = await seed(db);
  const L = await save(db, 'JS', { [A]: { decision: 'invite', way: 'digital' } });
  assert.equal(L.groups.find((g) => g.key === A).decision, 'invite');
  assert.equal(await ml.cardRows(db, ['JS']), null);
  assert.equal((await ml.linkCards(db, ['JS'], 'x')).reachable, false);
});

test('Save as Invite links the next free card in board order; one company = one card; a name-only company too', async (t) => {
  const st = fakeStore(); cards.setStore(st); t.after(() => cards.setStore(null));
  const db = await openDb();
  const { A, B, N } = await seed(db);
  await save(db, 'JS', { [A]: { decision: 'invite', way: 'digital' } });
  assert.deepEqual(st.rows.filter((r) => r.company_key).map((r) => [r.place, r.company_key, r.company, r.linked_by]), [['1A', A, 'Alphaport Example AS', 'Tester']]);
  await save(db, 'JS', { [A]: { decision: 'invite', way: 'digital' }, [B]: { decision: 'invite', way: 'post' }, [N]: { decision: 'invite', way: 'in_person' } });
  const got = Object.fromEntries(st.rows.filter((r) => r.company_key).map((r) => [r.company_key, r.place]));
  assert.equal(got[A], '1A', 'Alphaport keeps its card');
  assert.deepEqual(new Set([got[B], got[N]]), new Set(['1B', '1V']), 'the next two free, 1V before 2A');
  assert.equal(st.rows.filter((r) => r.company_key).length, 3);
});

test('an Invite without a way still gets its card (the company is invited); a No never gets one', async (t) => {
  const st = fakeStore(); cards.setStore(st); t.after(() => cards.setStore(null));
  const db = await openDb();
  const { A, B } = await seed(db);
  await save(db, 'JS', { [A]: { decision: 'invite', way: null }, [B]: { decision: 'no' } });
  assert.deepEqual(st.rows.filter((r) => r.company_key).map((r) => r.company_key), [A]);
});

test('his rule: a card stays its company\'s for good - No drops it from the export, Invite again gives the same card, never a second company', async (t) => {
  const st = fakeStore(); cards.setStore(st); t.after(() => cards.setStore(null));
  const db = await openDb();
  const { A, B } = await seed(db);
  await save(db, 'JS', { [A]: { decision: 'invite', way: 'digital' } });
  const cardA = st.rows.find((r) => r.company_key === A).code;
  await save(db, 'JS', { [A]: { decision: 'no' } });
  assert.equal(st.rows.find((r) => r.code === cardA).company_key, A, 'still linked after No');
  assert.deepEqual((await ml.cardRows(db, ['JS'])).map((r) => r.company), [], 'out of the export');
  await save(db, 'JS', { [A]: { decision: 'no' }, [B]: { decision: 'invite', way: 'digital' } });
  assert.notEqual(st.rows.find((r) => r.company_key === B).code, cardA, 'B does not get A\'s card');
  await save(db, 'JS', { [A]: { decision: 'invite', way: 'digital' }, [B]: { decision: 'invite', way: 'digital' } });
  assert.equal(st.rows.find((r) => r.company_key === A).code, cardA, 'Invite again = the same card');
  assert.equal(st.rows.filter((r) => r.company_key).length, 2);
});

test('a card failure (no free card) never undoes the Save; the next Save tries again', async (t) => {
  const st = fakeStore(['1A']); cards.setStore(st); t.after(() => cards.setStore(null));
  const db = await openDb();
  const { A, B } = await seed(db);
  await save(db, 'JS', { [A]: { decision: 'invite', way: 'digital' } });
  const L = await save(db, 'JS', { [A]: { decision: 'invite', way: 'digital' }, [B]: { decision: 'invite', way: 'digital' } });
  assert.equal(L.groups.find((g) => g.key === B).decision, 'invite', 'the Save stands');
  const rows = await ml.cardRows(db, ['JS']);
  assert.deepEqual(rows.map((r) => [r.company, r.place]), [['Alphaport Example AS', '1A'], ['Betaship Example SIA', '']], 'the company without a card comes last, not hidden');
});

test('the export: board order, QR link, delivery, Dear = first invited person with a name, all invited names, owner; a person tapped out is not in it', async (t) => {
  const st = fakeStore(); cards.setStore(st); t.after(() => cards.setStore(null));
  const db = await openDb();
  const { A, B, D } = await seed(db);
  const L0 = await ml.myList(db, 'JS');
  const ben = L0.groups.find((g) => g.key === A).people.find((p) => p.label === 'Ben Example').id;
  await save(db, 'JS', { [B]: { decision: 'invite', way: 'post' } });
  await save(db, 'JS', { [A]: { decision: 'invite', way: 'digital' }, [B]: { decision: 'invite', way: 'post' } }, [ben]);
  await save(db, 'DS', { [D]: { decision: 'invite', way: 'in_person' } });
  const rows = await ml.cardRows(db, ['JS', 'DS']);
  assert.deepEqual(rows.map((r) => r.place), ['1A', '1B', '1V']);
  const a = rows.find((r) => r.company === 'Alphaport Example AS');
  assert.equal(a.place, '1B'); assert.match(a.qr, /^https:\/\/novikontas\.org\/grand-opening\?k=[a-z0-9]{6}$/);
  assert.equal(a.way, 'Digital'); assert.equal(a.dear, 'Anna Example'); assert.equal(a.names, 'Anna Example', 'the mailbox has no name, Ben is tapped out');
  assert.equal(a.owner, 'Jānis Sticenko');
  assert.equal(rows.find((r) => r.company === 'Betaship Example SIA').way, 'By mail');
  assert.equal(rows.find((r) => r.company === 'Deltaline Example Ltd').owner, 'Dmitrijs Semjonovs');
  assert.deepEqual((await ml.cardRows(db, ['DS'])).map((r) => r.company), ['Deltaline Example Ltd'], 'an owner sees their own list only');
});

test('the one-off and every Save use the same rule: linkCards links each invited company once and counts', async (t) => {
  const st = fakeStore(); cards.setStore(st);
  const db = await openDb();
  const { A, D } = await seed(db);
  cards.setStore(null);
  await save(db, 'JS', { [A]: { decision: 'invite', way: 'digital' } });
  await save(db, 'DS', { [D]: { decision: 'invite', way: 'digital' } });
  cards.setStore(st); t.after(() => cards.setStore(null));
  assert.deepEqual(await ml.linkCards(db, ['JS', 'DS'], 'One-off'), { invited: 2, linked: 2, had: 0, failed: 0, reachable: true });
  assert.deepEqual(await ml.linkCards(db, ['JS', 'DS'], 'One-off'), { invited: 2, linked: 0, had: 2, failed: 0, reachable: true }, 'run twice = nothing new');
});

test('the database part grants exactly two things to intake_app, in a schema the Data API does not publish', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'docs', 'client-hub', 'intake_go_cards.sql'), 'utf8').replace(/--[^\n]*/g, '').toLowerCase();
  const grants = [...sql.matchAll(/\bgrant\s+[^;]+;/g)].map((m) => m[0].replace(/\s+/g, ' '));
  assert.deepEqual(grants, ['grant usage on schema intake_go to intake_app;', 'grant select on intake_go.cards to intake_app;',
    'grant execute on function intake_go.card_link(text, text, text) to intake_app;']);
  assert.ok(sql.includes('revoke all on schema intake_go from public;'));
  assert.ok(sql.includes('revoke all on intake_go.cards from public, anon, authenticated;'));
  assert.ok(sql.includes('revoke all on function intake_go.card_link(text, text, text) from public, anon, authenticated;'));
  assert.ok(/security definer\s+set search_path = pg_catalog, public/.test(sql), 'a definer function with a fixed path');
  assert.ok(!/\bdelete\b|\btruncate\b|\binsert into public\.std_go_cards|\bset company_key = null/.test(sql), 'it never removes, clears or creates a card');
  assert.ok(/where c\.code = v_code and c\.company_key is null/.test(sql), 'it only takes a free card');
  assert.ok(sql.includes('select code, place, company_key, company, linked_at, linked_by\nfrom public.std_go_cards'), 'the view: these columns only');
});

test('over HTTP: the export needs a session and a list; without the cards it fails closed (503), never an empty file', async (t) => {
  const keep = {};
  for (const k of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'CRM_DB_DATABASE_URL_UNPOOLED', 'INTAKE_DATABASE_URL']) { keep[k] = process.env[k]; process.env[k] = ''; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-cards-'));
  const file = path.join(dir, 'c.db');
  const db = await openDb(file);
  await seed(db);
  const JS = 'js@novikontas.org', OT = 'someone@novikontas.org';
  for (const [id, email, role] of [['u_js', JS, 'user'], ['u_ot', OT, 'user']]) {
    await db.prepare(`INSERT INTO crm_users (id, email, display_name, password_hash, role, active, session_version, created_at) VALUES (?,?,?,NULL,?,1,0,?)`).run(id, email, id, role, at);
    await db.prepare('INSERT INTO crm_user_areas (user_id, area, granted_at, granted_by) VALUES (?,?,?,?)').run(id, 'tc', at, 'test');
  }
  await db.prepare('INSERT INTO sync_state (name, value, ran_at) VALUES (?,?,?)').run('areas_backfill_2026_10', 'done', at);
  await db.close();
  for (const [k, v] of Object.entries(keep)) process.env[k] = v ?? '';
  const s = await start({ CRM_DB: file, DATASET: 'empty', CRM_RITVARS_PASSWORD: '', CRM_AIGARS_PASSWORD: '', CRM_ADMISSIONS_PASSWORD: '' });
  t.after(() => { s.child.kill(); });
  const get = (p, cookie) => fetch(s.base + p, { headers: cookie ? { cookie } : {} });
  assert.notEqual((await get('/api/tc/go/cards.csv')).status, 200, 'no session, no file');
  assert.equal((await get('/api/tc/go/cards.csv', session(OT, 'user'))).status, 403, 'an account with no list');
  const r = await get('/api/tc/go/cards.csv', session(JS, 'user'));
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /not reachable/);
});

test('the CSV writes a cell that starts with = + - @ as text', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
  const i = src.indexOf("p === '/api/tc/go/cards.csv'");
  const body = src.slice(i, src.indexOf('return res.end(', i));
  const cell = new Function('return ' + body.match(/const cell = (\(v\) => \{[^\n]+\});/)[1])();
  assert.equal(cell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(cell('+371 2'), "'+371 2");
  assert.equal(cell('Anna; Ben'), '"Anna; Ben"');
  assert.equal(cell('Plain'), 'Plain');
});
