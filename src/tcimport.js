// THE TRAINING CENTRE EXCEL IMPORT (19.10.2026): an ADMIN one-off, preview first, the same pattern as patches 56 and 58.
//
// Input: the three files TC-DATA cleaned out of "Planning of customers.xlsx" (companies.csv, contacts.csv, courses.csv,
// _training-centre/data, never in git). They come as an upload in the request body, or, on a laptop only, from a folder
// named in the request. Personal data: nothing here ever logs or returns a contact's name, email or phone.
//
//   PREVIEW writes nothing and answers COUNTS (and rejected row numbers with the reason), plus a hash of the files and
//           the options. No names.
//   APPLY   needs that hash: the files and options must be exactly the ones previewed. One transaction. Every company
//           lands in tc_import_rows, so a second apply finds nothing to do.
//
// The rules, each a decision written down:
//   - a company already imported in this batch is skipped; one with the same name key and country already in Intake
//     is MATCHED (linked in tc_import_rows, its data left alone);
//   - no status ('not_set') starts as config/tc.json defaults.noStatus (provisional, the owner's to confirm);
//   - a date before 2000 is "not known" and stays empty, never guessed (the Excel carries 1990 fillers);
//   - courses: TC-DATA's own rule, the MAIN tab only, the highest count per company per year (the figures the owner was
//     given: 471 active clients); side-tab course lines are counted in the preview and not imported;
//   - the last communication becomes one activity; the next communication becomes the open task, owner = person in
//     charge; whether next dates already past come in as overdue or are left out is picked on the preview (pastNext).

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { TC, STATUS_IDS, AREA_IDS, MEETING_IDS } from './tc.js';
import { localDate } from './bizday.js';

export class ImportError extends Error {}

/** RFC 4180: quoted fields, doubled quotes, newlines inside quotes, a BOM. Rows as objects by the header. */
export function parseCsv(text) {
  const s = String(text ?? '').replace(/^\uFEFF/, '');
  const rows = []; let row = []; let f = ''; let q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
      continue;
    }
    if (c === '"') { q = true; continue; }
    if (c === ',') { row.push(f); f = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; continue; }
    f += c;
  }
  if (q) throw new ImportError('A quoted field is never closed: the file is cut short.');
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  const head = rows.length ? rows[0].map((h) => h.trim()) : [];
  const out = rows.slice(1).filter((r) => r.some((x) => x !== '')).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
  out.columns = head;   // the header, also when the file has no rows
  return out;
}

const NEEDS = {
  'companies.csv': ['company_id', 'name', 'name_key', 'country', 'status', 'person_in_charge', 'next_communication'],
  'contacts.csv': ['company_id', 'name', 'email', 'phone'],
  'courses.csv': ['company_id', 'year', 'count', 'is_primary', 'parsed'],
};

/** The files, from an upload { files: { 'companies.csv': text, ... } } or, never on a hosted copy, a folder. */
export function readFiles(b, { hosted = Boolean(process.env.VERCEL) } = {}) {
  const out = {};
  if (b && b.files && typeof b.files === 'object') {
    for (const name of TC.import.files) {
      if (typeof b.files[name] !== 'string') throw new ImportError(`The upload has no ${name}.`);
      out[name] = b.files[name];
    }
    return out;
  }
  if (b && b.dir) {
    if (hosted) throw new ImportError('On the live copy the files are uploaded, never read from a folder.');
    const dir = path.resolve(String(b.dir));
    for (const name of TC.import.files) {
      const file = path.join(dir, name);
      if (!fs.existsSync(file)) throw new ImportError(`${name} is not in that folder.`);
      out[name] = fs.readFileSync(file, 'utf8');
    }
    return out;
  }
  throw new ImportError('Send the three files (files) or, on a laptop, the folder they are in (dir).');
}

const day = (v) => {
  const s = String(v || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s + 'T00:00:00Z'))) return null;
  return Number(s.slice(0, 4)) < 2000 ? null : s;   // a filler date is "not known", never a guess
};
const txt = (v, n = 4000) => { const s = String(v ?? '').trim(); return s ? s.slice(0, n) : null; };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** The whole import worked out in memory: what each row becomes. Touches no database. */
export function plan(files, { pastNext = 'overdue', batch = TC.import.batch, today = localDate() } = {}) {
  if (!['overdue', 'skip'].includes(pastNext)) throw new ImportError('pastNext is overdue or skip.');
  const parsed = {};
  for (const name of TC.import.files) {
    parsed[name] = parseCsv(files[name]);
    const head = parsed[name].columns;
    const missing = NEEDS[name].filter((c) => !head.includes(c));
    if (missing.length) throw new ImportError(`${name} is missing the column${missing.length > 1 ? 's' : ''} ${missing.join(', ')}.`);
  }
  const rejected = [];
  const seen = new Set();
  const companies = [];
  const u = { statuses: 0, meetingTypes: 0, areas: 0 };
  parsed['companies.csv'].forEach((r, i) => {
    const line = i + 2;   // the CSV line, the header being line 1
    const key = String(r.company_id || '').trim();
    const name = txt(r.name, 200);
    if (!key) return rejected.push({ line, reason: 'no company id' });
    if (!name) return rejected.push({ line, reason: 'no name' });
    if (seen.has(key)) return rejected.push({ line, reason: 'the same company id twice' });
    seen.add(key);
    let status = String(r.status || '').trim();
    if (!status || status === 'not_set') status = TC.defaults.noStatus;
    else if (!STATUS_IDS.includes(status)) { u.statuses += 1; status = TC.defaults.noStatus; }
    let detail = String(r.status_channel || '').trim() || null;
    if (detail && !MEETING_IDS.includes(detail)) { u.meetingTypes += 1; detail = null; }
    const flags = { TC: r.area_tc, ENERGY: r.area_energy, OPITO: r.area_opito, PROJECTS: r.area_projects };
    const areas = AREA_IDS.filter((a) => String(flags[a] || '').trim() === '1');
    if (String(r.area_other || '').trim()) u.areas += 1;
    const extra = {};
    for (const k of ['other_names', 'all_countries', 'name_tag_country', 'web_domain', 'email_domains', 'area_other', 'year_column',
      'exhibitions', 'calendar_gift', 'vendor_registration', 'country_tab_notes', 'legacy_lists', 'side_tabs', 'clienthub_match', 'main_rows']) {
      if (String(r[k] || '').trim()) extra[k] = String(r[k]).trim().slice(0, 2000);
    }
    companies.push({
      key, line, name, nameKey: txt(r.name_key, 200) || name.toLowerCase(), country: txt(r.country, 80), city: txt(r.city, 80),
      address: txt(r.address, 300), website: txt(r.website, 200), status, detail, areas, pic: txt(r.person_in_charge, 120),
      notes: [txt(r.comments), txt(r.extra_note)].filter(Boolean).join('\n\n') || null, info: txt(r.info_to_send),
      last: day(r.last_communication), topics: txt(r.topics, 500), next: day(r.next_communication),
      sourceRow: Number.parseInt(String(r.main_rows || '').split(/[;,\s]/)[0], 10) || null,
      extra: Object.keys(extra).length ? extra : null, contacts: [], courses: [],
    });
  });
  const byKey = new Map(companies.map((c) => [c.key, c]));

  const k = { inFile: parsed['contacts.csv'].length, kept: 0, noCompany: 0, empty: 0, sameEmail: 0, unparsed: 0 };
  for (const r of parsed['contacts.csv']) {
    const c = byKey.get(String(r.company_id || '').trim());
    if (!c) { k.noCompany += 1; continue; }
    const email = txt(r.email, 200) ? String(r.email).trim().toLowerCase() : null;
    const raw = txt(r.raw_text, 2000);
    const unparsed = String(r.kind || '') === 'unparsed_text';
    if (!txt(r.name) && !email && !txt(r.phone) && !raw) { k.empty += 1; continue; }
    if (email && c.contacts.some((x) => x.email === email)) { k.sameEmail += 1; continue; }
    if (unparsed) k.unparsed += 1;
    c.contacts.push({ name: txt(r.name, 160), position: txt(r.role, 160), email, phone: txt(r.phone, 60),
      notes: unparsed ? raw : null });
    k.kept += 1;
  }

  const cr = { lines: parsed['courses.csv'].length, sideTab: 0, unparsed: 0, noCompany: 0, noCount: 0, conflicts: 0 };
  const years = new Map();
  for (const r of parsed['courses.csv']) {
    const c = byKey.get(String(r.company_id || '').trim());
    if (!c) { cr.noCompany += 1; continue; }
    if (String(r.parsed) !== '1') { cr.unparsed += 1; continue; }
    if (String(r.is_primary) !== '1') { cr.sideTab += 1; continue; }
    const y = Number(r.year), n = String(r.count ?? '').trim();
    if (!Number.isInteger(y) || y < 1990 || y > 2100 || n === '' || !/^\d+$/.test(n)) { cr.noCount += 1; continue; }
    const id = c.key + '|' + y;
    if (!years.has(id)) years.set(id, { c, year: y, counts: [], codes: [], raw: [] });
    const g = years.get(id);
    g.counts.push(Number(n));
    for (const code of String(r.course_codes || '').split(/\s*;\s*|\s*,\s*/).map((s) => s.trim().toUpperCase()).filter(Boolean)) {
      if (!g.codes.includes(code)) g.codes.push(code);
    }
    if (txt(r.raw_line) && !g.raw.includes(String(r.raw_line).trim())) g.raw.push(String(r.raw_line).trim());
  }
  for (const g of years.values()) {
    if (new Set(g.counts).size > 1) cr.conflicts += 1;
    g.c.courses.push({ year: g.year, attendees: Math.max(...g.counts), codes: g.codes.join(', ') || null,
      raw: g.raw.join(' | ').slice(0, 2000) || null });
  }

  const hash = sha(JSON.stringify({ v: 1, batch, pastNext, files: TC.import.files.map((n) => sha(String(files[n]))) }));
  return { batch, pastNext, today, hash, companies, rejected, unknown: u, contactsSeen: k, coursesSeen: cr };
}

/** What the plan does against THIS database: new, already imported, same name already here. Counts only. */
export async function preview(db, files, opts = {}) {
  const p = plan(files, opts);
  const done = new Set((await db.prepare('SELECT source_key FROM tc_import_rows WHERE batch = ?').all(p.batch)).map((r) => r.source_key));
  const here = new Map((await db.prepare('SELECT id, name_key, country FROM tc_companies WHERE archived_at IS NULL').all())
    .map((r) => [r.name_key + '|' + (r.country || ''), Number(r.id)]));
  for (const c of p.companies) {
    c.outcome = done.has(c.key) ? 'done' : here.has(c.nameKey + '|' + (c.country || '')) ? 'matched' : 'new';
    c.matchId = here.get(c.nameKey + '|' + (c.country || '')) || null;
  }
  const fresh = p.companies.filter((c) => c.outcome === 'new');
  const nexts = fresh.filter((c) => c.next);
  const overdue = nexts.filter((c) => c.next < p.today);
  const tally = (list, f) => list.reduce((m, c) => { const k = f(c); m[k] = (m[k] || 0) + 1; return m; }, {});
  const counts = {
    batch: p.batch, hash: p.hash, pastNext: p.pastNext, today: p.today,
    companies: { inFile: p.companies.length + p.rejected.length, new: fresh.length,
      alreadyImported: p.companies.filter((c) => c.outcome === 'done').length,
      sameNameAlreadyHere: p.companies.filter((c) => c.outcome === 'matched').length, rejected: p.rejected.length },
    rejectedRows: p.rejected.map((r) => ({ line: r.line, reason: r.reason })),
    statuses: tally(fresh, (c) => c.status),
    meetingTypes: tally(fresh.filter((c) => c.detail), (c) => c.detail),
    areas: Object.fromEntries(AREA_IDS.map((a) => [a, fresh.filter((c) => c.areas.includes(a)).length])),
    noArea: fresh.filter((c) => !c.areas.length).length,
    countries: new Set(fresh.map((c) => c.country).filter(Boolean)).size,
    noCountry: fresh.filter((c) => !c.country).length,
    peopleInCharge: new Set(fresh.map((c) => c.pic).filter(Boolean)).size,
    noPersonInCharge: fresh.filter((c) => !c.pic).length,
    infoToSend: fresh.filter((c) => c.info).length,
    unknown: p.unknown,
    contacts: { inFile: p.contactsSeen.inFile, toImport: fresh.reduce((n, c) => n + c.contacts.length, 0),
      withEmail: fresh.reduce((n, c) => n + c.contacts.filter((x) => x.email).length, 0),
      withPhone: fresh.reduce((n, c) => n + c.contacts.filter((x) => x.phone).length, 0),
      textOnly: p.contactsSeen.unparsed, empty: p.contactsSeen.empty, sameEmailTwice: p.contactsSeen.sameEmail,
      noCompany: p.contactsSeen.noCompany },
    courses: { linesInFile: p.coursesSeen.lines, companyYears: fresh.reduce((n, c) => n + c.courses.length, 0),
      delegates: fresh.reduce((n, c) => n + c.courses.reduce((m, k) => m + k.attendees, 0), 0),
      activeClients: fresh.filter((c) => c.courses.some((k) => k.attendees > 0)).length,
      yearsWithTwoCounts: p.coursesSeen.conflicts, sideTabLinesNotImported: p.coursesSeen.sideTab,
      unparsed: p.coursesSeen.unparsed, noCount: p.coursesSeen.noCount, noCompany: p.coursesSeen.noCompany },
    lastCommunication: fresh.filter((c) => c.last).length,
    next: { inFile: nexts.length, overdueOnDayOne: overdue.length,
      toImport: p.pastNext === 'skip' ? nexts.length - overdue.length : nexts.length,
      leftOut: p.pastNext === 'skip' ? overdue.length : 0 },
  };
  return { counts, plan: p };
}

// Many rows, one statement per chunk: one round trip per 200 rows on Postgres instead of one per row.
async function insertMany(tx, table, cols, rows, chunk = 200) {
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const marks = part.map(() => '(' + cols.map(() => '?').join(',') + ')').join(',');
    await tx.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES ${marks}`).run(...part.flat());
  }
}

/** One transaction. Refused unless the hash is the preview's: the same files, the same options. */
export async function apply(db, files, opts = {}, actor = 'admin') {
  if (!opts.hash) throw new ImportError('Run the preview first and send its hash: nothing is written without it.');
  const { counts, plan: p } = await preview(db, files, opts);
  if (opts.hash !== p.hash) throw new ImportError('The files or options are not the ones previewed. Run the preview again.');
  const at = new Date().toISOString();
  const label = TC.import.sourceLabel;
  const fresh = p.companies.filter((c) => c.outcome === 'new');
  await db.transaction(async (tx) => {
    await insertMany(tx, 'tc_companies', ['name', 'name_key', 'country', 'city', 'address', 'website', 'status', 'status_detail', 'pic_name',
      'notes', 'info_to_send', 'last_contact_at', 'extra', 'source', 'source_key', 'source_row', 'created_at', 'created_by'],
    fresh.map((c) => [c.name, c.nameKey, c.country, c.city, c.address, c.website, c.status, c.detail, c.pic, c.notes, c.info,
      c.last ? `${c.last}T00:00:00.000Z` : null, c.extra ? JSON.stringify(c.extra) : null, p.batch, c.key, c.sourceRow, at, actor]));
    const ids = new Map((await tx.prepare('SELECT id, source_key FROM tc_companies WHERE source = ? AND source_key IS NOT NULL').all(p.batch))
      .map((r) => [r.source_key, Number(r.id)]));
    const areas = [], contacts = [], courses = [], acts = [], tasks = [], marks = [];
    for (const c of fresh) {
      const id = ids.get(c.key);
      for (const a of c.areas) areas.push([id, a]);
      for (const k of c.contacts) contacts.push([id, k.name, k.position, k.email, k.phone, k.notes, p.batch, at, actor]);
      for (const k of c.courses) courses.push([id, k.year, k.attendees, k.codes, k.raw, TC.import.coursesAsOf, p.batch, at, actor]);
      acts.push([id, 'import', at, null, `Imported from ${label}${c.sourceRow ? ', row ' + c.sourceRow : ''}`, actor, 'import']);
      if (c.last) acts.push([id, c.detail || 'contact', `${c.last}T00:00:00.000Z`, c.topics, c.topics || 'Last communication (from the Excel)', null, 'import']);
      if (c.next && !(p.pastNext === 'skip' && c.next < p.today)) tasks.push([id, TC.nextLabel, c.next, c.pic, at, actor]);
      marks.push([p.batch, c.key, c.sourceRow, id, 'created', null, at, actor]);
    }
    await insertMany(tx, 'tc_company_areas', ['company_id', 'area'], areas);
    await insertMany(tx, 'tc_company_contacts', ['company_id', 'name', 'position', 'email', 'phone', 'notes', 'source', 'created_at', 'created_by'], contacts);
    await insertMany(tx, 'tc_company_courses', ['company_id', 'year', 'attendees', 'course_codes', 'raw', 'as_of', 'source', 'recorded_at', 'recorded_by'], courses);
    await insertMany(tx, 'tc_activities', ['company_id', 'kind', 'occurred_at', 'topics', 'body', 'actor', 'origin'], acts);
    await insertMany(tx, 'tc_tasks', ['company_id', 'label', 'due_at', 'owner', 'created_at', 'created_by'], tasks);
    for (const c of p.companies.filter((x) => x.outcome === 'matched')) marks.push([p.batch, c.key, c.sourceRow, c.matchId, 'matched', 'same name and country already in Intake', at, actor]);
    for (const r of p.rejected) marks.push([p.batch, `line:${r.line}`, null, null, 'rejected', r.reason, at, actor]);
    const before = new Set((await tx.prepare('SELECT source_key FROM tc_import_rows WHERE batch = ?').all(p.batch)).map((r) => r.source_key));
    await insertMany(tx, 'tc_import_rows', ['batch', 'source_key', 'row_no', 'company_id', 'outcome', 'reason', 'applied_at', 'applied_by'],
      marks.filter((m) => !before.has(m[1])));
  });
  return { applied: true, ...counts };
}
