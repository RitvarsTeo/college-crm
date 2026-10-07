// ONE LINE PER ARRIVAL (locked 01.10.2026, Q9).
//
// An inbound row is one THING TO LOOK AT. A line is one arrival on it. One number is one
// thing to ring back however many times it rings, so the row does not multiply - but each
// arrival keeps its own time, its own provider id and its own body.
//
// The reason it is a TABLE and not a growing text column is retention. 13 months is
// counted per line, from that line's own received_at. One body column has one timestamp
// for the whole thread, so the oldest line would decide when the newest is deleted:
// somebody who rang this morning would lose this morning's line because their first call
// was last year. A row per line is the only shape that can carry a clock each.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import {
  receive, listInbound, qualify, archive, addLine, linesOf,
  purgeLineBodies, LINE_KINDS,
} from '../src/intake.js';

const lines = (db, id) => linesOf(db, id);
const phone = (over = {}) => ({ channel: 'phone', threadKey: 'phone:29111222', joinOpenThread: true,
  phone: '+37129111222', body: 'Missed call on button 3 (Other)', ...over });

test('the first arrival is line 1, carrying the body the row was created with', async () => {
  const db = await openDb();
  const r = await receive(db, phone({ externalId: 'c1', receivedAt: '2026-10-01T08:05:00.000Z' }));
  const [l] = await lines(db, r.id);
  assert.equal(l.seq, 1);
  assert.equal(l.channel, 'phone');
  assert.equal(l.external_id, 'c1');
  assert.equal(l.received_at, '2026-10-01T08:05:00.000Z');
  assert.equal(l.kind, 'call', 'guessed from the channel');
  assert.equal(l.body, 'Missed call on button 3 (Other)');
  assert.equal(l.body_deleted_at, null);
});

test('a joined arrival is the next line, with ITS own clock and ITS own provider id', async () => {
  const db = await openDb();
  const first = await receive(db, phone({ externalId: 'c1', receivedAt: '2026-10-01T08:05:00.000Z' }));
  const again = await receive(db, phone({ externalId: 'c2', receivedAt: '2026-10-01T08:31:00.000Z',
    joinBody: 'Rang again 2026-10-01 11:31, missed call on button 3 (Other)' }));
  assert.equal(again.joined, true);
  assert.equal(again.id, first.id);
  assert.equal(again.seq, 2);

  const ls = await lines(db, first.id);
  assert.equal(ls.length, 2, 'two arrivals, one row');
  assert.deepEqual(ls.map((l) => l.received_at),
    ['2026-10-01T08:05:00.000Z', '2026-10-01T08:31:00.000Z'],
    'each line keeps the time IT arrived, which is the whole point');
  assert.deepEqual(ls.map((l) => l.external_id), ['c1', 'c2']);
  assert.match(ls[1].body, /^Rang again/, 'the line holds how this arrival reads');

  const [row] = await listInbound(db, { state: 'new' });
  assert.equal(row.body,
    'Missed call on button 3 (Other)\nRang again 2026-10-01 11:31, missed call on button 3 (Other)');
  assert.equal(row.received_at, '2026-10-01T08:05:00.000Z',
    'the row still shows when they FIRST got in touch');
});

// Before the lines existed, a second arrival's external_id was written nowhere: the row
// keeps only the FIRST one. So a provider redelivering call two was not caught at all.
test('a repeat delivery of a LATER arrival is caught, not stored twice', async () => {
  const db = await openDb();
  const first = await receive(db, phone({ externalId: 'c1' }));
  await receive(db, phone({ externalId: 'c2', joinBody: 'Rang again' }));

  const dup = await receive(db, phone({ externalId: 'c2', joinBody: 'Rang again' }));
  assert.equal(dup.duplicate, true);
  assert.equal(dup.id, first.id, 'it points at the row that already holds it');
  assert.equal((await lines(db, first.id)).length, 2, 'still two lines, not three');
});

test('a repeat of the FIRST arrival is still caught, as it always was', async () => {
  const db = await openDb();
  const a = await receive(db, phone({ externalId: 'c1' }));
  const b = await receive(db, phone({ externalId: 'c1' }));
  assert.equal(b.duplicate, true);
  assert.equal(b.id, a.id);
  assert.equal((await lines(db, a.id)).length, 1);
});

test('seq is unique per row: two lines can never share a number', async () => {
  const db = await openDb();
  const r = await receive(db, phone({ externalId: 'c1' }));
  await assert.rejects(
    () => db.prepare('INSERT INTO inbound_line (inbound_id, seq, channel, received_at, kind, body) VALUES (?,?,?,?,?,?)')
      .run(r.id, 1, 'phone', '2026-10-01T09:00:00.000Z', 'call', 'x'),
    /UNIQUE|unique/i);
});

test('the kind is guessed from the channel, and an explicit kind is never overruled', async () => {
  const db = await openDb();
  const a = await receive(db, { channel: 'phone', externalId: 'p1', body: 'Missed call' });
  const b = await receive(db, { channel: 'website_form', externalId: 'w1', body: 'I want to study NAV' });
  const c = await receive(db, { channel: 'instagram', externalId: 'i1', body: 'Hi' });
  const d = await receive(db, { channel: 'instagram', externalId: 'i2', body: 'Hi', kind: 'activity' });
  assert.equal((await lines(db, a.id))[0].kind, 'call');
  assert.equal((await lines(db, b.id))[0].kind, 'form');
  assert.equal((await lines(db, c.id))[0].kind, 'message');
  assert.equal((await lines(db, d.id))[0].kind, 'activity', 'the caller knows better than the guess');
  assert.deepEqual(LINE_KINDS, ['message', 'call', 'form', 'activity']);
});

test('retention empties a line 13 months after ITS OWN arrival, and never a newer one', async () => {
  const db = await openDb();
  const r = await receive(db, phone({ externalId: 'c1', receivedAt: '2025-01-10T08:00:00.000Z' }));
  await receive(db, phone({ externalId: 'c2', receivedAt: '2026-09-30T08:00:00.000Z', joinBody: 'Rang again' }));
  await receive(db, phone({ externalId: 'c3', receivedAt: '2026-10-01T08:00:00.000Z', joinBody: 'Rang again' }));

  const purged = await purgeLineBodies(db, '2025-09-01T00:00:00.000Z');
  assert.equal(purged, 1, 'only the line actually older than the cutoff');

  const ls = await lines(db, r.id);
  assert.equal(ls[0].body, null, 'the old call is emptied');
  assert.ok(ls[0].body_deleted_at, 'and says when, so the deletion is auditable');
  assert.ok(ls[1].body, 'last month survives');
  assert.ok(ls[2].body, 'and so does today - an old call never takes a newer one with it');
  assert.equal(ls.length, 3, 'the lines stay: the row still shows something arrived that day');
});

test('the machine filter empties the ROW body and KEEPS the line, so it stays checkable', async () => {
  const db = await openDb();
  const junk = await receive(db, { channel: 'instagram', externalId: 'j1',
    body: 'Buy cheap followers now, best SEO service, click here' });
  assert.equal(junk.filtered, true, 'the word-list filter fired');

  const row = await db.prepare('SELECT * FROM inbound WHERE id = ?').get(junk.id);
  assert.equal(row.state, 'filtered');
  assert.equal(row.body, null, 'nothing filtered shows a message on a screen');

  const [l] = await lines(db, junk.id);
  assert.ok(l.body, 'but the line keeps it: a Filtered view nobody can check is not a working view');
  assert.equal(l.body_deleted_at, null);
});

test('making a lead and set aside both keep the bodies, lines included (07.10.2026: "Keep the text", both times)', async () => {
  const db = await openDb();
  const a = await receive(db, { channel: 'instagram', externalId: 'q1',
    body: 'Hi, I want to study Navigation, I finished secondary school' });
  const q = await qualify(db, a.id, { qualification: 'lead', createPerson: true,
    by: 'Admissions', nextAction: 'Call and establish interest' });
  assert.ok(!q.error, JSON.stringify(q));
  const ls = await lines(db, a.id);
  assert.equal(ls[0].body, 'Hi, I want to study Navigation, I finished secondary school', 'qualify keeps it since Q76 (it deleted it until 07.10.2026)');
  assert.equal(ls[0].body_deleted_at, null);

  const b = await receive(db, { channel: 'instagram', externalId: 'r1', body: 'Not for me' });
  await archive(db, b.id, { reason: 'Not a prospective student', by: 'Admissions' });
  const bl = await lines(db, b.id);
  assert.equal(bl[0].body, 'Not for me', 'set aside keeps the text now, until the 13-month retention');
  assert.equal(bl[0].body_deleted_at, null);
});

test('addLine appends in order and reports the number it used', async () => {
  const db = await openDb();
  const r = await receive(db, { channel: 'open_day', externalId: 'o1', body: 'Came to the open day' });
  assert.equal((await lines(db, r.id))[0].kind, 'activity');
  const seq = await addLine(db, r.id, { channel: 'open_day', receivedAt: '2026-10-02T08:00:00.000Z',
    body: 'Came to the second open day' });
  assert.equal(seq, 2);
  assert.deepEqual((await lines(db, r.id)).map((l) => l.seq), [1, 2]);
});

// The purge must be a path that RUNS, not a function nobody calls. The phone poller
// already purges pbx_calls on every run; the lines go with it, on the same clock.
test('the phone run purges line bodies as well as the raw calls', async () => {
  const sync = await import('node:fs').then((fs) => fs.readFileSync(
    new URL('../src/sync.js', import.meta.url), 'utf8'));
  assert.match(sync, /purgeLineBodies/, 'imported');
  const run = sync.slice(sync.indexOf('result.purged = await purgeOld'), sync.indexOf('result.purged = await purgeOld') + 420);
  assert.match(run, /result\.purgedLines = await purgeLineBodies\(db, retentionCutoff\(now\)\)/,
    'and called on every run, with the same 13-month cutoff');
});
