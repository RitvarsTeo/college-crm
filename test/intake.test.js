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

test('the machine answers one question: did they say what they want to study', async () => {
  assert.equal(extractFrom({ channel: 'instagram', text: HI }).suggested, 'unclear');
  assert.equal(extractFrom({ channel: 'instagram', text: FULL }).suggested, 'lead');
  assert.equal(extractFrom({ channel: 'instagram', text: PARTIAL }).suggested, 'lead',
    'they named a programme, so it is Admissions work even though the rest is missing');
});

test('a question about documents is Admissions work, not marketing work', async () => {
  // the rule the first review corrected: a confirmed interest IS a lead
  const r = extractFrom({ channel: 'linkedin',
    text: 'I am looking at marine engineering. Which documents do I need to apply?' });
  assert.equal(r.suggested, 'lead');
  assert.equal(ownerFor(r.suggested), 'Admissions');
});

test('obvious sales pitches never reach the queue', async () => {
  const db = await openDb();
  const r = await receive(db, { channel: 'instagram', externalId: 'junk1',
    body: 'Hello, we offer social media promotion services, 5000 followers guaranteed' });
  assert.equal(r.filtered, true);
  assert.equal((await listInbound(db, { state: 'new' })).length, 0, 'it must not cost anybody a second');
  const row = await db.prepare('SELECT * FROM inbound WHERE id = ?').get(r.id);
  assert.equal(row.state, 'filtered');
  assert.equal(row.body, null, 'and the body goes with it');
  assert.equal(row.contact_name, null);
  assert.ok((await db.prepare('SELECT COUNT(*) n FROM inbound').get()).n === 1, 'but it IS still stored');
});

test('a plain "Hi" from a real person is NOT junk and does reach the queue', async () => {
  const db = await openDb();
  const r = await receive(db, { channel: 'instagram', body: HI, name: 'Ahmed Muhamed', externalId: 'hi1' });
  assert.equal(r.filtered, false);
  assert.equal((await listInbound(db, { state: 'new' })).length, 1,
    'a person saying hello might be a student; only sales pitches are filtered');
});

test('"Hi" produces NO fields at all, rather than a plausible guess', async () => {
  const r = extractFrom({ channel: 'instagram', text: HI });
  assert.deepEqual(r.fields, [], 'nothing was said, so nothing may be recorded');
  assert.ok(r.missing.includes('interest'));
  assert.match(r.why, /nothing about studying was mentioned/);
});

test('everything the machine reads is marked extracted, never as fact', async () => {
  const r = extractFrom({ channel: 'instagram', text: FULL });
  assert.ok(r.fields.length >= 4);
  for (const f of r.fields) assert.equal(f.provenance, 'extracted');
});

test('what the provider itself supplied is provider, not extracted', async () => {
  const r = extractFrom({ channel: 'whatsapp', text: HI, provided: { phone: '+37129111222' } });
  const phone = r.fields.find((f) => f.field === 'phone');
  assert.equal(phone.provenance, 'provider');
});

test('an incomplete message is not blocked, it names what is missing', async () => {
  const r = extractFrom({ channel: 'facebook', text: PARTIAL });
  assert.equal(r.suggested, 'lead');
  assert.ok(r.fields.some((f) => f.field === 'interest' && f.value === 'NAV'));
  for (const gap of ['start', 'education']) assert.ok(r.missing.includes(gap), 'must name ' + gap);
});

// ----------------------------------------------------------------- the ageing --

// Q50 (05.10.2026) replaced "next day at 09:00": the stored surface_at is now the LATE moment, the end of the
// working day the first working hour ends in. The edges are in test/inbox_answer_q50.test.js.
test('inbound Monday 21:30 is late at the end of Tuesday\'s working day, 17:00 local', async () => {
  // 2026-09-21 is a Monday. 21:30 Riga in September is UTC+3, so 18:30Z.
  const out = await surfaceAt('2026-09-21T18:30:00.000Z');
  const local = new Intl.DateTimeFormat('en-CA', {
    timeZone: CONFIG.ageing.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(out));
  assert.match(local, /2026-09-22/, 'the next working day');
  assert.match(local, /17:00/, 'at 17:00 local, not 17:00 UTC');
});

test('the rule holds across the summer time boundary', async () => {
  for (const iso of ['2026-01-15T20:30:00.000Z', '2026-07-15T20:30:00.000Z']) {
    const local = new Intl.DateTimeFormat('en-CA', {
      timeZone: CONFIG.ageing.timezone, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(await surfaceAt(iso)));
    assert.match(local, /17:00/, iso + ' must still be late at 17:00 local');
  }
});

test('a contact from last Thursday is late now, one from a minute ago is not', async () => {
  const db = await openDb();
  const now = '2026-10-06T08:00:00.000Z';                                         // Tue 06.10 11:00 Riga
  await receive(db, { channel: 'instagram', body: HI, name: 'Old', externalId: 'a', receivedAt: '2026-10-01T07:00:00.000Z' });
  await receive(db, { channel: 'instagram', body: HI, name: 'New', externalId: 'b', receivedAt: '2026-10-06T07:59:00.000Z' });
  assert.equal(await agedCount(db, now), 1);
  const rows = await listInbound(db, { now });
  assert.equal(rows.filter((r) => r.aged).length, 1);
  assert.equal(rows.find((r) => r.aged).contact_name, 'Old');
});

// -------------------------------------------------------------- the routing --

test('routing keeps the unclear ones with Marketing and sends every lead to Admissions', async () => {
  assert.equal(ownerFor('unclear'), 'Marketing');
  assert.equal(ownerFor('lead'), 'Admissions');
});

test('neither dangerous extreme is possible: not everything to Ieva, not everything stuck with Tetiana', async () => {
  const owners = new Set(CONFIG.qualification.levels.map((l) => ownerFor(l.id)));
  assert.ok(owners.size > 1, 'if every level routed to one role, one of the two extremes is built in');
  assert.ok(owners.has('Admissions'), 'something has to reach Admissions');
  assert.ok(owners.has('Marketing'), 'and something has to stay on the marketing side');
});

test('Admissions is notified for a lead and never for an unclear contact', async () => {
  assert.deepEqual(notifiedFor('unclear'), ['Marketing']);
  assert.deepEqual(notifiedFor('lead'), ['Admissions']);
  assert.ok(!notifiedFor('unclear').includes('Admissions'));
});

test('what is waiting is counted per role, and an admin sees every role', async () => {
  const db = await openDb();
  const r = await receive(db, { channel: 'instagram', body: HI, name: 'Somebody', externalId: 'w1' });
  const r2 = await receive(db, { channel: 'instagram', body: FULL, name: 'Lead', externalId: 'w2' });
  await qualify(db, r2.id, { qualification: 'lead', createPerson: true, by: 'Tetiana', confirmFields: ['interest'], nextAction: 'Call and establish interest' });

  const marketing = await waitingFor(db, 'Marketing');
  const admissions = await waitingFor(db, 'Admissions');
  assert.equal(marketing.intake, 1, 'the unqualified one waits with Marketing');
  assert.equal(admissions.intake, 0, 'Admissions is never shown the intake queue');
  assert.equal(admissions.leads, 1, 'and does get the lead');

  const all = await waitingByRole(db);
  assert.ok(all.some((x) => x.role === 'Marketing'));
  assert.ok(all.some((x) => x.role === 'Admissions'));
});

// ------------------------------------- the bridge: Ieva has no social channels --

test('the access matrix is exactly the one that was confirmed', async () => {
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

test('Tetiana does NOT have WhatsApp, which no role model could express', async () => {
  assert.equal(personCanReach('Tetiana', 'whatsapp'), false);
  for (const who of ['Ieva', 'Laura', 'Marina']) {
    assert.equal(personCanReach(who, 'whatsapp'), true, who + ' does have WhatsApp');
  }
  // and the derived role answer follows the people, rather than being written twice
  assert.equal(await canReach('Marketing', 'whatsapp'), false, 'the only Marketing person has no WhatsApp');
  assert.equal(await canReach('Admissions', 'whatsapp'), true);
});

test('LinkedIn and TikTok are Tetiana alone', async () => {
  for (const ch of ['linkedin', 'tiktok']) {
    assert.deepEqual(whoCanReach(ch), ['Tetiana']);
    assert.equal(await canReach('Admissions', ch), false, 'Ieva must not be assumed to have ' + ch);
    assert.equal(await canReach('Student Coordinator', ch), false);
  }
});

test('a role reaches a channel when any of its people can', async () => {
  for (const ch of ['facebook', 'instagram']) {
    for (const role of ['Marketing', 'Admissions', 'Student Coordinator']) {
      assert.equal(await canReach(role, ch), true, role + ' works ' + ch + ' through the shared inbox');
    }
  }
  assert.match(CONFIG.channelAccess._roleAccessIsDerived, /Never write a role list by hand/i);
});

test('the handover gap names who can actually bridge it', async () => {
  const gap = await handoverGap({ role: 'Admissions', channel: 'linkedin' });
  assert.deepEqual(gap.bridges, ['Tetiana']);
  assert.match(gap.action, /Ask Tetiana/);
});

test('the phone menu matches the queues the call logger keeps', async () => {
  const menu = CONFIG.phoneMenu;
  assert.equal(menu['1'].role, 'Admissions');
  assert.equal(menu['2'].role, 'Student Coordinator');
  assert.equal(menu['3'].role, 'Other');
  assert.deepEqual(menu['3'].handledBy, ['Tetiana', 'Arina']);
  for (const k of ['1', '2', '3']) {
    assert.ok(PBX_QUEUES.includes(menu[k].queue), 'button ' + k + ' points at a queue the logger drops');
  }
});

test('Arina is a CRM user, because she answers a phone queue', async () => {
  const arina = CONFIG.users.find((u) => u.name === 'Arina');
  assert.ok(arina, 'she answers button 3 and must exist');
  assert.equal(arina.title, 'Internship Coordinator');
  assert.ok(CONFIG.owners.includes(arina.role));
});

test('a lead from a shared channel needs no handover gap', async () => {
  for (const channel of ['instagram', 'facebook', 'whatsapp']) {
    assert.equal(await handoverGap({ role: 'Admissions', channel, email: null, phone: null }), null,
      'Admissions can open ' + channel + ' themselves');
  }
});

test('a lead from a Marketing-only channel with no email or phone raises a handover gap', async () => {
  for (const channel of ['linkedin', 'tiktok']) {
    const gap = await handoverGap({ role: 'Admissions', channel, email: null, phone: null });
    assert.ok(gap, channel + ' is Tetiana only, so this is a crack');
    assert.match(gap.problem, new RegExp('no access to ' + channel));
    assert.ok(gap.action.length > 10, 'and it must say what to do about it');
  }
});

test('the same lead with a phone has no gap, because Admissions can ring them', async () => {
  assert.equal(await handoverGap({ role: 'Admissions', channel: 'linkedin', phone: '+37129111222' }), null);
  assert.equal(await handoverGap({ role: 'Admissions', channel: 'tiktok', email: 'a@b.lv' }), null);
});

test('a gap does not block promotion, it flags it', async () => {
  const db = await openDb();
  const r = await receive(db, { channel: 'linkedin', body: FULL, name: 'Ahmed Muhamed', externalId: 'x1' });
  const q = await qualify(db, r.id, { qualification: 'lead', createPerson: true, by: 'Tetiana', nextAction: 'Call and establish interest',
    confirmFields: ['interest', 'start', 'education', 'question'] });
  assert.equal(q.ok, true, 'the lead is NOT lost');
  assert.equal(q.qualification, 'lead');
  assert.ok(q.handoverGap, 'but the gap is raised');
});

// -------------------------------------------------- nothing becomes a lead alone --

test('arriving creates an inbound row and NO person', async () => {
  const db = await openDb();
  await receive(db, { channel: 'instagram', body: FULL, name: 'Somebody', externalId: 'y1' });
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM inbound').get()).n, 1);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM people').get()).n, 0,
    'even a hot-looking message must not create a lead by itself');
});

test('an exact repeat of the same provider message is not stored twice', async () => {
  const db = await openDb();
  const a = await receive(db, { channel: 'facebook', body: HI, externalId: 'dup-1' });
  const b = await receive(db, { channel: 'facebook', body: HI, externalId: 'dup-1' });
  assert.equal(b.duplicate, true);
  assert.equal(b.id, a.id);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM inbound').get()).n, 1);
});

test('qualifying needs a person, a level and a name to put on it', async () => {
  const db = await openDb();
  const r = await receive(db, { channel: 'instagram', body: HI, externalId: 'z1' });
  assert.match((await qualify(db, r.id, { qualification: 'lead', by: 'Tetiana' })).error, /create one/);
  assert.match((await qualify(db, r.id, { qualification: 'molten', createPerson: true, by: 'T' })).error, /unknown qualification/);
  assert.match((await qualify(db, r.id, { qualification: 'lead', createPerson: true })).error, /who is qualifying/);
});

test('an item cannot be dealt with twice', async () => {
  const db = await openDb();
  const r = await receive(db, { channel: 'instagram', body: HI, externalId: 'z2' });
  await qualify(db, r.id, { qualification: 'unclear', createPerson: true, by: 'Tetiana', nextAction: 'Send the programme description' });
  assert.match((await qualify(db, r.id, { qualification: 'lead', createPerson: true, by: 'Tetiana', nextAction: 'Call and establish interest' })).error, /already/);
  assert.match((await archive(db, r.id, { reason: 'Spam', by: 'Tetiana' })).error, /already/);
});

// --------------------------------------------------- the message body lifecycle --

// Q76, 07.10.2026: reversed - the body now stays after qualification (History), the 13-month retention empties it
test('the body is kept on qualification and the structured record is made as well', async () => {
  const db = await openDb();
  const r = await receive(db, { channel: 'instagram', body: FULL, name: 'Liene', externalId: 'b1' });
  assert.ok((await db.prepare('SELECT body FROM inbound WHERE id = ?').get(r.id)).body, 'it is there while qualifying');

  await qualify(db, r.id, { qualification: 'lead', createPerson: true, by: 'Tetiana', nextAction: 'Call and establish interest',
    confirmFields: ['interest', 'education'] });

  const row = await db.prepare('SELECT * FROM inbound WHERE id = ?').get(r.id);
  assert.equal(row.body, FULL, 'Q76: the body stays');
  assert.equal(row.body_deleted_at, null);
  const kept = await db.prepare('SELECT * FROM field_values WHERE inbound_id = ? AND person_id IS NOT NULL').all(r.id);
  assert.ok(kept.length >= 4, 'the extracted facts survive the deletion');
});

// 07.10.2026, the owner asked "Set aside: keep the message text?": "Keep the text". Since Q76 qualify keeps it too.
test('set aside keeps the text (until retention), and the row is kept forever', async () => {
  const db = await openDb();
  const r = await receive(db, { channel: 'instagram', body: 'hello there', name: 'Spam', externalId: 'b2' });
  await archive(db, r.id, { reason: 'Spam', by: 'Tetiana' });
  const row = await db.prepare('SELECT * FROM inbound WHERE id = ?').get(r.id);
  assert.equal(row.body, 'hello there');
  assert.equal(row.body_deleted_at, null);
  assert.equal(row.state, 'archived');
  assert.equal(row.archive_reason, 'Spam');
  assert.equal(row.contact_name, 'Spam', 'archived is not deleted: the contact is still findable');
});

test('archiving needs a reason, and "Other" needs an explanation', async () => {
  const db = await openDb();
  const r = await receive(db, { channel: 'instagram', body: HI, externalId: 'b3' });
  assert.match((await archive(db, r.id, { by: 'Tetiana' })).error, /reason is required/);
  assert.match((await archive(db, r.id, { reason: 'Other', by: 'Tetiana' })).error, /needs an explanation/);
  assert.equal((await archive(db, r.id, { reason: 'Other', note: 'a supplier', by: 'Tetiana' })).ok, true);
});

// ------------------------------------------- confirmation makes data authoritative --

test('only a confirmed field becomes real CRM data', async () => {
  const db = await openDb();
  const r = await receive(db, { channel: 'instagram', body: FULL, name: 'Liene', externalId: 'c1' });
  const q = await qualify(db, r.id, { qualification: 'lead', createPerson: true, by: 'Tetiana', nextAction: 'Call and establish interest',
    confirmFields: ['interest'] });          // education deliberately NOT confirmed

  const fields = await db.prepare('SELECT * FROM field_values WHERE person_id = ?').all(q.personId);
  const interest = fields.find((f) => f.field === 'interest');
  const education = fields.find((f) => f.field === 'education');
  assert.equal(interest.provenance, 'confirmed');
  assert.equal(interest.confirmed_by, 'Tetiana');
  assert.equal(education.provenance, 'extracted', 'unconfirmed stays a suggestion');

  const person = await db.prepare('SELECT * FROM people WHERE id = ?').get(q.personId);
  assert.equal(person.programme, 'NAV', 'the confirmed one reached the record');
  assert.equal(person.education, null, 'the unconfirmed one did NOT');
});

// -------------------------------------------------------- the whole V1 journey --

test('inbound -> intake -> lead -> application -> admitted -> SIS, on one record', async () => {
  const db = await openDb();
  const r = await receive(db, { channel: 'whatsapp', body: FULL, name: 'Emīls', phone: '+37120423829',
    externalId: 'j1' });

  // marketing qualifies it warm first
  const warm = await qualify(db, r.id, { qualification: 'unclear', createPerson: true, by: 'Tetiana', nextAction: 'Call and establish interest',
    confirmFields: [] });
  assert.equal(warm.owner, 'Marketing', 'nobody could tell yet, so it stays with Marketing');
  const id = warm.personId;
  const people = async () => (await db.prepare('SELECT COUNT(*) n FROM people').get()).n;
  assert.equal(await people(), 1);

  // a later message promotes the same person to hot, still one record
  const r2 = await receive(db, { channel: 'whatsapp', body: FULL, name: 'Emīls', phone: '+37120423829',
    externalId: 'j2' });
  const hot = await qualify(db, r2.id, { qualification: 'lead', personId: id, by: 'Tetiana',
    confirmFields: ['interest', 'education'] });
  assert.equal(hot.owner, 'Admissions');
  assert.equal(hot.personId, id);
  assert.equal(await people(), 1, 'promotion must never make a second person');
  assert.equal(hot.handoverGap, null, 'we hold a phone, so Admissions can reach them');

  // Admissions walks it to admitted
  for (const st of [CONFIG.stageRoles.application, 'Contract', CONFIG.stageRoles.admitted]) {
    await db.prepare('UPDATE people SET status = ? WHERE id = ?').run(st, id);
  }
  assert.match((await handoffToSis(db, id, 'Ieva')).at, /^\d{4}-/);
  assert.equal(await people(), 1, 'the whole journey is one record');

  const after = await db.prepare('SELECT * FROM people WHERE id = ?').get(id);
  assert.equal(after.qualification, 'lead');
  assert.equal(after.first_channel, 'whatsapp', 'where they came from survived the journey');
  assert.ok(after.sis_handoff_at);
});

test('a person is only handed to the SIS once, and only when admitted', async () => {
  const db = await openDb();
  const r = await receive(db, { channel: 'instagram', body: FULL, externalId: 'k1' });
  const q = await qualify(db, r.id, { qualification: 'lead', createPerson: true, by: 'Tetiana', nextAction: 'Call and establish interest' });
  assert.match((await handoffToSis(db, q.personId, 'Ieva')).error, /only an Admitted person/);
  await db.prepare('UPDATE people SET status = ? WHERE id = ?').run(CONFIG.stageRoles.admitted, q.personId);
  assert.equal((await handoffToSis(db, q.personId, 'Ieva')).ok, true);
  assert.match((await handoffToSis(db, q.personId, 'Ieva')).error, /already handed over/);
});

// ------------------------------------------------------------------ the funnel --

test('the funnel counts rows that exist, from raw contact to SIS', async () => {
  const db = await openDb();
  for (const [i, body] of [HI, FULL, PARTIAL, 'hello there'].entries()) {
    await receive(db, { channel: 'instagram', body, name: 'P' + i, externalId: 'f' + i });
  }
  const rows = await db.prepare('SELECT id FROM inbound ORDER BY id').all();
  await qualify(db, rows[1].id, { qualification: 'lead', createPerson: true, by: 'Tetiana', confirmFields: ['interest'], nextAction: 'Call and establish interest' });
  await qualify(db, rows[2].id, { qualification: 'lead', createPerson: true, by: 'Tetiana', confirmFields: ['interest'], nextAction: 'Call and establish interest' });
  await archive(db, rows[3].id, { reason: 'Spam', by: 'Tetiana' });

  const f = await funnel(db);
  const step = (name) => f.steps.find((s) => s.step === name).count;
  assert.equal(step('Contacted us'), 4);
  assert.equal(step('Waiting to be looked at'), 1);
  assert.equal(step('Became a lead'), 2);
  assert.equal(step('Handed to SIS'), 0);
  assert.match(f.honesty, /Nothing is modelled, estimated or projected/);
});

test('the funnel says where people are stuck and which channel they came from', async () => {
  const db = await openDb();
  await receive(db, { channel: 'instagram', body: FULL, externalId: 'g1' });
  await receive(db, { channel: 'linkedin', body: PARTIAL, externalId: 'g2' });
  const rows = await db.prepare('SELECT id FROM inbound ORDER BY id').all();
  await qualify(db, rows[0].id, { qualification: 'lead', createPerson: true, by: 'Tetiana', nextAction: 'Call and establish interest' });
  await qualify(db, rows[1].id, { qualification: 'unclear', createPerson: true, by: 'Tetiana', nextAction: 'Send the programme description' });

  const f = await funnel(db);
  assert.equal(f.byChannel.length, 2);
  const ig = f.byChannel.find((c) => c.channel === 'instagram');
  assert.equal(ig.contacts, 1);
  assert.equal(ig.leads, 1);
  assert.ok(f.byStage.some((s) => s.people > 0), 'people are somewhere');
  assert.equal(typeof f.noNextAction, 'number');
  assert.equal(typeof f.overdueActions, 'number');
});

test('every funnel number is a count, never a rate or an estimate', async () => {
  const db = await openDb();
  const f = await funnel(db);
  for (const s of f.steps) assert.equal(Number.isInteger(s.count), true, s.step + ' must be a count');
  assert.equal(Number.isInteger(f.agedInbound), true);
  assert.equal(Number.isInteger(f.overdueActions), true);
});

// ------------------------------------------------------- the audit still holds --

test('qualifying writes to the one history, with the person who did it', async () => {
  const db = await openDb();
  const r = await receive(db, { channel: 'instagram', body: FULL, name: 'Liene', externalId: 'h1' });
  const q = await qualify(db, r.id, { qualification: 'lead', createPerson: true, by: 'Tetiana', nextAction: 'Call and establish interest',
    note: 'wants NAV next year' });
  const events = await db.prepare('SELECT * FROM events WHERE person_id = ? ORDER BY id').all(q.personId);
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

test('Facebook and Instagram share one operational source, and it is named', async () => {
  for (const ch of ['facebook', 'instagram']) {
    const src = CONFIG.channelSources[ch];
    assert.equal(src.source, 'Meta Business Suite');
    assert.equal(src.shared, true);
    assert.equal(src.verified, true);
  }
});

test('no "Tetiana owns Facebook" assumption exists anywhere', async () => {
  // every role with Meta Business Suite access reaches both channels
  for (const role of ['Marketing', 'Admissions', 'Student Coordinator']) {
    for (const ch of ['facebook', 'instagram']) {
      assert.equal(await canReach(role, ch), true, role + ' works ' + ch + ' through the shared inbox');
    }
  }
  assert.match(CONFIG.channelSources._note, /does not model individuals operating a social account/i);
});

test('WhatsApp is NOT claimed to be part of Meta Business Suite', async () => {
  const wa = CONFIG.channelSources.whatsapp;
  assert.equal(wa.verified, false, 'nobody has checked the Novikontas setup');
  assert.notEqual(wa.source, 'Meta Business Suite', 'it must not claim what was not verified');
  assert.match(wa._note, /UNVERIFIED|has NOT been verified/i);
});

test('LinkedIn and TikTok have no shared inbox, so Tetiana is the bridge', async () => {
  for (const ch of ['linkedin', 'tiktok']) {
    assert.equal(CONFIG.channelSources[ch].shared, false);
    assert.equal(await canReach('Marketing', ch), true);
    assert.equal(await canReach('Admissions', ch), false);
  }
});

test('the channels stay separate rows for reporting, whatever the shared source', async () => {
  const db = await openDb();
  await receive(db, { channel: 'facebook', body: FULL, externalId: 's1' });
  await receive(db, { channel: 'instagram', body: FULL, externalId: 's2' });
  const f = await funnel(db);
  const names = f.byChannel.map((c) => c.channel).sort();
  assert.deepEqual(names, ['facebook', 'instagram'],
    'one shared inbox must not collapse two sources into one row');
});

// ------------------------------------------- what a person says, not the machine --
// Reported 24.09.2026 after the first real test: a message saying only "hello"
// produced nothing for the machine to read, so there was no box to tick, the item
// could only be filed as 'nobody can tell yet', and the person came to rest in
// Done. The operator knew perfectly well what was wanted and had nowhere to put it.

test('an operator can state an interest the machine never found, and it reaches the person', async () => {
  const db = await openDb();
  const { id } = await receive(db, { channel: 'instagram', name: 'Darja S', body: HI });
  const before = await db.prepare('SELECT * FROM field_values WHERE inbound_id = ?').all(id);
  assert.equal(before.filter((f) => f.field === 'interest').length, 0,
    'the machine must have found no interest, or this test proves nothing');

  const r = await qualify(db, id, { qualification: 'lead', createPerson: true, by: 'Ieva', nextAction: 'Call and establish interest',
    note: 'said on the phone they want the engineer programme', stated: { interest: 'ENG' } });
  assert.equal(r.ok, true);

  const person = await db.prepare('SELECT * FROM people WHERE id = ?').get(r.personId);
  assert.equal(person.programme, 'ENG');
  assert.equal(person.qualification, 'lead');
  assert.equal(person.owner, CONFIG.routing.lead);
  assert.equal(person.status, CONFIG.stageRoles.first, 'a lead starts on the pipeline');

  const stored = await db.prepare("SELECT * FROM field_values WHERE person_id = ? AND field = 'interest'").get(r.personId);
  assert.equal(stored.provenance, 'operator', 'a person typed it, so it is not a machine suggestion');
  assert.equal(stored.confirmed_by, 'Ieva');
});

test('stating an interest and filing it as unclear is refused, not quietly accepted', async () => {
  const db = await openDb();
  const { id } = await receive(db, { channel: 'instagram', name: 'Darja S', body: HI });
  const r = await qualify(db, id, { qualification: 'unclear', createPerson: true, by: 'Ieva', nextAction: 'Call and establish interest',
    stated: { interest: 'NAV' } });
  assert.match(r.error, /lead/);
  assert.equal((await db.prepare('SELECT state FROM inbound WHERE id = ?').get(id)).state, 'new',
    'a refused qualification must leave the item where it was');
});

test('a value a person states outranks the machine guess, and the change is in the history', async () => {
  const db = await openDb();
  const { id } = await receive(db, { channel: 'instagram', name: 'Raivis', body: FULL });
  const read = await db.prepare("SELECT value FROM field_values WHERE inbound_id = ? AND field = 'interest'").get(id);
  assert.ok(read, 'the machine should have read an interest out of this message');

  // the operator confirms what was read, then corrects it: they had the conversation
  const r = await qualify(db, id, { qualification: 'lead', createPerson: true, by: 'Ieva', nextAction: 'Call and establish interest',
    confirmFields: ['interest'], stated: { interest: 'MT WTT' } });
  assert.equal((await db.prepare('SELECT programme FROM people WHERE id = ?').get(r.personId)).programme, 'MT WTT');

  const edit = await db.prepare(`SELECT * FROM events WHERE person_id = ? AND field = 'programme'`).get(r.personId);
  assert.ok(edit, 'overwriting a machine value has to be visible in the history');
  assert.equal(edit.old_value, read.value);
  assert.equal(edit.new_value, 'MT WTT');
  assert.equal(edit.actor, 'Ieva');
});

test('the not-relevant screen is one list over two stored states', async () => {
  const db = await openDb();
  // a sales pitch the machine drops, and a real message a person marks as not relevant
  const junk = await receive(db, { channel: 'instagram', name: 'Seller', body: 'Hello, we offer social media promotion services, 5000 followers guaranteed' });
  const real = await receive(db, { channel: 'instagram', name: 'Somebody', body: HI });
  await archive(db, real.id, { reason: CONFIG.intake.archiveReasons[0], by: 'Tetiana' });

  assert.equal((await db.prepare('SELECT state FROM inbound WHERE id = ?').get(junk.id)).state, 'filtered');
  const shown = (await listInbound(db, { state: 'notrelevant' })).map((r) => r.id).sort();
  assert.deepEqual(shown, [junk.id, real.id].sort(), 'one screen shows both');
  // and they stay apart underneath, because the funnel counts real contacts only
  assert.equal((await listInbound(db, { state: 'archived' })).length, 1);
  assert.equal((await listInbound(db, { state: 'filtered' })).length, 1);
});

// ============================== one thread, not one row per arrival (01.10.2026) ===
// Ritvars set the rule for phone: "a new number called first time sits in to look at",
// and a stranger ringing three times is one person to ring back. The rule is written
// HERE, in receive(), not in the phone poller, because receive() is the single entry
// point every channel goes through - a rule kept in one poller is a rule the next
// channel will not have.

test('a second arrival on an open thread joins the row, it does not open another', async () => {
  const db = await openDb();
  const first = await receive(db, { channel: 'phone', externalId: 'c1', threadKey: 'phone:29111222',
    joinOpenThread: true, phone: '+37129111222', body: 'Missed call on button 3 (Other)',
    receivedAt: '2026-10-01T08:05:00.000Z' });
  assert.ok(first.id);

  const again = await receive(db, { channel: 'phone', externalId: 'c2', threadKey: 'phone:29111222',
    joinOpenThread: true, phone: '371 29 111 222', body: 'Missed call on button 3 (Other)',
    joinBody: 'Rang again 2026-10-01 11:31, missed call on button 3 (Other)',
    receivedAt: '2026-10-01T08:31:00.000Z' });
  assert.equal(again.joined, true);
  assert.equal(again.id, first.id);

  const rows = await listInbound(db, { state: 'new' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].body,
    'Missed call on button 3 (Other)\nRang again 2026-10-01 11:31, missed call on button 3 (Other)',
    'joinBody is what a LATER arrival reads as; body is what the first one reads as');

  // THE CLOCK DOES NOT RESTART: whoever keeps getting in touch has waited LONGER, so
  // refreshing the arrival time would push them down the queue and clear "late".
  assert.equal(rows[0].received_at, '2026-10-01T08:05:00.000Z');
});

test('a thread whose row was dealt with starts a fresh row', async () => {
  const db = await openDb();
  const first = await receive(db, { channel: 'phone', externalId: 'c1', threadKey: 'phone:29111222',
    joinOpenThread: true, phone: '+37129111222', body: 'Missed call on button 3 (Other)' });
  await db.prepare("UPDATE inbound SET state = 'archived' WHERE id = ?").run(first.id);

  const next = await receive(db, { channel: 'phone', externalId: 'c2', threadKey: 'phone:29111222',
    joinOpenThread: true, phone: '+37129111222', body: 'Missed call on button 3 (Other)' });
  assert.notEqual(next.id, first.id);
  assert.ok(!next.joined);
});

test('a channel that does not opt in is untouched, and so is one with no thread key', async () => {
  const db = await openDb();
  // adapters.js already sets threadKey on some channels. Without joinOpenThread that
  // must keep meaning exactly what it meant before: two Instagram messages from one
  // handle are two things to read, not one row that quietly swallowed the second.
  const a = await receive(db, { channel: 'instagram', externalId: 'm1', threadKey: 'ig:darja', body: HI });
  const b = await receive(db, { channel: 'instagram', externalId: 'm2', threadKey: 'ig:darja', body: HI });
  assert.notEqual(a.id, b.id);

  const c = await receive(db, { channel: 'phone', externalId: 'c9', joinOpenThread: true, body: HI });
  assert.ok(!c.joined, 'no thread key, nothing to join');
});

test('the phone poller writes no inbound row itself: receive() is the only door', () => {
  const sync = fs.readFileSync(path.join(ROOT, 'src', 'sync.js'), 'utf8')
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(sync, /INSERT INTO inbound/i);
  assert.doesNotMatch(sync, /UPDATE inbound/i);
});
