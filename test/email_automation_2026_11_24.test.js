// ACADEMY EMAIL AUTOMATION (24.11.2026, patch 171, src/mailauto.js), the owner's picks 1-7: edu@'s reply processes the
// card, the stage follows the conversation (forward only, a hand stage wins, Undo), the programme from the email, late
// after one working day + Follow up seven days after our reply, a suggested reply to copy (never sent), the mailbox bar,
// and an auto-filtered email edu@ answered comes back only from somebody willing to study. Invented people and mail.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { recordSentMail, receive, deadlinesFor, answerDeadlines } from '../src/intake.js';
import { toSentShape } from '../lib/gmail.js';
import * as auto from '../src/mailauto.js';
import { connectBarFor } from '../src/staffmail.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const SERVER = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
const SRC = fs.readFileSync(path.join(ROOT, 'src', 'mailauto.js'), 'utf8');
const H = 3600000;
const NOW = Date.now();
const ago = (h) => new Date(NOW - h * H).toISOString();
const OWN = 'edu' + '@' + 'novikontas.org';
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64url');
const sent = (id, thread, at, to, body = 'Labdien! Vajadzīga pase un izglītības dokuments.') => toSentShape({ id, threadId: thread, labelIds: ['SENT'],
  internalDate: String(Date.parse(at)), payload: { headers: [{ name: 'Date', value: new Date(at).toUTCString() },
    { name: 'From', value: `Novikontas Academy <${OWN}>` }, { name: 'To', value: to }, { name: 'Subject', value: 'Re: Navigācija' }],
  parts: [{ mimeType: 'text/plain', body: { data: b64(body) } }] } });

async function db0() {
  const db = await openDb(':memory:');
  const add = async (o) => {
    const r = await db.prepare(`INSERT INTO inbound (channel, thread_key, external_id, received_at, surface_at, suggested, state, source, person_id,
      contact_email, contact_name, body, processed_by, archive_reason) VALUES ('gmail',?,?,?,?,'raw',?,'provider',?,?,?,?,?,?)`)
      .run(o.thread, 'x' + Math.random(), o.at, o.at, o.state || 'new', o.person || null, o.email, o.name || null, o.body, o.by || null, o.reason || null);
    const id = Number(r.lastInsertRowid ?? (await db.prepare('SELECT MAX(id) n FROM inbound').get()).n);
    await db.prepare(`INSERT INTO inbound_line (inbound_id, seq, channel, external_id, received_at, kind, body) VALUES (?,1,'gmail',?,?,'message',?)`).run(id, 'l' + id, o.at, o.body);
    if (o.prog) await db.prepare(`INSERT INTO field_values (inbound_id, field, value, provenance, recorded_at, recorded_by) VALUES (?, 'interest', ?, 'extracted', ?, 'machine')`).run(id, o.prog, o.at);
    return id;
  };
  return { db, add };
}
const person = (db, id) => db.prepare('SELECT * FROM people WHERE id = ?').get(id);
const cardOf = (db, id) => db.prepare('SELECT * FROM inbound WHERE id = ?').get(id);

test('1+3+4: edu@ replies -> the card is a lead by itself, the programme from the email, Contacted, Follow up seven days later', async () => {
  const { db, add } = await db0();
  const id = await add({ thread: 'T1', at: ago(30), email: 'janis.example@gmail.com', name: 'Jānis Piemērs', body: 'Kādi dokumenti vajadzīgi navigācijai?', prog: 'NAV' });
  const at = ago(2);
  const r = await recordSentMail(db, sent('s1', 'T1', at, 'janis.example@gmail.com'));
  assert.equal(r.stored, true);
  const c = await cardOf(db, id);
  assert.equal(c.state, 'qualified'); assert.equal(c.processed_by, 'Intake');
  const p = await person(db, c.person_id);
  assert.equal(p.name, 'Jānis Piemērs'); assert.equal(p.status, 'Contacted'); assert.equal(p.programme, 'NAV', 'pick 3: from the email');
  const t = await db.prepare('SELECT label, due_at FROM tasks WHERE person_id = ? AND done_at IS NULL').all(p.id);
  assert.deepEqual(t.map((x) => x.label), ['Follow up']);
  assert.equal(Math.round((Date.parse(t[0].due_at) - Date.parse(at)) / 86400000), 7);
  const ev = await db.prepare(`SELECT subject, body, origin, actor FROM events WHERE person_id = ? AND kind = 'status'`).all(p.id);
  assert.deepEqual(ev.map((e) => [e.subject, e.origin, e.actor]), [['Status: New -> Contacted', 'automatic', 'Intake']]);
  assert.match(ev[0].body, /^set by Intake from the email of \d\d\.\d\d\. We replied\.$/);
  // the same reply read again (the thread join after the sent read) changes nothing
  assert.equal((await auto.afterOurReply(db, { inboundId: id, sentAt: at })).processed, null);
  assert.equal(Number((await db.prepare('SELECT COUNT(*) n FROM people').get()).n), 1);
});

test('a known person: the card goes onto them; they write back -> Follow-up with the topic; forward only, a hand stage wins', async () => {
  const { db, add } = await db0();
  await db.prepare("INSERT INTO people (id,name,email,status,owner,created_at) VALUES ('p1','Anna Piemēra','anna.example@inbox.lv','New','Admissions',?)").run(ago(500));
  const id = await add({ thread: 'T2', at: ago(40), email: 'anna.example@inbox.lv', body: 'Vai var pieteikties?' });
  await recordSentMail(db, sent('s2', 'T2', ago(30), 'anna.example@inbox.lv'));
  assert.equal((await cardOf(db, id)).person_id, 'p1');
  assert.equal((await person(db, 'p1')).status, 'Contacted');
  assert.equal(Number((await db.prepare('SELECT COUNT(*) n FROM people').get()).n), 1, 'no second person');
  // she writes back: lands on her profile -> Follow-up, with what she asked
  const r = await receive(db, { channel: 'gmail', externalId: 'in-3', threadKey: 'T9', receivedAt: ago(20), email: 'anna.example@inbox.lv', name: 'Anna',
    body: 'Paldies! Cik maksā mācības?', attachTo: 'p1' });
  assert.equal(r.attached, true);
  assert.equal((await person(db, 'p1')).status, 'Follow-up');
  const last = await db.prepare(`SELECT body FROM events WHERE person_id = 'p1' AND kind = 'status' ORDER BY id DESC`).get();
  assert.match(last.body, /They wrote back and asked about the price\.$/);
  // never backwards, never past Follow-up, never over a stage set by hand after the email
  assert.equal((await auto.stageFromMail(db, 'p1', 'Contacted', { emailAt: ago(1) })).moved, false);
  await db.prepare("UPDATE people SET status = 'Admitted' WHERE id = 'p1'").run();
  assert.equal((await auto.stageFromMail(db, 'p1', 'Follow-up', { emailAt: ago(1) })).moved, false, 'Admitted is never touched');
  await db.prepare("INSERT INTO people (id,name,status,owner,created_at) VALUES ('p2','B','New','Admissions',?)").run(ago(500));
  await db.prepare(`INSERT INTO events (person_id, kind, direction, occurred_at, subject, body, actor, origin, field, old_value, new_value)
    VALUES ('p2','status','note',?,'Status: Contacted -> New','changed by hand','Ieva','manual','status','Contacted','New')`).run(ago(5));
  assert.deepEqual(await auto.stageFromMail(db, 'p2', 'Contacted', { emailAt: ago(10) }), { moved: false, why: 'set by hand after the email' });
  assert.equal((await auto.stageFromMail(db, 'p2', 'Contacted', { emailAt: ago(1) })).moved, true, 'an email after the hand move counts');
});

test('Undo: a stage goes back while it still holds; a card waits again, a person Intake made is taken away, one worked on is not', async () => {
  const { db, add } = await db0();
  const id = await add({ thread: 'T3', at: ago(30), email: 'karl.example@gmail.com', name: 'Karl Example', body: 'Interested in the Navigation programme' });
  await recordSentMail(db, sent('s3', 'T3', ago(2), 'karl.example@gmail.com'));
  const pid = (await cardOf(db, id)).person_id;
  const e = await db.prepare(`SELECT id FROM events WHERE person_id = ? AND kind = 'status' AND actor = 'Intake'`).get(pid);
  assert.equal((await auto.undoStage(db, pid, e.id, '')).error, 'who is undoing this?');
  assert.deepEqual(await auto.undoStage(db, pid, e.id, 'Ieva'), { ok: true, status: 'New' });
  assert.match((await auto.undoStage(db, pid, e.id, 'Ieva')).error, /changed since/);
  // the card: back to Waiting, the person Intake made (nobody else touched) goes
  assert.match((await auto.undoCard(db, id, 'Ieva')).error, /worked on this person since/, 'the hand Undo above is work on them: kept');
  const id2 = await add({ thread: 'T4', at: ago(30), email: 'lena.example@gmail.com', name: 'Lena Example', body: 'Interested in the Navigation programme' });
  await recordSentMail(db, sent('s4', 'T4', ago(2), 'lena.example@gmail.com'));
  const pid2 = (await cardOf(db, id2)).person_id;
  assert.deepEqual(await auto.undoCard(db, id2, 'Ieva'), { ok: true, removedPerson: true });
  assert.equal(await person(db, pid2), undefined);
  const c2 = await cardOf(db, id2);
  assert.equal(c2.state, 'new'); assert.equal(c2.person_id, null);
  assert.equal(Number((await db.prepare('SELECT COUNT(*) n FROM tasks WHERE person_id = ?').get(pid2)).n), 0);
  assert.equal((await auto.undoCard(db, id2, 'Ieva')).error, 'not a card Intake processed');
});

test('4: an email card is late one working day after arrival; a call keeps the end-of-the-day rule', () => {
  const monday10 = '2026-11-23T08:00:00.000Z';   // Monday 10:00 Riga
  assert.equal(deadlinesFor('gmail', monday10).lateAt, '2026-11-24T08:00:00.000Z', 'Tuesday 10:00');
  assert.equal(deadlinesFor('phone', monday10).lateAt, '2026-11-23T15:00:00.000Z', 'Monday 17:00, as before');
  assert.equal(answerDeadlines(monday10).lateAt, '2026-11-23T15:00:00.000Z');
  const friday16 = '2026-11-27T14:00:00.000Z';    // Friday 16:00 Riga -> one working day = Monday 16:00
  assert.equal(deadlinesFor('gmail', friday16).lateAt, '2026-11-30T14:00:00.000Z');
});

test('6: a suggested reply from the answer to the closest earlier question; greeting, signature and quote cut; nothing when nothing is close', async () => {
  const { db, add } = await db0();
  await db.prepare("INSERT INTO people (id,name,email,status,owner,programme,created_at) VALUES ('p1','Old Person','old@gmail.com','Contacted','Admissions','NAV',?)").run(ago(900));
  const old = await add({ thread: 'O1', at: ago(800), state: 'qualified', person: 'p1', email: 'old@gmail.com', body: 'Kādi dokumenti vajadzīgi, lai pieteiktos navigācijas programmai?' });
  await db.prepare(`INSERT INTO mail_sent (external_id, thread_key, sent_at, to_email, subject, body, attachments, person_id, inbound_id, stored_at)
    VALUES ('o1','O1',?,'old@gmail.com','Re','Labdien, Pēter!\nVajadzīga pase, izglītības dokuments un medicīniskā izziņa.\n\nAr cieņu,\nIeva\n\nOn Mon, 1 Oct 2026 Old wrote:\n> jautājums',
      '[]','p1',?,?)`).run(ago(799), old, ago(799));
  auto.forgetPairs();
  const id = await add({ thread: 'N1', at: ago(1), email: 'new.example@gmail.com', body: 'Labdien! Kādi dokumenti vajadzīgi pieteikties navigācijai janvārī?' });
  const s = await auto.suggestedReply(db, id);
  assert.deepEqual(s, { text: 'Vajadzīga pase, izglītības dokuments un medicīniskā izziņa.', like: 1 }, 'no "Pēter", no signature, no quote');
  const other = await add({ thread: 'N2', at: ago(1), email: 'x.example@gmail.com', body: 'Vai jums ir stāvvieta automašīnai pie ēkas?' });
  assert.equal(await auto.suggestedReply(db, other), null);
  assert.ok(!/sendMail\(|messages\/send|\/drafts|fetch\(/.test(SRC), 'Intake never sends or drafts an email (no mail API, no fetch at all)');
});

test('5: willing to study - comes back only for a study question from a private mailbox', () => {
  const w = (email, text) => auto.willingToStudy({ email, text });
  assert.equal(w('a.example@gmail.com', 'Dear Admissions Team, I am a prospective applicant. What are the admission requirements?').back, true);
  assert.equal(w('a.example@hotmail.com', 'Please confirm the tuition and the refund terms before I apply').back, true, 'asking about refund rules is a study question');
  for (const [email, text, why] of [
    ['info@supplier.example.com', 'Admission enquiry for the programme', 'not a private mailbox'],
    ['noreply-x@gmail.com', 'Programme admission', 'a system sender'],
    ['a.example@gmail.com', 'Atgādinām par rēķinu apmaksu, Jūras koledža', 'an invoice'],
    ['a.example@gmail.com', 'Please find attached CV. Position — 2nd Engineer', 'a CV or job application'],
    ['a.example@gmail.com', 'Request for refund due to visa refusal, my admission', 'a refund or withdrawal'],
    ['a.example@inbox.lv', 'Interesējos par mācību ekskursiju 8. klasei', 'a visit or meeting'],
    ['a.example@gmail.com', 'On my SIS two courses are missing', 'a current student matter'],
    ['a.example@gmail.com', 'Can I get STCW certificates online?', 'a short course (Training Centre)'],
    ['a.example@gmail.com', 'Is this job offer real?', 'no study question'],
  ]) assert.deepEqual(w(email, text), { back: false, why }, text);
});

test('5: an auto-filtered email edu@ answered comes back and is processed only when willing to study; a hand set-aside stays', async () => {
  const { db, add } = await db0();
  const yes = await add({ thread: 'F1', at: ago(30), state: 'filtered', by: 'machine', reason: 'Filtered automatically', email: 'david.example@gmail.com', name: 'David Example',
    body: 'Inquiry about my eligibility and admission for non-EU students' });
  const no = await add({ thread: 'F2', at: ago(30), state: 'filtered', by: 'machine', reason: 'Filtered automatically', email: 'bill.example@gmail.com', body: 'Atgādinājums par rēķinu apmaksu' });
  const hand = await add({ thread: 'F3', at: ago(30), state: 'archived', by: 'Ieva', reason: 'Not a prospective student', email: 'eve.example@gmail.com', body: 'Admission enquiry for the Navigation programme' });
  for (const [s, t, to] of [['r1', 'F1', 'david.example@gmail.com'], ['r2', 'F2', 'bill.example@gmail.com'], ['r3', 'F3', 'eve.example@gmail.com']]) await recordSentMail(db, sent(s, t, ago(2), to));
  const y = await cardOf(db, yes);
  assert.equal(y.state, 'qualified'); assert.equal(y.processed_by, 'Intake');
  assert.equal((await person(db, y.person_id)).status, 'Contacted');
  assert.equal((await cardOf(db, no)).state, 'filtered', 'an invoice stays set aside');
  assert.equal((await cardOf(db, hand)).state, 'archived', 'a person\'s own set-aside stays');
  const h = await db.prepare(`SELECT action, actor FROM inbound_history WHERE inbound_id = ?`).all(yes);
  assert.deepEqual(h.map((x) => [x.action, x.actor]), [['brought_back', 'Intake']], 'the bring-back is logged');
});

test('7: the mailbox bar until the own mailbox is connected; Academy accounts only', async () => {
  const { db } = await db0();
  const me = { email: 'ieva.example@novikontas.org', areas: ['academy'] };
  assert.deepEqual(await connectBarFor(db, me), { show: true, connected: false });
  await db.prepare('INSERT INTO staff_mail_links (user_email, token, connected_at) VALUES (?,?,?)').run(me.email, 'g1.x.y.z', ago(1));
  assert.deepEqual(await connectBarFor(db, me), { show: false, connected: true });
  assert.deepEqual(await connectBarFor(db, { email: 'tc.example@novikontas.org', areas: ['tc'] }), { show: false, connected: false });
});

test('wired: routes behind sign-in, the screens as drawn', () => {
  for (const r of ['undo-stage$/', 'undo-auto$/', 'suggested-reply$/']) assert.ok(SERVER.includes(r), r);
  assert.ok(SERVER.includes("if (p === '/api/me/mailbox' && req.method === 'GET')"));
  assert.ok(APP.includes('Suggested reply · from ${tcN(s.like)} ${s.like === 1 ? \'answer\' : \'answers\'} like this'));
  assert.ok(APP.includes("onclick=\"event.stopPropagation();cSuggestCopy(") && !/cSuggestSend|send the suggested/i.test(APP), 'Copy only');
  assert.ok(APP.includes('<span class="ib-from">from the email</span>'));
  assert.ok(APP.includes('Made a lead by Intake · <button type="button" class="ib-undo" onclick="cUndoCard('));
  assert.ok(APP.includes('<b>Connect your mailbox</b><span>so Intake sees your replies too. Only mail with students is kept.</span>'));
  assert.ok(APP.includes('set by Intake from the email</span>') && APP.includes('Set by Intake from the email${m ? \' of \' + esc(m[1]) : \'\'} · <button'));
});
