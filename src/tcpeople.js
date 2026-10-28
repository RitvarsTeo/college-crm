// IMPORT PEOPLE FROM A FILE (28.10.2026): the owner's Client Hub pick 4, layout A "on Companies". The browser reads the
// file (CSV or Excel) and the person matches the columns; these functions take the rows as plain objects { name, email,
// company, position, phone, country, notes }. PREVIEW writes nothing and says, per row: New, Update (the same email is
// already a contact: what changes), Already there (nothing changes) or To fix (why), and which company the person goes
// to: found (same name, or the same email domain as people already there), several to pick from, or a new company.
// APPLY re-reads everything, takes the person's picks (a company id, "new" or "skip" per row) and writes in one
// transaction, each person added or changed logged on the company with who imported it. Nothing is deleted.

import { TC, TcInputError, nameKey, isTotalRow, logTcActivity } from './tc.js';

const MAX_ROWS = 2000;
const GENERIC = new Set((TC.clienthubReview && TC.clienthubReview.genericDomains) || []);
const nowIso = () => new Date().toISOString();
const clip = (v, n) => { const s = String(v ?? '').trim().replace(/\s+/g, ' '); return s ? s.slice(0, n) : ''; };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FORM = new Set(['sia', 'uab', 'as', 'oy', 'ab', 'ltd', 'llc', 'gmbh', 'bv', 'nv', 'jsc', 'ooo', 'the', 'plc', 'inc', 'co', 'sa', 'spa', 'srl', 'aps', 'asa', 'kg', 'ag', 'pte', 'pty']);
const looseKey = (name) => String(nameKey(name) || '').split(' ').filter((w) => w && !FORM.has(w)).join(' ');
const domainOf = (email) => { const d = String(email || '').toLowerCase().split('@')[1] || ''; return d && !GENERIC.has(d) ? d : ''; };

function cleanRow(r) {
  return { name: clip(r.name, 160), email: clip(r.email, 200).toLowerCase(), company: clip(r.company, 200), position: clip(r.position, 160),
    phone: clip(r.phone, 60), country: clip(r.country, 80), notes: clip(r.notes, 2000) };
}

async function facts(db) {
  const companies = (await db.prepare('SELECT id, name, country FROM tc_companies WHERE archived_at IS NULL').all())
    .filter((c) => !isTotalRow(c.country)).map((c) => ({ id: Number(c.id), name: c.name, country: c.country || '', key: nameKey(c.name), loose: looseKey(c.name) }));
  const contacts = await db.prepare(`SELECT k.id, k.company_id, k.name, k.email, k.position, k.phone, c.name AS company FROM tc_company_contacts k
    JOIN tc_companies c ON c.id = k.company_id WHERE k.archived_at IS NULL AND c.archived_at IS NULL`).all();
  const byEmail = new Map(); for (const k of contacts) if (k.email && !byEmail.has(String(k.email).toLowerCase())) byEmail.set(String(k.email).toLowerCase(), k);
  const byDomain = new Map();
  for (const k of contacts) { const d = domainOf(k.email); if (!d) continue; if (!byDomain.has(d)) byDomain.set(d, new Set()); byDomain.get(d).add(Number(k.company_id)); }
  return { companies, byId: new Map(companies.map((c) => [c.id, c])), byEmail, byDomain };
}

/** Which company a new person goes to: { state: found | choose | new | none, id, how, candidates, newName }. */
function companyFor(r, F) {
  const pick = (list) => list.slice(0, 6).map((c) => ({ id: c.id, name: c.name, country: c.country }));
  const domain = domainOf(r.email);
  const viaDomain = domain && F.byDomain.has(domain) ? [...F.byDomain.get(domain)].map((id) => F.byId.get(id)).filter(Boolean) : [];
  if (r.company) {
    const k = nameKey(r.company);
    let same = F.companies.filter((c) => c.key === k);
    if (same.length > 1 && r.country) { const inCountry = same.filter((c) => c.country.toLowerCase() === r.country.toLowerCase()); if (inCountry.length) same = inCountry; }
    if (same.length === 1) return { state: 'found', id: same[0].id, name: same[0].name, how: 'same name' };
    if (same.length > 1) return { state: 'choose', candidates: pick(same), newName: r.company };
    if (viaDomain.length === 1) return { state: 'found', id: viaDomain[0].id, name: viaDomain[0].name, how: 'same email domain' };
    const lk = looseKey(r.company);
    const loose = lk ? F.companies.filter((c) => c.loose === lk || (c.loose.startsWith(lk + ' ') || lk.startsWith(c.loose + ' '))) : [];
    const cands = [...new Map([...viaDomain, ...loose].map((c) => [c.id, c])).values()];
    if (cands.length) return { state: 'choose', candidates: pick(cands), newName: r.company };
    return { state: 'new', newName: r.company };
  }
  if (viaDomain.length === 1) return { state: 'found', id: viaDomain[0].id, name: viaDomain[0].name, how: 'same email domain' };
  if (viaDomain.length > 1) return { state: 'choose', candidates: pick(viaDomain), newName: '' };
  return { state: 'none' };
}

/** PREVIEW: { rows: [{ i, status, why, person, contactId, changes, company }], counts }. Writes nothing. */
export async function importPreview(db, input) {
  const list = [].concat(input || []);
  if (!list.length) throw new TcInputError('The file has no rows.');
  if (list.length > MAX_ROWS) throw new TcInputError(`One file can hold up to ${MAX_ROWS} people; this one has ${list.length}.`);
  const F = await facts(db);
  const seen = new Set();
  const rows = list.map((raw, i) => {
    const p = cleanRow(raw || {});
    const out = { i, person: p, status: 'new', why: '', contactId: null, changes: [], company: null };
    if (!p.name && !p.email && !p.phone) return { ...out, status: 'fix', why: 'no name, email or phone' };
    if (p.email && !EMAIL.test(p.email)) return { ...out, status: 'fix', why: 'the email does not look right' };
    if (p.email && seen.has(p.email)) return { ...out, status: 'fix', why: 'this email is twice in the file' };
    if (p.email) seen.add(p.email);
    const k = p.email ? F.byEmail.get(p.email) : null;
    if (k) {
      const changes = ['name', 'position', 'phone'].filter((f) => p[f] && p[f] !== String(k[f] || '')).map((f) => ({ field: f, from: k[f] || '', to: p[f] }));
      return { ...out, status: changes.length ? 'update' : 'same', contactId: Number(k.id), changes,
        company: { state: 'person', id: Number(k.company_id), name: k.company, how: 'already a contact here' } };
    }
    const company = companyFor(p, F);
    if (company.state === 'none') return { ...out, status: 'fix', why: 'no company, and the email does not point to one', company };
    return { ...out, company };
  });
  const counts = { new: 0, update: 0, same: 0, fix: 0 };
  for (const r of rows) counts[r.status] += 1;
  return { rows, counts };
}

/**
 * APPLY: picks = { [i]: companyId | 'new' | 'skip' } for the rows whose company is to choose or new (new rows default to
 * their found company or a new one). Returns { added, updated, newCompanies, skipped }.
 */
export async function importApply(db, input, picks, actor) {
  const P = await importPreview(db, input);
  const F = await facts(db);
  const choose = (r) => {
    const v = picks ? picks[r.i] ?? picks[String(r.i)] : undefined;
    if (v === 'skip') return { skip: true };
    if (r.company.state === 'found' && (v === undefined || Number(v) === r.company.id)) return { id: r.company.id };
    if (v === 'new' || (v === undefined && r.company.state === 'new')) return { newName: r.company.newName || r.person.company };
    if (v !== undefined && F.byId.has(Number(v))) return { id: Number(v) };
    if (r.company.state === 'found') return { id: r.company.id };
    return { missing: true };
  };
  const plan = P.rows.filter((r) => r.status === 'new').map((r) => ({ r, c: choose(r) }));
  const missing = plan.find((x) => x.c.missing);
  if (missing) throw new TcInputError(`Row ${missing.r.i + 1} (${missing.r.person.name || missing.r.person.email}): pick its company.`);
  const at = nowIso();
  return db.transaction(async (tx) => {
    const made = new Map();   // one new company per name in the file
    let added = 0, updated = 0, skipped = 0;
    for (const { r, c } of plan) {
      if (c.skip) { skipped += 1; continue; }
      let companyId = c.id;
      if (!companyId) {
        const key = nameKey(c.newName) || String(c.newName).toLowerCase();
        if (!made.has(key)) {
          const res = await tx.prepare(`INSERT INTO tc_companies (name, name_key, country, status, source, created_at, created_by) VALUES (?,?,?,?,?,?,?)`)
            .run(clip(c.newName, 200), key, r.person.country || null, TC.defaults.noStatus, 'import', at, actor);
          const id = Number(res.lastInsertRowid);
          await logTcActivity(tx, id, { kind: 'create', body: 'Company added (import people from a file)', actor, at });
          made.set(key, id);
        }
        companyId = made.get(key);
      }
      const p = r.person;
      const res = await tx.prepare(`INSERT INTO tc_company_contacts (company_id, name, position, email, phone, notes, source, created_at, created_by) VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(companyId, p.name || null, p.position || null, p.email || null, p.phone || null, p.notes || null, 'import', at, actor);
      await logTcActivity(tx, companyId, { kind: 'edit', field: 'contact', old: null, new: p.name || p.email || p.phone, body: 'Contact added (import people from a file)', actor, at,
        contactId: Number(res.lastInsertRowid) });
      added += 1;
    }
    for (const r of P.rows.filter((x) => x.status === 'update')) {
      if (picks && (picks[r.i] === 'skip' || picks[String(r.i)] === 'skip')) { skipped += 1; continue; }
      for (const ch of r.changes) {
        await tx.prepare(`UPDATE tc_company_contacts SET ${ch.field} = ?, updated_at = ? WHERE id = ?`).run(ch.to, at, r.contactId);
        await logTcActivity(tx, r.company.id, { kind: 'edit', field: 'contact_' + ch.field, old: ch.from || null, new: ch.to, actor, at, contactId: r.contactId, body: 'Changed by import people from a file' });
      }
      updated += 1;
    }
    return { added, updated, newCompanies: made.size, skipped, same: P.counts.same, fix: P.counts.fix };
  });
}
