// A TEST OR STAFF RECORD IS NOT AN APPLICANT (the owner, 05.11.2026, on "Test New Student · Admitted 2026-10-29" in the
// admitted students report: "A BUG LIKE THIS SHOULD NEVER BE ACCOUNTED FOR IN STATS!"). The SIS made that record itself
// (test.newstudent@novikontas.org). ONE rule, for every figure and every list the figures open: a person whose email is
// on our own domain (novikontas.org / .lv / .com / ...) or whose name is "Test ..." is left out. The record stays and
// opens by its own link; nothing is deleted.

export const testPersonSql = (a) => `(LOWER(COALESCE(${a}.email, '')) LIKE '%@novikontas.%'
  OR LOWER(TRIM(${a}.name)) LIKE 'test %' OR LOWER(TRIM(${a}.name)) = 'test')`;
/** people without the test and staff records, for a FROM or a JOIN: `FROM ${REAL_PEOPLE} pe` */
export const REAL_PEOPLE = `(SELECT * FROM people WHERE NOT ${testPersonSql('people')})`;
export const isTestPerson = (p) => Boolean(p) && (/@novikontas\./i.test(String(p.email || ''))
  || /^test( |$)/i.test(String(p.name || '').trim()));
