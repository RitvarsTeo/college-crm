// A PERSON'S COMMENTS IN THE EDIT PANEL (Admissions, 20.10.2026: "I can no longer edit earlier comments - when I open
// it I have to write in a new box", "from this view I can't see the full comment either", "for some people earlier
// comments show in the box, for others not"). The panel's Notes box showed only the Notes field (people.notes); a
// comment written with Add a note, Log a call or Make a lead lives in History (events), and a call's "What was it
// about?" on the call (pbx_calls.note). ONE rule, the List line's (src/listnote.js): the comments are those three
// places, newest first, whole text, with who and when.
//
// EDITING: whoever wrote a History comment or a call note may edit it, and an admin any. The Notes field is the person's
// shared field and stays editable by every user, as it was in the panel. Nothing is lost: every edit writes a History
// line "Comment edited" (field 'comment', the old text and the new, the comment it belongs to as its body), and the
// Notes field keeps its own "Notes changed" line (src/history.js applyEdit). Nothing moves between the Notes field and
// History; a comment is never emptied. Adding a comment stays one box (POST /api/people/<id>/note, as before).
import { logEvent, applyEdit, MANUAL } from './history.js';
import { LIST_NOTE_EVENT_WHERE } from './listnote.js';
import { CALL_NOTE_MAX } from './intake.js';

export const COMMENT_EDITED = 'Comment edited';
const iso = (v) => (v instanceof Date ? v.toISOString() : v || null);
const time = (v) => { const t = Date.parse(v || ''); return Number.isFinite(t) ? t : -Infinity; };

/** The person's comments, newest first: [{ ref, from, kind, text, by, at, canEdit, edited }] or null (no such person). */
export async function commentsFor(db, personId, { viewer = '', admin = false } = {}) {
  const person = await db.prepare('SELECT id, notes FROM people WHERE id = ?').get(personId);
  if (!person) return null;
  const edits = await db.prepare(`SELECT body, actor, occurred_at FROM events WHERE person_id = ? AND kind = 'edit'
    AND field = 'comment' ORDER BY occurred_at DESC, id DESC`).all(personId);
  const editedOf = (ref) => { const e = edits.find((x) => x.body === ref); return e ? { by: e.actor || null, at: iso(e.occurred_at) } : null; };
  const mine = (who) => Boolean(viewer) && who === viewer;
  const out = [];
  for (const e of await db.prepare(`SELECT e.id, e.kind, e.subject, e.body, e.actor, e.occurred_at FROM events e
      WHERE e.person_id = ? AND ${LIST_NOTE_EVENT_WHERE} ORDER BY e.occurred_at DESC, e.id DESC`).all(personId)) {
    const ref = `event:${e.id}`;
    out.push({ ref, from: 'history', kind: e.kind, subject: e.subject || null, text: e.body, by: e.actor || null,
      at: iso(e.occurred_at), canEdit: admin || mine(e.actor), edited: editedOf(ref) });
  }
  if (String(person.notes || '').trim()) {
    const last = await db.prepare(`SELECT actor, occurred_at FROM events WHERE person_id = ? AND kind = 'edit' AND field = 'notes'
      ORDER BY occurred_at DESC, id DESC LIMIT 1`).get(personId);
    out.push({ ref: 'notes', from: 'notes', kind: 'notes', subject: null, text: person.notes, by: last ? last.actor || null : null,
      at: last ? iso(last.occurred_at) : null, canEdit: Boolean(viewer) || admin, edited: null });
  }
  for (const c of await db.prepare(`SELECT uniqueid, called_at, note, note_by FROM pbx_calls WHERE person_id = ?
      AND TRIM(COALESCE(note, '')) <> '' ORDER BY called_at DESC`).all(personId)) {
    const ref = `call:${c.uniqueid}`;
    out.push({ ref, from: 'call', kind: 'call', subject: null, text: c.note, by: c.note_by || null, at: iso(c.called_at),
      canEdit: admin || mine(c.note_by), edited: editedOf(ref) });
  }
  // newest first; the Notes field from before Intake (no edit, no date) last
  return out.sort((a, b) => time(b.at) - time(a.at));
}

/** Edits one comment. { ok, changed } or { error, status }. */
export async function editComment(db, personId, { ref, text, by, admin = false, at = new Date().toISOString() } = {}) {
  if (!by) return { error: 'who is editing this?', status: 400 };
  const said = String(text ?? '').replace(/\r\n/g, '\n').trim();
  if (!said) return { error: 'a comment cannot be emptied; write what it should say', status: 400 };
  const m = /^(event|call):(.+)$/.exec(String(ref || ''));
  if (ref === 'notes') {
    const p = await db.prepare('SELECT notes FROM people WHERE id = ?').get(personId);
    if (!p) return { error: 'not found', status: 404 };
    const r = await applyEdit(db, personId, { notes: said }, by, at);   // "Notes changed", the old text kept
    if (r.error) return { error: r.error, status: 400 };
    return { ok: true, changed: r.changes.length > 0 };
  }
  if (!m) return { error: 'not a comment', status: 400 };
  const refuse = { error: 'only who wrote this comment, or an admin, can edit it', status: 403 };
  if (m[1] === 'event') {
    const id = Number(m[2]);
    if (!Number.isInteger(id)) return { error: 'not a comment', status: 400 };
    const e = await db.prepare(`SELECT e.id, e.body, e.actor FROM events e WHERE e.id = ? AND e.person_id = ? AND ${LIST_NOTE_EVENT_WHERE}`)
      .get(id, personId);
    if (!e) return { error: 'not found', status: 404 };
    if (!admin && e.actor !== by) return refuse;
    if (e.body === said) return { ok: true, changed: false };
    await db.transaction(async (tx) => {
      await tx.prepare('UPDATE events SET body = ? WHERE id = ?').run(said, e.id);
      await logEvent(tx, { personId, kind: 'edit', direction: 'note', at, origin: MANUAL, actor: by, subject: COMMENT_EDITED,
        body: ref, field: 'comment', oldValue: e.body, newValue: said });
    });
    return { ok: true, changed: true };
  }
  const c = await db.prepare(`SELECT uniqueid, note, note_by FROM pbx_calls WHERE uniqueid = ? AND person_id = ?
    AND TRIM(COALESCE(note, '')) <> ''`).get(m[2], personId);
  if (!c) return { error: 'not found', status: 404 };
  if (!admin && c.note_by !== by) return refuse;
  const line = said.replace(/\s+/g, ' ');   // a call note is one line, as "What was it about?" writes it
  if (line.length > CALL_NOTE_MAX) return { error: `one line, at most ${CALL_NOTE_MAX} characters`, status: 400 };
  if (c.note === line) return { ok: true, changed: false };
  await db.transaction(async (tx) => {
    await tx.prepare('UPDATE pbx_calls SET note = ? WHERE uniqueid = ?').run(line, c.uniqueid);
    await logEvent(tx, { personId, kind: 'edit', direction: 'note', at, origin: MANUAL, actor: by, subject: COMMENT_EDITED,
      body: ref, field: 'comment', oldValue: c.note, newValue: line });
  });
  return { ok: true, changed: true };
}
