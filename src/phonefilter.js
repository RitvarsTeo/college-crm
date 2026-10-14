// THE PHONE FILTER'S MEMORY, in one place (moved here 14.10.2026 so the call pop-up reads the same rule as the pull),
// and since the one rule (14.10.2026) the MARKS on a number or an email address, at the end.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normPhone } from './identity.js';

const CFG = JSON.parse(fs.readFileSync(path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'config', 'prototype.json'), 'utf8'));

// One number written three ways by three systems is one number: its last 8 digits (the same key as the Inbox thread).
export const phoneThread = (num) => {
  const d = normPhone(num).replace(/[^0-9]/g, '');
  return d.length > 5 ? 'phone:' + d.slice(-8) : null;
};

// THE NUMBER IS REMEMBERED (01.10.2026; only Spam, Supplier or vendor, Internal since the 14.10.2026 rethink): a number a person set aside with one of
// phoneFilter.filterArchivedAs, matched on the same last-8-digits key as the thread, so +371 29.. and 29.. are one
// number. A Bring back on ANY card of that number after the set-aside is the undo: from then on its calls reach the
// Inbox again. Only reached for a caller who is not a person in Intake (storeCall looks for the person first).
export async function rememberedAs(db, num, reasons) {
  if (!num || !reasons.length) return null;
  const key = phoneThread(num);
  const same = '(contact_phone = ? OR (thread_key IS NOT NULL AND thread_key = ?))';
  const row = await db.prepare(`SELECT id, archive_reason, processed_at, processed_by FROM inbound
    WHERE ${same} AND state = 'archived' AND archive_reason IN (${reasons.map(() => '?').join(',')})
    ORDER BY processed_at DESC, id DESC LIMIT 1`).get(num, key, ...reasons);
  if (!row) return null;
  const undone = await db.prepare(`SELECT 1 AS x FROM inbound_history h JOIN inbound j ON j.id = h.inbound_id
    WHERE h.action = 'brought_back' AND h.at > ? AND (j.contact_phone = ? OR (j.thread_key IS NOT NULL AND j.thread_key = ?))`)
    .get(row.processed_at || '', num, key);
  return undone ? null : row;
}


// ------------------------------------------------------------------ marks --
// ONE RULE ON EVERY CARD (Ritvars, 14.10.2026, "Ieva finds the 7 reasons too many"): Set aside is one click with no
// reason, and Supplier or vendor, Internal and Spam are a MARK on the phone number or the email address instead, kept
// until somebody changes it (contact_marks). A marked number or address never pops up and never reaches the Inbox.
// The memory above is reused, not replaced: a number set aside with one of those reasons BEFORE the change still counts
// as marked (Bring back still undoes that one), until somebody removes the mark.
export const MARKS = (CFG.intake && CFG.intake.marks) || ['Supplier or vendor', 'Internal', 'Spam'];
const LEGACY = (CFG.phoneFilter && CFG.phoneFilter.filterArchivedAs) || [];

export const emailKey = (e) => {
  const v = String(e || '').trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+$/.test(v) ? 'email:' + v : null;
};
// The keys a contact is marked under: its number (last 8 digits, as everywhere) and its address. Either is enough.
export const contactKeys = ({ phone, email } = {}) => [phoneThread(phone), emailKey(email)].filter(Boolean);

// The mark on this number or address, or null. A row in contact_marks decides (mark NULL = removed); without one,
// only a number can still be marked the old way.
export async function markFor(db, { phone, email } = {}) {
  for (const key of contactKeys({ phone, email })) {
    const row = await db.prepare('SELECT mark, set_by, set_at FROM contact_marks WHERE contact_key = ?').get(key);
    if (row) {
      if (row.mark) return { key, mark: row.mark, by: row.set_by, at: row.set_at, legacy: false };
      continue;
    }
    if (key.startsWith('phone:')) {
      const old = await rememberedAs(db, phone, LEGACY);
      if (old) return { key, mark: old.archive_reason, by: old.processed_by || null, at: old.processed_at || null, legacy: true };
    }
  }
  return null;
}

// What a row set aside by a mark says about it.
export const markedWhy = (m) => `this ${String(m.key).startsWith('email:') ? 'address' : 'number'} is marked "${m.mark}"`;
