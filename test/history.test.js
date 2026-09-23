// Backlog 9, 10, 11, 12.
//
// The point of these tests is not that the code runs. It is that the four rules
// the owner decided on 23.09.2026 are the rules the code actually follows:
//   9  a person can be corrected, but not their source or their first contact
//   10 a manual action lands in the same log as an automatic one, labelled
//   11 an edit says which field, from what, to what, by whom, when
//   12 the whole log is admins only - and the admins are Aigars, Ritvars, Marina

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runScenario, runFullDemo } from '../src/simulator.js';
import {
  logEvent, applyEdit, readHistory, MANUAL, AUTOMATIC,
  EDITABLE_FIELDS, IMMUTABLE_FIELDS,
} from '../src/history.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));

function withPerson(db, over = {}) {
  const now = new Date().toISOString();
  const p = {
    id: 'p1', name: 'Anna Bērziņa', email: 'anna@example.lv', phone: '29111222',
    programme: 'NAV', study_form: 'Full time', education: 'Secondary school',
    status: 'New', owner: 'Admissions', source_channel: 'website',
    source_campaign: 'autumn-2026', source_detail: 'apply page',
    created_at: now, last_contact_at: now, notes: null, ...over,
  };
  db.prepare(`INSERT INTO people (id,name,email,phone,programme,study_form,education,status,owner,
    source_channel,source_campaign,source_detail,created_at,last_contact_at,notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    p.id, p.name, p.email, p.phone, p.programme, p.study_form, p.education, p.status, p.owner,
    p.source_channel, p.source_campaign, p.source_detail, p.created_at, p.last_contact_at, p.notes);
  return p;
}

// ------------------------------------------------------- 9: the field policy --

test('the editable list is exactly what was decided on 23.09.2026', () => {
  assert.deepEqual(EDITABLE_FIELDS, CONFIG.editPolicy.editable);
  for (const locked of CONFIG.editPolicy.locked) {
    assert.ok(IMMUTABLE_FIELDS[locked], locked + ' must be named as locked, with a reason');
  }
});

test('the source and the first contact date are refused by name, not ignored', () => {
  const db = openDb();
  withPerson(db);
  for (const field of ['source_channel', 'source_campaign', 'source_detail', 'created_at']) {
    const r = applyEdit(db, 'p1', { [field]: 'something else' }, 'Admissions', new Date().toISOString());
    assert.equal(r.field, field);
    assert.match(r.error, new RegExp(field + ' cannot be edited'));
    assert.ok(r.error.length > field.length + 20, 'the refusal says why');
  }
});

test('a refused edit changes nothing at all, not even the fields it could have changed', () => {
  const db = openDb();
  const before = withPerson(db);
  const r = applyEdit(db, 'p1', { programme: 'ENG', source_channel: 'phone' }, 'Admissions', new Date().toISOString());
  assert.ok(r.error);
  const after = db.prepare('SELECT * FROM people WHERE id = ?').get('p1');
  assert.equal(after.programme, before.programme, 'the legal half must not sneak through');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM events').get().n, 0);
});

test('a field nobody has heard of is refused rather than written', () => {
  const db = openDb();
  withPerson(db);
  const r = applyEdit(db, 'p1', { salary: '1000' }, 'Admissions', new Date().toISOString());
  assert.equal(r.field, 'salary');
  assert.match(r.error, /not an editable field/);
});

test('an editable field really is editable, and every one of them', () => {
  const db = openDb();
  withPerson(db);
  const values = {
    name: 'Anna Ozola', email: 'a.ozola@example.lv', phone: '29333444', programme: 'ENG',
    study_form: 'Part time', education: 'Maritime school', owner: 'Student Coordinator', notes: 'called the parents',
  };
  const r = applyEdit(db, 'p1', values, 'Admissions', new Date().toISOString());
  assert.equal(r.changes.length, EDITABLE_FIELDS.length);
  const after = db.prepare('SELECT * FROM people WHERE id = ?').get('p1');
  for (const [k, v] of Object.entries(values)) assert.equal(after[k], v, k + ' was not written');
});

test('the name cannot be emptied, because then the record has no handle', () => {
  const db = openDb();
  withPerson(db);
  const r = applyEdit(db, 'p1', { name: '' }, 'Admissions', new Date().toISOString());
  assert.match(r.error, /name cannot be emptied/);
  assert.equal(db.prepare('SELECT name FROM people WHERE id = ?').get('p1').name, 'Anna Bērziņa');
});

test('setting a field to what it already is writes no history at all', () => {
  const db = openDb();
  withPerson(db);
  const r = applyEdit(db, 'p1', { programme: 'NAV', email: 'anna@example.lv' }, 'Admissions', new Date().toISOString());
  assert.deepEqual(r.changes, []);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM events').get().n, 0, 'a no-op is not an event');
});

// -------------------------------------------------- 11: what an edit records --

test('an edit records the field, the old value, the new value, who and when', () => {
  const db = openDb();
  withPerson(db);
  const at = '2026-09-23T09:15:00.000Z';
  applyEdit(db, 'p1', { programme: 'ENG' }, 'Marina', at);
  const e = db.prepare("SELECT * FROM events WHERE kind = 'edit'").get();
  assert.equal(e.field, 'programme');
  assert.equal(e.old_value, 'NAV');
  assert.equal(e.new_value, 'ENG');
  assert.equal(e.actor, 'Marina');
  assert.equal(e.occurred_at, at);
  assert.equal(e.origin, MANUAL);
});

test('two fields changed at once are two entries, not one lump', () => {
  const db = openDb();
  withPerson(db);
  applyEdit(db, 'p1', { programme: 'ENG', owner: 'Other' }, 'Aigars', new Date().toISOString());
  const rows = db.prepare("SELECT field FROM events WHERE kind = 'edit' ORDER BY field").all();
  assert.deepEqual(rows.map((r) => r.field), ['owner', 'programme']);
});

test('filling an empty field is recorded as coming from empty, not from nothing', () => {
  const db = openDb();
  withPerson(db, { notes: null });
  applyEdit(db, 'p1', { notes: 'first call done' }, 'Ritvars', new Date().toISOString());
  const e = db.prepare("SELECT * FROM events WHERE field = 'notes'").get();
  assert.equal(e.old_value, null);
  assert.equal(e.new_value, 'first call done');
  assert.match(e.body, /-> first call done/);
});

// ----------------------------------------------- 10: one log, two origins --

test('logEvent refuses to write an event that does not say where it came from', () => {
  const db = openDb();
  withPerson(db);
  assert.throws(() => logEvent(db, { personId: 'p1', kind: 'note', at: 'x' }), /origin is required/);
  assert.throws(() => logEvent(db, { personId: 'p1', kind: 'note', at: 'x', origin: 'maybe' }), /unknown origin/);
});

test('a manual action and an automatic one land in the same log, each labelled', () => {
  const db = openDb();
  withPerson(db);
  logEvent(db, { personId: 'p1', kind: 'call', at: '2026-09-23T10:00:00.000Z', origin: MANUAL, actor: 'Admissions', subject: 'Call: answered' });
  logEvent(db, { personId: 'p1', kind: 'channel', at: '2026-09-23T11:00:00.000Z', origin: AUTOMATIC, actor: 'Mailchimp', subject: 'Opened the campaign email' });
  const h = readHistory(db);
  assert.equal(h.count, 2);
  assert.deepEqual(h.rows.map((r) => r.origin), [AUTOMATIC, MANUAL], 'newest first');
  assert.equal(readHistory(db, { origin: MANUAL }).count, 1);
  assert.equal(readHistory(db, { origin: AUTOMATIC }).count, 1);
});

test('the walk-in desk and the phone log are manual, and carry who typed them', () => {
  const db = openDb();
  for (const [channelId, scenario] of [['klatiene', 'walk_in'], ['phone', 'log']]) {
    const r = runScenario(db, channelId, scenario);
    const rows = readHistory(db, { personId: r.personId, origin: MANUAL }).rows
      .filter((x) => x.kind !== 'integration');
    assert.ok(rows.length, channelId + ' must produce a manual entry');
    // The typist is a PERSON, never a role. "Admissions" owns the record; Ieva
    // is the one who typed it. Locked 23.09.2026.
    const people = CONFIG.users.map((u) => u.name);
    assert.ok(people.includes(rows[0].actor), channelId + ' must carry a person, got ' + rows[0].actor);
    assert.ok(!CONFIG.owners.includes(rows[0].actor), channelId + ' must not record a role as the actor');
  }
});

test('a digital channel is automatic, even when it arrives through the same door', () => {
  const db = openDb();
  const r = runScenario(db, 'klatiene', 'qr');
  const manual = readHistory(db, { personId: r.personId, origin: MANUAL }).rows.filter((x) => x.kind !== 'integration');
  assert.equal(manual.length, 0, 'the QR path is digital: nobody typed it');
});

test('the integration log and the person log are read as one list', () => {
  const db = openDb();
  runFullDemo(db);
  const h = readHistory(db, { limit: 1000 });
  const sources = new Set(h.rows.map((r) => r.source));
  assert.ok(sources.has('person history'), 'person events are in the list');
  assert.ok(sources.has('integration log'), 'integration events are in the list');
  for (const r of h.rows) assert.ok([MANUAL, AUTOMATIC].includes(r.origin), 'every line says where it came from');
});

test('the log stays in time order once both sources are mixed together', () => {
  const db = openDb();
  runFullDemo(db);
  const rows = readHistory(db, { limit: 1000 }).rows;
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i - 1].at >= rows[i].at, 'entry ' + i + ' is out of order');
  }
});

test('adding a person by hand leaves a trace in the log', () => {
  const db = openDb();
  withPerson(db);
  logEvent(db, { personId: 'p1', kind: 'create', at: new Date().toISOString(), origin: MANUAL,
    actor: 'Admissions', subject: 'Added manually' });
  const rows = readHistory(db, { origin: MANUAL }).rows;
  assert.equal(rows[0].kind, 'create');
  assert.equal(rows[0].personName, 'Anna Bērziņa');
});

// ------------------------------------------------------ 12: who may read it --

test('the admins are Aigars, Ritvars and Marina, and nobody from the admissions roles', () => {
  assert.deepEqual(CONFIG.admins, ['Aigars', 'Ritvars', 'Marina']);
  for (const role of CONFIG.owners) {
    assert.ok(!CONFIG.admins.includes(role), role + ' must not be an admin');
  }
  for (const person of Object.values(CONFIG._ownerPeople)) {
    if (typeof person !== 'string' || person.length > 40) continue;
    assert.ok(!CONFIG.admins.includes(person), person + ' holds a role and must not be an admin');
  }
});

test('the owner of a record is a ROLE, never a person', () => {
  // A person's name now appears legitimately - the "Acting as" picker lists real
  // users. What must never happen is a PERSON being offered as the owner of a
  // record, so the rule is asserted where it actually lives, not by scanning the
  // file for a first name (which trips on a code comment).
  const html = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  assert.match(html, /Owner \(a role, not a person\)/, 'the owner field says what it is');
  assert.match(html, /\(CFG\.owners\|\|\[\]\)\.map/, 'and it is populated from the ROLE list');
  for (const u of CONFIG.users) {
    assert.ok(!CONFIG.owners.includes(u.name), u.name + ' must not be selectable as an owner');
  }
  assert.ok(CONFIG.owners.includes('Admissions'), 'Admissions is a role and is');
});

test('the prototype does not pretend the admin rule is enforced', () => {
  assert.ok(CONFIG.historyHonesty, 'the honest wording has to exist');
  assert.match(CONFIG.historyHonesty, /no login/i);
  assert.match(CONFIG.historyHonesty, /not a check|not enforced/i);
});

// ----------------------------------------------------- the demo must survive --

test('the whole demo loop still works: empty, run, inspect, clear', () => {
  const db = openDb();
  assert.equal(db.prepare('SELECT COUNT(*) n FROM people').get().n, 0);
  assert.equal(readHistory(db).count, 0);
  runFullDemo(db);
  assert.ok(db.prepare('SELECT COUNT(*) n FROM people').get().n > 0);
  assert.ok(readHistory(db).count > 0);
  db.exec(`DELETE FROM events; DELETE FROM tasks; DELETE FROM documents;
           DELETE FROM registrations; DELETE FROM open_days; DELETE FROM consents;
           DELETE FROM sim_events; DELETE FROM people;`);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM people').get().n, 0);
  assert.equal(readHistory(db).count, 0, 'clearing the database clears the log with it');
  runFullDemo(db);
  assert.ok(readHistory(db).count > 0, 'and it all works a second time');
});

test('an edit on a person written by an integration is still refused on the source', () => {
  const db = openDb();
  const r = runScenario(db, 'website_form', 'new_lead');
  const bad = applyEdit(db, r.personId, { source_channel: 'phone' }, 'Marina', new Date().toISOString());
  assert.match(bad.error, /cannot be edited/);
  const ok = applyEdit(db, r.personId, { owner: 'Other' }, 'Marina', new Date().toISOString());
  assert.equal(ok.changes.length, 1);
});

// ------------------------- 12b: own actions only, decided 23.09.2026 --------
//
// An admin sees the whole log. Anybody else sees the history of their OWN
// actions - not nothing, and not everybody's.

test('a non-admin sees their own actions and nobody else\'s', () => {
  const db = openDb();
  withPerson(db);
  const t = (n) => `2026-09-23T1${n}:00:00.000Z`;
  logEvent(db, { personId: 'p1', kind: 'call', at: t(0), origin: MANUAL, actor: 'Admissions', subject: 'Call: answered' });
  logEvent(db, { personId: 'p1', kind: 'note', at: t(1), origin: MANUAL, actor: 'Student Coordinator', subject: 'Note from the coordinator' });
  logEvent(db, { personId: 'p1', kind: 'channel', at: t(2), origin: AUTOMATIC, actor: 'Mailchimp', subject: 'Opened the campaign email' });

  const mine = readHistory(db, { actor: 'Admissions' });
  assert.equal(mine.count, 1, 'one entry, the one done under my name');
  assert.equal(mine.rows[0].subject, 'Call: answered');

  const theirs = readHistory(db, { actor: 'Student Coordinator' });
  assert.equal(theirs.count, 1);
  assert.equal(theirs.rows[0].subject, 'Note from the coordinator');

  assert.equal(readHistory(db).count, 3, 'an admin still sees all three');
});

test('an automatic event is not anybody\'s own action', () => {
  const db = openDb();
  withPerson(db);
  logEvent(db, { personId: 'p1', kind: 'channel', at: '2026-09-23T10:00:00.000Z',
    origin: AUTOMATIC, actor: 'CRM', subject: 'Status: New -> Contacted' });
  for (const role of CONFIG.owners) {
    assert.equal(readHistory(db, { actor: role }).count, 0, role + ' must not own an automatic event');
  }
  assert.equal(readHistory(db).count, 1, 'but it is in the full log');
});

test('my own edits are in my own history, with the old and new values', () => {
  const db = openDb();
  withPerson(db);
  applyEdit(db, 'p1', { programme: 'ENG' }, 'Admissions', '2026-09-23T10:00:00.000Z');
  applyEdit(db, 'p1', { owner: 'Other' }, 'Student Coordinator', '2026-09-23T11:00:00.000Z');
  const mine = readHistory(db, { actor: 'Admissions' });
  assert.equal(mine.count, 1);
  assert.equal(mine.rows[0].field, 'programme');
  assert.equal(mine.rows[0].oldValue, 'NAV');
  assert.equal(mine.rows[0].newValue, 'ENG');
});

test('the own-actions filter is a filter, not a hole: a name nobody used shows nothing', () => {
  const db = openDb();
  withPerson(db);
  logEvent(db, { personId: 'p1', kind: 'call', at: '2026-09-23T10:00:00.000Z', origin: MANUAL, actor: 'Admissions', subject: 'Call' });
  assert.equal(readHistory(db, { actor: 'Nobody At All' }).count, 0);
  assert.equal(readHistory(db, { actor: 'Admissions' }).count, 1, 'and the real name does find it');
});
