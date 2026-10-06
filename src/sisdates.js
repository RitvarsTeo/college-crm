// THE SIS'S OWN DATE (Ritvars, 06.10.2026). On 05.10 the SIS loaded 503 existing students, status
// matriculated, with their real SIS dates from 2012 to 2026. The daily pull of 06.10 made 489 Intake
// people out of them, all Admitted ON THE DAY THE PULL RAN, so Home's "Admitted 2026" read 569 against
// a target of 140. His words:
//   - "Re-date the 489 to their real SIS date. The 49 whose SIS date is in 2026 count as 2026 admissions."
//   - "From now on the pull uses the record's real date, never the day the pull ran."
//   - "Have to be sure, which one to not make a recycle bin": only a record the SIS clearly dates becomes
//     a person. A record with no usable date is stored in sis_applicants and counted, nothing more.
//
// THE DATE. For an admitted or matriculated SIS record: the SIS's own admission/matriculation date if it
// ever sends one (admitted_on, lib/sis.js), else submittedAt, the one dated step the contract has.
// NEVER changedAt (the bulk load changed every record on 05.10) and NEVER the time of the pull.
// A person with several admitted applications takes the latest of them: that is the admission they are
// in now.
//
// THE RE-DATE below corrects the people the old pull already made. It touches only a person who carries
// the old pull's fingerprint, and nobody else:
//   first_channel 'sis'            the SIS created them (a person somebody already had is never touched)
//   status Admitted                still where the pull put them
//   admitted_at on a pull day      (2026-10-06 by default, Riga day)
//   admitted_at = recorded_at of one of their own SIS lifecycle facts: the old code stamped both with the
//                                  same instant, the run's own clock. A date a human set never matches it.
//   an admitted/matriculated row in sis_applicants linked to them
// Once re-dated the fingerprint is gone, so a second run finds nobody: idempotent by construction.

import { logEvent, MANUAL } from './history.js';
import { localDate, dayStartOf, dayAfterStartOf } from './bizday.js';

export const ADMITTED_STATUSES = ['admitted', 'matriculated'];
export const PULL_DAYS = ['2026-10-06'];

const iso = (v) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);

/** The SIS's own admission date for one person, from their stored SIS rows, or null when the SIS does
 *  not clearly date it. Pure. */
export function sisAdmissionDate(rows) {
  const dates = (rows || []).filter((r) => r && ADMITTED_STATUSES.includes(r.status))
    .map((r) => iso(r.admitted_on) || iso(r.submitted_at)).filter(Boolean).sort();
  return dates.length ? dates[dates.length - 1] : null;
}

const yearOf = (at) => localDate(at).slice(0, 4);
const add = (o, k) => { o[k] = (o[k] || 0) + 1; return o; };
const sortKeys = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

async function rowsOf(db, personId) {
  return db.prepare('SELECT status, submitted_at, admitted_on FROM sis_applicants WHERE person_id = ?').all(personId);
}

// The people one pull day made Admitted on the pull's clock. `created` = made by the SIS; otherwise the
// people somebody already had, whom the same pull moved on (reported, never touched).
async function stampedOn(db, day, created) {
  return db.prepare(`SELECT pe.id, pe.admitted_at, pe.created_at FROM people pe
    WHERE ${created ? "pe.first_channel = 'sis'" : "(pe.first_channel IS NULL OR pe.first_channel <> 'sis')"}
      AND pe.status = 'Admitted' AND pe.admitted_at >= ? AND pe.admitted_at < ?
      AND EXISTS (SELECT 1 FROM sis_applicants sa WHERE sa.person_id = pe.id
        AND sa.status IN ('${ADMITTED_STATUSES.join("','")}'))
      AND EXISTS (SELECT 1 FROM lifecycle_events le WHERE le.person_id = pe.id AND le.source = 'sis'
        AND le.recorded_at = pe.admitted_at)
    ORDER BY pe.id`).all(dayStartOf(day), dayAfterStartOf(day));
}

/** Re-dates the people the SIS pull made Admitted on the day it ran. Dry run unless `apply` is true:
 *  the dry run only reads. Answers counts, never a person. */
export async function redateSisAdmissions(db, { apply = false, by = null, days = PULL_DAYS, now = new Date() } = {}) {
  if (apply && !by) return { ok: false, error: 'who is running the re-date?' };
  const list = [...new Set((days || []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d))))];
  if (!list.length) return { ok: false, error: 'days must be YYYY-MM-DD' };

  const plan = [];
  const noDate = [];
  const others = { count: 0, byYear: {}, noDate: 0 };
  for (const day of list) {
    for (const p of await stampedOn(db, day, true)) {
      const at = sisAdmissionDate(await rowsOf(db, p.id));
      (at ? plan : noDate).push({ ...p, to: at });
    }
    for (const p of await stampedOn(db, day, false)) {
      const at = sisAdmissionDate(await rowsOf(db, p.id));
      others.count++;
      if (at) add(others.byYear, yearOf(at)); else others.noDate++;
    }
  }
  const byYear = {};
  for (const p of plan) add(byYear, yearOf(p.to));
  const thisYear = yearOf(now);
  const out = {
    ok: true, apply: Boolean(apply), days: list,
    found: plan.length + noDate.length,
    byYear: sortKeys(byYear),
    moveToEarlierYears: plan.filter((p) => yearOf(p.to) < thisYear).length,
    stayThisYear: plan.filter((p) => yearOf(p.to) === thisYear).length,
    noDateLeft: noDate.length,
    // people Intake already had, moved to Admitted by the same pull: not part of this action
    notTouchedExistingPeople: { count: others.count, byYear: sortKeys(others.byYear), noDate: others.noDate },
    changed: 0,
  };
  if (!apply || !plan.length) return out;

  const stamp = now.toISOString();
  out.changed = await db.transaction(async (tx) => {
    let n = 0;
    for (const p of plan) {
      const created = p.created_at && p.created_at < p.to ? p.created_at : p.to;
      // the fingerprint again, inside the transaction: a person changed since the plan is left alone
      const r = await tx.prepare(`UPDATE people SET admitted_at = ?, created_at = ?
        WHERE id = ? AND admitted_at = ? AND status = 'Admitted'`).run(p.to, created, p.id, p.admitted_at);
      if (!(r && Number(r.changes ?? r.rowCount))) continue;
      await logEvent(tx, { personId: p.id, kind: 'note', direction: 'note', at: stamp, origin: MANUAL, actor: by,
        subject: `Admission date set from SIS: ${localDate(p.to)}`,
        body: `It was the day the SIS pull ran (${localDate(p.admitted_at)}). Arrival date ${localDate(created)}`
          + ` (was ${p.created_at ? localDate(p.created_at) : 'empty'}).`,
        field: 'admitted_at', oldValue: localDate(p.admitted_at), newValue: localDate(p.to) });
      n++;
    }
    return n;
  });
  return out;
}
