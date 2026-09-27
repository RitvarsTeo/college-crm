// Drops the schemas a test run against Postgres leaves behind: crm_t_* (one per
// in-memory database a test opened) and crm_f_* (one per database FILE a test
// named). Never touches `crm`, `public` or anything else.
//
//   DATABASE_URL=... node scripts/pg_drop_test_schemas.mjs
import pg from 'pg';

const url = process.env.CRM_DB_DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL is not set'); process.exit(1); }
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
const { rows } = await client.query(
  `SELECT nspname FROM pg_namespace WHERE nspname ~ '^crm_[tf]_[a-z0-9_]+$' ORDER BY 1`);
for (const r of rows) await client.query(`DROP SCHEMA "${r.nspname}" CASCADE`);
console.log(`dropped ${rows.length} test schemas`);
await client.end();
