// Q50 (DECIDED 05.10.2026, the owner picked MASTER CONTROL's suggestion): an Inbox message still waiting after one
// WORKING hour is amber "answer now"; still waiting at the end of that working day it is red "late". Working hours
// Mon-Fri 09:00-17:00 Europe/Riga, from config. "Answered" = handled in the Inbox (state no longer new), until a real
// first-reply time exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { receive, listInbound, agedCount, answerDeadlines, CONFIG } from '../src/intake.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const riga = (iso) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Riga', weekday: 'short', day: '2-digit', month: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
const due = (iso) => { const d = answerDeadlines(iso); return [riga(d.answerBy), riga(d.lateAt)]; };

test('the working hours are config', () => {
  assert.deepEqual(CONFIG.ageing.workdays, [1, 2, 3, 4, 5]);
  assert.equal(CONFIG.ageing.start, '09:00');
  assert.equal(CONFIG.ageing.end, '17:00');
  assert.equal(CONFIG.ageing.answerWithinMinutes, 60);
  assert.equal(CONFIG.ageing.timezone, 'Europe/Riga');
});

test('within the working day: answer within the hour, late at 17:00', () => {
  assert.deepEqual(due('2026-10-06T07:00:00Z'), ['Tue 06/10, 11:00', 'Tue 06/10, 17:00'], 'Tue 10:00');
  assert.deepEqual(due('2026-10-06T06:00:00Z'), ['Tue 06/10, 10:00', 'Tue 06/10, 17:00'], 'Tue 09:00 sharp');
});

test('the one-hour boundary: 15:59 still answers today, 16:00 answers at 17:00, 16:30 carries over to the next morning', () => {
  assert.deepEqual(due('2026-10-06T12:59:00Z'), ['Tue 06/10, 16:59', 'Tue 06/10, 17:00']);
  assert.deepEqual(due('2026-10-06T13:00:00Z'), ['Tue 06/10, 17:00', 'Tue 06/10, 17:00'], 'answer now and late at the same moment: late wins');
  assert.deepEqual(due('2026-10-06T13:30:00Z'), ['Wed 07/10, 09:30', 'Wed 07/10, 17:00'], 'the half hour left is used the next morning');
});

test('Friday 16:30 -> Monday: the half hour runs Monday 09:00-09:30, late Monday 17:00', () => {
  assert.deepEqual(due('2026-10-02T13:30:00Z'), ['Mon 05/10, 09:30', 'Mon 05/10, 17:00']);
});

test('weekends and nights wait for the next working morning', () => {
  assert.deepEqual(due('2026-10-03T09:00:00Z'), ['Mon 05/10, 10:00', 'Mon 05/10, 17:00'], 'Saturday noon');
  assert.deepEqual(due('2026-10-04T20:00:00Z'), ['Mon 05/10, 10:00', 'Mon 05/10, 17:00'], 'Sunday 23:00');
  assert.deepEqual(due('2026-10-06T05:00:00Z'), ['Tue 06/10, 10:00', 'Tue 06/10, 17:00'], 'Tue 08:00, before opening');
  assert.deepEqual(due('2026-10-06T14:00:00Z'), ['Wed 07/10, 10:00', 'Wed 07/10, 17:00'], 'Tue 17:00, after closing');
  assert.deepEqual(due('2026-10-02T18:00:00Z'), ['Mon 05/10, 10:00', 'Mon 05/10, 17:00'], 'Friday 21:00');
});

test('Riga hours across the clock change (25.10.2026) and in winter', () => {
  assert.deepEqual(due('2026-10-23T13:30:00Z'), ['Mon 26/10, 09:30', 'Mon 26/10, 17:00'], 'Fri 16:30 in summer time -> Mon in winter time');
  assert.deepEqual(due('2026-01-15T20:30:00Z'), ['Fri 16/01, 10:00', 'Fri 16/01, 17:00']);
});

test('the Inbox rows: nothing yet, then answer now, then late; a handled message is neither', async () => {
  const db = await openDb();
  const HI = 'Hello, I would like to study navigation';
  await receive(db, { channel: 'instagram', body: HI, name: 'Fresh', externalId: 'f', receivedAt: '2026-10-06T07:30:00Z' });   // Tue 10:30
  await receive(db, { channel: 'instagram', body: HI, name: 'Hour', externalId: 'h', receivedAt: '2026-10-06T06:30:00Z' });    // Tue 09:30
  await receive(db, { channel: 'instagram', body: HI, name: 'Friday', externalId: 'y', receivedAt: '2026-10-02T13:30:00Z' });  // Fri 16:30
  const at = (now) => listInbound(db, { now }).then((rows) => Object.fromEntries(rows.map((r) => [r.contact_name, r.aged ? 'late' : r.answerNow ? 'answer now' : ''])));
  // Tue 06.10 10:45 Riga
  assert.deepEqual(await at('2026-10-06T07:45:00Z'), { Fresh: '', Hour: 'answer now', Friday: 'late' });
  // Tue 17:00 Riga: the end of the day
  assert.deepEqual(await at('2026-10-06T14:00:00Z'), { Fresh: 'late', Hour: 'late', Friday: 'late' });
  assert.equal(await agedCount(db, '2026-10-06T07:45:00Z'), 1);
  // handled = answered: archived, it is neither
  await db.prepare("UPDATE inbound SET state = 'archived' WHERE contact_name = 'Hour'").run();
  const rows = await listInbound(db, { state: 'archived', now: '2026-10-06T14:00:00Z' });
  assert.equal(rows.find((r) => r.contact_name === 'Hour').aged, false);
  assert.equal(rows.find((r) => r.contact_name === 'Hour').answerNow, false);
});

test('on the card: "answer now" is a solid amber chip with navy words, "late" the solid red one; never amber text', () => {
  // Q62: the Inbox is a board of cards; Q66 (07.10): the card's state line says New, Answer now or Late, and the rail
  // carries the colour - amber for answer now, red for late; the word itself is never amber text
  assert.match(APP, /const st = !live \? 'aside' : r\.aged \? 'late' : r\.answerNow \? 'now' : 'new';/);
  assert.match(APP, /const C_ST_RAIL = \{[^}]*late: 'over', now: 'today', new: 'due', aside: 'none' \};/);
  assert.match(APP, /html\.ui-c \.c-jp\.c-rail-today\{border-left-color:var\(--st-today\)\}/);
  assert.match(APP, /--st-today:var\(--j-soon\)/, 'the signal amber');
  assert.match(APP, /html\.ui-c \.c-st-over \.c-st-w,html\.ui-c \.c-st-late \.c-st-w\{color:var\(--st-over\)\}/);
  assert.doesNotMatch(APP, /\.c-st-now \.c-st-w\{color:var\(--j-soon\)/, 'never amber text');
});
