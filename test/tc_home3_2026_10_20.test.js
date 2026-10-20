// TC HOME (the owner's pick M1) AND THE CLIENT BOOK (pick A), round 3, 20.10.2026. Home: the year first, Today (Planned
// today, This week; no overdue figure), four cards for the year, Delegates by year beside Our companies by last course,
// This week (mine), the year's biggest clients. Client book: the biggest clients (All / Mine / TC / ENERGY / OPITO) and
// Welcome back. Every figure is one of the Companies list's filters; a group's TOTAL row is in no figure; 2024 is a plain
// number. Invented names only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

for (const k of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'CRM_DB_DATABASE_URL_UNPOOLED']) process.env[k] = '';
const { openDb } = await import('../src/db.js');
const tc = await import('../src/tc.js');
const th = await import('../src/tchome.js');
const { localDate } = await import('../src/bizday.js');

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fn = (name) => { const at = APP.indexOf(name); assert.ok(at >= 0, name); return APP.slice(at, APP.indexOf('\n}\n', at) + 3); };
const TODAY = localDate();
const day = (n) => tc.addDays(TODAY, n);
const ME = { email: 'eriks.paraugs@example.com', name: 'Eriks Paraugs' };

async function world() {
  const db = await openDb();
  await db.prepare(`INSERT INTO crm_users (id, email, display_name, role, active, created_at) VALUES ('u1', ?, 'Eriks Paraugs', 'user', 1, ?)`).run(ME.email, TODAY);
  await db.prepare(`INSERT INTO crm_user_areas (user_id, area, granted_at, granted_by) VALUES ('u1', 'tc', ?, 't')`).run(TODAY);
  const co = async (name, country, years, extra = {}) => {
    const { id } = await tc.addCompany(db, { name, country, areas: extra.areas || ['TC'], pic: extra.pic || '' }, 'T');
    for (const [y, n] of Object.entries(years)) await tc.setCourseYear(db, id, { year: Number(y), attendees: n }, 'T');
    return id;
  };
  const ids = {
    back: await co('Example Shipping AS', 'Norway', { 2023: 40, 2025: 100 }, { pic: 'Eriks Paraugs' }),      // came back in 2025
    fresh: await co('Sample Wind GmbH', 'Germany', { 2025: 30 }, { areas: ['ENERGY'] }),                       // new in 2025
    fresh2: await co('Demo Tankers Ltd', 'Cyprus', { 2025: 5 }),
    welcome: await co('Pilot Crewing SIA', 'Latvia', { 2022: 70, 2023: 20 }),                                 // 2022-23, none in 2025
    welcome2: await co('Model Dredging BV', 'Netherlands', { 2023: 15, 2024: 3 }),
    old: await co('Fictive Ferries AB', 'Sweden', { 2021: 8 }),
    prospect: await co('Mock Subsea AS', 'Norway', {}),
    group: await co('Example Shipping Group', 'TOTAL', { 2023: 40, 2025: 100 }),                             // repeats a subsidiary
    y24: await co('Draft Marine UAB', 'Lithuania', { 2024: 12 }),
  };
  return { db, ids };
}

test('the year: four cards, the TOTAL row in none of them, 2024 a plain number', async () => {
  const { db, ids } = await world();
  const h = await th.homeYear(db, { year: 2025, me: ME });
  assert.equal(h.year, 2025);
  assert.equal(h.delegates.n, 135, '100 + 30 + 5, not the group row\'s 100 again');
  // compared with config/tc.json home.compareYearsBack years before (2 for now: 2025 vs 2023, as the picked picture)
  assert.equal(tc.TC.home.compareYearsBack, 2);
  assert.equal(th.compareBack(), 2);
  assert.deepEqual(h.delegates.prev, { year: 2023, n: 75 });
  assert.deepEqual(h.clients, { n: 3, back: 1, fresh: 2 });
  assert.deepEqual(h.newClients, { n: 2, delegates: 35, largest: [{ id: ids.fresh, name: 'Sample Wind GmbH', n: 30 }, { id: ids.fresh2, name: 'Demo Tankers Ltd', n: 5 }] });
  assert.deepEqual(h.countries, { clients: 3, all: 7 }, 'TOTAL is not a country');
  assert.deepEqual(h.byYear.map((r) => [r.year, r.n, r.clients]),
    [[2020, 0, 0], [2021, 8, 1], [2022, 70, 1], [2023, 75, 3], [2024, 15, 2], [2025, 135, 3]]);
  assert.deepEqual(h.delegates.spark, h.byYear.map((r) => r.n));
  assert.deepEqual(h.donut.rows.map((r) => [r.id, r.n]), [['recent', 3], ['mid', 3], ['old', 1], ['none', 1]]);
  assert.equal(h.donut.total, 8, 'every company but the group row');
  assert.deepEqual(h.donut.rows.map((r) => r.label), ['Trained 2025', 'Trained 2023-24', 'Trained before 2023', 'No course yet']);
  assert.deepEqual(h.biggest.rows.map((r) => [r.name, r.n]), [['Example Shipping AS', 100], ['Sample Wind GmbH', 30], ['Demo Tankers Ltd', 5]]);
  assert.deepEqual(h.biggest.rows[0].spark, [0, 0, 0, 40, 0, 100]);
});

test('every figure opens exactly the companies it counts (the Companies list\'s year, cohort and last filters)', async () => {
  const { db } = await world();
  const h = await th.homeYear(db, { year: 2025 });
  const n = async (f) => (await tc.listCompanies(db, f, { size: 2000 })).total;
  assert.equal(await n({ year: '2025' }), h.clients.n, 'Delegates, Client companies, Countries: the clients of the year');
  assert.equal(await n({ year: '2025', cohort: 'back' }), h.clients.back);
  assert.equal(await n({ year: '2025', cohort: 'new' }), h.newClients.n);
  for (const r of h.donut.rows) assert.equal(await n({ year: '2025', last: r.id }), r.n, 'donut ' + r.id);
  for (const r of h.byYear) assert.equal(await n({ year: String(r.year) }), r.clients, 'year column ' + r.year);
  assert.equal(await n({ country: '*' }), 8, 'Countries -> Companies: every company with a country (7 countries), the group row left out');
});

test('the year it opens on is the year the course counts run to; the selector offers the years with delegates', async () => {
  const { db } = await world();
  await db.prepare(`UPDATE tc_company_courses SET as_of = '2025-09-24'`).run();
  const h = await th.homeYear(db);
  assert.equal(h.countsTo, '2025-09-24');
  assert.equal(h.year, 2025);
  assert.deepEqual(h.years, [2025, 2024, 2023, 2022, 2021]);
  assert.equal((await th.homeYear(db, { year: '2023' })).year, 2023);
  assert.equal((await th.homeYear(db, { year: 'x' })).year, 2025, 'a year that is not a year opens the default');
});

test('Today: my planned contacts up to today and up to Friday; one not done on its day is in Planned today, never late', async () => {
  const { db, ids } = await world();
  assert.equal(th.fridayOf('2026-10-20'), '2026-10-23', 'Tuesday -> Friday');
  assert.equal(th.fridayOf('2026-10-24'), '2026-10-30', 'Saturday -> the coming Friday');
  const fri = th.fridayOf(TODAY);
  await tc.setNext(db, ids.back, { due: day(-2), label: 'Call about the plan' }, 'T');      // mine, not done on its day
  await tc.setNext(db, ids.fresh, { due: TODAY, label: 'Send offer', owner: 'Eriks Paraugs' }, 'T');   // mine as the task's owner
  await tc.setNext(db, ids.fresh2, { due: TODAY, owner: 'Somebody Else' }, 'T');           // a colleague's
  await tc.setNext(db, ids.welcome, { due: tc.addDays(fri, 3), owner: 'Eriks Paraugs' }, 'T');   // mine, next week
  const h = await th.homeYear(db, { year: 2025, me: ME });
  assert.equal(h.today.planned, 2);
  assert.equal(h.today.week, 2 + (tc.addDays(fri, 3) <= fri ? 1 : 0));
  const carried = h.week.find((r) => r.companyId === ids.back);
  assert.deepEqual([carried.day, carried.from], [TODAY, day(-2)], 'shown on today with the day it was planned for');
  assert.ok(!h.week.some((r) => r.companyId === ids.fresh2), 'only mine');
  assert.deepEqual((await th.homeYear(db, { year: 2025 })).today, { friday: fri, planned: 0, week: 0 }, 'nobody signed in: nothing is mine');
});

test('the Client book: ranked by the year, All / Mine / one area; Welcome back = Y-3..Y-2, none in Y, the most first', async () => {
  const { db, ids } = await world();
  const all = await th.book(db, { year: 2025, me: ME });
  assert.deepEqual(all.biggest.rows.map((r) => r.id), [ids.back, ids.fresh, ids.fresh2]);
  assert.equal(all.biggest.top, 100);
  assert.equal(all.mineCount, 1);
  assert.deepEqual((await th.book(db, { year: 2025, area: 'ENERGY' })).biggest.rows.map((r) => r.id), [ids.fresh]);
  assert.deepEqual((await th.book(db, { year: 2025, mine: true, me: ME })).biggest.rows.map((r) => r.id), [ids.back]);
  assert.deepEqual(all.welcome.rows.map((r) => [r.id, r.n]), [[ids.welcome, 90], [ids.welcome2, 15]], 'the group row is never welcomed back');
  assert.deepEqual([all.welcome.from, all.welcome.to], [2022, 2023]);
  // the three cards on top: delegates per year, the year's client companies out of every company that ever trained, countries
  assert.equal(all.cards.delegates.n, 135);
  assert.deepEqual(all.cards.delegates.byYear.map((r) => r.n), [0, 8, 70, 75, 15, 135]);
  assert.deepEqual(all.cards.clients, { n: 3, ever: 7 }, 'the group row and the prospect are not clients');
  assert.equal(all.cards.countries, 7);
  assert.equal((await tc.listCompanies(db, { client: 'yes' }, { size: 2000 })).total, all.cards.clients.ever, 'the "of all" figure opens Clients');
  await tc.setNext(db, ids.welcome, { due: day(3), label: 'Call' }, 'T');   // Plan a call
  const after = await th.book(db, { year: 2025 });
  assert.equal(after.welcome.rows[0].next.due, day(3), 'a planned call shows as planned');
});

test('Mark sent: the information leaves the card, the log keeps what it was; nothing waiting is refused', async () => {
  const { db, ids } = await world();
  await tc.editCompany(db, ids.back, { infoToSend: 'Price list 2027' }, 'T');
  await tc.markInfoSent(db, ids.back, 'Eriks');
  const c = await tc.getCompany(db, ids.back);
  assert.equal(c.infoToSend, '');
  const line = c.log.find((e) => e.body === 'Information sent');
  assert.deepEqual([line.field, line.old_value, line.new_value, line.actor], ['info_to_send', 'Price list 2027', null, 'Eriks']);
  await assert.rejects(tc.markInfoSent(db, ids.back, 'Eriks'), /Nothing is waiting/);
});

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], {
      env: { ...process.env, PORT: '0', CRM_DB: ':memory:', DATASET: 'empty', CRM_AUTH: '', CRM_PUBLIC: '', VERCEL: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const look = (d) => { out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, base: `http://127.0.0.1:${m[1]}` }); };
    child.stdout.on('data', look); child.stderr.on('data', look);
    child.on('exit', (code) => reject(new Error(`server exited (${code}): ${out}`)));
  });
}
test('the routes on a laptop copy: the year, the Client book (an unknown area is ignored), Mark sent', async (t) => {
  const s = await startServer();
  t.after(() => s.child.kill());
  const H = { 'x-acting-as': 'Ritvars', 'content-type': 'application/json' };
  const get = async (p) => { const r = await fetch(s.base + p, { headers: H }); return [r.status, await r.json()]; };
  const post = async (p, b) => { const r = await fetch(s.base + p, { method: 'POST', headers: H, body: JSON.stringify(b) }); return [r.status, await r.json()]; };
  const [, made] = await post('/api/tc/companies', { name: 'Example Towage AS', country: 'Norway' });
  await post(`/api/tc/companies/${made.id}/courses`, { year: 2025, attendees: 9 });
  const [so, o] = await get('/api/tc/overview?year=2025');
  assert.equal(so, 200); assert.equal(o.delegates.n, 9);
  const [sb, b] = await get('/api/tc/book?year=2025&area=NOPE');
  assert.equal(sb, 200); assert.equal(b.area, ''); assert.equal(b.biggest.total, 1);
  await post(`/api/tc/companies/${made.id}/edit`, { infoToSend: 'Dates 2027' });
  assert.equal((await post(`/api/tc/companies/${made.id}/info-sent`, {}))[0], 200);
  assert.equal((await post(`/api/tc/companies/${made.id}/info-sent`, {}))[0], 400, 'nothing waiting');
});

test('the screens: the menu, Home in the Academy Home\'s parts, nothing reads as late, the Client book, the company page', () => {
  const nav = fn('function tcInstallNav(').split("insertAdjacentHTML('afterend'")[1];
  const order = ['>Home<', 'My week', '>Client book<', 'Season', '>Companies<', 'Next contacts', '>Clients<', 'Prospects', 'Help center'].map((w) => nav.indexOf(w));
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'Home, My week, Client book, Season, Companies (Next contacts, Clients, Prospects), Help center');
  assert.match(fn('function tcInstallNav('), /const week = typeof viewTcWeek === 'function', season = typeof viewTcSeason === 'function';/, 'lane TC-WEEK 3\'s screens show once they exist');
  const route = fn('async function tcRoute(');
  assert.match(route, /place === 'book'\) await viewTcBook\(\)/);
  assert.match(route, /place === 'week' && typeof viewTcWeek === 'function'/);
  const home = fn('async function viewTcHome(');
  for (const part of ['class="kpage kb tc-home"', '<h2>Today</h2>', 'kstrip kb-strip', 'kb-top', 'cDonut(', 'tcYearChart(', 'tcYearSel(D)', 'This week · mine', 'Biggest clients ${Y}']) assert.ok(home.includes(part), part);
  assert.doesNotMatch(home, /[Oo]verdue/, 'no overdue figure');
  assert.match(home, /cDonut\(D\.donut\.rows\.map\(\(r, i\) => \[r\.label, r\.n, \['tc1', 'tc2', 'tc3', 'np'\]\[i\], `year=\$\{Y\}&last=\$\{r\.id\}`\]\), \{ unit: 'companies'/);
  assert.match(fn('function cChartGo(spec) {'), /if \(kind === 'tc'\) \{ tcChartGo\(key \|\| ''\); return; \}/);
  assert.match(fn('function tcYearChart('), /data-kgo="tc\|year=\$\{Number\(r\.year\)\}"/);
  assert.doesNotMatch(fn('function tcYearChart('), /hatch|~/, '2024 is a number like any other');
  assert.doesNotMatch(APP.slice(APP.indexOf('const tcWhenText'), APP.indexOf('const tcDelegates')), /overdue/, 'a past day reads "planned dd.mm"');
  assert.doesNotMatch(APP, /tc-row\.is-late|tc-d\.late/, 'no red for a contact not done yet');
  assert.match(home, /<small>\$\{Y\}<\/small>\$\{tcSpark\(D\.byYear\)\}/, 'the Delegates line: thin, a dot a year');
  assert.match(fn('function tcSpark('), /class="tc-spark-line"/);
  assert.match(APP, /@media \(min-width:1101px\)\{ html\.ui-c \.tc-home \.kb-top\{grid-template-columns:minmax\(0,1\.3fr\) minmax\(0,1fr\)\} \}/, 'the donut as big as in the picture, one column on a phone');
  const cards = fn('function tcBookCards(');
  for (const part of ['Delegates ${Number(Y)}', 'Client companies that trained in ${Number(Y)}', 'of all companies that ever trained', 'where our companies are', 'tcGoYear(${Number(r.year)})', 'href="#/tc/clients"']) assert.ok(cards.includes(part), part);
  const book = fn('async function viewTcBook(');
  assert.match(book, /\$\{tcBookCards\(B\)\}/);
  for (const part of ["'All'", "'Mine'", "['TC', 'ENERGY', 'OPITO']", 'Welcome back', 'Plan a call', 'tcBigRows(rows, B.biggest.top, { pic: true })']) assert.ok(book.includes(part), part);
  const co = fn('function tcDrawCompany(');
  for (const part of ['Delegates per year', 'since 2020', 'Courses they take', 'Information to send', 'Mark sent']) assert.ok(co.includes(part), part);
  assert.match(fn('async function tcInfoSent('), /\/info-sent`, \{\}\)/);
  const help = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'help.json'), 'utf8'));
  for (const id of ['tc-home-year', 'tc-client-book']) assert.ok(help.tc.faq.some((f) => f.id === id), 'Help: ' + id);
});

test('Next exhibition: drawn from the overview "exhibition" (lane TC-WEEK 3, joined by MASTER CONTROL), hidden without it', () => {
  const home = fn('async function viewTcHome(');
  assert.match(home, /const ex = D\.exhibition && D\.exhibition\.id != null \? D\.exhibition : null;/, 'a missing exhibition hides the figure');
  assert.match(home, /\$\{ex \? `<a class="kneed tc-ex" href="#\/tc\/season\/event\/\$\{Number\(ex\.id\)\}"/, 'opens the exhibition');
  assert.match(home, /\$\{ex\.dateConfirmed \? '' : ' <em class="tc-tbc">date to confirm<\/em>'\}/);
  assert.match(home, /year: 'numeric'/, 'another year is named');
});

test('Where our companies are (the owner\'s pick N3): companies per country with their clients, the year\'s biggest as pins; Home only', async () => {
  const { db, ids } = await world();
  const G = (await th.homeYear(db, { year: 2025 })).geo;
  assert.deepEqual([G.companies, G.countries, G.clients], [8, 7, 7], 'TOTAL rows out; the prospect has a country, so it is placed');
  assert.deepEqual(G.rows[0], { country: 'Norway', companies: 2, clients: 1 }, 'the most companies first');
  assert.ok(!G.rows.some((r) => r.country === 'TOTAL'));
  assert.deepEqual(G.largest.map((l) => [l.id, l.n]), [[ids.back, 100], [ids.fresh, 30], [ids.fresh2, 5]]);
  for (const r of G.rows) assert.equal((await tc.listCompanies(db, { country: r.country }, { size: 2000 })).total, r.companies, 'a country opens its companies: ' + r.country);
  await tc.editCompany(db, ids.old, { country: '' }, 'T');
  assert.equal((await th.homeYear(db, { year: 2025 })).geo.companies, 7, 'a company with no country is not placed');
  const home = fn('async function viewTcHome(');
  assert.ok(home.indexOf('${tcGeoSection(D)}') > home.indexOf('kb-charts') && home.indexOf('${tcGeoSection(D)}') < home.indexOf('tc-home2'), 'between the charts and This week');
  assert.match(home, /tcDrawMap\(D\);/);
  assert.doesNotMatch(fn('async function viewTcBook('), /tcGeo|tcDrawMap/, 'Home only');
  assert.doesNotMatch(fn('function tcInstallNav('), /map/i, 'no separate Map tab');
  const draw = fn('async function tcDrawMap(');
  assert.match(draw, /data-kgo="\$\{esc\(tcGeoGo\(r\.country\)\)\}"/, 'a country opens its companies');
  assert.match(draw, /class="tc-mpin"[^>]*data-kgo="\$\{esc\(tcGeoGo\(l\.country\)\)\}"/, 'a pin too');
  assert.equal(new URLSearchParams(`country=${encodeURIComponent("Côte d'Ivoire & Co")}`).get('country'), "Côte d'Ivoire & Co");
  const SERVER = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
  assert.match(SERVER, /'world\.js': 'text\/javascript; charset=utf-8',/, 'the outline is a static asset');
  const W = fs.readFileSync(path.join(ROOT, 'src', 'assets', 'world.js'), 'utf8');
  assert.match(W, /"source":"Natural Earth 1:110m via world-atlas, public domain"/);
  assert.match(fn('function tcWorld('), /sc\.src = '\/assets\/world\.js'/, 'read once, when the map is first drawn');
});
