// The admissions sheet -> Intake, one way (Q89, the owner 12.10.2026). The team still works in the Google Sheet
// "ADMISSIONS DATABASE"; until 100% of leads are made in Intake, every change there is pulled in here, and a count
// shows when the sheet can go. The Google side is lib/sheetpull.js; this file is what a row does to Intake.
//
// MATCH: email -> phone (last 8 digits) -> full name, each only when exactly ONE person fits. Two or more = no
// guess: the row is counted as "needs a person" and nothing is written. No match = a new person, first contact on
// the sheet's own date (accurate dates, 06.10.2026), first_channel 'sheet'.
//
// INTAKE WINS. sheet_rows keeps what the sheet said at the last pull. A field is written only when the sheet
// CHANGED it since then (or it is the first pull), and nobody changed that field by hand in Intake. Notes are
// appended to the timeline, never overwritten. The next action date moves only a step the sheet made itself.
// The stage moves forwards only, never to Not proceeding: closing somebody needs a reason from a person.
//
// It never writes to the sheet. It writes people, events, tasks and sheet_rows, nothing else.

import { logEvent, AUTOMATIC } from './history.js';
import { normEmail, normPhone } from './identity.js';
import { newPersonId } from './intake.js';
import { fromRigaStamp } from '../lib/riga.js';
import { sheetDay, rowsOf, readTab, accessToken, loadSheetToken, tabTitles, sameTab } from '../lib/sheetpull.js';
import { rigaWeek } from './applications.js';

export const ACTOR = 'Admissions sheet';
export const SHEET_TASK = 'Sheet: next action';
// the step the 24.09 one-time import made; it is the sheet's too
const SHEET_TASKS = [SHEET_TASK, 'Get in touch (from the sheet)'];
const TAIL = 8;

// The old import's mapping (import_sheet.py), Contract gone since Q75.
export function stageOf(status, docs) {
  const st = String(status || '').trim().toUpperCase();
  const dc = String(docs || '').trim().toLowerCase();
  if (st.startsWith('REJECT')) return null;                  // never closed by a machine
  if (dc === 'done') return 'Application';
  if (st.startsWith('HOT')) return dc === 'in process' ? 'Application' : 'Follow-up';
  if (st.startsWith('WARM')) return 'Follow-up';
  if (st.startsWith('COLD')) return 'Contacted';
  return null;                                               // unknown wording: the stage is left alone
}
const SOURCE = { call: 'phone', phone: 'phone', email: 'email', 'e-mail': 'email', 'on-site': 'klatiene', website: 'website',
  instagram: 'instagram', facebook: 'facebook', whatsapp: 'whatsapp', campaign: 'campaign' };
export const sourceOf = (v) => (v ? SOURCE[String(v).trim().toLowerCase()] || null : null);
const at9 = (day) => (day ? fromRigaStamp(day + ' 09:00:00').toISOString() : null);
const tail = (v) => normPhone(v).replace(/\D/g, '').slice(-TAIL);
const nameKey = (v) => String(v || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/** What a row says, in Intake's words. Only what the row carries; a blank stays blank. */
export function readRow(r, edu = (v) => v) {
  const email = normEmail(r.email);
  return {
    name: r.name, email: /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(email) ? email : null,
    phone: r.phone ? String(r.phone).trim() : null, programme: r.programme || null, education: r.education ? edu(r.education) : null,
    source_channel: sourceOf(r.source), source_detail: r.source || null,
    stage: stageOf(r.status, r.docs), status: r.status || null, docs: r.docs || null,
    notes: r.notes || null, firstDay: sheetDay(r.firstContact), nextDay: sheetDay(r.nextAction),
  };
}
// The row's identity across pulls: its email, else phone, else name. Never the row number, which moves.
export const rowKey = (x) => (x.email ? 'e:' + x.email : tail(x.phone).length >= 7 ? 'p:' + tail(x.phone) : 'n:' + nameKey(x.name));

async function match(db, x) {
  if (x.email) {
    const ids = (await db.prepare('SELECT id FROM people WHERE LOWER(email) = ?').all(x.email)).map((r) => r.id);
    if (ids.length) return ids.length === 1 ? { id: ids[0], by: 'email' } : { many: true };
  }
  const t = tail(x.phone);
  if (t.length >= 7) {
    const ids = (await db.prepare('SELECT id, phone FROM people WHERE phone IS NOT NULL').all())
      .filter((p) => tail(p.phone) === t).map((p) => p.id);
    if (ids.length) return ids.length === 1 ? { id: ids[0], by: 'phone' } : { many: true };
  }
  const k = nameKey(x.name);
  const ids = (await db.prepare('SELECT id, name FROM people').all()).filter((p) => nameKey(p.name) === k).map((p) => p.id);
  if (ids.length) return ids.length === 1 ? { id: ids[0], by: 'name' } : { many: true };
  return null;
}

// Did a person change this field by hand in Intake (after `since`, when given)?
async function touchedByHand(db, personId, field, since) {
  const kind = field === 'status' ? 'status' : 'edit';
  const r = await db.prepare(`SELECT COUNT(*) n FROM events WHERE person_id = ? AND kind = ? AND field = ? AND origin = 'manual'
    ${since ? 'AND occurred_at > ?' : ''}`).get(...[personId, kind, field, ...(since ? [since] : [])]);
  return Number(r.n) > 0;
}

const FIELDS = ['programme', 'education', 'source_channel'];
const ORDER = ['New', 'Contacted', 'Follow-up', 'Application', 'Admitted'];

async function applyToPerson(db, pid, x, before, at, stats, cfg) {
  const p = await db.prepare('SELECT * FROM people WHERE id = ?').get(pid);
  if (!p) return;
  const since = before ? before.seen_at : null;
  const last = before ? JSON.parse(before.applied || '{}') : {};
  const changed = (k) => (x[k] ?? null) !== (last[k] ?? null);
  for (const f of FIELDS) {
    if (x[f] == null || !changed(f) || p[f] === x[f]) continue;
    if (await touchedByHand(db, pid, f, since)) { stats.keptIntake++; continue; }
    await db.prepare(`UPDATE people SET ${f} = ? WHERE id = ?`).run(x[f], pid);
    await logEvent(db, { personId: pid, kind: 'edit', direction: 'note', at, origin: AUTOMATIC, actor: ACTOR,
      subject: `${f.replace('_channel', '')} from the sheet`, body: `${p[f] ?? '(empty)'} -> ${x[f]}`, field: f, oldValue: p[f], newValue: x[f] });
    stats.fields++;
  }
  // the stage: forwards only, never from a finished person, never by a machine to Not proceeding
  if (x.stage && changed('stage') && !(cfg.terminalStages || []).includes(p.status)
    && ORDER.indexOf(x.stage) > ORDER.indexOf(p.status) && !(await touchedByHand(db, pid, 'status', since))) {
    await db.prepare('UPDATE people SET status = ? WHERE id = ?').run(x.stage, pid);
    await logEvent(db, { personId: pid, kind: 'status', direction: 'note', at, origin: AUTOMATIC, actor: ACTOR,
      subject: `Status: ${p.status} -> ${x.stage}`, body: `the sheet says ${x.status || ''}${x.docs ? ', docs ' + x.docs : ''}`.trim(),
      field: 'status', oldValue: p.status, newValue: x.stage });
    stats.moved++;
  }
  // what the sheet says in words: its status and its notes, appended when they change
  if ((x.status && changed('status')) || (x.notes && changed('notes'))) {
    const body = [x.status && changed('status') ? 'Status: ' + x.status : null, x.notes && changed('notes') ? x.notes : null].filter(Boolean).join(' | ');
    await logEvent(db, { personId: pid, kind: 'note', direction: 'note', at, origin: AUTOMATIC, actor: ACTOR, subject: 'From the sheet', body });
    stats.notes++;
  }
  // the next action date moves the sheet's own step only; a step made in Intake is never touched
  if (x.nextDay && changed('nextDay') && !(cfg.terminalStages || []).includes(p.status)) {
    const open = await db.prepare('SELECT id, label FROM tasks WHERE person_id = ? AND done_at IS NULL').all(pid);
    const mine = open.find((t) => SHEET_TASKS.includes(t.label));
    if (mine) { await db.prepare('UPDATE tasks SET due_at = ? WHERE id = ?').run(at9(x.nextDay), mine.id); stats.steps++; }
    else if (!open.length) {
      await db.prepare('INSERT INTO tasks (person_id,label,due_at,owner,created_at) VALUES (?,?,?,?,?)')
        .run(pid, SHEET_TASK, at9(x.nextDay), p.owner || 'Admissions', at);
      stats.steps++;
    } else stats.keptIntake++;
  }
}

const fromOldImport = async (db, pid) => Number((await db.prepare(`SELECT COUNT(*) n FROM events WHERE person_id = ? AND actor = ?`)
  .get(pid, OLD_IMPORT)).n) > 0;
export const OLD_IMPORT = 'ADMISSIONS DATABASE';

async function createPerson(db, x, at) {
  const id = newPersonId();
  const created = at9(x.firstDay);                           // the sheet's own date; no date stays no date
  await db.prepare(`INSERT INTO people (id,name,email,phone,programme,education,status,owner,source_channel,source_detail,
    created_at,first_channel,qualification) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, x.name, x.email, x.phone, x.programme,
    x.education, x.stage || 'New', 'Admissions', x.source_channel, x.source_detail, created, 'sheet', 'lead');
  await logEvent(db, { personId: id, kind: 'create', direction: 'in', at: created || at, origin: AUTOMATIC, actor: ACTOR,
    subject: 'Created from the admissions sheet', body: [x.status ? 'Status: ' + x.status : null, x.notes].filter(Boolean).join(' | ') || null });
  if (x.nextDay) await db.prepare('INSERT INTO tasks (person_id,label,due_at,owner,created_at) VALUES (?,?,?,?,?)')
    .run(id, SHEET_TASK, at9(x.nextDay), 'Admissions', at);
  return id;
}

/** One pass over the rows of the sheet's live tabs. Pure on the db; the rows come from the caller. */
export async function applyRows(db, tabs, { now = new Date(), cfg = {}, edu } = {}) {
  const at = now.toISOString();
  const stats = { rows: 0, created: 0, linked: 0, unchanged: 0, fields: 0, moved: 0, notes: 0, steps: 0, keptIntake: 0, needsPerson: 0 };
  const seen = new Set();
  for (const { tab, rows } of tabs) {
    for (const r of rows) {
      const x = readRow(r, edu);
      const key = rowKey(x);
      if (seen.has(tab + key)) continue;                     // the same person twice in one tab: the first row
      seen.add(tab + key);
      stats.rows++;
      const before = await db.prepare('SELECT * FROM sheet_rows WHERE tab = ? AND row_key = ?').get(tab, key);
      let pid = before && before.person_id && (await db.prepare('SELECT id FROM people WHERE id = ?').get(before.person_id)) ? before.person_id : null;
      let made = before ? Number(before.created_person) : 0;
      if (!pid) {
        const m = await match(db, x);
        if (m && m.many) { stats.needsPerson++; continue; }
        // a person the 24.09 one-time import made is a sheet person too, not one made in Intake
        if (m) { pid = m.id; made = (await fromOldImport(db, pid)) ? 1 : 0; stats.linked++; }
        else { pid = await createPerson(db, x, at); made = 1; stats.created++; }
      }
      const applied = JSON.stringify(x);
      if (before && before.applied === applied && before.person_id === pid) { stats.unchanged++; }
      else if (!(made && !before)) await applyToPerson(db, pid, x, before, at, stats, cfg);
      await db.prepare(`INSERT INTO sheet_rows (tab, row_key, person_id, applied, created_person, first_day, seen_at)
        VALUES (?,?,?,?,?,?,?) ON CONFLICT (tab, row_key) DO UPDATE SET person_id = excluded.person_id, applied = excluded.applied,
        created_person = excluded.created_person, first_day = excluded.first_day, seen_at = excluded.seen_at`)
        .run(tab, key, pid, applied, made, x.firstDay, at);
    }
  }
  return stats;
}

/** The scheduled / "Pull now" run: read both tabs, apply, remember the run. Never writes to the sheet. */
export async function pullSheet(db, { env = process.env, fetchImpl = fetch, now = new Date(), cfg = {}, edu } = {}) {
  const sp = cfg.sheetPull || {};
  if (sp.on === false) return { ok: true, ran: false, why: 'the sheet pull is switched off' };
  const refresh = await loadSheetToken(db, env);
  if (!refresh) return { ok: true, ran: false, why: 'the sheet is not connected', waitingOn: 'edu@ to approve read-only access once' };
  const tok = await accessToken({ env, refreshToken: refresh, fetchImpl });
  if (!tok.ok) return { ok: false, ran: false, why: tok.why };
  const list = await tabTitles({ env, token: tok.token, spreadsheetId: sp.spreadsheetId, fetchImpl });
  if (!list.ok) return { ok: false, ran: false, why: list.why };
  const tabs = [];
  for (const want of sp.tabs || []) {
    const tab = list.titles.find((t) => sameTab(t, want));
    if (!tab) return { ok: false, ran: false, why: `the tab "${want}" is not in the sheet` };
    const got = await readTab({ env, token: tok.token, spreadsheetId: sp.spreadsheetId, tab, fetchImpl });
    if (!got.ok) return { ok: false, ran: false, why: got.why };
    const parsed = rowsOf(got.values);
    if (!parsed.ok) return { ok: false, ran: false, why: `${tab}: ${parsed.why}` };
    tabs.push({ tab, rows: parsed.rows });
  }
  const stats = await applyRows(db, tabs, { now, cfg, edu });
  await db.prepare(`INSERT INTO sync_state (name, value, ran_at, detail) VALUES ('sheet', ?, ?, ?)
    ON CONFLICT (name) DO UPDATE SET value = excluded.value, ran_at = excluded.ran_at, detail = excluded.detail`)
    .run(String(stats.rows), now.toISOString(), JSON.stringify(stats));
  return { ok: true, ran: true, ...stats };
}

/** For admins: by first-contact week, "made in Intake" (the person was made in Intake before the pull found them)
 *  and "sheet only" (the pull made them, or the 24.09 one-time import did). 100% made in Intake for recent weeks = the sheet can go. Counts only. */
export async function sheetCounts(db) {
  let rows = [];
  try { rows = await db.prepare('SELECT person_id, created_person, first_day FROM sheet_rows').all(); } catch { rows = []; }
  let run = null;
  try { run = await db.prepare("SELECT ran_at, detail FROM sync_state WHERE name = 'sheet'").get(); } catch { run = null; }
  const byPerson = new Map();
  for (const r of rows) { const o = byPerson.get(r.person_id); if (!o || (!r.created_person && o.created_person)) byPerson.set(r.person_id, r); }
  const weeks = new Map(); let undated = { madeInIntake: 0, sheetOnly: 0 };
  for (const r of byPerson.values()) {
    const w = r.first_day ? rigaWeek(r.first_day + 'T12:00:00Z') : null;
    const bucket = w ? (weeks.get(w.week) || weeks.set(w.week, { week: w.week, monday: w.monday, madeInIntake: 0, sheetOnly: 0 }).get(w.week)) : undated;
    if (Number(r.created_person)) bucket.sheetOnly++; else bucket.madeInIntake++;
  }
  let last = null;
  if (run) { try { last = { at: run.ran_at, ...JSON.parse(run.detail || '{}') }; } catch { last = { at: run.ran_at }; } }
  return { lastPull: last, weeks: [...weeks.values()].sort((a, b) => b.week.localeCompare(a.week)), undated };
}
