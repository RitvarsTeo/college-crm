// THE N3 PHONE DIRECTORY (the owner's yes, 06.11.2026). Marina: seafarers in N3 sometimes call about their sons and
// daughters, and Intake should know them. An admin uploads N3's numbers (id, first name, last name, phone, a second
// phone); Intake keeps only the last 8 digits of each number and uses them for ONE thing: to say "Known in N3: <name>"
// on the call pop-up, the Inbox call card and the person page. Never joined into people, never counted, never listed,
// searched or exported: there is no route that reads the directory out. Every import replaces the whole table, so the
// old copy is gone the moment the new one lands. Step 2 (later, with N3's own team): a live N3 endpoint replaces the
// upload; n3Names stays the one door.
import { phoneKey } from './samepeople.js';

export const N3_MAX_ROWS = 200000;
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const CHUNK = 1000;   // rows per INSERT: 6,000 parameters, under both engines' limits; N3's 39,000 numbers in about 40 trips

/**
 * Replace the whole directory with these rows: [{ id, first, last, phones: ['+371 2...', ...] }] or [id, first, last,
 * phone, phone2, ...]. N3's own export has no id column (10.11.2026, the owner's "Load it as it is"): a row without an
 * id gets its own key from its place in the upload ("row:12"), never a phone number; a full name arrives as `first`
 * with `last` empty and is shown as it is, no first/last guessing. A row with neither an id nor a name, or without a
 * number of 8+ digits, is skipped and counted. Returns { people, numbers, skipped }.
 */
export async function replaceN3Directory(db, rows, { by = null, now = new Date() } = {}) {
  if (!Array.isArray(rows)) throw new Error('rows must be a list');
  if (rows.length > N3_MAX_ROWS) throw new Error(`At most ${N3_MAX_ROWS} rows in one import.`);
  const at = now.toISOString();
  const keep = [];
  const seen = new Set();
  const people = new Set();
  let skipped = 0;
  rows.forEach((raw, i) => {
    // the page sends each row as [id, first, last, phone, phone2, ...] to stay small; an object is read the same way
    const r = (Array.isArray(raw) ? { id: raw[0], first: raw[1], last: raw[2], phones: raw.slice(3) } : raw) || {};
    const first = clip(r.first, 120) || null, last = clip(r.last, 80) || null;
    const id = clip(r.id, 64) || (first || last ? 'row:' + (i + 1) : '');
    const tails = [...new Set((Array.isArray(r.phones) ? r.phones : []).map(phoneKey).filter(Boolean))];
    if (!id || !tails.length) { skipped += 1; return; }
    people.add(id);
    for (const t of tails) {
      const k = id + '|' + t;
      if (seen.has(k)) continue;
      seen.add(k);
      keep.push([id, first, last, t, at, by]);
    }
  });
  if (!keep.length) throw new Error('No row has a name and a phone number, so the directory was left as it was.');
  await db.transaction(async (tx) => {
    await tx.prepare('DELETE FROM n3_phone_directory').run();
    for (let i = 0; i < keep.length; i += CHUNK) {
      const part = keep.slice(i, i + CHUNK);
      await tx.prepare(`INSERT INTO n3_phone_directory (n3_id, first_name, last_name, phone_tail, imported_at, imported_by)
        VALUES ${part.map(() => '(?,?,?,?,?,?)').join(',')}`).run(...part.flat());
    }
  });
  return { people: people.size, numbers: keep.length, skipped };
}

/** What the admin page shows: how many, when and by whom. Never a name or a number. */
export async function n3Status(db) {
  const r = await db.prepare(`SELECT COUNT(*) AS numbers, COUNT(DISTINCT n3_id) AS people, MAX(imported_at) AS at
    FROM n3_phone_directory`).get();
  const numbers = Number((r && r.numbers) || 0);
  if (!numbers) return { numbers: 0, people: 0, importedAt: null, importedBy: null };
  const by = await db.prepare('SELECT imported_by FROM n3_phone_directory ORDER BY id DESC LIMIT 1').get();
  return { numbers, people: Number(r.people || 0), importedAt: r.at, importedBy: (by && by.imported_by) || null };
}

/** The names N3 holds for this number (a family can share one): at most two, "First Last". [] when none. */
export async function n3Names(db, phone) {
  const t = phoneKey(phone);
  if (!t) return [];
  let rows;
  try {
    rows = await db.prepare(`SELECT n3_id, first_name, last_name FROM n3_phone_directory WHERE phone_tail = ?
      ORDER BY last_name, first_name, n3_id LIMIT 10`).all(t);
  } catch { return []; }   // a database from before the table: nobody is known
  const names = [];
  for (const r of rows) {
    const n = [r.first_name, r.last_name].filter(Boolean).join(' ').trim();
    if (n && !names.includes(n)) names.push(n);
    if (names.length === 2) break;
  }
  return names;
}
