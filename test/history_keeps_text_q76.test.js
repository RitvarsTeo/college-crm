// Q76 (the owner, 07.10.2026). Asked "when a message becomes a lead, keep what the person wrote in their profile
// history? Today it is deleted (decided 23.09)", he answered "Keep the text". The profile shows the whole chain: what
// the person wrote (every Inbox message that became theirs), the calls, notes and steps, in one History by time.
// The text stays on the Inbox line, so the 13-month retention still empties it; nothing is copied into events.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], {
      env: { ...process.env, PORT: '0', CRM_DB: ':memory:', DATASET: 'empty', CRM_AUTH: '', DATABASE_URL: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.stdout.on('data', (d) => { const m = String(d).match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, port: Number(m[1]) }); });
    child.on('exit', (code) => reject(new Error(`server exited (${code}): ${err}`)));
    setTimeout(() => reject(new Error('server did not start: ' + err)), 8000);
  });
}

test('Q76: after Make a lead, the History shows what they wrote, and a later message attached to them too, newest first', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;
  const h = { 'content-type': 'application/json', 'x-acting-as': 'Ieva' };
  const post = async (u, b) => { const r = await fetch(base + u, { method: 'POST', headers: h, body: JSON.stringify(b) }); return [r.status, await r.json()]; };

  const [, first] = await post('/api/intake/receive', { channel: 'email', externalId: 'q76-1', email: 'liga.q76@gmail.com', name: 'Liga Q76',
    body: 'Hello, I would like to study navigation.', receivedAt: '2026-10-05T08:00:00.000Z' });
  const [s1, q1] = await post(`/api/intake/${first.id}/qualify`, { qualification: 'lead', createPerson: true, nextAction: 'Call and establish interest',
    stated: { interest: 'NAV' }, note: 'evening course' });
  assert.equal(s1, 200, JSON.stringify(q1));
  const pid = q1.landed.id;

  const [, second] = await post('/api/intake/receive', { channel: 'website', externalId: 'q76-2', email: 'liga.q76@gmail.com', name: 'Liga Q76',
    body: 'Can I come on Friday?', receivedAt: '2026-10-06T08:00:00.000Z' });
  const [s2, q2] = await post(`/api/intake/${second.id}/qualify`, { qualification: 'lead', personId: pid, createPerson: false, nextAction: 'Confirm the visit time' });
  assert.equal(s2, 200, JSON.stringify(q2));

  const p = await (await fetch(`${base}/api/people/${pid}`, { headers: h })).json();
  const said = p.timeline.filter((e) => e.said);
  assert.deepEqual(said.map((e) => [e.channel, e.body, e.subject, e.direction]),
    [['website', 'Can I come on Friday?', 'Message', 'in'], ['email', 'Hello, I would like to study navigation.', 'Message', 'in']], 'both, newest first');
  assert.ok(p.timeline.some((e) => e.body === 'evening course'), 'the note is there too');
  const at = p.timeline.map((e) => String(e.occurred_at || ''));
  assert.deepEqual(at, [...at].sort().reverse(), 'one History in time order');
});

test('Q76: a message set aside is never shown on a person, and nothing is copied into the events table', async () => {
  const fs = await import('node:fs');
  const server = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
  const fnS = server.slice(server.indexOf('async function saidByPerson('), server.indexOf('\n}\n', server.indexOf('async function saidByPerson(')));
  assert.match(fnS, /WHERE i\.person_id = \?/, 'only messages that became this person\'s');
  assert.doesNotMatch(fnS, /INSERT|UPDATE/, 'read only');
  const intake = fs.readFileSync(path.join(ROOT, 'src', 'intake.js'), 'utf8');
  assert.match(intake, /WHERE state IN \('archived', 'filtered', 'qualified'\) AND body IS NOT NULL/, 'the retention covers a lead\'s row');
});
