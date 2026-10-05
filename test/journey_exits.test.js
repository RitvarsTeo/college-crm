// WHERE PEOPLE LEFT THE ACTIVE JOURNEY (Ritvars, 01.10.2026).
//
// "Not proceeding is an exit from the active journey and can happen from any active
// stage. It is not simply the stage after Contract."
//
// The Journey screen draws one exit mark under every active stage, so it needs the
// count per stage. The number is READ FROM HISTORY, never guessed: every status change
// writes an events row carrying old_value, so the stage somebody was in when they left
// is a recorded fact rather than an inference from where they are now.
//
// Against the real server over the wire, because a source test cannot see a query that
// returns the wrong rows.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

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

const person = async (base, name) => {
  const made = await fetch(`${base}/api/people`, { method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, email: `${Math.random().toString(36).slice(2)}@example.lv`, programme: 'NAV' }) })
    .then((r) => r.json());
  const id = made.id || (made.person && made.person.id);
  assert.ok(id, 'created: ' + JSON.stringify(made).slice(0, 160));
  return id;
};
const setStatus = (base, id, status, extra = {}) => fetch(`${base}/api/people/${id}/status`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ status, ...extra }) });
const exits = (base) => fetch(`${base}/api/journey/exits`).then((r) => r.json());

test('the exit count says which stage each person left from, not where they are now', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;

  const empty = await exits(base);
  assert.deepEqual(empty.byStage, {}, 'nobody has left yet');
  assert.equal(empty.total, 0);

  // one person walks to Follow-up and stops there; another stops at New
  const a = await person(base, 'Left at follow-up');
  await setStatus(base, a, 'Contacted');
  await setStatus(base, a, 'Follow-up');
  await setStatus(base, a, 'Not proceeding', { reason: 'Chose another institution' });

  const b = await person(base, 'Left at the start');
  await setStatus(base, b, 'Not proceeding', { reason: 'No response' });

  const after = await exits(base);
  assert.deepEqual(after.byStage, { 'Follow-up': 1, New: 1 },
    'the stage they LEFT, which is in old_value, not Not proceeding itself');
  assert.equal(after.total, 2);
  assert.equal(after.unrecorded, 0);
});

test('somebody who was closed and is working again is not counted as a loss', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;

  const id = await person(base, 'Came back');
  await setStatus(base, id, 'Contacted');
  await setStatus(base, id, 'Not proceeding', { reason: 'Changed study plans' });
  assert.deepEqual((await exits(base)).byStage, { Contacted: 1 });

  // reopened: they are active again, so counting their old exit would show a loss we recovered
  // (leaving Not proceeding is a move back, which carries its note since Q15, 05.10.2026)
  await setStatus(base, id, 'Follow-up', { note: 'Called back, ready to go on' });
  const back = await exits(base);
  assert.deepEqual(back.byStage, {});
  assert.equal(back.total, 0);
});

test('closed twice counts once, from the stage they left the SECOND time', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;

  const id = await person(base, 'Twice');
  await setStatus(base, id, 'Not proceeding', { reason: 'Timing / postponed' });
  await setStatus(base, id, 'Application', { note: 'Came back in spring' });
  await setStatus(base, id, 'Not proceeding', { reason: 'Financial reasons' });

  const r = await exits(base);
  assert.deepEqual(r.byStage, { Application: 1 }, 'the newest exit wins, and they are one person');
  assert.equal(r.total, 1);
});

// A person whose status was written without going through the status route has no
// events row behind them. The count must SAY so rather than quietly pick a stage:
// a figure drawn on the screen has to be one somebody can check.
test('an exit with no history is reported, never folded into a stage', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;

  const id = await person(base, 'No history');
  await setStatus(base, id, 'Not proceeding', { reason: 'Not eligible' });
  await fetch(`${base}/api/people`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Imported closed', email: `${Math.random().toString(36).slice(2)}@example.lv`,
      programme: 'NAV', status: 'Not proceeding' }) });

  const r = await exits(base);
  assert.equal(r.total, 2, 'both are not proceeding now');
  assert.equal(Object.values(r.byStage).reduce((x, y) => x + y, 0), 1, 'only one has a recorded exit');
  assert.equal(r.unrecorded, 1, 'the other is reported as unrecorded, not guessed into a stage');
  assert.ok(id);
});
