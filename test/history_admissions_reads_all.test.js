// IEVA SEES THE FULL PICTURE (the owner, 04.10.2026): "Ieva is the main user, she needs to see the full
// picture." She signs in through edu@novikontas.org, whose name in Intake is "Admissions", so the rule
// is written for that account (config.historyReaders), not for a first name nobody signs in with.
// It replaces, for her, the 23.09 rule that a non-admin sees only their own actions; everybody else
// keeps that rule. Run against the real server, because a source test cannot see a filtered query.
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
const as = (who) => ({ 'content-type': 'application/json', 'x-acting-as': who });

test('the Admissions account is a full history reader, by config', () => {
  assert.ok((CFG.historyReaders || []).includes('Admissions'));
});

test('Admissions sees a colleague\'s correction and the whole log; anybody else does not', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;
  const made = await fetch(`${base}/api/people`, { method: 'POST', headers: as('Ritvars'),
    body: JSON.stringify({ name: 'History Reader Test', email: 'hrt@example.lv' }) }).then((r) => r.json());
  const id = made.id;
  await fetch(`${base}/api/people/${id}/edit`, { method: 'POST', headers: as('Ritvars'), body: JSON.stringify({ phone: '+37120000123' }) });

  const edits = async (who) => ((await fetch(`${base}/api/people/${id}`, { headers: as(who) }).then((r) => r.json())).timeline || [])
    .filter((e) => e.kind === 'edit').length;
  assert.ok(await edits('Admissions') >= 1, 'Ieva sees the correction Ritvars made');
  assert.equal(await edits('Laura'), 0, 'somebody else still sees only their own corrections');

  const log = async (who) => fetch(`${base}/api/history?as=${encodeURIComponent(who)}`).then((r) => r.json());
  assert.equal((await log('Admissions')).scope, 'everything');
  assert.equal((await log('Laura')).scope, 'own actions only');
});
