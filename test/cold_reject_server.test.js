// COLD AND REJECT, BOTH, ON THE REAL SERVER (05.10.2026, Session 5 closure row 3b).
// The screen was locked by Ritvars on 04.10 ("Keep"). closed_tag.test.js reads the source; this one
// drives the running server the way the close dialog and the People quick edit do, so a route or
// column regression shows up even if the source still contains the right words.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], {
      env: { ...process.env, PORT: '0', CRM_DB: ':memory:', CRM_AUTH: '', DATABASE_URL: '', CRM_DB_DATABASE_URL_UNPOOLED: '' },
      stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.stdout.on('data', (d) => { const m = String(d).match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, port: Number(m[1]) }); });
    child.on('exit', (code) => reject(new Error(`server exited (${code}): ${err}`)));
    setTimeout(() => reject(new Error('server did not start: ' + err)), 8000);
  });
}
const H = { 'content-type': 'application/json', 'x-acting-as': 'Admissions' };

test('Cold and Reject are both kept, read back, and cleared when the person is active again', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;
  const post = (u, b) => fetch(base + u, { method: 'POST', headers: H, body: JSON.stringify(b) }).then((r) => r.json());
  const get = (id) => fetch(`${base}/api/people/${id}`, { headers: H }).then((r) => r.json());
  const tagOf = async (id) => { const r = await get(id); return (r.person || r).closed_tag ?? null; };

  assert.deepEqual(CFG.closedTags.map((x) => x.id).sort(), ['cold', 'reject']);
  const reason = CFG.closedReasons.find((r) => !(CFG.closedReasonNeedsNote || []).includes(r));
  const cold = (await post('/api/people', { name: 'Cold Server Test', email: 'cold@example.lv' })).id;
  const rej = (await post('/api/people', { name: 'Reject Server Test', email: 'reject@example.lv' })).id;
  const odd = (await post('/api/people', { name: 'Unknown Tag Test', email: 'odd@example.lv' })).id;

  await post(`/api/people/${cold}/status`, { status: 'Not proceeding', reason, closedTag: 'cold' });
  await post(`/api/people/${rej}/status`, { status: 'Not proceeding', reason, closedTag: 'reject' });
  await post(`/api/people/${odd}/status`, { status: 'Not proceeding', reason, closedTag: 'maybe' });
  assert.equal(await tagOf(cold), 'cold');
  assert.equal(await tagOf(rej), 'reject');
  assert.equal(await tagOf(odd), null, 'a tag that is not in config is not stored');

  const list = await fetch(`${base}/api/people`, { headers: H }).then((r) => r.json());
  const rows = Array.isArray(list) ? list : (list.people || list.rows || []);
  const byId = Object.fromEntries(rows.map((p) => [p.id, p]));
  assert.equal(byId[cold].closed_tag, 'cold', 'the list (Outcomes, Home, All people) sees Cold');
  assert.equal(byId[rej].closed_tag, 'reject', 'the list sees Reject');

  await post(`/api/people/${rej}/status`, { status: 'New' });
  assert.equal(await tagOf(rej), null, 'back to an active stage: the tag goes');
  assert.equal(await tagOf(cold), 'cold', 'the other person is untouched');
});
