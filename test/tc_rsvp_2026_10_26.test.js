// THE RSVP ANSWERS (26.10.2026, src/tcrsvp.js): the owner's Client Hub pick 10, layout B, read live and read-only from
// Client Hub. Every company, person and id here is invented; the real answers never enter git or a test.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { openDb } = await import('../src/db.js');
const rsvp = await import('../src/tcrsvp.js');
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const AT = '2026-10-26T08:00:00.000Z';

async function seeded() {
  const db = await openDb();
  const co = async (name, pic, email = null) => Number((await db.prepare(`INSERT INTO tc_companies (name, name_key, status, pic_name, pic_email, created_at)
    VALUES (?,?,?,?,?,?)`).run(name, name.toLowerCase(), 'contacted', pic, email, AT)).lastInsertRowid);
  const k = async (company, name, ch, archived = null) => db.prepare(`INSERT INTO tc_company_contacts (company_id, name, ch_contact_id, created_at, archived_at)
    VALUES (?,?,?,?,?)`).run(company, name, ch, AT, archived);
  const a = await co('Example Shipping', 'Mara Ozola', 'mara.ozola@novikontas.org');
  const b = await co('Sample Offshore', 'Janis Berzins');
  const c = await co('Demo Wind', null);
  await k(a, 'Anna Example', 'C1'); await k(a, 'Peter Example', 'C2');
  await k(b, 'Olga Sample', 'C3'); await k(c, 'Ivan Demo', 'C4'); await k(c, 'Gone Person', 'C9', AT);
  await db.prepare(`INSERT INTO tc_review_contacts (batch, ch_contact_id, ch_company, why, status, loaded_at) VALUES (?,?,?,?,?,?)`)
    .run('b1', 'C5', 'Review Towage', 'no_company', 'open', AT);
  return { db, a, b, c };
}
const ROWS = [
  { contact_id: 'C1', person_name: 'Anna (Client Hub)', company: 'Example Shipping Ltd', answer: 'yes', guests: 2, updated_at: '2026-10-26T09:00:00Z' },
  { contact_id: 'C2', person_name: 'Peter', company: 'Example Shipping Ltd', answer: 'maybe', guests: 3, updated_at: '2026-10-26T10:00:00Z' },
  { contact_id: 'C3', person_name: 'Olga', company: 'Sample Offshore', answer: 'no', guests: 4, updated_at: '2026-10-25T10:00:00Z' },
  { contact_id: 'C4', person_name: 'Ivan', company: 'Demo Wind', answer: 'yes', guests: 40, updated_at: '2026-10-24T10:00:00Z' },
  { contact_id: 'C5', person_name: 'Rita', company: 'Review Towage CH', answer: 'yes', guests: 1, updated_at: '2026-10-23T10:00:00Z' },
  { contact_id: 'C6', person_name: 'Nobody', company: 'Unknown Co', answer: 'yes', guests: 1, updated_at: '2026-10-22T10:00:00Z' },
  { contact_id: 'C7', person_name: 'Odd', company: 'Odd Co', answer: 'perhaps', guests: 1, updated_at: '2026-10-22T10:00:00Z' },
];

test('not connected: no address, no answers, nothing is guessed (fails closed)', async () => {
  rsvp.setFetcher(null);
  const { db, a } = await seeded();
  assert.equal(rsvp.configured({}), false);
  assert.deepEqual(await rsvp.rsvpPage(db, { env: {} }), { connected: false });
  assert.deepEqual(await rsvp.rsvpForCompany(db, a, { env: {} }), []);
});

test('the answers are matched live to the Intake company and its person in charge; totals; Mine', async () => {
  rsvp.setFetcher(async () => ROWS);
  const { db, a, c } = await seeded();
  const P = await rsvp.rsvpPage(db, { env: {}, now: 1 });
  assert.equal(P.connected, true);
  assert.deepEqual(P.totals, { answered: 6, yes: 4, maybe: 1, no: 1, coming: 2 + 10 + 1 + 1 }, 'an unknown answer is dropped; guests are 1 to 10; no counts 0');
  assert.deepEqual(P.groups.map((g) => [g.pic, g.rows.length]), [['Mara Ozola', 2], ['Janis Berzins', 1], ['', 3]], 'by person in charge, none last');
  const first = P.groups[0].rows[0];
  assert.deepEqual([first.company, first.companyId, first.name, first.answer, first.people], ['Example Shipping', a, 'Peter Example', 'maybe', 3],
    "newest first; the company and the person as Intake has them");
  const none = P.groups[2].rows;
  assert.deepEqual(none.map((r) => [r.company, r.companyId]), [['Demo Wind', c], ['Review Towage', null], ['Unknown Co', null]],
    'no person in charge: Intake company, else the review list, else Client Hub\'s company');
  const mine = await rsvp.rsvpPage(db, { env: {}, now: 2, scope: 'mine', me: { email: 'mara.ozola@novikontas.org', name: 'Mara Ozola' } });
  assert.deepEqual([mine.shown, mine.totals.answered, mine.groups.length], [2, 6, 1], 'Mine shows my companies; the totals stay the whole picture');
  const nobody = await rsvp.rsvpPage(db, { env: {}, now: 3, scope: 'mine', me: null });
  assert.equal(nobody.shown, 0);
  assert.deepEqual(await rsvp.rsvpForCompany(db, a, { env: {}, now: 4 }), [
    { name: 'Anna (Client Hub)', answer: 'yes', people: 2 }, { name: 'Peter', answer: 'maybe', people: 3 }]);
  assert.deepEqual(await rsvp.rsvpForCompany(db, c, { env: {}, now: 5 }), [{ name: 'Ivan', answer: 'yes', people: 10 }],
    'an archived contact is not the company\'s');
  rsvp.setFetcher(null);
});

test('a test answer (company marked test) is left out of the counts and the list (the owner, 26.10.2026)', async () => {
  rsvp.setFetcher(async () => [...ROWS,
    { contact_id: 'T1', person_name: 'TEST - Somebody', company: 'Novikontas Academy (test)', answer: 'yes', guests: 2, updated_at: '2026-10-26T11:00:00Z' },
    { contact_id: 'T2', person_name: 'Tester', company: 'TEST company', answer: 'maybe', guests: 1, updated_at: '2026-10-26T11:00:00Z' },
    { contact_id: 'T3', person_name: 'Real', company: 'Testing Marine Ltd', answer: 'yes', guests: 1, updated_at: '2026-10-26T11:00:00Z' }]);
  const { db } = await seeded();
  const P = await rsvp.rsvpPage(db, { env: {}, now: 10 });
  assert.deepEqual([P.totals.answered, P.totals.yes, P.totals.maybe, P.totals.coming], [7, 5, 1, 15], 'the two test rows are gone; "Testing Marine" is a real company');
  assert.ok(!P.groups.some((g) => g.rows.some((r) => /test\)|TEST company/.test(r.company))));
  assert.deepEqual(['Novikontas Academy (test)', 'TEST company', 'test', 'Testing Marine Ltd', 'Contest Shipping', ''].map(rsvp.isTest), [true, true, true, false, false, false]);
  rsvp.setFetcher(null);
});

test('one read per minute at most; a failed read keeps the last answers, never an error page', async () => {
  let calls = 0;
  rsvp.setFetcher(async () => { calls += 1; if (calls === 2) throw Object.assign(new Error('down'), { code: 'ETIMEDOUT' }); return ROWS.slice(0, 1); });
  const { db } = await seeded();
  const t0 = 1_000_000;
  await rsvp.rsvpPage(db, { env: {}, now: t0 });
  await rsvp.rsvpPage(db, { env: {}, now: t0 + 59_000 });
  assert.equal(calls, 1, 'within a minute Client Hub is not asked again');
  const after = await rsvp.rsvpPage(db, { env: {}, now: t0 + 61_000 });
  assert.equal(calls, 2);
  assert.equal(after.connected, true, 'the read failed: the last answers stay');
  assert.equal(after.totals.answered, 1);
  rsvp.setFetcher(async () => { throw new Error('down'); });
  const cold = await (async () => { const { db: d2 } = await seeded(); return rsvp.rsvpPage(d2, { env: {}, now: 5 }); })();
  assert.deepEqual(cold, { connected: false }, 'nothing read yet and it fails: shown as not connected');
  rsvp.setFetcher(null);
});

test('the read is the view only, through a verified certificate, with the address from the environment', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'tcrsvp.js'), 'utf8');
  assert.match(src, /FROM intake_read\.rsvp_answers`/);
  assert.equal((src.match(/c\.query\(/g) || []).length, 1, 'one query, a SELECT');
  assert.doesNotMatch(src, /INSERT|UPDATE|DELETE|rejectUnauthorized:\s*false/);
  assert.match(src, /ssl: pgSsl\(url\)/);
  assert.match(src, /CLIENT_HUB_RSVP_DATABASE_URL/);
  const sql = fs.readFileSync(path.join(ROOT, 'docs', 'client-hub', 'intake_rsvp_reader.sql'), 'utf8');
  const code = sql.replace(/--.*$/gm, '');
  assert.match(code, /default_transaction_read_only = on/);
  assert.match(code, /grant select on intake_read\.rsvp_answers to intake_rsvp_reader;/);
  assert.equal((code.match(/\bgrant\b/gi) || []).length, 2, 'usage on the schema and select on the view, nothing else');
  assert.doesNotMatch(code, /password/i, 'the password is never in a file');
  assert.doesNotMatch(code, /email|std_rsvp_people/i, 'no address and no named guest leaves Client Hub');
});

test('the page: one funnel strip, who answered by person in charge, Mine or Team; the company line; the route', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  assert.match(app, /step\('Sent', F\.sent, ''\)\}\$\{step\('Reached'/);
  assert.doesNotMatch(app.slice(app.indexOf('function tcGoStrip('), app.indexOf('async function tcGoCopy(')), /Answered|Coming/, 'the owner 26.10: no Answered / Coming figure');
  assert.doesNotMatch(app, /card\('Not reached', F\.notReached|card\('Sent the Save the Date'/, 'the four cards became the strip');
  assert.match(app, /api\(`\/api\/tc\/go\/rsvp\?scope=\$\{T_RSVP_SCOPE\}`\)/);
  assert.match(app, /onclick="tcGoRsvp\('mine'\)">Mine<\/button><button aria-pressed="\$\{team\}" onclick="tcGoRsvp\('team'\)">Team/);
  assert.match(app, /<p class="tc-rsvpline">Grand Opening: \$\{R\.map\(one\)\.join\(' · '\)\}<\/p>/);
  assert.match(app, /api\('\/api\/tc\/go\/rsvp\?company=' \+ Number\(id\)\)/);
  const server = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
  assert.match(server, /if \(p === '\/api\/tc\/go\/rsvp' && req\.method === 'GET'\)/);
  assert.match(server, /if \(!\/\^\\d\{1,9\}\$\/\.test\(company\)\) return json\(res, 400/);
  const at = server.indexOf("'/api/tc/go/rsvp'"), gate = server.indexOf('// ------------------------------------------------------- TRAINING CENTRE --');
  assert.ok(gate > 0 && at > gate, 'inside the Training Centre block, behind its gate');
});
