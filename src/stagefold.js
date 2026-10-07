// THE CONTRACT STAGE IS GONE (Q75, decided by the owner 07.10.2026, KISS list). The stages are New,
// Contacted, Follow-up, Submitted application, then Admitted / Not proceeding. "Submitted application"
// is the old Application stage with a new LABEL: the stored key stays 'Application', so no person,
// event, report or SIS mapping that already says 'Application' changes meaning.
//
// Everybody still at 'Contract' moves into 'Application' once, at boot, with a status line on their
// timeline that says why. Idempotent: it only touches people whose status is still 'Contract', so a
// second boot moves nobody. contract_at is kept: it is the date the contract happened, and stays history.

import { logEvent, AUTOMATIC } from './history.js';

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
