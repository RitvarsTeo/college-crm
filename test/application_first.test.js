// CRM TEST CASE, SAID 30.09.2026 (Ritvars): first contact is the application form.
// Decided the same day in the popup (docs/BACKLOG.md, "Session B"):
//   - application-first = nobody in people AND no waiting New Leads item with the same email or
//     last 8 phone digits, when the SIS record arrives
//   - SIS started or later -> a person at Application, "Application form started" dated
//   - SIS registered (no application yet) -> a person at New, no fact; started moves them on
//   - New Leads gets a DONE item (confirmed by the SIS), so the funnel counts them from the top
//   - somebody who was already a lead keeps the existing path
//
// NOTHING HERE CALLS THE SIS. Every test hands in a fake fetch and a fake token.

import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { syncSis } from '../src/sync.js';
import { receive, funnel } from '../src/intake.js';
import { lifecycleOf } from '../src/lifecycle.js';

const ON = { SIS_API_TOKEN: 'test-sis-token-not-real-0000', CHANNEL_MODE_SIS: 'test' };
const NOW = new Date('2026-09-30T05:00:00Z');

const app = (over = {}) => ({
  reference: 'ref-af', applicationId: 'app-af', givenName: 'Anna', familyName: 'Ozola',
  email: 'anna.ozola@example.com', phone: '+371 29990001', programmeCode: 'NAV', status: 'started',
  registeredAt: '2026-09-29T08:00:00.000Z', submittedAt: null, changedAt: '2026-09-29T09:00:00.000Z', ...over,
});
const sis = (apps) => async () => ({ ok: true, status: 200, json: async () => ({ applicants: apps, nextCursor: null }) });
const run = (db, apps, now = NOW) => syncSis(db, { now, env: ON, fetchImpl: sis(apps) });

const people = (db) => db.prepare('SELECT * FROM people ORDER BY created_at').all();
const waiting = async (db) => (await db.prepare("SELECT COUNT(*) n FROM inbound WHERE state = 'new'").get()).n;

test('application-first: SIS started -> a person at Application, form started dated, nothing waits', async () => {
  const db = await openDb(':memory:');
  const r = await run(db, [app()]);
  const all = await people(db);
  assert.equal(all.length, 1, 'one person');
  const [p] = all;
  assert.equal(p.status, 'Application');
  assert.equal(p.name, 'Anna Ozola');
  assert.equal(p.email, 'anna.ozola@example.com');
  assert.equal(p.programme, 'NAV');
  assert.equal(p.qualification, 'lead');
  assert.equal(p.owner, 'Admissions');
  assert.equal(p.source_channel, 'sis');
  assert.equal(p.first_channel, 'sis');
  assert.equal(await waiting(db), 0, 'nobody waits in New Leads');
  assert.equal(r.inbox, 0);
  assert.equal(r.created, 1);
  assert.deepEqual((await lifecycleOf(db, p.id)).map((f) => [f.fact, f.at]),
    [['form_started', '2026-09-29T09:00:00.000Z']]);
  const ev = await db.prepare('SELECT * FROM events WHERE person_id = ? ORDER BY id').all(p.id);
  const made = ev.find((e) => e.kind === 'create');
  assert.equal(made.subject, 'Created from the SIS');
  assert.equal(made.body, 'SIS: NAV application started');
  assert.equal(made.actor, 'SIS');
  assert.equal(made.origin, 'automatic');
  const link = await db.prepare('SELECT person_id FROM sis_applicants WHERE reference = ?').get('ref-af');
  assert.equal(link.person_id, p.id);
});

test('application-first: the funnel counts them from the top (done item, lead, application)', async () => {
  const db = await openDb(':memory:');
  await run(db, [app()]);
  const items = await db.prepare("SELECT * FROM inbound WHERE channel = 'sis'").all();
  assert.equal(items.length, 1);
  assert.equal(items[0].state, 'qualified');
  assert.equal(items[0].qualification, 'lead');
  assert.equal(items[0].processed_by, 'SIS');
  assert.equal(items[0].person_id, (await people(db))[0].id);
  assert.equal(items[0].source, 'simulated', 'test mode still says simulated');
  const f = await funnel(db);
  const step = (name) => f.steps.find((s) => s.step === name).count;
  assert.equal(step('Contacted us'), 1);
  assert.equal(step('Waiting to be looked at'), 0);
  assert.equal(step('Became a lead'), 1);
  assert.equal(step('Application'), 1);
});

test('application-first: submitted is at Application too, form started by its submit date', async () => {
  const db = await openDb(':memory:');
  await run(db, [app({ status: 'submitted', submittedAt: '2026-09-29T10:00:00.000Z', changedAt: '2026-09-29T10:00:00.000Z' })]);
  const [p] = await people(db);
  assert.equal(p.status, 'Application');
  assert.deepEqual((await lifecycleOf(db, p.id)).map((f) => [f.fact, f.at]),
    [['form_started', '2026-09-29T10:00:00.000Z']]);
});

test('application-first: matriculated straight away -> Admitted, both facts', async () => {
  const db = await openDb(':memory:');
  await run(db, [app({ status: 'matriculated', submittedAt: '2026-09-20T10:00:00.000Z' })]);
  const [p] = await people(db);
  assert.equal(p.status, 'Admitted');
  assert.equal(p.admitted_at, NOW.toISOString());
  assert.deepEqual((await lifecycleOf(db, p.id)).map((f) => f.fact), ['form_started', 'matriculated']);
});

test('application-first: registered only -> a person at New, no fact; started later moves them on', async () => {
  const db = await openDb(':memory:');
  await run(db, [app({ status: 'registered', applicationId: null, programmeCode: null })]);
  let [p] = await people(db);
  assert.equal(p.status, 'New');
  assert.equal(await waiting(db), 0);
  assert.deepEqual(await lifecycleOf(db, p.id), []);
  // the SIS touches the record again, still registered: they stay at New
  await run(db, [app({ status: 'registered', applicationId: null, programmeCode: null,
    changedAt: '2026-09-29T11:00:00.000Z' })]);
  [p] = await people(db);
  assert.equal(p.status, 'New');
  // the application starts
  await run(db, [app({ changedAt: '2026-09-30T04:00:00.000Z' })]);
  const all = await people(db);
  assert.equal(all.length, 1, 'still one person');
  assert.equal(all[0].status, 'Application');
  assert.deepEqual((await lifecycleOf(db, p.id)).map((f) => [f.fact, f.at]),
    [['form_started', '2026-09-30T04:00:00.000Z']]);
});

test('application-first: the same application twice is one person and one item', async () => {
  const db = await openDb(':memory:');
  await run(db, [app()]);
  await run(db, [app({ status: 'submitted', submittedAt: '2026-09-29T12:00:00.000Z', changedAt: '2026-09-29T12:00:00.000Z' })]);
  await run(db, [app({ status: 'submitted', submittedAt: '2026-09-29T12:00:00.000Z', changedAt: '2026-09-29T12:00:00.000Z' })]);
  assert.equal((await people(db)).length, 1);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM inbound WHERE channel = 'sis'").get()).n, 1);
});

test('application-first: somebody who was already a lead keeps the existing path', async () => {
  const db = await openDb(':memory:');
  await db.prepare(`INSERT INTO people (id, name, email, status, owner, source_channel, created_at)
    VALUES ('p-lead', 'Anna O.', 'ANNA.OZOLA@example.com', 'Contacted', 'Admissions', 'phone', '2026-09-01')`).run();
  const r = await run(db, [app()]);
  const all = await people(db);
  assert.equal(all.length, 1, 'no second person');
  assert.equal(all[0].status, 'Application');
  assert.equal(all[0].source_channel, 'phone', 'first source kept');
  assert.equal(r.linked, 1);
  assert.equal(r.created, 0);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM inbound WHERE channel = 'sis'").get()).n, 0);
});

test('application-first: a known lead at New still moves on registered (the 29.09 path)', async () => {
  const db = await openDb(':memory:');
  await db.prepare(`INSERT INTO people (id, name, phone, status) VALUES ('p-new', 'Anna', '29990001', 'New')`).run();
  await run(db, [app({ status: 'registered', applicationId: null, email: null })]);
  assert.equal((await db.prepare("SELECT status FROM people WHERE id = 'p-new'").get()).status, 'Application');
});

test('application-first: a call still waiting in New Leads with the same number is not application-first', async () => {
  const db = await openDb(':memory:');
  await receive(db, { channel: 'phone', externalId: 'call-1', phone: '+37129990001', body: 'missed call', source: 'simulated' });
  const r = await run(db, [app({ email: null })]);
  assert.equal((await people(db)).length, 0, 'nobody is created');
  assert.equal(r.created, 0);
  assert.equal(r.inbox, 1, 'the SIS item waits beside the call, as today');
});

test('application-first: an SIS item already waiting in New Leads is left for a human', async () => {
  const db = await openDb(':memory:');
  // what the 29.09 run left behind: an SIS item waiting, the SIS row not linked
  const item = await receive(db, { channel: 'sis', externalId: 'sis:ref-af', name: 'Anna Ozola',
    email: 'anna.ozola@example.com', body: 'SIS: NAV application started', source: 'simulated' });
  await db.prepare(`INSERT INTO sis_applicants (reference, application_id, given_name, family_name, email, phone,
    programme_code, status, registered_at, submitted_at, changed_at, synced_at, inbound_id)
    VALUES ('ref-af','app-af','Anna','Ozola','anna.ozola@example.com',NULL,'NAV','started',NULL,NULL,
    '2026-09-29T09:00:00.000Z','2026-09-29T09:00:00.000Z',?)`).run(item.id);
  const r = await run(db, [app({ changedAt: '2026-09-29T09:30:00.000Z' })]);
  assert.equal((await people(db)).length, 0);
  assert.equal(r.created, 0);
  assert.equal(await waiting(db), 1);
});

// PRODUCTION SHAPE (APPLICATIONS lane, 01.10.2026). Production holds six SIS rows archived as
// Internal on 30.09 (the team's own test submissions): four registered-only, one matriculated, one
// submitted, none linked. After this release the daily pull retries every unlinked reference, so
// it must leave all six alone: no person, no new New Leads item, even when one of them changes.
test('application-first: the six archived production SIS rows are never turned into people', async () => {
  const { openDb } = await import('../src/db.js');
  const { syncSis } = await import('../src/sync.js');
  const { archive, receive } = await import('../src/intake.js');
  const env = { SIS_API_TOKEN: 'test-sis-token-not-real-0000', CHANNEL_MODE_SIS: 'test' };
  const six = ['registered', 'registered', 'registered', 'registered', 'matriculated', 'submitted'].map((status, i) => ({
    reference: 'prod-like-' + i, applicationId: status === 'registered' ? '' : 'app-' + i, givenName: 'Test',
    familyName: 'Person ' + i, email: `test.person.${i}@example.com`, phone: i % 2 ? null : '+3712000000' + i,
    programmeCode: status === 'registered' ? null : 'ENG', status, registeredAt: '2026-09-25T10:00:00.000Z',
    submittedAt: status === 'registered' ? null : '2026-09-27T10:00:00.000Z', changedAt: `2026-09-2${5 + (i % 4)}T10:00:00.000Z`,
  }));
  const feed = (apps) => async () => ({ ok: true, status: 200, json: async () => ({ applicants: apps, nextCursor: null }) });
  const db = await openDb(':memory:');
  // how production got there: the 29.09 build raised all six in New Leads, a person archived them
  for (const a of six) {
    await db.prepare(`INSERT INTO sis_applicants (reference, application_id, given_name, family_name, email, phone,
      programme_code, status, registered_at, submitted_at, changed_at, synced_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      a.reference, a.applicationId, a.givenName, a.familyName, a.email, a.phone, a.programmeCode, a.status,
      a.registeredAt, a.submittedAt, a.changedAt, '2026-09-29T11:30:40.888Z');
    const { id } = await receive(db, { channel: 'sis', externalId: 'sis:' + a.reference,
      receivedAt: '2026-09-29T11:30:40.888Z', name: a.givenName + ' ' + a.familyName, email: a.email,
      phone: a.phone, body: 'SIS: registered, no application yet', source: 'simulated' });
    await db.prepare('UPDATE sis_applicants SET inbound_id = ? WHERE reference = ?').run(id, a.reference);
    const done = await archive(db, id, { reason: 'Internal', by: 'Admin', note: 'team test submission' });
    assert.ok(!done.error, JSON.stringify(done));
  }
  // the same six again, and one of them moves on in the SIS
  const moved = six.map((a, i) => (i === 0 ? { ...a, status: 'started', applicationId: 'app-0', changedAt: '2026-10-01T05:00:00.000Z' } : a));
  const r = await syncSis(db, { now: new Date('2026-10-02T05:00:00Z'), env, fetchImpl: feed(moved) });
  assert.equal(r.created, 0);
  assert.equal(r.inbox, 0);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM people').get()).n, 0);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM inbound WHERE channel = 'sis' AND state = 'archived'").get()).n, 6);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM inbound WHERE channel = 'sis'").get()).n, 6);
});
