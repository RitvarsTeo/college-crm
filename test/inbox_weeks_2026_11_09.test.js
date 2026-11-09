// THE INBOX BY CALENDAR WEEK, AND WHAT WAS HANDLED (the owner's picks 09.11.2026, on Aigars's "how do I see the previous
// week? when the week changes, the leads disappear"): A2 the columns are Today · Earlier this week · Last week · Before last
// week, Monday to Sunday in Riga; B a waiting message is never hidden by the Year picker; C "Waiting | Handled", the cards
// somebody dealt with this week and last week, each saying what, who and when, filtered noise left out; and a call from a
// new number stays in the Inbox, never on Due. Synthetic people only.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { start } from './security_helpers.js';

for (const k of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'CRM_DB_DATABASE_URL_UNPOOLED', 'INTAKE_DATABASE_URL']) process.env[k] = '';
const { openDb } = await import('../src/db.js');
const { receive, listHandled } = await import('../src/intake.js');

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fn = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };

// Monday 9 November 2026, 10:00 in Riga
const NOW = new Date('2026-11-09T08:00:00Z');
let n = 0;
const card = (db, at, extra = {}) => receive(db, { channel: extra.channel || 'gmail', externalId: 'wk-' + (++n), receivedAt: at,
  name: extra.name || 'Paraugs ' + n, email: extra.channel === 'phone' ? undefined : `wk${n}@example.com`,
  phone: extra.channel === 'phone' ? '+371 2000 ' + (5000 + n) : undefined, body: extra.channel === 'phone' ? 'Incoming call' : 'Vēlos mācīties navigāciju.' });
const handle = (db, id, state, by, at, extra = {}) => db.prepare(`UPDATE inbound SET state = ?, processed_by = ?, processed_at = ?, person_id = ?,
  archive_reason = ?, archive_note = ? WHERE id = ?`).run(state, by, at, extra.person || null, extra.reason || null, extra.note || null, id);

async function seeded(file = ':memory:') {
  const db = await openDb(file);
  await db.prepare(`INSERT INTO people (id, name, email, status, owner, created_at) VALUES ('pl', 'Laura Paraudziņa', 'laura@example.com', 'New', 'Ieva', '2026-11-06T09:00:00Z')`).run();
  // Friday 6 November, the afternoon Marina handled the waiting ones: a lead, internal, spam; an automatic join; a filter
  const a = (await card(db, '2026-11-06T09:00:00Z')).id;
  const b = (await card(db, '2026-11-06T09:30:00Z')).id;
  const c = (await card(db, '2026-11-06T10:00:00Z', { channel: 'phone' })).id;
  const d = (await card(db, '2026-11-05T10:00:00Z')).id;
  const e = (await card(db, '2026-11-04T10:00:00Z')).id;
  await handle(db, a, 'qualified', 'Marina', '2026-11-06T13:10:00Z', { person: 'pl' });
  await handle(db, b, 'archived', 'Marina', '2026-11-06T13:20:00Z', { reason: 'Internal' });
  await handle(db, c, 'archived', 'Marina', '2026-11-06T13:30:00Z', { reason: 'Spam' });
  await handle(db, d, 'qualified', 'machine', '2026-11-05T10:00:01Z', { person: 'pl' });
  await handle(db, e, 'filtered', 'machine', '2026-11-04T10:00:01Z', { reason: 'Filtered automatically', note: 'an automatic sender' });
  // this week: one set aside this morning; and one handled before last week, which is not shown
  const f = (await card(db, '2026-11-09T06:00:00Z')).id;
  await handle(db, f, 'archived', 'Ieva', '2026-11-09T07:00:00Z', { reason: 'Supplier or vendor' });
  const g = (await card(db, '2026-10-28T10:00:00Z')).id;
  await handle(db, g, 'archived', 'Ieva', '2026-10-30T10:00:00Z', { reason: 'Other' });
  // waiting: one from last December (B), one from Sunday, one from this morning
  await card(db, '2025-12-30T10:00:00Z', { name: 'Decembra Paraugs' });
  await card(db, '2026-11-08T12:00:00Z');
  await card(db, '2026-11-09T07:30:00Z', { channel: 'phone' });
  return db;
}

test('Handled: this week and last week, Monday to Sunday in Riga; what, who and when; filtered noise is not there', async () => {
  const db = await seeded();
  const h = await listHandled(db, { now: NOW });
  assert.equal(h.thisWeek, '2026-11-08T22:00:00.000Z', 'Monday 9 November, midnight in Riga');
  assert.equal(h.lastWeek, '2026-11-01T22:00:00.000Z', 'Monday 2 November, midnight in Riga');
  const what = h.rows.map((r) => [r.week, r.state, r.archive_reason || '', r.automatic ? 'Intake' : r.processed_by]);
  assert.deepEqual(what, [
    ['this', 'archived', 'Supplier or vendor', 'Ieva'],
    ['last', 'archived', 'Spam', 'Marina'],
    ['last', 'archived', 'Internal', 'Marina'],
    ['last', 'qualified', '', 'Marina'],
    ['last', 'qualified', '', 'Intake'],
  ]);
  assert.ok(!h.rows.some((r) => r.state === 'filtered'), 'filtered noise is not handled work');
  assert.ok(!h.rows.some((r) => r.archive_reason === 'Other'), 'before last week: not here');
  assert.equal(h.rows.find((r) => r.state === 'qualified' && !r.automatic).person_name, 'Laura Paraudziņa', 'a lead opens its person');
  assert.equal(h.rows.find((r) => r.channel === 'phone').body, 'Incoming call', 'a phone card keeps its body, so the Line filter reads it');
  assert.equal(h.rows.find((r) => r.channel === 'gmail').body ?? null, null, 'an email card sends no text');
});

test('the columns: Today · Earlier this week · Last week · Before last week, by the calendar week, on a Monday and a Thursday', () => {
  const run = (today) => {
    const ctx = { cTodayIso: () => today, cDay: (iso) => String(iso).slice(0, 10) };
    vm.runInNewContext([fn('function cWeekStarts() {'), fn('function cInboxAge(iso) {'), 'this.age = cInboxAge;'].join('\n'), ctx);
    return ctx.age;
  };
  const mon = run('2026-11-09');
  assert.deepEqual(['2026-11-09T05:00', '2026-11-08T12:00', '2026-11-02T08:00', '2026-11-01T20:00'].map(mon),
    ['today', 'lastweek', 'lastweek', 'older'], 'on a Monday, Sunday is already last week, and nothing is "earlier this week"');
  const thu = run('2026-11-12');
  assert.deepEqual(['2026-11-12T05:00', '2026-11-09T06:00', '2026-11-08T12:00', '2026-11-02T06:00', '2026-11-01T06:00'].map(thu),
    ['today', 'week', 'lastweek', 'lastweek', 'older']);
  assert.match(APP, /\[\['today', 'Today', 'today'\], \['week', 'Earlier this week', 'yesterday'\], \['lastweek', 'Last week', 'week'\], \['older', 'Before last week', 'older'\]\]/);
});

test('the Handled card says what happened, who and when, with Open or Bring back; the switch sits on the waiting Inbox only', () => {
  const view = fn('async function cInboxHandled() {');
  assert.match(view, /api\('\/api\/intake\/handled'\)/);
  for (const w of ["'Set aside · '", "'Added to their record automatically'", "'Made a lead'", 'Bring back</button>', '>Open</a>', "r.automatic ? 'Intake' : (r.processed_by || '')", 'fmtDateTime(r.processed_at)'])
    assert.ok(view.includes(w), w);
  assert.match(view, /\['this', 'This week', 'today'\], \['last', 'Last week', 'week'\]/);
  assert.match(APP, /act: live \? cInboxSwitch\(false\) : '',/, 'not on the set-aside view reached by address');
  assert.match(fn('async function viewLeadsC() {'), /if \(C_IP\.handled && C_IP\.show === 'new'\) return cInboxHandled\(\);/);
  assert.match(fn('function cInboxLine(v) {'), /if \(C_IP\.handled && C_IP\.show === 'new'\) cInboxHandled\(\); else cInboxPool\(\);/, 'the Line filter redraws the view it is on');
});

let srv = null;
after(() => { if (srv) srv.child.kill(); });
test('a running copy: a waiting message is never hidden by the Year; Handled opens; a new number never lands on Due', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-weeks-'));
  const file = path.join(dir, 'weeks.db');
  const db = await seeded(file);
  await db.close();
  srv = await start({ CRM_DB: file, DATASET: '', CRM_AUTH: '', CRM_PUBLIC: '' });
  const get = async (p) => (await fetch(srv.base + p, { headers: { 'x-acting-as': 'Ieva' } })).json();
  const waiting = await get('/api/intake?state=new&y=2026');
  assert.ok(waiting.rows.some((r) => r.contact_name === 'Decembra Paraugs'), 'December 2025 still waits under Year 2026');
  assert.equal(waiting.rows.length, 3);
  assert.equal(waiting.counts.new, 3, 'the count says the same');
  const older = await get('/api/intake?state=archived&y=2025');
  assert.equal(older.rows.length, 0, 'the picker still scopes what was handled');
  const h = await get('/api/intake/handled');
  assert.ok(Array.isArray(h.rows) && h.thisWeek && h.lastWeek);
  // a call from a number Intake does not know waits in the Inbox and is no step on Due (a step needs a person)
  const call = waiting.rows.find((r) => r.channel === 'phone');
  assert.ok(call, 'the call is in the Inbox');
  const tasks = await get('/api/tasks?scope=open');
  assert.deepEqual(Array.isArray(tasks) ? tasks : tasks.rows, [], 'Due holds no step: the call waits in the Inbox only');
});
