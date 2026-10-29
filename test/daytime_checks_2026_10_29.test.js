// Daytime only (the owner, 29.10.2026: "Daytime hours are Latvian time 08.00 - 17.00", every day). The phone and email
// pulls and the page's call pop-up check run only inside that window, so the database can sleep at night.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { inWorkHours, localMinutes } from '../src/bizday.js';

const at = (iso) => new Date(iso);

test('the working day is 08:00-17:00 Latvian time, winter and summer', () => {
  // winter (UTC+2)
  assert.equal(inWorkHours(at('2026-10-29T05:59:00Z')), false);   // 07:59
  assert.equal(inWorkHours(at('2026-10-29T06:00:00Z')), true);    // 08:00
  assert.equal(inWorkHours(at('2026-10-29T15:00:00Z')), true);    // 17:00
  assert.equal(inWorkHours(at('2026-10-29T15:01:00Z')), false);   // 17:01
  // summer (UTC+3)
  assert.equal(inWorkHours(at('2026-07-01T04:59:00Z')), false);   // 07:59
  assert.equal(inWorkHours(at('2026-07-01T05:00:00Z')), true);    // 08:00
  assert.equal(inWorkHours(at('2026-07-01T14:00:00Z')), true);    // 17:00
  assert.equal(inWorkHours(at('2026-07-01T14:01:00Z')), false);   // 17:01
  // every day, weekends too (31.10.2026 is a Saturday)
  assert.equal(inWorkHours(at('2026-10-31T09:00:00Z')), true);
  assert.equal(localMinutes(at('2026-10-29T22:30:00Z')), 30);      // 00:30, not 24:30
});

test('the schedules cover 08:00-17:00 in both summer and winter, and no more often than before', () => {
  const crons = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')).crons;
  const at = (p) => crons.find((c) => c.path === p).schedule;
  assert.equal(at('/api/cron/pbx-calls'), '* 5-15 * * *');
  assert.equal(at('/api/cron/gmail-poll'), '*/10 5-15 * * *');
});

for (const [file, channel] of [['pbx-calls', 'phone'], ['gmail-poll', 'gmail']]) {
  test(`${file} answers "outside the working day" before it opens the database`, async () => {
    const src = fs.readFileSync(new URL(`../api/cron/${file}.js`, import.meta.url), 'utf8');
    const gate = src.indexOf('if (!inWorkHours())');
    assert.ok(gate > 0, 'the cron checks the working day');
    assert.ok(gate < src.indexOf('cronDb()'), 'before the database is opened');
    assert.ok(gate > src.indexOf('authoriseCron('), 'after the cron secret is checked');
    assert.ok(src.includes(`channel: '${channel}', why: 'outside 08:00-17:00 Latvian time'`));
  });
}

test('the page asks for call pop-ups only on screen and 08:00-17:00', () => {
  const html = fs.readFileSync(new URL('../src/app.html', import.meta.url), 'utf8');
  assert.match(html, /function cpOnDuty\(\) \{\n  if \(document\.hidden\) return false;/);
  assert.match(html, /return m >= 8 \* 60 && m <= 17 \* 60;/);
  assert.match(html, /async function cpTick\(\) \{\n  if \(CP_STOPPED\) return;\n  if \(!cpOnDuty\(\)\) \{ CP_LAST = null;/);
  assert.match(html, /const CP_EVERY_MS = 3000;/, 'on duty it still asks every 3 seconds');
});

test('the database address: INTAKE_DATABASE_URL first, then the Neon connection names (the move, 29.10.2026)', async () => {
  const { pgUrl } = await import('../src/db.js');
  const keep = { ...process.env };
  try {
    for (const k of ['INTAKE_DATABASE_URL', 'CRM_DB_DATABASE_URL_UNPOOLED', 'DATABASE_URL_UNPOOLED', 'DATABASE_URL']) delete process.env[k];
    process.env.CRM_DB_DATABASE_URL_UNPOOLED = 'postgres://old.example/db';
    assert.equal(pgUrl(), 'postgres://old.example/db');
    process.env.INTAKE_DATABASE_URL = 'postgres://new.example/db';
    assert.equal(pgUrl(), 'postgres://new.example/db');
  } finally {
    for (const k of ['INTAKE_DATABASE_URL', 'CRM_DB_DATABASE_URL_UNPOOLED', 'DATABASE_URL_UNPOOLED', 'DATABASE_URL']) {
      if (k in keep) process.env[k] = keep[k]; else delete process.env[k];
    }
  }
});
