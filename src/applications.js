// Applications in Reports: the SIS application funnel, by registration week.
//
// Decided 01.10.2026 (popup A): the Applications view is built from the SIS data already in
// Intake, per programme and week, along registered -> started -> submitted -> admitted ->
// matriculated, sparse until the SIS has real applicants, and nothing is fabricated. Placement
// is Reports, under apply.novikontas.org; there is no Applications menu item.
//
// WHAT THE SIS DOES NOT SAY. Each record carries its CURRENT status and the dates registeredAt,
// submittedAt and changedAt. There is no status history: `started` and `admitted` have no date of
// their own. So the only honest weekly funnel is a COHORT one: the people who registered in a week,
// and where each of them stands now. Nothing here reconstructs when anybody moved. A later status
// counts as having passed the earlier ones (the order is the SIS's own), and rejected or withdrawn
// are kept apart because the SIS does not say at which step it ended.
//
// WHAT IS NOT COUNTED. A record whose Inbox item a person archived (production's six team tests,
// archived as Internal on 30.09) is a human's "this is not an applicant". It is counted as set
// aside and never enters the funnel.
//
// Read-only: SELECTs only. Counts only: no name, email, phone or reference leaves this file.

import { SIS_ORDER, SIS_WORD, sisProgress } from './lifecycle.js';
import { channelMode } from './sync.js';

export const FUNNEL = SIS_ORDER;                       // registered .. matriculated
export const APART = ['rejected', 'withdrawn'];
const ZONE = 'Europe/Riga';

// The Riga calendar day of an instant, YYYY-MM-DD.
export function rigaDay(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
}

// The ISO week a Riga calendar day falls in: { week: '2026-W40', monday: '2026-09-28' }.
export function rigaWeek(iso) {
  const day = rigaDay(iso);
  if (!day) return null;
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = (date.getUTCDay() + 6) % 7;              // Monday 0 .. Sunday 6
  const monday = new Date(date); monday.setUTCDate(date.getUTCDate() - dow);
  const thursday = new Date(monday); thursday.setUTCDate(monday.getUTCDate() + 3);
  const wy = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(wy, 0, 4));
  const week1 = new Date(jan4); week1.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7));
  const n = 1 + Math.round((monday - week1) / (7 * 86400000));
  return { week: `${wy}-W${String(n).padStart(2, '0')}`, monday: monday.toISOString().slice(0, 10) };
}

const zero = () => Object.fromEntries([...FUNNEL, ...APART].map((s) => [s, 0]));
// "now at or past" each funnel step, from current statuses only
function reached(now) {
  const out = {};
  FUNNEL.forEach((s, i) => { out[s] = FUNNEL.slice(i).reduce((a, k) => a + now[k], 0) + (i === 0 ? APART.reduce((a, k) => a + now[k], 0) : 0); });
  return out;
}

/** Pure: the funnel from stored SIS rows and the set of references a person set aside. */
export function funnelFrom(rows, setAsideRefs = new Set()) {
  const byRef = new Map();
  for (const r of rows || []) {
    if (!r || !r.reference || !r.status) continue;
    (byRef.get(r.reference) || byRef.set(r.reference, []).get(r.reference)).push(r);
  }
  const weeks = new Map(); const programmes = new Map();
  let people = 0; let applications = 0; let undated = 0; let setAside = 0; let linked = 0;
  const total = zero();
  for (const [ref, list] of byRef) {
    if (setAsideRefs.has(ref)) { setAside++; continue; }
    people++;
    if (list.some((r) => r.person_id)) linked++;
    // a person: the furthest open application, else the latest closed one (the person page's own rule)
    const where = sisProgress(list).status;
    total[where]++;
    const regs = list.map((r) => r.registered_at).filter((v) => v && !Number.isNaN(Date.parse(v))).sort();
    const wk = regs.length ? rigaWeek(regs[0]) : null;
    if (!wk) undated++;
    else {
      const w = weeks.get(wk.week) || { week: wk.week, monday: wk.monday, people: 0, now: zero() };
      w.people++; w.now[where]++; weeks.set(wk.week, w);
    }
    // a programme: every application, each where it stands now
    for (const r of list) {
      if (!r.application_id) continue;
      applications++;
      const code = r.programme_code || null;
      const p = programmes.get(code) || { code, applications: 0, now: zero() };
      p.applications++; if (p.now[r.status] != null) p.now[r.status]++; programmes.set(code, p);
    }
  }
  const W = [...weeks.values()].sort((a, b) => b.week.localeCompare(a.week)).map((w) => ({ ...w, reached: reached(w.now) }));
  const P = [...programmes.values()].sort((a, b) => b.applications - a.applications || String(a.code).localeCompare(String(b.code)))
    .map((p) => ({ ...p, reached: reached(p.now) }));
  return { people, applications, setAside, linked, undatedRegistration: undated, now: total, reached: reached(total), weeks: W, programmes: P };
}

/** The Applications block for Reports: the funnel, and the truth about the feed behind it. */
export async function applicationFunnel(db, { env = process.env } = {}) {
  const mode = await channelMode(db, 'sis', env);
  let rows = []; let aside = []; let run = null;
  try {
    rows = await db.prepare(`SELECT reference, application_id, programme_code, status, registered_at, changed_at, person_id
      FROM sis_applicants`).all();
    // set aside: nobody is linked and the Inbox item raised for the reference was archived by a person
    aside = await db.prepare(`SELECT DISTINCT sa.reference FROM sis_applicants sa JOIN inbound i ON i.id = sa.inbound_id
      WHERE i.state = 'archived' AND NOT EXISTS (SELECT 1 FROM sis_applicants s2 WHERE s2.reference = sa.reference AND s2.person_id IS NOT NULL)`).all();
    run = await db.prepare("SELECT ran_at, detail FROM sync_state WHERE name = 'sis'").get();
  } catch { /* a database without the SIS tables yet: nothing held */ }
  const f = funnelFrom(rows, new Set(aside.map((a) => a.reference)));
  let last = null;
  if (run) {
    let d = {}; try { d = JSON.parse(run.detail || '{}') || {}; } catch {}
    last = { at: run.ran_at, fetched: typeof d.fetched === 'number' ? d.fetched : null };
  }
  // one word for the state, said as it is
  // (the webhook stores records without a pull, so "no run yet" means nothing arrived either way)
  const state = mode === 'off' ? 'off' : !last && !rows.length ? 'no-run' : f.people === 0 ? 'no-real-applicant' : mode === 'live' ? 'live' : 'test';
  return {
    basis: 'registration-week', statusHistory: false, labels: SIS_WORD, funnel: FUNNEL, apart: APART,
    feed: { mode, lastRun: last, records: rows.length, references: f.people + f.setAside },
    state, ...f,
  };
}
