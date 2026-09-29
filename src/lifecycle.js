// LIFECYCLE FACTS: things that HAPPENED to a person on the way to studying here, kept apart from
// the Journey stages. A stage is where we have them; a fact is a dated event from a system that
// knows it. Two facts, asked for by Aigars (29.09.2026):
//
//   form_started   "Application form started"
//   matriculated   "Matriculated"
//
// They are NOT stages and never move anybody on the Journey. Nothing here invents one: a fact is
// written only when a source record says it, and it is written once.
//
// THE SOURCE is the SIS applicant feed (Novikontas-CRM-API.md, the SIS team's own document,
// 28.09.2026). Fetching it - the Bearer token, since/cursor paging, the 5-minute run - is the
// channels work on branch channels-pbx-sis (lib/sis.js, src/sync.js). That sync calls
// recordSisLifecycle() below for every SIS row it links to a person. The token never reaches this
// file.
//
// ======================================================================== THE MAPPING =======
// The document lists `status`: registered | started | submitted | admitted | rejected |
// withdrawn | matriculated, and three times: registeredAt, submittedAt, changedAt. The FIRST REAL
// REPLY (29.09.2026: 6 applicants, registered 4 / submitted 1 / matriculated 1) has exactly those
// fields: NO "startedAt" and NO "matriculatedAt".
//   - matriculated  = a row whose status IS 'matriculated' (CONFIRMED: seen in the real reply),
//                     dated by changedAt
//   - form_started  = a row whose status IS 'started', dated by changedAt; OR a row already past it
//                     that has a submittedAt, dated by submittedAt (Ritvars, 29.09.2026: "Yes, by
//                     submit date"). A registered-only row has no application and writes nothing.
// EVERY SIS DATE IS A "BY" DATE: changedAt and submittedAt come AFTER the moment itself, never
// before it, so the screen says "by <date>" - true, and never more exact than the SIS is.
// 'started' is still PROVISIONAL: no real record has had it yet. To change the mapping, change
// SIS_LIFECYCLE_MAP and its tests, nothing else.
// ============================================================================================

export const LIFECYCLE_FACTS = {
  form_started: 'Application form started',
  matriculated: 'Matriculated',
};

export const SIS_LIFECYCLE_MAP = {
  provisional: true,          // 'started' not yet seen in a real reply; 'matriculated' confirmed 29.09
  form_started: { when: (r) => r.status === 'started' || (r.status !== 'registered' && Boolean(r.submitted_at)),
    at: (r) => (r.status === 'started' ? r.changed_at : r.submitted_at) },
  matriculated: { when: (r) => r.status === 'matriculated', at: (r) => r.changed_at },
};

const ISO = (v) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);

/** Which facts one SIS row (lib/sis.js toSisRow shape: status, changed_at, reference,
 *  application_id) states, with their dates. Pure. */
export function sisFacts(row, map = SIS_LIFECYCLE_MAP) {
  if (!row || !row.reference) return [];
  const out = [];
  for (const fact of Object.keys(LIFECYCLE_FACTS)) {
    const rule = map[fact];
    if (!rule || !rule.when(row)) continue;
    const at = ISO(rule.at(row));
    if (!at) continue;                                  // no date in the record: no fact
    out.push({ fact, occurredAt: at, sourceRef: `${row.reference}:${row.application_id || ''}` });
  }
  return out;
}

/** Writes the facts one SIS row states for this person. Idempotent: the same row, or the same
 *  status seen again on a later run, writes nothing new (one fact per person, fact and SIS
 *  application). Returns how many were new. */
export async function recordSisLifecycle(db, personId, row, { now = new Date() } = {}) {
  if (!personId) return 0;
  let added = 0;
  for (const f of sisFacts(row)) {
    const r = await db.prepare(`INSERT INTO lifecycle_events (person_id, fact, source, source_ref, occurred_at, recorded_at)
      VALUES (?, ?, 'sis', ?, ?, ?) ON CONFLICT (person_id, fact, source, source_ref) DO NOTHING`)
      .run(personId, f.fact, f.sourceRef, f.occurredAt, now.toISOString());
    if (r && r.changes) added += Number(r.changes);
  }
  return added;
}

/** The facts for one person, earliest date per fact, in the order of LIFECYCLE_FACTS. */
export async function lifecycleOf(db, personId) {
  const rows = await db.prepare(`SELECT fact, MIN(occurred_at) occurred_at FROM lifecycle_events
    WHERE person_id = ? GROUP BY fact`).all(personId);
  const by = Object.fromEntries(rows.map((r) => [r.fact, r.occurred_at]));
  return Object.keys(LIFECYCLE_FACTS).filter((f) => by[f])
    .map((f) => ({ fact: f, label: LIFECYCLE_FACTS[f], at: by[f], source: 'SIS' }));
}
