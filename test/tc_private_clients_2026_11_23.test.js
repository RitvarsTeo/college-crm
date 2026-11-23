// PRIVATE CLIENTS (patch 166; his words "but there should be b2b and b2c client segments!", his pick "A: Private clients list").
// A Training Centre client who comes for themselves: their own record, never a fake company. Invented people only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from '../src/db.js';
import * as P from '../src/tcprivate.js';
import { ROOT } from './security_helpers.js';

test('add from a WhatsApp card: their own record with a WhatsApp line, no company, no Academy lead; the same number adds to the same person', async () => {
  const db = await openDb();
  const a = await P.add(db, { name: 'Peter Sample', phone: '+371 20 000 011', note: 'Is there BOSIET in January?', via: 'whatsapp' }, 'Laura');
  assert.equal(a.created, true);
  const one = await P.get(db, a.id);
  assert.deepEqual([one.client.name, one.client.cameFrom, one.client.owner, one.client.status], ['Peter Sample', 'WhatsApp', 'Laura', 'not_contacted']);
  assert.deepEqual([one.history[0].kind, one.history[0].body], ['whatsapp', 'WhatsApp from Peter Sample. Is there BOSIET in January?']);
  const b = await P.add(db, { name: 'Peter', phone: '20000011', note: 'And the price?', via: 'whatsapp' }, 'Laura');
  assert.deepEqual([b.id, b.created], [a.id, false], 'one number is one person');
  assert.equal((await P.get(db, a.id)).history.length, 2);
  assert.equal(Number((await db.prepare('SELECT COUNT(*) n FROM tc_companies').get()).n), 0, 'never a company');
  assert.equal(Number((await db.prepare('SELECT COUNT(*) n FROM people').get()).n), 0, 'never an Academy lead');
});

test('the list, a logged call with a next contact, a change of status as history lines, archive instead of delete', async () => {
  const db = await openDb();
  const { id } = await P.add(db, { name: 'Ilze Example', email: 'ilze@example.com', course: 'GWO BST' }, 'Laura');
  await P.log(db, id, { kind: 'call', day: '2026-11-23', body: 'Wants the February dates.', nextAt: '2026-12-01' }, 'Laura');
  await P.update(db, id, { status: 'contacted' }, 'Laura');
  const one = await P.get(db, id);
  assert.equal(one.client.nextAt, '2026-12-01');
  assert.deepEqual(one.history.map((h) => h.kind).sort(), ['call', 'edit', 'edit']);
  const L = await P.list(db);
  assert.deepEqual([L.rows.length, L.rows[0].name, L.rows[0].course], [1, 'Ilze Example', 'GWO BST']);
  await assert.rejects(P.log(db, id, { kind: 'fax' }, 'Laura'), P.PrivateError);
  await assert.rejects(P.update(db, id, { status: 'lost' }, 'Laura'), P.PrivateError);
  await assert.rejects(P.add(db, {}, 'Laura'), P.PrivateError);
  await P.archive(db, id, 'Laura');
  assert.equal((await P.list(db)).rows.length, 0);
  assert.equal(Number((await db.prepare('SELECT COUNT(*) n FROM tc_private_clients').get()).n), 1, 'archived, never deleted');
});

test('the page: Private clients under Clients, Make a lead asks B2B · company or B2C · private person, the routes sit behind the TC gate', () => {
  const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  assert.ok(APP.includes("['#/tc/private', 'private', 'Private clients']"));
  for (const s of ['>B2B · company<', '>B2C · private person<', 'function tcInboxPrivate(', 'async function viewTcPrivates(', 'async function viewTcPrivate(', '+ Private client', 'Make a lead · private person']) assert.ok(APP.includes(s), s);
  const srv = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
  const block = srv.indexOf('TRAINING CENTRE --');
  assert.ok(block > 0 && srv.indexOf("'/api/tc/private'") > block, 'inside the Training Centre block, behind the tc gate');
  assert.ok(!/DELETE FROM tc_private/.test(fs.readFileSync(path.join(ROOT, 'src', 'tcprivate.js'), 'utf8')));
});
