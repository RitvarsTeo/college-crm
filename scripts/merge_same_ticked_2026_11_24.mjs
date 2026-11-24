#!/usr/bin/env node
// THE "SAME COMPANY?" LIST, MERGED (patch 178, his words 24.11.2026 "all of the companies in the tab are the same, just check them
// yourself and delete the tab!"). Every group src/tcsame.js findSame lists is merged through tcsame.merge in 'ticked' mode (the
// company kept keeps its own Grand Opening decision; the other's is logged), EXCEPT the four pairs the TC lane found not clearly the
// same and he did not tick (24.11.2026, through MASTER CONTROL): they stay separate companies.
//
//   node scripts/merge_same_ticked_2026_11_24.mjs                                    the PREVIEW: writes nothing, prints a hash
//   node scripts/merge_same_ticked_2026_11_24.mjs --apply <hash> --by "<a person's name>"
//
// After a VERIFIED backup. Against Postgres it runs only with CRM_PG_SCHEMA set (src/db.js refuses otherwise).
import { createHash } from 'node:crypto';
import { openDb, pgUrl } from '../src/db.js';
import { findSame, merge, SameError } from '../src/tcsame.js';

// the four pairs that stay separate: [kept, other] (Davai UAB / Davai Bridge and Tunnel; Vindus / Vindustra; Maersk Training / Maersk;
// Reederei / Reederei Nord Shipmanagement)
export const SEPARATE = [[315, 314], [1436, 1437], [769, 761], [1045, 1047]];
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const APPLY = arg('--apply');
const BY = arg('--by');
if (APPLY && !BY) { console.error('--by "<the person who decided>" is required with --apply'); process.exit(1); }

/** The plan: one line per group, the company kept first, the four pairs left out. Pure; the hash pins exactly these companies. */
export function planTicked(groups, separate = SEPARATE) {
  const apart = new Set(separate.map(([a, b]) => `${a}:${b}`));
  const plan = groups.map((g) => ({ keep: { id: g[0].id, name: g[0].name }, drop: g.slice(1).filter((c) => !apart.has(`${g[0].id}:${c.id}`)).map((c) => ({ id: c.id, name: c.name })) }))
    .filter((g) => g.drop.length);
  const hash = createHash('sha256').update(JSON.stringify(plan.map((g) => [g.keep.id, ...g.drop.map((d) => d.id)]))).digest('hex').slice(0, 12);
  return { groups: plan, hash };
}

async function main() {
  const db = await openDb(pgUrl() ? 'production' : (process.env.CRM_DB || ':memory:'));
  if (db.kind === 'pg') {
    const s = await db.prepare('SELECT current_schema() AS s').get();
    if (s.s !== process.env.CRM_PG_SCHEMA) { console.error(`the session is in schema ${s.s}, not ${process.env.CRM_PG_SCHEMA}`); process.exit(1); }
  }
  const S = await findSame(db);
  const plan = planTicked([...S.obvious, ...S.check]);
  const moving = plan.groups.reduce((n, g) => n + g.drop.length, 0);
  if (!APPLY) { console.log(JSON.stringify({ preview: true, groups: plan.groups.length, archived: moving, hash: plan.hash, plan: plan.groups }, null, 1)); await db.close?.(); return; }
  if (APPLY !== plan.hash) { console.error('The companies are not the ones previewed. Run the preview again.'); process.exit(1); }
  // MASTER 24.11.2026: the spreadsheet junk in one name ("RelyOn Nutec USA, LLC   United States ... FALSE", country UAE) is cleaned
  // before it is merged away, with a line in its log
  const junk = await db.prepare(`SELECT id, name, country FROM tc_companies WHERE id = 1053 AND name LIKE '%FALSE%'`).get();
  if (junk) {
    await db.prepare(`UPDATE tc_companies SET name = 'RelyOn Nutec USA, LLC', country = 'United States' WHERE id = 1053`).run();
    await db.prepare(`INSERT INTO tc_activities (company_id, kind, occurred_at, field, old_value, new_value, body, actor, origin) VALUES (1053, 'edit', ?, 'name', ?, 'RelyOn Nutec USA, LLC', 'Name and country cleaned of spreadsheet text before the merge', ?, 'manual')`)
      .run(new Date().toISOString(), junk.name, BY);
  }
  const done = [], held = [];
  for (const g of plan.groups) {
    for (const d of g.drop) {
      try { done.push(await merge(db, g.keep.id, d.id, BY, { mode: 'ticked' })); } catch (err) {
        if (!(err instanceof SameError)) { console.error(`stopped at ${d.name}: ${err.message} (${done.length} merged before it)`); process.exit(1); }
        held.push({ keep: g.keep.name, drop: d.name, why: err.message });
      }
    }
  }
  console.log(JSON.stringify({ applied: true, merged: done.length, held, by: BY,
    conflicts: done.flatMap((r) => r.conflicts || []),
    cards: done.filter((r) => r.cards && r.cards.kept).map((r) => ({ company: r.keep.name, kept: r.cards.kept, freed: r.cards.freed })) }, null, 1));
  await db.close?.();
}
if (process.argv[1] && process.argv[1].endsWith('merge_same_ticked_2026_11_24.mjs')) await main();
