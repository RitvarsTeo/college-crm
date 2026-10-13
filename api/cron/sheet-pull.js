// Scheduled target: the admissions sheet -> Intake, one way, read only (Q89, 12.10.2026; src/sheetsync.js).
//
// THIS ROUTE IS A PUBLIC URL. A scheduled invocation carries `Authorization: Bearer $CRON_SECRET`; anything
// without it is refused, and with CRON_SECRET unset it refuses everything, the same rule as every cron here.
// Not connected yet answers 200 with the reason: an expected state is not a failing job.

import { authoriseCron, sendJson } from '../../lib/pbx.js';
import { cronDb } from '../../src/crondb.js';
import { pullSheet } from '../../src/sheetsync.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
const edu = (v) => ((CFG.educationAliases || {})[String(v).trim()] || String(v).trim());

export default async function handler(req, res) {
  const method = req.method || 'GET';
  if (method !== 'GET' && method !== 'POST') { sendJson(res, 405, { error: 'Method not allowed' }); return; }
  const auth = authoriseCron(req.headers && req.headers.authorization);
  if (!auth.ok) { sendJson(res, auth.status, { error: auth.error }); return; }
  try {
    const db = await cronDb();
    const result = await pullSheet(db, { cfg: CFG, edu });
    if (result.ran) console.log(`[sheet] rows ${result.rows}: created ${result.created}, linked ${result.linked}, fields ${result.fields}, moved ${result.moved}, kept ${result.keptIntake}`);
    sendJson(res, 200, result);
  } catch (err) {
    console.error('[sheet] ' + String(err && err.message || err).slice(0, 200));
    sendJson(res, 502, { ok: false, error: 'the sheet pull failed' });
  }
}
