// Ritvars, 14.10.2026: "Lets for now, make only calls popup, who clicked number 1 for admissions or coordinator Laura"
// (button 2 is the Coordinator). Button 3 (Other) never pops up, in the open app or as a push; its calls still land.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { popsUp, callFeed } from '../src/callpop.js';
import { knock } from '../src/webpush.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('buttons 1 and 2 pop up, button 3 does not; a queue we cannot tell pops', () => {
  assert.equal(popsUp('1001*Q-ADMISSION'), true);
  assert.equal(popsUp('1001*Q-COORDINATORS'), true);
  assert.equal(popsUp('1001*Q-OTHER'), false);
  assert.equal(popsUp(null), true);
});

test('the open app is fed button 1 and 2 calls only', async () => {
  const db = await openDb(':memory:');
  const now = new Date('2026-10-14T10:00:00Z');
  const ins = db.prepare(`INSERT INTO call_events (call_id, event, at, queue, caller_num, operator, extension, source, received_at)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  for (const [id, q] of [['a', '1001*Q-ADMISSION'], ['b', '1001*Q-COORDINATORS'], ['c', '1001*Q-OTHER']]) {
    await ins.run(id, 'ringing', now.toISOString(), q, '+3712911122' + id.charCodeAt(0) % 10, null, null, 'provider', now.toISOString());
  }
  const feed = await callFeed(db, { after: 0, viewer: 'Laura', users: ['Laura', 'Ieva'], now });
  assert.deepEqual(feed.events.map((e) => e.callId), ['a', 'b']);
  assert.equal(feed.last, 3, 'the cursor still moves past the button 3 event');
});

test('no push knock for a button 3 call', async () => {
  const db = await openDb(':memory:');
  const env = { VAPID_PUBLIC_KEY: 'x', VAPID_PRIVATE_KEY: 'x', VAPID_SUBJECT: 'mailto:x@example.org' };
  let asked = 0;
  const r = await knock(db, { event: 'ringing', operator: null, queue: '1001*Q-OTHER' }, { env, users: [], fetchImpl: async () => { asked++; } });
  assert.equal(r.skipped, 'this button does not pop up');
  assert.equal(asked, 0);
});

test('it is written in config and in Help', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
  assert.deepEqual(['1', '2', '3'].map((k) => cfg.phoneMenu[k].popUp), [true, true, false]);
  assert.match(fs.readFileSync(path.join(ROOT, 'config', 'help.json'), 'utf8'), /button 3 call does not pop up/);
});

// Ritvars, 14.10.2026, "Yes, never pop": a number the phone filter sets aside (Not Admissions) never pops up.
import { receive, archive, bringBack } from '../src/intake.js';

async function oneRing(db, id, num, now) {
  await db.prepare(`INSERT INTO call_events (call_id, event, at, queue, caller_num, operator, extension, source, received_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(id, 'ringing', now.toISOString(), '1001*Q-ADMISSION', num, null, null, 'provider', now.toISOString());
  const top = await db.prepare('SELECT MAX(id) n FROM call_events').get();
  return Number(top.n) - 1;
}

test('a Not Admissions number never pops; Bring back makes it pop again; a person in Intake always pops', async () => {
  const db = await openDb(':memory:');
  const now = new Date('2026-10-14T10:00:00Z');
  const card = await receive(db, { channel: 'phone', externalId: 'c0', receivedAt: '2026-10-14T09:00:00Z', phone: '+37129111222',
    body: 'Incoming call', threadKey: 'phone:29111222', source: 'provider' });
  await archive(db, card.id, { reason: 'Not Admissions', by: 'Ieva' });
  const users = ['Laura', 'Ieva'];
  let after = await oneRing(db, 'r1', '29111222', now);
  assert.equal((await callFeed(db, { after, viewer: 'Ieva', users, now })).events.length, 0, 'set aside: no pop-up');
  const env = { VAPID_PUBLIC_KEY: 'x', VAPID_PRIVATE_KEY: 'x', VAPID_SUBJECT: 'mailto:x@example.org' };
  const k = await knock(db, { event: 'ringing', queue: '1001*Q-ADMISSION', callerNum: '+371 29 111 222' }, { env, users: [], fetchImpl: async () => {} });
  assert.equal(k.skipped, 'a number the phone filter sets aside');

  await bringBack(db, card.id, { by: 'Ieva', at: '2026-10-14T09:30:00Z' });
  after = await oneRing(db, 'r2', '29111222', now);
  assert.equal((await callFeed(db, { after, viewer: 'Ieva', users, now })).events.length, 1, 'brought back: it pops again');

  // set aside again, then the number becomes a person in Intake: a person always pops
  await archive(db, card.id, { reason: 'Not Admissions', by: 'Ieva' });
  await db.prepare(`INSERT INTO people (id, name, phone, status, owner, created_at) VALUES ('p1', 'Anna', '+37129111222', 'new', 'Ieva', '2026-10-14T09:40:00Z')`).run();
  after = await oneRing(db, 'r3', '29111222', now);
  const feed = await callFeed(db, { after, viewer: 'Ieva', users, now });
  assert.equal(feed.events.length, 1);
  assert.equal(feed.events[0].who.kind, 'person');
});
