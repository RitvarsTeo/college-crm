// THE GRAND OPENING (21.10.2026, src/tcgo.js): the owner's pick G1, its own page in the Training Centre half. Every id,
// company, person and address here is invented (example.com); the real extract never enters git or a test.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { localDate } from '../src/bizday.js';

const { openDb } = await import('../src/db.js');
const tcimport = await import('../src/tcimport.js');
const go = await import('../src/tcgo.js');
const { synthFiles } = await import('./tc_fixtures.js');

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TODAY = localDate();
const count = async (db, t, where = '') => Number((await db.prepare(`SELECT COUNT(*) AS n FROM ${t} ${where}`).get()).n);
const q = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const csv = (cols, rows) => '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => q(r[c])).join(','))].join('\r\n') + '\r\n';
const GC = ['ch_contact_id', 'company', 'country', 'email_sha', 'state', 'reason_code', 'opted_out'];
const SC = ['send', 'label', 'first_sent_at', 'read_at'];
const DC = ['ch_contact_id', 'send', 'delivery', 'open', 'click', 'calendar', 'opted_out'];

/** Ten guests on two sends, in every state the page counts. */
function goFiles({ guests: gx = [], deliveries: dx = [] } = {}) {
  const guests = [
    { ch_contact_id: 'g01', company: 'Example Shipping', state: 'reached' },          // a person, clicked, Add to Calendar
    { ch_contact_id: 'g02', company: 'Example Shipping', state: 'reached' },          // Apple Mail on one send, a person on the other
    { ch_contact_id: 'g03', company: 'Sample Offshore', state: 'reached' },           // a scanner only
    { ch_contact_id: 'g04', company: 'Sample Offshore', state: 'reached' },           // no open, opted out after
    { ch_contact_id: 'g05', company: 'Demo Wind', state: 'reached' },                 // a scanner open, but a person's click
    { ch_contact_id: 'g06', company: 'Demo Wind', state: 'bounced_hard' },
    { ch_contact_id: 'g07', company: 'Mock Marine', state: 'bounced_soft' },
    { ch_contact_id: 'g08', company: 'Mock Marine', state: 'decided' },
    { ch_contact_id: 'g09', company: 'Novikontas', state: 'record_blocked' },
    { ch_contact_id: 'g10', company: 'Pilot Towage', state: 'opted_out', opted_out: 1 },
    ...gx,
  ].map((g) => ({ country: 'Latvia', email_sha: '', reason_code: '', opted_out: 0, ...g }));
  const sends = [{ send: 'go-s01', label: 'Send 1', first_sent_at: '2026-09-08T07:00:00.000Z', read_at: '2026-10-12T13:00:00.000Z' },
    { send: 'go-s02', label: 'Send 2', first_sent_at: '2026-09-10T07:00:00.000Z', read_at: '2026-10-12T13:00:00.000Z' }];
  const d = (ch, send, delivery, open = '', click = 0, calendar = 0, opted_out = 0) => ({ ch_contact_id: ch, send, delivery, open, click, calendar, opted_out });
  const deliveries = [
    d('g01', 'go-s01', 'delivered', 'person', 1, 1), d('g02', 'go-s01', 'delivered', 'cant_tell'), d('g02', 'go-s02', 'delivered', 'person'),
    d('g03', 'go-s01', 'delivered', 'scanner'), d('g04', 'go-s02', 'delivered', 'none', 0, 0, 1), d('g05', 'go-s02', 'delivered', 'scanner', 1),
    d('g06', 'go-s01', 'hard_bounce'), d('g07', 'go-s01', 'soft_bounce'), d('g07', 'go-s02', 'soft_bounce'),
    ...dx,
  ];
  return { 'go_guests.csv': csv(GC, guests), 'go_sends.csv': csv(SC, sends), 'go_deliveries.csv': csv(DC, deliveries) };
}
async function loadedDb(files = goFiles()) {
  const db = await openDb();
  const { counts } = await go.previewImport(db, files);
  await go.applyImport(db, files, { hash: counts.hash }, 'tester');
  return db;
}
const TABLES = ['tc_go_guests', 'tc_go_sends', 'tc_go_deliveries', 'tc_go_imports'];
const sizes = async (db) => Object.fromEntries(await Promise.all(TABLES.map(async (t) => [t, await count(db, t)])));

test('the figures: sent = reached + not reached; what came back is the best over every send; a person\'s click is a person', () => {
  const guests = [1, 2, 3, 4, 5].map((id) => ({ id, invitation: 'reached', opted_out: 0 })).concat([{ id: 6, invitation: 'bounced_hard' }, { id: 7, invitation: 'decided' }]);
  const dl = [{ guest_id: 1, delivery: 'delivered', came_back: 'person', clicked: 1, calendar: 1 }, { guest_id: 2, delivery: 'delivered', came_back: 'cant_tell' },
    { guest_id: 2, delivery: 'delivered', came_back: 'scanner' }, { guest_id: 3, delivery: 'delivered', came_back: 'scanner' },
    { guest_id: 4, delivery: 'delivered', came_back: 'none', opted_out: 1 }, { guest_id: 5, delivery: 'delivered', came_back: 'scanner', clicked: 1 },
    { guest_id: 6, delivery: 'hard_bounce', came_back: 'person' }];
  const F = go.figures(guests, dl);
  assert.deepEqual([F.sent, F.reached, F.notReached, F.notIn], [6, 5, 1, 1]);
  assert.deepEqual(Object.fromEntries(F.cameBack.map((c) => [c.id, c.n])), { person: 2, cant_tell: 1, scanner: 1, none: 1 });
  assert.equal(F.cameBack.reduce((n, c) => n + c.n, 0), F.reached, 'the four parts are the reached, no more, no less');
  assert.deepEqual([F.clicked, F.calendar, F.optedOut, F.optedOutNoOpen], [2, 1, 1, 1]);
  assert.deepEqual(F.notReachedWhy.map((x) => [x.label, x.n]), [['Address does not work', 1], ['Refused, can be tried again', 0]]);
});

test('IMPORT: the preview writes nothing and draws the page; apply only with its hash; a second apply changes nothing', async () => {
  const db = await openDb();
  const files = goFiles();
  const before = await sizes(db);
  const { counts } = await go.previewImport(db, files);
  assert.deepEqual(await sizes(db), before, 'the preview wrote nothing');
  assert.deepEqual(counts.guests, { inFile: 10, new: 10, changed: 0, same: 0, goneNow: 0 });
  assert.deepEqual(counts.deliveries, { inFile: 9, new: 9, changed: 0, same: 0 });
  assert.deepEqual([counts.page.sent, counts.page.reached, counts.page.notReached, counts.page.notIn], [7, 5, 2, 3]);
  await assert.rejects(go.applyImport(db, files, {}), /preview first/);
  await assert.rejects(go.applyImport(db, files, { hash: 'f'.repeat(64) }), /not the ones previewed/);
  const r = await go.applyImport(db, files, { hash: counts.hash }, 'tester');
  assert.equal(r.changed, 21);
  assert.deepEqual(await sizes(db), { tc_go_guests: 10, tc_go_sends: 2, tc_go_deliveries: 9, tc_go_imports: 1 });
  const again = (await go.previewImport(db, files)).counts;
  assert.deepEqual(again.guests, { inFile: 10, new: 0, changed: 0, same: 10, goneNow: 0 });
  const r2 = await go.applyImport(db, files, { hash: again.hash }, 'tester');
  assert.equal(r2.changed, 0);
  assert.equal(await count(db, 'tc_go_imports'), 1, 'nothing changed, nothing logged');
});

test('IMPORT, a newer extract: only what changed is written, a guest Client Hub no longer has is marked gone, never deleted', async () => {
  const db = await loadedDb();
  const files = goFiles({ deliveries: [{ ch_contact_id: 'g03', send: 'go-s02', delivery: 'delivered', open: 'person', click: 0, calendar: 0, opted_out: 0 }] });
  files['go_guests.csv'] = files['go_guests.csv'].replace(/\r\ng10,[^\r]*/, '');   // g10 is gone from Client Hub
  const { counts } = await go.previewImport(db, files);
  assert.deepEqual(counts.guests, { inFile: 9, new: 0, changed: 0, same: 9, goneNow: 1 });
  assert.equal(counts.deliveries.new, 1);
  await go.applyImport(db, files, { hash: counts.hash }, 'tester');
  assert.equal(await count(db, 'tc_go_guests'), 10, 'nothing deleted');
  assert.equal(Number((await db.prepare(`SELECT gone FROM tc_go_guests WHERE ch_contact_id = 'g10'`).get()).gone), 1);
  const P = await go.goPage(db);
  assert.equal(P.figures.notIn, 2, 'a gone guest is not counted');
  assert.equal(P.figures.cameBack.find((c) => c.id === 'person').n, 4, 'g03 now opened by a person on Send 2');
});

test('IMPORT refuses what it cannot read, by line; no name or address is ever stored', async () => {
  const db = await openDb();
  const files = goFiles({ guests: [{ ch_contact_id: 'g11', company: 'X', state: 'participant' }, { ch_contact_id: 'g01', company: 'Again', state: 'reached' }],
    deliveries: [{ ch_contact_id: 'g99', send: 'go-s01', delivery: 'delivered', open: 'person', click: 0, calendar: 0, opted_out: 0 },
      { ch_contact_id: 'g01', send: 'go-s09', delivery: 'delivered', open: 'person', click: 0, calendar: 0, opted_out: 0 }] });
  const { counts } = await go.previewImport(db, files);
  assert.deepEqual(counts.rejectedRows.map((x) => x.reason), ['an invitation state not known: participant', 'the same guest twice', 'a guest not in go_guests.csv', 'a send not in go_sends.csv']);
  await assert.rejects(go.previewImport(db, { ...files, 'go_sends.csv': 'send\r\n' }), /go_sends\.csv is missing the columns label, first_sent_at, read_at/);
  const cols = (await db.prepare(`SELECT name FROM pragma_table_info('tc_go_guests')`).all()).map((r) => r.name);
  assert.ok(!cols.some((c) => /name|email$|phone/.test(c)), 'no name, address or phone column: ' + cols.join(', '));
});

test('PEOPLE: who a guest is, read live from Intake: the contact with that Client Hub id, else the same address, else the review list, else the company', async () => {
  const db = await openDb();
  const { files: excel } = synthFiles({ today: TODAY });
  const pv = await tcimport.preview(db, excel, { today: TODAY });
  await tcimport.apply(db, excel, { hash: pv.counts.hash, today: TODAY }, 'tester');
  const co = Number((await db.prepare('SELECT id FROM tc_companies ORDER BY id LIMIT 1').get()).id);
  const at = new Date().toISOString();
  await db.prepare(`INSERT INTO tc_company_contacts (company_id, name, email, ch_contact_id, source, created_at) VALUES (?, 'Hard Example', 'hard@example.com', 'g06', 'manual', ?)`).run(co, at);
  await db.prepare(`INSERT INTO tc_company_contacts (company_id, name, email, source, created_at) VALUES (?, 'Soft Example', 'Soft@Example.com', 'manual', ?)`).run(co, at);
  await db.prepare(`INSERT INTO tc_review_contacts (batch, ch_contact_id, why, name, email, status, loaded_at) VALUES ('clienthub_2026_10', 'g08', 'none', 'Review Example', 'r@example.com', 'open', ?)`).run(at);
  const files = goFiles();
  files['go_guests.csv'] = files['go_guests.csv'].replace(/(\r\ng07,Mock Marine,Latvia,)/, `$1${go.emailSha(' soft@example.com ')}`);
  const { counts } = await go.previewImport(db, files);
  await go.applyImport(db, files, { hash: counts.hash }, 'tester');
  const NR = await go.goPeople(db, { group: 'notReached' });
  assert.deepEqual(NR.rows.map((r) => [r.why, r.name, r.companyId]), [['Address does not work', 'Hard Example', co], ['Refused, can be tried again', 'Soft Example', co]]);
  assert.equal(NR.tally.bounced_hard, 1);
  const hard = await go.goPeople(db, { group: 'notReached', state: 'bounced_hard' });
  assert.equal(hard.rows.length, 1);
  const out = await go.goPeople(db, { group: 'notIn' });
  const g08 = out.rows.find((r) => r.invitation === 'decided');
  assert.deepEqual([g08.name, g08.onReview], ['Review Example', true]);
  const g09 = out.rows.find((r) => r.invitation === 'record_blocked');
  assert.deepEqual([g09.name, g09.company, g09.companyId], ['', 'Novikontas', null], 'not in Intake: the company as Client Hub writes it');
  const all = await go.goPeople(db, { group: 'all' });
  assert.equal(all.rows.length, 10);
  assert.equal(all.rows.find((r) => r.invitation === 'reached' && r.company === 'Demo Wind').cameBack, 'person', 'a person\'s click is a person');
  await assert.rejects(go.goPeople(db, { state: 'x' }), /no such invitation state/);
});

test('DELIVERY: each send, what it did', async () => {
  const db = await loadedDb();
  const S = await go.goSends(db);
  assert.deepEqual(S.sends.map((s) => [s.label, s.sent, s.delivered, s.hard, s.soft, s.person, s.cantTell, s.scanner, s.none, s.clicked, s.calendar]),
    [['Send 1', 5, 3, 1, 1, 1, 1, 1, 0, 1, 1], ['Send 2', 4, 3, 0, 1, 2, 0, 0, 1, 1, 0]]);
});

// ---------------------------------------------------------------------------------------------- the routes and the screen
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

test('the routes on a laptop copy: the admin imports by upload, the page and its lists answer', async (t) => {
  const s = await startServer();
  t.after(() => s.child.kill());
  const H = { 'x-acting-as': 'Ritvars', 'content-type': 'application/json' };
  const post = async (b, h = H) => { const r = await fetch(s.base + '/api/admin/tc/go-import', { method: 'POST', headers: h, body: JSON.stringify(b) }); return [r.status, await r.json()]; };
  const get = async (p) => { const r = await fetch(s.base + p, { headers: H }); return [r.status, await r.json()]; };
  const files = goFiles();
  assert.equal((await post({ files }, { 'x-acting-as': 'Ieva', 'content-type': 'application/json' }))[0], 403, 'the import is for admins');
  assert.deepEqual((await get('/api/tc/go?count=1'))[1], { guests: 0, notReached: 0 });
  assert.equal((await get('/api/tc/go'))[1].figures, null, 'nothing in Intake yet');
  const [st1, pv] = await post({ files });
  assert.equal(st1, 200);
  assert.equal(pv.page.sent, 7);
  const [st2, noHash] = await post({ files, apply: true });
  assert.equal(st2, 400);
  assert.match(noHash.error, /preview first/);
  const [st3, done] = await post({ files, apply: true, hash: pv.hash });
  assert.equal(st3, 200);
  assert.equal(done.applied, true);
  const [, page] = await get('/api/tc/go');
  assert.deepEqual([page.figures.sent, page.figures.calendar, page.event.dateLabel], [7, 1, '27 May 2027']);
  assert.match(page.event.calendarUrl, /^https:\/\/novikontas-grand-opening-calendar\.vercel\.app\/$/);
  assert.deepEqual((await get('/api/tc/go?count=1'))[1], { guests: 10, notReached: 2 });
  assert.equal((await get('/api/tc/go/people?group=notReached'))[1].rows.length, 2);
  assert.equal((await get('/api/tc/go/people?state=nope'))[0], 400);
  assert.equal((await get('/api/tc/go/sends'))[1].sends.length, 2);
});

test('the screen: the menu item, shown once the figures are in; no page or link that leads nowhere; Not reached is navy, never red; nothing reads as late; Help', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  assert.match(app, /else if \(place === 'go'\) await viewTcGo\(\);/);
  // the compact menu (the owner's pick B, 28.10.2026): the Grand Opening is a tab in Plan, shown once its figures are in
  assert.match(app, /\.\.\.\(T_GO_ON \? \[\['#\/tc\/go', 'go', 'Grand Opening'\]\] : \[\]\)/);
  assert.match(app, /T_GO_ON = true;/);
  // the owner 22.10: Not reached, Audience and Delivery are hidden (they could not do their job): no sub-item, no link to them
  assert.doesNotMatch(app, /data-c="tc-go-|#\/tc\/go\/|tcGoPeopleView|tcGoDelivery/);
  const css = app.slice(app.indexOf('/* THE GRAND OPENING (#/tc/go'), app.indexOf('</style>\n</head>'));
  const js = app.slice(app.indexOf('THE GRAND OPENING (#/tc/go) --'), app.indexOf('function viewTcHelp() {'));
  assert.ok(css.length > 1000 && js.length > 1500, 'the blocks are found');
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /#b3261e|var\(--bad\)|var\(--c-bad\)|var\(--late\)|\bred\b/i, 'nothing in red');
  assert.doesNotMatch(css, /tcgo-(card|br):hover/, 'nothing that is not a link looks like one');
  assert.doesNotMatch(js.replace(/\/\/.*$/gm, ''), /\b(overdue|late|waiting since|days ago|still not|behind|failed)\b/i);
  assert.match(js, /interest, not an RSVP/);
  assert.doesNotMatch(js, /Fix the addresses/);
  const help = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'help.json'), 'utf8')).tc;
  assert.ok(help.faq.some((f) => f.id === 'tc-grand-opening'));
  assert.ok(help.howto.some((h) => h.href === '#/tc/go'));
  assert.ok(!help.howto.some((h) => /#\/tc\/go\//.test(h.href)), 'Help points at no hidden page');
});
