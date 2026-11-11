// A TEST OR STAFF RECORD IS NOT AN APPLICANT (the owner, 05.11.2026, on "Test New Student · Admitted 2026-10-29" in the
// admitted students report: "A BUG LIKE THIS SHOULD NEVER BE ACCOUNTED FOR IN STATS!"; his pick (b) the same day). The
// SIS made that record itself (test.newstudent@novikontas.org). ONE rule, for every figure and every list the figures
// open: a person whose email is on our own domains (novikontas.org / .lv / .com / .lt / .eu) or whose name has the word
// "Test" is left out ("Testers" is a surname, not a test). The record stays and opens by its own link; nothing is deleted.
//
// ONE PERSON, ONE COUNT (his pick (c), 05.11.2026): the 168 Admitted 2026 records were 104 people - a student the
// Admissions sheet held AND the SIS made again. countPeople counts the people: records sharing a name (case, Latvian /
// Lithuanian letters and word order folded, two words at least), an email or a phone are one person.
import { nameKey, phoneKey } from './samepeople.js';

export const testPersonSql = (a) => `(LOWER(COALESCE(${a}.email, '')) LIKE '%@novikontas.%'
  OR LOWER(TRIM(${a}.name)) = 'test' OR LOWER(TRIM(${a}.name)) LIKE 'test %' OR LOWER(TRIM(${a}.name)) LIKE '% test'
  OR LOWER(TRIM(${a}.name)) LIKE '% test %')`;
/** people without the test and staff records, for a FROM or a JOIN: `FROM ${REAL_PEOPLE} pe` */
export const REAL_PEOPLE = `(SELECT * FROM people WHERE NOT ${testPersonSql('people')})`;
export const isTestPerson = (p) => Boolean(p) && (/@novikontas\./i.test(String(p.email || ''))
  || /(^|\s)test(\s|$)/i.test(String(p.name || '').trim()));

/** How many PEOPLE these records are: one person however many records share a name, an email or a phone. */
export function countPeople(rows) { return peopleGroups(rows).length; }

/** The records grouped by person (the same rule as countPeople): one array of records per person. */
export function peopleGroups(rows) {
  const list = rows || [];
  const parent = list.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  const seen = new Map();
  const join = (k, i) => { if (!seen.has(k)) seen.set(k, i); else { const a = find(seen.get(k)), b = find(i); if (a !== b) parent[b] = a; } };
  list.forEach((p, i) => {
    // a bracketed note ("(atsāk studijas)") or a second line (a parent's name) is no part of the person's name (11.11.2026)
    const n = nameKey(String(p.name ?? '').split('\n')[0].replace(/\([^)]*\)/g, ' ')); if (n.includes(' ')) join('n:' + n, i);
    const e = String(p.email || '').trim().toLowerCase(); if (e) join('e:' + e, i);
    const ph = phoneKey(p.phone); if (ph) join('p:' + ph, i);
  });
  const groups = new Map();
  list.forEach((p, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(p); });
  return [...groups.values()];
}

/** ARRIVED, BY WHERE THEY ARE NOW (the owner's pick A, 11.11.2026): the people among these arrived records, one id each,
 * split Open / Admitted / Not proceeding. A person with records in two places is where their furthest record is:
 * Admitted before an open stage, an open stage before Not proceeding. The three lists add up to countPeople(rows). */
export function arrivedByPlace(rows, { admitted = 'Admitted', closed = 'Not proceeding' } = {}) {
  const out = { open: [], admitted: [], closed: [] };
  for (const g of peopleGroups(rows)) {
    const a = g.find((p) => p.status === admitted), o = g.find((p) => p.status !== admitted && p.status !== closed);
    if (a) out.admitted.push(a.id); else if (o) out.open.push(o.id); else out.closed.push(g[0].id);
  }
  return out;
}
