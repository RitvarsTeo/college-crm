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

import { authoriseCron } from '../../lib/pbx.js';
import { runPoll, ready, MAILBOX, WINDOW_MINUTES } from '../../lib/gmail.js';

export default async function handler(req, res) {
  const method = req.method || 'GET';
  if (method !== 'GET' && method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const auth = authoriseCron(req.headers && req.headers.authorization);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  const mode = String(process.env.CHANNEL_MODE_GMAIL || 'off').toLowerCase();
  if (mode === 'off') {
    res.status(200).json({ ok: true, ran: false, channel: 'gmail',
      why: 'the gmail channel is off', how: 'set CHANNEL_MODE_GMAIL to test or live' });
    return;
  }

  const state = ready();
  if (!state.ok) {
    // 200, not an error: being un-authorised yet is the expected state, and a
    // failing scheduled job every five minutes teaches everybody to ignore it.
    res.status(200).json({ ok: true, ran: false, channel: 'gmail', mailbox: MAILBOX,
      why: state.why, waitingOn: state.waitingOn });
    return;
  }

  try {
    const result = await runPoll({ minutes: WINDOW_MINUTES });
    res.status(result.ok ? 200 : 502).json({ channel: 'gmail', mailbox: MAILBOX, ...result });
  } catch (err) {
    // Never echo the message: a Google error can quote the request.
    res.status(500).json({ ok: false, ran: true, error: 'the poll failed', channel: 'gmail' });
  }
}
