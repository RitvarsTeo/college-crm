// THE PERSON IN CHARGE IS AN ACCOUNT WHERE ONE EXISTS (the owner, 20.10.2026). A name written in the Excel is linked to an
// Intake account when it clearly is that account (full name, case and diacritics folded, or the email's name); every
// other name stays a plain name. An admin picks the person in charge on the company page; "Mine" on Companies and Next
// contacts is the signed-in account's. Invented names only (example.com): no real person reaches a test.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

for (const k of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'CRM_DB_DATABASE_URL_UNPOOLED']) process.env[k] = '';
const { openDb } = await import('../src/db.js');
const tc = await import('../src/tc.js');
const pic = await import('../src/tcpic.js');

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fn = (name) => { const at = APP.indexOf(name); assert.ok(at >= 0, name); return APP.slice(at, APP.indexOf('\n}\n', at) + 3); };

async function account(db, id, email, name, { areas = ['tc'], active = 1, role = 'user' } = {}) {
  await db.prepare(`INSERT INTO crm_users (id, email, display_name, role, active, created_at) VALUES (?,?,?,?,?,?)`)
    .run(id, email, name, role, active, '2026-10-20T08:00:00Z');
  for (const a of areas) {
    await db.prepare('INSERT INTO crm_user_areas (user_id, area, granted_at, granted_by) VALUES (?,?,?,?)').run(id, a, '2026-10-20T08:00:00Z', 'test');
  }
}
// The companies as the Excel import leaves them: a name in pic_name, no account linked.
async function world() {
  const db = await openDb();
  const add = async (name, p, extra = {}) => (await tc.addCompany(db, { name, country: 'Latvia', ...extra }, 'Importer')).id
    && db.prepare('UPDATE tc_companies SET pic_name = ? WHERE name = ?').run(p, name);
  await add('Example Tankers', 'Ēriks Paraugs');          // the account's display name, diacritics folded
  await add('Sample Offshore', 'Ēriks Paraugs');
  await add('Demo Wind', 'Ilze Piemēre');                 // the account says only "Ilze"; its email says ilze.piemere
  await add('Mock Marine', 'Pēteris Bezkonta');           // a colleague without Intake access
  await add('Pilot Crewing', 'Ēriks Paraugs ; Pēteris Bezkonta');   // two people: never linked, Mine for both
  await add('Draft Energy', 'Anna');                      // one word: never a clear match
  await add('Fictive Bulk', 'Jānis Divreiz');             // two accounts answer to this name: left alone
  await add('Dummy Ferries', null);
  await account(db, 'u1', 'eriks.paraugs@example.com', 'Eriks Paraugs');
  await account(db, 'u2', 'ilze.piemere@example.com', 'Ilze');
  await account(db, 'u3', 'anna@example.com', 'Anna');
  await account(db, 'u4', 'janis.divreiz@example.com', 'Jānis');
  await account(db, 'u5', 'jd@example.com', 'Janis Divreiz');
  await account(db, 'u6', 'old.colleague@example.com', 'Old Colleague', { active: 0 });
  await account(db, 'u7', 'academy.only@example.com', 'Academy Only', { areas: ['academy'] });
  const id = async (name) => Number((await db.prepare('SELECT id FROM tc_companies WHERE name = ?').get(name)).id);
  return { db, id };
}

test('a name is an account only when it clearly is one: full name or the email\'s name, folded; never one word, two people or two accounts', async () => {
  assert.equal(pic.foldName('Māris  Cīrulis'), 'maris cirulis');
  assert.deepEqual([...pic.accountKeys({ display_name: 'Ilze', email: 'ilze.piemere@example.com' })], ['ilze piemere']);
  assert.deepEqual([...pic.accountKeys({ display_name: 'Maris Cirulis', email: 'mc@example.com' })], ['maris cirulis']);
  assert.deepEqual(pic.picParts('Ēriks Paraugs ; Pēteris Bezkonta'), ['eriks paraugs', 'peteris bezkonta']);
  const { db, id } = await world();
  const index = await pic.accountIndex(db);
  assert.equal(pic.matchAccount(index, 'ĒRIKS PARAUGS').id, 'u1');
  assert.equal(pic.matchAccount(index, 'Ilze Piemēre').id, 'u2', 'the email\'s name');
  assert.equal(pic.matchAccount(index, 'Anna'), null, 'one word is not a clear match');
  assert.equal(pic.matchAccount(index, 'Jānis Divreiz'), null, 'two accounts answer to it');
  assert.equal(pic.matchAccount(index, 'Old Colleague'), null, 'a switched-off account is no match');
  assert.equal(pic.matchAccount(index, 'Ēriks Paraugs ; Pēteris Bezkonta'), null, 'two people');

  const first = await pic.linkPicAccounts(db, { at: '2026-10-20T09:00:00Z' });
  assert.deepEqual(first, { linked: 3, names: { 'Ēriks Paraugs': 2, 'Ilze Piemēre': 1 } });
  const row = await db.prepare('SELECT pic_name, pic_email FROM tc_companies WHERE id = ?').get(await id('Example Tankers'));
  assert.deepEqual({ ...row }, { pic_name: 'Ēriks Paraugs', pic_email: 'eriks.paraugs@example.com' }, 'the Excel\'s name stays, the account is beside it');
  for (const n of ['Mock Marine', 'Pilot Crewing', 'Draft Energy', 'Fictive Bulk']) {
    assert.equal((await db.prepare('SELECT pic_email FROM tc_companies WHERE id = ?').get(await id(n))).pic_email, null, n + ' stays a plain name');
  }
  const log = (await tc.getCompany(db, await id('Demo Wind'))).log.find((e) => e.field === 'pic_account');
  assert.equal(log.body, 'Person in charge linked to the Intake account of Ilze Piemēre');
  assert.equal(log.origin, 'system');
  assert.deepEqual(await pic.linkPicAccounts(db), { linked: 0, names: {} }, 'once: the second boot links nothing');
});

test('Mine on Companies: the account\'s companies, linked or named alongside another; one line per person in the filter', async () => {
  const { db, id } = await world();
  await pic.linkPicAccounts(db);
  const eriks = { email: 'eriks.paraugs@example.com', name: 'Eriks Paraugs' };
  const mine = await tc.listCompanies(db, { pic: 'me' }, { size: 2000, me: eriks });
  assert.deepEqual(mine.rows.map((c) => c.name).sort(), ['Example Tankers', 'Pilot Crewing', 'Sample Offshore']);
  assert.equal(mine.facets.mine, 3);
  const peteris = await tc.listCompanies(db, { pic: 'me' }, { size: 2000, me: { email: '', name: 'Pēteris Bezkonta' } });
  assert.deepEqual(peteris.rows.map((c) => c.name).sort(), ['Mock Marine', 'Pilot Crewing'], 'a name without an account still finds its own');
  assert.equal((await tc.listCompanies(db, { pic: 'me' }, { size: 2000 })).total, 0, 'nobody signed in: Mine is nobody\'s');
  assert.equal((await tc.listCompanies(db, { pic: 'me' }, { size: 2000, me: { email: 'anna@example.com', name: 'Anna' } })).total, 0,
    'one word never claims a company');

  const all = await tc.listCompanies(db, {}, { size: 2000, me: eriks });
  const line = all.facets.pics.find(([k]) => k === 'u:u1');
  assert.deepEqual(line, ['u:u1', 2, 'Ēriks Paraugs'], 'the account, under the name written on its companies');
  assert.ok(all.facets.pics.some(([k, n]) => k === 'Mock Marine' || (k === 'Pēteris Bezkonta' && n === 1)));
  assert.equal((await tc.listCompanies(db, { pic: 'u:u1' }, { size: 2000 })).total, 2);
  assert.equal((await tc.listCompanies(db, { pic: 'Pēteris Bezkonta' }, { size: 2000 })).total, 1, 'a plain name filters by the name');
  // an admin picks the account for a company the Excel spelled differently: still one line, one person
  await tc.editCompany(db, await id('Dummy Ferries'), { pic: 'u:u1' }, 'Admin');
  const after = await tc.listCompanies(db, {}, { size: 2000 });
  assert.deepEqual(after.facets.pics.find(([k]) => k === 'u:u1'), ['u:u1', 3, 'Ēriks Paraugs']);
});

test('Mine on Next contacts: the account\'s next communications; an account or a plain name picks the others', async () => {
  const { db, id } = await world();
  await pic.linkPicAccounts(db);
  for (const n of ['Example Tankers', 'Demo Wind', 'Mock Marine', 'Pilot Crewing']) await tc.setNext(db, await id(n), { due: '2030-01-10' }, 'Admin');
  const eriks = { email: 'eriks.paraugs@example.com', name: 'Eriks Paraugs' };
  const me = await tc.nextList(db, { owner: 'me', me: eriks });
  assert.deepEqual(me.rows.map((r) => r.name).sort(), ['Example Tankers', 'Pilot Crewing']);
  assert.equal(me.counts.later, 2);
  assert.deepEqual((await tc.nextList(db, { owner: 'u:u2' })).rows.map((r) => r.name), ['Demo Wind']);
  assert.deepEqual((await tc.nextList(db, { owner: 'Pēteris Bezkonta' })).rows.map((r) => r.name), ['Mock Marine']);
  assert.equal((await tc.nextList(db, {})).rows.length, 4, 'everyone');
});

test('the admin\'s pick: accounts that open Training Centre first, then the plain names; a pick is logged; nobody else is accepted', async () => {
  const { db, id } = await world();
  await pic.linkPicAccounts(db);
  const m = await tc.meta(db);
  const accounts = m.pics.filter((p) => p.account);
  assert.deepEqual(accounts.map((p) => [p.value, p.label]),
    [['u:u3', 'Anna'], ['u:u1', 'Ēriks Paraugs'], ['u:u2', 'Ilze Piemēre'], ['u:u5', 'Janis Divreiz'], ['u:u4', 'Jānis']],
    'Training Centre accounts only, each under the name its companies carry');
  assert.ok(!m.pics.some((p) => /Old Colleague|Academy Only/.test(p.label)), 'switched off or Academy only: not on the list');
  const plain = m.pics.filter((p) => !p.account).map((p) => p.value);
  assert.deepEqual(plain, ['Ēriks Paraugs ; Pēteris Bezkonta', 'Pēteris Bezkonta'],
    'names that are no account; "Anna" is the account, and "Jānis Divreiz" is spelled as an account the admin picks instead');
  assert.equal(m.pics.findIndex((p) => !p.account), accounts.length, 'the accounts come first');

  const mock = await id('Mock Marine');
  assert.deepEqual(await tc.editCompany(db, mock, { pic: 'u:u2' }, 'Admin'), { changed: 1 });
  let c = await tc.getCompany(db, mock);
  assert.deepEqual([c.pic, c.picEmail, c.picAccount.value], ['Ilze Piemēre', 'ilze.piemere@example.com', 'u:u2']);
  const line = c.log.find((e) => e.field === 'pic_name');
  assert.deepEqual([line.old_value, line.new_value, line.actor], ['Pēteris Bezkonta', 'Ilze Piemēre', 'Admin']);
  assert.deepEqual(await tc.editCompany(db, mock, { pic: 'u:u2' }, 'Admin'), { changed: 0 }, 'the same pick twice is no change');
  await tc.editCompany(db, mock, { pic: 'Pēteris Bezkonta' }, 'Admin');
  c = await tc.getCompany(db, mock);
  assert.deepEqual([c.pic, c.picEmail, c.picAccount], ['Pēteris Bezkonta', '', null], 'back to a plain name: the link goes too');
  await tc.editCompany(db, mock, { pic: 'eriks paraugs' }, 'Admin');
  assert.equal((await tc.getCompany(db, mock)).picEmail, 'eriks.paraugs@example.com', 'a typed name that clearly is an account is linked');
  await tc.editCompany(db, mock, { pic: '' }, 'Admin');
  assert.deepEqual([(await tc.getCompany(db, mock)).pic, (await tc.getCompany(db, mock)).picEmail], ['', ''], 'nobody');
  for (const bad of ['u:u6', 'u:u7', 'u:nobody']) {
    await assert.rejects(tc.editCompany(db, mock, { pic: bad }, 'Admin'), /from the list/, bad);
  }
  const { id: added } = await tc.addCompany(db, { name: 'Specimen Towage', country: 'Estonia', pic: 'u:u1' }, 'Admin');
  assert.equal((await tc.getCompany(db, added)).pic, 'Ēriks Paraugs');
  assert.equal((await tc.getCompany(db, added)).picEmail, 'eriks.paraugs@example.com');
});

function startServer(env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], {
      env: { ...process.env, PORT: '0', CRM_DB: ':memory:', DATASET: 'empty', CRM_AUTH: '', CRM_PUBLIC: '', VERCEL: '', ...env },
      stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const look = (d) => { out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, base: `http://127.0.0.1:${m[1]}` }); };
    child.stdout.on('data', look); child.stderr.on('data', look);
    child.on('exit', (code) => reject(new Error(`server exited (${code}): ${out}`)));
  });
}

test('the routes: only an admin changes the person in charge; everything else on a company stays everybody\'s', async (t) => {
  const s = await startServer();
  t.after(() => s.child.kill());
  const as = (who) => ({ 'x-acting-as': who, 'content-type': 'application/json' });
  const post = async (p, b, who) => { const r = await fetch(s.base + p, { method: 'POST', headers: as(who), body: JSON.stringify(b) }); return [r.status, await r.json()]; };
  const [, made] = await post('/api/tc/companies', { name: 'Model Subsea', country: 'Norway' }, 'Ieva');
  assert.ok(made.id, 'a user adds a company');
  const [st, refused] = await post('/api/tc/companies', { name: 'Model Dredging', country: 'Norway', pic: 'Somebody Example' }, 'Ieva');
  assert.equal(st, 403); assert.match(refused.error, /admin/);
  assert.equal((await post(`/api/tc/companies/${made.id}/edit`, { pic: 'Somebody Example' }, 'Ieva'))[0], 403);
  assert.equal((await post(`/api/tc/companies/${made.id}/edit`, { status: 'contacted' }, 'Ieva'))[0], 200, 'the status stays everybody\'s');
  assert.equal((await post(`/api/tc/companies/${made.id}/edit`, { pic: 'Somebody Example' }, 'Ritvars'))[0], 200);
  const r = await fetch(s.base + '/api/tc/companies?pic=me', { headers: as('Somebody Example') });
  assert.deepEqual((await r.json()).rows.map((c) => c.name), ['Model Subsea'], 'Mine on a laptop copy: the name in Acting as');
});

test('the screens: the picker is the admin\'s, on the company page and in Add company; Mine leads both filters', () => {
  const draw = fn('function tcDrawCompany(');
  assert.match(draw, /isAdmin\(\) \? `<dt>Person in charge<\/dt><dd class="tc-picdd">\$\{tcPicSelect\('tcPic', tcPicValue\(c\), ' onchange="tcEdit\(\{ pic: this\.value \}\)"'\)\}/);
  assert.match(fn('function tcOpenAdd('), /isAdmin\(\) \? `<div><label for="tcaPic">Person in charge<\/label>\$\{tcPicSelect\('tcaPic', ''\)\}/);
  assert.doesNotMatch(fn('function tcEditForm('), /tcePic/, 'one place to change it');
  const sel = fn('function tcPicSelect(');
  assert.match(sel, /<optgroup label="Intake accounts">/);
  assert.match(sel, /<optgroup label="No Intake access">/);
  assert.match(fn('function tcDrawCompanies('), /box\('pic', 'Person in charge', \[\['me', `Mine \$\{Number\(L\.facets\.mine \|\| 0\)\}`\]/);
  assert.match(fn('function tcDrawNext('), /\[\['me', 'Mine'\], \.\.\.T_META\.pics\.map\(\(p\) => \[p\.value, p\.label\]\)\]/);
});

test('a new person in charge takes the planned next contact with the company, and the move is logged (the owner, 20.10.2026)', async () => {
  const { db, id } = await world();
  await pic.linkPicAccounts(db);
  const mock = await id('Mock Marine');
  await tc.setNext(db, mock, { due: '2030-01-10', label: 'Send the offer' }, 'Admin');
  assert.equal((await tc.getCompany(db, mock)).next.owner, 'Pēteris Bezkonta', 'set while Pēteris was in charge');
  await tc.editCompany(db, mock, { pic: 'u:u2' }, 'Admin');
  let c = await tc.getCompany(db, mock);
  assert.deepEqual([c.next.owner, c.next.due, c.next.label], ['Ilze Piemēre', '2030-01-10', 'Send the offer'], 'the date and the label stay');
  const moved = c.log.find((e) => e.field === 'next_owner');
  assert.deepEqual([moved.kind, moved.old_value, moved.new_value, moved.actor], ['task', 'Pēteris Bezkonta', 'Ilze Piemēre', 'Admin']);
  assert.equal(moved.body, 'Send the offer on 2030-01-10 moved to Ilze Piemēre');
  const ilze = { email: 'ilze.piemere@example.com', name: 'Ilze' };
  assert.ok((await tc.nextList(db, { owner: 'me', me: ilze })).rows.some((r) => r.companyId === mock), "in Ilze's Mine now");
  assert.ok(!(await tc.nextList(db, { owner: 'Pēteris Bezkonta' })).rows.some((r) => r.companyId === mock), "out of Pēteris's");
  await tc.editCompany(db, mock, { status: 'contacted' }, 'Admin');
  assert.equal(c.log.filter((e) => e.field === 'next_owner').length, 1, 'only a change of the person in charge moves it');
  await tc.editCompany(db, mock, { pic: '' }, 'Admin');
  c = await tc.getCompany(db, mock);
  assert.equal(c.next.owner, '', 'nobody in charge: the next contact is nobody\'s');
  assert.equal(c.log.find((e) => e.field === 'next_owner').body, 'Send the offer on 2030-01-10 moved to nobody');
  const plain = await id('Draft Energy');
  await tc.editCompany(db, plain, { pic: 'u:u1' }, 'Admin');
  assert.equal((await tc.getCompany(db, plain)).log.filter((e) => e.field === 'next_owner').length, 0, 'no next contact planned: nothing to move');
});
