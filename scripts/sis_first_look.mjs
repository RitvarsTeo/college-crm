// THE FIRST LOOK AT A REAL SIS REPLY, to confirm or change the PROVISIONAL lifecycle mapping in
// src/lifecycle.js. READ-ONLY: one GET through lib/sis.js (the same client the sync uses), nothing
// written anywhere. It prints SHAPE only - field names, how often each is filled, the status
// counts - and never a name, email, phone, reference or the token.
//
//   vercel env run -e production -- node scripts/sis_first_look.mjs
//
// needs SIS_API_TOKEN in the environment (Ritvars puts it in Vercel; it is never typed here).
import { fetchPage, STATUSES } from '../lib/sis.js';

const { applicants, nextCursor } = await fetchPage({ limit: 200 });
const fields = {};
const status = {};
for (const a of applicants) {
  for (const [k, v] of Object.entries(a)) {
    fields[k] = fields[k] || { filled: 0, empty: 0 };
    fields[k][v === null || v === undefined || v === '' ? 'empty' : 'filled']++;
  }
  status[a.status] = (status[a.status] || 0) + 1;
}
const unknownStatus = Object.keys(status).filter((s) => !STATUSES.includes(s));
const documented = ['reference', 'applicationId', 'givenName', 'familyName', 'email', 'phone', 'programmeCode',
  'programmeName', 'status', 'registeredAt', 'submittedAt', 'changedAt'];
console.log(JSON.stringify({
  applicantsOnFirstPage: applicants.length,
  morePages: Boolean(nextCursor),
  fields,
  notInTheDocument: Object.keys(fields).filter((k) => !documented.includes(k)),
  status,
  unknownStatus,
  // the two facts the mapping needs: are there fields that date them directly?
  anyStartedOrMatriculatedDateField: Object.keys(fields).filter((k) => /start|matric/i.test(k) && /at$|date/i.test(k)),
}, null, 2));
