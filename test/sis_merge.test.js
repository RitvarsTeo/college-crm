// Undo a duplicate the SIS made (decided by Ritvars 30.09.2026: the merge button).
// When the SIS creates a person who was already in the CRM under another email and phone,
// "Same person as..." picks the real one: the SIS link and the history move there, the extra
// record goes, and the next SIS run links to the real person. The screen is Session A's; this is
// the route behind it: POST /api/people/<id>/merge-into { targetId }.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { syncSis, mergeSisDuplicate } from '../src/sync.js';
import { lifecycleOf } from '../src/lifecycle.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ON = { SIS_API_TOKEN: 'test-sis-token-not-real-0000', CHANNEL_MODE_SIS: 'test' };
const app = (over = {}) => ({
  reference: 'ref-m', applicationId: 'app-m', givenName: 'Anna', familyName: 'Ozola-Berzina',
  email: 'anna.new@example.com', phone: '+371 29990009', programmeCode: 'NAV', status: 'submitted',   // 11.11.2026: a draft makes nobody, so the twin is a submitted one
  registeredAt: '2026-09-29T08:00:00.000Z', submittedAt: '2026-09-29T09:00:00.000Z', changedAt: '2026-09-29T09:00:00.000Z', ...over,
});
const sis = (apps) => async () => ({ ok: true, status: 200, json: async () => ({ applicants: apps, nextCursor: null }) });

async function twin(db) {
  await db.prepare(`INSERT INTO people (id, name, email, phone, status, owner, source_channel, first_channel, created_at)
    VALUES ('p-real', 'Anna Ozola', 'anna.old@example.com', NULL, 'Contacted', 'Admissions', 'phone', 'phone', '2026-09-01')`).run();
  await db.prepare(`INSERT INTO tasks (person_id, label, due_at, owner, created_at)
    VALUES ('p-real', 'Call back', '2026-10-01T09:00:00.000Z', 'Admissions', '2026-09-20')`).run();
  await syncSis(db, { now: new Date('2026-09-30T05:00:00Z'), env: ON, fetchImpl: sis([app()]) });
  const made = await db.prepare("SELECT id FROM people WHERE first_channel = 'sis'").get();
  return made.id;
}

test('merge: the SIS twin folds into the real person, and the next run links to her', async () => {
  const db = await openDb(':memory:');
  const extra = await twin(db);
  const r = await mergeSisDuplicate(db, extra, 'p-real', { by: 'Ieva' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM people').get()).n, 1, 'the extra record is gone');
  const real = await db.prepare("SELECT * FROM people WHERE id = 'p-real'").get();
  assert.equal(real.status, 'Application', 'the SIS submission moves her on');
  assert.equal(real.email, 'anna.old@example.com', 'her own email is kept');
  assert.equal(real.phone, '+371 29990009', 'an empty field is filled from the SIS');
  assert.equal(real.source_channel, 'phone', 'her first source is kept');
  assert.deepEqual((await lifecycleOf(db, 'p-real')).map((f) => f.fact), ['form_started']);
  assert.equal((await db.prepare("SELECT person_id FROM sis_applicants WHERE reference = 'ref-m'").get()).person_id, 'p-real');
  assert.equal((await db.prepare("SELECT person_id FROM inbound WHERE channel = 'sis'").get()).person_id, 'p-real');
  for (const t of ['events', 'tasks', 'lifecycle_events', 'inbound', 'sis_applicants', 'field_values', 'consents']) {
    assert.equal((await db.prepare(`SELECT COUNT(*) n FROM ${t} WHERE person_id = ?`).get(extra)).n, 0, t);
  }
  const ev = await db.prepare("SELECT * FROM events WHERE person_id = 'p-real' ORDER BY id").all();
  const line = ev.find((e) => e.subject && e.subject.startsWith('Merged'));
  assert.equal(line.subject, 'Merged: Anna Ozola-Berzina (created by the SIS) is this person');
  assert.equal(line.actor, 'Ieva');
  assert.ok(ev.some((e) => e.subject === 'Created from the SIS'), 'the SIS history moved with her');
  // the next run: no second person, the SIS change lands on her
  const n = await syncSis(db, { now: new Date('2026-10-01T05:00:00Z'), env: ON,
    fetchImpl: sis([app({ status: 'submitted', submittedAt: '2026-09-30T10:00:00.000Z', changedAt: '2026-09-30T10:00:00.000Z' })]) });
  assert.equal(n.created, 0);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM people').get()).n, 1);
});

// patch 192 (his pick 27.11.2026): any person can be merged, not only one the SIS created. The case: a website form made
// into a lead as "noreply@tilda.ws" while the enquirer was already a lead under their own name.
test('merge: any person into somebody else who exists; the kept person\'s own details stay', async () => {
  const db = await openDb(':memory:');
  const AT = '2026-11-27T07:48:08.000Z';
  await db.prepare(`INSERT INTO people (id, name, email, phone, status, owner, source_channel, first_channel, created_at) VALUES
    ('p-tilda', 'noreply@tilda.ws', 'noreply@tilda.ws', NULL, 'Contacted', 'Admissions', 'gmail', 'gmail', '2026-11-26T10:33:47.000Z'),
    ('p-ann', 'Anna Example', 'anna@mail.example', '+371 20001122', 'Follow-up', 'Admissions', 'email', 'gmail', ?)`).run(AT);
  await db.prepare(`INSERT INTO tasks (person_id, label, due_at, owner, created_at) VALUES ('p-tilda', 'Answer the question', ?, 'Admissions', ?)`).run(AT, AT);
  const r = await mergeSisDuplicate(db, 'p-tilda', 'p-ann', { by: 'Ritvars' });
  assert.equal(r.ok, true, JSON.stringify(r));
  const ann = await db.prepare("SELECT * FROM people WHERE id = 'p-ann'").get();
  assert.deepEqual([ann.name, ann.email, ann.phone, ann.status], ['Anna Example', 'anna@mail.example', '+371 20001122', 'Follow-up']);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM people WHERE id = 'p-tilda'").get()).n, 0, 'the duplicate is gone');
  assert.equal((await db.prepare("SELECT person_id FROM tasks").get()).person_id, 'p-ann', 'its rows moved');
  assert.ok((await db.prepare("SELECT subject FROM events WHERE person_id = 'p-ann'").all()).some((e) => e.subject === 'Merged: noreply@tilda.ws is this person'));
});

test('merge: refused into itself, into nobody, or without a name', async () => {
  const db = await openDb(':memory:');
  const extra = await twin(db);
  assert.equal((await mergeSisDuplicate(db, extra, extra, { by: 'Ieva' })).ok, false);
  assert.equal((await mergeSisDuplicate(db, extra, 'p-none', { by: 'Ieva' })).ok, false);
  assert.equal((await mergeSisDuplicate(db, extra, 'p-real', {})).ok, false, 'who did it is required');
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM people').get()).n, 2, 'nothing changed');
});

function start(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], { env: { ...process.env,
      PORT: '0', CRM_DB: ':memory:', DATASET: 'empty', CRM_AUTH: '', CRM_PUBLIC: '', DATABASE_URL: '',
      CRM_DB_DATABASE_URL_UNPOOLED: '', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const look = (d) => { out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, base: `http://127.0.0.1:${m[1]}` }); };
    child.stdout.on('data', look); child.stderr.on('data', look);
    child.on('exit', () => reject(new Error(out)));
  });
}

test('merge over the wire: the route merges, and refuses a merge into a person who does not exist', async (t) => {
  const SECRET = 'test-application-secret-not-real-0000';
  const s = await start({ CHANNEL_MODE_SIS: 'test', SIS_APPLICATION_SECRET: SECRET });
  t.after(() => s.child.kill());
  const post = (p, body, h = {}) => fetch(s.base + p, { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-acting-as': 'Ieva', ...h }, body: JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));
  const real = await post('/api/people', { name: 'Anna Ozola', email: 'anna.old@example.com', status: 'Contacted',
    source_channel: 'phone', nextAction: 'Call back' });
  assert.ok(real.status < 300, JSON.stringify(real));
  const realId = real.json.id || (real.json.person && real.json.person.id);
  assert.ok(realId, JSON.stringify(real.json));
  assert.equal((await post('/api/intake/application', app(), { 'x-crm-application-secret': SECRET })).status, 200);
  const all = await fetch(s.base + '/api/people', { headers: { 'x-acting-as': 'Ieva' } }).then((r) => r.json());
  const list = Array.isArray(all) ? all : all.people || all.rows;
  const extra = list.find((x) => x.id !== realId).id;

  const no = await post(`/api/people/${realId}/merge-into`, { targetId: 'p-nobody' });
  assert.equal(no.status, 404);
  const yes = await post(`/api/people/${extra}/merge-into`, { targetId: realId });
  assert.equal(yes.status, 200, JSON.stringify(yes.json));
  const after = await fetch(s.base + '/api/people', { headers: { 'x-acting-as': 'Ieva' } }).then((r) => r.json());
  assert.equal((Array.isArray(after) ? after : after.people || after.rows).length, 1);
});
