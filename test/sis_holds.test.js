// APPLICATIONS lane, item 2. DECIDED by Ritvars 01.10.2026 (popup, A "SIS holds them"):
// a person the SIS itself created, at started or later in the SIS, has no task and is NOT counted
// in "No next step" while the SIS has them. Registered-only stays a normal lead and still needs a
// step. A known lead who reaches started stays exactly as today.
//
// Measured before: local demo with two SIS-created people, /api/summary noNextAction = 2, and they
// were the only two. Every application-first person would have nagged Admissions.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { syncSis } from '../src/sync.js';
import { funnel } from '../src/intake.js';
import { report } from '../src/reports.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const SECRET = 'test-application-secret-not-real-0000';
const ENV = { SIS_API_TOKEN: 'test-sis-token-not-real-0000', CHANNEL_MODE_SIS: 'test' };

const app = (over = {}) => ({
  reference: 'ref-h', applicationId: 'app-h', givenName: 'Liene', familyName: 'Kalna',
  email: 'liene.kalna@example.com', phone: '+371 29990002', programmeCode: 'NAV', status: 'submitted',
  registeredAt: '2026-09-30T06:00:00.000Z', submittedAt: '2026-09-30T06:05:00.000Z',
  changedAt: '2026-09-30T06:05:00.000Z', ...over,
});
const registeredOnly = app({ reference: 'ref-r', applicationId: '', givenName: 'Elza', familyName: 'Ozola',
  email: 'elza.ozola@example.com', phone: null, programmeCode: null, status: 'registered', submittedAt: null });
const feed = (apps) => async () => ({ ok: true, status: 200, json: async () => ({ applicants: apps, nextCursor: null }) });

function start(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], { env: { ...process.env,
      PORT: '0', CRM_DB: ':memory:', DATASET: 'empty', CRM_AUTH: '', CRM_PUBLIC: '', DATABASE_URL: '',
      CRM_DB_DATABASE_URL_UNPOOLED: '', SIS_APPLICATION_SECRET: '', CHANNEL_MODE_SIS: '', ...env },
    stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const look = (d) => { out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, base: `http://127.0.0.1:${m[1]}` }); };
    child.stdout.on('data', look); child.stderr.on('data', look);
    child.on('exit', () => reject(new Error(out)));
  });
}

test('holds: the Home count leaves out the person the SIS holds, and keeps the registered-only one', async (t) => {
  const s = await start({ CHANNEL_MODE_SIS: 'test', SIS_APPLICATION_SECRET: SECRET });
  t.after(() => s.child.kill());
  for (const a of [app(), registeredOnly]) {
    const r = await fetch(s.base + '/api/intake/application', { method: 'POST',
      headers: { 'content-type': 'application/json', 'x-crm-application-secret': SECRET }, body: JSON.stringify(a) });
    assert.equal(r.status, 200, await r.text());
  }
  const sum = await fetch(s.base + '/api/summary', { headers: { 'x-acting-as': 'Ieva' } }).then((r) => r.json());
  assert.equal(sum.openPeople, 2);
  assert.equal(sum.noNextAction, 1, 'only the registered-only person needs a step from Admissions');
});

test('holds: the funnel and the report count the same way', async () => {
  const db = await openDb(':memory:');
  await syncSis(db, { now: new Date('2026-09-30T07:00:00Z'), env: ENV, fetchImpl: feed([app(), registeredOnly]) });
  assert.equal((await funnel(db)).noNextAction, 1);
  assert.equal((await report(db, {})).summary.noNextAction, 1);
});

test('holds: a known lead who reaches the SIS is NOT held, and still needs her step', async () => {
  const db = await openDb(':memory:');
  await db.prepare(`INSERT INTO people (id, name, email, status, first_channel) VALUES ('p1','Liene Kalna',
    'liene.kalna@example.com','Contacted','phone')`).run();
  await syncSis(db, { now: new Date('2026-09-30T07:00:00Z'), env: ENV, fetchImpl: feed([app()]) });
  assert.equal((await db.prepare('SELECT status FROM people WHERE id = ?').get('p1')).status, 'Application');
  assert.equal((await funnel(db)).noNextAction, 1);
});

test('holds: rejected or withdrawn in the SIS is a human\'s to close, so it counts again', async () => {
  const db = await openDb(':memory:');
  await syncSis(db, { now: new Date('2026-09-30T07:00:00Z'), env: ENV, fetchImpl: feed([app()]) });
  assert.equal((await funnel(db)).noNextAction, 0);
  await syncSis(db, { now: new Date('2026-10-01T05:00:00Z'), env: ENV,
    fetchImpl: feed([app({ status: 'withdrawn', changedAt: '2026-09-30T09:00:00.000Z' })]) });
  assert.equal((await funnel(db)).noNextAction, 1);
});

// The page's own rule, run from src/app.html.
function pageRule() {
  const stmt = (start) => { const i = APP.indexOf(start); assert.ok(i >= 0, start); return APP.slice(i, APP.indexOf(';\n', i) + 2); };
  const ctx = {};
  vm.runInNewContext(stmt('const C_SIS_HOLDS =') + stmt('const cSisHolds =') + 'this.holds = cSisHolds;', ctx);
  return ctx.holds;
}

test('holds: the page uses the same rule as the server', () => {
  const holds = pageRule();
  const sis = (status) => ({ status, label: status });
  assert.equal(holds({ first_channel: 'sis', sis: sis('submitted') }), true);
  assert.equal(holds({ first_channel: 'sis', sis: sis('started') }), true);
  assert.equal(holds({ first_channel: 'sis', sis: sis('registered') }), false);
  assert.equal(holds({ first_channel: 'sis', sis: sis('withdrawn') }), false);
  assert.equal(holds({ first_channel: 'phone', sis: sis('submitted') }), false);
  assert.equal(holds({ first_channel: 'sis', sis: null }), false);
});

test('holds: every "No next step" on the page asks the rule first', () => {
  // Next Steps list, People cell and filter, the person card, the person page, the Journey card
  for (const where of ['const none = open.filter(', "if (f.due === 'none')", 'function cPersonCard(',
    '<div class="c-next none"><b>Next step</b>No next step', "'<small class=\"none\">No next step</small>'"]) {
    const i = APP.indexOf(where);
    assert.ok(i >= 0, where);
    const near = APP.slice(Math.max(0, i - 400), i + 900);
    assert.match(near, /cSisHolds\(/, `${where} does not ask cSisHolds`);
  }
});

test('holds: the Journey summary bar and its filter leave the held person out of "No next step"', () => {
  for (const where of ['const kindOf = (p) =>', "if (!kept('group', t ?"]) {
    const i = APP.indexOf(where);
    assert.ok(i >= 0, where);
    assert.match(APP.slice(i, APP.indexOf('\n', i)), /cSisHolds\(p\) \? null : 'No next step'/, where);
  }
});
