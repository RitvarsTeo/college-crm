// THE TRAINING CENTRE EMAIL (24.11.2026, patch 167; his pick "Yes, connect training@", the mailbox "the correct one is
// training@novikontas.org", the picture TC_EMAIL_1_cards "Yes, build it"). training@ is read the way edu@ is read: one
// read-only Google sign-in as that mailbox (gmail.readonly), the refresh token kept encrypted (src/staffmail.js), nothing
// sent, nothing changed in Gmail. Its mail is Training Centre business: kept in tc_mail, NEVER the Academy Inbox and never
// the Academy's mail tables. The whole conversation: what came in and what training@ answered (the edu@ pattern, 156/157).
//
// The Training Centre Inbox shows one card per conversation (Gmail thread) that has mail from outside. A conversation
// training@ already answered stays as a card with "Answered by training@" and is not counted as waiting (the edu@ pick B).
// Mail from our own domain and from robots (no-reply, mailer-daemon) is kept out of the cards: it is not a client writing.
import { emailShown } from './emailtext.js';

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
export async function mailCards(db, { handled = false } = {}) {
  const rows = await db.prepare('SELECT id, thread_id, direction, from_addr, from_name, subject, body, at, seen_at, seen_by FROM tc_mail ORDER BY at DESC LIMIT 1500').all();
  const threads = new Map();
  for (const r of rows) { if (!threads.has(r.thread_id)) threads.set(r.thread_id, []); threads.get(r.thread_id).push(r); }
  const contacts = await db.prepare(`SELECT k.name, k.email, c.id AS company_id, c.name AS company FROM tc_company_contacts k
    JOIN tc_companies c ON c.id = k.company_id WHERE k.archived_at IS NULL AND c.archived_at IS NULL AND k.email IS NOT NULL`).all();
  const privates = await db.prepare('SELECT id, name, email FROM tc_private_clients WHERE archived_at IS NULL AND email IS NOT NULL').all();
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
    cards.push({ key: 'm:' + thread, kind: 'email', email, name: lastIn.from_name || '', subject: lastIn.subject || '', at: lastIn.at,
      seenAt: lastIn.seen_at || null, seenBy: lastIn.seen_by || null, answered,
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
