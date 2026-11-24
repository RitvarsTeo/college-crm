// PHONE EXTENSIONS -> PEOPLE (patch 184, the owner 24.11.2026: "cant we just match the buttons of phone to the names? you know this
// already."). TeleGroup names the line (206 "Student communication"); an admin says who answers it, fixable in the app with history.
// Invented people and numbers only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import * as ext from '../src/phoneext.js';
import { receivePhoneEvent } from '../src/phoneevent.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const NOW = new Date('2026-11-24T10:00:00Z');
const tg = (type, id, extra = {}) => ({ type, uniqueid: id, date: '2026-11-24 12:00:00', queue: '1001*Q-ADMISSION', caller_num: '+37120000001', ...extra });
const call = async (db, id, { num = '206', name = 'Student communication', answered = true } = {}) => {
  await receivePhoneEvent(db, tg('join_queue', id), { mode: 'live', now: NOW });
  if (answered) await receivePhoneEvent(db, tg('dial_connected', id, { destination_num: num, destination_name: name }), { mode: 'live', now: NOW });
  await receivePhoneEvent(db, tg(answered ? 'status_hangup' : 'missed', id, { destination_num: num, destination_name: name }), { mode: 'live', now: NOW });
  return db.prepare('SELECT operator_name, picked_up FROM pbx_calls WHERE uniqueid = ?').get(id);
};

test('an extension nobody set shows the line name, as before', async () => {
  const db = await openDb(':memory:');
  const c = await call(db, 'c1');
  assert.equal(c.operator_name, 'Student communication');
});

test('an extension with a person: the answered call is that person\'s; a missed call has nobody', async () => {
  const db = await openDb(':memory:');
  await ext.setExtension(db, { extension: '206', person: 'Example Person', by: 'Admin One', at: NOW.toISOString() });
  assert.equal((await call(db, 'c2')).operator_name, 'Example Person');
  const missed = await call(db, 'c3', { answered: false });
  assert.equal(missed.operator_name, null);
  assert.equal(await ext.personFor(db, ' 206 '), 'Example Person');
});

test('fixable in the app with history: change, clear (several people), and no line when nothing changes', async () => {
  const db = await openDb(':memory:');
  await call(db, 'c4');
  await ext.setExtension(db, { extension: '206', person: 'Example Person', by: 'Admin One', at: '2026-11-24T10:00:00Z' });
  assert.equal((await ext.setExtension(db, { extension: '206', person: ' Example  Person ', by: 'Admin One' })).changed, false);
  await ext.setExtension(db, { extension: '206', person: '', by: 'Admin Two', at: '2026-11-24T11:00:00Z' });
  const [row] = await ext.listExtensions(db);
  assert.equal(row.extension, '206');
  assert.equal(row.line, 'Student communication');
  assert.equal(row.person, null, 'several people: the line name shows');
  assert.equal(row.calls, 1);
  assert.deepEqual(row.history.map((h) => [h.from, h.to, h.by]), [['Example Person', null, 'Admin Two'], [null, 'Example Person', 'Admin One']]);
  assert.equal((await call(db, 'c5')).operator_name, 'Student communication');
  await assert.rejects(ext.setExtension(db, { extension: '  ', person: 'X', by: 'A' }), /Which extension/);
});

test('the back-fill plan: answered calls on a set extension whose operator is still the line', async () => {
  const db = await openDb(':memory:');
  await call(db, 'c6');
  await call(db, 'c7', { num: '202', name: 'Admission' });
  await call(db, 'c8', { answered: false });
  await ext.setExtension(db, { extension: '206', person: 'Example Person', by: 'Admin One' });
  const plan = await ext.backfillPlan(db);
  assert.deepEqual(plan.map((r) => [r.uniqueid, r.operator_name, r.person_name]), [['c6', 'Student communication', 'Example Person']]);
});

test('the route is admins only, the page is in the admin group, and the page escapes what it draws', () => {
  const srv = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
  const at = srv.indexOf("p === '/api/admin/phone-extensions'");
  assert.ok(at > 0);
  assert.match(srv.slice(at, at + 400), /const me = await adminOf\(req\);\s*if \(!me\) return json\(res, 403/);
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  assert.match(app, /<a href="#\/phone-ext"[^>]*>Phone extensions<\/a>/);
  const v = app.slice(app.indexOf('async function viewPhoneExt('), app.indexOf('async function pxSave('));
  assert.match(v, /if \(!isAdmin\(\)\)/);
  for (const f of ['x.extension', 'x.line', 'x.person', 'h.by', 'n']) assert.ok(v.includes('esc(' + f), 'escaped: ' + f);
});
