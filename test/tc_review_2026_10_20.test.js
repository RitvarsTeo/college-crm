// THE CLIENT HUB REVIEW LIST (20.10.2026, src/tcreview.js): the owner's pick R2, one table with the suggestion chosen,
// tick many, Place. Every name, address and email here is invented (example.com / .example); the real files never
// enter git or a test.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { localDate } from '../src/bizday.js';

const { openDb } = await import('../src/db.js');
const tcimport = await import('../src/tcimport.js');
const ch = await import('../src/tcclienthub.js');
const rv = await import('../src/tcreview.js');
const { synthFiles } = await import('./tc_fixtures.js');

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TODAY = localDate();
const count = async (db, t, where = '', ...p) => Number((await db.prepare(`SELECT COUNT(*) AS n FROM ${t} ${where}`).get(...p)).n);

const COLS = ['ch_contact_id', 'deleted', 'ch_company_key', 'company', 'link', 'tc_company_id', 'link_evidence', 'name', 'role', 'email',
  'phone', 'country', 'city', 'ch_status', 'issue_type', 'mailchimp_status', 'unsubscribed', 'tie_candidates', 'ch_company_country', 'ch_updated_at'];
const q = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const csv = (cols, rows) => '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => q(r[c])).join(','))].join('\r\n') + '\r\n';

/** The Excel import, then the Client Hub import with seven review rows, then the review list loaded. */
export async function reviewSetUp({ load = true } = {}) {
  const db = await openDb();
  const { files, facts } = synthFiles({ today: TODAY });
  const pv = await tcimport.preview(db, files, { today: TODAY });
  await tcimport.apply(db, files, { hash: pv.counts.hash, today: TODAY }, 'tester');
  const [c1, c2, c3] = facts.companies;
  const ids = new Map((await db.prepare('SELECT id, source_key FROM tc_companies').all()).map((r) => [r.source_key, Number(r.id)]));
  const [i1, i2, i3] = [ids.get(c1.company_id), ids.get(c2.company_id), ids.get(c3.company_id)];
  // a company already using a domain: the suggestion for the no-company contacts with that domain
  await db.prepare(`INSERT INTO tc_company_contacts (company_id, name, email, source, created_at) VALUES (?, 'Known Example', 'known@harbour.example', 'manual', ?)`)
    .run(i2, new Date().toISOString());
  const p = (id, more) => ({ ch_contact_id: id, deleted: 'false', ch_company_key: 'example key', company: 'Example Company', link: 'none',
    name: `Person ${id} Example`, role: 'Crewing', email: `${id}@review.example`, phone: '', country: 'Latvia', ...more });
  const rows = [
    p('r01', { link: 'tie', ch_company_key: 'tie example', company: 'Tie Example', tie_candidates: `${c1.company_id}~0.5 ; ${c2.company_id}~0.5` }),
    p('r02', { link: 'tie', ch_company_key: 'tie example', company: 'Tie Example', mailchimp_status: 'unsubscribed' }),
    p('r03', { link: 'possible', ch_company_key: 'weak example', company: 'Weak Example' }),
    p('r04', { link: 'domain_group', ch_company_key: 'group example', company: 'Group Example' }),
    p('r05', { ch_company_key: '', company: '', email: 'one@harbour.example' }),
    p('r06', { ch_company_key: '', company: '', email: 'two@harbour.example' }),
    p('r07', { ch_company_key: '', company: '', email: 'someone@gmail.com' }),
    p('r08', { link: 'exact_name', tc_company_id: c1.company_id, company: c1.name, email: 'placed@review.example' }),   // imported, not on the list
  ];
  const chFiles = { [ch.FILE]: csv(COLS, rows) };
  const chp = await ch.preview(db, chFiles);
  await ch.apply(db, chFiles, { hash: chp.counts.hash }, 'tester');
  const cands = csv(['ch_company_key', 'tc_company_id', 'kind', 'score'], [
    { ch_company_key: 'tie example', tc_company_id: c1.company_id, kind: 'domain', score: 0.5 },
    { ch_company_key: 'tie example', tc_company_id: c2.company_id, kind: 'domain', score: 0.62 },
    { ch_company_key: 'weak example', tc_company_id: c3.company_id, kind: 'possible', score: 0.81 },
    { ch_company_key: 'group example', tc_company_id: c3.company_id, kind: 'domain_group', score: 0.2 },
    { ch_company_key: 'group example', tc_company_id: c1.company_id, kind: 'domain_group', score: 0.3 },
    { ch_company_key: 'group example', tc_company_id: 'tc_99999999', kind: 'domain_group', score: 0.9 },   // not in Intake: left out
  ]);
  const files2 = { 'clienthub_import_contacts.csv': chFiles[ch.FILE], 'clienthub_review_candidates.csv': cands };
  if (load) {
    const lp = await rv.previewLoad(db, files2);
    await rv.applyLoad(db, files2, { hash: lp.counts.hash }, 'tester');
  }
  return { db, files: files2, c1: i1, c2: i2, c3: i3 };
}
const TABLES = ['tc_companies', 'tc_company_contacts', 'tc_activities', 'tc_import_rows', 'tc_review_contacts'];
const sizes = async (db) => Object.fromEntries(await Promise.all(TABLES.map(async (t) => [t, await count(db, t)])));

test('LOAD: the preview writes nothing; apply only with its hash; every review row once, read as the import read it', async () => {
  const { db, files } = await reviewSetUp({ load: false });
  const before = await sizes(db);
  const { counts } = await rv.previewLoad(db, files);
  assert.deepEqual(await sizes(db), before, 'the preview wrote nothing');
  assert.deepEqual(counts.contacts, { onReviewList: 7, alreadyLoaded: 0, notInFile: 0, toLoad: 7, withSuggestion: 4 }, 'the four under a company; the no-company ones are suggested live, by domain');
  assert.deepEqual(counts.why, { tie: 2, possible: 1, domain_group: 1, none: 3 });
  assert.doesNotMatch(JSON.stringify(counts), /@|Person r/, 'counts only: no email, no name');
  await assert.rejects(rv.applyLoad(db, files, {}), /preview first/);
  await assert.rejects(rv.applyLoad(db, files, { hash: 'f'.repeat(64) }), /not the ones previewed/);
  await rv.applyLoad(db, files, { hash: counts.hash }, 'tester');
  assert.equal(await count(db, 'tc_review_contacts', `WHERE status = 'open'`), 7);
  const r02 = await db.prepare(`SELECT notes, email FROM tc_review_contacts WHERE ch_contact_id = 'r02'`).get();
  assert.equal(r02.notes, 'No mailing (Client Hub: unsubscribed or the address bounced)', 'the No mailing mark travels with it');
  const again = (await rv.previewLoad(db, files)).counts;
  assert.equal(again.contacts.alreadyLoaded, 7);
  assert.equal(again.contacts.toLoad, 0);
  await rv.applyLoad(db, files, { hash: again.hash }, 'tester');
  assert.equal(await count(db, 'tc_review_contacts'), 7, 'a second load adds nothing');
});

test('THE TABLE: one row per Client Hub company, the best candidate preselected; no company grouped by email domain', async () => {
  const { db, c1, c2, c3 } = await reviewSetUp();
  const L = await rv.listReview(db);
  assert.equal(L.counts.all, 7);
  assert.deepEqual(L.counts.open, { tie: 2, fuzzy: 0, possible: 1, domain_group: 1, none: 3, other: 0 });
  assert.deepEqual(L.groups.map((g) => [g.why, g.contacts.length]), [['tie', 2], ['possible', 1], ['domain_group', 1], ['none', 2], ['none', 1]]);
  const [tie, weak, group, dom, gmail] = L.groups;
  assert.equal(tie.title, 'Tie Example');
  assert.equal(tie.suggested, c2, 'the closer name of two equal matches');
  assert.deepEqual(tie.candidates.map((x) => x.id), [c2, c1]);
  assert.equal(tie.candidates[0].hit, 'same website domain');
  assert.equal(weak.suggested, c3);
  assert.equal(weak.candidates[0].hit, 'name looks like');
  assert.deepEqual(group.candidates.map((x) => x.id), [c1, c3], 'a candidate Intake does not have is left out');
  assert.equal(dom.title, 'harbour.example');
  assert.equal(dom.suggested, c2, 'the company whose contacts use the domain');
  assert.equal(dom.candidates[0].hit, 'uses the same email domain');
  assert.equal(gmail.suggested, null, 'a free mail address suggests nothing');
  assert.equal(gmail.contacts.length, 1, 'and is never grouped with other free mail addresses');
  assert.ok(tie.contacts.some((k) => k.noMailing));
});

test('PLACE: added like the import adds, traced, logged on the company; never an email twice; a second click places nothing', async () => {
  const { db, c1, c2 } = await reviewSetUp();
  const L = await rv.listReview(db);
  const [tie, , , dom] = L.groups;
  const before = await count(db, 'tc_company_contacts');
  const r = await rv.place(db, [{ ids: tie.contacts.map((k) => k.id), companyId: c2 }, { ids: dom.contacts.map((k) => k.id), companyId: c2 }], 'Placer');
  assert.equal(r.placed, 4);
  assert.equal(r.companies, 1);
  assert.equal(await count(db, 'tc_company_contacts'), before + 4);
  const k = await db.prepare(`SELECT company_id, source, created_by, notes FROM tc_company_contacts WHERE ch_contact_id = 'r02'`).get();
  assert.deepEqual({ ...k, company_id: Number(k.company_id) }, { company_id: c2, source: 'clienthub_2026_10', created_by: 'Placer',
    notes: 'No mailing (Client Hub: unsubscribed or the address bounced)' });
  const mark = await db.prepare(`SELECT outcome, reason, applied_by FROM tc_import_rows WHERE batch = 'clienthub_2026_10' AND source_key = 'contact:r01'`).get();
  assert.equal(mark.outcome, 'added');
  assert.match(mark.reason, /^as imported n=[0-9a-f]{12} e=[0-9a-f]{12} p=- \(placed by hand\)$/, 'the difference check reads it like an imported one');
  const log = await db.prepare(`SELECT body, actor FROM tc_activities WHERE company_id = ? AND actor = 'Placer'`).all(c2);
  assert.deepEqual(log.map((x) => ({ ...x })), [{ body: '4 contacts placed from the Client Hub review list', actor: 'Placer' }]);
  // again: someone else placed them a moment ago
  const again = await rv.place(db, [{ ids: tie.contacts.map((k) => k.id), companyId: c1 }], 'Other');
  assert.deepEqual([again.placed, again.alreadyDone], [0, 2]);
  assert.equal(r.counts.all, 3);
  assert.equal(r.counts.done.placed, 4);
  // the same email on the chosen company: not added a second time
  await db.prepare(`INSERT INTO tc_company_contacts (company_id, name, email, source, created_at) VALUES (?, 'Typed', 'r03@review.example', 'manual', ?)`)
    .run(c1, new Date().toISOString());
  const weak = (await rv.listReview(db)).groups.find((g) => g.why === 'possible');
  const d = await rv.place(db, [{ ids: weak.contacts.map((x) => x.id), companyId: c1 }], 'Placer');
  assert.deepEqual([d.placed, d.sameEmail], [0, 1]);
  assert.equal(await count(db, 'tc_company_contacts', `WHERE company_id = ? AND email = 'r03@review.example'`, c1), 1);
  assert.equal((await db.prepare(`SELECT outcome FROM tc_import_rows WHERE source_key = 'contact:r03'`).get()).outcome, 'duplicate');
});

test('PLACE refuses what it cannot do, in words', async () => {
  const { db, c1 } = await reviewSetUp();
  const id = (await rv.listReview(db)).groups[0].contacts[0].id;
  await assert.rejects(rv.place(db, [], 'x'), /Tick a row first/);
  await assert.rejects(rv.place(db, [{ ids: [id], companyId: 999999 }], 'x'), /no such company/);
  await assert.rejects(rv.place(db, [{ ids: ['a'], companyId: c1 }], 'x'), /which contacts/);
  await assert.rejects(rv.place(db, [{ ids: [id] }], 'x'), /Pick the company/);
});

test('SET ASIDE: with a reason, nothing deleted, the trace says so; a re-run of the import keeps it set aside', async () => {
  const { db } = await reviewSetUp();
  const gmail = (await rv.listReview(db)).groups.find((g) => !g.suggested);
  const before = await sizes(db);
  await assert.rejects(rv.setAside(db, gmail.contacts.map((k) => k.id), ' ', 'x'), /why it is not a contact/);
  const r = await rv.setAside(db, gmail.contacts.map((k) => k.id), 'A private address', 'Placer');
  assert.equal(r.setAside, 1);
  assert.deepEqual(await sizes(db), before, 'no row added or deleted');
  const row = await db.prepare(`SELECT status, reason, done_by FROM tc_review_contacts WHERE ch_contact_id = 'r07'`).get();
  assert.deepEqual({ ...row }, { status: 'set_aside', reason: 'A private address', done_by: 'Placer' });
  const mark = await db.prepare(`SELECT outcome, reason FROM tc_import_rows WHERE source_key = 'contact:r07'`).get();
  assert.deepEqual({ ...mark }, { outcome: 'set_aside', reason: 'Not a contact for us: A private address' });
  assert.equal((await rv.listReview(db)).counts.all, 6);
});

// ---------------------------------------------------------------------------------------------- the routes
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

test('the routes on a laptop copy: the admin loads, the list answers, Place and Set aside answer in words', async (t) => {
  const s = await startServer();
  t.after(() => s.child.kill());
  const H = { 'x-acting-as': 'Ritvars', 'content-type': 'application/json' };
  const post = async (p, b, h = H) => { const r = await fetch(s.base + p, { method: 'POST', headers: h, body: JSON.stringify(b) }); return [r.status, await r.json()]; };
  const get = async (p) => { const r = await fetch(s.base + p, { headers: H }); return [r.status, await r.json()]; };
  const [st0] = await post('/api/admin/tc/review-load', { files: {} }, { 'x-acting-as': 'Ieva', 'content-type': 'application/json' });
  assert.equal(st0, 403, 'loading is for admins');
  const [st1, noFiles] = await post('/api/admin/tc/review-load', { files: {} });
  assert.equal(st1, 400);
  assert.match(noFiles.error, /no clienthub_import_contacts\.csv/);
  const [st2, list] = await get('/api/tc/review');
  assert.equal(st2, 200);
  assert.deepEqual([list.counts.all, list.groups.length], [0, 0]);
  const [st3, n] = await get('/api/tc/review?count=1');
  assert.equal(st3, 200);
  assert.equal(n.all, 0);
  const [st4, bad] = await post('/api/tc/review/place', { items: [] });
  assert.equal(st4, 400);
  assert.match(bad.error, /Tick a row/);
  const [st5, bad2] = await post('/api/tc/review/set-aside', { ids: [1], reason: '' });
  assert.equal(st5, 400);
  assert.match(bad2.error, /why it is not a contact/);
});

test('the screen: reached from Companies and from the menu item From Client Hub under Companies (the owner’s picked picture), its own block, no word that reads as someone being late', async () => {
  const fs = await import('node:fs');
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  assert.match(app, /else if \(place === 'review'\) await viewTcReview\(\);/, 'the route');
  // the owner 26.10.2026 ("too much tabs", B with filters): the review list moved from Companies and the menu to the Help center, for admins
  assert.match(app, /<a href="#\/tc\/review">Review list \(from Client Hub\)<\/a>/, 'in the Help center');
  const block = app.slice(app.indexOf('THE CLIENT HUB REVIEW LIST (#/tc/review) --'), app.indexOf('function viewTcHelp() {'));
  assert.ok(block.length > 2000, 'the block is found');
  assert.doesNotMatch(block.replace(/\/\/.*$/gm, ''), /\b(overdue|late|waiting since|days ago|still not|behind)\b/i);
  assert.match(block, /'\/api\/tc\/review\/place'/);
  assert.match(block, /'\/api\/tc\/review\/set-aside'/);
  const help = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'help.json'), 'utf8')).tc;
  assert.ok(help.faq.some((f) => f.id === 'tc-client-hub-review'));
  assert.ok(help.howto.some((h) => h.href === '#/tc/review'));
});
