// Item 15, 30.09.2026: the database refuses the same event twice.
//
// receive() already looked for a repeat before inserting, but a SELECT and an INSERT
// are two steps: two deliveries of one message arriving together both find nothing and
// both insert. A provider retry is normal and Meta can retry in parallel, so this is a
// race the app will meet. The index is what actually holds; the clash is caught and
// reported as a repeat, so a caller sees no difference.
//
// NOT run against Neon: this is the schema both backends are built from.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, pgSchemaSql } from '../src/db.js';
import { receive } from '../src/intake.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DB = fs.readFileSync(path.join(ROOT, 'src', 'db.js'), 'utf8');

test('the same event twice gives one row', async () => {
  const db = await openDb(':memory:');
  const ev = { channel: 'whatsapp', externalId: 'm1', name: 'A', body: 'hello' };
  const first = await receive(db, ev);
  const again = await receive(db, ev);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM inbound').get()).n, 1);
  assert.equal(again.duplicate, true, 'the second is reported as a repeat');
  assert.equal(again.id, first.id, 'and points at the row that is already there');
  await db.close();
});

test('the index is what holds it, not only the check above the insert', async () => {
  const db = await openDb(':memory:');
  await receive(db, { channel: 'whatsapp', externalId: 'm9', body: 'x' });
  // go round receive() entirely: the database itself must refuse
  await assert.rejects(
    async () => db.prepare(`INSERT INTO inbound (channel, external_id, received_at, surface_at, suggested, state)
      VALUES (?,?,?,?,?,?)`).run('whatsapp', 'm9', '2026-09-30T10:00:00Z', '2026-10-01T09:00:00Z', 'raw', 'new'),
    /UNIQUE|unique/i);
  await db.close();
});

test('a channel that sends no id of its own can still store rows', async () => {
  const db = await openDb(':memory:');
  await receive(db, { channel: 'in_person', body: 'walked in' });
  await receive(db, { channel: 'in_person', body: 'walked in again' });
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM inbound').get()).n, 2,
    'the index is partial, so two rows with no external id do not collide');
  await db.close();
});

test('the same id on a DIFFERENT channel is a different event', async () => {
  const db = await openDb(':memory:');
  await receive(db, { channel: 'whatsapp', externalId: 'same', body: 'a' });
  await receive(db, { channel: 'facebook', externalId: 'same', body: 'b' });
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM inbound').get()).n, 2);
  await db.close();
});

test('the index ships to Postgres too, from the one schema', () => {
  assert.match(DB, /CREATE UNIQUE INDEX IF NOT EXISTS inbound_channel_external\s*\n\s*ON inbound \(channel, external_id\) WHERE external_id IS NOT NULL;/);
  assert.match(pgSchemaSql(), /CREATE UNIQUE INDEX IF NOT EXISTS inbound_channel_external/,
    'the Postgres translation carries it');
});
