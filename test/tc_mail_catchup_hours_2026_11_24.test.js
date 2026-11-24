// THE TRAINING@ CATCH-UP OUT OF HOURS (patch 182, the owner 24.11.2026 "reading start now, why tomorrow??"). Only training@,
// only outside 08:00-17:00, only while its last run said more; edu@ and every other job keep the 29.10.2026 hours. Invented data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { openDb } from '../src/db.js';
import { tcMailCatchingUp } from '../src/sync.js';

const SRC = fs.readFileSync(new URL('../api/cron/tc-mail-catchup.js', import.meta.url), 'utf8');
const CRONS = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')).crons;

test('scheduled every 10 minutes round the clock, five minutes off gmail-poll; the other schedules unchanged', () => {
  const at = (p) => (CRONS.find((c) => c.path === p) || {}).schedule;
  assert.equal(at('/api/cron/tc-mail-catchup'), '5,15,25,35,45,55 * * * *');
  assert.equal(at('/api/cron/gmail-poll'), '*/10 5-15 * * *');
  assert.equal(at('/api/cron/pbx-calls'), '* 5-15 * * *');
});

test('the route: cron secret first, nothing in the working day, nothing once caught up, then training@ only', () => {
  const auth = SRC.indexOf('authoriseCron('), day = SRC.indexOf('if (inWorkHours())'), db = SRC.indexOf('cronDb()');
  const caught = SRC.indexOf('tcMailCatchingUp(db)'), read = SRC.indexOf('syncTcMail(db)');
  assert.ok(auth > 0 && auth < day && day < db && db < caught && caught < read, 'secret, hours, database, caught up?, read');
  assert.doesNotMatch(SRC, /syncGmail|syncSent|syncOwn|readMailbox/, 'nothing but training@');
});

test('catching up only while the last training@ run said more', async () => {
  const db = await openDb(':memory:');
  assert.equal(await tcMailCatchingUp(db), false, 'never run: nothing to catch up');
  const put = (d) => db.prepare("INSERT INTO sync_state (name, value, ran_at, detail) VALUES ('tc_mail', '2026-10-26T15:30:01.000Z', '2026-11-24T15:00:48.373Z', ?) ON CONFLICT (name) DO UPDATE SET detail = excluded.detail").run(d);
  await put(JSON.stringify({ read: 60, more: true, ok: true }));
  assert.equal(await tcMailCatchingUp(db), true);
  await put(JSON.stringify({ read: 12, more: false, ok: true }));
  assert.equal(await tcMailCatchingUp(db), false, 'reached today: back to the working day only');
  await put('not json');
  assert.equal(await tcMailCatchingUp(db), false);
});
