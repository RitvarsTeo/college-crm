// The whole journey, over HTTP, against a running server.
//
// Everything else tests a module. This walks the road a person actually walks:
// a message arrives, somebody looks at it, says what the person wants, and that
// person appears on the pipeline and is dragged across it. It exists because the
// two faults found on 24.09.2026 were both between the parts rather than inside
// one: four People filters that were never wired to anything, and a screen that
// asked who was looking without ever saying.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));

function startServer() {
  return new Promise((resolve, reject) => {
    const port = 8700 + Math.floor(Math.random() * 90);
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], {
      env: { ...process.env, PORT: String(port), CRM_DB: ':memory:' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let err = '';
    // stderr is read, never ignored: a port already taken must fail this test
    // rather than let it pass against somebody else's server.
    child.stderr.on('data', (d) => { err += d; });
    child.stdout.on('data', (d) => { if (String(d).includes('http://')) resolve({ child, port }); });
    child.on('exit', (code) => reject(new Error(`server exited (${code}): ${err}`)));
    setTimeout(() => reject(new Error('server did not start: ' + err)), 8000);
  });
}

// the app sends this header on every request, so the tests do too
const call = (base, p, who, opts = {}) => fetch(base + p, {
  ...opts,
  headers: { 'content-type': 'application/json', 'x-acting-as': who, ...(opts.headers || {}) },
});
const get = async (base, p, who) => {
  const r = await call(base, p, who);
  assert.equal(r.ok, true, `GET ${p} answered ${r.status}`);
  return r.json();
};
const send = async (base, p, who, data) => {
  const r = await call(base, p, who, { method: 'POST', body: JSON.stringify({ by: who, ...data }) });
  const j = await r.json();
  assert.equal(r.ok, true, `POST ${p} answered ${r.status}: ${j.error}`);
  return j;
};

test('a message nobody could read still reaches the pipeline, and every step is in the history', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;

  // 1. nothing here yet
  assert.equal((await get(base, '/api/people', 'Ieva')).count, 0);

  // 2. two messages arrive: a sales pitch, and a person who only says hello
  await send(base, '/api/intake/receive', 'machine', {
    channel: 'instagram', externalId: 'e2e_junk',
    body: 'Hello, we offer social media promotion services, 5000 followers guaranteed' });
  await send(base, '/api/intake/receive', 'machine', {
    channel: 'instagram', externalId: 'e2e_real', name: 'Darja S', handle: '@darja.s', body: 'hello' });

  // the pitch never costs anybody a second; the real message waits to be looked at
  const queue = await get(base, '/api/intake?state=new', 'Tetiana');
  assert.equal(queue.rows.length, 1);
  assert.equal(queue.rows[0].contact_name, 'Darja S');
  assert.equal(queue.counts.filtered, 1);

  // and both are one list on the screen that shows them
  const irrelevant = await get(base, '/api/intake?state=notrelevant', 'Tetiana');
  assert.equal(irrelevant.rows.length, 1, 'only the filtered pitch so far');

  // 3. the machine read nothing out of 'hello' - this is the case that used to
  //    dead-end, because there was nothing to tick and so nothing to record
  const item = queue.rows[0];
  assert.equal(item.fields.length, 0);

  // 4. the operator says what they want, from the conversation
  // A next step is required now: a lead that reaches the pipeline with nobody
  // scheduled to act is the exact failure this CRM exists to prevent.
  const refusedNoStep = await call(base, `/api/intake/${item.id}/qualify`, 'Ieva', {
    method: 'POST', body: JSON.stringify({ qualification: 'lead', createPerson: true,
      stated: { interest: 'ENG' }, by: 'Ieva' }) });
  assert.equal(refusedNoStep.status, 400);
  assert.match((await refusedNoStep.json()).error, /next step is required/i);

  const q = await send(base, `/api/intake/${item.id}/qualify`, 'Ieva', {
    qualification: 'lead', createPerson: true, confirmFields: [],
    stated: { interest: 'ENG' }, nextAction: 'Call and establish interest',
    note: 'said on the phone they want the engineer programme' });

  const person = await get(base, `/api/people/${q.personId}`, 'Ieva');
  assert.equal(person.programme, 'ENG');
  assert.equal(person.qualification, 'lead');
  assert.equal(person.owner, CONFIG.routing.lead, 'a lead belongs to Admissions');
  assert.equal(person.status, CONFIG.stageRoles.first, 'and starts on the pipeline');
  // with somebody scheduled to do something about them
  const open = person.tasks.filter((t) => !t.done_at);
  assert.equal(open.length, 1, 'a qualified lead carries a next step');
  assert.equal(open[0].label, 'Call and establish interest');
  assert.equal(open[0].owner, CONFIG.routing.lead, 'owned by the role it was routed to');
  assert.ok(open[0].due_at, 'with a due date');

  // 5. the pipeline is the People list grouped by stage, so it must show them
  const all = await get(base, '/api/people', 'Ieva');
  assert.equal(all.rows.filter((r) => r.status === CONFIG.stageRoles.first).length, 1);

  // 6. dragged to the next stage. The board saves it exactly this way.
  const order = CONFIG.stageOrder;
  for (const stage of order.slice(1)) {
    await send(base, `/api/people/${q.personId}/status`, 'Ieva', { status: stage });
  }
  const walked = await get(base, `/api/people/${q.personId}`, 'Ieva');
  assert.equal(walked.status, order[order.length - 1]);

  // 7. every move is in the history, with who and from where
  const moves = walked.timeline.filter((e) => e.field === 'status');
  assert.equal(moves.length, order.length - 1, 'one history entry per stage change');
  for (const m of moves) {
    assert.equal(m.actor, 'Ieva');
    assert.equal(m.origin, 'manual');
    assert.ok(m.old_value && m.new_value, 'a stage change says what it moved from and to');
  }
  // and it is still ONE person, still from Instagram, still first contacted then
  assert.equal(all.count, 1);
  assert.equal(walked.source_channel, 'instagram');
});

test('stopping work on somebody needs a reason, whether it is dragged or typed', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;

  const { id } = await send(base, '/api/people', 'Ieva', { name: 'Test Person', source_channel: 'phone' });
  const refused = await call(base, `/api/people/${id}/status`, 'Ieva', {
    method: 'POST', body: JSON.stringify({ status: 'Not proceeding', by: 'Ieva' }) });
  assert.equal(refused.status, 400);
  assert.match((await refused.json()).error, /reason/i);
  assert.equal((await get(base, `/api/people/${id}`, 'Ieva')).status, 'New', 'and nothing moved');
});

test('the People filters really filter, which is what nobody had ever checked', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;

  await send(base, '/api/people', 'Ieva', { name: 'Navigator', source_channel: 'phone', programme: 'NAV' });
  await send(base, '/api/people', 'Ieva', { name: 'Engineer', source_channel: 'website', programme: 'ENG' });

  assert.equal((await get(base, '/api/people?programme=NAV', 'Ieva')).count, 1);
  assert.equal((await get(base, '/api/people?source_channel=website', 'Ieva')).count, 1);
  assert.equal((await get(base, '/api/people?status=New', 'Ieva')).count, 2);
  assert.equal((await get(base, '/api/people?q=Engineer', 'Ieva')).count, 1);

  // Nobody is without a next step, and that is not an accident: finishing one
  // without naming the next is refused, so 'without a next step' stays empty
  // until somebody is closed. That refusal is the decision worth asserting.
  assert.equal((await get(base, '/api/people?due=none', 'Ieva')).count, 0);
  const nav = (await get(base, '/api/people?q=Navigator', 'Ieva')).rows[0];
  const task = (await get(base, `/api/people/${nav.id}`, 'Ieva')).tasks[0];
  const refused = await call(base, `/api/tasks/${task.id}/complete`, 'Ieva', {
    method: 'POST', body: JSON.stringify({ outcome: CONFIG.callOutcomes[0], by: 'Ieva' }) });
  assert.equal(refused.status, 400);
  assert.match((await refused.json()).error, /next step is required/i);
  assert.equal((await get(base, '/api/people?due=overdue', 'Ieva')).count, 0, 'and nothing is late yet');
});

test('who is asking is carried on a GET, not only on a write', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;
  // the admin-only screens read the actor off the header. When the app sent it
  // on writes only, an admin was refused their own inbox.
  assert.equal((await call(base, '/api/admin/feedback', 'Ritvars')).status, 200);
  assert.equal((await call(base, '/api/admin/feedback', 'Ieva')).status, 403);
  assert.equal((await call(base, '/api/admin/feedback', 'Marina')).status, 403,
    'an admin who is not a feedback reader is still refused');
});

test('the demo walk-through really qualifies what it claims to qualify', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;

  // It used to push whatever qualify() returned into an array and report the
  // length as a success count. When the next-step and duplicate gates started
  // refusing every step, it still announced 'qualified: 5' with nothing qualified
  // and the demo quietly lost half its people.
  const r = await send(base, '/api/demo/scenario', 'Tetiana', {});
  const done = await get(base, '/api/intake?state=qualified', 'Tetiana');
  assert.equal(done.rows.length, r.qualified,
    'the number it reports must be the number that actually happened');
  assert.ok(r.qualified >= 5, 'and the walk-through must still complete');

  // and every person it produced carries a next step, which is the rule it exists
  // to demonstrate
  const people = await get(base, '/api/people', 'Ieva');
  assert.equal((await get(base, '/api/people?due=none', 'Ieva')).count, 0,
    'nobody in the demo is left with nothing scheduled');
  assert.ok(people.count > 0);
});

// ----------------------------------------------------- where did they GO? --
//
// Aigars's report was "sanāk es izdaru 2 soļus bet nekas nenotiek" - I do two
// steps and nothing happens. The row vanished from the Inbox and nothing said
// where the person went, so it read as a dead end. The Inbox now has ONE queue
// and qualifying returns what happened, which the screen shows as a receipt.
//
// That receipt is the replacement for the Done board, so it has to carry
// everything the board used to: who, where they went, and what happens next.

test('qualifying says where the person went, what they want and what is next', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;

  await send(base, '/api/intake/receive', 'machine', {
    channel: 'website', externalId: 'landed_1', name: 'Anete Liepa',
    email: 'anete.liepa@inbox.lv', phone: '+37126554400',
    body: 'I would like to study navigation, when can I apply?' });

  const queue = await get(base, '/api/intake?state=new', 'Ieva');
  const id = queue.rows[0].id;

  const r = await send(base, `/api/intake/${id}/qualify`, 'Ieva', {
    qualification: 'lead', createPerson: true, differentPerson: true,
    confirmFields: ['interest'], stated: { interest: 'NAV' },
    nextAction: 'Call and establish interest' });

  assert.equal(r.ok, true);
  assert.ok(r.landed, 'the answer must say where they landed, or the Inbox cannot show it');
  assert.equal(r.landed.name, 'Anete Liepa');
  assert.equal(r.landed.id, r.personId);
  assert.ok(r.landed.status, 'which stage they are in now');
  assert.equal(r.landed.programme, 'NAV', 'what they want');
  assert.equal(r.landed.next, 'Call and establish interest', 'what happens next');
  assert.ok(r.landed.dueAt, 'and when');

  // and the queue is now empty, because there is no second board to sit on
  const after = await get(base, '/api/intake?state=new', 'Ieva');
  assert.equal(after.rows.length, 0);

  // the person really is in Admissions, not only in the message
  const people = await get(base, '/api/people', 'Ieva');
  assert.equal(people.count, 1);
  assert.equal(people.rows[0].name, 'Anete Liepa');
  assert.ok(people.rows[0].next_action, 'with the next step attached to them');
});

test('marking not relevant also says what happened', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;

  await send(base, '/api/intake/receive', 'machine', {
    channel: 'instagram', externalId: 'landed_2', name: 'Promo Agency',
    body: 'partnership opportunity for your school' });
  const id = (await get(base, '/api/intake?state=new', 'Tetiana')).rows[0].id;

  const r = await send(base, `/api/intake/${id}/archive`, 'Tetiana',
    { reason: 'Not a prospective student' });
  assert.equal(r.ok, true);
  assert.ok(r.landed, 'the screen has to be able to say what it just did');
  assert.equal(r.landed.archived, true);
  assert.equal(r.landed.who, 'Promo Agency');
  assert.equal(r.landed.reason, 'Not a prospective student');

  // it leaves the work queue, and it is NOT deleted
  assert.equal((await get(base, '/api/intake?state=new', 'Tetiana')).rows.length, 0);
  const gone = await get(base, '/api/intake?state=notrelevant', 'Tetiana');
  assert.equal(gone.rows.length, 1, 'archived is out of the way, never destroyed');
  assert.equal(gone.rows[0].contact_name, 'Promo Agency');
});

test('the Inbox has exactly one work queue on screen', async () => {
  // The screen is one file, so this reads it. Three boards - To look at, Done,
  // Not relevant - were the fault Aigars reported; only the first is a queue.
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  const view = app.slice(app.indexOf('async function viewInbox()'),
    app.indexOf('async function loadIntakeDemo()'));

  assert.ok(view.includes("api('/api/intake?state=new')"),
    'it reads the one queue directly, with no state to switch');
  for (const gone of ['INBOX_STATE', 'SHOW_IRRELEVANT', 'setInboxState', "'Done'",
    'Show not relevant']) {
    assert.ok(!view.includes(gone), 'the Inbox still carries ' + gone);
  }
  assert.ok(view.includes('LAST_RESULT'), 'and it shows what just happened instead');
});
