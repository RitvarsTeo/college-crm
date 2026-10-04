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
  // read from the person page, where a finished person's leftover lives ("Still open"); the
  // lists leave finished people out since 02.10 (Ieva 30.09 10:23)
  const stray = ((await fetch(`${base}/api/people/${id}`).then((r) => r.json())).tasks || []).find((x) => !x.done_at);
  assert.ok(stray, 'the stray task exists');

  const done = await fetch(`${base}/api/tasks/${stray.id}/complete`, { method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ outcome: 'Done', note: '' }) });          // no nextLabel at all
  assert.equal(done.status, 200, 'it closes without a next step');

  const after = ((await fetch(`${base}/api/people/${id}`).then((r) => r.json())).tasks || []).filter((x) => !x.done_at);
  assert.equal(after.length, 0, 'and no new task was created in its place');
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

// Found by measuring the dialog, not by reading it (30.09.2026). In dark, --card is a 5.5% white
// overlay, so the modal box opened see-through and the page read straight through the dialog. A
// panel may be glass because it sits on the sea; a modal may not, because arbitrary content is
// behind it. The help panel hit exactly this on 28.09 and --menu was the answer: opaque in every
// theme. This test fails if a modal ever goes back to a translucent token.
test('the modal box is opaque in every theme', () => {
  const rule = APP.slice(APP.indexOf('.modal .box{'), APP.indexOf('.row2{'));
  assert.match(rule, /background:var\(--menu\)/, 'the modal uses the opaque token');
  assert.ok(!/background:var\(--card\)/.test(rule), 'and not the glass one');

  // and --menu really is opaque wherever it is defined
  for (const m of APP.matchAll(/--menu:\s*([^;]+);/g)) {
    const v = m[1].trim();
    assert.ok(!/rgba?\([^)]*,\s*0?\.\d+\s*\)/.test(v), `--menu must be opaque, found ${v}`);
  }
});

// 30.09.2026, Ritvars: the Add person form said "the source defaults to Walk-in" and the source
// was Website. quickAddDefaults.source_channel was "klatiene", a Latvian key left over from before
// the channels were renamed to English. No channel has that key, so `k === d.source_channel` never
// matched, no option was selected, and the browser fell back to the FIRST option: website.
//
// It failed silently, which is why it lasted: no error, just every walk-in typed in by staff
// recorded as having arrived from the website, feeding "where they came from" on Home and Reports.
test('every quick-add default names a thing that actually exists', () => {
  const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
  const d = CFG.quickAddDefaults || {};

  assert.ok(CFG.channels[d.source_channel],
    `quickAddDefaults.source_channel is "${d.source_channel}", which is not a channel`);
  assert.equal(d.source_channel, 'in_person', 'somebody typed in by staff did not arrive by website');

  // the same trap for the other defaults: a value nothing matches silently picks the first option
  assert.ok((CFG.owners || []).includes(d.owner), `owner "${d.owner}" is not an owner`);
  assert.ok((CFG.stages || []).some((s) => s.id === d.status), `status "${d.status}" is not a stage`);
  const actions = (CFG.nextActions || []).flatMap((g) => g.items.map((i) => i.label));
  assert.ok(actions.includes(d.nextAction), `nextAction "${d.nextAction}" is not an action`);
});

test('the Add person form does not explain its own default', () => {
  // P5: if a screen needs a sentence to explain it, fix the screen. The select now shows
  // "In person" on its own, so the sentence has nothing left to say.
  assert.ok(!/the source defaults to/i.test(APP), 'the helper sentence is gone');
});

// IEVA-4 again, on the screen Next Steps became (01.10.2026). The dialog has always been
// able to drop the "Next step (required)" row for somebody already finished - openComplete
// takes a third argument for exactly that - but only the PERSON PAGE ever passed it. From
// the work queue, an Admitted person's last task still offered a required next step that
// the server then ignores, because a step that finishes somebody plans nothing after it.
// A control that cannot do what it says is the thing Ieva reported; this is the same fault
// one screen over.
test('IEVA-4 on Today: a finished person is not asked for a next step they cannot have', () => {
  const todayRow = APP.slice(APP.indexOf('async function viewTodayC('), APP.indexOf('\n}\n', APP.indexOf('async function viewTodayC(')));
  const done = todayRow.slice(todayRow.indexOf('openComplete('));
  assert.match(done.slice(0, 220), /C_TERMINAL\.includes\(\(byId\.get\(t\.person_id\) \|\| \{\}\)\.status\)/,
    'Today passes whether the person is finished, like the person page already did');

  // and the dialog still honours it
  const dlg = APP.slice(APP.indexOf('function openComplete('), APP.indexOf('\n}\n', APP.indexOf('function openComplete(')));
  assert.match(dlg, /const done = Boolean\(finished\)/);
  assert.match(dlg, /\$\{done \? '' : `<div class="row2">/, 'the whole row goes, rather than an option that lies');
});

// Ieva 30.09 10:23, the full message (pasted 02.10): "I changed the status, but he still shows for me
// under Next Steps as overdue". On production the one such person (02.10 backup) was admitted at
// 07:21 and the step was created at 07:24, AFTER the admission. Closing steps at the moment of the
// status change cannot catch that; the list has to leave a finished person out, the same rule the
// counts already use.
test('a step added after somebody is admitted never reaches Next Steps', async () => {
  const { child, port } = await startServer();
  try {
    const base = `http://localhost:${port}`;
    const { id } = await personWithOverdueTask(base, 'Admitted Then Planned');
    await setStatus(base, id, 'Admitted');
    await fetch(`${base}/api/people/${id}/task`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'confirm the payment', due: yesterday() }) });
    const open = await fetch(`${base}/api/tasks?scope=open`).then((r) => r.json());
    assert.ok(!open.some((t) => t.person_id === id), 'an admitted person has no row in the open list');
    const over = await fetch(`${base}/api/tasks?scope=overdue`).then((r) => r.json());
    assert.ok(!over.some((t) => t.person_id === id), 'nor in overdue');
  } finally { child.kill(); }
});
