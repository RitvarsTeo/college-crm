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
