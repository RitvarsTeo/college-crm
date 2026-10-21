// IEVA'S FEEDBACK 21.10.2026, the owner's picks (board _ieva-feedback/board_2026-10-21.png):
//   row 1 A - "Maybe the same person": one line on both records when another open record looks like the same person
//             (the real case: Brunonas twice, an email lead with comments and an empty SIS record, the name spelled
//             with and without the Lithuanian letters, different emails, no phone on the lead);
//   row 2 A - "With the SIS", a third answer where a next step is chosen: no date, the step closes, the person counts as
//             With the SIS and is never overdue (the real cases: Aleks and Viktors, overdue though the SIS handles them).
// Synthetic people only.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startWithAreas } from './security_helpers.js';

for (const k of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'CRM_DB_DATABASE_URL_UNPOOLED']) process.env[k] = '';
const { openDb } = await import('../src/db.js');
const same = await import('../src/samepeople.js');
const { SIS_HOLDS_SQL } = await import('../src/lifecycle.js');

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const person = (db, id, p) => db.prepare(`INSERT INTO people (id, name, email, phone, status, first_channel, created_at) VALUES (?,?,?,?,?,?,?)`)
  .run(id, p.name, p.email || null, p.phone || null, p.status || 'New', p.first_channel || null, p.created_at || '2026-10-19T09:00:00.000Z');
const note = (db, id, body) => db.prepare(`INSERT INTO events (person_id, kind, direction, occurred_at, subject, body, actor, origin)
  VALUES (?,?,?,?,?,?,?,?)`).run(id, 'note', 'note', '2026-10-19T10:00:00.000Z', 'Note', body, 'Ieva', 'manual');

test('looks like the same person: the name with case, Latvian / Lithuanian letters and word order folded; or the email; or the phone', () => {
  assert.deepEqual(same.sameWhy({ name: 'Brunonas Manculevičius' }, { name: 'brunonas manculevicius' }), ['name']);
  assert.deepEqual(same.sameWhy({ name: 'Manculevičius Brunonas' }, { name: 'Brunonas MANCULEVICIUS' }), ['name'], 'the order the SIS writes it in');
  assert.deepEqual(same.sameWhy({ name: 'Žanis Bērziņš' }, { name: 'Zanis Berzins' }), ['name']);
  assert.deepEqual(same.sameWhy({ name: 'Anna', email: 'A@x.lv' }, { name: 'Anna', email: 'a@x.lv ' }), ['email'], 'one word is not enough for a name match');
  assert.deepEqual(same.sameWhy({ name: 'A B', phone: '+371 2000 1234' }, { name: 'C D', phone: '20001234' }), ['phone']);
  assert.deepEqual(same.sameWhy({ name: 'Brunonas Manculevičius' }, { name: 'Brunonas Mancul' }), []);
  assert.deepEqual(same.sameWhy({ name: 'A B', phone: '123' }, { name: 'C D', phone: '123' }), [], 'a short number is not a phone match');
});

async function brunonas() {
  const db = await openDb();
  await person(db, 'lead', { name: 'Brunonas Manculevičius', email: 'b.m@gmail.com', first_channel: 'gmail', status: 'Follow-up' });
  await person(db, 'sis', { name: 'Brunonas Manculevicius', email: 'brunonas.m@inbox.lt', phone: '+37061234567', first_channel: 'sis',
    created_at: '2026-10-20T08:00:00.000Z' });
  await person(db, 'other', { name: 'Jonas Jonaitis', email: 'j@x.lt' });
  await person(db, 'closed', { name: 'Brunonas Manculevicius', email: 'old@x.lt', status: 'Not proceeding', created_at: '2025-01-01T00:00:00.000Z' });
  await note(db, 'lead', 'Called, interested in MT WTT.');
  await note(db, 'lead', 'Sent the price list.');
  return db;
}

test('Brunonas: each record shows the other, how it came, its stage and comments; the SIS record folds into the lead; a closed record is not shown', async () => {
  const db = await brunonas();
  const onLead = await same.maybeSame(db, 'lead');
  assert.deepEqual(onLead.rows.map((r) => [r.id, r.firstChannel, r.stage, r.comments, r.why.join()]), [['sis', 'sis', 'New', 0, 'name']]);
  assert.deepEqual(onLead.rows[0].merge, { sourceId: 'sis', targetId: 'lead' });
  const onSis = await same.maybeSame(db, 'sis');
  assert.deepEqual(onSis.rows.map((r) => [r.id, r.firstChannel, r.stage, r.comments]), [['lead', 'gmail', 'Follow-up', 2]], 'the older record shows it too');
  assert.deepEqual(onSis.rows[0].merge, { sourceId: 'sis', targetId: 'lead' });
  assert.deepEqual((await same.maybeSame(db, 'other')).rows, []);
  assert.equal(await same.maybeSame(db, 'nobody'), null);
});

test('two records neither of them made by the SIS: the line shows, without Same person (the merge folds an SIS record)', async () => {
  const db = await openDb();
  await person(db, 'a', { name: 'Ilze Liepa', phone: '+371 2900 0001' });
  await person(db, 'b', { name: 'Ilze Ozola', phone: '29000001' });
  const r = (await same.maybeSame(db, 'a')).rows;
  assert.deepEqual(r.map((x) => [x.id, x.why.join(), x.merge]), [['b', 'phone', null]]);
});

test('Not the same: the pair is written down once, both Histories say so, the line is gone from both pages, nothing deleted', async () => {
  const db = await brunonas();
  assert.equal((await same.notSame(db, 'lead', 'lead', 'Ieva')).error, 'pick the other record');
  assert.equal((await same.notSame(db, 'lead', 'sis', '')).error, 'who is saying so?');
  assert.deepEqual(await same.notSame(db, 'sis', 'lead', 'Ieva'), { ok: true });
  assert.deepEqual(await same.notSame(db, 'lead', 'sis', 'Ieva'), { ok: true, already: true });
  assert.deepEqual((await same.maybeSame(db, 'lead')).rows, []);
  assert.deepEqual((await same.maybeSame(db, 'sis')).rows, []);
  const lines = await db.prepare(`SELECT person_id, subject, actor FROM events WHERE subject LIKE 'Not the same person as %' ORDER BY person_id`).all();
  assert.deepEqual(lines.map((l) => [l.person_id, l.subject, l.actor]), [
    ['lead', 'Not the same person as Brunonas Manculevicius', 'Ieva'], ['sis', 'Not the same person as Brunonas Manculevičius', 'Ieva']]);
  assert.equal(Number((await db.prepare('SELECT COUNT(*) AS n FROM people').get()).n), 4);
  assert.equal((await same.maybeSame(db, 'lead')).rows.length, 0, 'and a "Not the same" line is no comment');
});

test('With the SIS counts everywhere the SIS already counted: the SQL rule and the screen\'s rule both take sis_handoff_at', () => {
  assert.match(SIS_HOLDS_SQL, /pe\.sis_handoff_at IS NOT NULL OR/);
  assert.match(APP, /const cSisHolds = \(p\) => Boolean\(p && \(p\.sis_handoff_at \|\|/);
});

test('the third answer is offered on Done, on the next step of somebody with none and in the Journey edit panel; not on a new lead from the Inbox', () => {
  assert.match(APP, /cNextPick\('c', false, Boolean\(personId\)\)/, 'Done, when the person is known');
  assert.match(APP, /cNextPick\('t', false, true\)/, 'Choose a next step');
  assert.match(APP, /cNextPick\('pe', true, true\)/, 'the Journey edit panel');
  assert.match(APP, /\$\{cNextPick\('q'\)\}/, 'the Inbox keeps two answers');
  assert.match(APP, /value="sis" onchange="cNextPickSet\(\$\{p\}\)"><b>With the SIS<\/b>/);
  assert.ok(!/Choose Follow up or Cold\.<\/div>'; return; \}\n  try \{\n    \/\/ Cold: how it went/.test(APP));
  // no explanatory sentence on screen, and nothing reads as late: the line is the name, how they came, stage, comments
  assert.match(APP, /<b>Maybe the same person:<\/b>/);
});

// ------------------------------------------------------------------------------------------ a running copy
let srv = null;
after(() => { if (srv) srv.child.kill(); });
test('a running copy: With the SIS closes the step with how it went, hands the person to the SIS once, and they are no longer overdue', async () => {
  srv = await startWithAreas();
  const call = async (p, who, b) => {
    const r = await fetch(srv.base + p, { method: b ? 'POST' : 'GET', headers: { origin: srv.base, 'content-type': 'application/json', cookie: srv.cookie(who) },
      ...(b ? { body: JSON.stringify(b) } : {}) });
    return [r.status, await r.json().catch(() => ({}))];
  };
  const [, made] = await call('/api/people', 'academy', { name: 'Aleks Zubovičs Paraugs', email: 'aleks.paraugs@example.com' });
  const id = made.id;
  const [, withTask] = await call(`/api/people/${id}/task`, 'academy', { label: 'Follow up', due: '2026-10-01' });
  const task = withTask.tasks.find((t) => !t.done_at);
  const overdueBefore = (await call('/api/summary', 'academy'))[1];
  assert.equal((await call(`/api/people/${id}/with-sis`, 'academy', { taskId: 999999 }))[0], 400, 'a step that is not theirs');
  const [st, r] = await call(`/api/people/${id}/with-sis`, 'academy', { taskId: task.id, outcome: 'Answered', note: 'The SIS has her application.' });
  assert.equal(st, 200);
  assert.ok(r.person.sis_handoff_at);
  assert.ok(r.person.tasks.every((t) => t.done_at), 'no open step left');
  const done = r.person.tasks.find((t) => t.id === task.id);
  assert.equal(done.outcome, 'Answered');
  assert.ok(r.person.timeline.some((e) => e.subject === 'With the SIS' && e.field === 'sis_handoff_at'));
  assert.ok(r.person.timeline.some((e) => e.body === 'The SIS has her application.'));
  const again = (await call(`/api/people/${id}/with-sis`, 'academy', {}))[1];
  assert.equal(again.person.sis_handoff_at, r.person.sis_handoff_at, 'handed over once');
  const after1 = (await call('/api/summary', 'academy'))[1];
  assert.ok(overdueBefore.overdue.some((t) => t.person_id === id), 'overdue before');
  assert.ok(!after1.overdue.some((t) => t.person_id === id), 'not overdue after');
  assert.equal(after1.noNextAction, overdueBefore.noNextAction, 'and not counted as "no next step" either');
  // the other half never reaches it
  assert.equal((await call(`/api/people/${id}/with-sis`, 'tc', {}))[0], 403);
  assert.equal((await call(`/api/people/${id}/maybe-same`, 'tc'))[0], 403);
  assert.equal((await call(`/api/people/${id}/not-same`, 'tc', { otherId: 'x' }))[0], 403);
  // Maybe the same person, end to end
  const [, twin] = await call('/api/people', 'academy', { name: 'Aleks Zubovics Paraugs', email: 'other@example.com', confirmedNotDuplicate: true });
  const [, ms] = await call(`/api/people/${id}/maybe-same`, 'academy');
  assert.deepEqual(ms.rows.map((x) => x.id), [twin.id]);
  assert.deepEqual((await call(`/api/people/${id}/not-same`, 'academy', { otherId: twin.id }))[1], { ok: true });
  assert.deepEqual((await call(`/api/people/${twin.id}/maybe-same`, 'academy'))[1].rows, []);
});
