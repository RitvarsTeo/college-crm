// The V1 intake flow: inbound -> machine filter -> intake -> human qualification
// -> a person qualifies -> lead -> Admissions -> application -> admitted -> SIS.
//
// Nothing here touches a provider.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { QUEUES as PBX_QUEUES } from '../lib/pbx.js';
import { extractFrom } from '../src/extract.js';
import {
  receive, listInbound, qualify, archive, funnel, agedCount,
  handoffToSis, ownerFor, notifiedFor, canReach, handoverGap, surfaceAt,
  waitingFor, waitingByRole, personCanReach, whoCanReach,
} from '../src/intake.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));

const HI = 'Hi';
const FULL = "Hi, I'm interested in studying Navigation. I finished secondary school and want to start next year. Can you tell me the price?";
const PARTIAL = "Hi, I'm interested in studying Navigation. Can you give me more information?";

// -------------------------------------------- the machine reads, never invents --

test('the machine answers one question: did they say what they want to study', () => {
  assert.equal(extractFrom({ channel: 'instagram', text: HI }).suggested, 'unclear');
  assert.equal(extractFrom({ channel: 'instagram', text: FULL }).suggested, 'lead');
  assert.equal(extractFrom({ channel: 'instagram', text: PARTIAL }).suggested, 'lead',
    'they named a programme, so it is Admissions work even though the rest is missing');
});

test('a question about documents is Admissions work, not marketing work', () => {
  // the rule the first review corrected: a confirmed interest IS a lead
  const r = extractFrom({ channel: 'linkedin',
    text: 'I am looking at marine engineering. Which documents do I need to apply?' });
  assert.equal(r.suggested, 'lead');
  assert.equal(ownerFor(r.suggested), 'Admissions');
});

test('obvious sales pitches never reach the queue', () => {
  const db = openDb();
  const r = receive(db, { channel: 'instagram', externalId: 'junk1',
    body: 'Hello, we offer social media promotion services, 5000 followers guaranteed' });
  assert.equal(r.filtered, true);
  assert.equal(listInbound(db, { state: 'new' }).length, 0, 'it must not cost anybody a second');
  const row = db.prepare('SELECT * FROM inbound WHERE id = ?').get(r.id);
  assert.equal(row.state, 'filtered');
  assert.equal(row.body, null, 'and the body goes with it');
  assert.equal(row.contact_name, null);
  assert.ok(db.prepare('SELECT COUNT(*) n FROM inbound').get().n === 1, 'but it IS still stored');
});

test('a plain "Hi" from a real person is NOT junk and does reach the queue', () => {
  const db = openDb();
  const r = receive(db, { channel: 'instagram', body: HI, name: 'Ahmed Muhamed', externalId: 'hi1' });
  assert.equal(r.filtered, false);
  assert.equal(listInbound(db, { state: 'new' }).length, 1,
    'a person saying hello might be a student; only sales pitches are filtered');
});

test('"Hi" produces NO fields at all, rather than a plausible guess', () => {
  const r = extractFrom({ channel: 'instagram', text: HI });
  assert.deepEqual(r.fields, [], 'nothing was said, so nothing may be recorded');
  assert.ok(r.missing.includes('interest'));
  assert.match(r.why, /nothing about studying was mentioned/);
});

test('everything the machine reads is marked extracted, never as fact', () => {
  const r = extractFrom({ channel: 'instagram', text: FULL });
  assert.ok(r.fields.length >= 4);
  for (const f of r.fields) assert.equal(f.provenance, 'extracted');
});

test('what the provider itself supplied is provider, not extracted', () => {
  const r = extractFrom({ channel: 'whatsapp', text: HI, provided: { phone: '+37129111222' } });
  const phone = r.fields.find((f) => f.field === 'phone');
  assert.equal(phone.provenance, 'provider');
});

test('an incomplete message is not blocked, it names what is missing', () => {
  const r = extractFrom({ channel: 'facebook', text: PARTIAL });
  assert.equal(r.suggested, 'lead');
  assert.ok(r.fields.some((f) => f.field === 'interest' && f.value === 'NAV'));
  for (const gap of ['start', 'education']) assert.ok(r.missing.includes(gap), 'must name ' + gap);
});

// ----------------------------------------------------------------- the ageing --

test('inbound Monday 21:30 surfaces Tuesday at 09:00 local', () => {
  // 2026-09-21 is a Monday. 21:30 Riga in September is UTC+3, so 18:30Z.
  const out = surfaceAt('2026-09-21T18:30:00.000Z');
  const local = new Intl.DateTimeFormat('en-CA', {
    timeZone: CONFIG.ageing.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(out));
  assert.match(local, /2026-09-22/, 'the next calendar day');
  assert.match(local, /09:00/, 'at 09:00 local, not 09:00 UTC');
});

test('the rule holds across the summer time boundary', () => {
  for (const iso of ['2026-01-15T20:30:00.000Z', '2026-07-15T20:30:00.000Z']) {
    const local = new Intl.DateTimeFormat('en-CA', {
      timeZone: CONFIG.ageing.timezone, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(surfaceAt(iso)));
    assert.match(local, /09:00/, iso + ' must still surface at 09:00 local');
  }
});

test('a contact that arrived yesterday is aged today, one that just arrived is not', () => {
  const db = openDb();
  receive(db, { channel: 'instagram', body: HI, name: 'Old', externalId: 'a',
    receivedAt: new Date(Date.now() - 40 * 3600000).toISOString() });
  receive(db, { channel: 'instagram', body: HI, name: 'New', externalId: 'b' });
  assert.equal(agedCount(db), 1);
  const rows = listInbound(db);
  assert.equal(rows.filter((r) => r.aged).length, 1);
  assert.equal(rows.find((r) => r.aged).contact_name, 'Old');
});

// -------------------------------------------------------------- the routing --

test('routing keeps the unclear ones with Marketing and sends every lead to Admissions', () => {
  assert.equal(ownerFor('unclear'), 'Marketing');
  assert.equal(ownerFor('lead'), 'Admissions');
});

test('neither dangerous extreme is possible: not everything to Ieva, not everything stuck with Tetiana', () => {
  const owners = new Set(CONFIG.qualification.levels.map((l) => ownerFor(l.id)));
  assert.ok(owners.size > 1, 'if every level routed to one role, one of the two extremes is built in');
  assert.ok(owners.has('Admissions'), 'something has to reach Admissions');
  assert.ok(owners.has('Marketing'), 'and something has to stay on the marketing side');
});

test('Admissions is notified for a lead and never for an unclear contact', () => {
  assert.deepEqual(notifiedFor('unclear'), ['Marketing']);
  assert.deepEqual(notifiedFor('lead'), ['Admissions']);
  assert.ok(!notifiedFor('unclear').includes('Admissions'));
});

test('what is waiting is counted per role, and an admin sees every role', () => {
  const db = openDb();
  const r = receive(db, { channel: 'instagram', body: HI, name: 'Somebody', externalId: 'w1' });
  const r2 = receive(db, { channel: 'instagram', body: FULL, name: 'Lead', externalId: 'w2' });
  qualify(db, r2.id, { qualification: 'lead', createPerson: true, by: 'Tetiana', confirmFields: ['interest'] });

  const marketing = waitingFor(db, 'Marketing');
  const admissions = waitingFor(db, 'Admissions');
  assert.equal(marketing.intake, 1, 'the unqualified one waits with Marketing');
  assert.equal(admissions.intake, 0, 'Admissions is never shown the intake queue');
  assert.equal(admissions.leads, 1, 'and does get the lead');

  const all = waitingByRole(db);
  assert.ok(all.some((x) => x.role === 'Marketing'));
  assert.ok(all.some((x) => x.role === 'Admissions'));
});

// ------------------------------------- the bridge: Ieva has no social channels --

test('the access matrix is exactly the one that was confirmed', () => {
  // per person, because no role-shaped model can say "everybody except Tetiana"
  const expected = {
    facebook:  ['Tetiana', 'Ieva', 'Laura', 'Marina'],
    instagram: ['Tetiana', 'Ieva', 'Laura', 'Marina'],
    whatsapp:  ['Ieva', 'Laura', 'Marina'],
    linkedin:  ['Tetiana'],
    tiktok:    ['Tetiana'],
  };
  for (const [channel, people] of Object.entries(expected)) {
    assert.deepEqual(whoCanReach(channel).sort(), people.slice().sort(), channel + ' access is wrong');
  }
});

test('Tetiana does NOT have WhatsApp, which no role model could express', () => {
  assert.equal(personCanReach('Tetiana', 'whatsapp'), false);
  for (const who of ['Ieva', 'Laura', 'Marina']) {
    assert.equal(personCanReach(who, 'whatsapp'), true, who + ' does have WhatsApp');
  }
  // and the derived role answer follows the people, rather than being written twice
  assert.equal(canReach('Marketing', 'whatsapp'), false, 'the only Marketing person has no WhatsApp');
  assert.equal(canReach('Admissions', 'whatsapp'), true);
});

test('LinkedIn and TikTok are Tetiana alone', () => {
  for (const ch of ['linkedin', 'tiktok']) {
    assert.deepEqual(whoCanReach(ch), ['Tetiana']);
    assert.equal(canReach('Admissions', ch), false, 'Ieva must not be assumed to have ' + ch);
    assert.equal(canReach('Student Coordinator', ch), false);
  }
});

test('a role reaches a channel when any of its people can', () => {
  for (const ch of ['facebook', 'instagram']) {
    for (const role of ['Marketing', 'Admissions', 'Student Coordinator']) {
      assert.equal(canReach(role, ch), true, role + ' works ' + ch + ' through the shared inbox');
    }
  }
  assert.match(CONFIG.channelAccess._roleAccessIsDerived, /Never write a role list by hand/i);
});

test('the handover gap names who can actually bridge it', () => {
  const gap = handoverGap({ role: 'Admissions', channel: 'linkedin' });
  assert.deepEqual(gap.bridges, ['Tetiana']);
  assert.match(gap.action, /Ask Tetiana/);
});

test('the phone menu matches the queues the call logger keeps', () => {
  const menu = CONFIG.phoneMenu;
  assert.equal(menu['1'].role, 'Admissions');
  assert.equal(menu['2'].role, 'Student Coordinator');
  assert.equal(menu['3'].role, 'Other');
  assert.deepEqual(menu['3'].handledBy, ['Tetiana', 'Arina']);
  for (const k of ['1', '2', '3']) {
    assert.ok(PBX_QUEUES.includes(menu[k].queue), 'button ' + k + ' points at a queue the logger drops');
  }
});

test('Arina is a CRM user, because she answers a phone queue', () => {
  const arina = CONFIG.users.find((u) => u.name === 'Arina');
  assert.ok(arina, 'she answers button 3 and must exist');
  assert.equal(arina.title, 'Internship Coordinator');
  assert.ok(CONFIG.owners.includes(arina.role));
});

test('a lead from a shared channel needs no handover gap', () => {
  for (const channel of ['instagram', 'facebook', 'whatsapp']) {
    assert.equal(handoverGap({ role: 'Admissions', channel, email: null, phone: null }), null,
      'Admissions can open ' + channel + ' themselves');
  }
});

test('a lead from a Marketing-only channel with no email or phone raises a handover gap', () => {
  for (const channel of ['linkedin', 'tiktok']) {
    const gap = handoverGap({ role: 'Admissions', channel, email: null, phone: null });
    assert.ok(gap, channel + ' is Tetiana only, so this is a crack');
    assert.match(gap.problem, new RegExp('no access to ' + channel));
    assert.ok(gap.action.length > 10, 'and it must say what to do about it');
  }
});

test('the same lead with a phone has no gap, because Admissions can ring them', () => {
  assert.equal(handoverGap({ role: 'Admissions', channel: 'linkedin', phone: '+37129111222' }), null);
  assert.equal(handoverGap({ role: 'Admissions', channel: 'tiktok', email: 'a@b.lv' }), null);
});

test('a gap does not block promotion, it flags it', () => {
  const db = openDb();
  const r = receive(db, { channel: 'linkedin', body: FULL, name: 'Ahmed Muhamed', externalId: 'x1' });
  const q = qualify(db, r.id, { qualification: 'lead', createPerson: true, by: 'Tetiana',
    confirmFields: ['interest', 'start', 'education', 'question'] });
  assert.equal(q.ok, true, 'the lead is NOT lost');
  assert.equal(q.qualification, 'lead');
  assert.ok(q.handoverGap, 'but the gap is raised');
});

// -------------------------------------------------- nothing becomes a lead alone --

test('arriving creates an inbound row and NO person', () => {
  const db = openDb();
  receive(db, { channel: 'instagram', body: FULL, name: 'Somebody', externalId: 'y1' });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM inbound').get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM people').get().n, 0,
    'even a hot-looking message must not create a lead by itself');
});

test('an exact repeat of the same provider message is not stored twice', () => {
  const db = openDb();
  const a = receive(db, { channel: 'facebook', body: HI, externalId: 'dup-1' });
  const b = receive(db, { channel: 'facebook', body: HI, externalId: 'dup-1' });
  assert.equal(b.duplicate, true);
  assert.equal(b.id, a.id);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM inbound').get().n, 1);
});

test('qualifying needs a person, a level and a name to put on it', () => {
  const db = openDb();
  const r = receive(db, { channel: 'instagram', body: HI, externalId: 'z1' });
  assert.match(qualify(db, r.id, { qualification: 'lead', by: 'Tetiana' }).error, /create one/);
  assert.match(qualify(db, r.id, { qualification: 'molten', createPerson: true, by: 'T' }).error, /unknown qualification/);
  assert.match(qualify(db, r.id, { qualification: 'lead', createPerson: true }).error, /who is qualifying/);
});

test('an item cannot be dealt with twice', () => {
  const db = openDb();
  const r = receive(db, { channel: 'instagram', body: HI, externalId: 'z2' });
  qualify(db, r.id, { qualification: 'unclear', createPerson: true, by: 'Tetiana' });
  assert.match(qualify(db, r.id, { qualification: 'lead', createPerson: true, by: 'Tetiana' }).error, /already/);
  assert.match(archive(db, r.id, { reason: 'Spam', by: 'Tetiana' }).error, /already/);
});

// --------------------------------------------------- the message body lifecycle --

test('the body is deleted on qualification and the structured record survives', () => {
  const db = openDb();
  const r = receive(db, { channel: 'instagram', body: FULL, name: 'Liene', externalId: 'b1' });
  assert.ok(db.prepare('SELECT body FROM inbound WHERE id = ?').get(r.id).body, 'it is there while qualifying');

  qualify(db, r.id, { qualification: 'lead', createPerson: true, by: 'Tetiana',
    confirmFields: ['interest', 'education'] });

  const row = db.prepare('SELECT * FROM inbound WHERE id = ?').get(r.id);
  assert.equal(row.body, null, 'the body is gone');
  assert.ok(row.body_deleted_at, 'and when it went is recorded');
  const kept = db.prepare('SELECT * FROM field_values WHERE inbound_id = ? AND person_id IS NOT NULL').all(r.id);
  assert.ok(kept.length >= 4, 'the extracted facts survive the deletion');
});

test('the body is deleted on archive too, and the row is kept forever', () => {
  const db = openDb();
  const r = receive(db, { channel: 'instagram', body: 'hello there', name: 'Spam', externalId: 'b2' });
  archive(db, r.id, { reason: 'Spam', by: 'Tetiana' });
  const row = db.prepare('SELECT * FROM inbound WHERE id = ?').get(r.id);
  assert.equal(row.body, null);
  assert.equal(row.state, 'archived');
  assert.equal(row.archive_reason, 'Spam');
  assert.equal(row.contact_name, 'Spam', 'archived is not deleted: the contact is still findable');
});

test('archiving needs a reason, and "Other" needs an explanation', () => {
  const db = openDb();
  const r = receive(db, { channel: 'instagram', body: HI, externalId: 'b3' });
  assert.match(archive(db, r.id, { by: 'Tetiana' }).error, /reason is required/);
  assert.match(archive(db, r.id, { reason: 'Other', by: 'Tetiana' }).error, /needs an explanation/);
  assert.equal(archive(db, r.id, { reason: 'Other', note: 'a supplier', by: 'Tetiana' }).ok, true);
});

// ------------------------------------------- confirmation makes data authoritative --

test('only a confirmed field becomes real CRM data', () => {
  const db = openDb();
  const r = receive(db, { channel: 'instagram', body: FULL, name: 'Liene', externalId: 'c1' });
  const q = qualify(db, r.id, { qualification: 'lead', createPerson: true, by: 'Tetiana',
    confirmFields: ['interest'] });          // education deliberately NOT confirmed

  const fields = db.prepare('SELECT * FROM field_values WHERE person_id = ?').all(q.personId);
  const interest = fields.find((f) => f.field === 'interest');
  const education = fields.find((f) => f.field === 'education');
  assert.equal(interest.provenance, 'confirmed');
  assert.equal(interest.confirmed_by, 'Tetiana');
  assert.equal(education.provenance, 'extracted', 'unconfirmed stays a suggestion');

  const person = db.prepare('SELECT * FROM people WHERE id = ?').get(q.personId);
  assert.equal(person.programme, 'NAV', 'the confirmed one reached the record');
  assert.equal(person.education, null, 'the unconfirmed one did NOT');
});

// -------------------------------------------------------- the whole V1 journey --

test('inbound -> intake -> lead -> application -> admitted -> SIS, on one record', () => {
  const db = openDb();
  const r = receive(db, { channel: 'whatsapp', body: FULL, name: 'Emīls', phone: '+37120423829',
    externalId: 'j1' });

  // marketing qualifies it warm first
  const warm = qualify(db, r.id, { qualification: 'unclear', createPerson: true, by: 'Tetiana',
    confirmFields: [] });
  assert.equal(warm.owner, 'Marketing', 'nobody could tell yet, so it stays with Marketing');
  const id = warm.personId;
  const people = () => db.prepare('SELECT COUNT(*) n FROM people').get().n;
  assert.equal(people(), 1);

  // a later message promotes the same person to hot, still one record
  const r2 = receive(db, { channel: 'whatsapp', body: FULL, name: 'Emīls', phone: '+37120423829',
    externalId: 'j2' });
  const hot = qualify(db, r2.id, { qualification: 'lead', personId: id, by: 'Tetiana',
    confirmFields: ['interest', 'education'] });
  assert.equal(hot.owner, 'Admissions');
  assert.equal(hot.personId, id);
  assert.equal(people(), 1, 'promotion must never make a second person');
  assert.equal(hot.handoverGap, null, 'we hold a phone, so Admissions can reach them');

  // Admissions walks it to admitted
  for (const st of [CONFIG.stageRoles.application, 'Contract', CONFIG.stageRoles.admitted]) {
    db.prepare('UPDATE people SET status = ? WHERE id = ?').run(st, id);
  }
  assert.match(handoffToSis(db, id, 'Ieva').at, /^\d{4}-/);
  assert.equal(people(), 1, 'the whole journey is one record');

  const after = db.prepare('SELECT * FROM people WHERE id = ?').get(id);
  assert.equal(after.qualification, 'lead');
  assert.equal(after.first_channel, 'whatsapp', 'where they came from survived the journey');
  assert.ok(after.sis_handoff_at);
});

test('a person is only handed to the SIS once, and only when admitted', () => {
  const db = openDb();
  const r = receive(db, { channel: 'instagram', body: FULL, externalId: 'k1' });
  const q = qualify(db, r.id, { qualification: 'lead', createPerson: true, by: 'Tetiana' });
  assert.match(handoffToSis(db, q.personId, 'Ieva').error, /only an Admitted person/);
  db.prepare('UPDATE people SET status = ? WHERE id = ?').run(CONFIG.stageRoles.admitted, q.personId);
  assert.equal(handoffToSis(db, q.personId, 'Ieva').ok, true);
  assert.match(handoffToSis(db, q.personId, 'Ieva').error, /already handed over/);
});

// ------------------------------------------------------------------ the funnel --

test('the funnel counts rows that exist, from raw contact to SIS', () => {
  const db = openDb();
  for (const [i, body] of [HI, FULL, PARTIAL, 'hello there'].entries()) {
    receive(db, { channel: 'instagram', body, name: 'P' + i, externalId: 'f' + i });
  }
  const rows = db.prepare('SELECT id FROM inbound ORDER BY id').all();
  qualify(db, rows[1].id, { qualification: 'lead', createPerson: true, by: 'Tetiana', confirmFields: ['interest'] });
  qualify(db, rows[2].id, { qualification: 'lead', createPerson: true, by: 'Tetiana', confirmFields: ['interest'] });
  archive(db, rows[3].id, { reason: 'Spam', by: 'Tetiana' });

  const f = funnel(db);
  const step = (name) => f.steps.find((s) => s.step === name).count;
  assert.equal(step('Contacted us'), 4);
  assert.equal(step('Waiting to be looked at'), 1);
  assert.equal(step('Became a lead'), 2);
  assert.equal(step('Handed to SIS'), 0);
  assert.match(f.honesty, /Nothing is modelled, estimated or projected/);
});

test('the funnel says where people are stuck and which channel they came from', () => {
  const db = openDb();
  receive(db, { channel: 'instagram', body: FULL, externalId: 'g1' });
  receive(db, { channel: 'linkedin', body: PARTIAL, externalId: 'g2' });
  const rows = db.prepare('SELECT id FROM inbound ORDER BY id').all();
  qualify(db, rows[0].id, { qualification: 'lead', createPerson: true, by: 'Tetiana' });
  qualify(db, rows[1].id, { qualification: 'unclear', createPerson: true, by: 'Tetiana' });

  const f = funnel(db);
  assert.equal(f.byChannel.length, 2);
  const ig = f.byChannel.find((c) => c.channel === 'instagram');
  assert.equal(ig.contacts, 1);
  assert.equal(ig.leads, 1);
  assert.ok(f.byStage.some((s) => s.people > 0), 'people are somewhere');
  assert.equal(typeof f.noNextAction, 'number');
  assert.equal(typeof f.overdueActions, 'number');
});

test('every funnel number is a count, never a rate or an estimate', () => {
  const db = openDb();
  const f = funnel(db);
  for (const s of f.steps) assert.equal(Number.isInteger(s.count), true, s.step + ' must be a count');
  assert.equal(Number.isInteger(f.agedInbound), true);
  assert.equal(Number.isInteger(f.overdueActions), true);
});

// ------------------------------------------------------- the audit still holds --

test('qualifying writes to the one history, with the person who did it', () => {
  const db = openDb();
  const r = receive(db, { channel: 'instagram', body: FULL, name: 'Liene', externalId: 'h1' });
  const q = qualify(db, r.id, { qualification: 'lead', createPerson: true, by: 'Tetiana',
    note: 'wants NAV next year' });
  const events = db.prepare('SELECT * FROM events WHERE person_id = ? ORDER BY id').all(q.personId);
  assert.ok(events.length >= 2);
  for (const e of events) {
    assert.ok(['manual', 'automatic'].includes(e.origin), 'origin is never missing');
  }
  assert.ok(events.some((e) => e.actor === 'Tetiana'), 'the person who did it is on the record');
});

// ------------------------- the source model, corrected 23.09.2026 ----------
//
// Facebook and Instagram are not operated by individuals. They arrive through
// one shared Meta Business Suite inbox that Tetiana, Ieva and Laura all have.

test('Facebook and Instagram share one operational source, and it is named', () => {
  for (const ch of ['facebook', 'instagram']) {
    const src = CONFIG.channelSources[ch];
    assert.equal(src.source, 'Meta Business Suite');
    assert.equal(src.shared, true);
    assert.equal(src.verified, true);
  }
});

test('no "Tetiana owns Facebook" assumption exists anywhere', () => {
  // every role with Meta Business Suite access reaches both channels
  for (const role of ['Marketing', 'Admissions', 'Student Coordinator']) {
    for (const ch of ['facebook', 'instagram']) {
      assert.equal(canReach(role, ch), true, role + ' works ' + ch + ' through the shared inbox');
    }
  }
  assert.match(CONFIG.channelSources._note, /does not model individuals operating a social account/i);
});

test('WhatsApp is NOT claimed to be part of Meta Business Suite', () => {
  const wa = CONFIG.channelSources.whatsapp;
  assert.equal(wa.verified, false, 'nobody has checked the Novikontas setup');
  assert.notEqual(wa.source, 'Meta Business Suite', 'it must not claim what was not verified');
  assert.match(wa._note, /UNVERIFIED|has NOT been verified/i);
});

test('LinkedIn and TikTok have no shared inbox, so Tetiana is the bridge', () => {
  for (const ch of ['linkedin', 'tiktok']) {
    assert.equal(CONFIG.channelSources[ch].shared, false);
    assert.equal(canReach('Marketing', ch), true);
    assert.equal(canReach('Admissions', ch), false);
  }
});

test('the channels stay separate rows for reporting, whatever the shared source', () => {
  const db = openDb();
  receive(db, { channel: 'facebook', body: FULL, externalId: 's1' });
  receive(db, { channel: 'instagram', body: FULL, externalId: 's2' });
  const f = funnel(db);
  const names = f.byChannel.map((c) => c.channel).sort();
  assert.deepEqual(names, ['facebook', 'instagram'],
    'one shared inbox must not collapse two sources into one row');
});
