// TELEPHONE CALLS (20.11.2026; his words "Telephone calls metrics ... BUT NOT A CLUSTER, just the most important metrics! All of
// that on a Single screen with a carousel"; his picks "B: three cards" and "Add 'Called back' button"). The five figures from the
// PBX's own fields; overdue counted only from the button's first day; the Called back button: missed only, once only.
// Invented calls only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './security_helpers.js';
const { openDb } = await import('../src/db.js');
const cm = await import('../src/callmetrics.js');
const { setCalledBack, callsFor } = await import('../src/intake.js');
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');

const add = (db, id, at, picked, dur, talk, extra = {}) => db.prepare(`INSERT INTO pbx_calls (uniqueid, called_at, queue, caller_num, picked_up, operator_name, inserted_at, duration_sec, talk_sec, inbound_id, person_id)
  VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id, at, '1001*Q-ADMISSION', '+37120000000', picked, picked ? 'Laura' : null, at, dur, talk, extra.inbound ?? null, extra.person ?? null);

test('the five figures: ring before pick-up (median), % answered, answered per working day, busiest hour; a weekend is not a working day', async () => {
  const db = await openDb();
  // Tuesday 10.11 and Wednesday 11.11 (Riga = UTC+2): 08:xx UTC = 10:xx Riga
  await add(db, 'a1', '2026-11-10T08:00:00Z', 1, 40, 20);    // rang 20 s
  await add(db, 'a2', '2026-11-10T08:30:00Z', 1, 70, 30);    // rang 40 s
  await add(db, 'm1', '2026-11-10T09:00:00Z', 0, 25, 0);
  await add(db, 'a3', '2026-11-11T08:10:00Z', 1, 90, 60);    // rang 30 s
  await add(db, 'w1', '2026-11-08T08:10:00Z', 1, 50, 40);    // Sunday: out of the working-day figures
  const M = await cm.callMetrics(db, { now: new Date('2026-11-12T12:00:00Z') });
  assert.equal(M.figures.waitSec, 30, 'median of 20, 40, 30');
  assert.equal(M.figures.calls, 4); assert.equal(M.figures.answered, 3); assert.equal(M.figures.answeredPct, 75);
  assert.equal(M.figures.answeredPerDay, 1, '3 answered over 3 working days: Monday 09.11 had none and still counts');
  assert.equal(M.figures.busiestHour, 10, '10:00 Riga has 3 calls');
  assert.deepEqual(M.series.map((s) => s.day), ['2026-11-09', '2026-11-10', '2026-11-11'], 'from the first call, working days only');
  assert.ok(M.calls.every((c) => !('caller_num' in c) && !JSON.stringify(c).includes('37120000000')), 'never the number');
});

test('overdue: only from the button\'s first day; a missed call called back or handled in its working day is not overdue; one left past the end of its day is', async () => {
  const db = await openDb();
  assert.equal(cm.OVERDUE_FROM, '2026-11-20');
  await add(db, 'old', '2026-11-12T08:00:00Z', 0, 30, 0);              // before the button: never counted
  await add(db, 'm1', '2026-11-23T08:00:00Z', 0, 30, 0);               // Monday 23.11, 10:00 Riga, called back 11:00
  await add(db, 'm2', '2026-11-23T09:00:00Z', 0, 30, 0);               // left
  await add(db, 'm3', '2026-11-24T08:00:00Z', 0, 30, 0);               // Tuesday, its day not over yet at "now"
  await setCalledBack(db, 'm1', { by: 'Laura', at: '2026-11-23T09:00:00Z' });
  const M = await cm.callMetrics(db, { now: new Date('2026-11-24T09:00:00Z'), days: 30 });
  const by = Object.fromEntries(M.calls.map((c) => [c.id, c.overdue]));
  assert.deepEqual(by, { old: null, m1: false, m2: true, m3: null });
  assert.deepEqual(M.series.filter((s) => s.overdue != null).map((s) => [s.day, s.overdue]), [['2026-11-20', 0], ['2026-11-23', 1]], 'days over only: the first day of the button counts, today does not yet');
  assert.equal(M.series.find((s) => s.day === '2026-11-12').overdue, null, 'no figure for the days before the button');
  assert.equal(M.figures.overduePerDay, 0.5);
});

test('Called back: a missed call only, once only (the first one counts), who and when; it shows on the call', async () => {
  const db = await openDb();
  await add(db, 'm1', '2026-11-23T08:00:00Z', 0, 30, 0, { inbound: 7 });
  await add(db, 'a1', '2026-11-23T08:10:00Z', 1, 60, 30, { inbound: 7 });
  assert.match((await setCalledBack(db, 'a1', { by: 'Laura' })).error, /answered/);
  assert.match((await setCalledBack(db, 'nope', { by: 'Laura' })).error, /not found/);
  assert.match((await setCalledBack(db, 'm1', {})).error, /who/);
  const r = await setCalledBack(db, 'm1', { by: 'Laura', at: '2026-11-23T08:30:00Z' });
  assert.deepEqual([r.calledBackAt, r.calledBackBy], ['2026-11-23T08:30:00Z', 'Laura']);
  const again = await setCalledBack(db, 'm1', { by: 'Ieva', at: '2026-11-23T09:30:00Z' });
  assert.deepEqual([again.calledBackBy, again.already], ['Laura', true], 'the first call-back counts');
  const calls = await callsFor(db, 7);
  assert.deepEqual(calls.find((c) => c.id === 'm1').calledBackBy, 'Laura');
});

test('the screen: Calls under Reports, three cards with the middle one in focus, arrows and dots, every figure opens its calls', () => {
  assert.ok(APP.includes('<div class="kids"><a href="#/calls" data-c="calls"'));
  assert.ok(APP.includes("if (page === 'calls') return viewCallsC();"));
  const draw = APP.slice(APP.indexOf('function cCallsDraw()'), APP.indexOf('function cCallsGo('));
  assert.ok(draw.includes('${card(C_CM_KEYS[(i + n - 1) % n], true)}${card(C_CM_KEYS[i], false)}${card(C_CM_KEYS[(i + 1) % n], true)}'));
  assert.ok(draw.includes('cCallsList(') && draw.includes('aria-label="Previous"') && draw.includes('aria-label="Next"') && draw.includes('class="cm-dots"'));
  assert.ok(APP.includes("const C_CM_KEYS = ['wait', 'pct', 'perday', 'hour'];"), 'four cards: the Overdue card is off ("this gone, rest fine!")');
  assert.ok(APP.includes('html.ui-c body:has(.cm-b) #helpBtn{display:none}'), 'no Feedback button over the arrows on a phone');
  assert.ok(APP.includes('counted from ${cCmDay(M.overdueFrom)}'), 'before any day is counted, the card says when it starts');
  assert.ok(APP.includes('.cm-bars u{display:block;width:100%;background:#29a8df'), 'data blue');
  const bars = APP.slice(APP.indexOf('function cCmBars('), APP.indexOf('function cCmTip('));
  assert.ok(bars.includes('class="cm-y"') && bars.includes('data-t=') && bars.includes('cm-med') && bars.includes('median '), 'value scale, value per bar, median line');
  assert.ok(APP.includes("tips: T, unit: ' s', median: F.waitSec") && APP.includes('every: true'), 'median on Time to answer; every hour under its bar');
});

test('readable without explanation: every chart says what it counts per what, which bar is when, how much the top bar is, and this week against last week', () => {
  for (const t of ['Ring before answer, per day', 'Share of calls answered, per day', 'Answered calls per day', 'Missed calls left overdue, per day', 'Calls per hour of the day, all days']) assert.ok(APP.includes(`title: '${t}'`), t);
  const bars = APP.slice(APP.indexOf('function cCmBars('), APP.indexOf('function cCmTip('));
  assert.ok(bars.includes('class="cm-ct"') && bars.includes('class="cm-hi"') && bars.includes('cCmMon(d) === d'), 'title, top bar labelled, a date under each Monday');
  assert.ok(APP.includes('This week: ') && APP.includes('const C_CM_MIN = 10;'), 'this week against last week; a handful of calls is no figure');
});

test('no test or staff call counts: a number marked Internal or Spam is left out; the range runs on past the last call, which the screen names', async () => {
  const db = await openDb();
  await add(db, 'a1', '2026-11-10T08:00:00Z', 1, 40, 20);
  await db.prepare(`INSERT INTO pbx_calls (uniqueid, called_at, queue, caller_num, picked_up, operator_name, inserted_at, duration_sec, talk_sec) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run('staff', '2026-11-10T09:00:00Z', '1001*Q-ADMISSION', '+37129999999', 0, null, '2026-11-10T09:00:00Z', 20, 0);
  await db.prepare(`INSERT INTO contact_marks (contact_key, mark, set_by, set_at) VALUES (?,?,?,?)`).run('phone:29999999', 'Internal', 'Ieva', '2026-11-01T00:00:00Z');
  const M = await cm.callMetrics(db, { now: new Date('2026-11-20T10:00:00Z') });
  assert.deepEqual(M.calls.map((c) => c.id), ['a1'], 'the Internal number is not a caller');
  assert.equal(M.figures.missed, 0);
  assert.deepEqual([M.lastCall, M.to], ['2026-11-10', '2026-11-19'], 'days after the last call show as days without a call; today is not over');
  assert.ok(APP.includes('calls up to ${esc(cCmDay(M.lastCall || M.to))}') && APP.includes('`no calls since ${cCmDdmm(M.lastCall)}`'));
});

test('a Supplier or vendor number is no student caller either: every mark leaves the call out', async () => {
  const db = await openDb();
  await add(db, 'a1', '2026-11-10T08:00:00Z', 1, 40, 20);
  await db.prepare(`INSERT INTO pbx_calls (uniqueid, called_at, queue, caller_num, picked_up, operator_name, inserted_at, duration_sec, talk_sec) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run('sup', '2026-11-10T09:00:00Z', '1001*Q-ADMISSION', '+37128888888', 1, 'Laura', '2026-11-10T09:00:00Z', 60, 30);
  await db.prepare(`INSERT INTO contact_marks (contact_key, mark, set_by, set_at) VALUES (?,?,?,?)`).run('phone:28888888', 'Supplier or vendor', 'Ieva', '2026-11-01T00:00:00Z');
  const M = await cm.callMetrics(db, { now: new Date('2026-11-20T10:00:00Z') });
  assert.deepEqual(M.calls.map((c) => c.id), ['a1']);
  assert.deepEqual([...cm.NOT_COUNTED].sort(), ['Internal', 'Spam', 'Supplier or vendor']);
});
