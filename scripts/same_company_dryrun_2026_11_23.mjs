// READ ONLY (patch 163): the duplicate companies on production, as the app will find them (src/tcsame.js findSame), with the
// company kept, the Grand Opening decisions on each and the cards. Nothing is written. Names only, no people.
//   node scripts/same_company_dryrun_2026_11_23.mjs
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/ritvarsv/Desktop/WF/Local Repo/Projects/Backups/x.js');
const pg = require('pg');
const { readEnv } = await import('file:///C:/Users/ritvarsv/Desktop/WF/Local%20Repo/Projects/Backups/lib.mjs');
const env = readEnv('C:/Users/ritvarsv/Desktop/WF/Local Repo/Projects/College CRM/crm-applications/.env.local', ['INTAKE_SUPABASE_DATABASE_URL']);
const purl = new URL(env.INTAKE_SUPABASE_DATABASE_URL.trim()); purl.searchParams.delete('sslmode'); purl.searchParams.delete('channel_binding');
const ROOT = 'C:/Users/ritvarsv/Desktop/WF/Local Repo/Projects/College CRM/crm-tc-data2';
const pc = new pg.Client({ connectionString: purl.toString(), ssl: { ca: fs.readFileSync(ROOT + '/config/supabase-root-2021-ca.crt', 'utf8'), rejectUnauthorized: true } });
const { findSame } = await import('file:///' + ROOT.replace(/ /g, '%20') + '/src/tcsame.js');
await pc.connect();
// a tiny db facade over pg for findSame's two SELECTs (? -> $n, schema crm)
let NO_DISMISSED = false;
const db = { prepare: (sql) => {
  if (NO_DISMISSED && sql.includes('tc_same_dismissed')) return { all: async () => [], get: async () => undefined };
  const q = sql.replace(/\?/g, (() => { let i = 0; return () => '$' + (++i); })());
  return { all: async (...a) => (await pc.query(q, a)).rows, get: async (...a) => (await pc.query(q, a)).rows[0] };
} };
try {
  await pc.query('BEGIN READ ONLY'); await pc.query('SET search_path TO crm');
  const hasDismissed = (await pc.query(`SELECT to_regclass('crm.tc_same_dismissed') t`)).rows[0].t;
  NO_DISMISSED = !hasDismissed;   // before patch 163 the table does not exist: nobody has answered Not the same yet
  const S = await findSame(db);
  const ids = [...S.obvious.flat(), ...S.check.flat()].map((c) => 'id:' + c.id);
  const picks = (await pc.query('SELECT sender, company_key, decision, way FROM tc_go_company_picks WHERE company_key = ANY($1) AND decision IS NOT NULL', [ids])).rows;
  const cardsRows = (await pc.query('SELECT code, place, company_key, linked_at FROM intake_go.cards WHERE company_key = ANY($1)', [ids])).rows;
  const tag = (c) => { const k = 'id:' + c.id; const p = picks.filter((x) => x.company_key === k).map((x) => x.sender + ' ' + x.decision + (x.way ? '/' + x.way : '')).join(', ');
    const cd = cardsRows.find((x) => x.company_key === k); return `${c.name} [${c.id}] ${c.contacts}c${c.country ? ' ' + c.country : ''}${p ? ' {' + p + '}' : ''}${cd ? ' card ' + cd.place : ''}`; };
  const differs = (g) => { const d = g.flatMap((c) => picks.filter((x) => x.company_key === 'id:' + c.id)); return d.length > 1 && d.some((x) => x.decision !== d[0].decision || (x.way || '') !== (d[0].way || '')); };
  const auto = S.obvious.filter((g) => !differs(g)), toTick = S.obvious.filter(differs);
  console.log(`OBVIOUS, merged by the apply step: ${auto.length} groups (${auto.reduce((n, g) => n + g.length - 1, 0)} companies archived into the first)`);
  for (const g of auto) console.log('  KEEP ' + tag(g[0]) + '  <=  ' + g.slice(1).map(tag).join('  |  '));
  console.log(`\nOBVIOUS but different decisions -> his tick list: ${toTick.length}`);
  for (const g of toTick) console.log('  ' + g.map(tag).join('  |  '));
  console.log(`\nTO CHECK on his tick list: ${S.check.length} groups`);
  for (const g of S.check.slice(0, 400)) console.log('  ' + g.map(tag).join('  |  '));
} finally { await pc.query('ROLLBACK').catch(() => {}); await pc.end(); }
