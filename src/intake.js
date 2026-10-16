// The intake queue: where every inbound item lands, and where a person decides.
//
// Four rules this file exists to keep:
//   1. Nothing becomes a lead on its own.
//   2. An untouched raw contact surfaces the next day at 09:00, deterministically.
//   3. The message body is deleted the moment somebody qualifies or archives it.
//   4. A hot lead on a channel its new owner cannot reach raises a HANDOVER GAP,
//      because Ieva has no access to Instagram and the structured record is the
//      whole handover.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFrom, looksLikeJunk } from './extract.js';
import { logEvent, MANUAL, AUTOMATIC } from './history.js';
import { duplicateCheck, contactMatcher, onlyStrong, onePersonFor } from './identity.js';
import { localDate, localMidnight } from './bizday.js';
import { SIS_HOLDS_SQL } from './lifecycle.js';
import { rangesSql } from './yearscope.js';
import { markFor, markedWhy, contactKeys, MARKS } from './phonefilter.js';
import { emailBodyFor, isEmailChannel } from './emailtext.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));

const nowIso = () => new Date().toISOString();
// 'p' + 32 hex characters from crypto.randomUUID (security review 07.10.2026, L1). It was five characters of
// Math.random: guessable, and a clash failed the INSERT. Hex stays inside the old [a-z0-9] alphabet and
// nothing reads the length, so every route, link and hash takes it as it took the old ids.
export const newPersonId = () => 'p' + crypto.randomUUID().replace(/-/g, '');

// ------------------------------------------------------------- the ageing --
// WORKING HOURS (Q50, decided 05.10.2026; config.ageing). A message still waiting after one WORKING hour is
// "answer now" (amber); still waiting at the end of the working day that hour ends in, it is "late" (red).
// Mon-Fri 09:00-17:00 Riga: Friday 16:30 -> answer now Monday 09:30, late Monday 17:00; Saturday -> Monday 10:00
// and 17:00. "Answered" = the Inbox has handled it (state no longer new), until a real first-reply time exists.
// Pure and worked out from received_at, so a test asserts it without a clock and old rows follow the new rule.
const hm = (v, dflt) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || dflt)); return m ? Number(m[1]) * 60 + Number(m[2]) : 0; };
export function answerDeadlines(receivedIso, cfg = CFG.ageing) {
  const tz = cfg?.timezone || 'Europe/Riga';
  const days = cfg?.workdays || [1, 2, 3, 4, 5];
  const start = hm(cfg?.start, '09:00'), end = hm(cfg?.end, '17:00');
  const within = cfg?.answerWithinMinutes ?? 60;
  const received = new Date(receivedIso);
  let ymd = localDate(received, tz);
  const [y0, m0, d0] = ymd.split('-').map(Number);
  let min = Math.floor((received.getTime() - Date.parse(localMidnight(y0, m0, d0, tz))) / 60000);
  const weekday = (d) => { const w = new Date(d + 'T12:00:00Z').getUTCDay(); return w === 0 ? 7 : w; };   // Monday 1 .. Sunday 7
  const nextDay = (d) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd + 1)).toISOString().slice(0, 10); };
  const working = (d) => days.includes(weekday(d));
  // the first working moment at or after arrival
  if (!working(ymd) || min >= end) { do ymd = nextDay(ymd); while (!working(ymd)); min = start; } else if (min < start) min = start;
  // then the working minutes, carried over the evening and the weekend
  let left = within;
  while (left > end - min) { left -= end - min; do ymd = nextDay(ymd); while (!working(ymd)); min = start; }
  min += left;
  const at = (d, m) => { const [y, mo, dd] = d.split('-').map(Number); return new Date(Date.parse(localMidnight(y, mo, dd, tz)) + m * 60000).toISOString(); };
  return { answerBy: at(ymd, min), lateAt: at(ymd, end) };
}
// The late moment, stored on the row on arrival (surface_at) as before; every reader works it out again from
// received_at (answerDeadlines), so rows stored under the 23.09 rule read the new one.
export async function surfaceAt(receivedIso, cfg = CFG.ageing) {
  return answerDeadlines(receivedIso, cfg).lateAt;
}

// ------------------------------------------------------------ the routing --
// Explicit, so it is testable, and so neither dangerous extreme can happen by
// accident: everything landing on Ieva, or everything landing on Tetiana.
export const ownerFor = (qualification) => CFG.routing[qualification] || CFG.routing.unclear;
export const notifiedFor = (qualification) => CFG.notifications[qualification]?.notify || [];

// Who can actually open this channel.
//
// Access is recorded PER PERSON, because no role-shaped model can say "everybody
// except Tetiana has WhatsApp". A ROLE reaches a channel when at least one person
// holding that role can, and that is derived here rather than written down twice.
const ACCESS = (CFG.channelAccess && CFG.channelAccess.byPerson) || {};

export function personCanReach(person, channel) {
  const list = ACCESS[person];
  return Array.isArray(list) ? list.includes(channel) : false;
}

export function whoCanReach(channel) {
  return Object.keys(ACCESS).filter((who) => ACCESS[who].includes(channel));
}

// Accepts a person or a role. A role is answered by its people.
export async function canReach(who, channel) {
  if (ACCESS[who]) return personCanReach(who, channel);
  const holders = (CFG.users || []).filter((u) => u.role === who).map((u) => u.name);
  return holders.some((name) => personCanReach(name, channel));
}

// Ieva owns Admissions and has no Instagram. If a hot lead arrives there and we
// hold no email or phone, handing it over hands over something she cannot act on.
export async function handoverGap({ role, channel, email, phone }) {
  const reachable = (CFG.handoverRule.reachableFields || []).some(
    (f) => (f === 'email' ? email : phone));
  if (reachable) return null;
  if (await canReach(role, channel)) return null;
  const bridges = whoCanReach(channel);
  return {
    role, channel, bridges,
    problem: `${role} has no access to ${channel} and there is no email or phone on the record.`,
    action: bridges.length
      ? `Ask ${bridges.join(' or ')} for an email or a phone, or have them relay the reply.`
      : CFG.handoverRule.gapAction,
  };
}

// ---------------------------------------------------- one line per arrival ----
// A row is one thing to look at; a line is one arrival on it. Kinds are the four the
// channels actually produce: a message somebody typed, a call, a submitted form, and
// an activity we recorded about them (an open day, an event).
export const LINE_KINDS = ['message', 'call', 'form', 'activity'];

// Guessed from the channel when the caller does not say. A caller that knows better
// passes kind explicitly; nothing here ever overrules it.
const kindFor = (channel, kind) => {
  if (LINE_KINDS.includes(kind)) return kind;
  if (channel === 'phone') return 'call';
  if (channel === 'website_form' || channel === 'google_form' || channel === 'sis') return 'form';
  if (channel === 'open_day') return 'activity';
  return 'message';
};

// Appends a line and returns its seq. seq is read inside the same statement sequence
// as the insert, and (inbound_id, seq) is UNIQUE, so two arrivals racing for the same
// number lose one insert loudly instead of silently overwriting each other.
export async function addLine(db, inboundId, { channel, externalId, receivedAt, kind, body }) {
  const last = await db.prepare('SELECT MAX(seq) AS n FROM inbound_line WHERE inbound_id = ?').get(inboundId);
  const seq = Number((last && last.n) || 0) + 1;
  await db.prepare(`INSERT INTO inbound_line
    (inbound_id, seq, channel, external_id, received_at, kind, body)
    VALUES (?,?,?,?,?,?,?)`).run(
    inboundId, seq, channel, externalId || null, receivedAt, kindFor(channel, kind), body || null);
  return seq;
}

export const linesOf = (db, inboundId) =>
  db.prepare('SELECT * FROM inbound_line WHERE inbound_id = ? ORDER BY seq').all(inboundId);

// RETENTION, PER LINE (decided 01.10.2026). 13 months from the line's OWN received_at.
// The body is emptied, the line is kept: the row still shows that something arrived on
// that day, which is what makes a deletion auditable rather than invisible. An old line
// can never take a newer one with it, because every line is compared to its own clock.
export async function purgeLineBodies(db, cutoffIso) {
  const at = new Date().toISOString();
  const r = await db.prepare(`UPDATE inbound_line SET body = NULL, body_deleted_at = ?
    WHERE received_at < ? AND body IS NOT NULL`).run(at, cutoffIso);
  // and the row's own copy (set aside, filtered, and since Q76 a lead's message too), once the ROW and its NEWEST line
  // are both past the cutoff: before 07.10.2026 only the lines were emptied, so a kept row text outlived its 13 months.
  // The row's own age is required too: rows stored before lines existed (30.09-01.10) have NO lines, and "no line is
  // newer" alone would have emptied them at once (caught by MASTER CONTROL at the release check, 07.10.2026).
  await db.prepare(`UPDATE inbound SET body = NULL, body_deleted_at = ?
    WHERE state IN ('archived', 'filtered', 'qualified') AND body IS NOT NULL AND inbound.received_at < ?
      AND NOT EXISTS (SELECT 1 FROM inbound_line l WHERE l.inbound_id = inbound.id AND l.received_at >= ?)`).run(at, cutoffIso, cutoffIso);
  return (r && (r.changes ?? r.rowCount)) || 0;
}

// ------------------------------------------------------------- arrival ----
// Nothing here decides anything. It stores, extracts and suggests.
// Q74: the one person an address points at. Every email the person has counts (Q77). Two strong matches: nobody - a
// person decides.
// EVERY CHANNEL (the owner, 14.10.2026: a known person lands on their profile automatically, on every channel): the
// same question for an email address, a phone number or both (src/identity.js onePersonFor: email exact, phone last
// 8 digits). The result is what receive() takes as attachTo.
//   - TWO OR MORE people match: null, so the message KEEPS its Inbox card - the machine cannot choose safely; a person
//     does, and Make a lead's duplicate check shows who they are.
//   - A FINISHED person (Admitted, Not proceeding) counts too (the owner, 14.10.2026, B): their message lands on their
//     profile with Answer the question for their owner like anybody's, and no Inbox card. Their stage is never
//     touched: nothing reopens a finished person by machine. (The name is kept from Q74, when it meant "not finished".)
export async function activePersonFor(db, contact) {
  const { email, phone } = typeof contact === 'string' || contact == null ? { email: contact } : contact;
  const one = await onePersonFor(db, { email, phone });
  return one ? one.id : null;
}

// The steps a person getting in touch puts on their owner's list: a message's Answer the question (landOnProfile) and
// a missed call's Call back (src/sync.js). They are listed even for a finished person (the owner, 14.10.2026, B), while
// any other leftover step of a finished person stays off the lists (src/server.js STEP_LISTED_SQL).
export const ANSWER_STEP = 'Answer the question';
export const CALL_BACK_STEP = 'Call back';
export const IN_TOUCH_STEPS = [ANSWER_STEP, CALL_BACK_STEP];

export async function receive(db, item) {
  const at = item.receivedAt || nowIso();

  // an exact repeat of a message we already hold is arithmetic, not judgement.
  // BOTH tables: a second arrival on an existing row writes its external_id onto its
  // LINE, never onto `inbound`, so checking only `inbound` misses a repeat delivery of
  // everything after the first arrival.
  if (item.externalId) {
    const seen = await db.prepare('SELECT id FROM inbound WHERE channel = ? AND external_id = ?')
      .get(item.channel, item.externalId);
    if (seen) return { duplicate: true, id: seen.id };
    const line = await db.prepare('SELECT inbound_id FROM inbound_line WHERE channel = ? AND external_id = ?')
      .get(item.channel, item.externalId);
    if (line) return { duplicate: true, id: Number(line.inbound_id) };
  }

  // ONE THREAD, NOT ONE ROW PER ARRIVAL (Ritvars, 01.10.2026). A caller opts in with
  // joinOpenThread, and a second arrival on the same thread JOINS the row that is still
  // waiting instead of opening another. It lives HERE, not in a poller, because receive()
  // is the single entry point every channel goes through: a rule kept in one channel's
  // poller is a rule the next channel will not have.
  //
  // Only a row NOBODY HAS DEALT WITH YET absorbs it. Once it is qualified or set aside the
  // queue is empty for that thread again, so a later arrival is genuinely new.
  //
  // A row stored BEFORE thread keys existed has none, so it is matched by its number
  // instead; without that, every such row would be orphaned the day this shipped.
  //
  // THE CLOCK DOES NOT RESTART. received_at and surface_at are left alone on purpose:
  // somebody who keeps getting in touch has been waiting LONGER, and refreshing the
  // arrival time would push them down the queue and clear "late".
  if (item.joinOpenThread && item.threadKey) {
    const open = await db.prepare(`SELECT id, body FROM inbound WHERE channel = ? AND state = 'new'
      AND (thread_key = ? OR (thread_key IS NULL AND contact_phone = ?)) ORDER BY id DESC`)
      .get(item.channel, item.threadKey, item.phone || '');
    if (open) {
      // joinBody is how this arrival reads as a LATER one ("Rang again 11:31, ...").
      // Only the caller knows its own channel's wording, and only receive() knows that
      // it joined, so the caller hands in both and receive() picks.
      const line = item.joinBody || item.body || '';
      const body = [open.body || '', line].filter(Boolean).join('\n');
      await db.prepare('UPDATE inbound SET body = ? WHERE id = ?').run(body, open.id);
      // THE LINE CARRIES ITS OWN CLOCK. `at` is this arrival's time, not the row's, so
      // retention can delete this line 13 months after IT arrived without touching an
      // older or newer one. That is the whole reason the table exists.
      const seq = await addLine(db, open.id, { channel: item.channel, externalId: item.externalId,
        receivedAt: at, kind: item.kind, body: line });
      return { joined: true, id: open.id, seq };
    }
  }

  // Q74 RULE 2 (07.10.2026, Aigars: "email kkadu automatizaciju, sobrid visi emaili ienak inboxa"): the SAME
  // SENDER writing again while their first message still waits joins that card, so the Inbox holds one card per
  // person. The same join as a thread (a line with its own clock); only a row nobody has dealt with absorbs it.
  if (item.joinOpenSender && item.email) {
    const open = await db.prepare(`SELECT id, body FROM inbound WHERE channel = ? AND state = 'new'
      AND lower(contact_email) = ? ORDER BY id DESC`).get(item.channel, String(item.email).trim().toLowerCase());
    if (open) {
      const line = item.body || '';
      const joined = [open.body || '', line].filter(Boolean).join('\n');
      await db.prepare('UPDATE inbound SET body = ? WHERE id = ?').run(joined, open.id);
      const seq = await addLine(db, open.id, { channel: item.channel, externalId: item.externalId,
        receivedAt: at, kind: item.kind, body: line });
      return { joined: true, id: open.id, seq };
    }
  }

  const provided = {};
  if (item.email) provided.email = item.email;
  if (item.phone) provided.phone = item.phone;
  const read = extractFrom({ channel: item.channel, text: item.body, provided,
    answeredProgramme: item.answers && item.answers.form_programme });

  // Obvious junk is stored, so nothing disappears, but it never reaches the
  // queue and never costs anybody a second. Decided at the visual review.
  // A channel may also filter by a rule of its own (the phone, 01.10.2026: a number staff
  // already archived as spam). Stored the same way, with that rule as the reason.
  // A channel's own rule first (the phone, Mailchimp), then the shared one (Q31).
  // Q91 (13.10.2026): noFilter (edu@ mail a person gave the Admissions label) skips every filter, junk included:
  // "they are manually accepted by human. Rest goes through a filter."
  if (item.noFilter) read.junk = false;
  let filterWhy = item.noFilter ? null : (item.filterWhy || noiseWhy({ email: item.email, name: item.name, body: item.body }) || null);
  // A MARKED number or address (14.10.2026, one rule on every card): Supplier or vendor, Internal or Spam never reaches
  // the Inbox, on any channel. Set aside automatically, kept, with the mark as its reason.
  // THE MARK WINS over a known person (14.10.2026, known person on every channel): a marked address or number is set
  // aside even when it matches somebody in Intake (attachTo), so it never lands on a profile either. The phone pull
  // (src/sync.js storeCall) still looks for the person first, as it did before.
  if (!filterWhy && !item.noFilter) {
    const m = await markFor(db, { phone: item.phone, email: item.email });
    if (m) filterWhy = markedWhy(m);
  }
  const state = read.junk || filterWhy ? 'filtered' : 'new';
  // `source` records HOW this arrived. It defaults to null rather than to
  // 'provider': a row may only claim a real provider sent it when the caller
  // knows that for a fact, because the admin Channels panel treats that word as
  // proof a channel is connected.
  // A clash on inbound_channel_external means another delivery of this same event won
  // the race between the check above and this insert. That is a repeat, not an error,
  // and the caller is told exactly what it would have been told a moment earlier.
  let info;
  try {
    info = await db.prepare(`INSERT INTO inbound
    (channel, thread_key, external_id, received_at, surface_at, contact_name, contact_handle,
     contact_email, contact_phone, body, suggested, suggestion_why, state, source, attribution, consent)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    item.channel, item.threadKey || null, item.externalId || null, at, await surfaceAt(at),
    item.name || null, item.handle || null, item.email || null, item.phone || null,
    item.body || null, read.suggested, read.why, state, item.source || null,
    item.attribution ? JSON.stringify(item.attribution) : null,
    item.consent ? JSON.stringify(item.consent) : null);
  } catch (err) {
    const clash = /UNIQUE|duplicate key|unique constraint/i.test(String(err && err.message));
    if (!clash || !item.externalId) throw err;
    const seen = await db.prepare('SELECT id FROM inbound WHERE channel = ? AND external_id = ?')
      .get(item.channel, item.externalId);
    if (seen) return { duplicate: true, id: seen.id };
    throw err;
  }
  const id = Number(info.lastInsertRowid);
  // The first arrival is line 1. Written BEFORE the junk branch below, on purpose.
  await addLine(db, id, { channel: item.channel, externalId: item.externalId,
    receivedAt: at, kind: item.kind, body: item.body });

  if (read.junk) {
    // FILTERING DOES NOT DESTROY THE RECORD (decided 01.10.2026). The row's body is
    // emptied, as it always was, so nothing filtered shows a message on a screen. The
    // LINE keeps its body until retention takes it, so a filtered item is recoverable
    // and auditable - which is what makes a Filtered view a working view rather than a
    // list of things nobody can check.
    await db.prepare(`UPDATE inbound SET archive_reason = 'Filtered automatically',
      archive_note = ?, processed_by = 'machine', processed_at = ?, body = NULL,
      body_deleted_at = ? WHERE id = ?`).run(read.why, at, at, id);
  } else if (filterWhy) {
    // A channel's own filter KEEPS the body (Ritvars 01.10.2026, decision 1d: "filtering never
    // means immediate body deletion"; a filtered body is kept 13 months from its newest line).
    await db.prepare(`UPDATE inbound SET archive_reason = 'Filtered automatically',
      archive_note = ?, processed_by = 'machine', processed_at = ? WHERE id = ?`).run(filterWhy, at, id);
  }

  const stamp = db.prepare(`INSERT INTO field_values
    (person_id, inbound_id, field, value, provenance, recorded_at, recorded_by)
    VALUES (NULL,?,?,?,?,?,'machine')`);
  for (const f of read.fields) await stamp.run(id, f.field, f.value, f.provenance, at);
  // a form's own answers (the website, Q3): what the person picked, kept as they said it
  for (const [field, value] of Object.entries(item.answers || {})) await stamp.run(id, field, value, 'provider', at);

  // Q74 RULE 1: from somebody already in Intake (and still being worked with) it goes on THEIR history, not into the
  // Inbox (landOnProfile below). Since 14.10.2026 on every channel: the caller asks activePersonFor and passes the
  // answer as attachTo. A filter or a mark (above) wins: such a message is set aside, never put on a profile.
  if (item.attachTo && !read.junk && !filterWhy) {
    const pid = await landOnProfile(db, id, item.attachTo, { at });
    if (pid) {
      return { id, attached: true, personId: pid, suggested: read.suggested, why: read.why,
        missing: read.missing, fields: read.fields, filtered: false };
    }
  }

  return { id, suggested: read.suggested, why: read.why, missing: read.missing,
    fields: read.fields, filtered: Boolean(read.junk || filterWhy) };
}

// A KNOWN PERSON'S MESSAGE LANDS ON THEIR PROFILE (Q74 rule 1, 07.10.2026; every channel since 14.10.2026, the owner:
// "Already handled" is gone as a reason, so a known person lands on their profile automatically). It goes on THEIR
// history with an "Answer the question" step, not into the Inbox - the same as a known lead's missed call (02.10.2026):
// one open step on the person, owned by the person's owner, due when they wrote, so it is on that owner's Today. Kept
// as a row (state qualified, by the machine), so it is counted, its first reply is read, and nothing is lost.
// What a form brought reaches the person the way Add to them does: the values read off it stay with the person (a
// provider's answer fills an empty field only, a guess stays a guess) and a ticked consent box joins their consent
// record. Only a row still waiting (state new) moves. Returns the person's id, or null when nothing moved.
// A FINISHED person (Admitted, Not proceeding) the same (the owner, 14.10.2026, B): the message on their History and the
// step for their owner, listed on Due and Home even though they are finished; their stage is never changed.
// Callers: receive() (attachTo) and a lead form whose answers arrive after it (src/leadanswers.js).
export async function landOnProfile(db, id, personId, { at = nowIso() } = {}) {
  const item = await db.prepare('SELECT * FROM inbound WHERE id = ?').get(id);
  const p = personId ? await db.prepare('SELECT id, owner, status FROM people WHERE id = ?').get(personId) : null;
  if (!item || !p || item.state !== 'new') return null;
  const wrote = item.received_at || at;
  await db.prepare(`UPDATE inbound SET state = 'qualified', person_id = ?, processed_by = 'machine', processed_at = ?
    WHERE id = ?`).run(p.id, at, id);
  await db.prepare('UPDATE field_values SET person_id = ? WHERE inbound_id = ? AND person_id IS NULL').run(p.id, id);
  const given = await db.prepare(`SELECT field, value FROM field_values WHERE inbound_id = ? AND provenance = 'provider'
    ORDER BY id`).all(id);
  for (const f of given) await applyToPerson(db, p.id, f.field, f.value);
  await recordFormConsent(db, p.id, { channel: item.channel, consent: item.consent, inboundId: id, at: wrote,
    note: 'recorded when the message reached their profile' });
  // no event: the message itself is the History entry (messagesFor, Q76), so its text keeps the 13-month clock
  await db.prepare('UPDATE people SET last_contact_at = ? WHERE id = ? AND (last_contact_at IS NULL OR last_contact_at < ?)')
    .run(wrote, p.id, wrote);
  const open = await db.prepare('SELECT COUNT(*) n FROM tasks WHERE person_id = ? AND label = ? AND done_at IS NULL').get(p.id, ANSWER_STEP);
  if (!Number(open.n)) {
    await db.prepare('INSERT INTO tasks (person_id,label,due_at,owner,created_at) VALUES (?,?,?,?,?)')
      .run(p.id, ANSWER_STEP, wrote, p.owner || 'Admissions', at);
  }
  return p.id;
}

// ------------------------------------------------------------ what is here --
// 'notrelevant' is one screen over two stored states. A sales pitch the machine
// dropped and a message a person marked as not relevant are the same thing to
// whoever is looking; they stay apart in the database because the funnel counts
// real contacts and a sales pitch was never one.
const STATE_SETS = { notrelevant: ['archived', 'filtered'] };

// `ranges` is the year scope (Q45), a set of years since Q59 (src/yearscope.js): [from, to) pairs on the message's own
// arrival, received_at. `range`, one pair, is still read for a caller of the Q45 shape.
export async function listInbound(db, { state = 'new', now = nowIso(), range = null, ranges = range ? [range] : null } = {}) {
  const wanted = STATE_SETS[state] || (state ? [state] : []);
  const conds = [];
  if (wanted.length) conds.push(`i.state IN (${wanted.map(() => '?').join(',')})`);
  const [inRx, rxArgs] = ranges ? rangesSql('i.received_at', ranges) : ['', []];
  if (ranges) conds.push(inRx);
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const rows = await db.prepare(`SELECT i.*, pe.name AS person_name FROM inbound i
    LEFT JOIN people pe ON pe.id = i.person_id
    ${where} ORDER BY i.received_at DESC`).all(...wanted, ...rxArgs);
  const known = await currentStudentIndex(db);
  // Q77: a waiting message from somebody already in Intake JOINS them. Every email and phone the
  // person has counts, so a caller whose email was added when they became a lead is found again the
  // day they write. Only one strong match counts; two is a question for a person.
  const match = rows.some((r) => r.state === 'new' && !r.person_id) ? await contactMatcher(db) : null;
  const before = rows.some((r) => r.state === 'new') ? await setAsideIndex(db) : null;
  for (const r of rows) {
    // ONE RULE (14.10.2026): a card can be marked when it has a number or an address; a set-aside card says its mark;
    // a waiting card from somebody set aside before says when and by whom ("comes back")
    r.markable = contactKeys({ phone: r.contact_phone, email: r.contact_email }).length > 0;
    if (r.state !== 'new') {
      const m = r.markable ? await markFor(db, { phone: r.contact_phone, email: r.contact_email }) : null;
      r.mark = m ? m.mark : null;
    } else if (before) {
      r.setAsideBefore = before(r);
    }
    if (match && r.state === 'new' && !r.person_id) {
      const one = onlyStrong(match({ email: r.contact_email, phone: r.contact_phone }));
      r.joins = one ? { id: one.id, name: one.name } : null;
    }
    r.fields = await db.prepare('SELECT * FROM field_values WHERE inbound_id = ? ORDER BY id').all(r.id);
    r.missing = missingFor(r.fields);
    const due = answerDeadlines(r.received_at);
    r.answer_by = due.answerBy; r.late_at = due.lateAt;
    // Q92 (14.10.2026): a phone card says each call plainly: when, which line, answered (by whom) or missed
    if (r.channel === 'phone') r.calls = await callsFor(db, r.id);
    // an email card shows what the person newly wrote (16.10.2026), each joined email cleaned on its own; body stays
    // the stored text for "Show original" (src/emailtext.js)
    if (isEmailChannel(r.channel) && r.body) {
      const lines = await db.prepare('SELECT body FROM inbound_line WHERE inbound_id = ? ORDER BY seq').all(r.id);
      r.bodyClean = emailBodyFor(r.channel, r.body, lines.map((l) => l.body));
    }
    r.aged = r.state === 'new' && due.lateAt <= now;                    // late: red (Q50)
    r.answerNow = r.state === 'new' && !r.aged && due.answerBy <= now;  // answer now: amber
    Object.assign(r, senderKind(r, known));
  }
  return rows;
}

// The calls an Inbox item holds (the first and every "rang again"), newest first, from pbx_calls: the PBX's own fields.
// line = the phone menu's role for the queue ("Admissions"), else the queue as the PBX names it.
// talkSec / durationSec (14.10.2026): the talk time and the whole call in seconds, null when not known.
export async function callsFor(db, inboundId) {
  const menu = Object.values(CFG.phoneMenu || {});
  const rows = await db.prepare(`SELECT uniqueid, called_at, queue, picked_up, operator_name, duration_sec, talk_sec, note, note_by
    FROM pbx_calls WHERE inbound_id = ? ORDER BY called_at DESC`).all(inboundId);
  const sec = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
  return rows.map((c) => ({ id: c.uniqueid, at: c.called_at, line: ((menu.find((m) => m && m.queue === c.queue) || {}).role) || c.queue,
    answered: Boolean(Number(c.picked_up)), operator: c.operator_name || null,
    talkSec: sec(c.talk_sec), durationSec: sec(c.duration_sec), note: c.note || null, noteBy: c.note_by || null }));
}

// SET ASIDE BEFORE (14.10.2026, "comes back"): somebody set aside earlier who gets in touch again, on any channel, is
// in the Inbox like anyone new, and the card says "Set aside before: dd.mm, who, reason". Matched on the same keys as a mark
// (the number's last 8 digits, the address); only what a PERSON set aside counts (state archived), never a filter.
// Returns a lookup for one waiting row: the newest set-aside of an EARLIER card of the same number or address.
async function setAsideIndex(db) {
  const aside = await db.prepare(`SELECT id, contact_phone, contact_email, processed_at, processed_by, archive_reason FROM inbound
    WHERE state = 'archived' ORDER BY processed_at DESC, id DESC`).all();
  const byKey = new Map();
  for (const a of aside) {
    for (const k of contactKeys({ phone: a.contact_phone, email: a.contact_email })) {
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(a);
    }
  }
  return (r) => {
    let best = null;
    for (const k of contactKeys({ phone: r.contact_phone, email: r.contact_email })) {
      const hit = (byKey.get(k) || []).find((a) => Number(a.id) < Number(r.id));
      if (hit && (!best || String(hit.processed_at) > String(best.processed_at))) best = hit;
    }
    return best ? { at: best.processed_at, by: best.processed_by || null, reason: best.archive_reason || null } : null;
  };
}

// ------------------------------------------------- old calls, set aside once (Q92) --
// Ritvars, 14.10.2026: calls reached the Inbox a day late until the pull ran every minute, so the phone items that
// waited from before then are set aside ONCE, by an admin, with one reason. Kept, nothing deleted; each one logged in
// inbound_history and returned by Bring back like any set-aside. apply:false (the default) only says what it would do.
export const OLD_CALL_REASON = 'Old call, before calls were live';
export async function setAsideOldCalls(db, { before, apply = false, by, at = nowIso() } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(before || ''))) return { error: 'before must be a day, YYYY-MM-DD' };
  if (apply && !by) return { error: 'who is setting these aside?' };
  const cutoff = localMidnight(...before.split('-').map(Number));     // midnight in Riga, the start of that day
  const rows = await db.prepare(`SELECT id FROM inbound WHERE channel = 'phone' AND state = 'new' AND received_at < ?
    ORDER BY id`).all(cutoff);
  if (apply) {
    for (const { id } of rows) {
      await db.prepare(`UPDATE inbound SET state = 'archived', archive_reason = ?, archive_note = NULL, processed_by = ?,
        processed_at = ? WHERE id = ? AND state = 'new'`).run(OLD_CALL_REASON, by, at, id);
      await db.prepare(`INSERT INTO inbound_history (inbound_id, action, at, actor, reason, note)
        VALUES (?, 'set_aside', ?, ?, ?, ?)`).run(id, at, by, OLD_CALL_REASON, 'one-off admin action, Q92');
    }
    await db.prepare(`INSERT INTO sync_state (name, value, ran_at, detail) VALUES ('old_calls_set_aside', ?, ?, ?)
      ON CONFLICT (name) DO UPDATE SET value = excluded.value, ran_at = excluded.ran_at, detail = excluded.detail`)
      .run(String(rows.length), at, JSON.stringify({ before, cutoff, by, ids: rows.map((r) => r.id) }));
  }
  return { applied: Boolean(apply), before, cutoff, count: rows.length, reason: OLD_CALL_REASON };
}

// ------------------------------------- release the numbers once remembered as Not Admissions (rethink) --
// Ritvars, 14.10.2026: "Not Admissions" no longer remembers a number. Calls that the pull set aside BECAUSE their number
// had been set aside as "Not Admissions" come back to the Inbox, once, through Bring back (logged in inbound_history,
// actor = the admin). The card a person marked stays set aside: that was their decision about that call. apply:false
// (the default) only counts.
export const RELEASED_NOTE = 'this number was archived before as "Not Admissions"';
export async function releaseNotAdmissions(db, { apply = false, by, at = nowIso() } = {}) {
  if (apply && !by) return { error: 'who is releasing these?' };
  const rows = await db.prepare(`SELECT id FROM inbound WHERE channel = 'phone' AND state = 'filtered' AND archive_note = ?
    ORDER BY id`).all(RELEASED_NOTE);
  let back = 0;
  if (apply) {
    for (const { id } of rows) { const r = await bringBack(db, id, { by, at }); if (r && r.ok && !r.already) back++; }
    await db.prepare(`INSERT INTO sync_state (name, value, ran_at, detail) VALUES ('not_admissions_released', ?, ?, ?)
      ON CONFLICT (name) DO UPDATE SET value = excluded.value, ran_at = excluded.ran_at, detail = excluded.detail`)
      .run(String(back), at, JSON.stringify({ by, ids: rows.map((r) => r.id) }));
  }
  return { applied: Boolean(apply), count: rows.length, broughtBack: back };
}

// ---------------------------------------------------------- sender kind (Q31) --
// For the Inbox groups (Q30): current_student / possible_student / other, worked out on the server
// from config.senderKind. A grouping, never a fact about the person, so every row carries its why.
const normE = (v) => String(v || '').trim().toLowerCase();
const normP = (v) => String(v || '').replace(/[^\d+]/g, '');
async function currentStudentIndex(db, cfg = CFG.senderKind || {}) {
  const emails = new Set(); const phones = new Set(); const ids = new Set();
  const stages = cfg.currentStages || [];
  if (stages.length) {
    const ppl = await db.prepare(`SELECT id, email, phone FROM people WHERE status IN (${stages.map(() => '?').join(',')})`).all(...stages);
    for (const p of ppl) { ids.add(p.id); if (p.email) emails.add(normE(p.email)); if (normP(p.phone)) phones.add(normP(p.phone)); }
  }
  const sis = cfg.currentSisStatuses || [];
  if (sis.length) {
    const got = await db.prepare(`SELECT email, phone FROM sis_applicants WHERE status IN (${sis.map(() => '?').join(',')})`).all(...sis);
    for (const a of got) { if (a.email) emails.add(normE(a.email)); if (normP(a.phone)) phones.add(normP(a.phone)); }
  }
  return { emails, phones, ids };
}
export function senderKind(r, known = { emails: new Set(), phones: new Set(), ids: new Set() }, cfg = CFG.senderKind || {}) {
  if (r.state === 'filtered' || r.state === 'archived') {
    return { senderKind: 'other', senderKindWhy: r.archive_note || r.archive_reason || 'set aside' };
  }
  if ((r.person_id && known.ids.has(r.person_id)) || (r.contact_email && known.emails.has(normE(r.contact_email)))
      || (normP(r.contact_phone) && known.phones.has(normP(r.contact_phone)))) {
    return { senderKind: 'current_student', senderKindWhy: 'matches somebody already admitted' };
  }
  const text = String(r.body || '').toLowerCase();
  const word = (cfg.studentWords || []).find((w) => text.includes(String(w).toLowerCase()));
  if (word) return { senderKind: 'current_student', senderKindWhy: `writes "${word}"` };
  return { senderKind: 'possible_student', senderKindWhy: 'passed the filter' };
}

export function missingFor(fields) {
  const present = new Set(fields.filter((f) => f.value).map((f) => f.field));
  return (CFG.qualification.completionFields || []).filter((f) => !present.has(f));
}

// FIRST REPLY (07.10.2026): one thread read for an email enquiry. intake.js owns every write to inbound. sentAt = the
// Date of the first message edu@ sent after the enquiry, or null when there is none yet; the read is stamped either
// way. A reply on a row that is already a person goes into their History as an automatic outgoing email: the time
// only, no subject, no body, no recipients.
export async function recordReplyRead(db, { id, sentAt = null, checkedAt, personId = null }) {
  if (sentAt) {
    await db.prepare('UPDATE inbound SET first_reply_at = ?, reply_checked_at = ? WHERE id = ? AND first_reply_at IS NULL').run(sentAt, checkedAt, id);
    if (personId) await logEvent(db, { personId, kind: 'email', channel: 'email', direction: 'out', at: sentAt,
      origin: AUTOMATIC, actor: 'edu@', subject: 'Email reply sent' });
  } else {
    await db.prepare('UPDATE inbound SET reply_checked_at = ? WHERE id = ?').run(checkedAt, id);
  }
}

// A WHATSAPP REPLY FROM THE PHONE (coexistence, 07.10.2026): staff answered on the academy phone, Meta sent an
// smb_message_echoes copy. Its TIME becomes the first reply of that person's newest WhatsApp Inbox row asked before it,
// and a sent WhatsApp on their History when they are already a person; never its text, never an Inbox row.
const digitsOf = (v) => String(v || '').replace(/\D/g, '');
const samePhone = (a, b) => Boolean(a && b) && (a === b || (a.length >= 8 && b.endsWith(a)) || (b.length >= 8 && a.endsWith(b)));
export async function recordWhatsAppEcho(db, { to, at }) {
  const d = digitsOf(to);
  if (!d || !at) return { matched: false };
  const rows = await db.prepare(`SELECT id, person_id, contact_phone FROM inbound WHERE channel = 'whatsapp' AND received_at <= ?
    ORDER BY received_at DESC`).all(at);
  const row = rows.find((r) => samePhone(digitsOf(r.contact_phone), d)) || null;
  if (row) await db.prepare('UPDATE inbound SET first_reply_at = ?, reply_checked_at = ? WHERE id = ? AND first_reply_at IS NULL').run(at, at, row.id);
  let personId = row && row.person_id;
  if (!personId) {
    const ppl = await db.prepare('SELECT id, phone FROM people WHERE phone IS NOT NULL').all();
    personId = (ppl.find((p) => samePhone(digitsOf(p.phone), d)) || {}).id || null;
  }
  if (personId) {
    const subject = 'WhatsApp reply sent';
    const seen = await db.prepare('SELECT id FROM events WHERE person_id = ? AND subject = ? AND occurred_at = ?').get(personId, subject, at);
    if (!seen) await logEvent(db, { personId, kind: 'channel', channel: 'whatsapp', direction: 'out', at,
      origin: AUTOMATIC, actor: 'Academy WhatsApp', subject });
  }
  return { matched: Boolean(row || personId), inboundId: row ? row.id : null, personId: personId || null };
}

// the late ones (Q50), within the year scope (Q45) when one is asked for: by the message's own arrival
// (`ranges`: a set of [from, to) pairs, Q59; one pair of the Q45 shape is read too)
export async function agedCount(db, now = nowIso(), ranges = null) {
  const set = ranges && typeof ranges[0] === 'string' ? [ranges] : ranges;
  const [inRx, rxArgs] = set ? rangesSql('received_at', set) : ['1 = 1', []];
  const rows = await db.prepare(`SELECT received_at FROM inbound WHERE state = 'new' AND ${inRx}`).all(...rxArgs);
  return rows.filter((r) => answerDeadlines(r.received_at).lateAt <= now).length;
}

// What each person has waiting for them right now. This is the whole of the
// notification model: a count per role, and the same rows they would open anyway.
export async function waitingFor(db, role, now = nowIso()) {
  const mine = [];
  if (role === CFG.routing.unclear) {
    for (const r of await listInbound(db, { state: 'new', now })) mine.push({ kind: 'intake', ...r });
  }
  const leads = await db.prepare(`SELECT pe.* FROM people pe WHERE pe.qualification = 'lead' AND pe.owner = ?
    AND pe.status NOT IN (${(CFG.terminalStages || []).map(() => '?').join(',') || "''"})`)
    .all(role, ...(CFG.terminalStages || []));
  for (const p of leads) mine.push({ kind: 'lead', ...p });
  const overdue = await db.prepare(`SELECT t.*, pe.name FROM tasks t JOIN people pe ON pe.id = t.person_id
    WHERE t.done_at IS NULL AND t.due_at < ? AND t.owner = ?`).all(now, role);
  return {
    role,
    intake: mine.filter((m) => m.kind === 'intake').length,
    aged: mine.filter((m) => m.kind === 'intake' && m.aged).length,
    leads: leads.length,
    overdue: overdue.length,
    total: mine.length + overdue.length,
  };
}

// What an admin sees: the same thing for everybody, side by side. Aigars is not
// notified himself - he is shown who has what waiting.
export async function waitingByRole(db, now = nowIso()) {
  // Resolved first, filtered second. Filtering an array of promises keeps every
  // element - a Promise is always truthy - and r.total would be undefined.
  const rows = await Promise.all((CFG.owners || []).map((role) => waitingFor(db, role, now)));
  return rows.filter((r) => r.total > 0 || ['Marketing', 'Admissions'].includes(r.role));
}

// ------------------------------------------------------ the human decision --
// This is the only way an inbound item becomes a lead, and the only place the
// body is deleted.

// How many days an action is given comes from config.nextActions, so changing the
// pace of the process is a config edit and not a code change.
export function defaultDueFor(label, from = nowIso()) {
  const groups = CFG.nextActions || [];
  for (const g of groups) {
    for (const it of (g.items || [])) {
      if (it.label === label || it.id === label) {
        return new Date(Date.parse(from) + (it.days || 1) * 86400000).toISOString();
      }
    }
  }
  return new Date(Date.parse(from) + 86400000).toISOString();
}

// Where a new person came from, in words. An agent lead names its partner, from the
// token the partner signed in with, or says it was simulated when it was.
function sourceDetailOf(item) {
  let a = null;
  try { a = item.attribution ? JSON.parse(item.attribution) : null; } catch { a = null; }
  if (a && a.agent) {
    return `from ${item.channel} intake, partner ${a.agent}${a.agent_name ? ' (' + a.agent_name + ')' : ''}`
      + (a.verified ? '' : ', not verified');
  }
  return 'from ' + item.channel + ' intake';
}

export async function qualify(db, id, { qualification, personId, createPerson, by, note,
  confirmFields = [], stated = {}, nextAction, nextActionDue, differentPerson = false, cold = null }) {
  const item = await db.prepare('SELECT * FROM inbound WHERE id = ?').get(id);
  if (!item) return { error: 'not found' };
  if (item.state !== 'new') return { error: 'this item has already been dealt with' };
  const levels = CFG.qualification.levels.map((l) => l.id);
  if (!levels.includes(qualification)) return { error: 'unknown qualification: ' + qualification };
  if (!by) return { error: 'who is qualifying this?' };
  // Somebody who names the programme HAS said what they want. Letting that be
  // filed as 'nobody can tell yet' is how a person lands in Done and stops.
  if (String(stated.interest || '').trim() && qualification !== 'lead') {
    return { error: 'an interest was stated, so this is a lead' };
  }

  // Q77: the email or phone a colleague typed when making the lead. Checked, never guessed at.
  for (const k of ['email', 'phone']) stated[k] = String(stated[k] ?? '').trim() || undefined;
  if (stated.email && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(stated.email)) return { error: 'that email does not look right' };
  if (stated.phone && String(stated.phone).replace(/\D/g, '').length < 7) return { error: 'that phone number looks too short' };

  // The request has to make sense before the business gates are worth applying,
  // otherwise a malformed call is reported as a missing next step.
  if (!personId && !createPerson) return { error: 'link this to a person, or create one' };

  // Gate 1: a next step. config.nextActionRequired has been true since 23.09.2026
  // and this path never honoured it, so three demo leads reached the pipeline with
  // nobody scheduled to do anything. An active person always carries a next action,
  // an owner and a due date.
  // The rule is that a person ENDS UP with a next step, not that every message
  // adds one. A later message about somebody who already has an open task must
  // not stack a second one, or a chatty applicant collects a pile of duplicates.
  // Q86 (Admissions, 12.10.2026): Cold is the other answer to "what next" - the person is kept, closed as dormant
  if (CFG.nextActionRequired && !cold && !String(nextAction || '').trim()) {
    const alreadyHasOne = personId
      ? (await db.prepare('SELECT COUNT(*) n FROM tasks WHERE person_id = ? AND done_at IS NULL').get(personId)).n > 0
      : false;
    if (!alreadyHasOne) {
      return { error: 'a next step is required: every person we keep working with has one',
        nextActions: CFG.nextActions };
    }
  }

  // Gate 2: duplicates. config.duplicateRule.blockOnMatch has also been true since
  // 23.09.2026, and was applied only on the manual Add person screen. Qualifying
  // from a channel therefore created twins in silence.
  if (!personId && createPerson && !differentPerson) {
    const dup = await duplicateCheck(db, {
      email: item.contact_email || stated.email, phone: item.contact_phone || stated.phone, name: item.contact_name });
    if (dup.blocked) {
      return { error: 'this looks like somebody we already have', duplicate: true,
        matches: dup.matches, strong: dup.strong.length > 0 };
    }
  }

  const at = nowIso();
  let pid = personId || null;

  if (!pid && createPerson) {
    pid = newPersonId();
    const name = item.contact_name || item.contact_handle || 'Unknown contact';
    await db.prepare(`INSERT INTO people
      (id,name,email,phone,status,owner,source_channel,source_detail,created_at,last_contact_at,
       qualification,first_channel)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      pid, name, item.contact_email, item.contact_phone,
      CFG.stageRoles.first, ownerFor(qualification), item.channel,
      sourceDetailOf(item), item.received_at, item.received_at,
      qualification, item.channel);
    await logEvent(db, { personId: pid, kind: 'create', channel: item.channel, direction: 'note',
      at, origin: MANUAL, actor: by, subject: 'Created from intake',
      body: `${qualification} - ${item.suggestion_why}` });
  } else if (pid) {
    const before = await db.prepare('SELECT qualification, owner FROM people WHERE id = ?').get(pid);
    if (!before) return { error: 'person not found' };
    await db.prepare('UPDATE people SET qualification = ?, owner = ?, last_contact_at = ? WHERE id = ?')
      .run(qualification, ownerFor(qualification), at, pid);
    if (before.qualification !== qualification) {
      await logEvent(db, { personId: pid, kind: 'qualification', direction: 'note', at, origin: MANUAL,
        actor: by, subject: `Qualification: ${before.qualification || 'raw'} -> ${qualification}`,
        body: note || '', field: 'qualification', oldValue: before.qualification, newValue: qualification });
    }
  } else {
    return { error: 'link this to a person, or create one' };
  }

  // the extracted values move onto the person. Confirmed ones become facts;
  // the rest stay suggestions and stay out of every count.
  const confirm = new Set(confirmFields);
  const fields = await db.prepare('SELECT * FROM field_values WHERE inbound_id = ?').all(id);
  for (const f of fields) {
    const provenance = f.provenance === 'extracted' && confirm.has(f.field) ? 'confirmed' : f.provenance;
    await db.prepare(`INSERT INTO field_values
      (person_id, inbound_id, field, value, provenance, recorded_at, recorded_by, confirmed_at, confirmed_by)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(pid, id, f.field, f.value, provenance, at, by,
      provenance === 'confirmed' ? at : null, provenance === 'confirmed' ? by : null);
    if (provenance === 'confirmed' || provenance === 'provider') await applyToPerson(db, pid, f.field, f.value);
  }

  // What a person read off the conversation and typed in themselves. The machine
  // finds nothing in 'hello', so without this an operator could know exactly what
  // was wanted and still have nowhere to put it.
  for (const [field, raw] of Object.entries(stated || {})) {
    const value = String(raw ?? '').trim();
    if (!value) continue;
    await db.prepare(`INSERT INTO field_values
      (person_id, inbound_id, field, value, provenance, recorded_at, recorded_by, confirmed_at, confirmed_by)
      VALUES (?,?,?,?,'operator',?,?,?,?)`).run(pid, id, field, value, at, by, at, by);
    // A person saying it outranks a machine guessing it, so this one overwrites,
    // and the change is written into the history like any other edit.
    // An email or phone is the exception (Q77): it fills an EMPTY one and never replaces the one the
    // person has; kept on the person as a field, it still finds them (src/identity.js).
    await applyToPerson(db, pid, field, value, { by, at, force: !['email', 'phone'].includes(field) });
  }

  // Consent the person GAVE on the form becomes part of their consent record, whether they
  // are new or already known: consent is a record of acts, so it is added, never replaced.
  // Only a ticked box is recorded here. An unticked box is not a withdrawal - it may only
  // mean the form did not ask - so it stays on the lead row as the form sent it and is not
  // turned into a "withdrawn" on the person. A real withdrawal (a Mailchimp unsubscribe)
  // belongs to the consent route, not to New Leads (backlog, channel audit 28.09.2026).
  await recordFormConsent(db, pid, { channel: item.channel, consent: item.consent, inboundId: id, at: item.received_at,
    note: `recorded when ${by} added the lead` });

  // Q76 (07.10.2026, Aigars: "chain of communication with the lead jabut pieejamai profila"): making a lead KEEPS the
  // text, on the row and its lines, and the person's History shows it (messagesFor). The 13-month retention empties
  // it on time (purgeLineBodies). Reverses the 23.09 rule that deleted it the moment somebody made the lead.
  await db.prepare(`UPDATE inbound SET state = 'qualified', qualification = ?, person_id = ?,
    processed_by = ?, processed_at = ? WHERE id = ?`)
    .run(qualification, pid, by, at, id);

  await logEvent(db, { personId: pid, kind: 'note', channel: item.channel, direction: 'in', at,
    origin: MANUAL, actor: by, subject: `Qualified from ${item.channel} as ${qualification}`,
    body: note || item.suggestion_why });

  // HISTORY WITH PEOPLE (the owner, 14.10.2026: "we need some history with people in our app"): every earlier set-aside
  // of this number or address goes onto the person's History with its date, who and reason - once, however often the
  // person is added to.
  const keys = contactKeys({ phone: item.contact_phone, email: item.contact_email });
  if (keys.length) {
    const earlier = (await db.prepare(`SELECT id, channel, contact_phone, contact_email, archive_reason, processed_by, processed_at
      FROM inbound WHERE state = 'archived' AND id <> ? ORDER BY processed_at`).all(id))
      .filter((r) => contactKeys({ phone: r.contact_phone, email: r.contact_email }).some((k) => keys.includes(k)));
    for (const r of earlier) {
      const subject = 'Set aside' + (r.archive_reason ? ': ' + r.archive_reason : '');
      const had = await db.prepare(`SELECT 1 AS x FROM events WHERE person_id = ? AND subject = ? AND occurred_at = ?`)
        .get(pid, subject, r.processed_at || at);
      if (had) continue;
      await logEvent(db, { personId: pid, kind: 'note', channel: r.channel, direction: 'note', at: r.processed_at || at,
        origin: MANUAL, actor: r.processed_by || null, subject, body: '' });
    }
  }

  // CALL NOTES TRAVEL (14.10.2026): "What was it about?", typed on a phone card's answered calls, goes onto the person's
  // History with the lead, at the time of the call, under the name of whoever typed it.
  if (item.channel === 'phone') {
    const said = await db.prepare(`SELECT called_at, note, note_by FROM pbx_calls WHERE inbound_id = ?
      AND note IS NOT NULL AND note <> '' ORDER BY called_at`).all(id);
    for (const c of said) {
      await logEvent(db, { personId: pid, kind: 'note', channel: 'phone', direction: 'note', at: c.called_at,
        origin: MANUAL, actor: c.note_by || by, subject: CALL_NOTE_SUBJECT, body: c.note });
    }
  }

  // The next step, with an owner and a due date, so nobody can come to rest here.
  if (String(nextAction || '').trim()) {
    // Q72: the day staff set, when it is a real date; otherwise the step's own default
    const set = Date.parse(nextActionDue || '');
    const due = Number.isFinite(set) ? new Date(set).toISOString() : defaultDueFor(nextAction, at);
    await db.prepare('INSERT INTO tasks (person_id,label,due_at,owner,created_at) VALUES (?,?,?,?,?)')
      .run(pid, String(nextAction).trim(), due, ownerFor(qualification), at);
    await logEvent(db, { personId: pid, kind: 'task', direction: 'note', at, origin: MANUAL, actor: by,
      subject: `Next step: ${nextAction}`, body: `due ${localDate(due)}, ${ownerFor(qualification)}` });
  }

  // Q86: Cold - closed as Not proceeding, tagged cold, a reason only if one of the list was given; what was planned closes
  if (cold) {
    const closed = CFG.stageRoles.closed || 'Not proceeding';
    const reason = (CFG.closedReasons || []).includes(cold.reason) && !(CFG.closedReasonNeedsNote || []).includes(cold.reason) ? cold.reason : null;
    const was = (await db.prepare('SELECT status FROM people WHERE id = ?').get(pid)).status;
    await db.prepare('UPDATE people SET status = ?, closed_tag = ?, closed_reason = ? WHERE id = ?').run(closed, 'cold', reason, pid);
    await db.prepare("UPDATE tasks SET done_at = ?, outcome = ? WHERE person_id = ? AND done_at IS NULL").run(at, `closed: the person is ${closed}`, pid);
    await logEvent(db, { personId: pid, kind: 'status', direction: 'note', at, origin: MANUAL, actor: by,
      subject: `Status: ${was} -> ${closed} (Cold${reason ? ', ' + reason : ''})`, body: '',
      field: 'status', oldValue: was, newValue: closed });
  }

  if (item.channel === 'open_day') await registerOpenDay(db, id, { at });

  const person = await db.prepare('SELECT * FROM people WHERE id = ?').get(pid);
  const gap = qualification === 'lead'
    ? await handoverGap({ role: ownerFor(qualification), channel: item.channel,
      email: person.email, phone: person.phone })
    : null;

  return {
    ok: true, personId: pid, qualification, owner: ownerFor(qualification),
    notify: notifiedFor(qualification), bodyDeleted: true,
    missing: missingFor(fields), handoverGap: gap,
  };
}

// A consent box ticked on a form, onto the person's consent record (added, never replaced). One writer for both ways a
// message reaches a person: Make a lead / Add to them (qualify) and a known person's message landing on their profile
// (receive). `consent` is the row's JSON or the object a channel sent.
async function recordFormConsent(db, pid, { channel, consent, inboundId, at, note }) {
  let given = consent;
  if (typeof given === 'string') { try { given = JSON.parse(given); } catch { given = null; } }
  for (const [purpose, value] of Object.entries(given || {})) {
    if (value !== true || !['admissions', 'marketing', 'analytics', 'advertising'].includes(purpose)) continue;
    await db.prepare('INSERT INTO consents (person_id,purpose,state,basis,source,recorded_at,note) VALUES (?,?,?,?,?,?,?)')
      .run(pid, purpose, 'given', `ticked on the ${channel} form`, `inbound #${inboundId}`, at, note);
  }
}

// Only a fact may overwrite the person record. A suggestion never does.
async function applyToPerson(db, personId, field, value, opts = {}) {
  const map = { interest: 'programme', education: 'education', email: 'email', phone: 'phone' };
  const column = map[field];
  if (!column) return;
  const cur = await db.prepare(`SELECT ${column} v FROM people WHERE id = ?`).get(personId);
  if (!cur) return;
  const empty = cur.v === null || cur.v === '';
  // never overwrite something already there: first touch wins, as everywhere else.
  // The one exception is a value a PERSON stated, which outranks a machine guess.
  if (!empty && !opts.force) return;
  if (!empty && cur.v === value) return;
  await db.prepare(`UPDATE people SET ${column} = ? WHERE id = ?`).run(value, personId);
  if (!empty && opts.by) {
    await logEvent(db, { personId, kind: 'edit', direction: 'note', at: opts.at || nowIso(),
      origin: MANUAL, actor: opts.by, subject: `${column} set while qualifying`,
      field: column, oldValue: cur.v, newValue: value });
  }
}

// A New Leads item another system already settled (the SIS creating an application-first person):
// done, a lead, linked to the person, nobody pressed anything. Every write to inbound lives in this
// file, so the pollers never touch the table themselves.
// Since 07.10.2026 nothing a person decides empties a message: set aside keeps it ("Keep the text") and so does
// Make a lead (Q76, the History shows it). Only the SIS confirming an item still empties it here (confirmedBySystem:
// system text, not a conversation). Everything else waits for the 13-month retention (purgeLineBodies).
// WHAT THE PERSON WROTE (Q76): every message of theirs, one History entry each, newest first, read from the message
// rows themselves - never copied into events, which are kept for ever - so the 13-month retention empties it on time.
// A row with lines gives one entry per line (each arrival, with its own time); a row stored before lines existed
// gives its own text once.
export async function messagesFor(db, personId) {
  const rows = await db.prepare(`SELECT id, channel, received_at, body FROM inbound WHERE person_id = ?`).all(personId);
  const out = [];
  for (const r of rows) {
    const lines = await db.prepare(`SELECT id, received_at, body FROM inbound_line WHERE inbound_id = ? ORDER BY seq`).all(r.id);
    const parts = lines.length ? lines.map((l) => ({ key: 'line-' + l.id, at: l.received_at, body: l.body }))
      : [{ key: 'msg-' + r.id, at: r.received_at, body: r.body }];
    for (const x of parts) {
      if (!String(x.body || '').trim()) continue;
      out.push({ id: x.key, kind: 'message', channel: r.channel, direction: 'in', origin: 'inbound',   // what a person wrote, not 'automatic'
        occurred_at: x.at, subject: 'Wrote', body: x.body, inbound_id: Number(r.id),
        ...(isEmailChannel(r.channel) ? { bodyClean: emailBodyFor(r.channel, x.body) } : {}) });   // 16.10.2026, src/emailtext.js
    }
  }
  return out.sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)));
}

export async function dropLineBodies(db, inboundId, at) {
  await db.prepare(`UPDATE inbound_line SET body = NULL, body_deleted_at = ?
    WHERE inbound_id = ? AND body IS NOT NULL`).run(at, inboundId);
}

export async function confirmedBySystem(db, id, { personId, by, at = nowIso() }) {
  await db.prepare(`UPDATE inbound SET state = 'qualified', qualification = 'lead', person_id = ?,
    processed_by = ?, processed_at = ?, archive_reason = NULL, archive_note = NULL, body = NULL,
    body_deleted_at = ? WHERE id = ?`).run(personId, by, at, at, id);
  await dropLineBodies(db, id, at);
}

// SET ASIDE, ONE OF FOUR REASONS (the owner, 14.10.2026: seven reasons were too many, and "we need some history with
// people in our app"): Not a prospective student, Supplier or vendor, Internal, Spam (config intake.archiveReasons), the
// same on every card of every channel. Picking the reason is the one action: no free text, no Other. Supplier or vendor,
// Internal and Spam also MARK the card's number and address (markContact below). Every set-aside keeps its date, who and
// reason, on the row and in inbound_history. Rows set aside before keep the reason they were given. `note` is for the
// code's own callers (a mark says why it set a card aside); nobody types one.
const REASONS = () => CFG.intake.archiveReasons || [];
export async function archive(db, id, { reason, note, by, at = nowIso() } = {}) {
  const item = await db.prepare('SELECT * FROM inbound WHERE id = ?').get(id);
  if (!item) return { error: 'not found' };
  if (item.state !== 'new') return { error: 'this item has already been dealt with' };
  if (!by) return { error: 'who is setting this aside?' };
  if (!reason || !REASONS().includes(reason)) return { error: 'pick why: ' + REASONS().join(', '), reasons: REASONS() };
  await setAsideRow(db, id, { reason, note, by, at });
  const marked = MARKS.includes(reason) ? await markContact(db, item, { mark: reason, by, at }) : null;
  // archived is not deleted: the row, the contact and the reason stay searchable
  return { ok: true, id, reason, bodyDeleted: false, ...(marked ? { marked: marked.marked, setAside: marked.setAside } : {}) };
}

// The text STAYS (the owner, 07.10.2026, asked "Set aside: keep the message text?": "Keep the text"): set aside by a person
// is kept like a filtered message, until the 13-month retention takes it, so Bring back returns it whole.
async function setAsideRow(db, id, { reason, note, by, at }) {
  await db.prepare(`UPDATE inbound SET state = 'archived', archive_reason = ?, archive_note = ?,
    processed_by = ?, processed_at = ? WHERE id = ? AND state = 'new'`)
    .run(reason, note || null, by, at, id);
  await db.prepare(`INSERT INTO inbound_history (inbound_id, action, at, actor, reason, note)
    VALUES (?, 'set_aside', ?, ?, ?, ?)`).run(id, at, by, reason, note || null);
}

// ------------------------------------------------------------------ marks --
// A MARK (14.10.2026): Supplier or vendor, Internal or Spam on the card's phone number and email address, kept until
// somebody changes it. From then on that number or address never pops up and never reaches the Inbox (receive() sets
// it aside, src/callpop.js never pops it), and every card of it still waiting leaves the Inbox now, set aside with the
// mark as its reason, logged. Set by Set aside with one of those three, or by the Mark control where a set-aside card is
// listed and on a card that came back. Every user may, the same as Set aside.
export async function setMark(db, id, { mark, by, at = nowIso() } = {}) {
  const item = await db.prepare('SELECT * FROM inbound WHERE id = ?').get(id);
  if (!item) return { error: 'not found' };
  if (!by) return { error: 'who is marking this?' };
  if (!MARKS.includes(mark)) return { error: 'a mark is one of: ' + MARKS.join(', '), marks: MARKS };
  const r = await markContact(db, item, { mark, by, at });
  if (r.error) return r;
  return { ok: true, id, mark, ...r };
}

async function markContact(db, item, { mark, by, at }) {
  const keys = contactKeys({ phone: item.contact_phone, email: item.contact_email });
  if (!keys.length) return { error: 'there is no phone number or email address to mark' };
  for (const k of keys) await putMark(db, k, { mark, by, at, inboundId: item.id });
  await db.prepare(`INSERT INTO inbound_history (inbound_id, action, at, actor, reason, note)
    VALUES (?, 'marked', ?, ?, ?, ?)`).run(item.id, at, by, mark, keys.map((k) => k.split(':')[0]).join(', '));
  // a marked number or address never waits in the Inbox: its waiting cards are set aside with the mark, each logged
  const waiting = (await db.prepare(`SELECT id, contact_phone, contact_email FROM inbound WHERE state = 'new'`).all())
    .filter((r) => contactKeys({ phone: r.contact_phone, email: r.contact_email }).some((k) => keys.includes(k)));
  const setAside = [];
  for (const w of waiting) {
    await setAsideRow(db, w.id, { reason: mark, note: `marked "${mark}"`, by, at });
    setAside.push(Number(w.id));
  }
  return { marked: keys.map((k) => k.split(':')[0]), setAside };
}

// Remove mark: the number or address is ordinary again. Its set-aside cards stay where they are (Bring back is for
// those); the next contact reaches the Inbox. Also ends a number's old-style mark (set aside as Spam before 14.10).
export async function removeMark(db, id, { by, at = nowIso() } = {}) {
  const item = await db.prepare('SELECT * FROM inbound WHERE id = ?').get(id);
  if (!item) return { error: 'not found' };
  if (!by) return { error: 'who is removing this mark?' };
  const was = await markFor(db, { phone: item.contact_phone, email: item.contact_email });
  if (!was) return { ok: true, id, already: true };
  const keys = contactKeys({ phone: item.contact_phone, email: item.contact_email });
  for (const k of keys) await putMark(db, k, { mark: null, by, at, inboundId: id });
  await db.prepare(`INSERT INTO inbound_history (inbound_id, action, at, actor, reason, note)
    VALUES (?, 'unmarked', ?, ?, ?, ?)`).run(id, at, by, was.mark, keys.map((k) => k.split(':')[0]).join(', '));
  return { ok: true, id, removed: was.mark };
}

async function putMark(db, key, { mark, by, at, inboundId }) {
  await db.prepare(`INSERT INTO contact_marks (contact_key, mark, set_by, set_at, inbound_id) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (contact_key) DO UPDATE SET mark = excluded.mark, set_by = excluded.set_by, set_at = excluded.set_at,
    inbound_id = excluded.inbound_id`).run(key, mark, by, at, inboundId);
}

// ------------------------------------------------------------ call notes --
// "WHAT WAS IT ABOUT?" (14.10.2026): one line, typed after an answered call by whoever answered, saved on that call
// (pbx_calls). It shows under the call line on the phone card, goes onto the person's History with Make a lead, and on
// a known person's call it is added on their History's call entry. Plain text, one line, CALL_NOTE_MAX characters;
// every screen escapes it. An empty line clears it.
export const CALL_NOTE_MAX = 200;
// A known person's call is logged on their History by storeCall at the call's own time; that entry carries the call
// ({ id, answered, note }) so the same line can be read and added there.
export async function withCallNotes(db, personId, events) {
  const calls = await db.prepare('SELECT uniqueid, called_at, picked_up, note, note_by FROM pbx_calls WHERE person_id = ?').all(personId);
  if (!calls.length) return events;
  for (const e of events) {
    if (e.kind !== 'call' || e.origin !== 'automatic') continue;
    const c = calls.find((x) => x.called_at === e.occurred_at);
    if (c) e.call = { id: c.uniqueid, answered: Boolean(Number(c.picked_up)), note: c.note || null, noteBy: c.note_by || null };
  }
  return events;
}
export const CALL_NOTE_SUBJECT = 'What the call was about';
export async function setCallNote(db, callId, { note, by, at = nowIso() } = {}) {
  const call = await db.prepare('SELECT uniqueid, picked_up FROM pbx_calls WHERE uniqueid = ?').get(String(callId || ''));
  if (!call) return { error: 'not found' };
  if (!by) return { error: 'who is writing this?' };
  if (!Number(call.picked_up)) return { error: 'only an answered call has something to say' };
  const text = String(note ?? '').replace(/\s+/g, ' ').trim();
  if (text.length > CALL_NOTE_MAX) return { error: `one line, at most ${CALL_NOTE_MAX} characters` };
  await db.prepare('UPDATE pbx_calls SET note = ?, note_by = ?, note_at = ? WHERE uniqueid = ?')
    .run(text || null, text ? by : null, text ? at : null, call.uniqueid);
  return { ok: true, id: call.uniqueid, note: text || null };
}

// ------------------------------------------------------------ bring back --
// "Set aside: a way back" (the owner, 07.10.2026, on the finish line). A message a person set aside, or a rule
// filtered (a filter mistake is the likeliest case), returns to the Inbox as new, in its arrival-day column: the
// arrival time is never touched. Every user may, the same as Set aside. Logged in inbound_history with who, when and
// what the set-aside had said. Nothing is deleted. Since 07.10.2026 Set aside keeps the text, so it comes back whole;
// only messages set aside BEFORE that lost their text, and those return with name and channel (textKept:false).
// Nothing is recovered or invented.
// Asking again for a message already back is harmless: it says so and writes nothing.
export async function bringBack(db, id, { by, at = nowIso() } = {}) {
  const item = await db.prepare('SELECT * FROM inbound WHERE id = ?').get(id);
  if (!item) return { error: 'not found' };
  if (!by) return { error: 'who is bringing this back?' };
  if (item.state === 'new') return { ok: true, id, already: true };
  if (item.state !== 'archived' && item.state !== 'filtered') return { error: 'only a message set aside can come back' };
  let body = item.body;
  if (!body) {
    const lines = await db.prepare(`SELECT body FROM inbound_line WHERE inbound_id = ? AND body IS NOT NULL
      ORDER BY seq`).all(id);
    body = lines.map((l) => l.body).join('\n') || null;
  }
  await db.transaction(async (tx) => {
    await tx.prepare(`INSERT INTO inbound_history (inbound_id, action, at, actor, from_state, reason, note, earlier_actor, earlier_at)
      VALUES (?, 'brought_back', ?, ?, ?, ?, ?, ?, ?)`).run(id, at, by, item.state, item.archive_reason, item.archive_note,
      item.processed_by, item.processed_at);
    await tx.prepare(`UPDATE inbound SET state = 'new', archive_reason = NULL, archive_note = NULL, processed_by = NULL,
      processed_at = NULL, body = ?, body_deleted_at = ? WHERE id = ? AND state = ?`)
      .run(body, body ? null : item.body_deleted_at, id, item.state);
  });
  // A card set aside as Supplier or vendor, Internal or Spam marked its number and address (14.10.2026): bringing THAT
  // card back undoes the mark it made too (a wrong pick), logged. A mark set from another card stays.
  let unmarked = null;
  if (MARKS.includes(item.archive_reason)) {
    const keys = contactKeys({ phone: item.contact_phone, email: item.contact_email });
    const made = [];
    for (const k of keys) {
      const m = await db.prepare('SELECT mark FROM contact_marks WHERE contact_key = ? AND inbound_id = ? AND mark = ?').get(k, id, item.archive_reason);
      if (m) { await putMark(db, k, { mark: null, by, at, inboundId: id }); made.push(k.split(':')[0]); }
    }
    if (made.length) {
      unmarked = item.archive_reason;
      await db.prepare(`INSERT INTO inbound_history (inbound_id, action, at, actor, reason, note)
        VALUES (?, 'unmarked', ?, ?, ?, ?)`).run(id, at, by, unmarked, made.join(', '));
    }
  }
  return { ok: true, id, from: item.state, textKept: Boolean(body), ...(unmarked ? { unmarked } : {}) };
}

export async function inboundHistory(db, id) {
  return db.prepare('SELECT * FROM inbound_history WHERE inbound_id = ? ORDER BY id').all(id);
}

// ------------------------------------------------------------- the funnel --
// Counted from what actually happened. Nothing is modelled or estimated.
export async function funnel(db, now = nowIso()) {
  const n = async (sql, ...a) => (await db.prepare(sql).get(...a)).n;
  const stages = CFG.stages.map((s) => s.id);
  const terminal = CFG.terminalStages || [];

  // Promise.all, not just async: a .map with an async callback returns an array
  // of PROMISES. Nothing would throw - the funnel would simply have carried
  // unresolved objects into the report.
  const byStage = await Promise.all(stages.map(async (id) => ({
    stage: id,
    people: await n('SELECT COUNT(*) n FROM people WHERE status = ?', id),
    stuck: await n(`SELECT COUNT(*) n FROM people pe WHERE pe.status = ?
      AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.person_id = pe.id AND t.done_at IS NULL)
      AND pe.status NOT IN (${terminal.map(() => '?').join(',') || "''"})`, id, ...terminal),
  })));

  const steps = [
    { step: 'Contacted us', count: await n("SELECT COUNT(*) n FROM inbound WHERE state != 'filtered'"),
      go: '#/car' },
    { step: 'Waiting to be looked at', count: await n("SELECT COUNT(*) n FROM inbound WHERE state = 'new'"),
      go: '#/car' },
    { step: 'Became a lead', count: await n("SELECT COUNT(*) n FROM people WHERE qualification = 'lead'"),
      go: '#/people?q=&qual=lead' },
    { step: 'Application', count: await n('SELECT COUNT(*) n FROM people WHERE status = ?', CFG.stageRoles.application),
      go: '#/people' },
    { step: 'Admitted', count: await n('SELECT COUNT(*) n FROM people WHERE status = ?', CFG.stageRoles.admitted),
      go: '#/people' },
    { step: 'Handed to SIS', count: await n('SELECT COUNT(*) n FROM people WHERE sis_handoff_at IS NOT NULL'),
      go: '#/people' },
  ];

  const byChannel = await db.prepare(`SELECT channel,
      SUM(CASE WHEN state != 'filtered' THEN 1 ELSE 0 END) contacts,
      SUM(CASE WHEN qualification = 'lead' THEN 1 ELSE 0 END) leads,
      SUM(CASE WHEN state = 'new' THEN 1 ELSE 0 END) waiting
    FROM inbound GROUP BY channel
    HAVING SUM(CASE WHEN state != 'filtered' THEN 1 ELSE 0 END) > 0 ORDER BY contacts DESC`).all();

  const dropOut = await db.prepare(`SELECT closed_reason reason, COUNT(*) n FROM people
    WHERE status = ? AND closed_reason IS NOT NULL GROUP BY closed_reason ORDER BY n DESC`)
    .all(CFG.stageRoles.closed);
  const filtered = await n("SELECT COUNT(*) n FROM inbound WHERE state = 'filtered'");

  const active = byStage.filter((s) => !terminal.includes(s.stage));
  const biggest = active.slice().sort((a, b) => b.people - a.people)[0] || null;
  const mostStuck = active.slice().sort((a, b) => b.stuck - a.stuck)[0] || null;

  return {
    steps, byStage, byChannel, dropOut, filtered,
    biggestAccumulation: biggest && biggest.people ? biggest : null,
    mostStuck: mostStuck && mostStuck.stuck ? mostStuck : null,
    agedInbound: await agedCount(db, now),
    overdueActions: await n('SELECT COUNT(*) n FROM tasks WHERE done_at IS NULL AND due_at < ?', now),
    noNextAction: await n(`SELECT COUNT(*) n FROM people pe
      WHERE pe.status NOT IN (${terminal.map(() => '?').join(',') || "''"}) AND NOT ${SIS_HOLDS_SQL}
      AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.person_id = pe.id AND t.done_at IS NULL)`, ...terminal),
    honesty: 'Every number here is a count of rows that exist. Nothing is modelled, estimated or projected.',
  };
}

// ------------------------------------------------------------ open day ----
// C4 (Session C HANDOVER, fixed 30.09.2026). The booking tool sends a booking and, later, for the
// SAME booking_ref, whether the person came. That second message used to be dropped as a repeat.
// Now: a booking linked to a person is a registration on the Open Day list (the table the hand tick
// uses), and attendance from the tool updates it exactly as the hand tick does. Attendance that
// arrives before anybody linked the booking is kept on the New Leads item and applied at the link.
const CAME = new Set(['true', '1', 'yes', 'came', 'attended', 'jā', 'ja']);
const NOT_CAME = new Set(['false', '0', 'no', 'no_show', 'did_not_come', 'nē', 'ne']);
export function attendanceOf(v) {
  if (v === true) return 1;
  if (v === false) return 0;
  const t = String(v ?? '').trim().toLowerCase();
  if (CAME.has(t)) return 1;
  if (NOT_CAME.has(t)) return 0;
  return null;                                   // unreadable: ignored, never guessed
}

const lastField = async (db, inboundId, field) => {
  const r = await db.prepare(`SELECT value FROM field_values WHERE inbound_id = ? AND field = ?
    ORDER BY id DESC LIMIT 1`).get(inboundId, field);
  return r ? r.value : null;
};

/** What one Open Day delivery says, stored on its New Leads item. Returns true when attendance is
 *  new or changed. The slot is kept too, for the registration. */
export async function stampOpenDay(db, inboundId, { slot, attended, at = nowIso() }) {
  if (slot && !(await lastField(db, inboundId, 'open_day_slot'))) {
    await db.prepare(`INSERT INTO field_values (person_id, inbound_id, field, value, provenance, recorded_at, recorded_by)
      VALUES (NULL, ?, 'open_day_slot', ?, 'provider', ?, 'machine')`).run(inboundId, String(slot), at);
  }
  const a = attendanceOf(attended);
  if (a === null) return false;
  if ((await lastField(db, inboundId, 'attended')) === String(a)) return false;
  await db.prepare(`INSERT INTO field_values (person_id, inbound_id, field, value, provenance, recorded_at, recorded_by)
    VALUES (NULL, ?, 'attended', ?, 'provider', ?, 'machine')`).run(inboundId, String(a), at);
  return true;
}

/** Puts a linked Open Day booking on the Open Day list and applies the attendance the tool sent. */
export async function registerOpenDay(db, inboundId, { at = nowIso() } = {}) {
  const item = await db.prepare('SELECT * FROM inbound WHERE id = ?').get(inboundId);
  if (!item || item.channel !== 'open_day' || !item.person_id || !item.thread_key) return null;
  const dayId = item.thread_key;                 // the tool's event_id
  // The day itself: the tool's id is its name until somebody names it. The date is not known
  // from a booking, so it is left empty rather than guessed.
  await db.prepare(`INSERT INTO open_days (id, title, held_on, place) VALUES (?, ?, '', NULL)
    ON CONFLICT (id) DO NOTHING`).run(dayId, dayId);
  let reg = await db.prepare('SELECT * FROM registrations WHERE open_day_id = ? AND person_id = ?')
    .get(dayId, item.person_id);
  if (!reg) {
    await db.prepare('INSERT INTO registrations (open_day_id, person_id, slot, attended) VALUES (?,?,?,NULL)')
      .run(dayId, item.person_id, await lastField(db, inboundId, 'open_day_slot'));
    reg = await db.prepare('SELECT * FROM registrations WHERE open_day_id = ? AND person_id = ?').get(dayId, item.person_id);
  }
  const sent = await lastField(db, inboundId, 'attended');
  if (sent === null || String(reg.attended) === sent) return reg;
  const came = sent === '1';
  await db.prepare('UPDATE registrations SET attended = ? WHERE id = ?').run(came ? 1 : 0, reg.id);
  await logEvent(db, { personId: item.person_id, kind: 'note', channel: 'event', direction: 'note', at,
    origin: AUTOMATIC, actor: 'Open Day', subject: came ? 'Attended the visit' : 'Did not attend',
    body: 'sent by the Open Day booking tool' });
  const open = await db.prepare(`SELECT COUNT(*) n FROM tasks WHERE person_id = ? AND label = 'Follow up after the visit'`)
    .get(item.person_id);
  if (came && !Number(open.n)) {
    await db.prepare('INSERT INTO tasks (person_id,label,due_at,owner,created_at) VALUES (?,?,?,?,?)')
      .run(item.person_id, 'Follow up after the visit', new Date(Date.parse(at) + 2 * 86400000).toISOString(), 'Admissions', at);
  }
  return reg;
}

// ------------------------------------------------------------ SIS handoff --
export async function handoffToSis(db, personId, by) {
  const p = await db.prepare('SELECT * FROM people WHERE id = ?').get(personId);
  if (!p) return { error: 'not found' };
  if (p.status !== CFG.stageRoles.admitted) {
    return { error: `only an ${CFG.stageRoles.admitted} person is handed to the SIS` };
  }
  if (p.sis_handoff_at) return { error: 'already handed over', at: p.sis_handoff_at };
  const at = nowIso();
  await db.prepare('UPDATE people SET sis_handoff_at = ? WHERE id = ?').run(at, personId);
  await logEvent(db, { personId, kind: 'status', direction: 'note', at, origin: MANUAL, actor: by,
    subject: 'Handed over to the SIS',
    body: 'The Intake admissions journey ends here. The record stays for reporting.',
    field: 'sis_handoff_at', oldValue: null, newValue: at });
  return { ok: true, at };
}

export const CONFIG = CFG;

// ------------------------------------------------------------ the email filter --
// The edu@ filter (config.emailFilter, decided 01.10.2026 after the first real read). Returns the
// reason a message is set aside, or null for the Inbox. Kept, with the reason, never deleted.
export function emailFilterWhy(address, cfg = CFG.emailFilter) {
  if (!cfg || !address) return null;
  const [local, domain] = String(address).toLowerCase().split('@');
  if (!domain) return null;
  if ((cfg.internalDomains || []).includes(domain)) return `sent from our own address (@${domain})`;
  if (cfg.automaticSender && new RegExp(cfg.automaticSender, 'i').test(local)) return `an automatic sender (${local}@${domain})`;
  return null;
}

// Q31 (05.10.2026): the same rule on every channel, plus what the TEXT says it is (a Google Chat
// "messaged you while you were away", a Google Forms "has new responses"). The owner, on the
// production Inbox: "collaguese should not be there!", and of noreply / Google Chat / Google Forms:
// "Yes, filter them". Set aside with the reason, kept, never deleted.
export function noiseWhy({ email, name, body } = {}, cfg = CFG.emailFilter) {
  const byAddress = emailFilterWhy(email, cfg);
  if (byAddress) return byAddress;
  const text = [name, String(body || '').slice(0, 600)].filter(Boolean).join('\n');
  for (const p of (cfg && cfg.textPatterns) || []) {
    if (p && p.match && new RegExp(p.match, 'i').test(text)) return p.why || 'matches a filter rule';
  }
  // Q74 RULE 3: a newsletter. Its unsubscribe link sits at the END, so the whole message is read for it.
  if (cfg && cfg.newsletter && new RegExp(cfg.newsletter, 'i').test(String(body || ''))) return 'a newsletter (has an unsubscribe link)';
  return null;
}

// The same rule over email items still waiting in the Inbox (the 40 of the first read). Only an item
// nobody has dealt with; the body stays (decision 1d). Returns how many were set aside.
// Q31: over EVERY channel's waiting rows (the phone has its own rule), and it says what it would move
// before it moves anything: apply:false, the default, writes nothing. On production only on the owner's yes.
export async function refilterOpen(db, { apply = false, at = nowIso() } = {}) {
  // a message a person brought back stays back: the rule already had its say on it
  const open = await db.prepare(`SELECT id, channel, contact_email, contact_name, body FROM inbound i
    WHERE state = 'new' AND channel <> 'phone'
      AND NOT EXISTS (SELECT 1 FROM inbound_history h WHERE h.inbound_id = i.id AND h.action = 'brought_back')
    ORDER BY id`).all();
  const byReason = {};
  let n = 0;
  for (const r of open) {
    const why = noiseWhy({ email: r.contact_email, name: r.contact_name, body: r.body });
    if (!why) continue;
    const key = why.replace(/\s*\([^)]*\)$/, '');
    byReason[key] = (byReason[key] || 0) + 1;
    n++;
    if (apply) {
      await db.prepare(`UPDATE inbound SET state = 'filtered', archive_reason = 'Filtered automatically',
        archive_note = ?, processed_by = 'machine', processed_at = ? WHERE id = ? AND state = 'new'`).run(why, at, r.id);
    }
  }
  return { applied: Boolean(apply), checked: open.length, wouldMove: n, moved: apply ? n : 0, left: open.length - n, byReason };
}

export async function refilterOpenEmail(db, { at = nowIso() } = {}) {
  const open = await db.prepare("SELECT id, contact_email FROM inbound WHERE channel = 'gmail' AND state = 'new'").all();
  let moved = 0;
  for (const r of open) {
    const why = emailFilterWhy(r.contact_email);
    if (!why) continue;
    await db.prepare(`UPDATE inbound SET state = 'filtered', archive_reason = 'Filtered automatically',
      archive_note = ?, processed_by = 'machine', processed_at = ? WHERE id = ? AND state = 'new'`).run(why, at, r.id);
    moved++;
  }
  return { checked: open.length, setAside: moved, left: open.length - moved };
}
