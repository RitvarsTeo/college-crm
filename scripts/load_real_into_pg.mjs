// Loads the REAL admissions selection into the live Postgres CRM, from THIS PC.
//
// Decided by Ritvars 27.09.2026: the live copy holds the real current-cycle selection
// (config/prototype.json -> realData), behind sign-in. data/real_people.json never goes to
// Vercel (.vercelignore), so the server cannot load it itself - this script is the only way in.
//
// One transaction: the people-data tables are emptied and refilled together, or not at all.
// Accounts, channel settings and feedback are never touched.
//
//   CRM_PG_SCHEMA=crm DATABASE_URL=... node scripts/load_real_into_pg.mjs
import fs from 'node:fs';
import { openDb, pgUrl } from '../src/db.js';
import { loadReal } from '../src/real.js';

if (!pgUrl()) { console.error('no Postgres address in the environment'); process.exit(1); }
if (process.env.CRM_PG_SCHEMA !== 'crm') { console.error('set CRM_PG_SCHEMA=crm: this writes the live schema on purpose'); process.exit(1); }
const CONFIG = JSON.parse(fs.readFileSync(new URL('../config/prototype.json', import.meta.url), 'utf8'));

const db = await openDb('live');
const r = await db.transaction(async (tx) => {
  await tx.exec(`DELETE FROM events; DELETE FROM tasks; DELETE FROM documents;
    DELETE FROM registrations; DELETE FROM open_days; DELETE FROM consents;
    DELETE FROM sim_events; DELETE FROM field_values; DELETE FROM inbound; DELETE FROM people;`);
  return loadReal(tx, CONFIG.realData);
});
const n = (await db.prepare('SELECT COUNT(*) n FROM people').get()).n;
const u = (await db.prepare('SELECT COUNT(*) n FROM crm_users').get()).n;
// Counts only. Never a name, an email or a phone.
console.log(`loaded: ${n} people in schema ${db.schema} | selection: ${r.selection || CONFIG.realData.include} | accounts untouched: ${u}`);
await db.close();
