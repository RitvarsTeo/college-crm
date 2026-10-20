// THE CLIENT HUB IMPORT (20.10.2026): an ADMIN one-off, preview first, the same pattern as the Excel import
// (src/tcimport.js).
//
// The owner's picks, 19-20.10.2026: Intake is the MASTER for contacts; Client Hub contacts come into Intake ONCE;
// Client Hub keeps running the Grand Opening untouched. Nothing here ever reads or writes Client Hub.
//
// Input: clienthub_import_contacts.csv, made READ ONLY by _training-centre/tools/clienthub_import_extract.mjs (personal
// data, never in git): one row per Client Hub contact, with the link of its company to an Excel company as TC-DATA's
// 19.10 cross-check found it. Nothing here ever logs or returns a contact's name, email or phone.
//
//   PREVIEW writes nothing and answers COUNTS, plus a hash of the file.
//   APPLY   needs that hash. One transaction. Every Client Hub contact lands in tc_import_rows (batch
//           config/tc.json clienthubImport.batch), so a second apply finds nothing to do.
//
// The rules, each a decision written down (config/tc.json clienthubImport):
//   - skipped: deleted in Client Hub; Novikontas itself (its company, its status, its own addresses); marked Outdated;
//     a duplicate Client Hub folded away; no company; nothing to reach (no name, email or phone);
//   - linked by exact name, normalised name or domain to ONE Excel company: the contact is added to that company,
//     never twice the same email on one company, never twice the same Client Hub contact;
//   - a weak or domain-only link, or a tie between two Excel companies: the REVIEW list, never imported;
//   - only in Client Hub: a new company (status clienthubImport.newCompanyStatus: Client Hub's statuses are Grand
//     Opening states, not Training Centre ones), unless Intake already holds ONE company of that name, which then
//     gets the contacts; two or more of that name go to the review list;
//   - kept from Client Hub: the contact id only (tc_company_contacts.ch_contact_id), and in tc_import_rows a short
//     hash of the name, email and phone as imported, so a later one-way difference check
//     (_training-centre/tools/clienthub_difference_check.mjs) can say which changed in Client Hub, by id.

import crypto from 'node:crypto';
import { TC, nameKey } from './tc.js';
import { ImportError, parseCsv } from './tcimport.js';

const CH = TC.clienthubImport;
export const FILE = CH.files[0];
const NEEDS = ['ch_contact_id', 'deleted', 'ch_company_key', 'company', 'link', 'tc_company_id', 'name', 'role', 'email', 'phone',
  'country', 'city', 'ch_status', 'issue_type'];
const FINAL = ['added', 'created'];

const txt = (v, n = 4000) => { const s = String(v ?? '').trim(); return s ? s.slice(0, n) : null; };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** A short hash per field as imported: n=name e=email p=phone, '-' when empty. The difference check uses the same. */
export function fingerprint({ name, email, phone }) {
  const h = (v) => (v ? sha(v).slice(0, 12) : '-');
  const n = String(name ?? '').trim().replace(/\s+/g, ' ');
  const e = String(email ?? '').trim().toLowerCase();
  const p = String(phone ?? '').replace(/[^\d+]/g, '');
  return `n=${h(n)} e=${h(e)} p=${h(p)}`;
}

const mostCommon = (list) => {
  const m = new Map();
  for (const v of list) if (v) m.set(v, (m.get(v) || 0) + 1);
  let best = null, n = 0;
  for (const [v, k] of m) if (k > n) { best = v; n = k; }
  return best;
};

/** The file worked out in memory: what each row is. Touches no database. */
export function plan(files, { batch = CH.batch } = {}) {
  const rows = parseCsv(files[FILE]);
  const missing = NEEDS.filter((c) => !rows.columns.includes(c));
  if (missing.length) throw new ImportError(`${FILE} is missing the column${missing.length > 1 ? 's' : ''} ${missing.join(', ')}.`);
  const seen = new Set();
  const entries = [];
  rows.forEach((r, i) => {
    const line = i + 2;
    const id = txt(r.ch_contact_id, 80);
    const e = { line, chId: id, key: id ? 'contact:' + id : `line:${line}` };
    entries.push(e);
    if (!id) return Object.assign(e, { outcome: 'rejected', reason: 'no Client Hub contact id' });
    if (seen.has(id)) return Object.assign(e, { outcome: 'rejected', reason: 'the same Client Hub contact twice' });
    seen.add(id);
    if (String(r.deleted).trim() === 'true') return Object.assign(e, { outcome: 'skipped', reason: 'deleted in Client Hub' });
    const email = txt(r.email, 200) ? String(r.email).trim().toLowerCase() : null;
    const domain = email && email.includes('@') ? email.split('@').pop() : '';
    const link = String(r.link || '').trim();
    if (link === CH.internalLink || CH.internalStatuses.includes(String(r.ch_status || '').trim())
      || CH.internalDomains.some((d) => domain === d || domain.endsWith('.' + d))) {
      return Object.assign(e, { outcome: 'skipped', reason: 'Novikontas itself' });
    }
    if (CH.inactiveStatuses.includes(String(r.ch_status || '').trim())) return Object.assign(e, { outcome: 'skipped', reason: 'Outdated in Client Hub' });
    if (CH.duplicateIssues.includes(String(r.issue_type || '').trim())) return Object.assign(e, { outcome: 'skipped', reason: 'a duplicate in Client Hub' });
    const company = txt(r.company, 200);
    if (!txt(r.ch_company_key) || !company) return Object.assign(e, { outcome: 'skipped', reason: 'no company in Client Hub' });
    const contact = { name: txt(r.name, 160), position: txt(r.role, 160), email, phone: txt(r.phone, 60) };
    if (!contact.name && !contact.email && !contact.phone) return Object.assign(e, { outcome: 'skipped', reason: 'no name, email or phone' });
    Object.assign(e, { contact, fp: fingerprint(contact), chKey: String(r.ch_company_key).trim(), company,
      country: txt(r.country, 80), city: txt(r.city, 80), link, unsubscribed: ['unsubscribed', 'cleaned'].includes(String(r.mailchimp_status || '').trim()) });
    if (CH.importLinks.includes(link)) {
      const tcId = txt(r.tc_company_id, 80);
      if (!tcId) return Object.assign(e, { outcome: 'review', reason: 'linked, with no Excel company id' });
      return Object.assign(e, { target: 'excel', tcId });
    }
    if (CH.reviewLinks.includes(link)) return Object.assign(e, { outcome: 'review', reason: `link: ${link}` });
    if (link === CH.newLink) return Object.assign(e, { target: 'new', nameKey: nameKey(company) || company.toLowerCase() });
    return Object.assign(e, { outcome: 'review', reason: `link not known: ${link || 'none given'}` });
  });
  const hash = sha(JSON.stringify({ v: 1, batch, file: sha(String(files[FILE])) }));
  return { batch, hash, entries };
}

/** What the plan does against THIS database. Counts only. */
export async function preview(db, files, opts = {}) {
  const p = plan(files, opts);
  const marks = new Map((await db.prepare('SELECT source_key, outcome, reason, company_id FROM tc_import_rows WHERE batch = ?').all(p.batch))
    .map((r) => [r.source_key, r]));
  const inIntake = new Set((await db.prepare('SELECT ch_contact_id FROM tc_company_contacts WHERE ch_contact_id IS NOT NULL').all())
    .map((r) => String(r.ch_contact_id)));
  // the Excel companies, by the Excel import's own id (TC.import.batch), as long as they are not archived
  const excel = new Map((await db.prepare(`SELECT r.source_key, r.company_id FROM tc_import_rows r JOIN tc_companies c ON c.id = r.company_id
    WHERE r.batch = ? AND r.company_id IS NOT NULL AND c.archived_at IS NULL`).all(TC.import.batch)).map((r) => [r.source_key, Number(r.company_id)]));
  const companies = await db.prepare('SELECT id, name, name_key, source, source_key FROM tc_companies WHERE archived_at IS NULL').all();
  const byName = new Map();
  for (const c of companies) {
    for (const k of new Set([c.name_key, nameKey(c.name)])) {
      if (!k) continue;
      if (!byName.has(k)) byName.set(k, new Set());
      byName.get(k).add(Number(c.id));
    }
  }
  const ours = new Map(companies.filter((c) => c.source === p.batch && c.source_key).map((c) => [c.source_key, Number(c.id)]));
  const emails = new Map();
  for (const r of await db.prepare(`SELECT k.company_id, k.email FROM tc_company_contacts k JOIN tc_companies c ON c.id = k.company_id
    WHERE k.email IS NOT NULL AND k.archived_at IS NULL AND c.archived_at IS NULL`).all()) {
    if (!emails.has(Number(r.company_id))) emails.set(Number(r.company_id), new Set());
    emails.get(Number(r.company_id)).add(String(r.email).toLowerCase());
  }
  const taken = (id, email) => { if (!emails.has(id)) emails.set(id, new Set()); const s = emails.get(id); if (s.has(email)) return true; s.add(email); return false; };

  const fresh = new Map();    // nameKey -> the new company
  for (const e of p.entries) {
    if (e.outcome) continue;
    if (FINAL.includes((marks.get(e.key) || {}).outcome) || inIntake.has(e.chId)) { e.outcome = 'done'; continue; }
    if (e.target === 'excel') {
      e.companyId = excel.get(e.tcId);
      if (!e.companyId) { e.outcome = 'review'; e.reason = 'its Excel company is not in Intake'; continue; }
      e.into = 'existing';
    } else {
      const mine = ours.get('ch:' + e.nameKey);
      const same = [...(byName.get(e.nameKey) || [])];
      if (mine) { e.companyId = mine; e.into = 'existing'; }
      else if (same.length === 1) { e.companyId = same[0]; e.into = 'existing'; e.byName = true; }
      else if (same.length > 1) { e.outcome = 'review'; e.reason = 'two or more companies of this name in Intake'; continue; }
      else {
        if (!fresh.has(e.nameKey)) fresh.set(e.nameKey, { nameKey: e.nameKey, sourceKey: 'ch:' + e.nameKey, entries: [] });
        e.into = 'new';
      }
    }
    if (e.contact.email && taken(e.into === 'new' ? 'new:' + e.nameKey : e.companyId, e.contact.email)) {
      e.outcome = 'duplicate'; e.reason = 'that email is already on the company'; continue;
    }
    e.outcome = 'added';
    if (e.into === 'new') fresh.get(e.nameKey).entries.push(e);
  }
  const news = [...fresh.values()].filter((c) => c.entries.length);
  for (const c of news) {
    c.name = mostCommon(c.entries.map((e) => e.company));
    c.country = mostCommon(c.entries.map((e) => e.country));
    c.city = mostCommon(c.entries.map((e) => e.city));
    c.chKeys = [...new Set(c.entries.map((e) => e.chKey))].sort();
  }

  const of = (o) => p.entries.filter((e) => e.outcome === o);
  const reasons = (list) => list.reduce((m, e) => { m[e.reason] = (m[e.reason] || 0) + 1; return m; }, {});
  const added = of('added');
  const toOld = added.filter((e) => e.into === 'existing');
  const review = of('review');
  const counts = {
    batch: p.batch, hash: p.hash,
    contacts: {
      inFile: p.entries.length,
      toExistingCompanies: toOld.length,
      toNewCompanies: added.length - toOld.length,
      withEmail: added.filter((e) => e.contact.email).length,
      withPhone: added.filter((e) => e.contact.phone).length,
      unsubscribedOrCleanedInMailchimp: added.filter((e) => e.unsubscribed).length,
      alreadyImported: of('done').length,
      sameEmailOnTheCompany: of('duplicate').length,
      skipped: of('skipped').length,
      skippedWhy: reasons(of('skipped')),
      review: review.length,
      rejected: of('rejected').length,
    },
    companies: {
      existingGettingContacts: new Set(toOld.map((e) => e.companyId)).size,
      ofThemFoundByNameInIntake: new Set(toOld.filter((e) => e.byName).map((e) => e.companyId)).size,
      new: news.length,
      newWithCountry: news.filter((c) => c.country).length,
      newStatus: CH.newCompanyStatus,
    },
    review: {
      companies: new Set(review.map((e) => e.chKey)).size,
      contacts: review.length,
      why: reasons(review),
    },
    rejectedRows: of('rejected').map((e) => ({ line: e.line, reason: e.reason })),
  };
  return { counts, plan: { ...p, news, marks } };
}

// Many rows, one statement per chunk (src/tcimport.js), with an optional ON CONFLICT tail.
async function insertMany(tx, table, cols, rows, tail = '', chunk = 200) {
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const marks = part.map(() => '(' + cols.map(() => '?').join(',') + ')').join(',');
    await tx.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES ${marks}${tail}`).run(...part.flat());
  }
}

/** One transaction. Refused unless the hash is the preview's. */
export async function apply(db, files, opts = {}, actor = 'admin') {
  if (!opts.hash) throw new ImportError('Run the preview first and send its hash: nothing is written without it.');
  const { counts, plan: p } = await preview(db, files, opts);
  if (opts.hash !== p.hash) throw new ImportError('The file is not the one previewed. Run the preview again.');
  const at = new Date().toISOString();
  await db.transaction(async (tx) => {
    await insertMany(tx, 'tc_companies', ['name', 'name_key', 'country', 'city', 'status', 'extra', 'source', 'source_key', 'created_at', 'created_by'],
      p.news.map((c) => [c.name, c.nameKey, c.country, c.city, CH.newCompanyStatus, JSON.stringify({ clienthub_companies: c.chKeys.join(' ; ') }),
        p.batch, c.sourceKey, at, actor]));
    const ids = new Map((await tx.prepare('SELECT id, source_key FROM tc_companies WHERE source = ? AND source_key IS NOT NULL').all(p.batch))
      .map((r) => [r.source_key, Number(r.id)]));
    const added = p.entries.filter((e) => e.outcome === 'added');
    for (const e of added) if (e.into === 'new') e.companyId = ids.get('ch:' + e.nameKey);
    await insertMany(tx, 'tc_company_contacts', ['company_id', 'name', 'position', 'email', 'phone', 'ch_contact_id', 'source', 'created_at', 'created_by'],
      added.map((e) => [e.companyId, e.contact.name, e.contact.position, e.contact.email, e.contact.phone, e.chId, p.batch, at, actor]));
    const per = new Map();
    for (const e of added) per.set(e.companyId, (per.get(e.companyId) || 0) + 1);
    const created = new Set(p.news.map((c) => ids.get(c.sourceKey)));
    await insertMany(tx, 'tc_activities', ['company_id', 'kind', 'occurred_at', 'body', 'actor', 'origin'],
      [...per].map(([id, n]) => [id, 'import', at, created.has(id)
        ? `Imported from ${CH.sourceLabel}, ${n} contact${n === 1 ? '' : 's'}`
        : `${n} contact${n === 1 ? '' : 's'} added from ${CH.sourceLabel}`, actor, 'import']));
    // the trace: a final row (added, created) is written once; any other is written again only when it changed
    const rows = [];
    for (const c of p.news) rows.push([p.batch, 'company:' + c.nameKey, null, ids.get(c.sourceKey), 'created', null, at, actor]);
    for (const e of p.entries) {
      if (e.outcome === 'done') continue;
      const reason = e.outcome === 'added' ? 'as imported ' + e.fp : e.reason || null;
      const was = p.marks.get(e.key);
      if (was && was.outcome === e.outcome && (was.reason || null) === reason) continue;
      rows.push([p.batch, e.key, e.line, e.companyId || null, e.outcome, reason, at, actor]);
    }
    await insertMany(tx, 'tc_import_rows', ['batch', 'source_key', 'row_no', 'company_id', 'outcome', 'reason', 'applied_at', 'applied_by'], rows,
      ` ON CONFLICT (batch, source_key) DO UPDATE SET row_no = excluded.row_no, company_id = excluded.company_id, outcome = excluded.outcome,
        reason = excluded.reason, applied_at = excluded.applied_at, applied_by = excluded.applied_by`);
  });
  return { applied: true, ...counts };
}
