// ADMITTED = MATRICULATED (13.11.2026, the admissions team: "admitted should appear only at the very last step,
// matriculation"; the owner's pick A). The SIS "admitted" (accepted, not matriculated) keeps a person in Application and
// their page shows "Admitted (not matriculated)"; only "matriculated" makes them Admitted.
// AND A RECORD TYPED INTO THE SIS BY HAND (registered, submitted and changed in the same minute, no admission date) is a
// real student with NO admission date: its submit date is the day it was typed (09.10.2026 for three students admitted in
// 2025), never an admission date. Made-up people, a fake SIS.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { syncSis, SIS_STAGE } from '../src/sync.js';
import { handTyped, sisAdmissionDate } from '../src/sisdates.js';
import { sisProgress } from '../src/lifecycle.js';

const ON = { SIS_API_TOKEN: 'test-sis-token-not-real-0000', CHANNEL_MODE_SIS: 'live' };
const NOW = new Date('2026-11-13T05:00:00Z');
const app = (over = {}) => ({
  reference: 'ref-1', applicationId: 'app-1', givenName: 'Paraugs', familyName: 'Studentiņš',
  email: 'paraugs@example.com', phone: null, programmeCode: 'NAV', status: 'submitted',
  registeredAt: '2026-10-20T07:40:11.000Z', submittedAt: '2026-10-20T07:58:02.000Z', changedAt: '2026-10-22T09:00:00.000Z', ...over,
});
// staff typing an existing student into the SIS: every step in the same second
const typed = (over = {}) => app({ registeredAt: '2026-10-09T10:31:16.877Z', submittedAt: '2026-10-09T10:31:16.868Z',
  changedAt: '2026-10-09T10:31:16.897Z', status: 'matriculated', ...over });
const sis = (apps) => async () => ({ ok: true, status: 200, json: async () => ({ applicants: apps, nextCursor: null }) });
const pull = (db, apps) => syncSis(db, { now: NOW, env: ON, fetchImpl: sis(apps) });
async function known(db, status = 'Application') {
  await db.prepare(`INSERT INTO people (id, name, email, status, created_at) VALUES ('p1', 'Paraugs Studentiņš', 'paraugs@example.com', ?, '2026-10-01T09:00:00.000Z')`).run(status);
  return () => db.prepare("SELECT status, admitted_at FROM people WHERE id = 'p1'").get();
}

test('the map: submitted and admitted are a submitted application, only matriculated is Admitted', () => {
  assert.deepEqual({ ...SIS_STAGE }, { submitted: 'Application', admitted: 'Application', matriculated: 'Admitted' });
});

test('an SIS "admitted" leaves the person in Application, undated; their page says "Admitted (not matriculated)"', async () => {
  const db = await openDb(':memory:');
  const me = await known(db);
  await pull(db, [app({ status: 'admitted' })]);
  assert.deepEqual({ ...(await me()) }, { status: 'Application', admitted_at: null });
  const p = sisProgress([{ status: 'admitted', changed_at: '2026-10-22' }]);
  assert.equal(p.label, 'Admitted (not matriculated)');
  assert.equal(p.next, 'Matriculated');
});

test('matriculated makes them Admitted, dated by the SIS record', async () => {
  const db = await openDb(':memory:');
  const me = await known(db);
  await pull(db, [app({ status: 'matriculated' })]);
  assert.deepEqual({ ...(await me()) }, { status: 'Admitted', admitted_at: '2026-10-20T07:58:02.000Z' });
});

test('a hand-typed record: Admitted with NO admission date, never the day it was typed', async () => {
  const db = await openDb(':memory:');
  const me = await known(db);
  await pull(db, [typed()]);
  assert.deepEqual({ ...(await me()) }, { status: 'Admitted', admitted_at: null });
});

test('a hand-typed student Intake never had is made, undated, so the admissions team sees them under "without a date"', async () => {
  const db = await openDb(':memory:');
  await pull(db, [typed()]);
  const p = await db.prepare("SELECT status, admitted_at FROM people WHERE email = 'paraugs@example.com'").get();
  assert.ok(p, 'made, not dropped');
  assert.deepEqual({ ...p }, { status: 'Admitted', admitted_at: null });
});

test('what counts as hand-typed: the three steps within one minute and no SIS admission date', () => {
  const row = (r) => ({ registered_at: r.registeredAt, submitted_at: r.submittedAt, changed_at: r.changedAt, status: r.status });
  assert.equal(handTyped(row(typed())), true);
  assert.equal(handTyped(row(app({ status: 'matriculated' }))), false, 'a real application: registered 07:40, submitted 07:58');
  assert.equal(handTyped({ ...row(typed()), admitted_on: '2025-02-24T00:00:00Z' }), false, 'the SIS dates it: that date is used');
  assert.equal(sisAdmissionDate([{ ...row(typed()), admitted_on: '2025-02-24T00:00:00Z' }]), '2025-02-24T00:00:00.000Z');
  assert.equal(sisAdmissionDate([row(typed())]), null);
});
