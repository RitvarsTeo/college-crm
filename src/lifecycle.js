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

// ================================================================ WHERE THEY ARE IN THE SIS ====
// Ritvars, 29.09.2026: after the form is submitted it is the Student Coordinator's work, and
// Admissions has to see the step after it and whether it has happened, to nudge the student or the
// coordinator. Only the SIS's own statuses are used (Novikontas-CRM-API.md), in their order; the
// next step is simply the next status. Nothing is guessed beyond that.
export const SIS_ORDER = ['registered', 'started', 'submitted', 'admitted', 'matriculated'];

// HELD BY THE SIS (Ritvars, 01.10.2026 popup, A). A person the SIS itself created, at started or
// later there, has nothing for Admissions to do until the SIS moves them on: no task, and never
// counted in "No next step". Registered-only is still a lead with a step; a known lead who reaches
// the SIS stays as before; rejected or withdrawn is a human's to close, so they count again.
// One rule, used by every count (this) and by the page (cSisHolds in src/app.html).
// 07.10.2026 (Ritvars): 'started' is out. A form only started is a call to check, not something the SIS holds.
export const SIS_HOLDS = ['submitted', 'admitted', 'matriculated'];
export const SIS_HOLDS_SQL = `(pe.first_channel = 'sis' AND EXISTS (SELECT 1 FROM sis_applicants sa
  WHERE sa.person_id = pe.id AND sa.status IN ('${SIS_HOLDS.join("','")}')))`;
export const SIS_WORD = { registered: 'Registered', started: 'Form started', submitted: 'Submitted', admitted: 'Admitted',
  matriculated: 'Matriculated', rejected: 'Rejected', withdrawn: 'Withdrawn' };
// who does the next step - only where Ritvars has said so
const SIS_NEXT_BY = { submitted: 'Student Coordinator' };

/** Where a person is in the SIS, from their stored SIS rows: the furthest open application, else
 *  the latest closed one. null when the SIS knows nothing of them. */
export function sisProgress(rows) {
  const list = (rows || []).filter((r) => r && r.status);
  if (!list.length) return null;
  const rank = (s) => SIS_ORDER.indexOf(s);
  const latest = (a, b) => String(b.changed_at).localeCompare(String(a.changed_at));
  const open = list.filter((r) => rank(r.status) >= 0).sort((a, b) => rank(b.status) - rank(a.status) || latest(a, b));
  const r = open[0] || [...list].sort(latest)[0];
  const i = rank(r.status);
  const nextStatus = i >= 0 && i < SIS_ORDER.length - 1 ? SIS_ORDER[i + 1] : null;
  return {
    status: r.status,
    label: SIS_WORD[r.status] || r.status,
    since: r.changed_at || null,               // the SIS last changed it: it has been here at least since then
    next: nextStatus ? SIS_WORD[nextStatus] : null,
    nextBy: SIS_NEXT_BY[r.status] || null,
  };
}

/** The same for every linked person at once: { personId: progress }. */
export async function sisProgressByPerson(db) {
  let rows = [];
  try {
    rows = await db.prepare(`SELECT person_id, status, changed_at FROM sis_applicants WHERE person_id IS NOT NULL`).all();
  } catch { return {}; }                       // a database without the SIS tables yet
  const by = {};
  for (const r of rows) (by[r.person_id] = by[r.person_id] || []).push(r);
  return Object.fromEntries(Object.entries(by).map(([id, rs]) => [id, sisProgress(rs)]));
}
