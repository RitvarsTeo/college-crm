// Scheduled target: the training@ catch-up out of hours (patch 182, the owner 24.11.2026: "reading start now, why tomorrow??").
// The owner's 29.10.2026 rule (mail read 08:00-17:00 Latvian time) stays for edu@ and everything else; this route reads ONLY
// training@ (src/sync.js syncTcMail, the same code the day run uses), ONLY outside those hours, and ONLY while its last run said
// there is more. Once a run reaches today it answers "caught up" and does nothing. Five minutes off gmail-poll's beat.
// THIS ROUTE IS A PUBLIC URL: it needs `Authorization: Bearer $CRON_SECRET`, and refuses everything when that is not set.
import { authoriseCron, sendJson } from '../../lib/pbx.js';
import { cronDb } from '../../src/crondb.js';
import { inWorkHours } from '../../src/bizday.js';
import { syncTcMail, tcMailCatchingUp } from '../../src/sync.js';

export default async function handler(req, res) {
  const method = req.method || 'GET';
  if (method !== 'GET' && method !== 'POST') { sendJson(res, 405, { error: 'Method not allowed' }); return; }
  const auth = authoriseCron(req.headers && req.headers.authorization);
  if (!auth.ok) { sendJson(res, auth.status, { error: auth.error }); return; }
  // in the working day gmail-poll reads training@ itself
  if (inWorkHours()) { sendJson(res, 200, { ok: true, ran: false, job: 'tc-mail-catchup', why: 'inside 08:00-17:00: gmail-poll reads it' }); return; }
  try {
    const db = await cronDb();
    if (!(await tcMailCatchingUp(db))) { sendJson(res, 200, { ok: true, ran: false, job: 'tc-mail-catchup', why: 'caught up' }); return; }
    const out = await syncTcMail(db);
    sendJson(res, out.ok ? 200 : 502, { job: 'tc-mail-catchup', ...out });
  } catch (err) {
    sendJson(res, 500, { ok: false, job: 'tc-mail-catchup', error: 'the catch-up failed' });
  }
}
