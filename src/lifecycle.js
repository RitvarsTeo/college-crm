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
// ================================================================= PROVISIONAL MAPPING ======
// The document lists `status`: registered | started | submitted | admitted | rejected |
// withdrawn | matriculated, and three times: registeredAt, submittedAt, changedAt. It has NO
// "startedAt" and NO "matriculatedAt". So, until one real SIS reply has been looked at:
//   - form_started  = a row whose status IS 'started'
//   - matriculated  = a row whose status IS 'matriculated'
//   - the date      = that row's changedAt (when the SIS record changed to that status)
// A row first seen as 'submitted' does NOT write form_started: the form was surely started, but
// the SIS does not say when, and a made-up date is worse than none.
// To change the mapping once a real payload is seen, change SIS_LIFECYCLE_MAP and nothing else.
// ============================================================================================

export const LIFECYCLE_FACTS = {
  form_started: 'Application form started',
  matriculated: 'Matriculated',
};

export const SIS_LIFECYCLE_MAP = {
  provisional: true,
  form_started: { when: (r) => r.status === 'started', at: (r) => r.changed_at },
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
