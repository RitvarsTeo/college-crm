// THE COMPANY TILES AND THE GIFT PER COMPANY (04.11.2026): the owner's pick. Every company here is invented.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { openDb } = await import('../src/db.js');
const go = await import('../src/tcgo.js');
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('Physical or Digital per company: Intake company by id, else the name in lower case; nothing is picked until an owner picks', async () => {
  const db = await openDb();
  assert.equal(go.giftKey(12, 'Minship'), 'id:12');
  assert.equal(go.giftKey(null, '  MINSHIP '), 'n:minship');
  await go.setGift(db, 'id:12', 'physical', 'Ritvars');
  await go.setGift(db, 'n:minship', 'physical', 'Ritvars');
  await go.setGift(db, 'n:minship', 'digital', 'Ritvars');
  assert.deepEqual(await go.giftMap(db), { 'id:12': 'physical', 'n:minship': 'digital' });
  await assert.rejects(go.setGift(db, 'bad', 'physical', 'Ritvars'), /Which company/);
  await assert.rejects(go.setGift(db, 'id:1', 'gold', 'Ritvars'), /Physical or digital/);
});

test('the tiles: one per company, same name whatever the capitals, a click opens the people, the gift buttons on each', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  assert.match(app, /const key = r\.companyId \? 'id:' \+ Number\(r\.companyId\) : 'n:' \+ String\(r\.company \|\| ''\)\.trim\(\)\.toLowerCase\(\);/);
  assert.match(app, /<div class="tcs2-tiles">/);
  assert.match(app, /onclick="tcS2SetGift\(\$\{k\}, 'physical'\)">🎁 Physical<\/button>/);
  assert.match(app, /const kind = \(T_S2\.gifts \|\| \{\}\)\[key\] === pick \? 'none' : pick;/);
  assert.match(app, /\$\{esc\(g\.name \|\| 'No company yet'\)\}/);
  const srv = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
  assert.match(srv, /p === '\/api\/tc\/go\/gift' && req\.method === 'POST'/);
});

test('met face to face: a meeting or exhibition logged, or a Season stage past On the list, marks the tile (a suggestion)', async () => {
  const db = await openDb();
  const tc = await import('../src/tc.js');
  const a = (await tc.addCompany(db, { name: 'Example Met AS', country: 'Norway' }, 'Ritvars')).id;
  const b = (await tc.addCompany(db, { name: 'Sample Unmet AS', country: 'Norway' }, 'Ritvars')).id;
  await tc.quickAdd(db, { companyId: a, name: 'Anna Example' }, 'Ritvars');
  const keys = await go.metKeys(db);
  assert.ok(keys.includes('id:' + a)); assert.ok(!keys.includes('id:' + b));
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  assert.match(app, /🤝 Met<\/span>/);
});

test('05.11 his correction: no gift is lit until picked; a second click clears it (kept as none, never deleted)', async () => {
  const db = await openDb();
  assert.deepEqual(await go.giftMap(db), {});
  await go.setGift(db, 'id:7', 'digital', 'Ritvars');
  await go.setGift(db, 'id:7', 'none', 'Ritvars');
  assert.deepEqual(await go.giftMap(db), {});
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  assert.match(app, /const tcS2Gift = \(g\) => \(\(T_S2\.gifts \|\| \{\}\)\[g\.key\] \|\| null\);/);
  assert.doesNotMatch(app, /Digital <b>\$\{tcN\(all\.length - phys\)\}/);
});

test('the demo in Intake: only the five accounts open it; every local link in the page is a file served beside it', async () => {
  const godemo = await import('../src/godemo.js');
  // 11.11.2026, the owner: "every Director and C level can see it from their account!"
  assert.deepEqual(godemo.viewers().sort(), ['ab@novikontas.org', 'aigars.kluga@novikontas.org', 'alma@novikontas.org', 'ds@novikontas.org', 'iljasemjonovs@novikontas.org', 'js@novikontas.org', 'marcis.zabovs@novikontas.org', 'mc@novikontas.org', 'ritvars.vilcins@novikontas.org']);
  assert.equal(godemo.mayView({ email: 'ilja.semjonovs@novikontas.org' }), false, 'the inactive address stays out');
  for (const e of ['ds@novikontas.org', 'JS@novikontas.org', 'alma@novikontas.org', 'iljasemjonovs@novikontas.org']) assert.equal(godemo.mayView({ email: e }), true, e);
  assert.equal(godemo.mayView({ email: 'MC@novikontas.org' }), true);
  assert.equal(godemo.mayView({ email: 'someone@example.com' }), false);
  assert.equal(godemo.mayView(null), false);
  const page = godemo.fileFor(godemo.PREFIX);
  assert.ok(page && /text\/html/.test(page.type));
  const html = godemo.read(page).toString('utf8');
  const local = [...html.matchAll(/(?:src|href)="([^"#:/][^"#:]*)"/g)].map((m) => m[1]);
  assert.ok(local.length >= 8);
  for (const rel of local) assert.ok(godemo.fileFor(godemo.PREFIX + rel), rel);
  assert.equal(godemo.fileFor(godemo.PREFIX + '../server.js'), null);
  assert.equal(godemo.fileFor(godemo.PREFIX + '%2e%2e%2fserver.js'), null);
  const srv = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
  assert.match(srv, /if \(!godemo\.mayView\(me\)\) \{/);
});

test('05.11 the demo shows the real Stage 2 letters (drawn from tcs2mail.js), not the filtered-email Save the Date; the current picture', async () => {
  const godemo = await import('../src/godemo.js');
  const html = godemo.read(godemo.fileFor(godemo.PREFIX)).toString('utf8');
  assert.doesNotMatch(html, /1b_personal_from_ritvars/);
  assert.match(html, /JS 204./);
  const inv = godemo.read(godemo.fileFor(godemo.PREFIX + 'letters/3_you_are_invited.html', { name: 'Anna Example' })).toString('utf8');
  assert.match(inv, /Dear Anna,/);
  assert.match(inv, /5791191e-9348-b914-d4e1-8f7027aa609e\.jpg/);
  assert.match(inv, /grand-opening\?c=rvtst1&rsvp=yes/);
  const conf = godemo.read(godemo.fileFor(godemo.PREFIX + 'letters/2_will_you_be_there.html', null)).toString('utf8');
  assert.match(conf, /5791191e-9348-b914-d4e1-8f7027aa609e\.jpg/);
  assert.ok(godemo.fileFor(godemo.PREFIX + 'letters/building.jpg'));
  assert.match(godemo.read(godemo.fileFor(godemo.PREFIX + 'letters/4_new_contact.html')).toString('utf8'), /You are invited/);
  const mail = (await import('../src/tcs2mail.js')).s2Mail('invite', 'Anna', 'x1');
  assert.doesNotMatch(mail.html, /aa5828e0/);
});

test('05.11 the demo opens at /api/tc/go/demo without a redirect (Vercel strips the slash); its links resolve by <base>', async () => {
  const godemo = await import('../src/godemo.js');
  const f = godemo.fileFor('/api/tc/go/demo');
  assert.ok(f && /text\/html/.test(f.type));
  assert.match(godemo.read(f).toString('utf8'), /<head><base href="\/api\/tc\/go\/demo\/">/);
  const srv = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
  assert.doesNotMatch(srv, /location: godemo\.PREFIX/);
  assert.match(fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8'), /href="\/api\/tc\/go\/demo" target="_blank"/);
});

test('11.11 the new demo (the Grand Opening 10 chapters) plus In Intake: the tiles open what they name, the letters live', async () => {
  const godemo = await import('../src/godemo.js');
  const html = godemo.read(godemo.fileFor(godemo.PREFIX)).toString('utf8');
  assert.equal((html.match(/<section class="ch"/g) || []).length, 11);
  assert.match(html, /<section class="ch" data-t="In Intake" data-s="Intake">/);
  for (const [title, href] of [['Do not invite / hold', '#/tc/go/hold'], ['What came back', '#/tc/go/back'], ['Six owners, six lists', '#/tc/go/lists'],
    ['Company families', '#/tc/families'], ['Clients in Intake', '#/tc/clients'], ['Real company count', '#/tc/companies/go2']]) {
    const at = html.indexOf('<h3>' + title + '</h3>'); const a = html.lastIndexOf('<a class="card intile"', at);
    assert.ok(at > 0 && html.slice(a, at).includes('href="https://intake.novikontas.org/' + href + '"'), title);
  }
  for (const f of ['2_will_you_be_there', '3_you_are_invited', '4_new_contact']) assert.match(html, new RegExp('<iframe src="letters/' + f + '\.html"'));
  // his answer 11.11.2026: the "1,125 places" tile is the live Real company count; no 45 x 25 on it
  assert.ok(!html.includes('<h3>1,125 places</h3>') && !html.includes('45 x 25'));
  assert.match(html, /\{\{MOTHER_COMPANIES\}\}<\/b> mother companies on the Stage 2 lists/);
  assert.match(godemo.withCount({ body: html, type: 'text/html; charset=utf-8' }, 1234).body, /<b class="innum">1,234<\/b> mother companies/);
  assert.match(fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8'), /landing: await tcrsvp\.landingCounts\(\)/);
  assert.doesNotMatch(html, /\.\.\/\.\.\//);
});

test('11.11 the Real company count: one per mother company on the Stage 2 lists; a family counts once as its parent; gone rows and no-company rows are not counted', async () => {
  const db = await openDb();
  const { nameKey } = await import('../src/tc.js');
  const at = new Date().toISOString();
  const co = async (name) => Number((await db.prepare(`INSERT INTO tc_companies (name, name_key, status, created_at) VALUES (?,?,?,?)`).run(name, nameKey(name), 'active', at)).lastInsertRowid);
  const mother = await co('Mother Example AS'), branch = await co('Mother Example Branch SIA'), other = await co('Other Example Ltd');
  const fam = Number((await db.prepare(`INSERT INTO tc_families (parent_id, created_at) VALUES (?,?)`).run(mother, at)).lastInsertRowid);
  for (const id of [mother, branch]) await db.prepare(`INSERT INTO tc_family_members (family_id, company_id, added_at) VALUES (?,?,?)`).run(fam, id, at);
  const person = async (ch, companyId, company, gone = 0) => {
    if (companyId) await db.prepare(`INSERT INTO tc_company_contacts (company_id, name, ch_contact_id, created_at) VALUES (?,?,?,?)`).run(companyId, 'P ' + ch, ch, at);
    await db.prepare(`INSERT INTO tc_go_stage2 (ch_contact_id, sender, name, first_name, company, position, country, email, link_code, gone, loaded_at, loaded_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(ch, 'JS', 'P ' + ch, 'P', company, '', 'Latvia', ch + '@example.com', 'mc' + ch, gone, at, 'test');
  };
  const before = await go.motherCompanies(db);
  await person('MC1', mother, 'Mother Example AS'); await person('MC2', branch, 'Mother Example Branch SIA'); await person('MC3', other, 'Other Example Ltd');
  await person('MC4', null, 'Name Only Example'); await person('MC5', null, '  NAME ONLY EXAMPLE '); await person('MC6', null, '');
  await person('MC7', null, 'Gone Example', 1);
  await person('MC8', null, 'OTHER EXAMPLE LTD');   // no Intake contact, but Intake has the company by name: not a second company
  await db.prepare(`INSERT INTO tc_company_contacts (company_id, name, email, ch_contact_id, created_at) VALUES (?,?,?,?,?)`).run(other, 'Twin', 'twin@other-example.com', 'OTHER-CH-ID', at);
  await db.prepare(`INSERT INTO tc_go_stage2 (ch_contact_id, sender, name, first_name, company, position, country, email, link_code, gone, loaded_at, loaded_by)
    VALUES (?,?,?,?,?,?,?,?,?,0,?,?)`).run('MC9', 'JS', 'Twin', 'T', 'Quite Another Name', '', 'Latvia', 'Twin@Other-Example.com', 'mcMC9', at, 'test');   // same email, second Client Hub id: the same company
  assert.equal(await go.motherCompanies(db) - before, 3);
  const l = await go.motherCompanyList(db);
  assert.equal(l.companies.length, await go.motherCompanies(db));   // the number and the list are one
  assert.equal(l.companies.find((c) => c.companyId === mother).people, 2);
  assert.equal(l.companies.find((c) => c.companyId === other).people, 3);
  assert.equal(l.companies.find((c) => c.key === 'n:' + nameKey('Name Only Example')).people, 2);
  assert.ok(l.noCompany >= 1);
});

test('06.11 his "Remove both": the demo has no Supabase dashboard tile and no fronts tile with bare years', async () => {
  const godemo = await import('../src/godemo.js');
  const html = godemo.read(godemo.fileFor(godemo.PREFIX)).toString('utf8');
  assert.ok(!html.includes('<b>The database</b>') && !html.includes('supabase.com/dashboard'));
  assert.ok(!html.includes('<b>The fronts</b>') && !html.includes('FRONT_new_concepts_v5'));
});


test('11.11 "Match into Intake" (a dry run first): same name, same name without spaces, the email domain of one Intake company, else NEW per domain; a free mailbox with no name stays without one; weak matches are marked Check', async () => {
  const db = await openDb();
  const { nameKey } = await import('../src/tc.js');
  const at = new Date().toISOString();
  const co = async (name) => Number((await db.prepare(`INSERT INTO tc_companies (name, name_key, status, created_at) VALUES (?,?,?,?)`).run(name, nameKey(name), 'active', at)).lastInsertRowid);
  const ship = await co('Matchship Example Management'), fleet = await co('Fleetex Example AS'), small = await co('Quietco Example');
  for (const [cid, e] of [[fleet, 'a@fleetex-example.com'], [fleet, 'b@fleetex-example.com'], [small, 'q@quietco-example.com']])
    await db.prepare(`INSERT INTO tc_company_contacts (company_id, name, email, created_at) VALUES (?,?,?,?)`).run(cid, 'K', e, at);
  const row = async (ch, company, email) => db.prepare(`INSERT INTO tc_go_stage2 (ch_contact_id, sender, name, first_name, company, position, country, email, link_code, gone, loaded_at, loaded_by)
    VALUES (?,?,?,?,?,?,?,?,?,0,?,?)`).run(ch, 'JS', 'P ' + ch, 'P', company, '', 'Latvia', email, 'mp' + ch, at, 'test');
  await row('MP1', 'MATCHSHIP EXAMPLE MANAGEMENT', 'x@other-example.com');
  await row('MP2', 'Matchship Example Manage ment', 'y@other-example.com');
  await row('MP3', null, 'c@fleetex-example.com');
  await row('MP4', 'Totally Different Example', 'd@quietco-example.com');
  await row('MP5', 'Brandnew Example', 'e@brandnew-example.com'); await row('MP6', 'Brandnew Example Ltd', 'f@brandnew-example.com');
  await row('MP7', null, 'someone@gmail.com');
  const plan = new Map((await go.stage2MatchPlan(db)).map((p) => [p.email, p]));
  assert.equal(plan.get('x@other-example.com').companyId, ship); assert.equal(plan.get('x@other-example.com').why, 'same name');
  assert.equal(plan.get('y@other-example.com').companyId, ship); assert.equal(plan.get('y@other-example.com').why, 'same name without spaces');
  assert.equal(plan.get('c@fleetex-example.com').companyId, fleet); assert.equal(plan.get('c@fleetex-example.com').check, false);
  assert.equal(plan.get('d@quietco-example.com').companyId, small); assert.equal(plan.get('d@quietco-example.com').check, true);
  assert.equal(plan.get('e@brandnew-example.com').newCompany, plan.get('f@brandnew-example.com').newCompany);
  assert.equal(plan.get('someone@gmail.com').companyId, null); assert.equal(plan.get('someone@gmail.com').newCompany, undefined);
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM tc_companies WHERE name = ?').get('Brandnew Example').then((r) => Number(r.n)), 0);   // a plan writes nothing
});

test('11.11 "demo has to be like the real thing": ch1 shows the real Stage 2 letter, ch4 the real lists, ch5 a real mother company, all from goDemoFacts; no example labels left on ch1, ch4, ch5, ch8', async () => {
  const godemo = await import('../src/godemo.js');
  const html = godemo.read(godemo.fileFor(godemo.PREFIX)).toString('utf8');
  const ch = (t) => { const a = html.indexOf('data-t="' + t + '"'); return html.slice(a, html.indexOf('</section>', a)); };
  assert.match(ch('Two ways in'), /<iframe src="letters\/2_will_you_be_there\.html"/);
  assert.ok(!ch('Two ways in').includes('your director at Novikontas Academy'));
  for (const t of ['Two ways in', 'The count', 'At the entrance', 'The board']) assert.ok(!ch(t).includes('class="example"'), t);
  assert.ok(!html.includes("['Anna Bērziņa','anna@exampleshipping.lv'") && !html.includes('Example Shipping Group'));
  assert.match(html, /<script>window\.GO_REAL=\/\*\{\{GO_REAL\}\}\*\/null;<\/script>/);
  const filled = godemo.withCount({ body: html, type: 'text/html; charset=utf-8' }, 3, { mothers: 3, people: 9, sample: [{ person: '</script>x', written: 'A', sender: 'JS', mother: 'A' }], piece: { name: 'A', branches: 2, people: 4 } }).body;
  assert.ok(!filled.includes('/*{{GO_REAL}}*/') && !filled.includes('</script>x') && filled.includes(String.fromCharCode(92) + 'u003c/script>x'));
  const db = await openDb();
  const f = await go.goDemoFacts(db);
  assert.equal(f.mothers, await go.motherCompanies(db));
  assert.ok(f.sample.length <= 8 && f.sample.every((r) => r.mother && 'written' in r));
});

test('11.11 ch3 "What we measure" = the Save the Date as it came back (the figures Intake holds) and the live mother companies; no example numbers; ch5 claims no QR of its own and carries the real gift QR', async () => {
  const godemo = await import('../src/godemo.js');
  const html = godemo.read(godemo.fileFor(godemo.PREFIX)).toString('utf8');
  const ch = (t) => { const a = html.indexOf('data-t="' + t + '"'); return html.slice(a, html.indexOf('</section>', a)); };
  assert.ok(!ch('What we measure').includes('class="example"') && !/>(236|448|755|352|205|174)</.test(ch('What we measure')));
  for (const l of ['Save the Date sent', 'Reached', 'Opened by a person', 'Added to calendar', 'Mother companies']) assert.ok(ch('What we measure').includes('>' + l + '<'), l);
  assert.ok(!html.includes('own QR'));
  // his words 11.11: "Put the real puzzle piece as we have concepted": Amento's piece (its QR opens ?gift) wherever a piece is drawn
  for (const t of ['Two ways in', 'At the entrance']) assert.ok(ch(t).includes('src="assets/piece_gift.jpg"') && !ch(t).includes('<svg class="piece"'), t);
  // ch3: measured so far, then the Stage 2 measures live (one row of totals; test and staff entries left out in the view)
  assert.ok(ch('What we measure').includes('>Measured so far<') && ch('What we measure').includes('>Stage 2: what we measure<'));
  for (const l of ['Gift QR', 'Personal email link', 'Typed address']) assert.ok(ch('What we measure').includes('>' + l + '<'), l);
  const sql = fs.readFileSync(path.join(ROOT, 'docs', 'client-hub', 'intake_landing_counts.sql'), 'utf8');
  assert.match(sql, /@novikontas/); assert.match(sql, /test/); assert.match(sql, /grant select on intake_read.landing_counts to intake_rsvp_reader;/);
  const cols = sql.split('select' + String.fromCharCode(10))[1].split('revoke')[0];
  assert.equal((cols.match(/ as [a-z_]+/g) || []).length, 7); assert.ok(!/email|first_name|company|contact_id/.test(cols.replace(/coalesce\(l\.company[^)]*\)/g, '')));
  // ch4 (his words "we already have clients page on the app!"): no matching table, the two real numbers open the app's own pages
  assert.ok(!ch('The count').includes('id="tbl"') && ch('The count').includes('https://intake.novikontas.org/#/tc/companies/go2'));
  const db = await openDb();
  const f = await go.goDemoFacts(db);
  assert.ok(f.std === null || ['sent', 'reached', 'person', 'calendar'].every((k) => Number.isFinite(f.std[k])));
});

test('11.11 the match applied: each person onto their company with their Client Hub id, a NEW company once per name in the TC area, an existing email gets linked, every change logged; safe to run again', async () => {
  const db = await openDb();
  const { nameKey } = await import('../src/tc.js');
  const at = new Date().toISOString();
  const co = Number((await db.prepare(`INSERT INTO tc_companies (name, name_key, status, created_at) VALUES (?,?,?,?)`).run('Applyco Example', nameKey('Applyco Example'), 'active', at)).lastInsertRowid);
  await db.prepare(`INSERT INTO tc_company_contacts (company_id, name, email, created_at) VALUES (?,?,?,?)`).run(co, 'Old', 'old@applyco-example.com', at);
  const row = async (ch, company, email) => Number((await db.prepare(`INSERT INTO tc_go_stage2 (ch_contact_id, sender, name, first_name, company, position, country, email, link_code, gone, loaded_at, loaded_by)
    VALUES (?,?,?,?,?,?,?,?,?,0,?,?)`).run(ch, 'JS', 'P ' + ch, 'P', company, 'Crewing', 'Latvia', email, 'ap' + ch, at, 'test')).lastInsertRowid);
  const a = await row('AP1', 'Applyco', 'new@applyco-example.com');
  const b = await row('AP2', 'Applyco', 'old@applyco-example.com');
  const c = await row('AP3', 'Freshco Example', 'x@freshco-example.com');
  const d = await row('AP4', 'FRESHCO EXAMPLE', 'y@freshco-example.com');
  const out = await go.stage2MatchApply(db, [{ id: a, companyId: co }, { id: b, companyId: co }, { id: c, newCompany: 'Freshco Example' }, { id: d, newCompany: 'Freshco Example' }], 'Ritvars');
  assert.deepEqual(out, { companiesAdded: 1, contactsAdded: 3, contactsLinked: 1, skipped: 0 });
  assert.equal((await db.prepare(`SELECT ch_contact_id FROM tc_company_contacts WHERE email = 'old@applyco-example.com'`).get()).ch_contact_id, 'AP2');
  const fresh = await db.prepare(`SELECT id, source, created_by FROM tc_companies WHERE name = 'Freshco Example'`).all();
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].source, 'stage2-match');
  assert.equal(fresh[0].created_by, 'Ritvars');
  assert.ok(await db.prepare(`SELECT 1 FROM tc_company_areas WHERE company_id = ? AND area = 'TC'`).get(fresh[0].id));
  assert.equal(Number((await db.prepare(`SELECT COUNT(*) AS n FROM tc_activities WHERE actor = 'Ritvars' AND company_id IN (?, ?)`).get(co, fresh[0].id)).n), 5);
  const l = await go.motherCompanyList(db);
  assert.equal(l.companies.find((x) => x.companyId === co).people, 2);
  assert.equal(l.companies.find((x) => x.companyId === fresh[0].id).people, 2);
  assert.deepEqual(await go.stage2MatchApply(db, [{ id: a, companyId: co }], 'Ritvars'), { companiesAdded: 0, contactsAdded: 0, contactsLinked: 0, skipped: 1 });
});

test('11.11 the Real company count opens its own list: the Clients filter go2 shows exactly the mother companies the count holds; without the ids it shows none', async () => {
  const tc = await import('../src/tc.js');
  const db = await openDb();
  const at = new Date().toISOString();
  const co = async (name) => Number((await db.prepare(`INSERT INTO tc_companies (name, name_key, status, created_at) VALUES (?,?,?,?)`).run(name, tc.nameKey(name), 'not_contacted', at)).lastInsertRowid);
  const one = await co('Listone Example'), two = await co('Listtwo Example');
  await co('Listnone Example');
  for (const [cid, ch] of [[one, 'LS1'], [one, 'LS2'], [two, 'LS3']]) {
    await db.prepare(`INSERT INTO tc_company_contacts (company_id, name, ch_contact_id, created_at) VALUES (?,?,?,?)`).run(cid, 'P', ch, at);
    await db.prepare(`INSERT INTO tc_go_stage2 (ch_contact_id, sender, name, first_name, company, position, country, email, link_code, gone, loaded_at, loaded_by)
      VALUES (?,?,?,?,?,?,?,?,?,0,?,?)`).run(ch, 'JS', 'P', 'P', 'x', '', 'Latvia', ch + '@list-example.com', 'ls' + ch, at, 'test');
  }
  const l = await go.motherCompanyList(db);
  const ids = new Set(l.companies.filter((c) => c.companyId).map((c) => c.companyId));
  const list = await tc.listCompanies(db, { go2: '1', go2ids: ids }, { size: 2000 });
  assert.equal(list.total, ids.size);
  assert.ok(list.rows.some((c) => c.id === one) && list.rows.some((c) => c.id === two) && !list.rows.some((c) => c.name === 'Listnone Example'));
  assert.equal((await tc.listCompanies(db, { go2: '1' }, { size: 2000 })).total, 0);
  const srv = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
  assert.ok(srv.includes('filters.go2 ? new Map((await tcgo.motherCompanyList(db))'));
  assert.ok(fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8').includes("place === 'companies' && arg === 'go2'"));
});

test('11.11 his word before release: no invented company anywhere in the demo (ch6-ch8 take real mother companies from goDemoFacts); ch11 claims no QR of its own', async () => {
  const godemo = await import('../src/godemo.js');
  const html = godemo.read(godemo.fileFor(godemo.PREFIX)).toString('utf8');
  assert.ok(!/Example (Shipping|Lines|Crewing|Tankers)|Baltic Example|Nordic Example/.test(html));
  assert.ok(!html.includes('own QR'));
  assert.ok(html.includes("var G={anna:{n:'Anna Bērziņa',c:PC,"));
  const f = await go.goDemoFacts(await openDb());
  assert.ok('other' in f);
});

test('11.11 his consolidated list ("we are golden"): Stage 1 first, the send-out from the mailbox of each list owner, the ticket before the piece, the piece at the entrance, the board once after it; no Built-in checks', async () => {
  const godemo = await import('../src/godemo.js');
  const html = godemo.read(godemo.fileFor(godemo.PREFIX)).toString('utf8');
  const order = [...html.matchAll(/<section class="ch" data-t="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ['The Save the Date', 'Two ways in', 'The send-out', 'The landing page', 'What we measure', 'The count', 'The ticket', 'At the entrance', 'The board', 'In Intake', 'The order']);
  assert.ok(!html.includes('Built-in checks') && (html.match(/class="board"/g) || []).length === 1 && !html.includes('board5'));
  const ch = (t) => { const a = html.indexOf('data-t="' + t + '"'); return html.slice(a, html.indexOf('</section>', a)); };
  assert.ok(ch('The Save the Date').includes('src="/assets/go-stage1-email.jpg"'));
  assert.ok(ch('The ticket').includes('Thursday 27 May 2027') && ch('The ticket').includes('Your ticket') && ch('The ticket').includes('Add to Google Wallet'));
  assert.ok(ch('At the entrance').includes('pc-hand'));
  assert.ok(html.includes('data-go="3"'));   // "See the page" goes to the landing page
  const ol = ch('The order');
  assert.ok(ol.indexOf('Stage 1: the Save the Date') < ol.indexOf('Stage 3: tickets') && ol.indexOf('Stage 3: tickets') < ol.indexOf('Pieces cut'));
  const f = await go.goDemoFacts(await openDb());
  assert.ok(Array.isArray(f.lists) && f.lists.length === 6 && f.lists.every((l) => /@novikontas\.org$/.test(l.email)));
});
