// OWNERSHIP (29.10.2026). The owner: "each of these managers can add these clients to themselves! and anyone who has account in TC
// part of Intake can add to the whole pool of clients people under theyre ownership!" Make mine sets the company's person in charge
// to the signed-in account; a company added by hand goes under its adder, and so does a company with nobody in charge that a person
// is added to. THE NEW ADDITIONS TAB, its approvals, flags and email are gone (patch 178, his words 24.11.2026 "also remove the tab
// new additions, doesnt make sense"); the tc_additions table stays in the database, unread (it was empty).
import { TcInputError, logTcActivity } from './tc.js';

const nowIso = () => new Date().toISOString();
const low = (s) => String(s || '').trim().toLowerCase();


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

/** After a company or a person is added by hand: a company with nobody in charge goes under its adder. */
export async function added(db, { kind, companyId, contactId = null }, me) {
  const by = me && me.name ? me.name : '', email = me && me.email ? low(me.email) : '';
  const c = await db.prepare('SELECT id, pic_email FROM tc_companies WHERE id = ?').get(Number(companyId));
  if (c && email && !c.pic_email) {
    await db.prepare('UPDATE tc_companies SET pic_name = ?, pic_email = ?, updated_at = ? WHERE id = ?').run(by, email, nowIso(), c.id);
  }
  void kind; void contactId;
  return { ok: true };
}

