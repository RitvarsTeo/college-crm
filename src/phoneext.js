// PHONE EXTENSIONS -> PEOPLE (patch 184, the owner 24.11.2026: "cant we just match the buttons of phone to the names? you know this
// already."). Since 23.11.2026 TeleGroup names the line that answered (destination_name "Student communication", destination_num 206),
// not the person. Admins say who answers each extension (Help center > For admins > Phone extensions); every change is kept with who
// and when. A call answered on an extension with a person shows that person; with nobody set (several people, or not known yet) it
// shows the line's name, as before.
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
export const extKey = (s) => clean(s).slice(0, 40);

/** The person who answers this extension, or null. */
export async function personFor(db, extension) {
  const ext = extKey(extension);
  if (!ext) return null;
  const r = await db.prepare('SELECT person_name FROM pbx_extensions WHERE extension = ?').get(ext);
  return (r && r.person_name) || null;
}

/** Every extension TeleGroup has sent, and every one an admin set: line name, person, calls answered on it, last seen, history. */
export async function listExtensions(db) {
  const seen = await db.prepare(`SELECT extension, MAX(operator) AS line, COUNT(DISTINCT call_id) AS calls, MAX(at) AS last
    FROM call_events WHERE extension IS NOT NULL AND extension <> '' AND source = 'provider' GROUP BY extension`).all();
  const set = await db.prepare('SELECT extension, person_name, set_by, set_at FROM pbx_extensions').all();
  const hist = await db.prepare('SELECT extension, old_person, new_person, by_name, at FROM pbx_extension_history ORDER BY id DESC').all();
  const out = new Map();
  for (const r of seen) out.set(r.extension, { extension: r.extension, line: r.line || null, calls: Number(r.calls) || 0, last: r.last || null });
  for (const r of set) {
    const x = out.get(r.extension) || { extension: r.extension, line: null, calls: 0, last: null };
    out.set(r.extension, { ...x, person: r.person_name || null, setBy: r.set_by, setAt: r.set_at });
  }
  return [...out.values()].map((x) => ({ person: null, ...x, history: hist.filter((h) => h.extension === x.extension)
    .map((h) => ({ from: h.old_person || null, to: h.new_person || null, by: h.by_name, at: h.at })) }))
    .sort((a, b) => a.extension.localeCompare(b.extension, 'en', { numeric: true }));
}

/** Say who answers an extension ('' = several people / not known: the line name shows). One history line per real change. */
export async function setExtension(db, { extension, person, by, at = new Date().toISOString() }) {
  const ext = extKey(extension);
  if (!ext) throw new Error('Which extension?');
  const name = clean(person).slice(0, 80) || null;
  const was = await db.prepare('SELECT person_name FROM pbx_extensions WHERE extension = ?').get(ext);
  const before = (was && was.person_name) || null;
  if (was && before === name) return { changed: false };
  if (was) await db.prepare('UPDATE pbx_extensions SET person_name = ?, set_by = ?, set_at = ? WHERE extension = ?').run(name, by, at, ext);
  else await db.prepare('INSERT INTO pbx_extensions (extension, person_name, set_by, set_at) VALUES (?,?,?,?)').run(ext, name, by, at);
  await db.prepare('INSERT INTO pbx_extension_history (extension, old_person, new_person, by_name, at) VALUES (?,?,?,?,?)').run(ext, before, name, by, at);
  return { changed: true };
}

/** Stored answered calls whose answering extension has a person and whose operator is not that person yet (the back-fill). */
export async function backfillPlan(db) {
  const rows = await db.prepare(`SELECT c.uniqueid, c.called_at, c.operator_name, e.extension, x.person_name
    FROM pbx_calls c JOIN call_events e ON e.call_id = c.uniqueid AND e.event = 'answered' AND e.source = 'provider'
    JOIN pbx_extensions x ON x.extension = e.extension
    WHERE c.picked_up = 1 AND x.person_name IS NOT NULL ORDER BY c.called_at`).all();
  return rows.filter((r) => r.operator_name !== r.person_name);
}
