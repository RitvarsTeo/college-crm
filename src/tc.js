// TRAINING CENTRE (19.10.2026): the client companies, read and written.
//
// The owner's picks, 19.10.2026: ONE Intake with two halves; the Training Centre half holds every client company with
// its people, its courses per year, every communication, and the next communication with a date. "Active clients" =
// any company with any course ever (a course line with at least one delegate). Every Training Centre person sees ALL
// companies; the person in charge is a filter. Intake is the master for contacts.
//
// The design is _training-centre/BACKEND_PROPOSAL.md: tc_ tables in the same schema (src/db.js), nothing hard deleted
// (archived_at), statuses and areas checked here against config/tc.json, never by a database CHECK.
//
// Pure data functions: every one takes the database first, so the tests drive them with no server.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { localDate } from './bizday.js';
import { accountIndex, matchAccount, picChoices, picLabels, isMine, meKeys, foldName } from './tcpic.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const TC = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'tc.json'), 'utf8'));

export const STATUS_IDS = TC.statuses.map((s) => s.id);
export const AREA_IDS = TC.areas.map((a) => a.id);
export const KIND_IDS = TC.activityKinds.map((k) => k.id);
export const MEETING_IDS = TC.meetingTypes.map((m) => m.id);
export const statusLabel = (id) => (TC.statuses.find((s) => s.id === id) || {}).label || id || '';

export class TcInputError extends Error {}
const bad = (msg) => { throw new TcInputError(msg); };

// ------------------------------------------------------------------ small rules --

/** Lower case, accents folded, & read as and, punctuation and spaces collapsed, a trailing legal form dropped. */
const LEGAL = ['sp z o o', 'sp zoo', 'b v', 'a s', 'o u', 'sia', 'as', 'ab', 'oy', 'oyj', 'bv', 'nv', 'gmbh', 'ltd', 'limited', 'llc',
  'inc', 'plc', 'sa', 'srl', 'spa', 'aps', 'asa', 'uab', 'ou', 'ag', 'kg', 'co', 'company'];
export function nameKey(name) {
  let t = String(name ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/["'`„“”«»‘’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  for (let again = true; again;) {
    again = false;
    for (const l of LEGAL) {
      if (t.length > l.length + 1 && t.endsWith(' ' + l)) { t = t.slice(0, -(l.length + 1)).trim(); again = true; }
    }
  }
  return t;
}

const clip = (v, n = 2000) => { const s = String(v ?? '').trim(); return s ? s.slice(0, n) : null; };
export const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !Number.isNaN(Date.parse(String(v) + 'T00:00:00Z'));
export function addDays(ymd, n) {
  const d = new Date(String(ymd) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** Today and the last day of "this week" (today plus weekDays - 1), as Riga days. */
export function tcWindow(now = new Date()) {
  const today = localDate(now);
  return { today, weekEnd: addDays(today, Math.max(1, Number(TC.weekDays) || 7) - 1) };
}
// A GROUP'S TOTAL ROW (the owner, 20.10.2026): the Excel holds a few groups twice, once per subsidiary and once more as a
// company with country "TOTAL" whose delegates repeat the subsidiaries'. Such a row stays, unchanged and openable, and is
// found by its name in the search; it is left out of every figure that sums or counts, and out of the lists those figures
// open, so nothing is counted twice. Its next contact and its information to send are real work and stay in Needs you.
export const isTotalRow = (country) => String(country ?? '').trim().toUpperCase() === 'TOTAL';
const NOT_TOTAL_SQL = `upper(trim(coalesce(c.country, ''))) <> 'TOTAL'`;
const dueGroup = (due, w) => (!due ? 'none' : due < w.today ? 'over' : due <= w.weekEnd ? 'week' : 'later');
const nowIso = () => new Date().toISOString();

// ------------------------------------------------------------------ reading --

/** Every company that is not archived, with what every screen counts: areas, delegates, the open next step. */
/** Every live company as the screens count it (exported for src/tchome.js). */
export const companyFacts = (db) => companyRows(db);
async function companyRows(db) {
  const companies = await db.prepare(`SELECT id, name, name_key, country, city, status, status_detail, pic_name, pic_email,
    info_to_send, last_contact_at, created_at FROM tc_companies WHERE archived_at IS NULL`).all();
  const areaRows = await db.prepare(`SELECT a.company_id, a.area FROM tc_company_areas a
    JOIN tc_companies c ON c.id = a.company_id WHERE c.archived_at IS NULL`).all();
  const courseRows = await db.prepare(`SELECT k.company_id, k.year, k.attendees FROM tc_company_courses k
    JOIN tc_companies c ON c.id = k.company_id WHERE c.archived_at IS NULL`).all();
  const taskRows = await db.prepare(`SELECT t.id, t.company_id, t.due_at, t.label, t.owner FROM tc_tasks t
    JOIN tc_companies c ON c.id = t.company_id WHERE t.done_at IS NULL AND c.archived_at IS NULL ORDER BY t.due_at`).all();
  const areas = new Map(); for (const r of areaRows) { if (!areas.has(r.company_id)) areas.set(r.company_id, []); areas.get(r.company_id).push(r.area); }
  const courses = new Map(); for (const r of courseRows) { if (!courses.has(r.company_id)) courses.set(r.company_id, []); courses.get(r.company_id).push(r); }
  const tasks = new Map(); for (const r of taskRows) if (!tasks.has(r.company_id)) tasks.set(r.company_id, r);
  // the person in charge's account (src/tcpic.js): a linked company filters and counts by the account, not the spelling
  const users = new Map((await db.prepare('SELECT id, email FROM crm_users').all()).map((u) => [String(u.email).toLowerCase(), String(u.id)]));
  return companies.map((c) => {
    const ks = courses.get(c.id) || [];
    const trained = ks.filter((k) => Number(k.attendees) > 0);
    const last = trained.sort((a, b) => b.year - a.year)[0] || null;
    const t = tasks.get(c.id) || null;
    return {
      id: Number(c.id), name: c.name, nameKey: c.name_key, country: c.country || '', city: c.city || '',
      status: c.status, statusDetail: c.status_detail || '', pic: c.pic_name || '', picEmail: c.pic_email || '',
      picKey: c.pic_email && users.has(String(c.pic_email).toLowerCase()) ? 'u:' + users.get(String(c.pic_email).toLowerCase()) : c.pic_name || '',
      areas: (areas.get(c.id) || []).sort((a, b) => AREA_IDS.indexOf(a) - AREA_IDS.indexOf(b)),
      info: Boolean(String(c.info_to_send || '').trim()), lastContactAt: c.last_contact_at || null,
      delegates: ks.reduce((n, k) => n + (Number(k.attendees) || 0), 0),
      years: Object.fromEntries(ks.map((k) => [Number(k.year), Number(k.attendees) || 0])),   // delegates per year (TC Home, 20.10)
      lastYear: last ? Number(last.year) : null, lastYearN: last ? Number(last.attendees) : null,
      client: trained.length > 0,
      next: t ? { id: Number(t.id), due: t.due_at, label: t.label, owner: t.owner || '' } : null,
      createdAt: c.created_at,
      groupTotal: isTotalRow(c.country),
    };
  });
}

// THE FILTERS, one function, so a count on Home and the list it opens are the same companies.
//   status, area, country ('-' = none recorded, '*' = any recorded), pic ('-' = nobody, 'me' = the signed-in person's,
//   'u:<id>' = an account, else a plain name), client (yes | no), info (yes), due (over | week | later | none), q.
//   `me` is meKeys(the signed-in person): "Mine" reads it, and without it "Mine" matches nothing.
//   TC Home (20.10.2026) adds three, each about one year (year = a four-digit year): year = trained in that year (delegates
//   above 0); cohort = back (also trained in an earlier year) | new (never before) among those; last = the company's latest
//   year with delegates against that year: recent (that year or later), mid (the two years before), old (earlier), none.
export function lastBucket(c, y) {
  const done = Object.entries(c.years || {}).filter(([, n]) => n > 0).map(([k]) => Number(k));
  if (!done.length) return 'none';
  const last = Math.max(...done);
  return last >= y ? 'recent' : last >= y - 2 ? 'mid' : 'old';
}
const yearOf = (v) => { const y = Number(v); return Number.isInteger(y) && y >= 1990 && y <= 2100 ? y : null; };
export function matches(c, f, w, me = null) {
  const fy = yearOf(f.year);
  if (fy && !f.last && !((c.years || {})[fy] > 0)) return false;   // with last, the year is only what last is measured against
  if (fy && f.cohort) {
    const before = Object.entries(c.years || {}).some(([k, n]) => Number(k) < fy && n > 0);
    if (f.cohort === 'back' ? !before : f.cohort === 'new' ? before : false) return false;
  }
  if (fy && f.last && lastBucket(c, fy) !== f.last) return false;
  if (f.status && c.status !== f.status) return false;
  if (f.area && !c.areas.includes(f.area)) return false;
  if (f.country === '-' ? c.country : f.country === '*' ? !c.country : f.country && c.country !== f.country) return false;
  if (f.pic === '-' ? c.pic : f.pic === 'me' ? !isMine(c, me) : f.pic && c.picKey !== f.pic && c.pic !== f.pic) return false;
  if (f.client === 'yes' && !c.client) return false;
  if (f.client === 'no' && c.client) return false;
  if (f.info === 'yes' && !c.info) return false;
  if (f.due && dueGroup(c.next && c.next.due, w) !== f.due) return false;
  if (f.q) {
    const q = String(f.q).toLowerCase();
    if (![c.name, c.city, c.country].some((v) => String(v || '').toLowerCase().includes(q))) return false;
  }
  return true;
}
export const FILTER_KEYS = ['status', 'area', 'country', 'pic', 'client', 'info', 'due', 'q', 'year', 'cohort', 'last'];
export function readFilters(params) {
  const f = {};
  for (const k of FILTER_KEYS) { const v = params.get ? params.get(k) : params[k]; if (v) f[k] = String(v).slice(0, 200); }
  return f;
}

const tally = (rows, fn) => {
  const m = new Map();
  for (const r of rows) for (const k of [].concat(fn(r))) m.set(k, (m.get(k) || 0) + 1);
  return [...m.entries()];
};
const byLv = (a, b) => String(a).localeCompare(String(b), 'lv');

export async function listCompanies(db, filters = {}, { page = 1, size = 100, sort = 'name', now = new Date(), me = null, only = false } = {}) {
  const w = tcWindow(now);
  const all = await companyRows(db);
  const mk = meKeys(me);
  // a group's TOTAL row is counted nowhere; the search alone finds it, so it can still be opened
  const counted = all.filter((c) => !c.groupTotal);
  const pool = filters.q ? all : counted;
  const rows = pool.filter((c) => matches(c, filters, w, mk));
  const sorters = {
    name: (a, b) => byLv(a.name, b.name),
    next: (a, b) => String((a.next && a.next.due) || '9999').localeCompare(String((b.next && b.next.due) || '9999')) || byLv(a.name, b.name),
    last: (a, b) => (b.lastYear || 0) - (a.lastYear || 0) || b.delegates - a.delegates || byLv(a.name, b.name),
  };
  rows.sort(sorters[sort] || sorters.name);
  const noStatus = pool.filter((c) => matches(c, { ...filters, status: '' }, w, mk));
  const labels = await picLabels(db);
  const picOf = new Map(all.map((c) => [c.picKey, c.picEmail ? labels.get(c.picEmail.toLowerCase()) || c.pic : c.pic]));
  const n = Math.max(1, Math.min(2000, Number(size) || 100));
  const pg = Math.max(1, Number(page) || 1);
  return {
    total: rows.length,
    page: pg, size: n,
    // page 2 is the first two pages: the list grows with Show more; `only` (round 2, 20.10.2026) sends just that page's rows,
    // so the fifteenth Show more carries 100 rows, not all 1,497 again
    rows: only ? rows.slice((pg - 1) * n, pg * n) : rows.slice(0, pg * n),
    only: Boolean(only),
    counts: { status: Object.fromEntries(STATUS_IDS.map((s) => [s, noStatus.filter((c) => c.status === s).length])) },
    facets: {
      countries: tally(counted, (c) => c.country || '-').sort((a, b) => b[1] - a[1] || byLv(a[0], b[0])),
      // [value, count, label]: a linked person is one line whatever the spelling; "Mine" counts the signed-in person's
      pics: tally(counted, (c) => c.picKey || '-').map(([k, n]) => [k, n, k === '-' ? '' : picOf.get(k) || k]).sort((a, b) => byLv(a[2] || a[0], b[2] || b[0])),
      mine: mk ? counted.filter((c) => isMine(c, mk)).length : 0,
      areas: AREA_IDS.map((a) => [a, counted.filter((c) => c.areas.includes(a)).length]),
    },
  };
}

/**
 * DOWNLOAD THE LIST (the owner's Client Hub pick 6, layout B, 26.10.2026): exactly the filtered Companies list as the rows
 * of a workbook. people=false: one row per company; people=true: one row per active contact (a company with none keeps
 * one row with the contact columns empty). Returns { rows, companies, people }.
 */
export async function exportRows(db, filters = {}, { sort = 'name', me = null, people = false, now = new Date() } = {}) {
  const first = await listCompanies(db, filters, { page: 1, size: 2000, sort, me, now });
  const list = first.total > first.rows.length
    ? (await listCompanies(db, filters, { page: Math.ceil(first.total / 2000), size: 2000, sort, me, now })).rows : first.rows;
  const thisYear = Number(localDate(now).slice(0, 4));
  const years = []; for (let y = 2020; y <= thisYear; y++) years.push(y);
  const statusOf = (c) => (TC.statuses.find((s) => s.id === c.status) || { label: c.status || '' }).label;
  const company = (c) => [c.name, c.country || '', c.city || '', statusOf(c), (c.areas || []).join(', '), c.pic || '',
    ...years.map((y) => (c.years && c.years[y]) || 0), Number(c.delegates) || 0, (c.next && c.next.due) || '', c.info ? 'yes' : ''];
  const head = ['Company', 'Country', 'City', 'Status', 'Areas', 'Person in charge', ...years.map(String), 'Delegates in all', 'Next contact', 'Information to send'];
  if (!people) return { rows: [head, ...list.map(company)], companies: list.length, people: 0 };
  const byCo = new Map();
  for (const k of await db.prepare(`SELECT company_id, name, position, email, phone, notes FROM tc_company_contacts WHERE archived_at IS NULL
    ORDER BY company_id, name`).all()) {
    const id = Number(k.company_id);
    if (!byCo.has(id)) byCo.set(id, []);
    byCo.get(id).push(k);
  }
  const rows = [[...head, 'Contact', 'Position', 'Email', 'Phone', 'Notes']];
  let n = 0;
  for (const c of list) {
    const ks = byCo.get(Number(c.id)) || [];
    if (!ks.length) rows.push([...company(c), '', '', '', '', '']);
    for (const k of ks) { rows.push([...company(c), k.name || '', k.position || '', k.email || '', k.phone || '', k.notes || '']); n += 1; }
  }
  return { rows, companies: list.length, people: n };
}

/** How many active contacts the filtered companies have (the Download menu's second line). */
export async function peopleCount(db, ids) {
  if (!ids.length) return 0;
  const want = new Set(ids.map(Number));
  return (await db.prepare('SELECT company_id FROM tc_company_contacts WHERE archived_at IS NULL').all()).filter((k) => want.has(Number(k.company_id))).length;
}

/** Home and the start page's tile: what needs somebody, the four figures, the next contacts. */
export async function home(db, { now = new Date(), nextRows = 8 } = {}) {
  const w = tcWindow(now);
  const all = await companyRows(db);
  const open = all.filter((c) => c.next).sort((a, b) => a.next.due.localeCompare(b.next.due) || byLv(a.name, b.name));
  const courses = await db.prepare(`SELECT k.year, SUM(k.attendees) AS n FROM tc_company_courses k
    JOIN tc_companies c ON c.id = k.company_id WHERE c.archived_at IS NULL AND ${NOT_TOTAL_SQL} GROUP BY k.year ORDER BY k.year`).all();
  const counted = all.filter((c) => !c.groupTotal);   // the figures; Needs you and the next contacts keep every row
  const thisYear = Number(w.today.slice(0, 4));
  const byYear = courses.map((r) => ({ year: Number(r.year), n: Number(r.n) || 0 })).filter((r) => r.year <= thisYear);
  return {
    asOf: w.today,
    weekEnd: w.weekEnd,
    needs: {
      overdue: open.filter((c) => c.next.due < w.today).length,
      week: open.filter((c) => c.next.due >= w.today && c.next.due <= w.weekEnd).length,
      info: all.filter((c) => c.info).length,
    },
    cards: {
      companies: counted.length,
      activeClients: counted.filter((c) => c.client).length,
      prospects: counted.filter((c) => !c.client).length,
      countries: new Set(counted.map((c) => c.country).filter(Boolean)).size,
      delegates: { total: counted.reduce((n, c) => n + c.delegates, 0), byYear },
    },
    next: { total: open.length, rows: open.slice(0, nextRows).map(nextRow(w)) },
  };
}

const nextRow = (w) => (c) => ({ taskId: c.next.id, due: c.next.due, label: c.next.label, owner: c.next.owner,
  when: dueGroup(c.next.due, w), companyId: c.id, name: c.name, country: c.country, city: c.city, pic: c.pic,
  lastYear: c.lastYear, lastYearN: c.lastYearN, status: c.status });

/**
 * Next contacts: every open next communication, by date, in Overdue, This week, Later. owner: '' = everyone, 'me' = the
 * signed-in person's (`me`), 'u:<id>' an account, else a plain name (the company's person in charge or the task's owner).
 */
export async function nextList(db, { owner = '', now = new Date(), me = null } = {}) {
  const w = tcWindow(now);
  const mk = meKeys(me);
  const all = (await companyRows(db)).filter((c) => c.next && (!owner || (owner === 'me' ? isMine(c, mk)
    : c.picKey === owner || c.next.owner === owner || c.pic === owner)));
  all.sort((a, b) => a.next.due.localeCompare(b.next.due) || byLv(a.name, b.name));
  const rows = all.map(nextRow(w));
  return { asOf: w.today, weekEnd: w.weekEnd, owner,
    counts: { over: rows.filter((r) => r.when === 'over').length, week: rows.filter((r) => r.when === 'week').length,
      later: rows.filter((r) => r.when === 'later').length },
    rows };
}

/** The profile: everything the company page shows, in one answer. */
export async function getCompany(db, id) {
  const c = await db.prepare('SELECT * FROM tc_companies WHERE id = ?').get(Number(id));
  if (!c) return null;
  const areas = (await db.prepare('SELECT area FROM tc_company_areas WHERE company_id = ?').all(c.id)).map((r) => r.area)
    .sort((a, b) => AREA_IDS.indexOf(a) - AREA_IDS.indexOf(b));
  const contacts = await db.prepare(`SELECT id, name, position, email, phone, notes, source, created_at FROM tc_company_contacts
    WHERE company_id = ? AND archived_at IS NULL ORDER BY name, email, id`).all(c.id);
  const courses = await db.prepare(`SELECT year, attendees, course_codes, raw, as_of, source, recorded_at, recorded_by
    FROM tc_company_courses WHERE company_id = ? ORDER BY year DESC`).all(c.id);
  const log = await db.prepare(`SELECT id, contact_id, kind, occurred_at, topics, body, actor, origin, field, old_value, new_value
    FROM tc_activities WHERE company_id = ? ORDER BY occurred_at DESC, id DESC LIMIT 300`).all(c.id);
  const next = await db.prepare(`SELECT id, label, due_at, owner, created_at, created_by FROM tc_tasks
    WHERE company_id = ? AND done_at IS NULL ORDER BY due_at LIMIT 1`).get(c.id);
  let extra = null; try { extra = c.extra ? JSON.parse(c.extra) : null; } catch { extra = null; }
  const trained = courses.filter((k) => Number(k.attendees) > 0);
  return {
    id: Number(c.id), name: c.name, country: c.country || '', city: c.city || '', address: c.address || '', website: c.website || '',
    status: c.status, statusDetail: c.status_detail || '', pic: c.pic_name || '', picEmail: c.pic_email || '',
    picAccount: await picAccountOf(db, c.pic_email),
    notes: c.notes || '', infoToSend: c.info_to_send || '', lastContactAt: c.last_contact_at || null,
    source: c.source || '', sourceRow: c.source_row ?? null, createdAt: c.created_at, archivedAt: c.archived_at || null,
    areas, client: trained.length > 0, delegates: courses.reduce((n, k) => n + (Number(k.attendees) || 0), 0),
    contacts: contacts.map((k) => ({ ...k, id: Number(k.id) })),
    courses: courses.map((k) => ({ year: Number(k.year), attendees: k.attendees == null ? null : Number(k.attendees), codes: k.course_codes || '',
      raw: k.raw || '', asOf: k.as_of || '', source: k.source || '', recordedAt: k.recorded_at, recordedBy: k.recorded_by || '' })),
    log: log.map((e) => ({ ...e, id: Number(e.id) })),
    next: next ? { id: Number(next.id), label: next.label, due: next.due_at, owner: next.owner || '' } : null,
    extra,
  };
}

/** The account a company's person in charge is linked to: { value: 'u:<id>', name }, or null. */
async function picAccountOf(db, email) {
  if (!email) return null;
  const u = await db.prepare('SELECT id, display_name, email FROM crm_users WHERE lower(email) = ?').get(String(email).toLowerCase());
  return u ? { value: 'u:' + u.id, name: u.display_name || u.email } : null;
}

/** Countries in use, and who can be in charge: the accounts that open Training Centre, then the plain names (src/tcpic.js). */
export async function meta(db) {
  const countries = (await db.prepare(`SELECT DISTINCT country FROM tc_companies c WHERE archived_at IS NULL AND country IS NOT NULL AND ${NOT_TOTAL_SQL}`).all())
    .map((r) => r.country).filter(Boolean).sort(byLv);
  return {
    statuses: TC.statuses, meetingTypes: TC.meetingTypes, areas: TC.areas, activityKinds: TC.activityKinds,
    contactKinds: TC.contactKinds, nextLabel: TC.nextLabel, weekDays: TC.weekDays, defaults: TC.defaults,
    countries, pics: await picChoices(db),
  };
}

// ------------------------------------------------------------------ writing --

async function logAct(db, companyId, e) {
  await db.prepare(`INSERT INTO tc_activities (company_id, contact_id, kind, occurred_at, topics, body, actor, origin, field, old_value, new_value)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(companyId, e.contactId ?? null, e.kind, e.at || nowIso(), e.topics ?? null, e.body ?? null,
    e.actor ?? null, e.origin || 'manual', e.field ?? null, e.old ?? null, e.new ?? null);
}
async function mustCompany(db, id) {
  const c = await db.prepare('SELECT * FROM tc_companies WHERE id = ? AND archived_at IS NULL').get(Number(id));
  if (!c) bad('There is no such company, or it is archived.');
  return c;
}
const checkStatus = (s) => { if (!STATUS_IDS.includes(s)) bad('Pick one of the statuses.'); return s; };
const checkAreas = (list) => {
  const a = [...new Set([].concat(list || []).map(String))];
  const unknown = a.filter((x) => !AREA_IDS.includes(x));
  if (unknown.length) bad('Unknown area: ' + unknown.join(', '));
  return a;
};

/**
 * Who a picked person in charge is: 'u:<id>' an account that opens Training Centre (written with the name it goes by),
 * a plain name (linked when it clearly is one account, src/tcpic.js), or '' nobody.
 */
export async function resolvePic(db, v) {
  const raw = clip(v, 120);
  if (!raw) return { name: null, email: null };
  const index = await accountIndex(db);
  if (/^u:/.test(raw)) {
    const u = index.byId.get(raw.slice(2));
    if (!u || !u.tc) bad('Pick a person in charge from the list.');
    return { name: (await picLabels(db)).get(u.email) || u.name, email: u.email };
  }
  const u = matchAccount(index, raw);
  return { name: raw, email: u ? u.email : null };
}

export async function addCompany(db, b, actor) {
  const name = clip(b.name, 200);
  if (!name) bad('A company needs a name.');
  const key = nameKey(name) || name.toLowerCase();
  const country = clip(b.country, 80);
  const status = checkStatus(b.status || TC.defaults.noStatus);
  const areas = checkAreas(b.areas);
  const pic = await resolvePic(db, b.pic);
  const twin = country
    ? await db.prepare('SELECT id FROM tc_companies WHERE name_key = ? AND country = ? AND archived_at IS NULL').get(key, country)
    : await db.prepare('SELECT id FROM tc_companies WHERE name_key = ? AND country IS NULL AND archived_at IS NULL').get(key);
  if (twin) { const e = new TcInputError('This company is already here.'); e.id = Number(twin.id); throw e; }
  const at = nowIso();
  return db.transaction(async (tx) => {
    const r = await tx.prepare(`INSERT INTO tc_companies (name, name_key, country, city, website, status, pic_name, pic_email, notes, source, created_at, created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(name, key, country, clip(b.city, 80), clip(b.website, 200), status, pic.name, pic.email,
      clip(b.notes), 'manual', at, actor);
    const id = Number(r.lastInsertRowid);
    for (const a of areas) await tx.prepare('INSERT INTO tc_company_areas (company_id, area) VALUES (?,?)').run(id, a);
    await logAct(tx, id, { kind: 'create', body: 'Company added', actor, at });
    return { id };
  });
}

const EDITABLE = { name: 200, country: 80, city: 80, address: 300, website: 200, status: 40, status_detail: 40, pic_name: 120, notes: 4000, info_to_send: 4000 };
const FIELD_OF = { name: 'name', country: 'country', city: 'city', address: 'address', website: 'website', status: 'status',
  statusDetail: 'status_detail', notes: 'notes', infoToSend: 'info_to_send' };   // pic: resolvePic, in editCompany
export const FIELD_LABELS = { name: 'Name', country: 'Country', city: 'City', address: 'Address', website: 'Website', status: 'Status',
  status_detail: 'Meeting type', pic_name: 'Person in charge', notes: 'Notes', info_to_send: 'Information to send', areas: 'Areas' };

/** Change fields; every change is one line in the log with what it was and what it became. */
export async function editCompany(db, id, b, actor) {
  const c = await mustCompany(db, id);
  const at = nowIso();
  const pic = 'pic' in b ? await resolvePic(db, b.pic) : null;
  return db.transaction(async (tx) => {
    let changed = 0;
    if (pic && ((c.pic_name ?? null) !== pic.name || String(c.pic_email ?? '').toLowerCase() !== String(pic.email ?? '').toLowerCase())) {
      await tx.prepare('UPDATE tc_companies SET pic_name = ?, pic_email = ?, updated_at = ? WHERE id = ?').run(pic.name, pic.email, at, c.id);
      await logAct(tx, c.id, { kind: 'edit', field: 'pic_name', old: c.pic_name ?? null, new: pic.name, actor, at });
      changed += 1;
      // the planned next contact goes with the company to the new person in charge (the owner, 20.10.2026), one log line each
      const open = await tx.prepare('SELECT id, owner, label, due_at FROM tc_tasks WHERE company_id = ? AND done_at IS NULL').all(c.id);
      for (const t of open.filter((x) => (x.owner ?? null) !== pic.name)) {
        await tx.prepare('UPDATE tc_tasks SET owner = ? WHERE id = ?').run(pic.name, t.id);
        await logAct(tx, c.id, { kind: 'task', field: 'next_owner', old: t.owner ?? null, new: pic.name, actor, at,
          body: `${t.label} on ${t.due_at} moved to ${pic.name || 'nobody'}` });
      }
    }
    for (const [k, col] of Object.entries(FIELD_OF)) {
      if (!(k in b)) continue;
      let v = clip(b[k], EDITABLE[col]);
      if (col === 'name' && !v) bad('A company needs a name.');
      if (col === 'status') checkStatus(v);
      if (col === 'status_detail' && v && !MEETING_IDS.includes(v)) bad('Unknown meeting type.');
      if ((c[col] ?? null) === v) continue;
      await tx.prepare(`UPDATE tc_companies SET ${col} = ?, updated_at = ? WHERE id = ?`).run(v, at, c.id);
      if (col === 'name') await tx.prepare('UPDATE tc_companies SET name_key = ? WHERE id = ?').run(nameKey(v) || v.toLowerCase(), c.id);
      await logAct(tx, c.id, { kind: col === 'status' ? 'status' : 'edit', field: col, old: c[col] ?? null, new: v, actor, at,
        body: col === 'status' ? `${statusLabel(c[col])} → ${statusLabel(v)}` : null });
      changed += 1;
    }
    if ('areas' in b) {
      const want = checkAreas(b.areas);
      const had = (await tx.prepare('SELECT area FROM tc_company_areas WHERE company_id = ?').all(c.id)).map((r) => r.area);
      const sorted = (l) => [...l].sort((x, y) => AREA_IDS.indexOf(x) - AREA_IDS.indexOf(y)).join(', ');
      if (sorted(had) !== sorted(want)) {
        for (const a of had.filter((x) => !want.includes(x))) await tx.prepare('DELETE FROM tc_company_areas WHERE company_id = ? AND area = ?').run(c.id, a);
        for (const a of want.filter((x) => !had.includes(x))) await tx.prepare('INSERT INTO tc_company_areas (company_id, area) VALUES (?,?)').run(c.id, a);
        await logAct(tx, c.id, { kind: 'edit', field: 'areas', old: sorted(had) || null, new: sorted(want) || null, actor, at });
        changed += 1;
      }
    }
    return { changed };
  });
}

/** Information to send, sent (TC Home round 3, 20.10.2026): the text is cleared and the log keeps what it was. */
export async function markInfoSent(db, id, actor) {
  const c = await mustCompany(db, id);
  if (!String(c.info_to_send || '').trim()) bad('Nothing is waiting to be sent.');
  const at = nowIso();
  return db.transaction(async (tx) => {
    await tx.prepare('UPDATE tc_companies SET info_to_send = NULL, updated_at = ? WHERE id = ?').run(at, c.id);
    await logAct(tx, c.id, { kind: 'edit', field: 'info_to_send', old: c.info_to_send, new: null, body: 'Information sent', actor, at });
    return { ok: true };
  });
}

export async function archiveCompany(db, id, actor) {
  const c = await mustCompany(db, id);
  const at = nowIso();
  return db.transaction(async (tx) => {
    await tx.prepare('UPDATE tc_companies SET archived_at = ?, archived_by = ? WHERE id = ?').run(at, actor, c.id);
    await tx.prepare(`UPDATE tc_tasks SET done_at = ?, outcome = 'company archived' WHERE company_id = ? AND done_at IS NULL`).run(at, c.id);
    await logAct(tx, c.id, { kind: 'edit', field: 'archived_at', old: null, new: at, body: 'Archived', actor, at });
    return { ok: true };
  });
}

// ------------------------------------------------------------------ contacts --

function contactFields(b) {
  const email = clip(b.email, 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) bad('That email address does not look right.');
  return { name: clip(b.name, 160), position: clip(b.position, 160), email: email ? email.toLowerCase() : null,
    phone: clip(b.phone, 60), notes: clip(b.notes, 2000) };
}
export async function addContact(db, companyId, b, actor) {
  const c = await mustCompany(db, companyId);
  const f = contactFields(b);
  if (!f.name && !f.email && !f.phone) bad('A contact needs a name, an email or a phone.');
  if (f.email && await db.prepare('SELECT id FROM tc_company_contacts WHERE company_id = ? AND email = ? AND archived_at IS NULL').get(c.id, f.email)) {
    bad('This email is already a contact of this company.');
  }
  const at = nowIso();
  return db.transaction(async (tx) => {
    const r = await tx.prepare(`INSERT INTO tc_company_contacts (company_id, name, position, email, phone, notes, source, created_at, created_by)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(c.id, f.name, f.position, f.email, f.phone, f.notes, 'manual', at, actor);
    await logAct(tx, c.id, { kind: 'edit', field: 'contact', old: null, new: f.name || f.email || f.phone, body: 'Contact added', actor, at,
      contactId: Number(r.lastInsertRowid) });
    return { id: Number(r.lastInsertRowid) };
  });
}
export async function editContact(db, contactId, b, actor) {
  const k = await db.prepare('SELECT * FROM tc_company_contacts WHERE id = ? AND archived_at IS NULL').get(Number(contactId));
  if (!k) bad('There is no such contact.');
  const f = contactFields({ ...k, ...b });
  if (!f.name && !f.email && !f.phone) bad('A contact needs a name, an email or a phone.');
  const at = nowIso();
  return db.transaction(async (tx) => {
    let changed = 0;
    for (const col of ['name', 'position', 'email', 'phone', 'notes']) {
      if (!(col in b) || (k[col] ?? null) === f[col]) continue;
      await tx.prepare(`UPDATE tc_company_contacts SET ${col} = ?, updated_at = ? WHERE id = ?`).run(f[col], at, k.id);
      await logAct(tx, k.company_id, { kind: 'edit', field: 'contact_' + col, old: k[col] ?? null, new: f[col], actor, at, contactId: Number(k.id) });
      changed += 1;
    }
    return { changed };
  });
}
/**
 * SEARCH PEOPLE (the owner's Client Hub pick 1, layout A, 26.10.2026): the Companies box also finds contacts by name
 * (accents folded: "Blawat" finds "Bławat"), email or phone digits. Active contacts of active companies only.
 */
export async function searchPeople(db, q, { limit = 50 } = {}) {
  const text = String(q ?? '').trim();
  if (text.length < 2) return { total: 0, rows: [] };
  // letters with no accent to fold away (ł, ø, đ, ß, æ, œ, þ) are spelled out first, so "Blawat" finds "Bławat"
  const fold = (v) => foldName(String(v ?? '').replace(/[łŁ]/g, 'l').replace(/[øØ]/g, 'o').replace(/[đĐ]/g, 'd').replace(/ß/g, 'ss')
    .replace(/[æÆ]/g, 'ae').replace(/[œŒ]/g, 'oe').replace(/[þÞ]/g, 'th'));
  const key = fold(text);
  const low = text.toLowerCase();
  const digits = text.replace(/\D+/g, '');
  const all = await db.prepare(`SELECT k.id, k.name, k.position, k.email, k.phone, c.id AS company_id, c.name AS company, c.pic_name
    FROM tc_company_contacts k JOIN tc_companies c ON c.id = k.company_id WHERE k.archived_at IS NULL AND c.archived_at IS NULL`).all();
  const hits = all.filter((k) => (key && fold(k.name).includes(key)) || String(k.email || '').toLowerCase().includes(low)
    || (digits.length >= 3 && String(k.phone || '').replace(/\D+/g, '').includes(digits)))
    .sort((a, b) => String(a.name || a.email).localeCompare(String(b.name || b.email), 'lv') || String(a.company).localeCompare(String(b.company), 'lv'));
  return { total: hits.length, rows: hits.slice(0, Math.max(1, Number(limit) || 50)).map((k) => ({ id: Number(k.id), name: k.name || '', position: k.position || '',
    email: k.email || '', phone: k.phone || '', companyId: Number(k.company_id), company: k.company, pic: k.pic_name || '' })) };
}

export async function archiveContact(db, contactId, actor) {
  const k = await db.prepare('SELECT * FROM tc_company_contacts WHERE id = ? AND archived_at IS NULL').get(Number(contactId));
  if (!k) bad('There is no such contact.');
  const at = nowIso();
  return db.transaction(async (tx) => {
    await tx.prepare('UPDATE tc_company_contacts SET archived_at = ?, archived_by = ? WHERE id = ?').run(at, actor, k.id);
    await logAct(tx, k.company_id, { kind: 'edit', field: 'contact', old: k.name || k.email || k.phone, new: null, body: 'Contact archived',
      actor, at, contactId: Number(k.id) });
    return { ok: true };
  });
}

// ------------------------------------------------------------------ courses --

/** One year's line: how many delegates, which courses. Typed by Training Centre staff (the provisional default). */
export async function setCourseYear(db, companyId, b, actor) {
  const c = await mustCompany(db, companyId);
  const year = Number(b.year);
  if (!Number.isInteger(year) || year < 1990 || year > 2100) bad('Give the year as four digits.');
  const n = b.attendees === '' || b.attendees == null ? null : Number(b.attendees);
  if (n !== null && (!Number.isInteger(n) || n < 0 || n > 100000)) bad('Delegates is a whole number, 0 or more.');
  const codes = clip(String(b.codes ?? '').toUpperCase().split(/[,;]+/).map((s) => s.trim()).filter(Boolean).join(', '), 1000);
  const at = nowIso();
  return db.transaction(async (tx) => {
    const had = await tx.prepare('SELECT * FROM tc_company_courses WHERE company_id = ? AND year = ?').get(c.id, year);
    const was = had ? `${had.attendees ?? '?'}${had.course_codes ? ' (' + had.course_codes + ')' : ''}` : null;
    const now = `${n ?? '?'}${codes ? ' (' + codes + ')' : ''}`;
    if (had && was === now) return { changed: 0 };
    if (had) {
      await tx.prepare(`UPDATE tc_company_courses SET attendees = ?, course_codes = ?, as_of = ?, source = 'manual', recorded_at = ?, recorded_by = ?
        WHERE id = ?`).run(n, codes, localDate(), at, actor, had.id);
    } else {
      await tx.prepare(`INSERT INTO tc_company_courses (company_id, year, attendees, course_codes, as_of, source, recorded_at, recorded_by)
        VALUES (?,?,?,?,?,?,?,?)`).run(c.id, year, n, codes, localDate(), 'manual', at, actor);
    }
    await logAct(tx, c.id, { kind: 'edit', field: 'courses_' + year, old: was, new: now, actor, at });
    return { changed: 1 };
  });
}

// ------------------------------------------------------------------ the log and the next communication --

/**
 * Log a communication (or a note). In the same transaction it can close the open next communication and open the
 * next one, the way Intake's next step works: { kind, body, topics, day, contactId, nextDue, nextLabel, closeNext }.
 */
export async function logActivity(db, companyId, b, actor) {
  const c = await mustCompany(db, companyId);
  const kind = String(b.kind || '');
  if (!KIND_IDS.includes(kind)) bad('Pick what kind of communication it was.');
  const body = clip(b.body, 4000);
  if (!body) bad('Write what was said or done.');
  if (b.day && !isDay(b.day)) bad('The day is not a date.');
  if (b.nextDue && !isDay(b.nextDue)) bad('The next communication needs a date.');
  const at = b.day ? `${b.day}T00:00:00.000Z` : nowIso();
  let contactId = null;
  if (b.contactId) {
    const k = await db.prepare('SELECT id FROM tc_company_contacts WHERE id = ? AND company_id = ?').get(Number(b.contactId), c.id);
    if (!k) bad('That contact is not one of this company\'s.');
    contactId = Number(k.id);
  }
  const stamp = nowIso();
  return db.transaction(async (tx) => {
    await logAct(tx, c.id, { kind, body, topics: clip(b.topics, 500), actor, at, contactId });
    if (TC.contactKinds.includes(kind) && (!c.last_contact_at || at > c.last_contact_at)) {
      await tx.prepare('UPDATE tc_companies SET last_contact_at = ?, updated_at = ? WHERE id = ?').run(at, stamp, c.id);
    }
    const open = await tx.prepare('SELECT * FROM tc_tasks WHERE company_id = ? AND done_at IS NULL').all(c.id);
    if (b.nextDue || b.closeNext) {
      for (const t of open) {
        await tx.prepare('UPDATE tc_tasks SET done_at = ?, outcome = ? WHERE id = ?').run(stamp, `done: ${kind}`, t.id);
      }
    }
    let taskId = null;
    if (b.nextDue) {
      const r = await tx.prepare(`INSERT INTO tc_tasks (company_id, contact_id, label, due_at, owner, created_at, created_by)
        VALUES (?,?,?,?,?,?,?)`).run(c.id, contactId, clip(b.nextLabel, 200) || TC.nextLabel, b.nextDue, c.pic_name || null, stamp, actor);
      taskId = Number(r.lastInsertRowid);
      await logAct(tx, c.id, { kind: 'task', field: 'next', old: open[0] ? open[0].due_at : null, new: b.nextDue, actor, at: stamp,
        body: `${clip(b.nextLabel, 200) || TC.nextLabel} on ${b.nextDue}` });
    }
    return { ok: true, taskId };
  });
}

/** Set or move the next communication: one open per company. */
export async function setNext(db, companyId, b, actor) {
  const c = await mustCompany(db, companyId);
  if (!isDay(b.due)) bad('The next communication needs a date.');
  const label = clip(b.label, 200) || TC.nextLabel;
  const owner = clip(b.owner, 120) || c.pic_name || null;
  const at = nowIso();
  return db.transaction(async (tx) => {
    const open = await tx.prepare('SELECT * FROM tc_tasks WHERE company_id = ? AND done_at IS NULL ORDER BY due_at').all(c.id);
    if (open.length) {
      const t = open[0];
      await tx.prepare('UPDATE tc_tasks SET due_at = ?, label = ?, owner = ? WHERE id = ?').run(b.due, label, owner, t.id);
      for (const extra of open.slice(1)) await tx.prepare(`UPDATE tc_tasks SET done_at = ?, outcome = 'replaced' WHERE id = ?`).run(at, extra.id);
      await logAct(tx, c.id, { kind: 'task', field: 'next', old: t.due_at, new: b.due, body: `${label} moved to ${b.due}`, actor, at });
      return { id: Number(t.id) };
    }
    const r = await tx.prepare(`INSERT INTO tc_tasks (company_id, label, due_at, owner, created_at, created_by) VALUES (?,?,?,?,?,?)`)
      .run(c.id, label, b.due, owner, at, actor);
    await logAct(tx, c.id, { kind: 'task', field: 'next', old: null, new: b.due, body: `${label} on ${b.due}`, actor, at });
    return { id: Number(r.lastInsertRowid) };
  });
}

/** Done, with how it went. Optionally the next one in the same step. */
export async function finishTask(db, taskId, b, actor) {
  const t = await db.prepare('SELECT * FROM tc_tasks WHERE id = ? AND done_at IS NULL').get(Number(taskId));
  if (!t) bad('That next communication is already done or does not exist.');
  await mustCompany(db, t.company_id);
  const outcome = clip(b.outcome, 2000);
  if (b.nextDue && !isDay(b.nextDue)) bad('The next communication needs a date.');
  const at = nowIso();
  return db.transaction(async (tx) => {
    await tx.prepare('UPDATE tc_tasks SET done_at = ?, outcome = ? WHERE id = ?').run(at, outcome || 'done', t.id);
    await logAct(tx, t.company_id, { kind: 'task', field: 'next', old: t.due_at, new: null, body: `${t.label} done${outcome ? ': ' + outcome : ''}`, actor, at });
    if (b.nextDue) {
      await tx.prepare(`INSERT INTO tc_tasks (company_id, label, due_at, owner, created_at, created_by) VALUES (?,?,?,?,?,?)`)
        .run(t.company_id, clip(b.nextLabel, 200) || TC.nextLabel, b.nextDue, t.owner, at, actor);
      await logAct(tx, t.company_id, { kind: 'task', field: 'next', old: null, new: b.nextDue, body: `${clip(b.nextLabel, 200) || TC.nextLabel} on ${b.nextDue}`, actor, at });
    }
    return { ok: true };
  });
}
