// OWNERSHIP AND NEW ADDITIONS (29.10.2026). The owner: "each of these managers can add these clients to themselves! and
// anyone who has account in TC part of Intake can add to the whole pool of clients people under theyre ownership! Each
// new addition is added but Admins, like Ritvars and Aleksejs Bogdanecs and Janis Sticenko receives notification that a
// new client or company is added and by whom and they can approve or flag the new addition." His picks: Make mine on
// Companies, a New additions tab, an email with a link to it, and Flag = hidden from lists until approved.
//
// Make mine sets the company's person in charge to the signed-in account. A company added by hand goes under its adder;
// a person added to a company with nobody in charge puts that company under the adder too. Nothing is ever deleted: a
// flag sets hidden_at, an approval clears it, and each decision is a line in the company's log.
import { TC, TcInputError, logTcActivity } from './tc.js';

const nowIso = () => new Date().toISOString();
const low = (s) => String(s || '').trim().toLowerCase();
export const APPROVERS = ((TC.approvals && TC.approvals.approvers) || []).map((a) => ({ name: a.name, email: low(a.email) }));
export const isApprover = (email) => APPROVERS.some((a) => a.email === low(email));


/** Make mine: the company's person in charge becomes the signed-in account. */
export async function claim(db, companyId, me) {
  if (!me || !me.email) throw new TcInputError('Sign in first.');
  const c = await db.prepare('SELECT id, pic_name, pic_email FROM tc_companies WHERE id = ? AND archived_at IS NULL').get(Number(companyId));
  if (!c) throw new TcInputError('There is no such company.');
  if (low(c.pic_email) === low(me.email)) return { mine: true };
  await db.prepare('UPDATE tc_companies SET pic_name = ?, pic_email = ?, updated_at = ? WHERE id = ?').run(me.name, low(me.email), nowIso(), c.id);
  await logTcActivity(db, c.id, { kind: 'edit', field: 'pic_name', old: c.pic_name || null, new: me.name, body: 'Made mine', actor: me.name });
  return { mine: true };
}

/** After a company or a person is added by hand: who added it, under whom it goes, and the line for the approvers. */
export async function added(db, { kind, companyId, contactId = null }, me) {
  const by = me && me.name ? me.name : '', email = me && me.email ? low(me.email) : '';
  const c = await db.prepare('SELECT id, pic_email FROM tc_companies WHERE id = ?').get(Number(companyId));
  if (c && email && !c.pic_email) {
    await db.prepare('UPDATE tc_companies SET pic_name = ?, pic_email = ?, updated_at = ? WHERE id = ?').run(by, email, nowIso(), c.id);
  }
  const own = isApprover(email);
  const at = nowIso();
  const r = await db.prepare(`INSERT INTO tc_additions (kind, company_id, contact_id, added_by, added_by_email, added_at, state, decided_by, decided_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(kind, Number(companyId), contactId ? Number(contactId) : null, by, email || null, at,
    own ? 'approved' : 'new', own ? by : null, own ? at : null);
  return { id: Number(r.lastInsertRowid), toReview: !own };
}

/** The New additions tab: to review, then the approved and the flagged (the latest 200 of each). */
export async function list(db) {
  const rows = await db.prepare(`SELECT a.*, c.name AS company, c.country, c.city, k.name AS person, k.position, k.email AS person_email
    FROM tc_additions a JOIN tc_companies c ON c.id = a.company_id LEFT JOIN tc_company_contacts k ON k.id = a.contact_id
    ORDER BY a.added_at DESC, a.id DESC`).all();
  const out = (r) => ({ id: Number(r.id), kind: r.kind, companyId: Number(r.company_id), contactId: r.contact_id ? Number(r.contact_id) : null,
    company: r.company, place: [r.country, r.city].filter(Boolean).join(' · '), person: r.person || '', position: r.position || '', personEmail: r.person_email || '',
    by: r.added_by || '', at: r.added_at, state: r.state, decidedBy: r.decided_by || '', decidedAt: r.decided_at || '' });
  const by = (s) => rows.filter((r) => r.state === s).map(out);
  return { toReview: by('new'), approved: by('approved').slice(0, 200), flagged: by('flagged').slice(0, 200), approvers: APPROVERS.map((a) => a.name) };
}
export async function reviewCount(db) {
  return Number((await db.prepare(`SELECT COUNT(*) AS n FROM tc_additions WHERE state = 'new'`).get()).n) || 0;
}

/** Approve (shown everywhere) or flag (hidden from lists until approved). Approvers only. */
export async function decide(db, id, what, me) {
  if (!me || !isApprover(me.email)) throw new TcInputError('Only an approver can approve or flag.');
  if (!['approve', 'flag'].includes(what)) throw new TcInputError('Approve or flag?');
  const a = await db.prepare('SELECT * FROM tc_additions WHERE id = ?').get(Number(id));
  if (!a) throw new TcInputError('There is no such addition.');
  const at = nowIso(), hidden = what === 'flag' ? at : null;
  return db.transaction(async (tx) => {
    await tx.prepare('UPDATE tc_additions SET state = ?, decided_by = ?, decided_at = ? WHERE id = ?').run(what === 'flag' ? 'flagged' : 'approved', me.name, at, a.id);
    if (a.kind === 'contact' && a.contact_id) await tx.prepare('UPDATE tc_company_contacts SET hidden_at = ? WHERE id = ?').run(hidden, a.contact_id);
    else await tx.prepare('UPDATE tc_companies SET hidden_at = ?, updated_at = ? WHERE id = ?').run(hidden, at, a.company_id);
    const what2 = a.kind === 'contact' ? 'Person' : 'Company';
    await logTcActivity(tx, Number(a.company_id), { kind: 'edit', contactId: a.contact_id ? Number(a.contact_id) : null, at, actor: me.name,
      body: what === 'flag' ? `${what2} flagged: hidden from lists until approved` : `${what2} approved` });
    return { id: Number(a.id), state: what === 'flag' ? 'flagged' : 'approved' };
  });
}

/** The email to the approvers: plain text, who added what, and the link to the New additions tab. */
export function emailText({ kind, company, person, by, origin }) {
  const what = kind === 'contact' ? `${person || 'a person'} (${company})` : company;
  const subject = `Intake: ${by || 'Somebody'} added ${kind === 'contact' ? 'a person' : 'a company'} - ${what}`;
  const text = [`${by || 'Somebody'} added ${kind === 'contact' ? 'a person' : 'a company'} to Intake Training Centre:`, '', what, '',
    origin ? `Approve or flag it: ${origin}/#/tc/additions` : 'Approve or flag it in Intake, Clients, New additions.'].join('\r\n');
  return { subject, text };
}
