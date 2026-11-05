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
export function countPeople(rows) {
  const list = rows || [];
  const parent = list.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  const seen = new Map();
  const join = (k, i) => { if (!seen.has(k)) seen.set(k, i); else { const a = find(seen.get(k)), b = find(i); if (a !== b) parent[b] = a; } };
  list.forEach((p, i) => {
    const n = nameKey(p.name); if (n.includes(' ')) join('n:' + n, i);
    const e = String(p.email || '').trim().toLowerCase(); if (e) join('e:' + e, i);
    const ph = phoneKey(p.phone); if (ph) join('p:' + ph, i);
  });
  return new Set(list.map((_, i) => find(i))).size;
}
