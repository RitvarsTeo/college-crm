// Ritvars 07.10.2026, after "only a submission moves the stage": "WE HAVE TO KNOW WHEN THIS HAPPEN, they
// could have the need a next action, calling checking in, if they completed the form actually, because
// system shows that they didnt!" Confirmed by popup "Yes, both":
//   1. somebody the SIS says only REGISTERED or STARTED gets a next step to call and check whether they
//      finished the form, instead of being quietly "With the SIS";
//   2. the people already at Submitted application for that reason alone move back, once, with a line on
//      their history and the same step. Anybody moved there by hand stays.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { syncSis } from '../src/sync.js';
import { SIS_HOLDS } from '../src/lifecycle.js';
import { foldSisOnlyApplication, FORM_CHECK, WHY_SIS } from '../src/stagefold.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const ENV = { SIS_API_TOKEN: 'test-sis-token-not-real-0000', CHANNEL_MODE_SIS: 'test' };
const feed = (apps) => async () => ({ ok: true, status: 200, json: async () => ({ applicants: apps, nextCursor: null }) });
const app = (over = {}) => ({ reference: 'ref-fc', applicationId: 'app-fc', givenName: 'Anna', familyName: 'Ozola',
  email: 'anna.fc@example.com', phone: '+371 29990077', programmeCode: 'NAV', status: 'started',
  registeredAt: '2026-10-01T09:00:00.000Z', submittedAt: null, changedAt: '2026-10-01T09:00:00.000Z', ...over });
const tasks = async (db, id) => (await db.prepare('SELECT label, done_at FROM tasks WHERE person_id = ? ORDER BY id').all(id));

test('the step exists, fits every stage, and does not move the stage', () => {
  const step = CFG.nextActions.flatMap((g) => g.items).find((i) => i.label === FORM_CHECK);
  assert.ok(step, 'a configured step, so every screen offers and names it');
  assert.equal(FORM_CHECK, 'Call: did they finish the application form?');
  assert.equal(step.anyStage, true);
  assert.equal(step.advancesTo, undefined, 'a call does not move anybody on');
});

test('"With the SIS" no longer covers a form only started: they need a step like anybody else', () => {
  assert.deepEqual(SIS_HOLDS, ['submitted', 'admitted', 'matriculated']);
  assert.match(APP, /const C_SIS_HOLDS = \['submitted', 'admitted', 'matriculated'\];/, 'the page uses the same rule');
});

test('a known lead the SIS says started: the call step is planned once, and the stage stays', async () => {
  const db = await openDb(':memory:');
  await db.prepare(`INSERT INTO people (id, name, email, status, owner, created_at) VALUES ('p1', 'Anna', 'anna.fc@example.com', 'Contacted', 'Admissions', '2026-09-01')`).run();
  await syncSis(db, { now: new Date('2026-10-02T05:00:00Z'), env: ENV, fetchImpl: feed([app()]) });
  assert.equal((await db.prepare("SELECT status FROM people WHERE id = 'p1'").get()).status, 'Contacted');
  assert.deepEqual((await tasks(db, 'p1')).map((t) => t.label), [FORM_CHECK]);
  // the same record changes again, still started: no second open step
  await syncSis(db, { now: new Date('2026-10-03T05:00:00Z'), env: ENV, fetchImpl: feed([app({ changedAt: '2026-10-02T09:00:00.000Z' })]) });
  assert.equal((await tasks(db, 'p1')).filter((t) => t.label === FORM_CHECK && !t.done_at).length, 1, 'one open at a time');
});

test('a person the SIS created at started: at New, with the call step; submitted later: no new step', async () => {
  const db = await openDb(':memory:');
  await syncSis(db, { now: new Date('2026-10-02T05:00:00Z'), env: ENV, fetchImpl: feed([app()]) });
  const p = await db.prepare("SELECT id, status FROM people WHERE first_channel = 'sis'").get();
  assert.equal(p.status, 'New');
  assert.deepEqual((await tasks(db, p.id)).map((t) => t.label), [FORM_CHECK]);
  await syncSis(db, { now: new Date('2026-10-03T05:00:00Z'), env: ENV, fetchImpl: feed([app({ status: 'submitted',
    submittedAt: '2026-10-02T10:00:00.000Z', changedAt: '2026-10-02T10:00:00.000Z' })]) });
  assert.equal((await db.prepare('SELECT status FROM people WHERE id = ?').get(p.id)).status, 'Application');
  assert.equal((await tasks(db, p.id)).length, 1, 'a submission plans nothing new');
});

test('a submitted or admitted person gets no call step', async () => {
  const db = await openDb(':memory:');
  await syncSis(db, { now: new Date('2026-10-02T05:00:00Z'), env: ENV, fetchImpl: feed([app({ status: 'submitted', submittedAt: '2026-10-01T10:00:00.000Z' })]) });
  const p = await db.prepare("SELECT id FROM people WHERE first_channel = 'sis'").get();
  assert.equal((await tasks(db, p.id)).length, 0);
});

const sisRow = async (db, ref, personId, status) => db.prepare(`INSERT INTO sis_applicants (reference, application_id, status,
  registered_at, changed_at, person_id, synced_at) VALUES (?,?,?,?,?,?,?)`).run(ref, status === 'registered' ? '' : 'a-' + ref, status,
  '2026-10-01T09:00:00.000Z', '2026-10-01T09:00:00.000Z', personId, '2026-10-01T09:00:00.000Z');
const statusEv = async (db, id, from, to, origin, actor) => db.prepare(`INSERT INTO events (person_id, kind, direction, occurred_at, subject, actor, origin, field, old_value, new_value)
  VALUES (?, 'status', 'note', '2026-10-01T10:00:00.000Z', ?, ?, ?, 'status', ?, ?)`).run(id, `Status: ${from} -> ${to}`, actor, origin, from, to);

test('the fold: back to the stage before the SIS moved them, with a line and the call step; by hand stays; once', async () => {
  const db = await openDb(':memory:');
  const add = (id, status, first = null) => db.prepare(`INSERT INTO people (id, name, status, owner, first_channel, created_at) VALUES (?,?,?,?,?,?)`)
    .run(id, 'P ' + id, status, 'Admissions', first, '2026-09-01T10:00:00.000Z');
  await add('moved', 'Application'); await sisRow(db, 'r1', 'moved', 'started'); await statusEv(db, 'moved', 'New', 'Application', 'automatic', 'SIS');
  await add('created', 'Application', 'sis'); await sisRow(db, 'r2', 'created', 'started');            // created by the SIS at Application, no move on record
  await add('lead', 'Application'); await sisRow(db, 'r3', 'lead', 'registered'); await statusEv(db, 'lead', 'Follow-up', 'Application', 'automatic', 'SIS');
  await add('byhand', 'Application'); await sisRow(db, 'r4', 'byhand', 'started'); await statusEv(db, 'byhand', 'Contacted', 'Application', 'manual', 'Ieva');
  await add('submitted', 'Application'); await sisRow(db, 'r5', 'submitted', 'submitted');
  await add('nosis', 'Application'); await statusEv(db, 'nosis', 'New', 'Application', 'automatic', 'Intake');
  // the SIS moved them, then somebody completed a step that moves to Application (logged by Intake): a human acted
  await add('stepped', 'Application'); await sisRow(db, 'r6', 'stepped', 'started'); await statusEv(db, 'stepped', 'New', 'Application', 'automatic', 'SIS');
  await statusEv(db, 'stepped', 'Application', 'Application', 'automatic', 'Intake');
  const r = await foldSisOnlyApplication(db, { now: '2026-10-07T08:00:00.000Z' });
  assert.equal(r.moved, 3);
  const st = Object.fromEntries((await db.prepare('SELECT id, status FROM people').all()).map((x) => [x.id, x.status]));
  assert.deepEqual(st, { moved: 'New', created: 'New', lead: 'Follow-up', byhand: 'Application', submitted: 'Application', nosis: 'Application', stepped: 'Application' });
  for (const id of ['moved', 'created', 'lead']) {
    const ev = await db.prepare("SELECT body, old_value, new_value, origin FROM events WHERE person_id = ? AND body = ?").get(id, WHY_SIS);
    assert.ok(ev, id + ': the line on the history');
    assert.deepEqual([ev.old_value, ev.new_value, ev.origin], ['Application', st[id], 'automatic']);
    assert.deepEqual((await tasks(db, id)).map((t) => t.label), [FORM_CHECK], id + ': the call step');
  }
  assert.equal(WHY_SIS, 'moved: only a submitted application counts (07.10)');
  assert.equal((await tasks(db, 'byhand')).length, 0, 'moved by hand: untouched');
  assert.equal((await foldSisOnlyApplication(db)).moved, 0, 'idempotent');
  // ONE-TIME: somebody the SIS moves to Application later, wrongly or not, is never folded by a later boot
  await add('later', 'Application'); await sisRow(db, 'r7', 'later', 'started'); await statusEv(db, 'later', 'New', 'Application', 'automatic', 'SIS');
  const again = await foldSisOnlyApplication(db);
  assert.equal(again.moved, 0); assert.ok(again.already, 'the marker says it ran');
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM tasks").get()).n, 3, 'no second step');
});

test('Help says it in the same change', () => {
  const help = fs.readFileSync(path.join(ROOT, 'config', 'help.json'), 'utf8');
  assert.ok(help.includes('holds the person once their application form is submitted'));
  assert.ok(help.includes('gets the step Call: did they finish the application form?'));
});
