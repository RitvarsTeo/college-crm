// AFTER THE ANSWER (05.11.2026): emails that collect in a list and go only when someone presses Send, each from the person's
// own list sender, the same way Stage 2 sends (src/tcs2send.js: a confirmed "Send mail as", marked before it goes, never twice).
//   r1  Reminder 1    - sent the Stage 2 email 21 days or more ago, no answer: the same email with a reminder line
// "You're in" and "See you soon" (a puzzle place and a company QR) are gone with the place codes (12.11.2026, his pick "Yes,
// build it"): Stage 3 is the ticket, one per registered person, src/tctickets.js. Admins only, like Stage 2 sending.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { TC } from './tc.js';
import { s2Mail, letter, plainSig, esc_ } from './tcs2mail.js';
import { mime, gmail, ready, todaySent, DAY_CAP, PER_CALL } from './tcs2send.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CFG = () => ((TC.grandOpening || {}).mails || {});
export const KINDS = ['r1'];
export const LABEL = { r1: 'Reminder: no answer yet' };
const REMIND_DAYS = 21;
/** The email, in the list owner's voice (06.11.2026, his decision). */
export function mailFor(kind, { first = '', linkCode = '' } = {}, from = {}) {
  return s2Mail('invite', first, linkCode || 'test00', { remind: true, from });
}

/** Who is due, per kind: [{ id, sender, name, first, email, company, code, linkCode }]. */
export async function due(db, kind, answers) {
  if (!KINDS.includes(kind)) return [];
  const rows = await db.prepare(`SELECT s.id, s.ch_contact_id, s.sender, s.name, s.first_name, s.email, s.company, s.link_code, k.company_id, c.name AS co_name,
      x.sent_at AS s2_at, x.result AS s2_result
    FROM tc_go_stage2 s LEFT JOIN tc_company_contacts k ON k.ch_contact_id = s.ch_contact_id AND k.archived_at IS NULL
    LEFT JOIN tc_companies c ON c.id = k.company_id LEFT JOIN tc_go_s2_sent x ON x.stage2_id = s.id
    WHERE s.gone = 0 AND s.email IS NOT NULL`).all();
  const sent = new Map();
  for (const m of await db.prepare(`SELECT stage2_id, kind FROM tc_go_mails`).all()) sent.set(m.stage2_id + ':' + m.kind, true);
  const ans = new Map((answers || []).map((a) => [a.chContactId, a]));
  const old = new Date(Date.now() - REMIND_DAYS * 864e5).toISOString();
  const seen = new Set();
  return rows.filter((r) => (seen.has(r.id) ? false : seen.add(r.id))).filter((r) => {
    if (sent.get(r.id + ':' + kind)) return false;
    const a = ans.get(r.ch_contact_id);
    return !a && r.s2_result === 'sent' && String(r.s2_at || '') <= old;
  }).map((r) => ({ id: Number(r.id), sender: r.sender, name: r.name || '', first: r.first_name || String(r.name || '').split(/\s+/)[0] || '', email: r.email,
    company: r.co_name || r.company || '', linkCode: r.link_code || '' }));
}

/** The three cards: how many are due per kind and per sender, and whether the kind may send yet. */
export async function overview(db, answers) {
  const out = {};
  for (const k of KINDS) {
    const list = await due(db, k, answers);
    const per = {};
    for (const p of list) per[p.sender] = (per[p.sender] || 0) + 1;
    out[k] = { label: LABEL[k], n: list.length, perSender: per, blocked: '' };
  }
  const sent = await db.prepare(`SELECT kind, COUNT(*) AS n FROM tc_go_mails WHERE result = 'sent' GROUP BY kind`).all();
  for (const r of sent) if (out[r.kind]) out[r.kind].sent = Number(r.n);
  return out;
}

/** The next few of one kind from one sender (the screen calls it again until nothing is left). */
export async function sendNext(db, kind, code, answers, me, { env = process.env, fetchImpl = fetch } = {}) {
  if (!KINDS.includes(kind)) return { ok: false, why: 'Which email?' };
  const r = await ready(db, code, env, fetchImpl);
  if (r.why) return { ok: false, why: r.why };
  if (await todaySent(db) >= DAY_CAP) return { ok: false, why: `Today's ${DAY_CAP} are sent. The next ones go tomorrow.` };
  const people = (await due(db, kind, answers)).filter((p) => p.sender === code).slice(0, PER_CALL);
  let sent = 0, refused = 0;
  for (const p of people) {
    const mark = await db.prepare(`INSERT INTO tc_go_mails (stage2_id, kind, sender, result, sent_at, sent_by) VALUES (?,?,?,?,?,?) ON CONFLICT DO NOTHING`)
      .run(p.id, kind, code, 'sent', new Date().toISOString(), me && me.name);
    if (!Number(mark.changes)) continue;
    const mail = mailFor(kind, p, { name: r.s.name || r.s.label, title: r.s.title || '' });
    const raw = Buffer.from(mime({ fromName: r.s.name || r.s.label, fromEmail: r.s.email, to: p.email, mail }), 'utf8').toString('base64url');
    let ok = false, detail = '';
    try { const res = await gmail(env, fetchImpl, r.tok.token, '/users/me/messages/send', { method: 'POST', body: JSON.stringify({ raw }) }); ok = res.ok; if (!ok) detail = 'Gmail ' + res.status; }
    catch (e) { detail = 'no answer'; }
    if (ok) sent++; else { refused++; await db.prepare(`UPDATE tc_go_mails SET result = 'refused', detail = ? WHERE stage2_id = ? AND kind = ?`).run(detail, p.id, kind); }
  }
  const left = (await due(db, kind, answers)).filter((p) => p.sender === code).length;
  return { ok: true, sent, refused, left, done: !people.length || !left };
}

/** A preview for the screen: the email to a made-up person. */
export function preview(kind, from = {}) {
  const m = mailFor(kind, { first: 'Anna', linkCode: 'test00' }, from);
  const html = String(m.html).replace('src="cid:building"', 'src="data:image/jpeg;base64,' + fs.readFileSync(path.join(ROOT, 'src', 'assets', 'go-building.jpg')).toString('base64') + '"');
  return { subject: m.subject, html };
}
