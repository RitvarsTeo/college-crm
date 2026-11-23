#!/usr/bin/env node
// THE OBVIOUS DUPLICATE COMPANIES (patch 163, his pick 23.11.2026 "Auto obvious, tick rest"). Merges every OBVIOUS group that
// src/tcsame.js findSame finds (the same name once case, accents, punctuation, spaces and legal forms are dropped) into the company
// with the most contacts, through tcsame.merge in 'auto' mode: two different Grand Opening decisions stop that group (it goes to
// his tick list instead). Everything else waits on "Same company?" for a person.
//
//   node scripts/merge_same_companies.mjs                                       the PREVIEW: writes nothing, prints a hash
//   node scripts/merge_same_companies.mjs --apply <hash> --by "<a person's name>"
//
// Run the apply outside working hours or after telling Intake MASTER CONTROL (directors save their lists while it runs), after a
// VERIFIED backup. Against Postgres it runs only with CRM_PG_SCHEMA set (src/db.js refuses otherwise).
import { createHash } from 'node:crypto';
import { openDb, pgUrl } from '../src/db.js';
import { findSame, merge, SameError } from '../src/tcsame.js';

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const APPLY = arg('--apply');
const BY = arg('--by');
if (APPLY && !BY) { console.error('--by "<the person who decided>" is required with --apply'); process.exit(1); }

/** The plan: one line per obvious group, the company kept first. Pure; the hash pins exactly these companies. */
export function planObvious(obvious) {
  const groups = obvious.map((g) => ({ keep: { id: g[0].id, name: g[0].name }, drop: g.slice(1).map((c) => ({ id: c.id, name: c.name })) }));
  const hash = createHash('sha256').update(JSON.stringify(groups.map((g) => [g.keep.id, ...g.drop.map((d) => d.id)]))).digest('hex').slice(0, 12);
  return { groups, hash };
}

async function main() {
  const db = await openDb(pgUrl() ? 'production' : (process.env.CRM_DB || ':memory:'));
  if (db.kind === 'pg') {
    const s = await db.prepare('SELECT current_schema() AS s').get();
    if (s.s !== process.env.CRM_PG_SCHEMA) { console.error(`the session is in schema ${s.s}, not ${process.env.CRM_PG_SCHEMA}`); process.exit(1); }
  }
  const plan = planObvious((await findSame(db)).obvious);
  if (!APPLY) { console.log(JSON.stringify({ preview: true, groups: plan.groups.length, hash: plan.hash, plan: plan.groups }, null, 1)); await db.close?.(); return; }
  if (APPLY !== plan.hash) { console.error('The companies are not the ones previewed. Run the preview again.'); process.exit(1); }
  const done = [], held = [];
  for (const g of plan.groups) {
    for (const d of g.drop) {
      try { done.push(await merge(db, g.keep.id, d.id, BY, { mode: 'auto' })); } catch (err) {
        if (!(err instanceof SameError)) { console.error(`stopped at ${d.name}: ${err.message} (${done.length} merged before it)`); process.exit(1); }
        held.push({ keep: g.keep.name, drop: d.name, why: err.message });
      }
    }
  }
  console.log(JSON.stringify({ applied: true, merged: done.length, heldForTheTickList: held, by: BY,
    cards: done.filter((r) => r.cards && r.cards.kept).map((r) => ({ company: r.keep.name, kept: r.cards.kept, freed: r.cards.freed })) }, null, 1));
  await db.close?.();
}
if (process.argv[1] && process.argv[1].endsWith('merge_same_companies.mjs')) await main();
