// Scheduled target: read edu@novikontas.org, feed anything new into the same
// inbound path every other channel uses.
//
// config/channels.json has named this path since the register was written and
// the file did not exist. Found on 24.09.2026 by checking every declared path
// against the filesystem.
//
// THIS ROUTE IS A PUBLIC URL. A scheduled invocation carries
// `Authorization: Bearer $CRON_SECRET`; anything without it is refused, and if
// CRON_SECRET is not configured the route refuses everything rather than
// running open. That is the same rule as the PBX route, deliberately.
//
// It does not run today. Without GMAIL_SERVICE_ACCOUNT_JSON it reports what it
// is waiting for and makes no request at all - a call that was never made must
// never be reported as "nothing to do".

import { authoriseCron, sendJson } from '../../lib/pbx.js';
import { MAILBOX } from '../../lib/gmail.js';
import { cronDb } from '../../src/crondb.js';
import { syncGmail } from '../../src/sync.js';

export default async function handler(req, res) {
  const method = req.method || 'GET';
  if (method !== 'GET' && method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const auth = authoriseCron(req.headers && req.headers.authorization);
  if (!auth.ok) {
    sendJson(res, auth.status, { error: auth.error });
    return;
  }

  // Whether the mailbox can be read is answered by syncGmail, not here: option A is a setting but
  // option B (C5, 30.09.2026) lives in the database. Not connected yet answers 200 with the reason:
  // being un-authorised yet is the expected state, and a failing scheduled job teaches everybody
  // to ignore it.
  try {
    // syncGmail, not runPoll: runPoll only reads; syncGmail puts every message through the gmail
    // adapter into New Leads, keeps the since-last-run bookmark, and reads the channel switch
    // (Channels screen first, CHANNEL_MODE_GMAIL second). Fixed 30.09.2026 (Session C, C3).
    const result = await syncGmail(await cronDb());
    sendJson(res, result.ok || result.ran === false ? 200 : 502, { channel: 'gmail', mailbox: MAILBOX, ...result });
  } catch (err) {
    // Never echo the message: a Google error can quote the request.
    sendJson(res, 500, { ok: false, ran: true, error: 'the poll failed', channel: 'gmail' });
  }
}
