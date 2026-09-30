// IEVA-3, IEVA-4, IEVA-5 (30.09.2026): finished means finished.
//
// Ieva is using the CRM on real people and reported two things that are the same thing:
//   IEVA-3  a lead set to Admitted still shows in Next Steps as overdue
//   IEVA-4  changing the last task in "Still open" leaves it open
// and proposed the rule behind both:
//   IEVA-5  once the person has reached the last admission step, the CRM just marks ADMITTED and
//           nothing more. Never make her do the same step twice in two systems.
//
// The cause was one endpoint disagreeing with itself. /api/summary counted a finished person OUT
// of openPeople and noNextAction and IN to overdue and today, in the same response. And the only
// way a task ever closed was somebody pressing Done on that exact task, while the Done dialog made
// a next step required, so the last task could not be closed at all.
//
// These run against the REAL server over the wire, not against the source text, because a source
// test cannot see a query that returns the wrong rows.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');

function startServer(env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], {
      env: { ...process.env, PORT: '0', CRM_DB: ':memory:', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.stdout.on('data', (d) => { const m = String(d).match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, port: Number(m[1]) }); });
    child.on('exit', (code) => reject(new Error(`server exited (${code}): ${err}`)));
    setTimeout(() => reject(new Error('server did not start: ' + err)), 8000);
  });
}

const yesterday = () => new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);

/** A person with one task that was already due. Returns { id, taskId }. */
async function personWithOverdueTask(base, name = 'Overdue Person') {
  const made = await fetch(`${base}/api/people`, { method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, email: `${Math.random().toString(36).slice(2)}@example.lv`, programme: 'NAV' }) })
    .then((r) => r.json());
  const id = made.id || (made.person && made.person.id);
  assert.ok(id, 'the person was created: ' + JSON.stringify(made).slice(0, 200));
  await fetch(`${base}/api/people/${id}/task`, { method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ label: 'confirm the payment', due: yesterday() }) });
  const tasks = await fetch(`${base}/api/tasks?scope=open`).then((r) => r.json());
  const mine = tasks.find((t) => t.person_id === id);
  assert.ok(mine, 'the task exists and is open');
  return { id, taskId: mine.id };
}

const setStatus = (base, id, status, extra = {}) => fetch(`${base}/api/people/${id}/status`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ status, ...extra }) });

test('IEVA-3: an Admitted person stops appearing in Next Steps as overdue', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;
  const { id } = await personWithOverdueTask(base);

  const before = await fetch(`${base}/api/summary`).then((r) => r.json());
  assert.ok(before.overdue.some((r) => r.person_id === id), 'while open, they are overdue - that part was always right');

  const r = await setStatus(base, id, 'Admitted');
  assert.equal(r.status, 200, 'the person was set to Admitted');

  const after = await fetch(`${base}/api/summary`).then((r) => r.json());
  assert.ok(!after.overdue.some((x) => x.person_id === id), 'a finished person is not overdue any more');
  assert.ok(!after.today.some((x) => x.person_id === id), 'and not due today either');

  // the same rule on the other endpoint that feeds the screen
  const overdue = await fetch(`${base}/api/tasks?scope=overdue`).then((r) => r.json());
  assert.ok(!overdue.some((x) => x.person_id === id), '/api/tasks?scope=overdue agrees with /api/summary');
});

test('the one endpoint no longer disagrees with itself', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;
  const { id } = await personWithOverdueTask(base);
  await setStatus(base, id, 'Admitted');

  const s = await fetch(`${base}/api/summary`).then((r) => r.json());
  const counted = (list) => list.filter((x) => x.person_id === id).length;
  // openPeople and noNextAction always excluded finished people; overdue and today did not.
  assert.equal(counted(s.overdue) + counted(s.today), 0,
    'every list in /api/summary now uses the same definition of an open person');
});

test('IEVA-5: finishing somebody closes what was still open, and says so in their history', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;
  const { id } = await personWithOverdueTask(base);

  await setStatus(base, id, 'Admitted');

  const open = await fetch(`${base}/api/tasks?scope=open`).then((r) => r.json());
  assert.ok(!open.some((x) => x.person_id === id), 'nothing is left open on a finished person');

  const person = await fetch(`${base}/api/people/${id}`).then((r) => r.json());
  const tl = person.timeline || person.history || [];
  assert.ok(tl.some((e) => /closed/i.test(String(e.subject || ''))),
    'the history says the open step was closed, so it did not happen silently');
});

test('IEVA-4: the last task of a finished person can be closed with no next step', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;
  const { id, taskId } = await personWithOverdueTask(base);

  // finish the person, then give them a stray task the way an old record carries one
  await setStatus(base, id, 'Admitted');
  await fetch(`${base}/api/people/${id}/task`, { method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ label: 'confirm the payment', due: yesterday() }) });
  const stray = (await fetch(`${base}/api/tasks?scope=open`).then((r) => r.json())).find((x) => x.person_id === id);
  assert.ok(stray, 'the stray task exists');

  const done = await fetch(`${base}/api/tasks/${stray.id}/complete`, { method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ outcome: 'Done', note: '' }) });          // no nextLabel at all
  assert.equal(done.status, 200, 'it closes without a next step');

  const after = await fetch(`${base}/api/tasks?scope=open`).then((r) => r.json());
  assert.ok(!after.some((x) => x.person_id === id), 'and no new task was created in its place');
  assert.ok(taskId, 'the first task id was read');
});

test('the rule is unchanged for an open lead: they still must keep a next step', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;
  const { id, taskId } = await personWithOverdueTask(base, 'Still Open Person');

  const refused = await fetch(`${base}/api/tasks/${taskId}/complete`, { method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ outcome: 'Done' }) });
  assert.equal(refused.status, 400, 'an open person cannot be left with nothing planned');
  const open = await fetch(`${base}/api/tasks?scope=open`).then((r) => r.json());
  assert.ok(open.some((x) => x.person_id === id), 'and their task is still there');
});

test('the Done dialog drops the next-step row for a finished person', () => {
  // Found by opening the dialog and looking at it. Offering the seven real next steps to somebody
  // already finished is a control that does nothing when used: the server ignores nextLabel for
  // them, so she would pick one, press Save and nothing would be planned. The row goes instead.
  const open = APP.slice(APP.indexOf('function openComplete('), APP.indexOf('async function doComplete('));
  assert.match(open, /\$\{done \? '' : `<div class="row2">/,
    'the whole Next step / When row is drawn only when the person is NOT finished');
  // "No next step" is a real section name on Next Steps and a People filter value, so this checks
  // the dead OPTION and its constant, not the words.
  assert.ok(!/No next step - the person is finished/.test(APP), 'no dead option is left behind');
  assert.ok(!/C_NO_NEXT/.test(APP), 'and its constant went with it');
  assert.ok(!/<option value="" selected>/.test(open), 'the dropdown has no empty entry');

  const doComplete = APP.slice(APP.indexOf('async function doComplete('), APP.indexOf('function openReschedule('));
  assert.match(doComplete, /const next = \$\('#cNext'\)/, 'it reads the field that may not be there');
  assert.ok(!/const nextLabel = \$\('#cNext'\)\.value/.test(doComplete),
    'never straight off a null element');
  assert.match(doComplete, /!nextLabel && !finished/, 'an open lead still must keep a next step');
});
