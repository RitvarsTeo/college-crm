// MY WEEK and LOG A CONTACT (the owner's pick B, 20.10.2026; pictures Pitches/intake-tc/board1/B_home + B_key).
//
// Monday to Friday of planned contacts (tc_tasks by due_at), Mine or Team. NOTHING READS AS LATE: a contact not done on
// an earlier day is drawn in today's column with the day it was first planned ("from Mon"), never in red, and nothing
// counts how many there are. Done this week = a grey "Logged" card on the day it was done.
//
// "Ready to plan": my companies with no open contact. "Plan" puts one on a day (one open contact per company, as on
// the company page). "Log a contact" closes the open contact with what was done and how it went, writes the company's
// log, and plans the next one: +1 week, +2 weeks, +1 month, after New Year, or a date. config/tc_week.json.
//
// B2B only: nothing here reads or counts Academy people. A group's TOTAL row (src/tc.js isTotalRow) stays out of
// Ready to plan, as out of every list a figure opens.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { localDate } from './bizday.js';
import { TC, TcInputError, isDay, addDays, isTotalRow } from './tc.js';
import { isMine, meKeys } from './tcpic.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const WEEK = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'tc_week.json'), 'utf8'));
const KINDS = new Map(WEEK.kinds.map((k) => [k.id, k]));
const RESULTS = new Map(WEEK.results.map((r) => [r.id, r]));
const NEXT = new Map(WEEK.next.map((n) => [n.id, n]));
const bad = (msg) => { throw new TcInputError(msg); };
const clip = (v, n = 2000) => { const s = String(v ?? '').trim(); return s ? s.slice(0, n) : null; };
const byLv = (a, b) => String(a || '').localeCompare(String(b || ''), 'lv');
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dow = (ymd) => new Date(ymd + 'T00:00:00Z').getUTCDay();
export const kindOf = (id) => KINDS.get(id) || KINDS.get(WEEK.defaultKind);

/** The Monday of the week a day is in (a Saturday or Sunday belongs to the week it ends). */
export function mondayOf(ymd) { const d = dow(ymd); return addDays(ymd, d === 0 ? -6 : 1 - d); }
/** A weekend day moves to the Monday after it. */
const workday = (ymd) => { const d = dow(ymd); return d === 6 ? addDays(ymd, 2) : d === 0 ? addDays(ymd, 1) : ymd; };
const addMonths = (ymd, n) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + n, Math.min(d, last))).toISOString().slice(0, 10);
};

/** The day a "Next contact" choice lands on, from `today`; always a working day. */
export function nextDay(today, choice, picked = null) {
  const o = NEXT.get(choice);
  if (!o) bad('Pick when the next contact is.');
  if (o.id === 'date') {
    if (!isDay(picked)) bad('Pick the day of the next contact.');
    if (picked < today) bad('The next contact is today or later.');
    return picked;
  }
  if (o.days) return workday(addDays(today, o.days));
  if (o.months) return workday(addMonths(today, o.months));
  if (o.newYearDay) return workday(`${Number(today.slice(0, 4)) + 1}-01-${String(o.newYearDay).padStart(2, '0')}`);
  return bad('Pick when the next contact is.');
}

const initials = (name) => String(name || '').split(/\s*;\s*/)[0].split(/\s+/).filter(Boolean).slice(0, 2)
  .map((w) => w[0].toUpperCase()).join('');

/**
 * The week. `from` any day of it (default: today, or next Monday on a Saturday or Sunday); `scope` mine | team;
 * `me` the signed-in person ({ email, name }). Mine = the company's person in charge is me, or the contact's owner is.
 */
export async function week(db, { from = null, scope = 'mine', me = null, now = new Date() } = {}) {
  const today = localDate(now);
  const carryDay = workday(today);                    // where a not-done contact is drawn: today, or Monday after a weekend
  const monday = mondayOf(isDay(from) ? from : carryDay);
  const friday = addDays(monday, 4);
  const mk = meKeys(me);
  const team = scope === 'team';
  const rows = await db.prepare(`SELECT t.id, t.company_id, t.contact_id, t.label, t.due_at, t.owner, t.done_at, t.outcome, t.kind, t.result,
      c.name, c.country, c.pic_name, c.pic_email, k.name AS contact_name, k.position AS contact_position
    FROM tc_tasks t JOIN tc_companies c ON c.id = t.company_id LEFT JOIN tc_company_contacts k ON k.id = t.contact_id
    WHERE c.archived_at IS NULL AND ((t.done_at IS NULL AND t.due_at <= ?) OR (t.done_at IS NOT NULL AND t.done_at >= ?))`)
    .all(addDays(friday, 2), addDays(monday, -1) + 'T00:00:00.000Z');
  const mine = (r) => isMine({ picEmail: r.pic_email || '', pic: r.pic_name || '', next: { owner: r.owner || '' } }, mk);
  const days = Array.from({ length: 5 }, (_, i) => {
    const day = addDays(monday, i);
    return { day, dow: DOW[dow(day)], n: Number(day.slice(8)), today: day === today, cards: [] };
  });
  const at = new Map(days.map((d) => [d.day, d]));
  for (const r of rows) {
    if (!team && !mine(r)) continue;
    const k = kindOf(r.kind);
    const card = { taskId: Number(r.id), companyId: Number(r.company_id), name: r.name, country: r.country || '',
      contact: r.contact_name || r.contact_position || '', kind: k.id, kindLabel: k.label,
      topic: r.label && r.label !== TC.nextLabel ? r.label : '', due: r.due_at, owner: r.owner || r.pic_name || '',
      ownerInitials: initials(r.owner || r.pic_name) };
    if (r.done_at) {
      if (WEEK.doneOutcomesHidden.includes(String(r.outcome || ''))) continue;
      let d = localDate(new Date(r.done_at));
      if (d > friday && d <= addDays(friday, 2)) d = friday;   // done on the weekend after: Friday's column
      if (!at.has(d)) continue;
      const res = RESULTS.get(r.result);
      at.get(d).cards.push({ ...card, done: true, result: res ? res.label : '' });
      continue;
    }
    // open: drawn on its day, or today when that day has passed; a weekend day moves to the Monday after
    const d = workday(r.due_at < carryDay ? carryDay : r.due_at);
    if (!at.has(d)) continue;
    at.get(d).cards.push({ ...card, done: false, from: d !== r.due_at ? DOW[dow(r.due_at)] + (r.due_at < monday ? ' ' + Number(r.due_at.slice(8)) + '.' + Number(r.due_at.slice(5, 7)) + '.' : '') : null });
  }
  // the order in a day: still to do first (carried ones first among them), then the logged ones; then by name
  for (const d of days) d.cards.sort((a, b) => (a.done - b.done) || ((b.from ? 1 : 0) - (a.from ? 1 : 0)) || byLv(a.name, b.name));
  return {
    today, monday, friday, scope: team ? 'team' : 'mine', signedIn: Boolean(mk),
    prev: addDays(monday, -7), next: addDays(monday, 7), thisWeek: mondayOf(carryDay) === monday,
    days, ready: await readyToPlan(db, mk, { limit: WEEK.readyRows }),
    kinds: WEEK.kinds.map(({ id, label }) => ({ id, label })), results: WEEK.results, nextOptions: WEEK.next.map(({ id, label }) => ({ id, label })),
  };
}

/** My companies with no open contact, the ones with the most recent delegates first. Not a TOTAL row. */
export async function readyToPlan(db, mk, { limit = 6 } = {}) {
  if (!mk) return { total: 0, rows: [], mine: 0 };
  // mine = every company in my charge, planned or not, so the empty list can say which of the two it is (live check
  // 22.10.2026: a person with no companies read "Every one of your companies has a contact planned")
  const companies = await db.prepare(`SELECT c.id, c.name, c.country, c.pic_name, c.pic_email,
    CASE WHEN EXISTS (SELECT 1 FROM tc_tasks t WHERE t.company_id = c.id AND t.done_at IS NULL) THEN 1 ELSE 0 END AS planned
    FROM tc_companies c WHERE c.archived_at IS NULL`).all();
  const mineAll = companies.filter((c) => !isTotalRow(c.country) && isMine({ picEmail: c.pic_email || '', pic: c.pic_name || '', next: null }, mk));
  const mineRows = mineAll.filter((c) => !Number(c.planned));
  const ids = new Set(mineRows.map((c) => Number(c.id)));
  const courses = new Map();
  for (const k of await db.prepare('SELECT company_id, year, attendees FROM tc_company_courses WHERE attendees > 0').all()) {
    if (!ids.has(Number(k.company_id))) continue;
    const cur = courses.get(Number(k.company_id));
    if (!cur || Number(k.year) > cur.year) courses.set(Number(k.company_id), { year: Number(k.year), n: Number(k.attendees) });
  }
  const rows = mineRows.map((c) => ({ id: Number(c.id), name: c.name, country: c.country || '', last: courses.get(Number(c.id)) || null }));
  rows.sort((a, b) => ((b.last ? b.last.year : 0) - (a.last ? a.last.year : 0)) || ((b.last ? b.last.n : 0) - (a.last ? a.last.n : 0)) || byLv(a.name, b.name));
  return { total: rows.length, rows: rows.slice(0, Math.max(1, Number(limit) || 6)), mine: mineAll.length };
}

async function mustCompany(db, id) {
  const c = await db.prepare('SELECT * FROM tc_companies WHERE id = ? AND archived_at IS NULL').get(Number(id));
  if (!c) bad('There is no such company, or it is archived.');
  return c;
}
const act = (tx, companyId, e) => tx.prepare(`INSERT INTO tc_activities (company_id, contact_id, kind, occurred_at, topics, body, actor, origin,
  field, old_value, new_value) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(companyId, e.contactId ?? null, e.kind, e.at, e.topics ?? null, e.body ?? null,
  e.actor, 'manual', e.field ?? null, e.old ?? null, e.new ?? null);

/** Plan a contact on a day: the company's one open contact is made or moved. */
export async function plan(db, companyId, b, actor, { now = new Date() } = {}) {
  if (!actor) bad('Who is planning?');
  const c = await mustCompany(db, companyId);
  const today = localDate(now);
  if (!isDay(b.due)) bad('Pick the day.');
  if (b.due < today) bad('A contact is planned for today or later.');
  const kind = b.kind ? String(b.kind) : WEEK.defaultKind;
  if (!KINDS.has(kind)) bad('Pick how: ' + WEEK.kinds.map((k) => k.label).join(', ') + '.');
  let contactId = null;
  if (b.contactId) {
    const k = await db.prepare('SELECT id FROM tc_company_contacts WHERE id = ? AND company_id = ? AND archived_at IS NULL').get(Number(b.contactId), c.id);
    if (!k) bad('That contact is not one of this company\'s.');
    contactId = Number(k.id);
  }
  const at = new Date().toISOString();
  return db.transaction(async (tx) => {
    const open = await tx.prepare('SELECT * FROM tc_tasks WHERE company_id = ? AND done_at IS NULL ORDER BY due_at').all(c.id);
    const label = clip(b.topic, 200) || (open[0] && open[0].label) || TC.nextLabel;
    if (open.length) {
      const t = open[0];
      await tx.prepare('UPDATE tc_tasks SET due_at = ?, label = ?, kind = ?, contact_id = ? WHERE id = ?')
        .run(b.due, label, kind, contactId ?? t.contact_id ?? null, t.id);
      for (const extra of open.slice(1)) await tx.prepare(`UPDATE tc_tasks SET done_at = ?, outcome = 'replaced' WHERE id = ?`).run(at, extra.id);
      await act(tx, c.id, { kind: 'task', field: 'next', old: t.due_at, new: b.due, body: `${kindOf(kind).label}: ${label} moved to ${b.due}`, actor, at });
      return { id: Number(t.id), due: b.due };
    }
    const r = await tx.prepare(`INSERT INTO tc_tasks (company_id, contact_id, label, due_at, owner, created_at, created_by, kind)
      VALUES (?,?,?,?,?,?,?,?)`).run(c.id, contactId, label, b.due, c.pic_name || null, at, actor, kind);
    await act(tx, c.id, { kind: 'task', field: 'next', old: null, new: b.due, body: `${kindOf(kind).label}: ${label} on ${b.due}`, actor, at });
    return { id: Number(r.lastInsertRowid), due: b.due };
  });
}

/** What the drawer shows about the company: who, the last communication, delegates in the last three years. */
export async function drawer(db, taskId) {
  const t = await db.prepare(`SELECT t.*, c.name, c.country, k.name AS contact_name, k.position AS contact_position FROM tc_tasks t
    JOIN tc_companies c ON c.id = t.company_id LEFT JOIN tc_company_contacts k ON k.id = t.contact_id
    WHERE t.id = ? AND c.archived_at IS NULL`).get(Number(taskId));
  if (!t) return null;
  const last = await db.prepare(`SELECT kind, occurred_at, topics, body FROM tc_activities WHERE company_id = ?
    AND kind NOT IN ('task', 'edit', 'create', 'import', 'status') ORDER BY occurred_at DESC, id DESC LIMIT 1`).get(t.company_id);
  const years = await db.prepare(`SELECT year, attendees FROM tc_company_courses WHERE company_id = ? AND attendees IS NOT NULL
    ORDER BY year DESC LIMIT 3`).all(t.company_id);
  const kind = (TC.activityKinds.find((k) => k.id === (last && last.kind)) || {}).label || (last && last.kind) || '';
  return { taskId: Number(t.id), companyId: Number(t.company_id), name: t.name, country: t.country || '',
    contact: [t.contact_name, t.contact_position].filter(Boolean).join(' · '), kind: kindOf(t.kind).id, topic: t.label !== TC.nextLabel ? t.label : '',
    due: t.due_at, done: Boolean(t.done_at),
    last: last ? { day: String(last.occurred_at).slice(0, 10), kind, what: last.topics || String(last.body || '').slice(0, 80) } : null,
    delegates: years.map((y) => ({ year: Number(y.year), n: Number(y.attendees) })) };
}

/**
 * Log a contact: the open contact is closed with what was done and how it went, the company's log gets a line, and the
 * next contact is planned. One transaction. b: { what, result, next, nextDue (for "Pick a date"), note }.
 */
export async function logContact(db, taskId, b, actor, { now = new Date() } = {}) {
  if (!actor) bad('Who is logging?');
  const t = await db.prepare('SELECT * FROM tc_tasks WHERE id = ? AND done_at IS NULL').get(Number(taskId));
  if (!t) bad('That contact is already logged or does not exist.');
  const c = await mustCompany(db, t.company_id);
  const k = KINDS.get(String(b.what || ''));
  if (!k) bad('Pick what it was: ' + WEEK.kinds.map((x) => x.label).join(', ') + '.');
  const res = RESULTS.get(String(b.result || ''));
  if (!res) bad('Pick how it went.');
  const today = localDate(now);
  const due = nextDay(today, String(b.next || ''), b.nextDue);
  const note = clip(b.note, 4000);
  const at = now.toISOString();   // the same clock as today (a test passes its own now)
  return db.transaction(async (tx) => {
    await tx.prepare('UPDATE tc_tasks SET done_at = ?, outcome = ?, result = ?, kind = ? WHERE id = ?')
      .run(at, `${res.label}${note ? ': ' + note : ''}`.slice(0, 2000), res.id, k.id, t.id);
    for (const extra of await tx.prepare('SELECT id FROM tc_tasks WHERE company_id = ? AND done_at IS NULL AND id <> ?').all(c.id, t.id)) {
      await tx.prepare(`UPDATE tc_tasks SET done_at = ?, outcome = 'replaced' WHERE id = ?`).run(at, extra.id);
    }
    await act(tx, c.id, { kind: k.activity, contactId: t.contact_id, topics: res.label, body: note || `${k.label}: ${res.label}`, actor, at });
    if (TC.contactKinds.includes(k.activity) && (!c.last_contact_at || at > c.last_contact_at)) {
      await tx.prepare('UPDATE tc_companies SET last_contact_at = ?, updated_at = ? WHERE id = ?').run(at, at, c.id);
    }
    const r = await tx.prepare(`INSERT INTO tc_tasks (company_id, contact_id, label, due_at, owner, created_at, created_by, kind)
      VALUES (?,?,?,?,?,?,?,?)`).run(c.id, t.contact_id ?? null, t.label, due, t.owner || c.pic_name || null, at, actor, k.id);
    await act(tx, c.id, { kind: 'task', field: 'next', old: t.due_at, new: due, body: `${t.label} on ${due}`, actor, at });
    return { ok: true, next: { id: Number(r.lastInsertRowid), due } };
  });
}
