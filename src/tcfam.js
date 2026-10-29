// COMPANY FAMILIES (28.10.2026): the owner's Client Hub pick 5, layout B "suggest + confirm". Intake suggests families
// (companies sharing a web domain, or the first word of their name); a person confirms one, picks the parent and leaves
// out any company that does not belong, or answers Not a family. A family is one parent and its companies, one level;
// a company is in one family at most. Nothing merges: every company keeps its page, people, log and delegates, and the
// family only links them. Unlink takes a company out; taking the parent out ends the family. Nothing is deleted.
// Pure data functions; every one takes the database first.

import { TcInputError, nameKey, isTotalRow } from './tc.js';

const nowIso = () => new Date().toISOString();
// words that say what kind of company it is, not which one (a family is never "SIA" or "Global Ltd")
const FORM = new Set(['sia', 'uab', 'as', 'a', 's', 'oy', 'ab', 'ltd', 'llc', 'gmbh', 'bv', 'b', 'v', 'nv', 'jsc', 'ooo', 'oao', 'zao', 'the', 'plc', 'inc',
  'co', 'sa', 'spa', 'srl', 'aps', 'asa', 'kg', 'ag', 'pte', 'pty', 'sp', 'z', 'o', 'oü', 'ou', 'pas', 'akciju', 'sabiedriba']);
const firstWord = (name) => String(nameKey(name) || '').split(' ').find((w) => w.length >= 3 && !FORM.has(w)) || '';
const webOf = (extra) => { try { const x = JSON.parse(extra || '{}'); return String(x.web_domain || '').trim().toLowerCase().replace(/^www\./, ''); } catch (e) { return ''; } };

async function active(db) {
  const members = await db.prepare(`SELECT m.family_id, m.company_id, f.parent_id FROM tc_family_members m JOIN tc_families f ON f.id = m.family_id
    WHERE m.ended_at IS NULL AND f.ended_at IS NULL`).all();
  return members.map((m) => ({ familyId: Number(m.family_id), companyId: Number(m.company_id), parentId: Number(m.parent_id) }));
}
async function facts(db) {
  // only the web domain out of the Excel's extra facts, read in the database (the owner's pick "TC pages lighter",
  // 29.10.2026: the whole extra text of every company was 0.3 MB a page); never fails on text that is not JSON
  const web = db.kind === 'pg' ? `substring(extra from '"web_domain": *"([^"]*)"')`
    : `CASE WHEN json_valid(extra) THEN json_extract(extra, '$.web_domain') END`;
  const cos = await db.prepare(`SELECT id, name, country, ${web} AS web_domain FROM tc_companies WHERE archived_at IS NULL`).all();
  const people = new Map(); for (const k of await db.prepare('SELECT company_id FROM tc_company_contacts WHERE archived_at IS NULL').all()) people.set(Number(k.company_id), (people.get(Number(k.company_id)) || 0) + 1);
  const del = new Map(); for (const k of await db.prepare('SELECT company_id, attendees FROM tc_company_courses').all()) del.set(Number(k.company_id), (del.get(Number(k.company_id)) || 0) + (Number(k.attendees) || 0));
  return cos.map((c) => ({ id: Number(c.id), name: c.name, country: c.country || '', web: String(c.web_domain || '').trim().toLowerCase().replace(/^www\./, ''), word: firstWord(c.name), total: isTotalRow(c.country),
    people: people.get(Number(c.id)) || 0, delegates: del.get(Number(c.id)) || 0 }));
}
const member = (c, parentId) => ({ id: c.id, name: c.name, country: c.country, people: c.people, delegates: c.delegates, parent: c.id === parentId });

/** Each company in a family: companyId -> { name, n } (the family's name is its parent's). For the Companies list. */
export async function familyIndex(db) {
  const a = await active(db);
  if (!a.length) return new Map();
  const names = new Map((await db.prepare('SELECT id, name FROM tc_companies').all()).map((c) => [Number(c.id), c.name]));
  const size = new Map(); for (const m of a) size.set(m.familyId, (size.get(m.familyId) || 0) + 1);
  return new Map(a.map((m) => [m.companyId, { name: names.get(m.parentId) || '', n: size.get(m.familyId) }]));
}

/** The suggestions still to look at, web domain ones first, then the bigger ones: { total, rows: [{ key, label, why, members }] }. */
export async function suggestions(db, { limit = 20 } = {}) {
  const inFamily = new Set((await active(db)).map((m) => m.companyId));
  const dismissed = new Set((await db.prepare('SELECT suggestion FROM tc_family_dismissed').all()).map((r) => r.suggestion));
  const free = (await facts(db)).filter((c) => !c.total && !inFamily.has(c.id));
  const group = (keyOf) => { const g = new Map(); for (const c of free) { const k = keyOf(c); if (!k) continue; if (!g.has(k)) g.set(k, []); g.get(k).push(c); } return g; };
  const out = [];
  for (const [d, list] of group((c) => c.web)) if (list.length >= 2 && !dismissed.has('web:' + d)) out.push({ key: 'web:' + d, label: d, why: 'same web domain', members: list });
  const seen = new Set(out.flatMap((s) => s.members.map((c) => c.id)));
  for (const [w, list] of group((c) => c.word)) {
    if (list.length < 2 || dismissed.has('name:' + w) || list.every((c) => seen.has(c.id))) continue;
    out.push({ key: 'name:' + w, label: w.charAt(0).toUpperCase() + w.slice(1), why: 'same name start', members: list });
  }
  out.sort((a, b) => (a.why === b.why ? 0 : a.why === 'same web domain' ? -1 : 1) || b.members.length - a.members.length || a.label.localeCompare(b.label, 'lv'));
  return { total: out.length, rows: out.slice(0, Math.max(1, Number(limit) || 20)).map((s) => ({ ...s,
    members: s.members.sort((a, b) => b.people - a.people || a.name.localeCompare(b.name, 'lv')).map((c) => member(c, null)) })) };
}

/** The confirmed families, A to Z: [{ id, name, parentId, companies, people, delegates }]. */
export async function familiesList(db) {
  const a = await active(db);
  const F = new Map((await facts(db)).map((c) => [c.id, c]));
  const fams = new Map();
  for (const m of a) {
    if (!fams.has(m.familyId)) fams.set(m.familyId, { id: m.familyId, parentId: m.parentId, name: (F.get(m.parentId) || {}).name || '', companies: 0, people: 0, delegates: 0 });
    const f = fams.get(m.familyId), c = F.get(m.companyId) || { people: 0, delegates: 0 };
    f.companies += 1; f.people += c.people; f.delegates += c.delegates;
  }
  return [...fams.values()].sort((x, y) => x.name.localeCompare(y.name, 'lv'));
}

/** One company's family, for its page: { id, name, parentId, members (parent first), people, delegates } or null. */
export async function familyOf(db, companyId) {
  const a = await active(db);
  const mine = a.find((m) => m.companyId === Number(companyId));
  if (!mine) return null;
  const F = new Map((await facts(db)).map((c) => [c.id, c]));
  const members = a.filter((m) => m.familyId === mine.familyId).map((m) => F.get(m.companyId)).filter(Boolean)
    .map((c) => member(c, mine.parentId)).sort((x, y) => Number(y.parent) - Number(x.parent) || x.name.localeCompare(y.name, 'lv'));
  return { id: mine.familyId, name: (F.get(mine.parentId) || {}).name || '', parentId: mine.parentId, members,
    people: members.reduce((n, c) => n + c.people, 0), delegates: members.reduce((n, c) => n + c.delegates, 0) };
}

/** Confirm a family: the parent and the companies that belong (the parent is one of them). */
export async function confirmFamily(db, b, actor) {
  const parentId = Number(b.parentId);
  const ids = [...new Set([].concat(b.memberIds || []).map(Number).filter(Boolean))];
  if (!ids.includes(parentId)) throw new TcInputError('Pick the parent among the companies.');
  if (ids.length < 2) throw new TcInputError('A family needs at least two companies.');
  const F = new Map((await facts(db)).map((c) => [c.id, c]));
  if (ids.some((id) => !F.has(id))) throw new TcInputError('One of the companies is no longer in Intake.');
  const taken = new Set((await active(db)).map((m) => m.companyId));
  const busy = ids.filter((id) => taken.has(id));
  if (busy.length) throw new TcInputError(`${F.get(busy[0]).name} is already in a family.`);
  const at = nowIso();
  return db.transaction(async (tx) => {
    const r = await tx.prepare('INSERT INTO tc_families (parent_id, suggestion, created_at, created_by) VALUES (?,?,?,?)').run(parentId, String(b.suggestion || '').slice(0, 200) || null, at, actor);
    const fid = Number(r.lastInsertRowid);
    for (const id of ids) await tx.prepare('INSERT INTO tc_family_members (family_id, company_id, added_at, added_by) VALUES (?,?,?,?)').run(fid, id, at, actor);
    return { id: fid };
  });
}

/** Not a family: the suggestion is not shown again. */
export async function dismissSuggestion(db, key, actor) {
  const k = String(key || '').slice(0, 200);
  if (!/^(web|name):./.test(k)) throw new TcInputError('Which suggestion?');
  if (!(await db.prepare('SELECT id FROM tc_family_dismissed WHERE suggestion = ?').get(k))) {
    await db.prepare('INSERT INTO tc_family_dismissed (suggestion, dismissed_at, dismissed_by) VALUES (?,?,?)').run(k, nowIso(), actor);
  }
  return { dismissed: k };
}

/** Take a company out of its family; the parent out (or one company left) ends the family. */
export async function unlinkCompany(db, companyId, actor) {
  const a = await active(db);
  const m = a.find((x) => x.companyId === Number(companyId));
  if (!m) throw new TcInputError('This company is not in a family.');
  const at = nowIso();
  const left = a.filter((x) => x.familyId === m.familyId && x.companyId !== m.companyId);
  return db.transaction(async (tx) => {
    if (m.companyId === m.parentId || left.length < 2) {
      await tx.prepare('UPDATE tc_family_members SET ended_at = ?, ended_by = ? WHERE family_id = ? AND ended_at IS NULL').run(at, actor, m.familyId);
      await tx.prepare('UPDATE tc_families SET ended_at = ?, ended_by = ? WHERE id = ?').run(at, actor, m.familyId);
      return { ended: m.familyId };
    }
    await tx.prepare('UPDATE tc_family_members SET ended_at = ?, ended_by = ? WHERE family_id = ? AND company_id = ? AND ended_at IS NULL').run(at, actor, m.familyId, m.companyId);
    return { unlinked: m.companyId };
  });
}
export const _test = { firstWord, webOf };
