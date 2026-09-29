// THE FIRST LOOK AT A REAL SIS REPLY - its SHAPE, to confirm or change the PROVISIONAL lifecycle
// mapping in src/lifecycle.js. Read-only: one GET through lib/sis.js (the client the sync uses; no
// second client). What comes back is field names, how often each is filled and the status counts -
// never a name, email, phone, reference, date value or the token.
//
// It runs inside production (GET /api/admin/sis/first-look, admins only), because the Vercel CLI
// does not hand production secrets to a local machine - which is right.
import { fetchPage, STATUSES } from '../lib/sis.js';

const DOCUMENTED = ['reference', 'applicationId', 'givenName', 'familyName', 'email', 'phone', 'programmeCode',
  'programmeName', 'status', 'registeredAt', 'submittedAt', 'changedAt'];

/** Shape only. Pure, so it can be tested without the SIS. */
export function shapeOf(applicants, nextCursor) {
  const fields = {};
  const status = {};
  for (const a of applicants || []) {
    for (const [k, v] of Object.entries(a || {})) {
      fields[k] = fields[k] || { filled: 0, empty: 0 };
      fields[k][v === null || v === undefined || v === '' ? 'empty' : 'filled']++;
    }
    const s = a && a.status;
    status[s] = (status[s] || 0) + 1;
  }
  return {
    applicantsOnFirstPage: (applicants || []).length,
    morePages: Boolean(nextCursor),
    fields,
    notInTheDocument: Object.keys(fields).filter((k) => !DOCUMENTED.includes(k)),
    missingFromTheReply: DOCUMENTED.filter((k) => !(k in fields)),
    status,
    unknownStatus: Object.keys(status).filter((s) => !STATUSES.includes(s)),
    // does the SIS date "started" or "matriculated" directly? (the mapping uses changedAt until it does)
    startedOrMatriculatedDateFields: Object.keys(fields).filter((k) => /start|matric/i.test(k)),
  };
}

export async function firstLook({ env = process.env, fetchImpl = fetch } = {}) {
  const { applicants, nextCursor } = await fetchPage({ limit: 200, env, fetchImpl });
  return shapeOf(applicants, nextCursor);
}
