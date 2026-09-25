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

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));

const nowIso = () => new Date().toISOString();
const newPersonId = () => 'p' + Math.random().toString(36).slice(2, 7);

// ------------------------------------------------------------- the ageing --
// "Inbound Monday 21:30, still untouched, surfaces Tuesday 09:00."
// Computed once on arrival and stored on the row, so a test can assert it
// without waiting for a clock, and so the rule cannot drift between readers.
export function surfaceAt(receivedIso, cfg = CFG.ageing) {
  const tz = cfg?.timezone || 'Europe/Riga';
  const hour = cfg?.hour ?? 9;
  const received = new Date(receivedIso);

  // what calendar day is it where the college is?
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(received);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const next = new Date(Date.UTC(get('year'), get('month') - 1, get('day') + 1, hour, 0, 0));

  // that was built as if the college were on UTC. Correct it by the real offset
  // on that day, so summer time cannot move the rule by an hour.
  return new Date(next.getTime() - offsetMinutes(next, tz) * 60000).toISOString();
}

function offsetMinutes(at, tz) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const g = (t) => Number(f.find((p) => p.type === t).value);
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second'));
  return Math.round((asUtc - at.getTime()) / 60000);
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
export function canReach(who, channel) {
  if (ACCESS[who]) return personCanReach(who, channel);
  const holders = (CFG.users || []).filter((u) => u.role === who).map((u) => u.name);
  return holders.some((name) => personCanReach(name, channel));
}

// Ieva owns Admissions and has no Instagram. If a hot lead arrives there and we
// hold no email or phone, handing it over hands over something she cannot act on.
export function handoverGap({ role, channel, email, phone }) {
  const reachable = (CFG.handoverRule.reachableFields || []).some(
    (f) => (f === 'email' ? email : phone));
  if (reachable) return null;
  if (canReach(role, channel)) return null;
  const bridges = whoCanReach(channel);
  return {
    role, channel, bridges,
    problem: `${role} has no access to ${channel} and there is no email or phone on the record.`,
    action: bridges.length
      ? `Ask ${bridges.join(' or ')} for an email or a phone, or have them relay the reply.`
      : CFG.handoverRule.gapAction,
  };
}

// ------------------------------------------------------------- arrival ----
// Nothing here decides anything. It stores, extracts and suggests.
export function receive(db, item) {
  const at = item.receivedAt || nowIso();

  // an exact repeat of a message we already hold is arithmetic, not judgement
  if (item.externalId) {
    const seen = db.prepare('SELECT id FROM inbound WHERE channel = ? AND external_id = ?')
      .get(item.channel, item.externalId);
    if (seen) return { duplicate: true, id: seen.id };
  }

  const provided = {};
  if (item.email) provided.email = item.email;
  if (item.phone) provided.phone = item.phone;
  const read = extractFrom({ channel: item.channel, text: item.body, provided });

  // Obvious junk is stored, so nothing disappears, but it never reaches the
  // queue and never costs anybody a second. Decided at the visual review.
  const state = read.junk ? 'filtered' : 'new';
  // `source` records HOW this arrived. It defaults to null rather than to
  // 'provider': a row may only claim a real provider sent it when the caller
  // knows that for a fact, because the admin Channels panel treats that word as
  // proof a channel is connected.
  const info = db.prepare(`INSERT INTO inbound
    (channel, thread_key, external_id, received_at, surface_at, contact_name, contact_handle,
     contact_email, contact_phone, body, suggested, suggestion_why, state, source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    item.channel, item.threadKey || null, item.externalId || null, at, surfaceAt(at),
    item.name || null, item.handle || null, item.email || null, item.phone || null,
    item.body || null, read.suggested, read.why, state, item.source || null);
  const id = Number(info.lastInsertRowid);
  if (read.junk) {
    db.prepare(`UPDATE inbound SET archive_reason = 'Filtered automatically',
      archive_note = ?, processed_by = 'machine', processed_at = ?, body = NULL,
      body_deleted_at = ? WHERE id = ?`).run(read.why, at, at, id);
  }

  const stamp = db.prepare(`INSERT INTO field_values
    (person_id, inbound_id, field, value, provenance, recorded_at, recorded_by)
    VALUES (NULL,?,?,?,?,?,'machine')`);
  for (const f of read.fields) stamp.run(id, f.field, f.value, f.provenance, at);

  return { id, suggested: read.suggested, why: read.why, missing: read.missing,
    fields: read.fields, filtered: Boolean(read.junk) };
}

// ------------------------------------------------------------ what is here --
// 'notrelevant' is one screen over two stored states. A sales pitch the machine
// dropped and a message a person marked as not relevant are the same thing to
// whoever is looking; they stay apart in the database because the funnel counts
// real contacts and a sales pitch was never one.
const STATE_SETS = { notrelevant: ['archived', 'filtered'] };

export function listInbound(db, { state = 'new', now = nowIso() } = {}) {
  const wanted = STATE_SETS[state] || (state ? [state] : []);
  const where = wanted.length ? `WHERE i.state IN (${wanted.map(() => '?').join(',')})` : '';
  const rows = db.prepare(`SELECT i.*, pe.name AS person_name FROM inbound i
    LEFT JOIN people pe ON pe.id = i.person_id
    ${where} ORDER BY i.received_at DESC`).all(...wanted);
  for (const r of rows) {
    r.fields = db.prepare('SELECT * FROM field_values WHERE inbound_id = ? ORDER BY id').all(r.id);
    r.missing = missingFor(r.fields);
    r.aged = r.state === 'new' && r.surface_at <= now;
  }
  return rows;
}

export function missingFor(fields) {
  const present = new Set(fields.filter((f) => f.value).map((f) => f.field));
  return (CFG.qualification.completionFields || []).filter((f) => !present.has(f));
}

export function agedCount(db, now = nowIso()) {
  return db.prepare("SELECT COUNT(*) n FROM inbound WHERE state = 'new' AND surface_at <= ?").get(now).n;
}

// What each person has waiting for them right now. This is the whole of the
// notification model: a count per role, and the same rows they would open anyway.
export function waitingFor(db, role, now = nowIso()) {
  const mine = [];
  if (role === CFG.routing.unclear) {
    for (const r of listInbound(db, { state: 'new', now })) mine.push({ kind: 'intake', ...r });
  }
  const leads = db.prepare(`SELECT pe.* FROM people pe WHERE pe.qualification = 'lead' AND pe.owner = ?
    AND pe.status NOT IN (${(CFG.terminalStages || []).map(() => '?').join(',') || "''"})`)
    .all(role, ...(CFG.terminalStages || []));
  for (const p of leads) mine.push({ kind: 'lead', ...p });
  const overdue = db.prepare(`SELECT t.*, pe.name FROM tasks t JOIN people pe ON pe.id = t.person_id
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
export function waitingByRole(db, now = nowIso()) {
  return (CFG.owners || []).map((role) => waitingFor(db, role, now))
    .filter((r) => r.total > 0 || ['Marketing', 'Admissions'].includes(r.role));
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

export function qualify(db, id, { qualification, personId, createPerson, by, note,
  confirmFields = [], stated = {}, nextAction, nextActionDue, differentPerson = false }) {
  const item = db.prepare('SELECT * FROM inbound WHERE id = ?').get(id);
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
      ? db.prepare('SELECT COUNT(*) n FROM tasks WHERE person_id = ? AND done_at IS NULL').get(personId).n > 0
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
    const dup = duplicateCheck(db, {
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
    db.prepare(`INSERT INTO people
      (id,name,email,phone,status,owner,source_channel,source_detail,created_at,last_contact_at,
       qualification,first_channel)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      pid, name, item.contact_email, item.contact_phone,
      CFG.stageRoles.first, ownerFor(qualification), item.channel,
      'from ' + item.channel + ' intake', item.received_at, item.received_at,
      qualification, item.channel);
    logEvent(db, { personId: pid, kind: 'create', channel: item.channel, direction: 'note',
      at, origin: MANUAL, actor: by, subject: 'Created from intake',
      body: `${qualification} - ${item.suggestion_why}` });
  } else if (pid) {
    const before = db.prepare('SELECT qualification, owner FROM people WHERE id = ?').get(pid);
    if (!before) return { error: 'person not found' };
    db.prepare('UPDATE people SET qualification = ?, owner = ?, last_contact_at = ? WHERE id = ?')
      .run(qualification, ownerFor(qualification), at, pid);
    if (before.qualification !== qualification) {
      logEvent(db, { personId: pid, kind: 'qualification', direction: 'note', at, origin: MANUAL,
        actor: by, subject: `Qualification: ${before.qualification || 'raw'} -> ${qualification}`,
        body: note || '', field: 'qualification', oldValue: before.qualification, newValue: qualification });
    }
  } else {
    return { error: 'link this to a person, or create one' };
  }

  // the extracted values move onto the person. Confirmed ones become facts;
  // the rest stay suggestions and stay out of every count.
  const confirm = new Set(confirmFields);
  const fields = db.prepare('SELECT * FROM field_values WHERE inbound_id = ?').all(id);
  for (const f of fields) {
    const provenance = f.provenance === 'extracted' && confirm.has(f.field) ? 'confirmed' : f.provenance;
    db.prepare(`INSERT INTO field_values
      (person_id, inbound_id, field, value, provenance, recorded_at, recorded_by, confirmed_at, confirmed_by)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(pid, id, f.field, f.value, provenance, at, by,
      provenance === 'confirmed' ? at : null, provenance === 'confirmed' ? by : null);
    if (provenance === 'confirmed' || provenance === 'provider') applyToPerson(db, pid, f.field, f.value);
  }

  // What a person read off the conversation and typed in themselves. The machine
  // finds nothing in 'hello', so without this an operator could know exactly what
  // was wanted and still have nowhere to put it.
  for (const [field, raw] of Object.entries(stated || {})) {
    const value = String(raw ?? '').trim();
    if (!value) continue;
    db.prepare(`INSERT INTO field_values
      (person_id, inbound_id, field, value, provenance, recorded_at, recorded_by, confirmed_at, confirmed_by)
      VALUES (?,?,?,?,'operator',?,?,?,?)`).run(pid, id, field, value, at, by, at, by);
    // A person saying it outranks a machine guessing it, so this one overwrites,
    // and the change is written into the history like any other edit.
    applyToPerson(db, pid, field, value, { by, at, force: true });
  }

  db.prepare(`UPDATE inbound SET state = 'qualified', qualification = ?, person_id = ?,
    processed_by = ?, processed_at = ?, body = NULL, body_deleted_at = ? WHERE id = ?`)
    .run(qualification, pid, by, at, at, id);

  logEvent(db, { personId: pid, kind: 'note', channel: item.channel, direction: 'in', at,
    origin: MANUAL, actor: by, subject: `Qualified from ${item.channel} as ${qualification}`,
    body: note || item.suggestion_why });

  // The next step, with an owner and a due date, so nobody can come to rest here.
  if (String(nextAction || '').trim()) {
    const due = nextActionDue || defaultDueFor(nextAction, at);
    db.prepare('INSERT INTO tasks (person_id,label,due_at,owner,created_at) VALUES (?,?,?,?,?)')
      .run(pid, String(nextAction).trim(), due, ownerFor(qualification), at);
    logEvent(db, { personId: pid, kind: 'task', direction: 'note', at, origin: MANUAL, actor: by,
      subject: `Next step: ${nextAction}`, body: `due ${due.slice(0, 10)}, ${ownerFor(qualification)}` });
  }

  const person = db.prepare('SELECT * FROM people WHERE id = ?').get(pid);
  const gap = qualification === 'lead'
    ? handoverGap({ role: ownerFor(qualification), channel: item.channel,
      email: person.email, phone: person.phone })
    : null;

  return {
    ok: true, personId: pid, qualification, owner: ownerFor(qualification),
    notify: notifiedFor(qualification), bodyDeleted: true,
    missing: missingFor(fields), handoverGap: gap,
  };
}

// Only a fact may overwrite the person record. A suggestion never does.
function applyToPerson(db, personId, field, value, opts = {}) {
  const map = { interest: 'programme', education: 'education', email: 'email', phone: 'phone' };
  const column = map[field];
  if (!column) return;
  const cur = db.prepare(`SELECT ${column} v FROM people WHERE id = ?`).get(personId);
  if (!cur) return;
  const empty = cur.v === null || cur.v === '';
  // never overwrite something already there: first touch wins, as everywhere else.
  // The one exception is a value a PERSON stated, which outranks a machine guess.
  if (!empty && !opts.force) return;
  if (!empty && cur.v === value) return;
  db.prepare(`UPDATE people SET ${column} = ? WHERE id = ?`).run(value, personId);
  if (!empty && opts.by) {
    logEvent(db, { personId, kind: 'edit', direction: 'note', at: opts.at || nowIso(),
      origin: MANUAL, actor: opts.by, subject: `${column} set while qualifying`,
      field: column, oldValue: cur.v, newValue: value });
  }
}

export function archive(db, id, { reason, note, by }) {
  const item = db.prepare('SELECT * FROM inbound WHERE id = ?').get(id);
  if (!item) return { error: 'not found' };
  if (item.state !== 'new') return { error: 'this item has already been dealt with' };
  if (!by) return { error: 'who is archiving this?' };
  const allowed = CFG.intake.archiveReasons || [];
  if (!reason || !allowed.includes(reason)) return { error: 'a reason is required', reasons: allowed };
  if ((CFG.intake.archiveReasonNeedsNote || []).includes(reason) && !String(note || '').trim()) {
    return { error: `"${reason}" needs an explanation`, reasons: allowed, needsNote: true };
  }
  const at = nowIso();
  db.prepare(`UPDATE inbound SET state = 'archived', archive_reason = ?, archive_note = ?,
    processed_by = ?, processed_at = ?, body = NULL, body_deleted_at = ? WHERE id = ?`)
    .run(reason, note || null, by, at, at, id);
  // archived is not deleted: the row, the contact and the reason stay searchable
  return { ok: true, id, reason, bodyDeleted: true };
}

// ------------------------------------------------------------- the funnel --
// Counted from what actually happened. Nothing is modelled or estimated.
export function funnel(db, now = nowIso()) {
  const n = (sql, ...a) => db.prepare(sql).get(...a).n;
  const stages = CFG.stages.map((s) => s.id);
  const terminal = CFG.terminalStages || [];

  const byStage = stages.map((id) => ({
    stage: id,
    people: n('SELECT COUNT(*) n FROM people WHERE status = ?', id),
    stuck: n(`SELECT COUNT(*) n FROM people pe WHERE pe.status = ?
      AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.person_id = pe.id AND t.done_at IS NULL)
      AND pe.status NOT IN (${terminal.map(() => '?').join(',') || "''"})`, id, ...terminal),
  }));

  const steps = [
    { step: 'Contacted us', count: n("SELECT COUNT(*) n FROM inbound WHERE state != 'filtered'"),
      go: '#/car' },
    { step: 'Waiting to be looked at', count: n("SELECT COUNT(*) n FROM inbound WHERE state = 'new'"),
      go: '#/car' },
    { step: 'Became a lead', count: n("SELECT COUNT(*) n FROM people WHERE qualification = 'lead'"),
      go: '#/people?q=&qual=lead' },
    { step: 'Application', count: n('SELECT COUNT(*) n FROM people WHERE status = ?', CFG.stageRoles.application),
      go: '#/people' },
    { step: 'Admitted', count: n('SELECT COUNT(*) n FROM people WHERE status = ?', CFG.stageRoles.admitted),
      go: '#/people' },
    { step: 'Handed to SIS', count: n('SELECT COUNT(*) n FROM people WHERE sis_handoff_at IS NOT NULL'),
      go: '#/people' },
  ];

  const byChannel = db.prepare(`SELECT channel,
      SUM(CASE WHEN state != 'filtered' THEN 1 ELSE 0 END) contacts,
      SUM(CASE WHEN qualification = 'lead' THEN 1 ELSE 0 END) leads,
      SUM(CASE WHEN state = 'new' THEN 1 ELSE 0 END) waiting
    FROM inbound GROUP BY channel HAVING contacts > 0 ORDER BY contacts DESC`).all();

  const dropOut = db.prepare(`SELECT closed_reason reason, COUNT(*) n FROM people
    WHERE status = ? AND closed_reason IS NOT NULL GROUP BY closed_reason ORDER BY n DESC`)
    .all(CFG.stageRoles.closed);
  const filtered = n("SELECT COUNT(*) n FROM inbound WHERE state = 'filtered'");

  const active = byStage.filter((s) => !terminal.includes(s.stage));
  const biggest = active.slice().sort((a, b) => b.people - a.people)[0] || null;
  const mostStuck = active.slice().sort((a, b) => b.stuck - a.stuck)[0] || null;

  return {
    steps, byStage, byChannel, dropOut, filtered,
    biggestAccumulation: biggest && biggest.people ? biggest : null,
    mostStuck: mostStuck && mostStuck.stuck ? mostStuck : null,
    agedInbound: agedCount(db, now),
    overdueActions: n('SELECT COUNT(*) n FROM tasks WHERE done_at IS NULL AND due_at < ?', now),
    noNextAction: n(`SELECT COUNT(*) n FROM people pe
      WHERE pe.status NOT IN (${terminal.map(() => '?').join(',') || "''"})
      AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.person_id = pe.id AND t.done_at IS NULL)`, ...terminal),
    honesty: 'Every number here is a count of rows that exist. Nothing is modelled, estimated or projected.',
  };
}

// ------------------------------------------------------------ SIS handoff --
export function handoffToSis(db, personId, by) {
  const p = db.prepare('SELECT * FROM people WHERE id = ?').get(personId);
  if (!p) return { error: 'not found' };
  if (p.status !== CFG.stageRoles.admitted) {
    return { error: `only an ${CFG.stageRoles.admitted} person is handed to the SIS` };
  }
  if (p.sis_handoff_at) return { error: 'already handed over', at: p.sis_handoff_at };
  const at = nowIso();
  db.prepare('UPDATE people SET sis_handoff_at = ? WHERE id = ?').run(at, personId);
  logEvent(db, { personId, kind: 'status', direction: 'note', at, origin: MANUAL, actor: by,
    subject: 'Handed over to the SIS',
    body: 'The CRM admissions journey ends here. The record stays for reporting.',
    field: 'sis_handoff_at', oldValue: null, newValue: at });
  return { ok: true, at };
}

export const CONFIG = CFG;
