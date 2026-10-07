// The intake queue: where every inbound item lands, and where a person decides.
//
// Four rules this file exists to keep:
//   1. Nothing becomes a lead on its own.
//   2. An untouched raw contact surfaces the next day at 09:00, deterministically.
//   3. The message body is deleted the moment somebody qualifies or archives it.
//   4. A hot lead on a channel its new owner cannot reach raises a HANDOVER GAP,
//      because Ieva has no access to Instagram and the structured record is the
//      whole handover.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFrom, looksLikeJunk } from './extract.js';
import { logEvent, MANUAL, AUTOMATIC } from './history.js';
import { duplicateCheck } from './identity.js';
import { localDate, localMidnight } from './bizday.js';
import { SIS_HOLDS_SQL } from './lifecycle.js';
import { rangesSql } from './yearscope.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));

const nowIso = () => new Date().toISOString();
export const newPersonId = () => 'p' + Math.random().toString(36).slice(2, 7);

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
  // and the row's own copy of a message nobody is working on (set aside or filtered), once its NEWEST line is past
  // the cutoff: before 07.10.2026 only the lines were emptied, so a kept row text outlived its 13 months
  await db.prepare(`UPDATE inbound SET body = NULL, body_deleted_at = ?
    WHERE state IN ('archived', 'filtered') AND body IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM inbound_line l WHERE l.inbound_id = inbound.id AND l.received_at >= ?)`).run(at, cutoffIso);
  return (r && (r.changes ?? r.rowCount)) || 0;
}

// ------------------------------------------------------------- arrival ----
// Nothing here decides anything. It stores, extracts and suggests.
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
  const filterWhy = item.filterWhy || noiseWhy({ email: item.email, name: item.name, body: item.body }) || null;
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

  return { id, suggested: read.suggested, why: read.why, missing: read.missing,
    fields: read.fields, filtered: Boolean(read.junk || filterWhy) };
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
  for (const r of rows) {
    r.fields = await db.prepare('SELECT * FROM field_values WHERE inbound_id = ? ORDER BY id').all(r.id);
    r.missing = missingFor(r.fields);
    const due = answerDeadlines(r.received_at);
    r.answer_by = due.answerBy; r.late_at = due.lateAt;
    r.aged = r.state === 'new' && due.lateAt <= now;                    // late: red (Q50)
    r.answerNow = r.state === 'new' && !r.aged && due.answerBy <= now;  // answer now: amber
    Object.assign(r, senderKind(r, known));
  }
  return rows;
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
  confirmFields = [], stated = {}, nextAction, nextActionDue, differentPerson = false }) {
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
  if (CFG.nextActionRequired && !String(nextAction || '').trim()) {
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
      email: item.contact_email, phone: item.contact_phone, name: item.contact_name });
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
    await applyToPerson(db, pid, field, value, { by, at, force: true });
  }

  // Consent the person GAVE on the form becomes part of their consent record, whether they
  // are new or already known: consent is a record of acts, so it is added, never replaced.
  // Only a ticked box is recorded here. An unticked box is not a withdrawal - it may only
  // mean the form did not ask - so it stays on the lead row as the form sent it and is not
  // turned into a "withdrawn" on the person. A real withdrawal (a Mailchimp unsubscribe)
  // belongs to the consent route, not to New Leads (backlog, channel audit 28.09.2026).
  let consent = null;
  try { consent = item.consent ? JSON.parse(item.consent) : null; } catch { consent = null; }
  for (const [purpose, value] of Object.entries(consent || {})) {
    if (value !== true || !['admissions', 'marketing', 'analytics', 'advertising'].includes(purpose)) continue;
    await db.prepare('INSERT INTO consents (person_id,purpose,state,basis,source,recorded_at,note) VALUES (?,?,?,?,?,?,?)')
      .run(pid, purpose, 'given', `ticked on the ${item.channel} form`, `inbound #${id}`, item.received_at,
        `recorded when ${by} added the lead`);
  }

  await db.prepare(`UPDATE inbound SET state = 'qualified', qualification = ?, person_id = ?,
    processed_by = ?, processed_at = ?, body = NULL, body_deleted_at = ? WHERE id = ?`)
    .run(qualification, pid, by, at, at, id);
  await dropLineBodies(db, id, at);

  await logEvent(db, { personId: pid, kind: 'note', channel: item.channel, direction: 'in', at,
    origin: MANUAL, actor: by, subject: `Qualified from ${item.channel} as ${qualification}`,
    body: note || item.suggestion_why });

  // The next step, with an owner and a due date, so nobody can come to rest here.
  if (String(nextAction || '').trim()) {
    const due = nextActionDue || defaultDueFor(nextAction, at);
    await db.prepare('INSERT INTO tasks (person_id,label,due_at,owner,created_at) VALUES (?,?,?,?,?)')
      .run(pid, String(nextAction).trim(), due, ownerFor(qualification), at);
    await logEvent(db, { personId: pid, kind: 'task', direction: 'note', at, origin: MANUAL, actor: by,
      subject: `Next step: ${nextAction}`, body: `due ${localDate(due)}, ${ownerFor(qualification)}` });
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
// Making a lead (qualify) deletes the message body the moment somebody dealt with it, and the lines go with it:
// the structured record is what lives on. Set aside did too until 07.10.2026, when the owner decided to keep the
// text there (asked "Set aside: keep the message text?": "Keep the text"), so a set-aside message can be brought
// back whole; it now waits for the 13-month retention like a filtered one. Qualify is unchanged.
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

export async function archive(db, id, { reason, note, by }) {
  const item = await db.prepare('SELECT * FROM inbound WHERE id = ?').get(id);
  if (!item) return { error: 'not found' };
  if (item.state !== 'new') return { error: 'this item has already been dealt with' };
  if (!by) return { error: 'who is archiving this?' };
  const allowed = CFG.intake.archiveReasons || [];
  if (!reason || !allowed.includes(reason)) return { error: 'a reason is required', reasons: allowed };
  if ((CFG.intake.archiveReasonNeedsNote || []).includes(reason) && !String(note || '').trim()) {
    return { error: `"${reason}" needs an explanation`, reasons: allowed, needsNote: true };
  }
  const at = nowIso();
  // The text STAYS (the owner, 07.10.2026, asked "Set aside: keep the message text?": "Keep the text"): set aside by a person
  // is kept like a filtered message, until the 13-month retention takes it, so Bring back returns it whole.
  await db.prepare(`UPDATE inbound SET state = 'archived', archive_reason = ?, archive_note = ?,
    processed_by = ?, processed_at = ? WHERE id = ?`)
    .run(reason, note || null, by, at, id);
  await db.prepare(`INSERT INTO inbound_history (inbound_id, action, at, actor, reason, note)
    VALUES (?, 'set_aside', ?, ?, ?, ?)`).run(id, at, by, reason, note || null);
  // archived is not deleted: the row, the contact and the reason stay searchable
  return { ok: true, id, reason, bodyDeleted: false };
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
  return { ok: true, id, from: item.state, textKept: Boolean(body) };
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
