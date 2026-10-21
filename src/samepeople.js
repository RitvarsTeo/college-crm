// MAYBE THE SAME PERSON (Admissions, 21.10.2026; the owner's pick A on _ieva-feedback/board_2026-10-21.png, row 1).
//
// Production held Brunonas twice: an email lead of 19.10 with Admissions' comments, and a record the SIS made on 20.10,
// empty, with another email, no phone on the lead, and the name written without the Lithuanian letters. Nothing told
// her. The person page now shows one line per other OPEN record that looks like the same person, on BOTH records:
// "Maybe the same person: <name> · <how they came> · <stage> · <n comments>", with Open / Same person / Not the same.
//
// LOOKS LIKE THE SAME PERSON: the same name once case, the Latvian / Lithuanian letters and the word order are folded
// (Manculevičius Brunonas = brunonas manculevicius); or the same email; or the same phone (its last 8 digits).
// "Same person" is the existing "Same person as..." merge (src/sync.js mergeSisDuplicate), which folds a record the SIS
// made into the real one; so it is offered only when one of the two was made by the SIS. "Not the same" writes the pair
// down (person_not_same) and a line in both Histories; the line never shows again for those two. Nothing is deleted.
import { foldName } from './tcpic.js';
import { commentsFor } from './comments.js';
import { logEvent, MANUAL } from './history.js';

const TERMINAL = ['Admitted', 'Not proceeding'];
export const nameKey = (v) => foldName(v).split(' ').filter(Boolean).sort().join(' ');
const emailKey = (v) => String(v || '').trim().toLowerCase();
export const phoneKey = (v) => { const d = String(v || '').replace(/\D/g, ''); return d.length >= 8 ? d.slice(-8) : ''; };
const pair = (a, b) => (String(a) < String(b) ? [String(a), String(b)] : [String(b), String(a)]);

/** Why two people look like one: ['name' | 'email' | 'phone'], empty when they do not. */
export function sameWhy(a, b) {
  const why = [];
  const na = nameKey(a.name), nb = nameKey(b.name);
  if (na && na.includes(' ') && na === nb) why.push('name');
  if (emailKey(a.email) && emailKey(a.email) === emailKey(b.email)) why.push('email');
  if (phoneKey(a.phone) && phoneKey(a.phone) === phoneKey(b.phone)) why.push('phone');
  return why;
}

/** The other open records that look like this person, minus the pairs marked Not the same. */
export async function maybeSame(db, personId) {
  const me = await db.prepare('SELECT id, name, email, phone, status, first_channel, created_at FROM people WHERE id = ?').get(personId);
  if (!me) return null;
  const others = await db.prepare(`SELECT id, name, email, phone, status, first_channel, created_at FROM people WHERE id <> ?`).all(personId);
  const told = new Set((await db.prepare('SELECT person_a, person_b FROM person_not_same WHERE person_a = ? OR person_b = ?')
    .all(String(personId), String(personId))).map((r) => (r.person_a === String(personId) ? r.person_b : r.person_a)));
  const rows = [];
  for (const o of others) {
    if (TERMINAL.includes(o.status) || told.has(String(o.id))) continue;
    const why = sameWhy(me, o);
    if (!why.length) continue;
    const sis = me.first_channel === 'sis' ? me : o.first_channel === 'sis' ? o : null;
    // the SIS-made record folds into the other; two SIS-made ones: the newer into the older
    const source = me.first_channel === 'sis' && o.first_channel === 'sis'
      ? (String(me.created_at || '') > String(o.created_at || '') ? me : o) : sis;
    rows.push({ id: o.id, name: o.name, firstChannel: o.first_channel || '', createdAt: o.created_at || null, stage: o.status, why,
      comments: ((await commentsFor(db, o.id)) || []).length,
      merge: source ? { sourceId: source.id, targetId: source.id === me.id ? o.id : me.id } : null });
  }
  rows.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  return { rows };
}

/** "Not the same": the pair is written down once, and both Histories say so. */
export async function notSame(db, personId, otherId, by, { at = new Date().toISOString() } = {}) {
  if (!by) return { error: 'who is saying so?' };
  if (!otherId || String(otherId) === String(personId)) return { error: 'pick the other record' };
  const a = await db.prepare('SELECT id, name FROM people WHERE id = ?').get(personId);
  const b = await db.prepare('SELECT id, name FROM people WHERE id = ?').get(String(otherId));
  if (!a || !b) return { error: 'not found' };
  const [x, y] = pair(a.id, b.id);
  return db.transaction(async (tx) => {
    if (await tx.prepare('SELECT 1 AS k FROM person_not_same WHERE person_a = ? AND person_b = ?').get(x, y)) return { ok: true, already: true };
    await tx.prepare('INSERT INTO person_not_same (person_a, person_b, marked_at, marked_by) VALUES (?,?,?,?)').run(x, y, at, by);
    for (const [p, q] of [[a, b], [b, a]]) {
      await logEvent(tx, { personId: p.id, kind: 'note', direction: 'note', at, origin: MANUAL, actor: by,
        subject: `Not the same person as ${q.name}` });
    }
    return { ok: true };
  });
}
