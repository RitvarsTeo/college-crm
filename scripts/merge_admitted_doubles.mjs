#!/usr/bin/env node
// THE ADMITTED DOUBLES (the owner, 05.11.2026, popup "Fix the 2026 Admitted figure: join the 64 doubles and leave test
// records out of every figure?" = "Yes, fix all"). A read of production that day found the 168 Admitted 2026 records were
// 104 people: 62 students held twice, once from the Admissions sheet import and once as a record the SIS made, plus 2
// held twice inside the sheet. This joins each SIS-made twin into the sheet record with the existing "Same person as..."
// merge (src/sync.js mergeSisDuplicate: every row moves, her own values stay, the SIS record goes, History says so).
//
//   node scripts/merge_admitted_doubles.mjs [--year 2026]                      the PREVIEW: writes nothing, prints a hash
//   node scripts/merge_admitted_doubles.mjs [--year 2026] --apply <hash> --by "<a person's name>"
//
// A pair is joined only when it is unambiguous: an SIS-made record (first_channel 'sis') and exactly ONE other record
// with the same name (case, Latvian / Lithuanian letters and word order folded, two words at least) that also shares
// the programme, the email or the phone, AND has the same programme; both Admitted, the SIS one admitted in the year;
// never a pair somebody marked "Not the same". Anything else is listed for a person to decide, never joined. Against Postgres it runs only with
// CRM_PG_SCHEMA set (src/db.js refuses otherwise), so it can never land in a throwaway schema.
import { createHash } from 'node:crypto';
import { openDb, pgUrl } from '../src/db.js';
import { mergeSisDuplicate } from '../src/sync.js';
import { nameKey, phoneKey } from '../src/samepeople.js';

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const YEAR = Number(arg('--year') || 2026);
const APPLY = arg('--apply');
const BY = arg('--by');
if (!Number.isInteger(YEAR)) { console.error('--year is a year'); process.exit(1); }
if (APPLY && !BY) { console.error('--by "<the person who decided>" is required with --apply'); process.exit(1); }

/** The pairs to join and the ones a person has to look at. Pure: rows in, plan out (the tests drive it). */
export function planDoubles(people, notSame, year) {
  const y0 = `${year - 1}-12-31T22:00:00.000Z`, y1 = `${year}-12-31T22:00:00.000Z`;   // a Riga year
  const told = new Set(notSame.map((r) => [r.person_a, r.person_b].sort().join('|')));
  const admitted = people.filter((p) => p.status === 'Admitted');
  const byName = new Map();
  for (const p of admitted) {
    const k = nameKey(p.name);
    if (!k.includes(' ')) continue;
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(p);
  }
  const join = [], look = [];
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    const sis = group.filter((p) => p.first_channel === 'sis' && p.admitted_at && p.admitted_at >= y0 && p.admitted_at < y1);
    const rest = group.filter((p) => p.first_channel !== 'sis');
    for (const s of sis) {
      const open = rest.filter((o) => !told.has([s.id, o.id].sort().join('|')));
      if (!open.length) continue;                     // somebody already said they are not the same: nothing to decide
      const fits = open.filter((o) => ((s.programme && s.programme === o.programme)
        || (s.email && String(s.email).toLowerCase() === String(o.email || '').toLowerCase())
        || (phoneKey(s.phone) && phoneKey(s.phone) === phoneKey(o.phone))));
      // MASTER CONTROL, 05.11.2026: a pair whose programme differs is not certain enough to join; a person looks
      if (fits.length === 1 && (s.programme || '') !== (fits[0].programme || '')) {
        look.push({ why: `programme differs (${s.programme || 'none'} / ${fits[0].programme || 'none'})`, name: s.name, ids: [s.id, fits[0].id] });
        continue;
      }
      if (fits.length === 1) join.push({ sourceId: s.id, targetId: fits[0].id, name: fits[0].name, programme: fits[0].programme || '',
        sisAdmitted: String(s.admitted_at).slice(0, 10), sheetAdmitted: String(fits[0].admitted_at || '').slice(0, 10) });
      else look.push({ why: fits.length ? 'more than one record fits' : 'no other record shares programme, email or phone', name: s.name, ids: group.map((p) => p.id) });
    }
    if (!sis.length && group.length > 1 && group.some((p) => p.admitted_at && p.admitted_at >= y0 && p.admitted_at < y1)) {
      look.push({ why: 'held twice, neither made by the SIS (the merge folds only an SIS record)', name: group[0].name,
        ids: group.map((p) => `${p.id} ${p.programme || ''}`) });
    }
  }
  join.sort((a, b) => a.name.localeCompare(b.name, 'lv'));
  const hash = createHash('sha256').update(JSON.stringify({ v: 1, year, join: join.map((j) => [j.sourceId, j.targetId]) })).digest('hex');
  return { year, join, look, hash };
}

async function main() {
  const db = await openDb(pgUrl() ? 'production' : (process.env.CRM_DB || ':memory:'));
  if (db.kind === 'pg') {
    const s = await db.prepare('SELECT current_schema() AS s').get();
    if (s.s !== process.env.CRM_PG_SCHEMA) { console.error(`the session is in schema ${s.s}, not ${process.env.CRM_PG_SCHEMA}`); process.exit(1); }
  }
  const people = await db.prepare(`SELECT id, name, email, phone, programme, status, first_channel, admitted_at FROM people`).all();
  const notSame = await db.prepare('SELECT person_a, person_b FROM person_not_same').all();
  const plan = planDoubles(people, notSame, YEAR);
  const before = people.filter((p) => p.status === 'Admitted' && p.admitted_at >= `${YEAR - 1}-12-31T22:00:00.000Z` && p.admitted_at < `${YEAR}-12-31T22:00:00.000Z`).length;
  if (!APPLY) {
    console.log(JSON.stringify({ preview: true, year: YEAR, admittedWithDateBefore: before, toJoin: plan.join.length,
      afterJoin: before - plan.join.length, forAPersonToLookAt: plan.look, hash: plan.hash, pairs: plan.join }, null, 1));
    await db.close?.(); return;
  }
  if (APPLY !== plan.hash) { console.error('The records are not the ones previewed. Run the preview again.'); process.exit(1); }
  let done = 0;
  for (const j of plan.join) {
    const r = await mergeSisDuplicate(db, j.sourceId, j.targetId, { by: BY });
    if (!r.ok) { console.error(`stopped at ${j.name}: ${r.error} (${done} joined before it)`); process.exit(1); }
    done += 1;
  }
  console.log(JSON.stringify({ applied: true, year: YEAR, joined: done, by: BY }));
  await db.close?.();
}
if (process.argv[1] && process.argv[1].endsWith('merge_admitted_doubles.mjs')) await main();
