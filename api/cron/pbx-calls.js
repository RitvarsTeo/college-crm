// Vercel Cron target: poll the PBX, keep the incoming calls on our three queues,
// upsert them. Runs every 5 minutes, asks for the last 15, and the overlap is
// deliberate - a late run must never leave a gap, and `uniqueid` absorbs the
// repeats.
//
// THIS ROUTE IS A PUBLIC URL. Vercel sends `Authorization: Bearer $CRON_SECRET`
// on a scheduled invocation; anything without it is refused. If CRON_SECRET is
// not configured the route refuses everything rather than running open.
//
// NOTHING HERE PRINTS A SECRET. The only URL this file is allowed to log is the
// redacted one the poller hands back.

import { authoriseCron, runPoll, redact, WINDOW_MINUTES } from '../../lib/pbx.js';

export default async function handler(req, res) {
  const method = req.method || 'GET';
  if (method !== 'GET' && method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const auth = authoriseCron(req.headers?.authorization);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const result = await runPoll({ minutes: WINDOW_MINUTES });
    // A cron log a human reads at 09:00 in Riga should say Riga times, because
    // that is the clock the window was built on.
    console.log(`[pbx] ${result.window.from} -> ${result.window.to} ${result.window.zone}: `
      + `fetched ${result.fetched}, kept ${result.kept}, upserted ${result.upserted}`);
    res.status(200).json(result);
  } catch (err) {
    const message = redact(err && err.message ? err.message : 'poll failed');
    console.error(`[pbx] ${message}`);
    res.status(502).json({ ok: false, error: message });
  }
}
