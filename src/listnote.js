// JOURNEY -> LIST SHOWS THE LATEST NOTE (the owner, 16.10.2026, after Admissions: "notes do not show, but I think I
// marked them"). The notes were there, in History; the List row did not show any. Under each List row, one quiet line:
// the newest of the three places a person's notes are written, with who and when.
//   1. a note or a call somebody wrote (events, origin manual, kind note or call, with text): Add a note, Log a call,
//      the comment typed when a card was made a lead, and the call notes that travelled with it. Lines a machine
//      wrote under a person's name are left out: a merge (its text is contact details), the visit tick, the SIS
//      admission-date fix, and a "Qualified from" line whose text is only the Inbox's own suggestion.
//   2. the person's Notes field (people.notes), dated by its last edit (who and when come from that History line).
//      Notes from before Intake (the sheet import) have no edit: shown only when nothing dated exists.
//   3. "What was it about?" on a known person's answered call (pbx_calls.note), at the time of the call.
// One query: three LEFT JOINs on the List's own SELECT (src/server.js GET /api/people), no request per row.
// The text is returned as stored; the page escapes it and cuts it to one line.

export const LIST_NOTE_MACHINE_SUBJECTS = ['Merged: %', 'Attended the visit', 'Did not attend', 'Admission date set from SIS%'];

const notMachine = LIST_NOTE_MACHINE_SUBJECTS.map((s) => `COALESCE(e.subject, '') NOT LIKE '${s.replace(/'/g, "''")}'`).join(' AND ');

export const LIST_NOTE_COLS = `ln_e.body AS ln_event_text, ln_e.actor AS ln_event_by, ln_e.occurred_at AS ln_event_at,
  ln_n.actor AS ln_notes_by, ln_n.occurred_at AS ln_notes_at,
  ln_c.note AS ln_call_text, ln_c.note_by AS ln_call_by, ln_c.called_at AS ln_call_at`;

export const LIST_NOTE_JOINS = `
  LEFT JOIN events ln_e ON ln_e.id = (SELECT e.id FROM events e WHERE e.person_id = pe.id AND e.origin = 'manual'
    AND e.kind IN ('note', 'call') AND TRIM(COALESCE(e.body, '')) <> '' AND ${notMachine}
    AND NOT (COALESCE(e.subject, '') LIKE 'Qualified from %'
      AND EXISTS (SELECT 1 FROM inbound i WHERE i.person_id = e.person_id AND i.suggestion_why = e.body))
    ORDER BY e.occurred_at DESC, e.id DESC LIMIT 1)
  LEFT JOIN events ln_n ON ln_n.id = (SELECT e.id FROM events e WHERE e.person_id = pe.id AND e.kind = 'edit'
    AND e.field = 'notes' ORDER BY e.occurred_at DESC, e.id DESC LIMIT 1)
  LEFT JOIN pbx_calls ln_c ON ln_c.uniqueid = (SELECT c.uniqueid FROM pbx_calls c WHERE c.person_id = pe.id
    AND TRIM(COALESCE(c.note, '')) <> '' ORDER BY c.called_at DESC LIMIT 1)`;

const LN_KEYS = ['ln_event_text', 'ln_event_by', 'ln_event_at', 'ln_notes_by', 'ln_notes_at', 'ln_call_text', 'ln_call_by', 'ln_call_at'];
const time = (v) => { const t = Date.parse(v || ''); return Number.isFinite(t) ? t : null; };
const iso = (v) => (v instanceof Date ? v.toISOString() : v || null);

/** The newest of the three for one row, as { text, by, at, from } or null; the helper columns are taken off the row. */
export function pickListNote(row) {
  const said = [];
  if (String(row.ln_event_text || '').trim()) said.push({ text: row.ln_event_text, by: row.ln_event_by || null, at: iso(row.ln_event_at), from: 'history' });
  if (String(row.notes || '').trim()) said.push({ text: row.notes, by: row.ln_notes_at ? row.ln_notes_by || null : null, at: iso(row.ln_notes_at), from: 'notes' });
  if (String(row.ln_call_text || '').trim()) said.push({ text: row.ln_call_text, by: row.ln_call_by || null, at: iso(row.ln_call_at), from: 'call' });
  for (const k of LN_KEYS) delete row[k];
  if (!said.length) return null;
  // the newest dated one; an undated Notes field only when nothing is dated
  return said.reduce((best, s) => ((time(s.at) ?? -Infinity) > (time(best.at) ?? -Infinity) ? s : best));
}
