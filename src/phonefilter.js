// THE PHONE FILTER'S MEMORY, in one place (moved here 14.10.2026 so the call pop-up reads the same rule as the pull).
import { normPhone } from './identity.js';

// One number written three ways by three systems is one number: its last 8 digits (the same key as the Inbox thread).
export const phoneThread = (num) => {
  const d = normPhone(num).replace(/[^0-9]/g, '');
  return d.length > 5 ? 'phone:' + d.slice(-8) : null;
};

// THE NUMBER IS REMEMBERED (01.10.2026; Q92, 14.10.2026 "Not Admissions"): a number a person set aside with one of
// phoneFilter.filterArchivedAs, matched on the same last-8-digits key as the thread, so +371 29.. and 29.. are one
// number. A Bring back on ANY card of that number after the set-aside is the undo: from then on its calls reach the
// Inbox again. Only reached for a caller who is not a person in Intake (storeCall looks for the person first).
export async function rememberedAs(db, num, reasons) {
  if (!num || !reasons.length) return null;
  const key = phoneThread(num);
  const same = '(contact_phone = ? OR (thread_key IS NOT NULL AND thread_key = ?))';
  const row = await db.prepare(`SELECT id, archive_reason, processed_at FROM inbound
    WHERE ${same} AND state = 'archived' AND archive_reason IN (${reasons.map(() => '?').join(',')})
    ORDER BY processed_at DESC, id DESC LIMIT 1`).get(num, key, ...reasons);
  if (!row) return null;
  const undone = await db.prepare(`SELECT 1 AS x FROM inbound_history h JOIN inbound j ON j.id = h.inbound_id
    WHERE h.action = 'brought_back' AND h.at > ? AND (j.contact_phone = ? OR (j.thread_key IS NOT NULL AND j.thread_key = ?))`)
    .get(row.processed_at || '', num, key);
  return undone ? null : row;
}

