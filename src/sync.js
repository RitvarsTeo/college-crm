// The two pollers: PBX calls and the SIS applicant feed, into the CRM's own
// database. Both run every five minutes from Vercel Cron (api/cron/*), and both
// are written against the `db` interface only, so the same code runs on SQLite in
// the tests and on Postgres (Supabase) in production.
//
// The rules, both decided by Ritvars:
//   PHONE (config/channels.json -> phone.connectSteps): store the call, match the
//     caller to a person, an unknown caller goes to the Inbox.
//   SIS (28.09.2026): an applicant who matches ONE existing person by email or
//     phone moves that person's stage by itself; anybody else goes to the Inbox
//     for a person to confirm. A stage only ever moves forwards, and a person
//     somebody closed is never reopened by a machine.
//
// Neither poller runs while its channel is off, and off is the default.

import { receive, CONFIG } from './intake.js';
import { findMatches, isStrong } from './identity.js';
import { logEvent, AUTOMATIC } from './history.js';
import { fetchCalls, rowsFrom, WINDOW_MINUTES, toRigaStamp, ZONE } from '../lib/pbx.js';
import { fetchChanged, toSisRow } from '../lib/sis.js';
import { recordSisLifecycle } from './lifecycle.js';

const nowIso = () => new Date().toISOString();

// ------------------------------------------------------------ channel mode --
// The switch an admin flips on the Channels screen is stored in channel_mode and
// copied into process.env when the web app boots. A cron function never boots the
// web app, so it reads the table itself, and the environment is the fallback.
export async function channelMode(db, channel, env = process.env) {
  const row = await db.prepare('SELECT mode FROM channel_mode WHERE channel = ?').get(channel);
  const mode = String((row && row.mode) || env['CHANNEL_MODE_' + channel.toUpperCase()] || 'off').toLowerCase();
  return ['off', 'test', 'live'].includes(mode) ? mode : 'off';
}

async function saveState(db, name, value, detail, at) {
  await db.prepare(`INSERT INTO sync_state (name, value, ran_at, detail) VALUES (?,?,?,?)
    ON CONFLICT (name) DO UPDATE SET value = excluded.value, ran_at = excluded.ran_at,
    detail = excluded.detail`).run(name, value, at, JSON.stringify(detail));
}

// The one person an email or a phone points at, or null. Two strong candidates is
// a question for a human, never a coin toss.
async function onePerson(db, contact) {
  if (!contact.email && !contact.phone) return null;
  const strong = (await findMatches(db, { email: contact.email, phone: contact.phone })).filter(isStrong);
  const ids = [...new Set(strong.map((m) => m.id))];
  return ids.length === 1 ? ids[0] : null;
}

// ---------------------------------------------------------------- retention --
// Decided by Ritvars 29.09.2026: the raw phone and SIS records are kept 13 months
// (one admission year plus the same month a year ago), then deleted. What reached
// a person's timeline (events, lifecycle facts) stays with the person.
export const RETENTION_MONTHS = 13;

export function retentionCutoff(now = new Date()) {
  const d = new Date(now.getTime());
  d.setUTCMonth(d.getUTCMonth() - RETENTION_MONTHS);
  return d.toISOString();
}

async function purgeOld(db, table, column, now) {
  const r = await db.prepare(`DELETE FROM ${table} WHERE ${column} < ?`).run(retentionCutoff(now));
  return (r && (r.changes ?? r.rowCount)) || 0;
}

// ================================================================== PHONE ===

function menuFor(queue) {
  const menu = CONFIG.phoneMenu || {};
  for (const [button, m] of Object.entries(menu)) if (m && m.queue === queue) return { button, role: m.role };
  return null;
}

function callSentence(row) {
  const m = menuFor(row.queue);
  const line = m ? `button ${m.button} (${m.role})` : row.queue;
  return row.picked_up
    ? `Incoming call on ${line}, answered by ${row.operator_name || 'an operator'}`
    : `Missed call on ${line}`;
}

// The phone catches up. TeleGroup fails when asked for a wide window, so a run
// walks forward in 15-minute pieces from where the last run stopped (the
// bookmark in sync_state 'pbx_until'), up to now. A run once a day therefore
// brings in the whole day, and the Run button brings in everything since the
// last run. No bookmark yet, or an old one: the last CATCH_UP_HOURS only. A run
// stops at RUN_BUDGET_MS so it always finishes inside the function limit, saves
// how far it got, and the next run carries on from there. Each piece starts a
// little before the bookmark, because a call can be written late; a call
// already stored is skipped by its uniqueid.
export const CATCH_UP_HOURS = 24;
export const OVERLAP_MINUTES = 2;
export const RUN_BUDGET_MS = 40000;
const PBX_BOOKMARK = 'pbx_until';

async function storeCall(db, r, mode, at, out) {
  // the pieces overlap on purpose; a call already here was handled last time
  const had = await db.prepare('SELECT uniqueid FROM pbx_calls WHERE uniqueid = ?').get(r.uniqueid);
  if (had) { out.seen++; return; }

  let personId = null;
  let inboundId = null;
  const sentence = callSentence(r);
  if (r.caller_num) personId = await onePerson(db, { phone: r.caller_num });
  if (personId) {
    await logEvent(db, { personId, kind: 'call', channel: 'phone', direction: 'in', at: r.created_at,
      origin: AUTOMATIC, actor: 'PBX', subject: sentence, body: r.caller_num });
    if (r.picked_up) {
      await db.prepare('UPDATE people SET last_contact_at = ? WHERE id = ? AND (last_contact_at IS NULL OR last_contact_at < ?)')
        .run(r.created_at, personId, r.created_at);
    }
    out.logged++;
  } else if (r.caller_num) {
    const got = await receive(db, { channel: 'phone', externalId: r.uniqueid, receivedAt: r.created_at,
      phone: r.caller_num, body: sentence, source: mode === 'live' ? 'provider' : 'simulated' });
    inboundId = got.id;
    out.inbox++;
  } else {
    // a withheld number: kept for the call counts, but nobody can ring it back
    out.noNumber++;
  }
  await db.prepare(`INSERT INTO pbx_calls (uniqueid, called_at, queue, caller_num, picked_up,
    operator_name, person_id, inbound_id, inserted_at) VALUES (?,?,?,?,?,?,?,?,?)`).run(
    r.uniqueid, r.created_at, r.queue, r.caller_num, r.picked_up ? 1 : 0, r.operator_name,
    personId, inboundId, at);
}

export async function syncPbx(db, { now = new Date(), minutes = WINDOW_MINUTES,
  env = process.env, fetchImpl = fetch, budgetMs = RUN_BUDGET_MS, clock = () => Date.now() } = {}) {
  const at = now.toISOString();
  const mode = await channelMode(db, 'phone', env);
  if (mode === 'off') return { ok: true, ran: false, channel: 'phone', why: 'the phone channel is off' };

  const nowMs = now.getTime();
  const earliest = nowMs - CATCH_UP_HOURS * 3600000;
  const mark = await db.prepare('SELECT value FROM sync_state WHERE name = ?').get(PBX_BOOKMARK);
  const markMs = mark && mark.value ? Date.parse(mark.value) : NaN;
  let from = Number.isFinite(markMs) ? Math.max(earliest, markMs - OVERLAP_MINUTES * 60000) : earliest;
  const firstFrom = from;

  const startedAt = clock();
  const out = { logged: 0, inbox: 0, seen: 0, noNumber: 0 };
  const skipped = { notIncoming: 0, otherQueue: 0, unusable: 0, duplicateInBatch: 0 };
  let fetched = 0, kept = 0, pieces = 0, safeUrl = null, reached = from;

  while (from < nowMs) {
    if (pieces > 0 && clock() - startedAt > budgetMs) break;
    const to = Math.min(from + minutes * 60000, nowMs);
    const got = await fetchCalls({ now: new Date(to), minutes: (to - from) / 60000, env, fetchImpl });
    safeUrl = got.safeUrl;
    const { rows, skipped: sk } = rowsFrom(got.calls);
    for (const k of Object.keys(skipped)) skipped[k] += sk[k] || 0;
    fetched += got.calls.length;
    kept += rows.length;
    for (const r of rows) await storeCall(db, r, mode, at, out);
    pieces++;
    reached = to;
    // saved after every piece, so a run that dies half way loses nothing
    await saveState(db, PBX_BOOKMARK, new Date(reached).toISOString(),
      { pieces, fetched, kept, ...out }, at);
    from = to;
  }

  const caughtUp = reached >= nowMs;
  const result = { ok: true, ran: true, channel: 'phone', mode,
    window: { from: toRigaStamp(new Date(firstFrom)), to: toRigaStamp(new Date(reached)), zone: ZONE,
      minutes: Math.round((reached - firstFrom) / 60000) },
    pieces, caughtUp, fetched, kept, skipped, ...out, safeUrl };
  result.purged = await purgeOld(db, 'pbx_calls', 'called_at', now);
  return result;
}

// ==================================================================== SIS ===

// Where an SIS status puts a person on the CRM journey. rejected and withdrawn are
// not here on purpose: closing a person needs a reason from a human, so the SIS
// status is written on the timeline and the stage is left alone.
export const SIS_STAGE = {
  registered: 'Application',
  started: 'Application',
  submitted: 'Application',
  admitted: 'Admitted',
  matriculated: 'Admitted',
};

const STAGE_ORDER = () => CONFIG.stageOrder || ['New', 'Contacted', 'Follow-up', 'Application', 'Contract', 'Admitted'];

async function advanceTo(db, personId, target, at, why) {
  const person = await db.prepare('SELECT status FROM people WHERE id = ?').get(personId);
  if (!person || !target) return null;
  const order = STAGE_ORDER();
  const from = order.indexOf(person.status);
  const to = order.indexOf(target);
  if (person.status === 'Not proceeding' || to < 0 || (from >= 0 && to <= from)) return null;
  await db.prepare('UPDATE people SET status = ? WHERE id = ?').run(target, personId);
  if (target === 'Admitted') {
    await db.prepare('UPDATE people SET admitted_at = COALESCE(admitted_at, ?) WHERE id = ?').run(at, personId);
  }
  await logEvent(db, { personId, kind: 'status', direction: 'note', at, origin: AUTOMATIC, actor: 'SIS',
    subject: `Status: ${person.status} -> ${target}`, body: why,
    field: 'status', oldValue: person.status, newValue: target });
  return { from: person.status, to: target };
}

const fullName = (r) => [r.given_name, r.family_name].filter(Boolean).join(' ') || null;

function sisSentence(r) {
  if (!r.application_id) return 'SIS: registered, no application yet';
  return `SIS: ${r.programme_code ? r.programme_code + ' ' : ''}application ${r.status}`;
}

// Links every row of one SIS person to a CRM person and plays their statuses onto
// the journey. `announce` says whether the link itself is new.
async function applyToPerson(db, reference, personId, at, stats) {
  const rows = await db.prepare('SELECT * FROM sis_applicants WHERE reference = ? ORDER BY application_id').all(reference);
  const newLink = rows.some((r) => !r.person_id);
  await db.prepare('UPDATE sis_applicants SET person_id = ? WHERE reference = ?').run(personId, reference);
  if (newLink) {
    await logEvent(db, { personId, kind: 'channel', channel: 'sis', direction: 'in', at, origin: AUTOMATIC,
      actor: 'SIS', subject: 'Linked to the SIS applicant record', body: rows.map(sisSentence).join('; ') });
    stats.linked++;
  }
  // the furthest stage any of their applications reaches
  const order = STAGE_ORDER();
  let target = null;
  for (const r of rows) {
    const t = SIS_STAGE[r.status];
    if (t && (target === null || order.indexOf(t) > order.indexOf(target))) target = t;
  }
  const moved = await advanceTo(db, personId, target, at, 'from the SIS: ' + rows.map(sisSentence).join('; '));
  if (moved) stats.moved++;
  // The lifecycle facts ("Application form started", "Matriculated") each row states, dated and
  // written once (src/lifecycle.js holds the PROVISIONAL mapping; docs/LIFECYCLE.md). Facts, not stages.
  for (const r of rows) stats.facts += await recordSisLifecycle(db, personId, r, { now: new Date(at) });
}

export async function syncSis(db, { now = new Date(), env = process.env, fetchImpl = fetch } = {}) {
  const at = now.toISOString();
  const mode = await channelMode(db, 'sis', env);
  if (mode === 'off') return { ok: true, ran: false, channel: 'sis', why: 'the SIS channel is off' };

  const state = await db.prepare("SELECT value FROM sync_state WHERE name = 'sis'").get();
  const since = state && state.value ? state.value : null;
  const got = await fetchChanged({ since, env, fetchImpl });
  const stats = { fetched: got.applicants.length, stored: 0, unusable: 0, linked: 0, moved: 0, inbox: 0,
    noted: 0, facts: 0, pages: got.pages };
  let newest = since;
  const touched = new Set();

  for (const a of got.applicants) {
    let r;
    try { r = toSisRow(a); } catch { stats.unusable++; continue; }
    if (!newest || r.changed_at > newest) newest = r.changed_at;
    const old = await db.prepare('SELECT * FROM sis_applicants WHERE reference = ? AND application_id = ?')
      .get(r.reference, r.application_id);
    // an older copy arriving after a newer one changes nothing
    if (old && old.changed_at >= r.changed_at) continue;
    await db.prepare(`INSERT INTO sis_applicants (reference, application_id, given_name, family_name, email,
      phone, programme_code, status, registered_at, submitted_at, changed_at, synced_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT (reference, application_id) DO UPDATE SET given_name = excluded.given_name,
      family_name = excluded.family_name, email = excluded.email, phone = excluded.phone,
      programme_code = excluded.programme_code, status = excluded.status,
      registered_at = excluded.registered_at, submitted_at = excluded.submitted_at,
      changed_at = excluded.changed_at, synced_at = excluded.synced_at`).run(
      r.reference, r.application_id, r.given_name, r.family_name, r.email, r.phone, r.programme_code,
      r.status, r.registered_at, r.submitted_at, r.changed_at, at);
    stats.stored++;
    touched.add(r.reference);
    // a closing status on a person we already know goes on their timeline
    if (old && old.person_id && old.status !== r.status && !SIS_STAGE[r.status]) {
      await logEvent(db, { personId: old.person_id, kind: 'status', direction: 'note', at, origin: AUTOMATIC,
        actor: 'SIS', subject: sisSentence(r), body: 'The CRM stage is unchanged.' });
      stats.noted++;
    }
  }

  // Every SIS person still unlinked is tried again, not only the ones that changed:
  // the Inbox item raised for them may have been confirmed since the last run.
  const open = await db.prepare(`SELECT reference, MAX(inbound_id) inbound_id FROM sis_applicants
    WHERE person_id IS NULL GROUP BY reference`).all();
  const refs = new Set([...touched, ...open.map((o) => o.reference)]);

  for (const reference of refs) {
    const rows = await db.prepare('SELECT * FROM sis_applicants WHERE reference = ? ORDER BY changed_at DESC')
      .all(reference);
    if (!rows.length) continue;
    const linked = rows.find((r) => r.person_id);
    let personId = linked ? linked.person_id : null;
    const inboundId = rows.map((r) => r.inbound_id).find(Boolean) || null;
    if (!personId && inboundId) {
      // a person confirmed the Inbox item: that decision is the link
      const item = await db.prepare('SELECT state, person_id FROM inbound WHERE id = ?').get(inboundId);
      if (item && item.state === 'qualified' && item.person_id) personId = item.person_id;
      if (item && item.state !== 'new' && !personId) continue;   // archived: a human said no
    }
    if (!personId) {
      const latest = rows[0];
      personId = await onePerson(db, { email: latest.email, phone: latest.phone });
    }
    if (personId) { await applyToPerson(db, reference, personId, at, stats); continue; }
    if (!inboundId) {
      const latest = rows[0];
      const item = await receive(db, { channel: 'sis', externalId: 'sis:' + reference, receivedAt: at,
        name: fullName(latest), email: latest.email, phone: latest.phone,
        body: rows.map(sisSentence).join('; '), source: mode === 'live' ? 'provider' : 'simulated' });
      await db.prepare('UPDATE sis_applicants SET inbound_id = ? WHERE reference = ?').run(item.id, reference);
      stats.inbox++;
    }
  }

  // Only a complete run moves the bookmark; an incomplete one asks again next time.
  const value = got.complete ? newest : since;
  await saveState(db, 'sis', value, stats, at);
  const purged = await purgeOld(db, 'sis_applicants', 'changed_at', now);
  return { ok: true, ran: true, channel: 'sis', mode, since, next: value, complete: got.complete, ...stats, purged };
}
