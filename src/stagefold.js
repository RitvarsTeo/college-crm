// THE CONTRACT STAGE IS GONE (Q75, decided by the owner 07.10.2026, KISS list). The stages are New,
// Contacted, Follow-up, Submitted application, then Admitted / Not proceeding. "Submitted application"
// is the old Application stage with a new LABEL: the stored key stays 'Application', so no person,
// event, report or SIS mapping that already says 'Application' changes meaning.
//
// Everybody still at 'Contract' moves into 'Application' once, at boot, with a status line on their
// timeline that says why. Idempotent: it only touches people whose status is still 'Contract', so a
// second boot moves nobody. contract_at is kept: it is the date the contract happened, and stays history.

import { logEvent, AUTOMATIC } from './history.js';
import { planFormCheck, FORM_CHECK, SIS_STAGE } from './sync.js';

export { FORM_CHECK };

export const REMOVED = 'Contract';
export const INTO = 'Application';
export const WHY = 'moved: Contract stage removed (07.10)';

export async function foldContractStage(db, { now = new Date().toISOString(), into = INTO, intoLabel = 'Submitted application' } = {}) {
  return db.transaction(async (tx) => {
    // several instances can boot at once on one database; the second waits and then finds nobody
    if (tx.kind === 'pg') await tx.query('SELECT pg_advisory_xact_lock(7240075)');
    const rows = await tx.prepare('SELECT id FROM people WHERE status = ? ORDER BY id').all(REMOVED);
    for (const r of rows) {
      await tx.prepare('UPDATE people SET status = ? WHERE id = ? AND status = ?').run(into, r.id, REMOVED);
      await logEvent(tx, { personId: r.id, kind: 'status', direction: 'note', at: now, origin: AUTOMATIC, actor: 'Intake',
        subject: `Status: ${REMOVED} -> ${intoLabel}`, body: WHY, field: 'status', oldValue: REMOVED, newValue: into });
    }
    return { moved: rows.length };
  });
}

// ONLY A SUBMITTED APPLICATION COUNTS, FOR THE PEOPLE ALREADY THERE TOO (07.10.2026: Ritvars, popup "Yes,
// both"; MASTER CONTROL's spec). A person at Application whose ONLY reason is an SIS registered/started
// record (no submitted or later record, no move to Application by a person) goes back once to the stage
// the SIS moved them from, with a line on their history and the call step. The earlier stage comes from
// their history; a person the SIS created straight at Application had none, and goes to the first stage,
// where the rule now creates them; anybody else without one goes to Contacted. Idempotent: once moved,
// nobody is at Application any more.
export const WHY_SIS = 'moved: only a submitted application counts (07.10)';
export const FOLD_MARK = 'fold_sis_only_application_2026_10_07';
export async function foldSisOnlyApplication(db, { now = new Date().toISOString(), into = INTO, labelOf = (id) => id,
  first = 'New', fallback = 'Contacted' } = {}) {
  return db.transaction(async (tx) => {
    if (tx.kind === 'pg') await tx.query('SELECT pg_advisory_xact_lock(7240076)');
    // ONE-TIME: after the first run a marker in sync_state says so, and every later boot does nothing
    const done = await tx.prepare('SELECT ran_at FROM sync_state WHERE name = ?').get(FOLD_MARK);
    if (done) return { moved: 0, already: done.ran_at };
    const people = await tx.prepare(`SELECT DISTINCT pe.id, pe.first_channel FROM people pe JOIN sis_applicants sa ON sa.person_id = pe.id
      WHERE pe.status = ? ORDER BY pe.id`).all(into);
    let moved = 0;
    for (const p of people) {
      const rows = await tx.prepare('SELECT status FROM sis_applicants WHERE person_id = ?').all(p.id);
      if (rows.some((r) => SIS_STAGE[r.status]) || !rows.some((r) => ['registered', 'started'].includes(r.status))) continue;
      // only the SIS put them there: any move to Application by a person, or by a step somebody completed
      // (logged by Intake), means a human acted, and they stay
      const other = await tx.prepare(`SELECT COUNT(*) n FROM events WHERE person_id = ? AND kind = 'status' AND new_value = ?
        AND (origin = 'manual' OR actor IS NULL OR actor <> 'SIS')`).get(p.id, into);
      if (Number(other.n)) continue;
      const last = await tx.prepare(`SELECT old_value FROM events WHERE person_id = ? AND kind = 'status' AND new_value = ?
        AND old_value IS NOT NULL ORDER BY occurred_at DESC, id DESC LIMIT 1`).get(p.id, into);
      const back = (last && last.old_value && last.old_value !== into) ? last.old_value : p.first_channel === 'sis' ? first : fallback;
      await tx.prepare('UPDATE people SET status = ? WHERE id = ? AND status = ?').run(back, p.id, into);
      await logEvent(tx, { personId: p.id, kind: 'status', direction: 'note', at: now, origin: AUTOMATIC, actor: 'Intake',
        subject: `Status: ${labelOf(into)} -> ${labelOf(back)}`, body: WHY_SIS, field: 'status', oldValue: into, newValue: back });
      await planFormCheck(tx, p.id, now);
      moved++;
    }
    await tx.prepare(`INSERT INTO sync_state (name, value, ran_at, detail) VALUES (?,?,?,?)
      ON CONFLICT (name) DO NOTHING`).run(FOLD_MARK, String(moved), now, JSON.stringify({ moved }));
    return { moved };
  });
}
