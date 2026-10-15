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

import { receive, bringBack, activePersonFor, CALL_BACK_STEP, confirmedBySystem, CONFIG, newPersonId, ownerFor, emailFilterWhy, purgeLineBodies, recordReplyRead } from './intake.js';
import { onePersonFor, normEmail, normPhone } from './identity.js';
import { knock } from './webpush.js';
import { phoneThread } from './phonefilter.js';
import { logEvent, AUTOMATIC, MANUAL } from './history.js';
import { fetchCalls, rowsFrom, WINDOW_MINUTES, toRigaStamp, ZONE } from '../lib/pbx.js';
import { fetchChanged, toSisRow } from '../lib/sis.js';
import { runPoll as gmailPoll, runReplies as gmailReplies, loadGmailRefreshToken } from '../lib/gmail.js';
import { adapt, toIntake } from './adapters.js';
import { recordSisLifecycle } from './lifecycle.js';
import { sisAdmissionDate } from './sisdates.js';
import { localDate } from './bizday.js';

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
// a question for a human, never a coin toss. The same question every channel asks (src/identity.js onePersonFor).
async function onePerson(db, contact) {
  const one = await onePersonFor(db, { email: contact.email, phone: contact.phone });
  return one ? one.id : null;
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
// Q92 (14.10.2026): the pull runs every minute. TeleGroup publishes no rate limit we have seen; one request a minute
// (one 15-minute piece) is what a caught-up run makes. If it ever answers 429 the pull waits (its Retry-After, else
// BACKOFF_MINUTES) before asking again, and says so; the bookmark is untouched, so nothing is skipped.
export const BACKOFF_MINUTES = 5;
const PBX_BACKOFF = 'pbx_backoff';

// LATE-LISTED CALLS (14.10.2026, live finding): TeleGroup's list does NOT show a call when it happens. A call at 09:59
// Riga was not in the list for the next 9 minutes, and nothing yet says how late it appears - only that until now every
// call was listed within a day (the daily pull at 08:15 Riga found each of the day before's calls). A call listed late
// keeps its ORIGINAL time, so the bookmark has already moved past it. Every run therefore ALSO re-reads part of the
// last LATE_HOURS, SWEEP_PIECES pieces of WINDOW_MINUTES at a time, walking a cursor (sync_state pbx_sweep) from
// LATE_HOURS ago up to where this run's own window starts, then round again: the whole trailing 48 hours are re-read
// every ~32 minutes, a call already stored is skipped by its uniqueid as always. Each call stored records how late it
// was found (pbx_lag: the newest LAG_KEEP), which is how TeleGroup's real delay is learned.
export const LATE_HOURS = 48;
export const RECENT_MINUTES = 60;
export const SWEEP_PIECES = 6;
export const LAG_KEEP = 200;
const PBX_SWEEP = 'pbx_sweep';
const PBX_LAG = 'pbx_lag';
const PBX_FIELDS = 'pbx_fields';

// ---------------------------------------------- one number, one thing to look at
// Ritvars, 01.10.2026: "Leads become those who have some interest. How can we know
// about a caller with no notes? So a new number called first time sits in to look
// at." A stranger who rings three times is ONE person to call back, not three.
// The call's own uniqueid is different every time, so the de-duplication above
// cannot see it; the NUMBER has to be the key. Last 8 digits, the same comparison
// identity.js makes, because one number is written three ways by three systems.
// phoneThread lives in src/phonefilter.js (14.10.2026), shared with the call pop-up

// Exported for the pushed call events (src/phoneevent.js): one function stores a call, whichever
// path saw it first, so the two can never make two leads for one call.
export async function storeCall(db, r, mode, at, out) {
  // the pieces overlap on purpose; a call already here was handled last time
  const had = await db.prepare('SELECT uniqueid, duration_sec, talk_sec FROM pbx_calls WHERE uniqueid = ?').get(r.uniqueid);
  if (had) { await fillLength(db, had, r); out.seen++; return; }

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
    } else {
      // A KNOWN LEAD RANG AND NOBODY ANSWERED: that is work for today (Ritvars 02.10.2026, "they get
      // recorded for needs action which is today"). Due when they rang, because they have waited since
      // then. One Call back at a time per person. A FINISHED person (Admitted, Not proceeding) gets it too
      // since 14.10.2026 (the owner, B: one rule on every channel, the same as a message's Answer the
      // question); it is listed on their owner's Due although they are finished, and their stage is not touched.
      const p = await db.prepare('SELECT status, owner FROM people WHERE id = ?').get(personId);
      const open = await db.prepare('SELECT COUNT(*) n FROM tasks WHERE person_id = ? AND label = ? AND done_at IS NULL').get(personId, CALL_BACK_STEP);
      if (p && !Number(open.n)) {
        await db.prepare('INSERT INTO tasks (person_id,label,due_at,owner,created_at) VALUES (?,?,?,?,?)')
          .run(personId, CALL_BACK_STEP, r.created_at, p.owner || 'Admissions', at);
        out.callBack++;
      }
    }
    out.logged++;
  } else if (r.caller_num) {
    // The filter before New Leads (Ritvars 01.10.2026, config.phoneFilter). Explicit and counted. Since 14.10.2026 (one
    // rule on every card) it is the MARK on the number, checked by receive() for every channel (src/phonefilter.js).
    const rule = CONFIG.phoneFilter || {};
    // receive() owns every write: it joins the open item for this number when there is one (the
    // same caller again while staff have not looked yet), otherwise it stores, filtered or not.
    //
    // threadKey is NORMALISED, not the raw number. The same number reaches us written
    // +37129111222, 371 29 111 222 and 29111222 by three different systems, and a raw key
    // makes those three rows for one person to ring back.
    //
    // joinBody is how this call reads as a LATER one. Without it the row grows the same
    // sentence twice with no time on it, and the Inbox cannot say when they last rang.
    //
    // THE CLOCK DOES NOT RESTART: receive() leaves received_at and surface_at alone, because
    // somebody who keeps ringing has been waiting LONGER, not less.
    const got = await receive(db, { channel: 'phone', externalId: r.uniqueid, receivedAt: r.created_at,
      phone: r.caller_num, body: sentence, source: mode === 'live' ? 'provider' : 'simulated',
      threadKey: phoneThread(r.caller_num), joinOpenThread: Boolean(rule.oneOpenItemPerNumber),
      joinBody: `Rang again ${toRigaStamp(r.created_at).slice(0, 16)}, ${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}` });
    inboundId = got.id;
    if (got.joined) out.again++; else if (got.filtered) out.filtered++; else out.inbox++;
  } else {    // a withheld number: kept for the call counts, but nobody can ring it back
    out.noNumber++;
  }
  await db.prepare(`INSERT INTO pbx_calls (uniqueid, called_at, queue, caller_num, picked_up,
    operator_name, person_id, inbound_id, inserted_at, duration_sec, talk_sec) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    r.uniqueid, r.created_at, r.queue, r.caller_num, r.picked_up ? 1 : 0, r.operator_name,
    personId, inboundId, at, r.duration_sec ?? null, r.talk_sec ?? null);
  await callEventsFromPull(db, r, mode, at);
}

// THE LENGTH, FILLED IN LATER (14.10.2026). Calls stored before the length was read have none; the pull, the last-hour
// re-read and the 48-hour sweep see them again, so a length the stored call lacks is written then - only where it is
// still NULL, never over a value. Nothing else about a call already stored changes. A row without a length (the
// pushed call events have none) writes nothing.
async function fillLength(db, had, r) {
  const dur = had.duration_sec == null ? (r.duration_sec ?? null) : null;
  const talk = had.talk_sec == null ? (r.talk_sec ?? null) : null;
  if (dur === null && talk === null) return;
  await db.prepare(`UPDATE pbx_calls SET duration_sec = COALESCE(duration_sec, ?), talk_sec = COALESCE(talk_sec, ?)
    WHERE uniqueid = ?`).run(dur, talk, r.uniqueid);
}

// A call the PULL found becomes call events too (Q6, 04.10.2026), so the pop-up works without
// TeleGroup's push: "answered" for whoever picked up, then "ended". The same call id + event as a
// push, so whichever came first is the one stored; the other is a repeat.
async function callEventsFromPull(db, r, mode, at) {
  const source = mode === 'live' ? 'provider' : 'simulated';
  const rows = [];
  if (r.picked_up) rows.push(['answered', r.operator_name || null]);
  rows.push(['ended', r.operator_name || null]);
  for (const [event, operator] of rows) {
    try {
      await db.prepare(`INSERT INTO call_events (call_id, event, at, queue, caller_num, operator, extension, source, received_at)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(r.uniqueid, event, r.created_at, r.queue, r.caller_num, operator, null, source, at);
      await knock(db, { event, operator, queue: r.queue, callerNum: r.caller_num });   // a new event only: a repeat never knocks twice
    } catch (err) {
      if (!/UNIQUE|duplicate key|unique constraint/i.test(String(err && err.message))) throw err;
    }
  }
}

export async function syncPbx(db, { now = new Date(), minutes = WINDOW_MINUTES,
  env = process.env, fetchImpl = fetch, budgetMs = RUN_BUDGET_MS, clock = () => Date.now() } = {}) {
  const at = now.toISOString();
  const mode = await channelMode(db, 'phone', env);
  if (mode === 'off') return { ok: true, ran: false, channel: 'phone', why: 'the phone channel is off' };

  const nowMs = now.getTime();
  const wait = await db.prepare('SELECT value FROM sync_state WHERE name = ?').get(PBX_BACKOFF);
  if (wait && Date.parse(wait.value) > nowMs) {
    return { ok: true, ran: false, channel: 'phone', mode, backingOff: true, until: wait.value,
      why: 'TeleGroup asked us to slow down; the next pull is after ' + toRigaStamp(new Date(Date.parse(wait.value))).slice(11, 16) };
  }
  const earliest = nowMs - CATCH_UP_HOURS * 3600000;
  const mark = await db.prepare('SELECT value FROM sync_state WHERE name = ?').get(PBX_BOOKMARK);
  const markMs = mark && mark.value ? Date.parse(mark.value) : NaN;
  let from = Number.isFinite(markMs) ? Math.max(earliest, markMs - OVERLAP_MINUTES * 60000) : earliest;
  const firstFrom = from;

  const startedAt = clock();
  const out = { logged: 0, inbox: 0, again: 0, filtered: 0, seen: 0, noNumber: 0, callBack: 0 };
  const skipped = { notIncoming: 0, otherQueue: 0, unusable: 0, duplicateInBatch: 0 };
  const destinations = {};   // counts per destination the list returned (lib/pbx.js rowsFrom), saved with the run
  const fields = new Set();  // the NAMES of the fields TeleGroup sends (14.10.2026: the call length is wanted, its name is unknown); never a value
  let fetched = 0, kept = 0, pieces = 0, safeUrl = null, reached = from, backedOff = null;

  const lags = [];           // how late each NEW call was found, in minutes after it happened
  // One piece [a, b): fetched, filtered, stored. false = TeleGroup said 429, stop asking this run.
  const readPiece = async (a, b, by) => {
    let got;
    try { got = await fetchCalls({ now: new Date(b), minutes: (b - a) / 60000, env, fetchImpl }); }
    catch (err) {
      if (err && err.status === 429) {
        const until = new Date(nowMs + (err.retryAfterSec ? err.retryAfterSec * 1000 : BACKOFF_MINUTES * 60000)).toISOString();
        await saveState(db, PBX_BACKOFF, until, { status: 429 }, at);
        backedOff = until;
        return false;
      }
      throw err;
    }
    safeUrl = got.safeUrl;
    const { rows, skipped: sk, destinations: ds } = rowsFrom(got.calls);
    for (const k of Object.keys(skipped)) skipped[k] += sk[k] || 0;
    for (const [d, n] of Object.entries(ds || {})) destinations[d] = (destinations[d] || 0) + n;
    for (const c of got.calls) if (c && typeof c === 'object') for (const k of Object.keys(c)) fields.add(String(k).slice(0, 40));
    fetched += got.calls.length;
    kept += rows.length;
    for (const r of rows) {
      const seenBefore = out.seen;
      await storeCall(db, r, mode, at, out);
      if (out.seen === seenBefore) {
        lags.push({ calledAt: r.created_at, foundAt: at, lagMin: Math.max(0, Math.round((nowMs - Date.parse(r.created_at)) / 60000)), by });
        if (by === 'sweep') out.late = (out.late || 0) + 1;
      }
    }
    return true;
  };

  while (from < nowMs) {
    if (pieces > 0 && clock() - startedAt > budgetMs) break;
    const to = Math.min(from + minutes * 60000, nowMs);
    if (!(await readPiece(from, to, 'window'))) break;
    pieces++;
    reached = to;
    // saved after every piece, so a run that dies half way loses nothing
    await saveState(db, PBX_BOOKMARK, new Date(reached).toISOString(),
      { pieces, fetched, kept, skipped, destinations, ...out }, at);
    from = to;
  }

  // THE LAST HOUR, AGAIN, IN ONE REQUEST (14.10.2026, live finding): TeleGroup lists a call only when it ENDS but stamps
  // it with the moment it STARTED, so an answered call longer than the overlap is already behind the bookmark when it
  // appears. Two calls at 11:33 and 11:45 waited for the sweep until 11:53; a 2-minute call at 11:25 was in at 11:27.
  // Every run re-reads the RECENT_MINUTES behind its own window, so a call is in within a minute of hanging up.
  if (!backedOff) {
    const a = Math.max(nowMs - RECENT_MINUTES * 60000, earliest);
    if (firstFrom > a) await readPiece(a, firstFrom, 'recent');   // a 429 sets backedOff inside
  }

  // THE SWEEP: part of the trailing LATE_HOURS, behind this run's own window, for calls TeleGroup listed late
  let swept = 0;
  if (!backedOff) {
    const floor = nowMs - LATE_HOURS * 3600000;
    const cur = await db.prepare('SELECT value FROM sync_state WHERE name = ?').get(PBX_SWEEP);
    let a = cur && Number.isFinite(Date.parse(cur.value)) ? Math.max(floor, Date.parse(cur.value)) : floor;
    for (let i = 0; i < SWEEP_PIECES; i++) {
      if (clock() - startedAt > budgetMs) break;
      if (a >= firstFrom) a = floor;                       // round again
      const b = Math.min(a + minutes * 60000, firstFrom);
      if (b <= a) break;
      if (!(await readPiece(a, b, 'sweep'))) break;
      swept++;
      a = b;
    }
    await saveState(db, PBX_SWEEP, new Date(a).toISOString(), { swept, lateHours: LATE_HOURS }, at);
  }
  if (fields.size) await saveState(db, PBX_FIELDS, [...fields].sort().join(','), { names: fields.size }, at);
  if (lags.length) {
    const was = await db.prepare('SELECT detail FROM sync_state WHERE name = ?').get(PBX_LAG);
    let list = [];
    try { list = (JSON.parse((was && was.detail) || '{}').calls) || []; } catch { list = []; }
    list = [...list, ...lags].slice(-LAG_KEEP);
    await saveState(db, PBX_LAG, String(Math.max(...lags.map((l) => l.lagMin))), { calls: list }, at);
  }

  const caughtUp = reached >= nowMs;
  const result = { ok: true, ran: true, channel: 'phone', mode,
    window: { from: toRigaStamp(new Date(firstFrom)), to: toRigaStamp(new Date(reached)), zone: ZONE,
      minutes: Math.round((reached - firstFrom) / 60000) },
    pieces, swept, caughtUp, fetched, kept, skipped, destinations, ...out, safeUrl,
    ...(lags.length ? { lagMinutes: { found: lags.length, min: Math.min(...lags.map((l) => l.lagMin)), max: Math.max(...lags.map((l) => l.lagMin)) } } : {}),
    ...(backedOff ? { backingOff: true, until: backedOff, why: 'TeleGroup answered 429; waiting before the next pull' } : {}) };
  result.purged = await purgeOld(db, 'pbx_calls', 'called_at', now);
  // 13 months PER LINE, each from its own received_at, so an old call never takes a
  // newer one with it. The line stays and says when its body went: a deletion nobody
  // can see is not auditable.
  result.purgedLines = await purgeLineBodies(db, retentionCutoff(now));
  result.purgedEvents = await purgeOld(db, 'call_events', 'at', now);   // the same 13 months
  return result;
}

// ==================================================================== SIS ===

// Where an SIS status puts a person on the CRM journey. rejected and withdrawn are
// not here on purpose: closing a person needs a reason from a human, so the SIS
// status is written on the timeline and the stage is left alone.
// ONLY A REAL SUBMISSION MOVES THE STAGE (Ritvars, 07.10.2026, Q75 follow-up): the stage reads
// "Submitted application" now, so an account (registered) or a form begun (started) leaves the person
// where they are. "Application form started" is still recorded as a lifecycle fact. Supersedes the
// 29-30.09 rule that started (and a known lead's registered) moved them to the application stage.
export const SIS_STAGE = {
  submitted: 'Application',
  admitted: 'Admitted',
  matriculated: 'Admitted',
};
// the two statuses only a human may turn into a closing: they go on the timeline instead
export const SIS_CLOSING = ['rejected', 'withdrawn'];

// "WE HAVE TO KNOW WHEN THIS HAPPEN" (Ritvars 07.10.2026, popup "Yes, both"): somebody the SIS says only
// registered or started gets a step to call and check whether they finished the form. One open at a
// time, none for a finished person, and none once any of their applications is submitted or further.
export const FORM_CHECK = 'Call: did they finish the application form?';
const FORM_CHECK_FOR = ['registered', 'started'];
export async function planFormCheck(db, personId, at) {
  const p = await db.prepare('SELECT status, owner FROM people WHERE id = ?').get(personId);
  if (!p || (CONFIG.terminalStages || []).includes(p.status)) return false;
  const rows = await db.prepare('SELECT status FROM sis_applicants WHERE person_id = ?').all(personId);
  if (!rows.length || rows.some((r) => SIS_STAGE[r.status]) || !rows.some((r) => FORM_CHECK_FOR.includes(r.status))) return false;
  const open = await db.prepare('SELECT COUNT(*) n FROM tasks WHERE person_id = ? AND label = ? AND done_at IS NULL').get(personId, FORM_CHECK);
  if (Number(open.n)) return false;
  await db.prepare('INSERT INTO tasks (person_id,label,due_at,owner,created_at) VALUES (?,?,?,?,?)')
    .run(personId, FORM_CHECK, at, p.owner || 'Admissions', at);
  return true;
}

const STAGE_ORDER = () => CONFIG.stageOrder || ['New', 'Contacted', 'Follow-up', 'Application', 'Admitted'];

// admittedAt is the SIS's own admission date (src/sisdates.js), never the time of the run (Ritvars,
// 06.10.2026). When the SIS does not date it, the stage still moves and admitted_at stays empty: Home
// shows that person as "no admission date" rather than in the year the pull happened to run.
async function advanceTo(db, personId, target, at, why, admittedAt = null) {
  const person = await db.prepare('SELECT status FROM people WHERE id = ?').get(personId);
  if (!person || !target) return null;
  const order = STAGE_ORDER();
  const from = order.indexOf(person.status);
  const to = order.indexOf(target);
  if (person.status === 'Not proceeding' || to < 0 || (from >= 0 && to <= from)) return null;
  await db.prepare('UPDATE people SET status = ? WHERE id = ?').run(target, personId);
  if (target === 'Admitted' && admittedAt) {
    await db.prepare('UPDATE people SET admitted_at = COALESCE(admitted_at, ?) WHERE id = ?').run(admittedAt, personId);
  }
  const dated = target === 'Admitted' ? (admittedAt ? `; admission date from the SIS: ${localDate(admittedAt)}`
    : '; the SIS gives no admission date') : '';
  await logEvent(db, { personId, kind: 'status', direction: 'note', at, origin: AUTOMATIC, actor: 'SIS',
    subject: `Status: ${person.status} -> ${target}`, body: why + dated,
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
  // the furthest stage any of their applications reaches. A person the SIS itself created stays at
  // New while the SIS only says registered (Ritvars, 30.09.2026); a known lead keeps the 29.09 path.
  const order = STAGE_ORDER();
  const who = await db.prepare('SELECT first_channel FROM people WHERE id = ?').get(personId);
  let target = null;
  for (const r of rows) {
    if (r.status === 'registered' && who && who.first_channel === 'sis') continue;
    const t = SIS_STAGE[r.status];
    if (t && (target === null || order.indexOf(t) > order.indexOf(target))) target = t;
  }
  const admittedAt = target === 'Admitted' ? sisAdmissionDate(rows) : null;
  const moved = await advanceTo(db, personId, target, at, 'from the SIS: ' + rows.map(sisSentence).join('; '), admittedAt);
  if (moved) stats.moved++;
  if (moved && target === 'Admitted' && !admittedAt) stats.undated = (stats.undated || 0) + 1;
  // The lifecycle facts ("Application form started", "Matriculated") each row states, dated and
  // written once (src/lifecycle.js holds the PROVISIONAL mapping; docs/LIFECYCLE.md). Facts, not stages.
  for (const r of rows) stats.facts += await recordSisLifecycle(db, personId, r, { now: new Date(at) });
  if (await planFormCheck(db, personId, at)) stats.formCheck = (stats.formCheck || 0) + 1;
}

// APPLICATION-FIRST (CRM TEST CASE, SAID + decided by Ritvars 30.09.2026, docs/BACKLOG.md).
// Somebody whose first appearance anywhere is apply.novikontas.org is not a lead waiting in New
// Leads: the SIS already knows they applied. So when nobody in people AND nothing waiting in New
// Leads shares their email or the last 8 digits of their phone, the SIS creates the person:
//   submitted or later -> the submitted-application stage (07.10.2026: a form only started stays at the first stage, its "Application form started" fact dated as the SIS dates it)
//   registered or started -> the first stage; registered has no fact until the SIS says started
// New Leads gets a DONE item, confirmed by the SIS, so the funnel counts them from the top.
// Somebody who called or wrote and is still waiting to be confirmed is NOT application-first: that
// item is a human's to confirm, and a second record for one person is exactly what this avoids.
const PHONE_TAIL = 8;

async function waitingFor(db, { email, phone }) {
  const e = normEmail(email);
  const ph = normPhone(phone);
  if (!e && ph.length <= 5) return false;
  const items = await db.prepare("SELECT contact_email, contact_phone FROM inbound WHERE state = 'new'").all();
  return items.some((i) => (e && normEmail(i.contact_email) === e)
    || (ph.length > 5 && normPhone(i.contact_phone).endsWith(ph.slice(-PHONE_TAIL))));
}

async function createFromSis(db, reference, rows, at, mode, stats) {
  const order = STAGE_ORDER();
  let stage = CONFIG.stageRoles.first;
  let lead = rows[0];
  for (const r of rows) {
    const t = r.status === 'registered' ? null : SIS_STAGE[r.status];
    if (t && order.indexOf(t) > order.indexOf(stage)) { stage = t; lead = r; }
  }
  const latest = rows[0];
  // NO DATE, NO PERSON (Ritvars, 06.10.2026: "have to be sure, which one to not make a recycle bin").
  // An admitted or matriculated record the SIS does not date stays in sis_applicants, counted as
  // undated in the run's detail; nothing else is written, so a later record with a date still can.
  const admittedAt = stage === CONFIG.stageRoles.admitted ? sisAdmissionDate(rows) : null;
  if (stage === CONFIG.stageRoles.admitted && !admittedAt) { stats.undated = (stats.undated || 0) + 1; return null; }
  // The door is claimed first: the unique (channel, external_id) index makes a second run, or the
  // webhook racing the daily pull, a repeat rather than a second person.
  const item = await receive(db, { channel: 'sis', externalId: 'sis:' + reference, receivedAt: at,
    name: fullName(latest), email: latest.email, phone: latest.phone,
    body: rows.map(sisSentence).join('; '), source: mode === 'live' ? 'provider' : 'simulated' });
  if (item.duplicate) return null;

  // Arrival is the SIS's own date, never the run's: the earliest the SIS shows them, and never after
  // their admission (a student the SIS loaded in 2026 but admitted in 2015 arrived by 2015).
  const firstSeen = [...rows.map((r) => r.registered_at || r.changed_at), admittedAt]
    .filter((v) => v && !Number.isNaN(Date.parse(v))).map((v) => new Date(v).toISOString()).sort()[0] || at;
  const id = newPersonId();
  await db.prepare(`INSERT INTO people (id, name, email, phone, programme, status, owner, source_channel,
    created_at, last_contact_at, admitted_at, qualification, first_channel) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, fullName(latest) || 'Unknown contact', latest.email, latest.phone, lead.programme_code, stage,
    ownerFor('lead'), 'sis', firstSeen, latest.changed_at, admittedAt,
    'lead', 'sis');
  await logEvent(db, { personId: id, kind: 'create', channel: 'sis', direction: 'in', at, origin: AUTOMATIC,
    actor: 'SIS', subject: 'Created from the SIS', body: rows.map(sisSentence).join('; ') });
  await confirmedBySystem(db, item.id, { personId: id, by: 'SIS', at });
  await db.prepare('UPDATE sis_applicants SET person_id = ?, inbound_id = ? WHERE reference = ?').run(id, item.id, reference);
  // What the SIS said about them is known, the provider's word, so the person page never lists the
  // email, phone or programme it was sent as "still to find out" (APPLICATIONS lane, 01.10.2026).
  const told = [['email', latest.email], ['phone', latest.phone], ['interest', lead.programme_code]];
  for (const [field, value] of told) {
    if (!value) continue;
    await db.prepare(`INSERT INTO field_values (person_id, inbound_id, field, value, provenance, recorded_at,
      recorded_by) VALUES (?,?,?,?,'provider',?,'SIS')`).run(id, item.id, field, value, at);
  }
  for (const r of rows) stats.facts += await recordSisLifecycle(db, id, r, { now: new Date(at) });
  stats.created++;
  if (await planFormCheck(db, id, at)) stats.formCheck = (stats.formCheck || 0) + 1;
  return id;
}

// One SIS person: link them to the person they already are, create them when they are
// application-first, or raise them in New Leads for a human. The daily pull calls this for every
// reference it touched or still has open.
export async function placeSisReference(db, reference, { at, mode, stats }) {
  const rows = await db.prepare('SELECT * FROM sis_applicants WHERE reference = ? ORDER BY changed_at DESC')
    .all(reference);
  if (!rows.length) return;
  const linked = rows.find((r) => r.person_id);
  let personId = linked ? linked.person_id : null;
  const inboundId = rows.map((r) => r.inbound_id).find(Boolean) || null;
  if (!personId && inboundId) {
    // a person confirmed the Inbox item: that decision is the link
    const item = await db.prepare('SELECT state, person_id FROM inbound WHERE id = ?').get(inboundId);
    if (item && item.state === 'qualified' && item.person_id) personId = item.person_id;
    if (item && item.state !== 'new' && !personId) return;   // archived: a human said no
  }
  const latest = rows[0];
  if (!personId) personId = await onePerson(db, { email: latest.email, phone: latest.phone });
  if (personId) { await applyToPerson(db, reference, personId, at, stats); return; }
  if (inboundId) return;                                     // already waiting for a human
  if (!(await waitingFor(db, latest))) {
    await createFromSis(db, reference, rows, at, mode, stats);
    return;
  }
  const item = await receive(db, { channel: 'sis', externalId: 'sis:' + reference, receivedAt: at,
    name: fullName(latest), email: latest.email, phone: latest.phone,
    body: rows.map(sisSentence).join('; '), source: mode === 'live' ? 'provider' : 'simulated' });
  await db.prepare('UPDATE sis_applicants SET inbound_id = ? WHERE reference = ?').run(item.id, reference);
  if (!item.duplicate) stats.inbox++;
}

// UNDO A DUPLICATE THE SIS MADE (decided by Ritvars 30.09.2026: the merge button). The SIS creates a
// person only when nobody shares their email or phone, so a twin appears only when somebody we
// already had used another email and phone. "Same person as..." folds the SIS-created record into
// the real one: every row that points at it moves there, her own values stay (an empty one is
// filled), the SIS stage moves her on, forwards only, and the extra record goes. One transaction.
const PERSON_TABLES = ['events', 'tasks', 'documents', 'registrations', 'sim_events', 'inbound', 'field_values',
  'consents', 'pbx_calls', 'sis_applicants'];

export async function mergeSisDuplicate(db, sourceId, targetId, { by, now = new Date() } = {}) {
  if (!by) return { ok: false, error: 'who is merging this?' };
  if (!sourceId || !targetId || sourceId === targetId) return { ok: false, error: 'pick another person' };
  const source = await db.prepare('SELECT * FROM people WHERE id = ?').get(sourceId);
  const target = await db.prepare('SELECT * FROM people WHERE id = ?').get(targetId);
  if (!source || !target) return { ok: false, error: 'not found' };
  if (source.first_channel !== 'sis') return { ok: false, error: 'only a person the SIS created can be merged' };
  const at = now.toISOString();
  return db.transaction(async (tx) => {
    for (const t of PERSON_TABLES) await tx.prepare(`UPDATE ${t} SET person_id = ? WHERE person_id = ?`).run(targetId, sourceId);
    for (const f of await tx.prepare('SELECT * FROM lifecycle_events WHERE person_id = ?').all(sourceId)) {
      await tx.prepare(`INSERT INTO lifecycle_events (person_id, fact, source, source_ref, occurred_at, recorded_at)
        VALUES (?,?,?,?,?,?) ON CONFLICT (person_id, fact, source, source_ref) DO NOTHING`)
        .run(targetId, f.fact, f.source, f.source_ref, f.occurred_at, f.recorded_at);
    }
    await tx.prepare('DELETE FROM lifecycle_events WHERE person_id = ?').run(sourceId);
    await tx.prepare(`UPDATE people SET email = COALESCE(email, ?), phone = COALESCE(phone, ?),
      programme = COALESCE(programme, ?) WHERE id = ?`).run(source.email, source.phone, source.programme, targetId);
    await tx.prepare('DELETE FROM people WHERE id = ?').run(sourceId);
    await logEvent(tx, { personId: targetId, kind: 'note', direction: 'note', at, origin: MANUAL, actor: by,
      subject: `Merged: ${source.name} (created by the SIS) is this person`,
      body: [source.email, source.phone].filter(Boolean).join(', ') });
    const stats = { linked: 0, moved: 0, facts: 0 };
    const refs = await tx.prepare('SELECT DISTINCT reference FROM sis_applicants WHERE person_id = ?').all(targetId);
    for (const { reference } of refs) await applyToPerson(tx, reference, targetId, at, stats);
    return { ok: true, personId: targetId, moved: stats.moved };
  });
}

// GMAIL -> NEW LEADS (30.09.2026). runPoll fetched and shaped the messages and handed
// them back to nobody, so the mailbox was read and the queue never saw a thing. Each
// message goes through the gmail adapter and receive(), the same door every channel
// uses, which is what gives it the dedupe, the ageing rule and the junk filter.
//
// A second run over the same window adds nothing: Gmail's own message id is the
// external id, receive() knows it already, and the unique index holds underneath.
export async function syncGmail(db, { now = new Date(), env = process.env, fetchImpl = fetch,
  minutes = undefined, max = 25 } = {}) {
  const at = now.toISOString();
  const mode = await channelMode(db, 'gmail', env);
  if (mode === 'off') return { ok: true, ran: false, channel: 'gmail', why: 'the email channel is off' };

  // The bookmark is the time of the last GOOD run; the next run asks from there, with ten minutes
  // of overlap (a repeat is free: receive() knows the message id). The first run asks for 26 hours.
  const state = await db.prepare("SELECT value FROM sync_state WHERE name = 'gmail'").get();
  const last = state && state.value && !Number.isNaN(Date.parse(state.value)) ? state.value : null;
  const since = minutes ? null
    : new Date((last ? Date.parse(last) - 10 * 60000 : now.getTime() - 26 * 3600000)).toISOString();
  const refreshToken = await loadGmailRefreshToken(db, env);     // option B, when connected
  // Q91: a labelled message we already hold is not fetched again; the pull only needs to know it is held.
  const held = async (ids) => {
    const have = new Set();
    for (const id of ids) if (await heldGmail(db, id)) have.add(id);
    return have;
  };
  const got = await gmailPoll({ env, now, fetchImpl, max, since, refreshToken, held, ...(minutes ? { minutes } : {}) });
  // A run where some messages could not be fetched (got.failed) still files the ones that came, and
  // then keeps the old bookmark and reports not ok, so the rest are asked for again (M7, 07.10.2026).
  const partial = !got.ok && got.failed > 0 && Array.isArray(got.items);
  if (!got.ok && !partial) {
    await saveState(db, 'gmail', last, { ok: false, why: got.why }, at);
    return { ok: false, ran: got.ran, channel: 'gmail', mode, why: got.why, waitingOn: got.waitingOn || null };
  }

  const out = { fetched: got.messages, inbox: 0, repeat: 0, filtered: 0, unusable: 0 };
  for (const shaped of got.items || []) {
    let ev;
    try { ev = adapt('gmail', shaped); } catch { out.unusable++; continue; }
    const it = toIntake(ev);
    // Q74 (07.10.2026): a known person's email goes on their history (rule 1); the same sender again
    // joins their waiting card (rule 2); a newsletter is set aside like other automatic mail (rule 3).
    // Q91 (13.10.2026): the Admissions label means a person accepted it: no filter at all, rules 1 and 2 as before.
    const labelled = Boolean(shaped.admissions);
    const r = await receive(db, { ...it, source: mode === 'live' ? 'provider' : 'simulated',
      ...(labelled ? { noFilter: true } : { filterWhy: emailFilterWhy(it.email) }),
      attachTo: await activePersonFor(db, it.email), joinOpenSender: true });
    if (labelled) out.labelled = (out.labelled || 0) + 1;
    if (r.duplicate && labelled && await labelBringsBack(db, r.id, at)) out.broughtBack = (out.broughtBack || 0) + 1;
    if (r.duplicate) out.repeat++;
    else if (r.filtered) out.filtered++;
    else if (r.attached) out.toPerson = (out.toPerson || 0) + 1;
    else if (r.joined) out.joined = (out.joined || 0) + 1;
    else out.inbox++;
  }

  // Q91: labelled, already held, not fetched again: a rule had filtered it, a person has since accepted it.
  for (const id of got.labelledHeld || []) {
    const row = await heldGmail(db, id);
    if (row && await labelBringsBack(db, row, at)) out.broughtBack = (out.broughtBack || 0) + 1;
  }
  out.labels = got.labels || null;

  // more:true means Gmail had another page. Say so rather than report a clean run.
  // A run that had to stop with pages left keeps the old bookmark, so the rest is asked again.
  // the same run reads the enquiries' threads for the first reply (first-reply time, 07.10.2026)
  // a failure here never costs the poll its result: the threads are simply read again next run
  let replies;
  try { replies = await syncReplies(db, { now, env, fetchImpl, refreshToken }); } catch (err) { replies = { ok: false, why: 'the reply read failed' }; }
  await saveState(db, 'gmail', got.more || partial ? last : at, { ...out, query: got.query, more: Boolean(got.more), replies,
    ...(partial ? { ok: false, failed: got.failed, why: got.why } : {}) }, at);
  return { ok: !partial, ran: true, channel: 'gmail', mode, ...out, more: Boolean(got.more), query: got.query, replies,
    ...(partial ? { failed: got.failed, why: got.why } : {}) };
}

// Q91: the Inbox row (or the card a line joined) that holds this Gmail message id, or null.
async function heldGmail(db, externalId) {
  const row = await db.prepare("SELECT id FROM inbound WHERE channel = 'gmail' AND external_id = ?").get(externalId);
  if (row) return Number(row.id);
  const line = await db.prepare("SELECT inbound_id FROM inbound_line WHERE channel = 'gmail' AND external_id = ?").get(externalId);
  return line ? Number(line.inbound_id) : null;
}

// Q91: filtered first, labelled later -> back in the Inbox, the same row (never a second one), logged as brought back
// by the label. Only what a RULE set aside: a message a person set aside stays where the person put it.
async function labelBringsBack(db, id, at) {
  const row = await db.prepare('SELECT state FROM inbound WHERE id = ?').get(id);
  if (!row || row.state !== 'filtered') return false;
  const r = await bringBack(db, id, { by: 'Admissions label', at });
  return Boolean(r && r.ok && !r.already);
}

// FIRST-REPLY TIME (the owner, 07.10.2026; replies go out from edu@). For the email enquiries of the last REPLY_DAYS
// that have no first reply yet, read each thread and keep ONLY the time of the first message edu@ sent after the
// enquiry (lib/gmail.js runReplies: the Date header, nothing else). The enquiries are the Inbox's REAL ones (source
// provider, so a test-mode copy never asks Gmail for a thread): not
// filtered, not set aside. A reply found goes on the Inbox row (first_reply_at) and, when the row is already a person,
// into their History as an automatic outgoing email with no subject and no body. Every thread read is stamped
// (reply_checked_at), so "no reply yet" is a fact about a read thread, never a guess about an unread one.
export const REPLY_DAYS = 30;
export const REPLY_MAX = 40;
export async function syncReplies(db, { now = new Date(), env = process.env, fetchImpl = fetch, refreshToken = undefined, max = REPLY_MAX } = {}) {
  const at = now.toISOString();
  const since = new Date(now.getTime() - REPLY_DAYS * 86400000).toISOString();
  // least recently read first, so a long list is walked through over several runs
  const rows = await db.prepare(`SELECT id, thread_key, received_at, person_id FROM inbound
    WHERE channel = 'gmail' AND source = 'provider' AND thread_key IS NOT NULL AND first_reply_at IS NULL AND state IN ('new', 'qualified')
      AND received_at >= ? ORDER BY reply_checked_at IS NOT NULL, reply_checked_at, received_at DESC LIMIT ?`).all(since, max);
  if (!rows.length) return { ok: true, read: 0, replied: 0, refused: 0 };
  const token = refreshToken === undefined ? await loadGmailRefreshToken(db, env) : refreshToken;
  const got = await gmailReplies({ env, now, fetchImpl, refreshToken: token,
    threads: rows.map((r) => ({ threadId: r.thread_key, after: r.received_at })) });
  if (!got.ok) return { ok: false, read: 0, replied: 0, refused: rows.length, why: got.why };
  let read = 0, replied = 0, refused = 0;
  for (const r of rows) {
    // Gmail did not answer: not stamped, read again next run, and COUNTED here so a thread that keeps refusing shows
    if (!Object.prototype.hasOwnProperty.call(got.found, r.thread_key)) { refused++; continue; }
    read++;
    const sent = got.found[r.thread_key];
    if (sent) replied++;
    await recordReplyRead(db, { id: r.id, sentAt: sent, checkedAt: at, personId: r.person_id });   // intake.js owns the write
  }
  return { ok: true, read, replied, refused };
}

// One SIS record into sis_applicants. False when an older or equal copy arrives after the one we
// hold: that changes nothing. The pull and the application webhook both come through here.
async function storeSisRow(db, r, at, stats) {
  const old = await db.prepare('SELECT * FROM sis_applicants WHERE reference = ? AND application_id = ?')
    .get(r.reference, r.application_id);
  if (old && old.changed_at >= r.changed_at) return false;
  await db.prepare(`INSERT INTO sis_applicants (reference, application_id, given_name, family_name, email,
    phone, programme_code, status, registered_at, submitted_at, changed_at, admitted_on, synced_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT (reference, application_id) DO UPDATE SET given_name = excluded.given_name,
    family_name = excluded.family_name, email = excluded.email, phone = excluded.phone,
    programme_code = excluded.programme_code, status = excluded.status,
    registered_at = excluded.registered_at, submitted_at = excluded.submitted_at,
    changed_at = excluded.changed_at, admitted_on = excluded.admitted_on, synced_at = excluded.synced_at`).run(
    r.reference, r.application_id, r.given_name, r.family_name, r.email, r.phone, r.programme_code,
    r.status, r.registered_at, r.submitted_at, r.changed_at, r.admitted_on || null, at);
  stats.stored++;
  // a closing status on a person we already know goes on their timeline
  if (old && old.person_id && old.status !== r.status && SIS_CLOSING.includes(r.status)) {
    await logEvent(db, { personId: old.person_id, kind: 'status', direction: 'note', at, origin: AUTOMATIC,
      actor: 'SIS', subject: sisSentence(r), body: 'The Intake stage is unchanged.' });
    stats.noted++;
  }
  return true;
}

// THE FAST PATH (POST /api/intake/application, 30.09.2026). apply.novikontas.org or the SIS sends one
// applicant record, in the SIS feed's own fields, the moment it changes. It goes through exactly
// what the daily pull does for that record; the pull stays the safety net and keeps its own
// bookmark. The same record twice, from either side, is a repeat.
export async function receiveSisApplication(db, raw, { now = new Date(), env = process.env } = {}) {
  const mode = await channelMode(db, 'sis', env);
  if (mode === 'off') return { ok: false, status: 409, error: 'the SIS channel is off' };
  let r;
  try { r = toSisRow(raw); } catch (err) { return { ok: false, status: 400, error: err.message }; }
  const at = now.toISOString();
  const stats = { stored: 0, linked: 0, moved: 0, inbox: 0, created: 0, noted: 0, facts: 0, undated: 0 };
  if (!(await storeSisRow(db, r, at, stats))) return { ok: true, outcome: 'repeat', mode };
  await placeSisReference(db, r.reference, { at, mode, stats });
  const outcome = stats.created ? 'created'
    : stats.undated && !stats.linked && !stats.moved ? 'undated'
    : stats.linked || stats.moved || stats.facts || stats.noted ? 'linked'
      : stats.inbox ? 'waiting' : 'repeat';
  return { ok: true, outcome, mode };
}

export async function syncSis(db, { now = new Date(), env = process.env, fetchImpl = fetch } = {}) {
  const at = now.toISOString();
  const mode = await channelMode(db, 'sis', env);
  if (mode === 'off') return { ok: true, ran: false, channel: 'sis', why: 'the SIS channel is off' };

  const state = await db.prepare("SELECT value FROM sync_state WHERE name = 'sis'").get();
  const since = state && state.value ? state.value : null;
  const got = await fetchChanged({ since, env, fetchImpl });
  // undated: SIS records held with no usable admission date, so no person was made (06.10.2026)
  const stats = { fetched: got.applicants.length, stored: 0, unusable: 0, linked: 0, moved: 0, inbox: 0,
    created: 0, noted: 0, facts: 0, undated: 0, pages: got.pages };
  let newest = since;
  const touched = new Set();

  for (const a of got.applicants) {
    let r;
    try { r = toSisRow(a); } catch { stats.unusable++; continue; }
    if (!newest || r.changed_at > newest) newest = r.changed_at;
    if (await storeSisRow(db, r, at, stats)) touched.add(r.reference);
  }

  // Every SIS person still unlinked is tried again, not only the ones that changed:
  // the Inbox item raised for them may have been confirmed since the last run.
  const open = await db.prepare(`SELECT reference, MAX(inbound_id) inbound_id FROM sis_applicants
    WHERE person_id IS NULL GROUP BY reference`).all();
  const refs = new Set([...touched, ...open.map((o) => o.reference)]);

  for (const reference of refs) await placeSisReference(db, reference, { at, mode, stats });

  // Only a complete run moves the bookmark; an incomplete one asks again next time.
  const value = got.complete ? newest : since;
  await saveState(db, 'sis', value, stats, at);
  const purged = await purgeOld(db, 'sis_applicants', 'changed_at', now);
  return { ok: true, ran: true, channel: 'sis', mode, since, next: value, complete: got.complete, ...stats, purged };
}
