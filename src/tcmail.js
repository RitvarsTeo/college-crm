// THE TRAINING CENTRE EMAIL (24.11.2026, patch 167; his pick "Yes, connect training@", the mailbox "the correct one is
// training@novikontas.org", the picture TC_EMAIL_1_cards "Yes, build it"). training@ is read the way edu@ is read: one
// read-only Google sign-in as that mailbox (gmail.readonly), the refresh token kept encrypted (src/staffmail.js), nothing
// sent, nothing changed in Gmail. Its mail is Training Centre business: kept in tc_mail, NEVER the Academy Inbox and never
// the Academy's mail tables. The whole conversation: what came in and what training@ answered (the edu@ pattern, 156/157).
//
// The Training Centre Inbox shows one card per conversation (Gmail thread) that has mail from outside. A conversation
// training@ already answered stays as a card with "Answered by training@" and is not counted as waiting (the edu@ pick B).
// Mail from our own domain and from robots (no-reply, mailer-daemon) is kept out of the cards: it is not a client writing.
import crypto from 'node:crypto';
import { emailShown } from './emailtext.js';
import { deadlinesFor } from './intake.js';

export const TC_MAILBOX = 'training@novikontas.org';
export const FIRST_DAYS = 30;            // the first run reaches back this far
const low = (s) => String(s || '').trim().toLowerCase();
const ROBOT = /^(no-?reply|do-?not-?reply|noreply|mailer-daemon|postmaster|bounce[^@]*)@/i;
/** Mail that is no client writing: our own domain, or a robot. */
export const notAClient = (addr) => { const a = low(addr); return !a || a.endsWith('@novikontas.org') || ROBOT.test(a); };

/** Keep one run's messages (src/staffmail.js readMailbox shape + mine 'in' | 'out'). Each message once (Gmail's id). */
export async function recordTcMail(db, items, at = new Date().toISOString()) {
  const out = { read: 0, stored: 0, skipped: 0 };
  for (const m of items || []) {
    out.read++;
    const dir = m.mine === 'out' ? 'out' : 'in';
    if (dir === 'in' && notAClient(m.from)) { out.skipped++; continue; }
    if (!m.id || !m.threadId || !m.sentAt) { out.skipped++; continue; }
    const had = await db.prepare('SELECT id FROM tc_mail WHERE message_id = ?').get(String(m.id));
    if (had) continue;
    await db.prepare(`INSERT INTO tc_mail (message_id, thread_id, direction, from_addr, from_name, to_addrs, subject, body, attachments, at, received_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(String(m.id), String(m.threadId), dir, low(m.from) || null, m.fromName || null,
      (m.to || []).map(low).join(', ').slice(0, 2000) || null, String(m.subject || '').slice(0, 500) || null, String(m.body || '').slice(0, 20000) || null,
      (m.attachments || []).length ? JSON.stringify((m.attachments || []).map((x) => ({ name: x.name || x.filename || '', size: x.size || 0 })).slice(0, 20)) : null,
      m.sentAt, at);
    out.stored++;
  }
  return out;
}

/** The email cards of the Training Centre Inbox: { cards, waiting }. Waiting = a conversation with unread mail from outside. */
export async function mailCards(db, { handled = false, now = new Date() } = {}) {
  const rows = await db.prepare('SELECT id, thread_id, direction, from_addr, from_name, subject, body, at, seen_at, seen_by FROM tc_mail ORDER BY at DESC LIMIT 1500').all();
  const threads = new Map();
  for (const r of rows) { if (!threads.has(r.thread_id)) threads.set(r.thread_id, []); threads.get(r.thread_id).push(r); }
  const contacts = await db.prepare(`SELECT k.name, k.email, c.id AS company_id, c.name AS company FROM tc_company_contacts k
    JOIN tc_companies c ON c.id = k.company_id WHERE k.archived_at IS NULL AND c.archived_at IS NULL AND k.email IS NOT NULL`).all();
  const privates = await db.prepare('SELECT id, name, email FROM tc_private_clients WHERE archived_at IS NULL AND email IS NOT NULL').all();
  // patch 172: what Intake did with a conversation training@ answered (src/tcmailauto.js), for the Handled card and its Undo
  const autos = new Map((await db.prepare(`SELECT a.thread_id, a.segment, a.company_id, a.private_id, a.undone_at, c.name AS company FROM tc_mail_auto a
    LEFT JOIN tc_companies c ON c.id = a.company_id`).all()).map((a) => [a.thread_id, a]));
  const cards = []; let waiting = 0;
  for (const [thread, list] of threads) {
    const ins = list.filter((r) => r.direction === 'in');
    if (!ins.length) continue;
    const open = ins.filter((r) => !r.seen_at);
    const lastIn = ins[0], lastOut = list.find((r) => r.direction === 'out');
    const answered = lastOut && String(lastOut.at) > String(lastIn.at) ? { at: lastOut.at, by: null } : null;   // the card says training@ (his picture)
    if (open.length && !answered) waiting++;
    if (handled ? open.length : !open.length) continue;
    const shown = handled ? ins : open;
    const email = lastIn.from_addr || '';
    const k = contacts.find((c) => low(c.email) === email), pv = k ? null : privates.find((c) => low(c.email) === email);
    const au = autos.get(thread);
    // pick 4 (patch 172): late one working day after it came, while nobody has answered it (the Academy's email rule)
    const late = !handled && !answered && Date.parse(deadlinesFor('gmail', lastIn.at).lateAt) <= now.getTime();
    cards.push({ key: 'm:' + thread, kind: 'email', email, name: lastIn.from_name || '', subject: lastIn.subject || '', at: lastIn.at,
      seenAt: lastIn.seen_at || null, seenBy: lastIn.seen_by || null, answered, late,
      ...(au && !au.undone_at && lastIn.seen_by === 'Intake' ? { auto: { segment: au.segment, companyId: au.company_id ? Number(au.company_id) : null, company: au.company || '', privateId: au.private_id ? Number(au.private_id) : null } } : {}),
      messages: shown.map((r) => ({ id: Number(r.id), subject: r.subject || '', body: emailShown(r.body || ''), at: r.at })),
      ...(k ? { person: k.name || '', companyId: Number(k.company_id), company: k.company } : {}),
      ...(pv ? { person: pv.name || '', privateId: Number(pv.id) } : {}) });
  }
  return { cards, waiting };
}

/** Done: every unread message from outside in this conversation is handled, by whom and when. */
export async function mailDone(db, key, actor, at = new Date().toISOString()) {
  const thread = String(key || '').startsWith('m:') ? String(key).slice(2) : '';
  if (!thread) return { ok: false, error: 'Which conversation?' };
  const r = await db.prepare("UPDATE tc_mail SET seen_at = ?, seen_by = ? WHERE thread_id = ? AND direction = 'in' AND seen_at IS NULL").run(at, actor || null, thread);
  return { ok: true, done: Number(r.changes || 0) };
}

// THE ONE-TIME LINK FOR training@ (24.11.2026, patch 169; his words "Can you just make a link for her to open and click one click and
// done?", "Yes, build it"). An admin makes a link; whoever opens it (no Intake account needed) goes straight to Google's own read-only
// consent for training@. The link is a random token, kept only as its SHA-256, good for 48 hours and for ONE successful connect; the
// callback keeps the sign-in only when the account that comes back is training@ itself. Anything else connects nothing.
export const INVITE_HOURS = 48;
const hashOf = (t) => crypto.createHash('sha256').update(String(t || '')).digest('hex');
const TOKEN = /^[A-Za-z0-9_-]{40,60}$/;
export async function makeInvite(db, actor, now = new Date()) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(now.getTime() + INVITE_HOURS * 3600 * 1000).toISOString();
  await db.prepare('INSERT INTO tc_mail_invites (token_hash, created_by, created_at, expires_at) VALUES (?,?,?,?)').run(hashOf(token), actor || null, now.toISOString(), expires);
  return { token, expires };
}
/** The invite behind a token when it is still good (not used, not expired): { hash } or null. Fails closed. */
export async function checkInvite(db, token, now = new Date()) {
  if (!TOKEN.test(String(token || ''))) return null;
  const h = hashOf(token);
  const r = await db.prepare('SELECT token_hash, expires_at, used_at FROM tc_mail_invites WHERE token_hash = ?').get(h);
  if (!r || r.used_at || !(Date.parse(r.expires_at) > now.getTime())) return null;
  return { hash: h };
}
/** Spend it, once: true only for the one call that marks it used while it is still good. */
export async function useInvite(db, hash, account, now = new Date()) {
  const r = await db.prepare('UPDATE tc_mail_invites SET used_at = ?, used_account = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?')
    .run(now.toISOString(), account || null, String(hash || ''), now.toISOString());
  return Number(r.changes || 0) === 1;
}
export const _inviteTest = { hashOf };
