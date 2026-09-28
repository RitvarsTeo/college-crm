// Vercel Cron target, every 5 minutes: what changed in the SIS since the last run.
// What happens to each applicant is in src/sync.js: one matching person moves on
// by themselves, anybody else goes to the Inbox.
//
// THIS ROUTE IS A PUBLIC URL, guarded by CRON_SECRET exactly like the PBX route.
// The SIS token goes only in the Authorization header of the request to the SIS
// and is never printed.

import { authoriseCron, sendJson } from '../../lib/pbx.js';
import { redactSis } from '../../lib/sis.js';
import { cronDb } from '../../src/crondb.js';
import { syncSis } from '../../src/sync.js';

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
    const result = await syncSis(db);
    if (result.ran) {
      console.log(`[sis] since ${result.since || 'the start'}: fetched ${result.fetched}, stored ${result.stored}, `
        + `linked ${result.linked}, moved ${result.moved}, inbox ${result.inbox}`);
    }
    sendJson(res, 200, result);
  } catch (err) {
    const message = redactSis(err && err.message ? err.message : 'sync failed', process.env.SIS_API_TOKEN);
    console.error(`[sis] ${message}`);
    // a 429 from the SIS is not our failure: the next run simply tries again
    sendJson(res, err && err.status === 429 ? 200 : 502, { ok: false, error: message });
  }
}
