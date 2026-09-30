// Vercel Cron target, once a day: fetch the answers of every Meta and LinkedIn lead that arrived
// with ids only and could not be filled at once (no token yet, the provider down). src/leadanswers.js.
//
// THIS ROUTE IS A PUBLIC URL, guarded by CRON_SECRET exactly like the other cron routes. The
// provider tokens go only in the Authorization header of the calls to Meta and LinkedIn.

import { authoriseCron, sendJson } from '../../lib/pbx.js';
import { cronDb } from '../../src/crondb.js';
import { retryLeadAnswers } from '../../src/leadanswers.js';

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
    const result = await retryLeadAnswers(await cronDb());
    console.log(`[lead-answers] tried ${result.tried}, filled ${result.filled}, still pending ${result.pending}`);
    sendJson(res, 200, result);
  } catch {
    sendJson(res, 502, { ok: false, error: 'the retry failed' });
  }
}
