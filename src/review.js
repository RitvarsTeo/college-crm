// THE META REVIEWER'S INBOX (27.11.2026, his pick "Inbox-only reviewer login" for Meta App Review). Meta's reviewers must
// see that messages sent to our Facebook page, Instagram and WhatsApp arrive in Intake and are answered there. The
// reviewer account (area 'review', src/areas.js) opens ONLY this: the Inbox threads of those channels, read-only. No
// people lists, no exports, no settings, no writes (src/server.js answers 405 to anything but GET here).

export const REVIEW_CHANNELS = ['facebook', 'messenger', 'instagram', 'whatsapp'];
const LIMIT = 100;
const IN = REVIEW_CHANNELS.map(() => '?').join(',');

/** The threads, newest first: channel, time, who wrote, the first words. Nothing else of the card. */
export async function reviewInbox(db) {
  const rows = await db.prepare(`SELECT id, channel, received_at, contact_name, contact_handle, state, body FROM inbound
    WHERE channel IN (${IN}) ORDER BY received_at DESC LIMIT ${LIMIT}`).all(...REVIEW_CHANNELS);
  return rows.map((r) => ({ id: Number(r.id), channel: r.channel, at: r.received_at, from: r.contact_name || r.contact_handle || '',
    state: r.state, preview: r.body ? String(r.body).slice(0, 160) : '' }));
}

/** One thread: its messages in order (what came in and what we answered). Null when it is not a Meta channel's. */
export async function reviewThread(db, id) {
  const card = await db.prepare(`SELECT id, channel, received_at, contact_name, contact_handle, state, body FROM inbound
    WHERE id = ? AND channel IN (${IN})`).get(Number(id), ...REVIEW_CHANNELS);
  if (!card) return null;
  const lines = await db.prepare('SELECT seq, received_at, kind, body FROM inbound_line WHERE inbound_id = ? ORDER BY seq').all(Number(id));
  const messages = lines.length
    ? lines.map((l) => ({ at: l.received_at, kind: l.kind, text: l.body || '' }))
    : [{ at: card.received_at, kind: 'message', text: card.body || '' }];
  return { id: Number(card.id), channel: card.channel, from: card.contact_name || card.contact_handle || '', state: card.state, messages };
}
