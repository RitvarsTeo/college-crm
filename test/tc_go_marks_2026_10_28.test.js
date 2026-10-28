// DO NOT INVITE / HOLD (28.10.2026, src/tcgo.js): the owner's rule "Invite or no should be A CAMPAIGN OR EVENT SPECIFIC!",
// layout B, the list on the event's page. Every name, company, address and id here is invented.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { openDb } = await import('../src/db.js');
const go = await import('../src/tcgo.js');
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const AT = '2026-10-28T08:00:00.000Z';

async function seeded() {
  const db = await openDb();
  const co = async (name) => Number((await db.prepare(`INSERT INTO tc_companies (name, name_key, status, created_at) VALUES (?,?,?,?)`).run(name, name.toLowerCase(), 'contacted', AT)).lastInsertRowid);
  const a = await co('Example Shipping'), b = await co('Sample Offshore');
  const k = async (company, name, email, ch) => Number((await db.prepare(`INSERT INTO tc_company_contacts (company_id, name, email, ch_contact_id, created_at) VALUES (?,?,?,?,?)`)
    .run(company, name, email, ch, AT)).lastInsertRowid);
  const k1 = await k(a, 'Anna Example', 'anna@example-shipping.com', 'C1');
  const k2 = await k(a, 'Peter Example', 'peter@example-shipping.com', 'C2');
  const k3 = await k(b, 'Olga Sample', 'olga@sample-offshore.com', 'C3');
  return { db, a, b, k1, k2, k3 };
}

test('a mark is for this event, every send or Stage 2 only, on a whole company or one person; nothing is deleted', async () => {
  const { db, a, b, k1, k3 } = await seeded();
  await assert.rejects(go.markAdd(db, { companyId: a, send: 'forever', why: 'manager' }, 'Ritvars'), /what it is for/);
  await assert.rejects(go.markAdd(db, { companyId: a, send: 'all', why: 'nope' }, 'Ritvars'), /Pick why/);
  await assert.rejects(go.markAdd(db, { companyId: a, contactId: k3, send: 'all', why: 'manager' }, 'Ritvars'), /no such contact at this company/);
  const hold = (await go.markAdd(db, { companyId: a, send: 'all', why: 'hold' }, 'Ritvars')).id;
  await assert.rejects(go.markAdd(db, { companyId: a, send: 'all', why: 'manager' }, 'Ritvars'), /Already on the list/);
  const no = (await go.markAdd(db, { companyId: b, contactId: k3, send: 'stage2', why: 'manager' }, 'Mārcis Žabovs')).id;
  const L = await go.marksList(db);
  assert.equal(L.total, 2);
  const byId = Object.fromEntries(L.rows.map((r) => [r.id, r]));
  assert.deepEqual([byId[hold].kind, byId[hold].people, byId[hold].sendLabel, byId[hold].contactId], ['hold', 2, 'Every send', null], 'the whole company, 2 people');
  assert.deepEqual([byId[no].kind, byId[no].person, byId[no].sendLabel, byId[no].by], ['no', 'Olga Sample', 'Stage 2 RSVP only', 'Mārcis Žabovs']);
  await assert.rejects(go.markFinal(db, no, 'Ritvars'), /Only a hold/);
  await go.markFinal(db, hold, 'Ritvars');
  assert.deepEqual((await go.companyMarks(db, a)).map((r) => [r.kind, r.final]), [['no', true]], 'made final: a do-not-invite now');
  await go.markEnd(db, no, 'Ritvars');
  await assert.rejects(go.markEnd(db, no, 'Ritvars'), /no longer on the list/);
  assert.equal((await go.marksList(db)).total, 1);
  assert.equal(Number((await db.prepare('SELECT COUNT(*) AS n FROM tc_invite_marks').get()).n), 2, 'Undo ends the mark, the row stays');
  assert.equal((await go.companyMarks(db, b)).length, 0);
  assert.ok((await go.markSearch(db, 'example')).rows.some((r) => r.companyId === a && r.contactId === null), 'the search finds the company');
  assert.ok((await go.markSearch(db, 'anna')).rows.some((r) => r.contactId === k1), 'and the person');
});

test('the Stage 2 lists carry the mark that applies to Stage 2 (every send, or Stage 2 only)', async () => {
  const { db, a, b, k2, k3 } = await seeded();
  await go.stage2Load(db, [
    { ch_contact_id: 'C1', sender: 'Marcis', name: 'Anna Example', company: 'Example Shipping', position: '', country: '', email: 'anna@example-shipping.com' },
    { ch_contact_id: 'C2', sender: 'Marcis', name: 'Peter Example', company: 'Example Shipping', position: '', country: '', email: 'peter@example-shipping.com' },
    { ch_contact_id: 'C3', sender: 'Marcis', name: 'Olga Sample', company: 'Sample Offshore', position: '', country: '', email: 'olga@sample-offshore.com' },
  ], 'Ritvars', { apply: true });
  await go.markAdd(db, { companyId: b, contactId: k3, send: 'stage2', why: 'mailbox' }, 'Ritvars');
  await go.markAdd(db, { companyId: a, contactId: k2, send: 'all', why: 'hold' }, 'Ritvars');
  const rows = Object.fromEntries((await go.stage2List(db, 'Marcis', null)).map((r) => [r.name, r.marked && r.marked.label]));
  assert.deepEqual(rows, { 'Anna Example': null, 'Peter Example': 'Hold', 'Olga Sample': 'Do not invite' });
  await go.markAdd(db, { companyId: a, send: 'all', why: 'manager' }, 'Ritvars');
  assert.equal((await go.stage2List(db, 'Marcis', null)).find((r) => r.name === 'Anna Example').marked.label, 'Do not invite', 'a whole-company mark reaches every person');
});

test('the page: the list on the event page after the Stage 2 lists, the line on the company page, the file; the routes behind the gate', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  const draw = app.slice(app.indexOf('function tcGoDraw('), app.indexOf('function tcGoStrip('));
  assert.ok(draw.indexOf('${tcGoStage2()}') < draw.indexOf('<div id="tcMk">${tcMkHtml()}</div>'), 'after the Stage 2 lists');
  const fn = app.slice(app.indexOf('function tcMkHtml('), app.indexOf('const tcGoCrumb = '));
  assert.ok(fn.includes('· Do not invite / hold · '));
  assert.ok(fn.includes('placeholder="Add a person or company"'));
  assert.match(fn, /'Release'|>Release</);
  assert.match(fn, />Make final</);
  assert.match(fn, />Undo</);
  assert.match(app, /\$\{tcRsvpLine\(\)\}\$\{tcMkLine\(\)\}<\/div>/, 'the company page line');
  assert.match(app, /<a href="#\/tc\/go">open the list<\/a>/);
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'tc.json'), 'utf8')).grandOpening.invite;
  assert.deepEqual(cfg.sends.map((x) => x.id), ['all', 'stage2']);
  assert.deepEqual(cfg.why.filter((x) => x.hold).map((x) => x.id), ['hold']);
  const server = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
  const gate = server.indexOf('// ------------------------------------------------------- TRAINING CENTRE --');
  for (const route of ["p === '/api/tc/go/marks' && req.method === 'GET'", "p === '/api/tc/go/marks' && req.method === 'POST'", "p === '/api/tc/go/marks.xlsx' && req.method === 'GET'", 'const markAct = p.match('])
    assert.ok(server.indexOf(route) > gate && gate > 0, route);
  assert.match(server, /\.\.\.list\.filter\(\(r\) => !r\.marked\)\.map\(/, 'the Stage 2 file leaves marked people out');
});
