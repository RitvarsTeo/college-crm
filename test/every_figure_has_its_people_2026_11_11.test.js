// EVERY FIGURE HAS ITS PEOPLE (the owner 11.11.2026: "everyone should be accounted for in intake, meaning no empty stats
// can physically appear there, because it doesnt have legs to grow from ... thats why every metric is clickable").
// On a running copy: Home's Leads and Admitted, the Due counts and the Journey stages each equal the list they open, and
// every person a figure counts is in the people list. A person who is only a draft in the SIS and already in Intake
// (made before 11.11.2026) is counted AND listed, like anybody else; a new draft makes nobody. Synthetic people only.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { start } from './security_helpers.js';

for (const k of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'CRM_DB_DATABASE_URL_UNPOOLED', 'INTAKE_DATABASE_URL']) process.env[k] = '';
const { openDb } = await import('../src/db.js');
const { receiveSisApplication } = await import('../src/sync.js');

const now = new Date();
const iso = (days) => new Date(now.getTime() + days * 86400000).toISOString();
const Y = now.getUTCFullYear();
const jan = (h) => `${Y}-01-01T${String(h).padStart(2, '0')}:00:00.000Z`;   // people arrive on 1 January: always this year, always past

async function seed(file) {
  const db = await openDb(file);
  const add = (id, name, status, created, extra = {}) => db.prepare(`INSERT INTO people (id, name, email, status, owner, created_at, admitted_at, first_channel)
    VALUES (?,?,?,?,?,?,?,?)`).run(id, name, `${id}@example.com`, status, 'Ieva', created, extra.admitted || null, extra.first || 'phone');
  await add('n1', 'Anna Paraugs', 'New', jan(9));
  await add('c1', 'Pēteris Paraugs', 'Contacted', jan(10));
  await add('f1', 'Laura Paraugs', 'Follow-up', jan(11));
  await add('a1', 'Ralfs Paraugs', 'Admitted', jan(12), { admitted: jan(13) });
  await add('x1', 'Toms Paraugs', 'Not proceeding', jan(14));
  await add('t1', 'Test Paraugs', 'New', jan(15));                                     // a test record: in no figure, no list
  // made by the SIS before 11.11.2026 from a begun form, with its call step: stays, counted and listed ("Stay, counted")
  await add('d1', 'Ilze Paraugs', 'New', jan(16), { first: 'sis' });
  await db.prepare(`INSERT INTO sis_applicants (reference, application_id, status, registered_at, changed_at, person_id, synced_at)
    VALUES ('ref-d1', 'app-d1', 'started', ?, ?, 'd1', ?)`).run(iso(-4), iso(-4), iso(-4));
  const step = (pid, label, due) => db.prepare('INSERT INTO tasks (person_id, label, due_at, owner, created_at) VALUES (?,?,?,?,?)').run(pid, label, due, 'Ieva', iso(-5));
  await step('n1', 'Call', iso(-2));                                                  // overdue
  await step('c1', 'Send the programme', now.toISOString());                          // today
  await step('d1', 'Call: did they finish the application form?', iso(-1));          // the legacy draft's step
  await step('t1', 'Call', iso(-2));                                                  // the test record's: nowhere
  // a NEW draft from somebody we do not know: nobody is made
  const r = await receiveSisApplication(db, { reference: 'ref-new', applicationId: 'app-new', givenName: 'Jauns', familyName: 'Paraugs',
    email: 'jauns@example.com', phone: null, programmeCode: 'NAV', status: 'started', registeredAt: iso(-1), submittedAt: null, changedAt: iso(-1) },
  { env: { SIS_API_TOKEN: 'test-sis-token-not-real-0000', CHANNEL_MODE_SIS: 'test' }, now });
  assert.equal(r.outcome, 'draft');
  await db.close();
}

let srv = null;
after(() => { if (srv) srv.child.kill(); });
test('every figure equals the people it opens; the legacy draft is counted and listed; a new draft is nobody', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-figures-'));
  const file = path.join(dir, 'figures.db');
  await seed(file);
  srv = await start({ CRM_DB: file, DATASET: '', CRM_AUTH: '', CRM_PUBLIC: '' });
  const get = async (p) => (await fetch(srv.base + p, { headers: { 'x-acting-as': 'Ieva' } })).json();
  const all = (await get('/api/people')).rows;
  const ids = new Set(all.map((p) => p.id));
  assert.ok(!ids.has('t1'), 'the test record is in no list');
  assert.ok(ids.has('d1'), 'the draft made before 11.11 is listed');
  assert.ok(!all.some((p) => p.email === 'jauns@example.com'), 'a new draft made nobody');

  // Home: Leads and Admitted for the year = the people list for the year
  const rep = await get(`/api/report?years=${Y}`);
  const year = (await get(`/api/people?y=${Y}`)).rows;
  const arrived = all.filter((p) => String(p.created_at).slice(0, 4) === String(Y));
  assert.equal(rep.summary.newLeads, arrived.length, 'Leads = the people who arrived that year, each one in the list');
  assert.equal(year.filter((p) => p.status === 'Admitted').length, 1);
  // Journey: each stage's count is the people in it, and every one of them is in the list
  for (const st of ['New', 'Contacted', 'Follow-up', 'Not proceeding', 'Admitted']) {
    const listed = (await get(`/api/people?y=${Y}&status=${encodeURIComponent(st)}`)).rows;
    assert.equal(listed.length, year.filter((p) => p.status === st).length, st);
    assert.ok(listed.every((p) => ids.has(p.id)), st + ': every one is in the people list');
  }
  assert.equal(year.filter((p) => p.status === 'New').length, 2, 'New: Anna and the legacy draft Ilze');
  // Due: the counts are the steps listed, and every step's person is in the people list
  const sum = await get('/api/summary');
  const overdue = await get('/api/tasks?scope=overdue');
  const today = await get('/api/tasks?scope=today');
  const open = await get('/api/tasks?scope=open');
  assert.equal(sum.overdue.length, overdue.length);
  assert.equal(sum.today.length, today.length);
  for (const t of [...sum.overdue, ...sum.today, ...open]) assert.ok(ids.has(t.person_id), `step ${t.label}: its person is listed`);
  assert.ok(open.some((t) => t.person_id === 'd1'), "the legacy draft's step is on Due");
  assert.ok(!open.some((t) => t.person_id === 't1'), "the test record's step is not");
});
