// STAGE 3, THE TICKET (12.11.2026; his picks "Yes, build it", "QR + calendar now", "Yes, read them", "Yes, at the door").
// Gmail and Client Hub are faked; nothing is sent; every person and company here is invented.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { ROOT, start, session } from './security_helpers.js';
const { openDb } = await import('../src/db.js');
const tk = await import('../src/tctickets.js');
const { qrMatrix, qrPng } = await import('../src/qr.js');
const notify = await import('../lib/notify.js');
const { mime } = await import('../src/tcs2send.js');
const ENV = { CRM_SESSION_SECRET: 'x'.repeat(40), GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' };
const at = new Date().toISOString();

function fakeGmail(aliases = ['js@novikontas.org']) {
  const sent = [];
  const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
  const fetchImpl = async (url, opt = {}) => {
    if (String(url).includes('/token')) return reply({ access_token: 'acc', scope: 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.settings.basic' });
    if (String(url).endsWith('/settings/sendAs')) return reply({ sendAs: [{ sendAsEmail: 'ritvars.vilcins@novikontas.org', isPrimary: true }, ...aliases.map((a) => ({ sendAsEmail: a, verificationStatus: 'accepted' }))] });
    if (String(url).endsWith('/messages/send')) { sent.push(Buffer.from(JSON.parse(opt.body).raw, 'base64url').toString('utf8')); return reply({ id: 'm' + sent.length }); }
    return reply({}, 404);
  };
  return { fetchImpl, sent };
}
const REGS = [
  { reg_key: 'L:ab12:1', source: 'link', contact_id: 'CH1', first_name: 'Anna', last_name: 'Example', email: 'Anna@Alpha-example.com', company: 'Alpha Example AS' },
  { reg_key: 'L:ab12:2', source: 'link', contact_id: 'CH1', first_name: 'Ben', last_name: 'Example', email: 'ben@alpha-example.com', company: 'Alpha Example AS' },
  { reg_key: 'Q:7', source: 'gift', contact_id: null, first_name: 'Carla', last_name: 'Example', email: 'carla@beta-example.com', company: 'Beta Branch Example' },
  { reg_key: 'Q:8', source: 'page', contact_id: null, first_name: 'Dan', last_name: 'Nobody', email: 'dan@nowhere-example.com', company: 'Unknown Example Ltd' },
  { reg_key: 'Q:9', source: 'page', contact_id: null, first_name: 'Eve', last_name: 'Example', email: '', company: 'Alpha Example AS' },
];
async function seed(db) {
  const co = async (name) => Number((await db.prepare('INSERT INTO tc_companies (name, name_key, country, status, created_at) VALUES (?,?,?,?,?)').run(name, (await import('../src/tc.js')).nameKey(name), 'Norway', 'not_contacted', at)).lastInsertRowid);
  const alpha = await co('Alpha Example AS'), beta = await co('Beta Mother Example'), betab = await co('Beta Branch Example');
  const fam = Number((await db.prepare('INSERT INTO tc_families (parent_id, created_at) VALUES (?,?)').run(beta, at)).lastInsertRowid);
  await db.prepare('INSERT INTO tc_family_members (family_id, company_id, added_at) VALUES (?,?,?)').run(fam, betab, at);
  const row = async (ch, sender, company, email, companyId) => {
    await db.prepare(`INSERT INTO tc_go_stage2 (ch_contact_id, sender, name, first_name, company, email, link_code, gone, loaded_at, loaded_by) VALUES (?,?,?,?,?,?,?,0,?,?)`).run(ch, sender, 'X ' + ch, 'X', company, email, 'lc' + ch, at, 't');
    if (companyId) await db.prepare('INSERT INTO tc_company_contacts (company_id, name, email, ch_contact_id, created_at) VALUES (?,?,?,?,?)').run(companyId, 'X ' + ch, email, ch, at);
  };
  await row('CH1', 'JS', 'Alpha Example AS', 'anna@alpha-example.com', alpha);
  await row('CH2', 'MC', 'Beta Mother Example', 'boss@beta-example.com', beta);
  return { alpha, beta, betab };
}

test('the ticket QR: a real QR reader reads every code back (versions 1 to 5, level M); the PNG is a PNG', () => {
  const m = qrMatrix('GO27-K7M2Q9XR4T');
  assert.equal(m.length, 25);   // 15 characters: version 2
  const png = qrPng('GO27-K7M2Q9XR4T');
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.throws(() => qrMatrix('x'.repeat(200)), /Too long/);
  // the proof with an independent reader (zxing-cpp), where this computer has it
  let py = true;
  try { execFileSync('python', ['-c', 'import zxingcpp, PIL'], { stdio: 'ignore' }); } catch (e) { py = false; }
  if (!py) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qr-'));
  const T = ['GO27-K7M2Q9XR4T', tk.newCode(), tk.newCode(), 'A', 'x'.repeat(40), 'y'.repeat(84)];
  T.forEach((t, i) => fs.writeFileSync(path.join(dir, i + '.png'), qrPng(t, 6)));
  const out = execFileSync('python', ['-c', 'import sys,zxingcpp\nfrom PIL import Image\nfor i in range(int(sys.argv[2])):\n  r=zxingcpp.read_barcodes(Image.open(sys.argv[1]+"/"+str(i)+".png"))\n  print(r[0].text if r else "")', dir, String(T.length)], { encoding: 'utf8' });
  assert.deepEqual(out.trim().split(/\r?\n/), T);
});

test('who registered, read-only: both ways in, matched to their mother company and list owner; nobody without an owner is sent, they are a figure by name', async () => {
  const db = await openDb();
  await seed(db);
  tk.setRegFetcher(async () => REGS);
  const regs = await tk.registrations({ env: {} });
  assert.equal(regs.length, 5); assert.equal(regs[0].email, 'anna@alpha-example.com'); assert.equal(regs[0].name, 'Anna Example');
  const P = await tk.placed(db, regs);
  const by = Object.fromEntries(P.map((p) => [p.regKey, [p.motherName, p.sender]]));
  assert.deepEqual(by['L:ab12:1'], ['Alpha Example AS', 'JS'], 'the invitee: their own Stage 2 row');
  assert.deepEqual(by['L:ab12:2'], ['Alpha Example AS', 'JS'], 'a colleague in the same form: the same list owner');
  assert.deepEqual(by['Q:7'], ['Beta Mother Example', 'MC'], 'a branch in a family: the mother company and its owner');
  assert.deepEqual(by['Q:8'], ['Unknown Example Ltd', null]);
  const o = await tk.overview(db, regs);
  const js = o.senders.find((s) => s.code === 'JS');
  assert.equal(js.n, 3); assert.equal(js.left, 2); assert.deepEqual(js.noEmail, [{ name: 'Eve Example', company: 'Alpha Example AS' }]);
  assert.deepEqual(o.noOwner, [{ name: 'Dan Nobody', company: 'Unknown Example Ltd' }]);
  tk.setRegFetcher(null);
  assert.equal(await tk.registrations({ env: {} }), null, 'fails closed without the address');
  const sql = fs.readFileSync(path.join(ROOT, 'docs', 'client-hub', 'intake_registered_people.sql'), 'utf8');
  assert.match(sql, /grant select on intake_read\.registered_people to intake_rsvp_reader;/);
  assert.match(sql, /revoke all on intake_read\.registered_people from public, anon, authenticated;/);
  assert.match(sql, /@novikontas/); assert.match(sql, /\\mtest/);
  // 13.11.2026: a name or company of one letter repeated ("aaaa") is a typing test, left out on both sides of the view
  assert.equal((sql.match(/!~ '\^\(\.\)\\1\*\$'/g) || []).length, 6);
  assert.ok(new RegExp('^(.)\\1*$').test('aaaa') && !new RegExp('^(.)\\1*$').test('anna') && !new RegExp('^(.)\\1*$').test(''));
  const cols = sql.split('select ')[1].split('from public.std_rsvp_people')[0];
  for (const no of ['created_at', 'party', 'times', 'updated_at', 'guests']) assert.ok(!cols.includes(no), 'least fields: no ' + no);
});

test('the ticket email: the "See you soon" concept words, the person own QR, Add to calendar (no Wallet), signed by the list owner; sent only on Send, never twice', async () => {
  const db = await openDb();
  await seed(db);
  await notify.saveToken(db, '1//refresh', ENV);
  const m = tk.ticketMail({ first: 'Anna', name: 'Anna Example', company: 'Alpha Example AS', code: 'GO27-K7M2Q9XR4T' }, { name: 'Jānis Sticenko' });
  for (const t of ['See you soon', 'Dear Anna,<br><br>thank you for your Yes. Here is your personal ticket for the Grand Opening of Novikontas Academy.', 'Thursday 27 May 2027', 'Doors open 10:00',
    'Novikontas Academy Campus, Duntes iela 17d, Riga', 'Open in Maps', 'Your ticket', 'Anna Example', 'Alpha Example AS', 'Show it at the entrance.', '>Add to calendar</a>',
    'See you on Thursday,<br><br>Jānis Sticenko<br>Novikontas Academy', 'You can reply to this email, it comes to me, or write to', '27.05.2005 &rarr; 27.05.2027']) assert.ok(m.html.includes(t), t);
  assert.ok(!/wallet/i.test(m.html) && !/wallet/i.test(m.plain), 'no Wallet button or note');
  assert.ok(m.html.includes('src="cid:qr"') && m.html.includes('src="cid:logo"'));
  const raw = mime({ fromName: 'Jānis Sticenko', fromEmail: 'js@novikontas.org', to: 'a@example.com', mail: m });
  assert.match(raw, /Content-ID: <qr>/); assert.match(raw, /Content-ID: <logo>/);
  assert.ok(!tk.previewHtml({ name: 'Jānis Sticenko' }).includes('cid:'));
  // Send: from the owner's own address, each person once, the ticket written first
  tk.setRegFetcher(async () => REGS);
  const regs = await tk.registrations({ env: {} });
  const G = fakeGmail();
  const r = await tk.sendNext(db, 'JS', regs, { name: 'Ritvars' }, { env: ENV, fetchImpl: G.fetchImpl });
  assert.equal(r.ok, true); assert.equal(r.sent, 2); assert.equal(G.sent.length, 2);
  assert.ok(G.sent.every((x) => x.includes('js@novikontas.org')));
  const rows = await db.prepare('SELECT reg_key, code, sender, mother_name, result FROM tc_go_tickets ORDER BY id').all();
  assert.deepEqual(rows.map((x) => [x.reg_key, x.sender, x.result]), [['L:ab12:1', 'JS', 'sent'], ['L:ab12:2', 'JS', 'sent']]);
  assert.ok(rows.every((x) => /^GO27-[A-Z2-9]{10}$/.test(x.code)) && rows[0].code !== rows[1].code);
  assert.equal((await tk.sendNext(db, 'JS', regs, { name: 'Ritvars' }, { env: ENV, fetchImpl: G.fetchImpl })).sent, 0);
  assert.equal(G.sent.length, 2, 'never twice');
  // an owner whose address is not a confirmed "Send mail as" sends nothing
  const G2 = fakeGmail([]);
  const no = await tk.sendNext(db, 'MC', regs, { name: 'Ritvars' }, { env: ENV, fetchImpl: G2.fetchImpl });
  assert.equal(no.ok, false); assert.equal(G2.sent.length, 0);
  tk.setRegFetcher(null);
});

test('at the door (his words 12.11: "everyone at the end get the puzzle piece only at the door"): every guest checked in = hand over a piece; the same ticket again = already in, piece given; an unknown code = help desk', async () => {
  const db = await openDb();
  const t = (code, name, mother) => db.prepare(`INSERT INTO tc_go_tickets (reg_key, code, sender, name, email, company, mother_key, mother_name, result, sent_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run('K' + code, code, 'JS', name, name + '@example.com', mother, 'id:1', mother, 'sent', at);
  await t('GO27-AAAAAAAAAA', 'Anna Example', 'Alpha Example AS'); await t('GO27-BBBBBBBBBB', 'Ben Example', 'Alpha Example AS');
  let r = await tk.doorScan(db, 'go27-aaaaaaaaaa', 'Door 1');
  assert.equal(r.state, 'in'); assert.equal(r.name, 'Anna Example'); assert.equal(r.company, 'Alpha Example AS');
  r = await tk.doorScan(db, 'GO27-BBBBBBBBBB', 'Door 2');
  assert.equal(r.state, 'in', 'a colleague of the same company gets a piece too'); assert.equal(r.name, 'Ben Example');
  r = await tk.doorScan(db, 'GO27-AAAAAAAAAA', 'Door 1');
  assert.equal(r.state, 'again'); assert.ok(r.at);
  r = await tk.doorScan(db, 'GO27-ZZZZZZZZZZ', 'Door 1');
  assert.equal(r.state, 'unknown');
  assert.equal((await tk.doorScan(db, 'hello', 'Door 1')).state, 'unknown');
  assert.deepEqual(r.totals, { people: 2 });
  // a refused ticket never lets anyone in
  await db.prepare(`INSERT INTO tc_go_tickets (reg_key, code, sender, name, result, sent_at) VALUES ('KR','GO27-RRRRRRRRRR','JS','R','refused',?)`).run(at);
  assert.equal((await tk.doorScan(db, 'GO27-RRRRRRRRRR', 'Door 1')).state, 'unknown');
});

test('the page: Stage 3 tab with the cards for admins, the door scans tickets with the four answers, no Wallet note anywhere', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  assert.ok(app.includes("${tb('s3', 3, 'Stage 3 · Ticket')}"));
  for (const t of ["'<p class=\"tc-door-say\">Hand over a piece</p>'", '`<p class="tc-door-say">Already checked in at ${esc(tcDoorTime(c.at))} - piece given</p>`',
    "'<p class=\"tc-door-say\">Not on the list. Please send them to the help desk.</p>'"]) assert.ok(app.includes(t), t);
  assert.ok(!app.includes('Piece already with') && !app.includes('Hand over the piece'));
  const door = app.slice(app.indexOf('function viewTcDoor('), app.indexOf('async function tcDoorScan()'));
  assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(door), 'no emoji on the door (his no-AI-slop rule)');
  assert.ok(app.includes('registered, no list owner') && app.includes('onclick="tcTkSend(${k})"'));
  assert.ok(!/wallet/i.test(app));
});

test('over the wire: ticket cards, preview and Send for admins only; the door for the Training Centre; signed out nothing', async (t) => {
  const keep = {};
  for (const k of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'CRM_DB_DATABASE_URL_UNPOOLED', 'INTAKE_DATABASE_URL']) { keep[k] = process.env[k]; process.env[k] = ''; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-tickets-'));
  const file = path.join(dir, 'tk.db');
  const db = await openDb(file);
  for (const [id, email, role] of [['u_js', 'js@novikontas.org', 'user'], ['u_ad', 'ritvars.vilcins@novikontas.org', 'admin']]) {
    await db.prepare(`INSERT INTO crm_users (id, email, display_name, password_hash, role, active, session_version, created_at) VALUES (?,?,?,NULL,?,1,0,?)`).run(id, email, id, role, at);
    await db.prepare('INSERT INTO crm_user_areas (user_id, area, granted_at, granted_by) VALUES (?,?,?,?)').run(id, 'tc', at, 'test');
  }
  await db.prepare('INSERT INTO sync_state (name, value, ran_at) VALUES (?,?,?)').run('areas_backfill_2026_10', 'done', at);
  await db.close();
  for (const [k, v] of Object.entries(keep)) process.env[k] = v ?? '';
  const s = await start({ CRM_DB: file, DATASET: 'empty', CRM_RITVARS_PASSWORD: '', CRM_AIGARS_PASSWORD: '', CRM_ADMISSIONS_PASSWORD: '', CLIENT_HUB_RSVP_DATABASE_URL: '' });
  t.after(() => { s.child.kill(); });
  const js = session('js@novikontas.org', 'user'), ad = session('ritvars.vilcins@novikontas.org', 'admin');
  const get = (p, cookie) => fetch(s.base + p, { headers: cookie ? { cookie } : {} });
  const post = (p, cookie, b) => fetch(s.base + p, { method: 'POST', headers: { origin: s.base, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(b) });
  assert.equal((await get('/api/tc/go/tickets', js)).status, 403);
  assert.equal((await get('/api/tc/go/tickets/preview?sender=JS', js)).status, 403);
  assert.equal((await post('/api/tc/go/tickets/send', js, { sender: 'JS' })).status, 403);
  assert.deepEqual(await (await get('/api/tc/go/tickets', ad)).json(), { connected: false, senders: [], noOwner: [] });
  const pv = await get('/api/tc/go/tickets/preview?sender=JS', ad);
  assert.equal(pv.status, 200); assert.match(await pv.text(), /See you soon/);
  assert.equal((await post('/api/tc/go/tickets/send', ad, { sender: 'JS' })).status, 400, 'not connected: nothing sent');
  assert.equal((await post('/api/tc/go/door', js, { t: 'GO27-ZZZZZZZZZZ' })).status, 200);
  assert.deepEqual((await (await get('/api/tc/go/door', js)).json()).totals, { people: 0 });
  for (const p of ['/api/tc/go/tickets', '/api/tc/go/tickets/preview?sender=JS', '/api/tc/go/door']) assert.notEqual((await get(p)).status, 200, p);
  assert.notEqual((await post('/api/tc/go/door', null, { t: 'x' })).status, 200);
  assert.notEqual((await post('/api/tc/go/tickets/send', null, { sender: 'JS' })).status, 200);
});

test('12.11 the demo is like the real thing: the ticket chapter is the real ticket email (Add to calendar, signed by the own list owner of the viewer), no Wallet anywhere in the demo', async () => {
  const godemo = await import('../src/godemo.js');
  const html = godemo.read(godemo.fileFor(godemo.PREFIX)).toString('utf8');
  const a = html.indexOf('data-t="The ticket"'), ch = html.slice(a, html.indexOf('</section>', a));
  assert.ok(ch.includes('<iframe src="letters/5_ticket.html"'));
  assert.ok(!/wallet/i.test(html), 'no Wallet in the demo');
  assert.ok(html.includes('<b>Stage 3: tickets</b><span>one per person, by email, Add to calendar</span>'));
  const t = godemo.read(godemo.fileFor(godemo.PREFIX + 'letters/5_ticket.html', { email: 'js@novikontas.org' })).toString('utf8');
  assert.ok(t.includes('See you soon') && t.includes('>Add to calendar</a>') && t.includes('Jānis Sticenko<br>Novikontas Academy') && !/wallet/i.test(t));
});

test('13.11 his pick "Hide until needed": no ticket cards while nobody on an owner list registered, the no-owner people stay one clickable line; at 1 or more the heading equals the sum of its figures', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  const i = app.indexOf('function tcTkHtml()'), fn = app.slice(i, app.indexOf('\n}\n', i) + 2);
  const run = (T) => new Function('T_TK', 'isAdmin', 'tcN', 'esc', 'let T_TK_BUSY = "";' + fn + '; return tcTkHtml();')(T, () => true, (n) => String(n), (s) => String(s));
  const S = (code, n, sent = 0) => ({ code, label: code, name: code, n, sent, refused: 0, left: n - sent, noEmail: [] });
  const zero = ['Marcis', 'DS', 'MC', 'AB', 'Alma', 'JS'].map((c) => S(c, 0));
  // nobody on an owner list: no heading, no cards, no preview; the no-owner person is still there, clickable
  let html = run({ connected: true, senders: zero, noOwner: [{ name: 'A', company: 'B' }] });
  assert.ok(!html.includes('The ticket ·') && !html.includes('tcgo-pack') && !html.includes('tickets/preview'));
  assert.ok(html.includes(`onclick="tcTkList('')"><b>1</b><span>registered, no list owner</span>`));
  html = run({ connected: true, senders: zero, noOwner: [] });
  assert.ok(!html.includes('tctk-fig') && !html.includes('tcgo-pack') && html.includes('Check-in at the door'));
  // 1 or more: cards only for owners with people; the heading = the sum of the card figures + the no-owner figure
  html = run({ connected: true, senders: [S('Marcis', 0), S('MC', 2, 1), S('JS', 3)], noOwner: [{ name: 'A', company: 'B' }] });
  assert.equal((html.match(/class="tcgo-pack"/g) || []).length, 2);
  const cards = [...html.matchAll(/class="tcgo-pack"><b>[^<]*<\/b><span>(\d+)<\/span>/g)].map((m) => Number(m[1]));
  const no = Number((/<b>(\d+)<\/b><span>registered, no list owner/.exec(html) || [])[1] || 0);
  const head = Number(/The ticket · (\d+) registered/.exec(html)[1]);
  assert.deepEqual(cards, [2, 3]); assert.equal(no, 1);
  assert.equal(head, cards.reduce((a, b) => a + b, 0) + no, 'every figure has legs');
  assert.match(html, /<span>1 sent<\/span>/);
});
