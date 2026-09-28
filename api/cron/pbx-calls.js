// Vercel Cron target, every 5 minutes: the last 15 minutes of PBX calls into the
// CRM. The overlap is deliberate - a late run must never leave a gap - and a call
// already stored is skipped by its uniqueid. What happens to each call is in
// src/sync.js: a known caller is logged on the person, an unknown one goes to the
// Inbox.
//
// THIS ROUTE IS A PUBLIC URL. Vercel sends `Authorization: Bearer $CRON_SECRET`
// on a scheduled invocation; anything without it is refused. If CRON_SECRET is
// not configured the route refuses everything rather than running open.
//
// NOTHING HERE PRINTS A SECRET. The only URL this file is allowed to log is the
// redacted one the poller hands back.

import { authoriseCron, redact, sendJson } from '../../lib/pbx.js';
import { cronDb } from '../../src/crondb.js';
import { syncPbx } from '../../src/sync.js';

export default async function handler(req, res) {
  const method = req.method || 'GET';
  if (method !== 'GET' && method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const auth = authoriseCron(req.headers?.authorization);
  if (!auth.ok) {
    sendJson(res, auth.status, { error: auth.error });
    return;
  }

  try {
    const db = await cronDb();
    const result = await syncPbx(db);
    if (result.ran) {
      // Riga times, because that is the clock the window was built on
      console.log(`[pbx] ${result.window.from} -> ${result.window.to} ${result.window.zone}: `
        + `fetched ${result.fetched}, kept ${result.kept}, logged ${result.logged}, inbox ${result.inbox}, `
        + `already had ${result.seen}`);
    }
    sendJson(res, 200, result);
  } catch (err) {
    const message = redact(err && err.message ? err.message : 'poll failed');
    console.error(`[pbx] ${message}`);
    sendJson(res, 502, { ok: false, error: message });
  }
}
