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
    ['Company families', '#/tc/families'], ['Clients in Intake', '#/tc/clients']]) {
    const at = html.indexOf('<h3>' + title + '</h3>'); const a = html.lastIndexOf('<a class="card intile"', at);
    assert.ok(at > 0 && html.slice(a, at).includes('href="https://intake.novikontas.org/' + href + '"'), title);
  }
  for (const f of ['2_will_you_be_there', '3_you_are_invited', '4_new_contact']) assert.match(html, new RegExp('<iframe src="letters/' + f + '\.html"'));
  assert.match(html, /href="puzzle\/Puzzle_pozicijas_1125_45x25_2026-11-06\.xlsx"/);
  assert.doesNotMatch(html, /\.\.\/\.\.\//);
});

test('06.11 his "Remove both": the demo has no Supabase dashboard tile and no fronts tile with bare years', async () => {
  const godemo = await import('../src/godemo.js');
  const html = godemo.read(godemo.fileFor(godemo.PREFIX)).toString('utf8');
  assert.ok(!html.includes('<b>The database</b>') && !html.includes('supabase.com/dashboard'));
  assert.ok(!html.includes('<b>The fronts</b>') && !html.includes('FRONT_new_concepts_v5'));
});

