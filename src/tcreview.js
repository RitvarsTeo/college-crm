// THE CLIENT HUB REVIEW LIST (20.10.2026): the contacts the Client Hub import (src/tcclienthub.js) could not place
// alone, placed by the Training Centre team. The owner's pick, board 4 R2 "Table with bulk": one table, the suggested
// company already chosen, tick many, Place; the suggestion changes per row; "Not a contact for us" sets a row aside
// with a reason. Nothing is deleted.
//
// 1. LOAD, an admin one-off in the imports' shape (PREVIEW counts only, APPLY with the preview's hash, idempotent):
//    every tc_import_rows row of the import's batch with outcome review becomes a tc_review_contacts row, read from
//    the file the import APPLIED (so the contact is exactly what the import saw) plus the cross-check's candidates
//    (clienthub_review_candidates.csv, company data only).
// 2. THE TABLE: open rows grouped as a person decides them: one row per Client Hub company; a contact with no
//    company is grouped by its email domain, and the Intake companies whose contacts or website use that domain are
//    the suggestion. Live: a company placed today is a suggestion tomorrow.
// 3. PLACE: as the import's apply does it: a contact of that company with its Client Hub id, never an email twice on
//    one company, the trace row (tc_import_rows) turned to added with the fingerprint the difference check reads,
//    and one line in the company's log.
// 4. SET ASIDE: the row closes with a reason; its trace row says so.

import crypto from 'node:crypto';
import { TC, TcInputError, nameKey } from './tc.js';
import { ImportError, parseCsv } from './tcimport.js';
import { contactOf, fingerprint } from './tcclienthub.js';

const CH = TC.clienthubImport;
const RV = TC.clienthubReview;
const KIND_IDS = RV.kinds.map((k) => k.id);
const RANK = { exact_name: 6, normalised_name: 5, domain: 4, fuzzy: 3, domain_group: 2, possible: 1 };
const GENERIC = new Set(RV.genericDomains);
const bad = (msg) => { throw new TcInputError(msg); };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const nowIso = () => new Date().toISOString();

/** The kind of a review row, from the reason the import wrote. */
export function whyOf(reason) {
  const r = String(reason || '');
  const m = /^link: (tie|fuzzy|possible|domain_group)$/.exec(r);
  if (m) return m[1];
  if (r.startsWith('no company in Client Hub')) return 'none';
  return 'other';
}
const hostOf = (email) => (String(email || '').includes('@') ? String(email).split('@').pop().trim().toLowerCase() : '');
const webHost = (w) => String(w || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\d?\./, '').split(/[/:?#\s]/)[0];
const useful = (d) => Boolean(d) && d.includes('.') && !GENERIC.has(d) && !CH.internalDomains.some((x) => d === x || d.endsWith('.' + x));

// ------------------------------------------------------------------ 1. load --

export async function previewLoad(db, files) {
  const [contactsFile, candFile] = RV.files;
  const rows = parseCsv(files[contactsFile]);
  if (!rows.columns.includes('ch_contact_id')) throw new ImportError(`${contactsFile} has no ch_contact_id column.`);
  const cands = parseCsv(files[candFile]);
  const missing = ['ch_company_key', 'tc_company_id', 'kind', 'score'].filter((c) => !cands.columns.includes(c));
  if (missing.length) throw new ImportError(`${candFile} is missing the column${missing.length > 1 ? 's' : ''} ${missing.join(', ')}.`);
  const byCh = new Map(rows.map((r) => [String(r.ch_contact_id).trim(), r]));
  const excel = new Map((await db.prepare(`SELECT r.source_key, r.company_id FROM tc_import_rows r JOIN tc_companies c ON c.id = r.company_id
    WHERE r.batch = ? AND r.company_id IS NOT NULL AND c.archived_at IS NULL`).all(TC.import.batch)).map((r) => [r.source_key, Number(r.company_id)]));
  const hitsOf = new Map();
  for (const c of cands) {
    const id = excel.get(String(c.tc_company_id).trim());
    if (!id || !RANK[c.kind]) continue;
    const k = String(c.ch_company_key).trim();
    if (!hitsOf.has(k)) hitsOf.set(k, []);
    hitsOf.get(k).push({ id, kind: c.kind, score: Number(c.score) || 0 });
  }
  const names = new Map();
  for (const c of await db.prepare('SELECT id, name, name_key FROM tc_companies WHERE archived_at IS NULL').all()) {
    for (const k of new Set([c.name_key, nameKey(c.name)])) { if (!names.has(k)) names.set(k, []); names.get(k).push(Number(c.id)); }
  }
  const waiting = await db.prepare(`SELECT source_key, row_no, reason FROM tc_import_rows WHERE batch = ? AND outcome = 'review' AND source_key LIKE 'contact:%'
    ORDER BY row_no`).all(CH.batch);
  const loaded = new Set((await db.prepare('SELECT ch_contact_id FROM tc_review_contacts WHERE batch = ?').all(CH.batch)).map((r) => String(r.ch_contact_id)));
  const out = [];
  const k = { onReviewList: waiting.length, alreadyLoaded: 0, notInFile: 0, toLoad: 0, withSuggestion: 0 };
  const why = {};
  for (const w of waiting) {
    const chId = String(w.source_key).slice('contact:'.length);
    if (loaded.has(chId)) { k.alreadyLoaded += 1; continue; }
    const r = byCh.get(chId);
    if (!r) { k.notInFile += 1; continue; }
    const { contact } = contactOf(r);
    const kind = whyOf(w.reason);
    const chKey = String(r.ch_company_key || '').trim() || null;
    let hits = chKey ? (hitsOf.get(chKey) || []).slice() : [];
    if (chKey && kind === 'other') for (const id of names.get(nameKey(r.company)) || []) hits.push({ id, kind: 'normalised_name', score: 1 });
    const seen = new Set();
    hits = hits.sort((a, b) => RANK[b.kind] - RANK[a.kind] || b.score - a.score).filter((h) => !seen.has(h.id) && seen.add(h.id)).slice(0, RV.maxCandidates);
    if (hits.length) k.withSuggestion += 1;
    why[kind] = (why[kind] || 0) + 1;
    out.push({ chId, rowNo: w.row_no, why: kind, company: String(r.company || '').trim() || null, chKey, country: String(r.country || '').trim() || null,
      contact, candidates: hits });
  }
  k.toLoad = out.length;
  const hash = sha(JSON.stringify({ v: 1, batch: CH.batch, files: RV.files.map((n) => sha(String(files[n]))) }));
  return { counts: { batch: CH.batch, hash, contacts: k, why }, rows: out };
}

export async function applyLoad(db, files, { hash } = {}, actor = 'admin') {
  if (!hash) throw new ImportError('Run the preview first and send its hash: nothing is written without it.');
  const { counts, rows } = await previewLoad(db, files);
  if (hash !== counts.hash) throw new ImportError('The files are not the ones previewed. Run the preview again.');
  const at = nowIso();
  await db.transaction(async (tx) => {
    for (let i = 0; i < rows.length; i += 200) {
      const part = rows.slice(i, i + 200);
      const cols = ['batch', 'ch_contact_id', 'row_no', 'why', 'ch_company', 'ch_company_key', 'country', 'name', 'position', 'email', 'phone', 'notes',
        'candidates', 'status', 'loaded_at', 'loaded_by'];
      await tx.prepare(`INSERT INTO tc_review_contacts (${cols.join(', ')}) VALUES ${part.map(() => '(' + cols.map(() => '?').join(',') + ')').join(',')}`)
        .run(...part.flatMap((r) => [CH.batch, r.chId, r.rowNo, r.why, r.company, r.chKey, r.country, r.contact.name, r.contact.position,
          r.contact.email, r.contact.phone, r.contact.notes, JSON.stringify(r.candidates), 'open', at, actor]));
    }
  });
  return { applied: true, ...counts };
}

// ------------------------------------------------------------------ 2. the table --

async function companiesById(db) {
  return new Map((await db.prepare('SELECT id, name, country, pic_name FROM tc_companies WHERE archived_at IS NULL').all())
    .map((c) => [Number(c.id), { id: Number(c.id), name: c.name, country: c.country || '', pic: c.pic_name || '' }]));
}
/** domain -> Map(company id -> how many of its contacts use it); a website counts as one. */
async function domainCompanies(db) {
  const m = new Map();
  const add = (d, id, n = 1) => { if (!useful(d)) return; if (!m.has(d)) m.set(d, new Map()); m.get(d).set(id, (m.get(d).get(id) || 0) + n); };
  for (const r of await db.prepare(`SELECT k.company_id, k.email FROM tc_company_contacts k JOIN tc_companies c ON c.id = k.company_id
    WHERE k.email IS NOT NULL AND k.archived_at IS NULL AND c.archived_at IS NULL`).all()) add(hostOf(r.email), Number(r.company_id));
  for (const r of await db.prepare('SELECT id, website FROM tc_companies WHERE archived_at IS NULL AND website IS NOT NULL').all()) add(webHost(r.website), Number(r.id));
  return m;
}
const initials = (name) => String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

export async function reviewCounts(db) {
  const rows = await db.prepare('SELECT status, why, COUNT(*) AS n FROM tc_review_contacts WHERE batch = ? GROUP BY status, why').all(CH.batch);
  const open = Object.fromEntries(KIND_IDS.map((k) => [k, 0]));
  const done = { placed: 0, duplicate: 0, set_aside: 0 };
  for (const r of rows) {
    if (r.status === 'open') open[KIND_IDS.includes(r.why) ? r.why : 'other'] += Number(r.n);
    else if (r.status in done) done[r.status] += Number(r.n);
  }
  return { all: Object.values(open).reduce((a, b) => a + b, 0), open, done };
}

export async function listReview(db) {
  const counts = await reviewCounts(db);
  const rows = await db.prepare(`SELECT id, why, ch_company, ch_company_key, country, name, position, email, phone, notes, candidates
    FROM tc_review_contacts WHERE batch = ? AND status = 'open' ORDER BY id`).all(CH.batch);
  const cos = await companiesById(db);
  const doms = rows.some((r) => r.why === 'none') ? await domainCompanies(db) : new Map();
  const groups = new Map();
  for (const r of rows) {
    const d = hostOf(r.email);
    const key = r.why !== 'none' ? `co:${r.why}:${r.ch_company_key || r.id}` : useful(d) ? `dom:${d}` : `one:${r.id}`;
    if (!groups.has(key)) {
      let cands;
      if (r.why === 'none') {
        const hit = doms.get(d) || new Map();
        const top = Math.max(1, ...hit.values());
        cands = [...hit].sort((a, b) => b[1] - a[1]).slice(0, RV.maxCandidates).map(([id, n]) => ({ id, kind: 'email_domain', score: n / top }));
      } else {
        try { cands = JSON.parse(r.candidates || '[]'); } catch { cands = []; }
      }
      cands = cands.filter((c) => cos.has(Number(c.id))).map((c) => {
        const co = cos.get(Number(c.id));
        return { id: co.id, name: co.name, country: co.country, pic: co.pic, picShort: initials(co.pic), hit: RV.hits[c.kind] || c.kind,
          score: Math.max(0, Math.min(1, Number(c.score) || 0)) };
      });
      groups.set(key, { key, why: r.why, title: r.why !== 'none' ? (r.ch_company || '') : useful(d) ? d : (r.name || r.email || r.phone || 'Contact'),
        domain: r.why === 'none' && useful(d) ? d : '', candidates: cands, suggested: cands.length ? cands[0].id : null, contacts: [] });
    }
    groups.get(key).contacts.push({ id: Number(r.id), name: r.name || '', position: r.position || '', email: r.email || '', phone: r.phone || '',
      noMailing: Boolean(r.notes) });
  }
  const order = (g) => KIND_IDS.indexOf(g.why);
  const list = [...groups.values()].sort((a, b) => order(a) - order(b) || (b.suggested ? 1 : 0) - (a.suggested ? 1 : 0)
    || b.contacts.length - a.contacts.length || a.title.localeCompare(b.title, 'lv'));
  return { counts, kinds: RV.kinds, setAsideLabel: RV.setAsideLabel, groups: list };
}

// ------------------------------------------------------------------ 3. place --

const ids = (v) => {
  const list = [].concat(v || []).map(Number);
  if (!list.length || list.some((n) => !Number.isInteger(n) || n <= 0)) bad('Say which contacts: their ids.');
  return [...new Set(list)];
};

/** items: [{ ids: [review row ids], companyId }]. Rows someone else placed a moment ago are counted, not placed twice. */
export async function place(db, items, actor) {
  if (!Array.isArray(items) || !items.length) bad('Tick a row first.');
  // one entry per company, so a company gets one line in its log however many rows went to it
  const byCo = new Map();
  for (const it of items) {
    const companyId = Number(it && it.companyId);
    const these = ids(it && it.ids);
    byCo.set(companyId, [...new Set([...(byCo.get(companyId) || []), ...these])]);
  }
  const plan = [...byCo].map(([companyId, list]) => ({ companyId, ids: list }));
  if (plan.reduce((n, p) => n + p.ids.length, 0) > RV.maxPerPlace) bad(`At most ${RV.maxPerPlace} contacts at once.`);
  for (const p of plan) {
    if (!Number.isInteger(p.companyId) || p.companyId <= 0) bad('Pick the company to place them under.');
    if (!(await db.prepare('SELECT id FROM tc_companies WHERE id = ? AND archived_at IS NULL').get(p.companyId))) bad('There is no such company.');
  }
  const at = nowIso();
  const out = { placed: 0, sameEmail: 0, alreadyDone: 0, companies: 0 };
  await db.transaction(async (tx) => {
    for (const p of plan) {
      const emails = new Set((await tx.prepare('SELECT email FROM tc_company_contacts WHERE company_id = ? AND email IS NOT NULL AND archived_at IS NULL')
        .all(p.companyId)).map((r) => String(r.email).toLowerCase()));
      let n = 0;
      for (const id of p.ids) {
        const r = await tx.prepare(`SELECT * FROM tc_review_contacts WHERE id = ? AND batch = ?`).get(id, CH.batch);
        if (!r || r.status !== 'open') { out.alreadyDone += 1; continue; }
        const inIntake = await tx.prepare('SELECT id FROM tc_company_contacts WHERE ch_contact_id = ? AND archived_at IS NULL').get(r.ch_contact_id);
        const key = 'contact:' + r.ch_contact_id;
        if (inIntake || (r.email && emails.has(r.email))) {
          await tx.prepare(`UPDATE tc_review_contacts SET status = 'duplicate', company_id = ?, contact_id = ?, done_at = ?, done_by = ? WHERE id = ?`)
            .run(p.companyId, inIntake ? Number(inIntake.id) : null, at, actor, id);
          await tx.prepare(`UPDATE tc_import_rows SET outcome = 'duplicate', company_id = ?, reason = ?, applied_at = ?, applied_by = ? WHERE batch = ? AND source_key = ?`)
            .run(p.companyId, 'that email is already on the company (placed by hand)', at, actor, CH.batch, key);
          out.sameEmail += 1;
          continue;
        }
        const ins = await tx.prepare(`INSERT INTO tc_company_contacts (company_id, name, position, email, phone, notes, ch_contact_id, source, created_at, created_by)
          VALUES (?,?,?,?,?,?,?,?,?,?)`).run(p.companyId, r.name, r.position, r.email, r.phone, r.notes, r.ch_contact_id, CH.batch, at, actor);
        const contactId = Number(ins.lastInsertRowid);
        if (r.email) emails.add(r.email);
        await tx.prepare(`UPDATE tc_review_contacts SET status = 'placed', company_id = ?, contact_id = ?, done_at = ?, done_by = ? WHERE id = ?`)
          .run(p.companyId, contactId, at, actor, id);
        await tx.prepare(`UPDATE tc_import_rows SET outcome = 'added', company_id = ?, reason = ?, applied_at = ?, applied_by = ? WHERE batch = ? AND source_key = ?`)
          .run(p.companyId, 'as imported ' + fingerprint(r) + ' (placed by hand)', at, actor, CH.batch, key);
        n += 1;
      }
      if (n) {
        await tx.prepare(`INSERT INTO tc_activities (company_id, kind, occurred_at, body, actor, origin) VALUES (?,?,?,?,?,?)`)
          .run(p.companyId, 'import', at, `${n} contact${n === 1 ? '' : 's'} placed from the Client Hub review list`, actor, 'manual');
        out.companies += 1;
        out.placed += n;
      }
    }
  });
  return { ...out, counts: await reviewCounts(db) };
}

// ------------------------------------------------------------------ 4. set aside --

export async function setAside(db, list, reason, actor) {
  const these = ids(list);
  const why = String(reason ?? '').trim().replace(/\s+/g, ' ');
  if (why.length < 2) bad('Say in a few words why it is not a contact for us.');
  if (why.length > 300) bad('Keep the reason under 300 characters.');
  if (these.length > RV.maxPerPlace) bad(`At most ${RV.maxPerPlace} contacts at once.`);
  const at = nowIso();
  let n = 0, alreadyDone = 0;
  await db.transaction(async (tx) => {
    for (const id of these) {
      const r = await tx.prepare('SELECT ch_contact_id, status FROM tc_review_contacts WHERE id = ? AND batch = ?').get(id, CH.batch);
      if (!r || r.status !== 'open') { alreadyDone += 1; continue; }
      await tx.prepare(`UPDATE tc_review_contacts SET status = 'set_aside', reason = ?, done_at = ?, done_by = ? WHERE id = ?`).run(why, at, actor, id);
      await tx.prepare(`UPDATE tc_import_rows SET outcome = 'set_aside', reason = ?, applied_at = ?, applied_by = ? WHERE batch = ? AND source_key = ?`)
        .run(`${RV.setAsideLabel}: ${why}`, at, actor, CH.batch, 'contact:' + r.ch_contact_id);
      n += 1;
    }
  });
  return { setAside: n, alreadyDone, counts: await reviewCounts(db) };
}
