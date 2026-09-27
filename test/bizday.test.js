// A day is a RIGA day. Found 28.09.2026 at 01:24: a step planned after midnight was
// saved as yesterday and was overdue at once, because "today" was the UTC date - still
// yesterday in Riga until 03:00. The same slice sat under the server's today/overdue
// counts, the report period, the month trend and the CSV. These tests pin the rule at
// the hours where the two dates differ, which daytime testing never reaches.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { localDate, localMidnight, todayStart, tomorrowStart } from '../src/bizday.js';
import { periodOf, report } from '../src/reports.js';
import { openDb } from '../src/db.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');

test('after midnight in Riga it is already the next day, summer and winter', () => {
  assert.equal(localDate('2026-09-27T22:24:00.000Z'), '2026-09-28', '01:24 Riga summer time');
  assert.equal(localDate('2026-09-27T20:59:59.000Z'), '2026-09-27', '23:59 Riga');
  assert.equal(localDate('2026-01-14T22:30:00.000Z'), '2026-01-15', '00:30 Riga winter time');
  assert.equal(localDate('2026-03-05'), '2026-03-05', 'a date on its own stays that date');
});

test('a Riga day starts at Riga midnight, across both clock changes', () => {
  assert.equal(localMidnight(2026, 9, 28), '2026-09-27T21:00:00.000Z');
  assert.equal(localMidnight(2026, 1, 1), '2025-12-31T22:00:00.000Z');
  assert.equal(localMidnight(2026, 3, 30), '2026-03-29T21:00:00.000Z', 'the day after summer time begins');
  assert.equal(localMidnight(2026, 10, 26), '2026-10-25T22:00:00.000Z', 'the day after it ends');
  const at = new Date('2026-09-27T22:24:00.000Z');
  assert.equal(todayStart(at), '2026-09-27T21:00:00.000Z');
  assert.equal(tomorrowStart(at), '2026-09-28T21:00:00.000Z');
  // a task due yesterday at noon is overdue at 01:24, not "due today"
  assert.ok('2026-09-27T09:00:00.000Z' < todayStart(at));
});

test('the server takes its today and overdue line from the Riga day', () => {
  const SERVER = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
  assert.match(SERVER, /const dayStart = \(\) => todayStart\(\);/);
  assert.match(SERVER, /const dayEnd = \(\) => tomorrowStart\(\);/);
});

test('a report period is Riga days, and its label names those days', () => {
  const p = periodOf('2026-01-01', '2026-12-31');
  assert.equal(p.from, '2025-12-31T22:00:00.000Z');
  assert.equal(p.to, '2026-12-31T22:00:00.000Z');
  assert.equal(p.label, '2026-01-01 to 2026-12-31');
});

test('a lead at 00:30 on New Year\'s Day belongs to the new year and to January', async () => {
  const db = await openDb(':memory:');
  const add = (id, created, admitted = null) => db.prepare(`INSERT INTO people
      (id,name,status,owner,source_channel,created_at,last_contact_at,admitted_at) VALUES (?,?,?,?,?,?,?,?)`)
    .run(id, 'Test ' + id, admitted ? 'Admitted' : 'New', 'Admissions', 'website', created, created, admitted);
  await add('a1', '2025-12-31T22:30:00.000Z');                                // 00:30 Riga, 1 Jan 2026
  await add('a2', '2025-12-31T20:30:00.000Z');                                // 22:30 Riga, 31 Dec 2025
  await add('a3', '2026-12-31T22:30:00.000Z');                                // 00:30 Riga, 1 Jan 2027
  await add('a4', '2026-01-31T22:30:00.000Z', '2026-02-28T22:30:00.000Z');   // 1 Feb in, 1 Mar admitted
  const r = await report(db, { from: '2026-01-01', to: '2026-12-31' });
  assert.equal(r.summary.newLeads, 2, 'a1 and a4 arrived in 2026 in Riga');
  const month = (m) => r.trend.find((x) => x.month === m);
  assert.equal(month('2026-01').newLeads, 1, 'a1 is a January lead');
  assert.equal(month('2026-02').newLeads, 1, 'a4 arrived on 1 February');
  assert.equal(month('2026-03').admitted, 1, 'a4 was admitted on 1 March');
  assert.equal(r.trend.length, 12);
  assert.equal(r.trend[11].month, '2026-12');
  await db.close?.();
});

test('the screens take "today" from Riga too', () => {
  // Run the page's own date helpers with the clock at 01:24 Riga on 28 September.
  const start = APP.indexOf("const TZ = 'Europe/Riga';");
  const end = APP.indexOf('\n', APP.indexOf('const todayStr = '));
  assert.ok(start > 0 && end > start, 'the helpers are where this test expects them');
  const FIXED = '2026-09-27T22:24:00.000Z';
  class FixedDate extends Date {
    constructor(...a) { super(...(a.length ? a : [FIXED])); }
    static now() { return Date.parse(FIXED); }
  }
  const out = vm.runInNewContext(APP.slice(start, end) + '\n({ today: todayStr(), due: fmtDate("2026-09-27T09:00:00.000Z") })',
    { Date: FixedDate, Intl, String });
  assert.equal(out.today, '2026-09-28');
  assert.equal(out.due, '2026-09-27', 'so a step due yesterday reads as overdue');
  assert.ok(!/const todayStr = \(\) => new Date\(\)\.toISOString\(\)/.test(APP), 'todayStr is not the UTC date');
  assert.match(APP, /const cDay = \(iso\) => \(iso \? fmtDate\(iso\) : ''\);/);
});
