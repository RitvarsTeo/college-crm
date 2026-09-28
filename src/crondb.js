// The database a scheduled job writes to. A cron function is its own Vercel
// function and never boots the web app, so it opens the same database the same
// way src/server.js does: CRM_DB (or data/crm.db) locally, Postgres when a
// database URL is set.
//
// On Postgres it REFUSES to run without CRM_PG_SCHEMA. Without it the schema name
// is derived from a file path, and on Vercel that is a different, empty schema -
// a poller writing there would look healthy while the CRM never saw a row.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, pgUrl } from './db.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let opened = null;

export function cronDb(env = process.env) {
  if (pgUrl() && !env.CRM_PG_SCHEMA) {
    return Promise.reject(new Error('Missing required environment variable CRM_PG_SCHEMA'));
  }
  opened ||= openDb(env.CRM_DB || path.join(ROOT, 'data', 'crm.db'));
  return opened;
}
