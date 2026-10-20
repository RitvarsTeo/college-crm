// THE CLIENT HUB IMPORT (20.10.2026, src/tcclienthub.js): Client Hub contacts come into Intake once, Intake being the
// master. Every name, address and email here is invented (example.com); the real file never enters git or a test.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { localDate } from '../src/bizday.js';

const { openDb } = await import('../src/db.js');
const tcimport = await import('../src/tcimport.js');
const ch = await import('../src/tcclienthub.js');
const { synthFiles } = await import('./tc_fixtures.js');

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TODAY = localDate();
const count = async (db, t, where = '') => Number((await db.prepare(`SELECT COUNT(*) AS n FROM ${t} ${where}`).get()).n);

const COLS = ['ch_contact_id', 'deleted', 'ch_company_key', 'company', 'link', 'tc_company_id', 'link_evidence', 'name', 'role', 'email',
  'phone', 'country', 'city', 'ch_status', 'issue_type', 'mailchimp_status', 'ch_updated_at'];
const q = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const csv = (rows) => '﻿' + [COLS.join(','), ...rows.map((r) => COLS.map((c) => q(r[c])).join(','))].join('\r\n') + '\r\n';

/** The Excel import first (as on production), then a Client Hub file around its companies. */
async function setUp() {
  const db = await openDb();
  const { files, facts } = synthFiles({ today: TODAY });
  const pv = await tcimport.preview(db, files, { today: TODAY });
  await tcimport.apply(db, files, { hash: pv.counts.hash, today: TODAY }, 'tester');
  const [c1, c2, c3] = facts.companies;
  const firstEmail = facts.contacts.find((k) => k.company_id === c1.company_id && k.email).email;
  const p = (id, more) => ({ ch_contact_id: id, deleted: 'false', ch_company_key: 'example key', company: 'Example Company', link: 'none',
    name: `Person ${id} Example`, role: 'Crewing', email: `${id}@example.com`, phone: '+371 2000 0000', country: 'Latvia', city: 'Riga', ...more });
  const rows = [
    p('ch01', { link: 'exact_name', tc_company_id: c1.company_id, company: c1.name, email: 'New.Person@Example.com' }),   // added
    p('ch02', { link: 'domain', tc_company_id: c1.company_id, company: c1.name, email: firstEmail.toUpperCase() }),       // already on it
    p('ch03', { link: 'normalised_name', tc_company_id: c1.company_id, company: c1.name, email: 'new.person@example.com' }),// twice here
    p('ch04', { link: 'novikontas', company: 'Novikontas Academy' }),
    p('ch05', { ch_status: 'Novikontas', link: 'exact_name', tc_company_id: c2.company_id }),
    p('ch06', { email: 'someone@novikontas.org', company: 'Fictive Partners' }),
    { ch_contact_id: 'ch07', deleted: 'true' },
    p('ch08', { ch_status: 'Outdated', link: 'exact_name', tc_company_id: c2.company_id }),
    p('ch09', { issue_type: 'duplicate_suppressed', link: 'exact_name', tc_company_id: c2.company_id }),
    p('ch10', { ch_company_key: '', company: '' }),
    p('ch11', { link: 'possible', company: 'Weak Example', ch_company_key: 'weak example', link_evidence: 'possible: ' + c2.company_id }),
    p('ch12', { link: 'domain_group', company: 'Group Example', ch_company_key: 'group example' }),
    p('ch13', { link: 'tie', company: 'Tie Example', ch_company_key: 'tie example' }),
    p('ch14', { company: 'Sample Harbour Services SIA', ch_company_key: 'sample harbour services sia', mailchimp_status: 'unsubscribed' }), // new
    p('ch15', { company: 'Sample Harbour Services', ch_company_key: 'sample harbour services', country: '' }),                           // same new
    p('ch16', { company: c3.name, ch_company_key: c3.name.toLowerCase() }),                     // only in Client Hub, but Intake has the name
    p('ch17', { link: 'exact_name', tc_company_id: 'tc_99999999' }),                            // an Excel company Intake does not have
    p('ch18', { name: '', email: '', phone: '', company: 'Empty Example', ch_company_key: 'empty example' }),
    p('ch01', { link: 'exact_name', tc_company_id: c1.company_id }),                            // the same id twice
  ];
  const ids = new Map((await db.prepare('SELECT id, source_key FROM tc_companies').all()).map((r) => [r.source_key, Number(r.id)]));
  return { db, files: { [ch.FILE]: csv(rows) }, facts, c1: ids.get(c1.company_id), c2: ids.get(c2.company_id), c3: ids.get(c3.company_id) };
}
const TABLES = ['tc_companies', 'tc_company_contacts', 'tc_activities', 'tc_import_rows', 'tc_tasks', 'tc_company_areas', 'tc_company_courses'];
const sizes = async (db) => Object.fromEntries(await Promise.all(TABLES.map(async (t) => [t, await count(db, t)])));

test('PREVIEW: counts only, writes nothing, and every rule is the written one', async () => {
  const { db, files } = await setUp();
  const before = await sizes(db);
  const { counts } = await ch.preview(db, files);
  assert.deepEqual(await sizes(db), before, 'the preview wrote nothing');
  assert.match(counts.hash, /^[0-9a-f]{64}$/);
  assert.equal(counts.contacts.inFile, 19);
  assert.equal(counts.contacts.toExistingCompanies, 2, 'ch01 to its Excel company, ch16 to the company Intake has by name');
  assert.equal(counts.contacts.toNewCompanies, 2, 'ch14 and ch15, one new company');
  assert.equal(counts.contacts.sameEmailOnTheCompany, 2, 'ch02 is on the company from the Excel; ch03 twice in the file');
  assert.equal(counts.contacts.unsubscribedOrCleanedInMailchimp, 1);
  assert.deepEqual(counts.contacts.skippedWhy, {
    'Novikontas itself': 3, 'deleted in Client Hub': 1, 'Outdated in Client Hub': 1, 'a duplicate in Client Hub': 1,
    'no company in Client Hub': 1, 'no name, email or phone': 1,
  });
  assert.equal(counts.contacts.review, 4);
  assert.deepEqual(counts.review.why, { 'link: possible': 1, 'link: domain_group': 1, 'link: tie': 1, 'its Excel company is not in Intake': 1 });
  assert.equal(counts.contacts.rejected, 1);
  assert.deepEqual(counts.rejectedRows, [{ line: 20, reason: 'the same Client Hub contact twice' }]);
  assert.deepEqual(counts.companies, { existingGettingContacts: 2, ofThemFoundByNameInIntake: 1, new: 1, newWithCountry: 1, newStatus: 'not_contacted' });
  assert.doesNotMatch(JSON.stringify(counts), /@|Person ch|\+371/, 'no email, name or phone in what the preview answers');
});

test('APPLY: only with the preview\'s hash; contacts land once, with their Client Hub id; Novikontas and the review list stay out', async () => {
  const { db, files, c1, c3 } = await setUp();
  const before = await sizes(db);
  await assert.rejects(ch.apply(db, files, {}), /preview first/);
  await assert.rejects(ch.apply(db, files, { hash: 'f'.repeat(64) }), /not the one previewed/);
  assert.deepEqual(await sizes(db), before, 'a refusal writes nothing');
  const { counts } = await ch.preview(db, files);
  const r = await ch.apply(db, files, { hash: counts.hash }, 'tester');
  assert.equal(r.applied, true);

  const mine = await db.prepare(`SELECT company_id, email, ch_contact_id FROM tc_company_contacts WHERE source = 'clienthub_2026_10' ORDER BY ch_contact_id`).all();
  assert.deepEqual(mine.map((k) => k.ch_contact_id), ['ch01', 'ch14', 'ch15', 'ch16']);
  assert.equal(Number(mine[0].company_id), c1);
  assert.equal(mine[0].email, 'new.person@example.com', 'emails lower case');
  assert.equal(Number(mine[3].company_id), c3, 'the company Intake already had by that name, not a second one');
  const fresh = await db.prepare(`SELECT id, name, name_key, country, status, extra FROM tc_companies WHERE source = 'clienthub_2026_10'`).all();
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].status, 'not_contacted');
  assert.equal(fresh[0].country, 'Latvia', 'the country most of its contacts give');
  assert.equal(Number(mine[1].company_id), Number(fresh[0].id));
  assert.equal(Number(mine[2].company_id), Number(fresh[0].id), 'two Client Hub spellings, one company');
  assert.deepEqual(JSON.parse(fresh[0].extra), { clienthub_companies: 'sample harbour services ; sample harbour services sia' });

  // no email twice on one company, anywhere
  assert.equal(await count(db, `(SELECT company_id, email FROM tc_company_contacts WHERE email IS NOT NULL AND archived_at IS NULL
    GROUP BY company_id, email HAVING COUNT(*) > 1) d`), 0);
  // Novikontas, the review list, the skipped and the rejected: none of them is a contact
  assert.equal(await count(db, 'tc_company_contacts', `WHERE email LIKE '%novikontas%'`), 0);
  assert.equal(await count(db, 'tc_company_contacts', `WHERE ch_contact_id IN ('ch04','ch05','ch06','ch11','ch12','ch13','ch17')`), 0);
  // every row of the file is traced, plus the company it made
  const marks = await db.prepare(`SELECT source_key, outcome, reason FROM tc_import_rows WHERE batch = 'clienthub_2026_10'`).all();
  assert.equal(marks.length, 19 + 1);
  const by = Object.fromEntries(marks.map((m) => [m.source_key, m]));
  assert.equal(by['contact:ch11'].outcome, 'review');
  assert.equal(by['contact:ch04'].outcome, 'skipped');
  assert.equal(by['contact:ch02'].outcome, 'duplicate');
  assert.equal(by['line:20'].outcome, 'rejected');
  assert.equal(by['company:sample harbour services'].outcome, 'created');
  assert.match(by['contact:ch01'].reason, /^as imported n=[0-9a-f]{12} e=[0-9a-f]{12} p=[0-9a-f]{12}$/);
  const lines = await db.prepare(`SELECT body FROM tc_activities WHERE origin = 'import' AND actor = 'tester' AND body LIKE '%Client Hub%'`).all();
  assert.equal(lines.length, 3, 'each company that got contacts says so in its log');
  assert.ok(lines.some((l) => /^Imported from Client Hub \(Grand Opening contacts\), 2 contacts$/.test(l.body)));
  assert.ok(lines.some((l) => /^1 contact added from Client Hub/.test(l.body)));
});

test('APPLY twice: the second finds nothing to do and changes nothing', async () => {
  const { db, files } = await setUp();
  const first = (await ch.preview(db, files)).counts;
  await ch.apply(db, files, { hash: first.hash }, 'tester');
  const after = await sizes(db);
  const marksAt = await db.prepare(`SELECT source_key, applied_at FROM tc_import_rows WHERE batch = 'clienthub_2026_10' ORDER BY source_key`).all();
  const again = (await ch.preview(db, files)).counts;
  assert.equal(again.hash, first.hash, 'the same file, the same hash');
  assert.equal(again.contacts.alreadyImported, 4);
  assert.equal(again.contacts.toExistingCompanies + again.contacts.toNewCompanies, 0);
  assert.equal(again.companies.new, 0);
  await ch.apply(db, files, { hash: again.hash }, 'tester');
  assert.deepEqual(await sizes(db), after);
  assert.deepEqual(await db.prepare(`SELECT source_key, applied_at FROM tc_import_rows WHERE batch = 'clienthub_2026_10' ORDER BY source_key`).all(),
    marksAt, 'not one trace row rewritten');
});

test('a contact Intake already holds (by its Client Hub id) is never added again, and a missing column is said in words', async () => {
  const { db, files, c1 } = await setUp();
  await db.prepare(`INSERT INTO tc_company_contacts (company_id, name, ch_contact_id, source, created_at) VALUES (?, ?, ?, 'manual', ?)`)
    .run(c1, 'Typed by hand', 'ch14', new Date().toISOString());
  const { counts } = await ch.preview(db, files);
  assert.equal(counts.contacts.alreadyImported, 1);
  assert.equal(counts.contacts.toNewCompanies, 1, 'ch15 still makes the new company');
  await assert.rejects(ch.preview(db, { [ch.FILE]: 'ch_contact_id,company\n' }), /missing the columns deleted, ch_company_key/);
  assert.throws(() => tcimport.readFiles({ files: {} }, { names: [ch.FILE] }), /no clienthub_import_contacts\.csv/);
});

test('the fingerprint: whitespace, case and phone punctuation are not a change; the difference check hashes the same way', () => {
  const a = ch.fingerprint({ name: ' Example  Person ', email: 'Person@Example.com ', phone: '+371 2000-1000' });
  assert.equal(a, ch.fingerprint({ name: 'Example Person', email: 'person@example.com', phone: '+37120001000' }));
  assert.notEqual(a, ch.fingerprint({ name: 'Example Person', email: 'other@example.com', phone: '+37120001000' }));
  // pinned: _training-centre/tools/clienthub_difference_check.mjs --selftest expects exactly this
  assert.equal(a, 'n=36a391e6f254 e=542d24012988 p=6a737b27f2fa');
  assert.equal(ch.fingerprint({}), 'n=- e=- p=-');
});

// ---------------------------------------------------------------------------------------------- the route
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

test('the route: admins only, preview by upload, apply only with its hash', async (t) => {
  const s = await startServer();
  t.after(() => s.child.kill());
  const ADMIN = { 'x-acting-as': 'Ritvars', 'content-type': 'application/json' };
  const post = async (b, h = ADMIN) => { const r = await fetch(s.base + '/api/admin/tc/import-clienthub', { method: 'POST', headers: h, body: JSON.stringify(b) }); return [r.status, await r.json()]; };
  const { files: excel } = synthFiles({ today: TODAY });
  const [, pvx] = await fetch(s.base + '/api/admin/tc/import', { method: 'POST', headers: ADMIN, body: JSON.stringify({ files: excel }) }).then(async (r) => [r.status, await r.json()]);
  await fetch(s.base + '/api/admin/tc/import', { method: 'POST', headers: ADMIN, body: JSON.stringify({ files: excel, apply: true, hash: pvx.hash }) });
  const files = { [ch.FILE]: csv([{ ch_contact_id: 'r1', deleted: 'false', ch_company_key: 'route example', company: 'Route Example SIA', link: 'none',
    name: 'Route Person', email: 'route@example.com', country: 'Latvia' }]) };
  const [st0] = await post({ files }, { 'x-acting-as': 'Ieva', 'content-type': 'application/json' });
  assert.equal(st0, 403);
  const [st1, pv] = await post({ files });
  assert.equal(st1, 200);
  assert.equal(pv.preview, true);
  assert.equal(pv.companies.new, 1);
  const [st2, noHash] = await post({ files, apply: true });
  assert.equal(st2, 400);
  assert.match(noHash.error, /preview first/);
  const [st3, done] = await post({ files, apply: true, hash: pv.hash });
  assert.equal(st3, 200);
  assert.equal(done.applied, true);
  const status = await (await fetch(s.base + '/api/admin/tc/import-clienthub', { headers: ADMIN })).json();
  assert.deepEqual(status.done, { added: 1, created: 1 });
});
