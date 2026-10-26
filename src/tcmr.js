// HOW OUR CLIENTS CHANGED (26.10.2026): the owner's management review in Intake, his picks: the simplest page, questions
// as headings, the review's people per year next to the TC Excel's, the year table with Growing / Fewer, a card on each
// company, the Piemeri Profesiju motion.
//
// The yearly management review (5_Form_Management_review.xlsx) holds, per business client and year, 6.4 the client's
// rating of us (1-5) and 6.5 how many people they sent. It is loaded as rows (review name, year, trainees, rating); each
// review name is matched to an Intake company once (the same name, or one word that only one company carries), else it
// stays a name with no link. Pure data functions; every one takes the database first.

import { TC, TcInputError, nameKey } from './tc.js';

const FIRST = 2019;
const GROW = 1.2, FEWER = 0.8;   // more than a fifth up or down against the year before

const clean = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').slice(0, 200);
const key = (s) => String(nameKey(s) || '').replace(/\b(sia|ltd|as|bv|b v|gmbh|uab|oy|ab|llc|inc|co|limited|company|group|management|shipmanagement|shipping|services?)\b/g, ' ')
  .replace(/\s+/g, ' ').trim();

/** The one Intake company a review name clearly is, or null. */
function matchName(name, companies) {
  const k = key(name);
  if (!k) return null;
  const exact = companies.filter((c) => c.k === k);
  if (exact.length === 1) return exact[0].id;
  if (exact.length > 1) return null;
  const word = companies.filter((c) => (' ' + c.k + ' ').includes(' ' + k + ' '));
  return word.length === 1 ? word[0].id : null;
}

/**
 * Load the review: rows [{ name, year, trainees, rating }]. Without apply it only counts; with apply it writes in one
 * transaction (a row of the same name and year takes the newer figures) and matches every new name once. A name already
 * matched by hand keeps its company.
 */
export async function mrLoad(db, rows, actor, { apply = false } = {}) {
  const seen = new Set();
  const list = rows.map((r, i) => {
    const name = clean(r.name), year = Number(r.year);
    if (!name) throw new TcInputError(`Row ${i + 1} has no company name.`);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new TcInputError(`Row ${i + 1}: the year is not a year.`);
    const k = name + '|' + year;
    if (seen.has(k)) throw new TcInputError(`${name} ${year} is twice.`);
    seen.add(k);
    const t = r.trainees === null || r.trainees === undefined || r.trainees === '' ? null : Math.round(Number(r.trainees));
    const rt = r.rating === null || r.rating === undefined || r.rating === '' ? null : Number(r.rating);
    if (t !== null && (!Number.isFinite(t) || t < 0)) throw new TcInputError(`${name} ${year}: trainees is not a number.`);
    if (rt !== null && (!Number.isFinite(rt) || rt < 0 || rt > 5)) throw new TcInputError(`${name} ${year}: the rating is not 0-5.`);
    return { name, year, trainees: t, rating: rt };
  });
  const companies = (await db.prepare('SELECT id, name FROM tc_companies WHERE archived_at IS NULL').all()).map((c) => ({ id: Number(c.id), k: key(c.name) }));
  const known = new Map((await db.prepare('SELECT review_name, company_id, matched_by FROM tc_mr_names').all()).map((r) => [r.review_name, r]));
  const names = [...new Set(list.map((r) => r.name))];
  const match = new Map(names.map((n) => [n, known.has(n) ? (known.get(n).company_id ? Number(known.get(n).company_id) : null) : matchName(n, companies)]));
  const counts = { rows: list.length, names: names.length, matched: [...match.values()].filter(Boolean).length, years: [...new Set(list.map((r) => r.year))].sort() };
  if (!apply) return { counts };
  const at = new Date().toISOString();
  await db.transaction(async (tx) => {
    for (const r of list) {
      const old = await tx.prepare('SELECT id FROM tc_mr WHERE review_name = ? AND year = ?').get(r.name, r.year);
      if (old) await tx.prepare('UPDATE tc_mr SET trainees = ?, rating = ?, loaded_at = ?, loaded_by = ? WHERE id = ?').run(r.trainees, r.rating, at, actor, old.id);
      else await tx.prepare('INSERT INTO tc_mr (review_name, year, trainees, rating, loaded_at, loaded_by) VALUES (?,?,?,?,?,?)').run(r.name, r.year, r.trainees, r.rating, at, actor);
    }
    for (const n of names) {
      if (known.has(n)) continue;
      await tx.prepare('INSERT INTO tc_mr_names (review_name, company_id, matched_by) VALUES (?,?,?)').run(n, match.get(n), match.get(n) ? 'auto' : null);
    }
  });
  return { counts, applied: true };
}

const trendOf = (s, last) => {
  const a = s[last], b = s[last - 1];
  if (!a || !b) return '';
  return a > b * GROW ? 'grow' : a < b * FEWER ? 'fewer' : '';
};

/**
 * The Client book chapter: { years, review: {y: n}, excel: {y: n}, repeats: [y], rows: [{ name, companyId, years: {y: n},
 * trend }], ratingAvg: {y: x} }. rows = the biggest business clients by their latest year (all with all=true).
 */
export async function trends(db, { all = false, limit = 12, excelByYear = {} } = {}) {
  const mr = await db.prepare('SELECT review_name, year, trainees, rating FROM tc_mr').all();
  if (!mr.length) return { years: [], rows: [] };
  const names = new Map((await db.prepare('SELECT review_name, company_id FROM tc_mr_names').all()).map((r) => [r.review_name, r.company_id ? Number(r.company_id) : null]));
  const coNames = new Map((await db.prepare('SELECT id, name FROM tc_companies WHERE archived_at IS NULL').all()).map((c) => [Number(c.id), c.name]));
  const ys = [...new Set(mr.map((r) => Number(r.year)))].filter((y) => y >= FIRST).sort();
  const last = ys[ys.length - 1];
  const review = {}, rated = {};
  const per = new Map();
  for (const r of mr) {
    const y = Number(r.year);
    if (y < FIRST) continue;
    if (r.trainees !== null && r.trainees !== undefined) {
      review[y] = (review[y] || 0) + Number(r.trainees);
      if (!per.has(r.review_name)) per.set(r.review_name, {});
      per.get(r.review_name)[y] = Number(r.trainees);
    }
    if (r.rating !== null && r.rating !== undefined) (rated[y] = rated[y] || []).push(Number(r.rating));
  }
  // a year whose table is the same as the year before (the 2023 review repeats 2022's)
  const sig = (y) => [...per.entries()].filter(([, s]) => s[y] !== undefined).map(([n, s]) => n + s[y]).sort().join('|');
  const repeats = ys.filter((y, i) => i > 0 && review[y] && sig(y) === sig(ys[i - 1]));
  const rows = [...per.entries()].map(([name, s]) => {
    const companyId = names.get(name) || null;
    return { name: companyId ? coNames.get(companyId) || name : name, companyId, years: s, trend: trendOf(s, last), latest: s[last] || 0, top: Math.max(...Object.values(s)) };
  }).sort((a, b) => b.latest - a.latest || b.top - a.top || a.name.localeCompare(b.name, 'lv'));
  const ratingAvg = Object.fromEntries(Object.entries(rated).map(([y, v]) => [y, Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 100) / 100]));
  const excel = Object.fromEntries(ys.map((y) => [y, Number(excelByYear[y] || 0)]));
  return { years: ys, last, review, excel, repeats, ratingAvg, total: rows.length,
    counts: { grow: rows.filter((r) => r.trend === 'grow').length, fewer: rows.filter((r) => r.trend === 'fewer').length },
    rows: all ? rows : rows.slice(0, Math.max(1, Number(limit) || 12)) };
}

/** One company's card: { years: {y: n}, rating: [{ year, rating }] } from every review name matched to it. */
export async function companyMr(db, companyId) {
  const rows = await db.prepare(`SELECT m.year, m.trainees, m.rating FROM tc_mr m JOIN tc_mr_names n ON n.review_name = m.review_name
    WHERE n.company_id = ? AND m.year >= ?`).all(Number(companyId), FIRST);
  const years = {}, rate = {};
  for (const r of rows) {
    if (r.trainees !== null && r.trainees !== undefined) years[r.year] = (years[r.year] || 0) + Number(r.trainees);
    if (r.rating !== null && r.rating !== undefined) (rate[r.year] = rate[r.year] || []).push(Number(r.rating));
  }
  const rating = Object.entries(rate).map(([y, v]) => ({ year: Number(y), rating: Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 100) / 100 })).sort((a, b) => b.year - a.year);
  return { years, rating };
}
export const _test = { matchName, key, trendOf };
