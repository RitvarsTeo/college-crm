// SEASON (the owner's pick C, 20.10.2026; pictures Pitches/intake-tc/board1/C_home + C_key).
//
// A year planner, September to August, with three lanes: exhibitions (tc_events), "Ask for Y+2 plans" (October to
// December: every company that trained delegates in Y, the year before the season), and the year-end calendars & gifts.
// Under it: where our companies are, per country, clients / companies. An exhibition's page: the companies on its list
// in columns On the list / Met at the stand / Follow-up sent / Booked a course; a move is a line in the company's log.
//
// Nothing is deleted: an event is never removed here, a company taken off a list is stamped (removed_at). B2B only.
// A group's TOTAL row (src/tc.js isTotalRow) is left out of every count and every list a count opens.
//
// THE SEED is an admin one-off like the TC import: seedPreview writes nothing and answers counts and a hash;
// seedApply needs that hash, runs once (a mark in sync_state), in one transaction. It reads the Excel's exhibition and
// calendar tabs, which the TC import kept in tc_companies.extra ('exhibitions', 'calendar_gift').
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { localDate } from './bizday.js';
import { TcInputError, isDay, isTotalRow } from './tc.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const SEASON = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'tc_season.json'), 'utf8'));
const KIND = new Map(SEASON.kinds.map((k) => [k.id, k]));
const STAGE = new Map(SEASON.stages.map((s) => [s.id, s]));
export const stageLabel = (id) => (STAGE.get(id) || {}).label || id || '';
export class SeedError extends Error {}
const bad = (msg) => { throw new TcInputError(msg); };
const clip = (v, n = 2000) => { const s = String(v ?? '').trim(); return s ? s.slice(0, n) : null; };
const byLv = (a, b) => String(a || '').localeCompare(String(b || ''), 'lv');
const sha = (s) => createHash('sha256').update(s).digest('hex');
const pad = (n) => String(n).padStart(2, '0');

/** The season a day is in: its first year (September of it to August of the next). */
export const seasonOf = (ymd) => { const y = Number(ymd.slice(0, 4)); return Number(ymd.slice(5, 7)) >= SEASON.seasonStartMonth ? y : y - 1; };
const seasonSpan = (y) => ({ from: `${y}-${pad(SEASON.seasonStartMonth)}-01`, to: `${y + 1}-${pad(SEASON.seasonStartMonth - 1 || 12)}-31` });

/**
 * Live companies with client = any delegates in any year, and their delegates. `total`: a group's TOTAL row, which a card
 * still shows with its own figures but no count or sum takes in.
 */
async function liveCompanies(db) {
  const companies = await db.prepare(`SELECT id, name, country, pic_name FROM tc_companies WHERE archived_at IS NULL`).all();
  const by = new Map(companies.map((c) => [Number(c.id), { id: Number(c.id), name: c.name, country: c.country || '', pic: c.pic_name || '',
    total: isTotalRow(c.country), delegates: 0, years: new Map() }]));
  for (const k of await db.prepare('SELECT company_id, year, attendees FROM tc_company_courses WHERE attendees > 0').all()) {
    const c = by.get(Number(k.company_id));
    if (!c) continue;
    c.delegates += Number(k.attendees) || 0;
    c.years.set(Number(k.year), (c.years.get(Number(k.year)) || 0) + Number(k.attendees));
  }
  return by;
}
/** The ones every count and sum takes in: not a TOTAL row. */
async function countedCompanies(db) {
  return new Map([...(await liveCompanies(db)).entries()].filter(([, c]) => !c.total));
}

async function eventCounts(db, counted) {
  const rows = await db.prepare(`SELECT l.event_id, l.company_id, l.stage FROM tc_event_companies l WHERE l.removed_at IS NULL`).all();
  const out = new Map();
  for (const r of rows) {
    const c = counted.get(Number(r.company_id));
    if (!c) continue;
    const e = out.get(Number(r.event_id)) || { companies: 0, clients: 0, stages: {} };
    e.companies += 1;
    if (c.delegates > 0) e.clients += 1;
    e.stages[r.stage] = (e.stages[r.stage] || 0) + 1;
    out.set(Number(r.event_id), e);
  }
  return out;
}

const eventOut = (e, n) => ({ id: Number(e.id), name: e.name, kind: e.kind, city: e.city || '', country: e.country || '',
  startsOn: e.starts_on || null, endsOn: e.ends_on || null, dateConfirmed: Number(e.date_confirmed) === 1, notes: e.notes || '',
  companies: n ? n.companies : 0, clients: n ? n.clients : 0, stages: n ? n.stages : {} });

/** The planner for the season starting in September of `start`, and the countries. */
export async function season(db, { start = null, now = new Date() } = {}) {
  const today = localDate(now);
  const y0 = Number.isInteger(Number(start)) && Number(start) > 1990 ? Number(start) : seasonOf(today);
  const span = seasonSpan(y0);
  const counted = await countedCompanies(db);
  const n = await eventCounts(db, counted);
  const events = (await db.prepare('SELECT * FROM tc_events WHERE archived_at IS NULL').all()).map((e) => eventOut(e, n.get(Number(e.id))));
  const inSeason = (e) => e.startsOn && e.startsOn <= span.to && (e.endsOn || e.startsOn) >= span.from;
  const lane = (kind) => events.filter((e) => e.kind === kind && inSeason(e)).sort((a, b) => a.startsOn.localeCompare(b.startsOn) || byLv(a.name, b.name));
  const ex = lane('exhibition');
  const cal = lane('calendars');
  const y = y0 - 1;
  const trained = [...counted.values()].filter((c) => c.years.get(y) > 0).length;
  // where our companies are: every country recorded, companies / clients (any delegates), the biggest first
  const countries = new Map();
  for (const c of counted.values()) {
    if (!c.country) continue;
    const k = countries.get(c.country) || { country: c.country, companies: 0, clients: 0 };
    k.companies += 1;
    if (c.delegates > 0) k.clients += 1;
    countries.set(c.country, k);
  }
  const list = [...countries.values()].sort((a, b) => b.companies - a.companies || b.clients - a.clients || byLv(a.country, b.country));
  return {
    today, start: y0, from: span.from, to: span.to, prev: y0 - 1, next: y0 + 1,
    exhibitions: { events: ex, companies: ex.reduce((s, e) => s + e.companies, 0) },
    plans: { year: y, forYear: y + 2, companies: trained,
      from: `${y0}-${pad(SEASON.plans.fromMonth)}-01`, to: `${y0}-${pad(SEASON.plans.toMonth)}-${SEASON.plans.toMonth === 12 ? 31 : 30}` },
    calendars: { events: cal, companies: cal.reduce((s, e) => s + e.companies, 0) },
    undated: events.filter((e) => !e.startsOn).sort((a, b) => byLv(a.name, b.name)),
    countries: { total: list.length, rows: list },
  };
}

/** Home's "Next exhibition" (TC-HOME 3): the first one not over yet, with how many companies are on its list. */
export async function nextExhibition(db, { today = localDate() } = {}) {
  const e = await db.prepare(`SELECT * FROM tc_events WHERE archived_at IS NULL AND kind = 'exhibition' AND starts_on IS NOT NULL
    AND COALESCE(ends_on, starts_on) >= ? ORDER BY starts_on, id LIMIT 1`).get(today);
  if (!e) return null;
  const n = (await eventCounts(db, await countedCompanies(db))).get(Number(e.id));
  const o = eventOut(e, n);
  return { id: o.id, name: o.name, city: o.city, startsOn: o.startsOn, endsOn: o.endsOn, dateConfirmed: o.dateConfirmed, companies: o.companies };
}

/** One event's page: its columns, each company with its client tag, delegates and person in charge. */
export async function eventPage(db, id) {
  const e = await db.prepare('SELECT * FROM tc_events WHERE id = ?').get(Number(id));
  if (!e) return null;
  const live = await liveCompanies(db);
  const n = (await eventCounts(db, new Map([...live.entries()].filter(([, c]) => !c.total)))).get(Number(e.id));
  const links = await db.prepare(`SELECT l.id, l.company_id, l.stage, l.note, c.name, c.country, c.pic_name FROM tc_event_companies l
    JOIN tc_companies c ON c.id = l.company_id WHERE l.event_id = ? AND l.removed_at IS NULL AND c.archived_at IS NULL`).all(e.id);
  const kind = KIND.get(e.kind) || KIND.get('exhibition');
  const cols = kind.stages.map((s) => ({ stage: s, label: stageLabel(s), cards: [] }));
  const at = new Map(cols.map((c) => [c.stage, c]));
  for (const l of links) {
    const c = live.get(Number(l.company_id));
    const col = at.get(l.stage) || cols[0];
    col.cards.push({ linkId: Number(l.id), companyId: Number(l.company_id), name: l.name, country: l.country || '', note: l.note || '',
      client: Boolean(c && c.delegates > 0), delegates: c ? c.delegates : 0, pic: l.pic_name || '', counted: Boolean(c && !c.total) });
  }
  for (const c of cols) c.cards.sort((a, b) => (b.delegates - a.delegates) || byLv(a.name, b.name));
  return { ...eventOut(e, n), archived: Boolean(e.archived_at), kindLabel: kind.label, stages: kind.stages.map((s) => ({ id: s, label: stageLabel(s) })), columns: cols };
}

/** "Ask for Y+2 plans": the companies that trained delegates in `year`, the most first. */
export async function plansList(db, year) {
  const y = Number(year);
  if (!Number.isInteger(y)) bad('Which year?');
  const counted = await countedCompanies(db);
  const open = new Map((await db.prepare('SELECT company_id, due_at FROM tc_tasks WHERE done_at IS NULL ORDER BY due_at').all())
    .map((t) => [Number(t.company_id), t.due_at]));
  const rows = [...counted.values()].filter((c) => c.years.get(y) > 0)
    .map((c) => ({ id: c.id, name: c.name, country: c.country, pic: c.pic, delegates: c.years.get(y), next: open.get(c.id) || null }))
    .sort((a, b) => b.delegates - a.delegates || byLv(a.name, b.name));
  return { year: y, forYear: y + 2, total: rows.length, delegates: rows.reduce((s, r) => s + r.delegates, 0), rows };
}

// ------------------------------------------------------------------ writing --

const act = (tx, companyId, e) => tx.prepare(`INSERT INTO tc_activities (company_id, kind, occurred_at, body, actor, origin, field, old_value, new_value)
  VALUES (?,?,?,?,?,?,?,?,?)`).run(companyId, 'edit', e.at, e.body, e.actor, 'manual', 'event', e.old ?? null, e.new ?? null);

async function mustEvent(db, id) {
  const e = await db.prepare('SELECT * FROM tc_events WHERE id = ? AND archived_at IS NULL').get(Number(id));
  if (!e) bad('There is no such event.');
  return e;
}

/** The dates, the city and whether the date is confirmed. */
export async function editEvent(db, id, b, actor) {
  if (!actor) bad('Who is changing it?');
  const e = await mustEvent(db, id);
  const startsOn = 'startsOn' in b ? (b.startsOn || null) : e.starts_on;
  const endsOn = 'endsOn' in b ? (b.endsOn || null) : e.ends_on;
  if (startsOn && !isDay(startsOn)) bad('The first day is not a date.');
  if (endsOn && !isDay(endsOn)) bad('The last day is not a date.');
  if (startsOn && endsOn && endsOn < startsOn) bad('The last day is before the first.');
  const name = 'name' in b ? clip(b.name, 200) : e.name;
  if (!name) bad('An event needs a name.');
  await db.prepare(`UPDATE tc_events SET name = ?, city = ?, starts_on = ?, ends_on = ?, date_confirmed = ?, notes = ?, updated_at = ?, updated_by = ? WHERE id = ?`)
    .run(name, 'city' in b ? clip(b.city, 80) : e.city, startsOn, endsOn, ('dateConfirmed' in b ? Boolean(b.dateConfirmed) : Number(e.date_confirmed) === 1) ? 1 : 0,
      'notes' in b ? clip(b.notes, 2000) : e.notes, new Date().toISOString(), actor, e.id);
  return { ok: true };
}

/** Put a company on an event's list (its first column). */
export async function addToEvent(db, eventId, b, actor) {
  if (!actor) bad('Who is adding?');
  const e = await mustEvent(db, eventId);
  const c = await db.prepare('SELECT id, name FROM tc_companies WHERE id = ? AND archived_at IS NULL').get(Number(b.companyId));
  if (!c) bad('Pick a company.');
  const first = (KIND.get(e.kind) || KIND.get('exhibition')).stages[0];
  const at = new Date().toISOString();
  return db.transaction(async (tx) => {
    if (await tx.prepare('SELECT id FROM tc_event_companies WHERE event_id = ? AND company_id = ? AND removed_at IS NULL').get(e.id, c.id)) {
      bad('This company is already on the list.');
    }
    const r = await tx.prepare(`INSERT INTO tc_event_companies (event_id, company_id, stage, note, source, created_at, created_by)
      VALUES (?,?,?,?,?,?,?)`).run(e.id, c.id, first, clip(b.note, 500), 'manual', at, actor);
    await act(tx, c.id, { at, actor, body: `${e.name}: put on the list`, old: null, new: `${e.name}: ${stageLabel(first)}` });
    return { id: Number(r.lastInsertRowid) };
  });
}

/** Move a company to another column; the company's log says from where to where. */
export async function setStage(db, linkId, stage, actor) {
  if (!actor) bad('Who is moving it?');
  const l = await db.prepare(`SELECT l.*, e.name AS event_name, e.kind FROM tc_event_companies l JOIN tc_events e ON e.id = l.event_id
    WHERE l.id = ? AND l.removed_at IS NULL`).get(Number(linkId));
  if (!l) bad('That company is not on the list any more.');
  const stages = (KIND.get(l.kind) || KIND.get('exhibition')).stages;
  if (!stages.includes(stage)) bad('Pick one of: ' + stages.map(stageLabel).join(', ') + '.');
  if (stage === l.stage) return { ok: true, changed: false };
  const at = new Date().toISOString();
  return db.transaction(async (tx) => {
    await tx.prepare('UPDATE tc_event_companies SET stage = ?, updated_at = ?, updated_by = ? WHERE id = ?').run(stage, at, actor, l.id);
    await act(tx, l.company_id, { at, actor, body: l.event_name, old: `${l.event_name}: ${stageLabel(l.stage)}`, new: `${l.event_name}: ${stageLabel(stage)}` });
    return { ok: true, changed: true };
  });
}

/** Take a company off a list: the row stays, stamped; the company's log says so. */
export async function removeFromEvent(db, linkId, actor) {
  if (!actor) bad('Who is taking it off?');
  const l = await db.prepare(`SELECT l.*, e.name AS event_name FROM tc_event_companies l JOIN tc_events e ON e.id = l.event_id
    WHERE l.id = ? AND l.removed_at IS NULL`).get(Number(linkId));
  if (!l) bad('That company is not on the list any more.');
  const at = new Date().toISOString();
  return db.transaction(async (tx) => {
    await tx.prepare('UPDATE tc_event_companies SET removed_at = ?, removed_by = ? WHERE id = ?').run(at, actor, l.id);
    await act(tx, l.company_id, { at, actor, body: `${l.event_name}: taken off the list`, old: `${l.event_name}: ${stageLabel(l.stage)}`, new: null });
    return { ok: true };
  });
}

// ------------------------------------------------------------------ the seed --

const SEED = SEASON.seed;
const parseExtra = (v) => { if (!v) return {}; if (typeof v === 'object') return v; try { return JSON.parse(v) || {}; } catch { return {}; } };

/** What the seed would write, from the companies' Excel tabs. Writes nothing. */
async function seedPlan(db) {
  const defs = SEED.events.map((d) => ({ ...d, re: d.match ? new RegExp(d.match, 'i') : null }));
  const companies = await db.prepare(`SELECT id, name, country, extra FROM tc_companies WHERE archived_at IS NULL AND extra IS NOT NULL ORDER BY id`).all();
  const rows = [];
  const unmatched = new Map();
  for (const c of companies) {
    const x = parseExtra(c.extra);
    const seen = new Set();
    for (const part of String(x.exhibitions || '').split(/\s*;\s*/).map((s) => s.trim()).filter(Boolean)) {
      const d = defs.find((e) => e.re && e.re.test(part));
      if (!d) { unmatched.set(part, (unmatched.get(part) || 0) + 1); continue; }
      if (seen.has(d.key)) continue;                         // the same exhibition twice in one cell: once
      seen.add(d.key);
      rows.push({ key: d.key, companyId: Number(c.id), note: part.slice(0, 500), total: isTotalRow(c.country) });
    }
    const cal = defs.find((e) => e.from === 'calendar_gift');
    if (cal && String(x.calendar_gift || '').trim()) rows.push({ key: cal.key, companyId: Number(c.id), note: String(x.calendar_gift).trim().slice(0, 500), total: isTotalRow(c.country) });
  }
  const events = defs.map(({ re, match, from, ...d }) => d);
  const hash = sha(JSON.stringify({ v: 1, batch: SEED.batch, events, rows: rows.map((r) => [r.key, r.companyId, r.note]) }));
  return { events, rows, unmatched: [...unmatched.entries()].map(([text, n]) => ({ text, n })).sort((a, b) => b.n - a.n), hash };
}

async function seedDone(db) {
  return db.prepare('SELECT value, ran_at, detail FROM sync_state WHERE name = ?').get(SEED.batch);
}

/** The preview: counts per event, what did not match, and the hash the apply needs. */
export async function seedPreview(db) {
  const p = await seedPlan(db);
  const done = await seedDone(db);
  return {
    preview: true, batch: SEED.batch, hash: p.hash, applied: done ? { at: done.ran_at, detail: done.detail } : null,
    events: p.events.map((e) => {
      const mine = p.rows.filter((r) => r.key === e.key);
      return { key: e.key, name: e.name, kind: e.kind, startsOn: e.startsOn, endsOn: e.endsOn, dateConfirmed: e.dateConfirmed,
        companies: mine.length, counted: mine.filter((r) => !r.total).length };
    }),
    rows: p.rows.length, unmatched: p.unmatched,
  };
}

/** The apply: once, with the preview's hash, in one transaction. */
export async function seedApply(db, { hash } = {}, actor = 'admin') {
  if (!hash) throw new SeedError('Run the preview first and send its hash: nothing is written without it.');
  const p = await seedPlan(db);
  if (hash !== p.hash) throw new SeedError('The companies\' Excel tabs are not the ones previewed. Run the preview again.');
  const at = new Date().toISOString();
  return db.transaction(async (tx) => {
    if (tx.kind === 'pg') await tx.query('SELECT pg_advisory_xact_lock(7240021)');
    if (await seedDone(tx)) throw new SeedError('The season seed has already run.');
    const ids = new Map();
    for (const e of p.events) {
      const have = await tx.prepare('SELECT id FROM tc_events WHERE source_key = ?').get(e.key);
      if (have) { ids.set(e.key, Number(have.id)); continue; }
      const r = await tx.prepare(`INSERT INTO tc_events (name, kind, city, country, starts_on, ends_on, date_confirmed, source, source_key, created_at, created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(e.name, e.kind, e.city || null, e.country || null, e.startsOn || null, e.endsOn || null,
        e.dateConfirmed ? 1 : 0, SEED.batch, e.key, at, actor);
      ids.set(e.key, Number(r.lastInsertRowid));
    }
    let n = 0;
    for (const r of p.rows) {
      const eventId = ids.get(r.key);
      if (await tx.prepare('SELECT id FROM tc_event_companies WHERE event_id = ? AND company_id = ? AND removed_at IS NULL').get(eventId, r.companyId)) continue;
      await tx.prepare(`INSERT INTO tc_event_companies (event_id, company_id, stage, note, source, created_at, created_by) VALUES (?,?,?,?,?,?,?)`)
        .run(eventId, r.companyId, 'on_list', r.note, SEED.batch, at, actor);
      n += 1;
    }
    await tx.prepare('INSERT INTO sync_state (name, value, ran_at, detail) VALUES (?,?,?,?)')
      .run(SEED.batch, 'done', at, `${ids.size} events, ${n} companies on lists, by ${actor}`);
    return { applied: true, events: ids.size, companies: n };
  });
}
