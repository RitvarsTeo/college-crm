// THE TRAINING CENTRE WHATSAPP, FORWARDED BY TELEGROUP (23.11.2026, patch 165; his words "Yes, build it now").
//
// TeleGroup forwards the WHOLE Meta webhook payload, as Meta sends it, for the Training Centre number +371 62444609 (Meta phone
// number id 654184684448536) to
//
//   POST /api/inbound/whatsapp-tc?token=<WHATSAPP_FORWARD_SECRET>      from 193.110.8.106 only
//
// The same gate as their call events (src/phoneevent.js phoneEventGate): the token AND the address, a missing secret refuses
// everything, the token is never logged. Its own secret, never PHONE_EVENT_SECRET.
//
// A message is Training Centre business: it is kept in tc_whatsapp_in, NEVER in the Academy Inbox (the academy number 23111114
// stays on Meta's own route, /api/inbound/whatsapp). Each message once (Meta's message id). Only messages[] for the Training Centre
// phone id are read (the existing WhatsApp adapter, whatsappAll); delivery statuses, staff replies and other numbers are ignored
// with a 200, since TeleGroup does not send again.
import { adaptAll } from './adapters.js';
import { phoneEventGate } from './phoneevent.js';

import { mailCards, mailDone, searchText } from './tcmail.js';
export const WHATSAPP_FORWARD_SECRET_ENV = 'WHATSAPP_FORWARD_SECRET';
export const TC_PHONE_ID = '654184684448536';

/** The token AND TeleGroup's address, with this route's own secret. Fails closed. */
export function whatsappForwardGate(req, url, env = process.env) {
  const g = phoneEventGate(req, url, { ...env, PHONE_EVENT_SECRET: env[WHATSAPP_FORWARD_SECRET_ENV] || '' });
  return g.missing ? { ...g, error: 'WhatsApp forwarding is not configured here', missing: WHATSAPP_FORWARD_SECRET_ENV } : g;
}

/** The payload with only the Training Centre number's values (another number's are dropped, never read). */
export function onlyTc(raw) {
  const entry = ((raw && raw.entry) || []).map((e) => ({ ...e, changes: (e.changes || []).filter((c) => {
    const id = c && c.value && c.value.metadata && String(c.value.metadata.phone_number_id || '');
    return id === TC_PHONE_ID;
  }) })).filter((e) => e.changes.length);
  return { ...raw, entry };
}

// THE TRAINING CENTRE INBOX (patch 166, his words "whatsapp has to be somewhere where is inbox, similar to academy side", "ok go"):
// one card per number, as the Academy Inbox joins one caller's messages; a number Intake knows (a Training Centre contact's phone,
// last 8 digits as everywhere) shows the person and the company. Waiting = not yet Done; Handled = Done, newest first.
const last8 = (n) => String(n || '').replace(/\D/g, '').slice(-8);
export async function tcInbox(db, { handled = false, q = '' } = {}) {
  // patch 172: found by a name, a number or a word (q); a number is matched on its digits ("+371 2000" finds 37120000...)
  const want = searchText(q), digits = want.replace(/\D/g, '');
  const rows = (await db.prepare(`SELECT id, from_num, name, body, media, at, seen_at, seen_by FROM tc_whatsapp_in
    WHERE ${handled ? 'seen_at IS NOT NULL' : 'seen_at IS NULL'} ORDER BY at DESC LIMIT ${want ? 3000 : 600}`).all())
    .filter((r) => !want || `${r.name || ''} ${r.body || ''}`.toLowerCase().includes(want) || (digits.length >= 4 && String(r.from_num || '').replace(/\D/g, '').includes(digits)));
  const keys = [...new Set(rows.map((r) => last8(r.from_num)).filter((k) => k.length === 8))];
  const known = new Map();
  if (keys.length) {
    for (const c of await db.prepare(`SELECT k.name, k.phone, c.id AS company_id, c.name AS company FROM tc_company_contacts k
        JOIN tc_companies c ON c.id = k.company_id WHERE k.archived_at IS NULL AND c.archived_at IS NULL AND k.phone IS NOT NULL`).all()) {
      const k = last8(c.phone);
      if (keys.includes(k) && !known.has(k)) known.set(k, { person: c.name || '', companyId: Number(c.company_id), company: c.company });
    }
  }
  const cards = new Map();
  for (const r of rows) {
    const k = last8(r.from_num) || String(r.from_num || r.id);
    if (!cards.has(k)) cards.set(k, { key: k, number: r.from_num || '', name: r.name || '', at: r.at, seenAt: r.seen_at || null, seenBy: r.seen_by || null, messages: [], ...(known.get(k) || {}) });
    cards.get(k).messages.push({ id: Number(r.id), body: r.body || '', media: r.media || null, at: r.at });
  }
  const waWaiting = handled ? Number((await db.prepare('SELECT COUNT(DISTINCT from_num) AS n FROM tc_whatsapp_in WHERE seen_at IS NULL').get()).n) : cards.size;
  // patch 167: training@'s conversations beside the WhatsApp cards, newest first (src/tcmail.js)
  const mail = await mailCards(db, { handled, q });
  const all = [...[...cards.values()].map((c) => ({ kind: 'whatsapp', ...c })), ...mail.cards].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return { cards: all, waiting: waWaiting + mail.waiting };
}
/** Done: every waiting message of this number (last 8 digits) is handled, by whom and when. */
export async function tcInboxDone(db, key, actor, at = new Date().toISOString()) {
  if (String(key || '').startsWith('m:')) return mailDone(db, key, actor, at);   // a training@ conversation (patch 167)
  const k = String(key || '').replace(/\D/g, '').slice(-8);
  if (k.length !== 8) return { ok: false, error: 'Which number?' };
  const ids = (await db.prepare('SELECT id, from_num FROM tc_whatsapp_in WHERE seen_at IS NULL').all()).filter((r) => last8(r.from_num) === k).map((r) => Number(r.id));
  for (const id of ids) await db.prepare('UPDATE tc_whatsapp_in SET seen_at = ?, seen_by = ? WHERE id = ? AND seen_at IS NULL').run(at, actor || null, id);
  return { ok: true, done: ids.length };
}

/** One forwarded delivery: { ok, stored, duplicates, ignored }. Never throws on a delivery without messages. */
export async function receiveTcWhatsApp(db, raw, { now = new Date() } = {}) {
  if (!raw || typeof raw !== 'object' || raw.object !== 'whatsapp_business_account') return { ok: true, ignored: 'not a WhatsApp delivery' };
  const tc = onlyTc(raw);
  const values = tc.entry.flatMap((e) => e.changes.map((c) => c.value || {}));
  if (!values.some((v) => (v.messages || []).length)) return { ok: true, ignored: values.length ? 'no message (a status or a reply)' : 'not the Training Centre number' };
  const evs = adaptAll('whatsapp', tc);
  let stored = 0, duplicates = 0;
  for (const ev of evs) {
    const media = ev.raw && ev.raw._media ? String(ev.raw._media.type || '') : null;
    try {
      await db.prepare(`INSERT INTO tc_whatsapp_in (message_id, phone_id, from_num, name, body, media, at, received_at) VALUES (?,?,?,?,?,?,?,?)`)
        .run(String(ev.externalEventId), TC_PHONE_ID, ev.senderPhone || null, ev.senderName || null, ev.messageBody || null, media, ev.receivedAt, now.toISOString());
      stored++;
    } catch (err) {
      if (!/UNIQUE|duplicate key|unique constraint/i.test(String(err && err.message))) throw err;
      duplicates++;
    }
  }
  return { ok: true, stored, duplicates };
}
