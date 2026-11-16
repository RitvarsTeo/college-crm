// Scheduled target: the Grand Opening deadline reminders (patch 152, 16.11.2026; src/tcgopass.js sendReminders). The owner: "This
// weeks Thursday 17.00. Have them max two reminders. One before the min needed time to complete the task. and one 24h earlier".
// Every 10 minutes 08:00-17:50 Riga time; each reminder goes at most once per list owner (tc_go_reminders), from Intake's
// connected sender (lib/notify.js sendMail), only to an owner with companies still to decide or people passed to him.
// THIS ROUTE IS A PUBLIC URL: it needs `Authorization: Bearer $CRON_SECRET`, and refuses everything when that is not set.
import { authoriseCron, sendJson } from '../../lib/pbx.js';
import { sendMail } from '../../lib/notify.js';
import { cronDb } from '../../src/crondb.js';
import { sendReminders } from '../../src/tcgopass.js';
import { openCounts } from '../../src/tcmylist.js';

export default async function handler(req, res) {
  const method = req.method || 'GET';
  if (method !== 'GET' && method !== 'POST') { sendJson(res, 405, { error: 'Method not allowed' }); return; }
  const auth = authoriseCron(req.headers && req.headers.authorization);
  if (!auth.ok) { sendJson(res, auth.status, { error: auth.error }); return; }
  try {
    const db = await cronDb();
    const out = await sendReminders(db, (code) => openCounts(db, code), (mail) => sendMail(db, mail));
    sendJson(res, 200, { job: 'go-reminders', ...out });
  } catch (err) {
    sendJson(res, 500, { ok: false, job: 'go-reminders', error: 'the reminders failed' });
  }
}
