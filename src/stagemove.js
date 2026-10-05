// A NOTE ON EVERY STAGE MOVE (Q15, the owner 05.10.2026): "Going back and in overall moving stages
// should be documented, so notes box its for this. How could we in the best way make it work and
// not to annoy the user?"
//
// A move BACK needs a note before it saves; a move FORWARD asks for one and can be skipped. A note
// or a logged call on that person in the last few minutes counts as the note, so nobody is asked
// twice (config.stageMoveNote.recentMinutes, 10 suggested). Who, from, to and when are already in
// History; the note is the why.
//
// Stage order is the Journey order (config.stages without the closed stage). Leaving the closed
// stage for any other is a move back. A move INTO the closed stage is not this rule's business: it
// has its own reason dialog (Decision 8).
//
// The page carries the same moveDirection(); test/stage_move_note.test.js holds the two together.

export function moveDirection(config, from, to) {
  const closed = (config.stageRoles || {}).closed || 'Not proceeding';
  if (!to || from === to) return 'none';
  if (to === closed) return 'close';
  if (from === closed) return 'back';
  const order = (config.stages || []).map((s) => s.id).filter((s) => s !== closed);
  const a = order.indexOf(from); const b = order.indexOf(to);
  if (a < 0 || b < 0) return 'forward';          // a stage the config does not know never blocks
  return b < a ? 'back' : 'forward';
}

export function recentMinutes(config) {
  const n = Number((config.stageMoveNote || {}).recentMinutes);
  return n > 0 ? n : 10;
}

// The kinds a person writes by hand: the plain note plus every note type in the config
// (call, visit, admissions, stage, other). Only origin = manual counts: an automatic call
// row says the phone rang, not why the stage changed.
export function noteKinds(config) {
  return ['note', ...((config.noteTypes || []).map((t) => t.id))];
}

export async function lastNoteWithin(db, config, personId, nowIso) {
  const since = new Date(Date.parse(nowIso) - recentMinutes(config) * 60000).toISOString();
  const kinds = noteKinds(config);
  const row = await db.prepare(`SELECT occurred_at FROM events WHERE person_id = ? AND origin = 'manual'
    AND kind IN (${kinds.map(() => '?').join(', ')}) AND occurred_at >= ? ORDER BY occurred_at DESC LIMIT 1`)
    .get(personId, ...kinds, since);
  return row ? row.occurred_at : null;
}

// What a status move needs. covered = a recent note already says why.
export async function moveCheck(db, config, personId, from, to, nowIso) {
  const direction = moveDirection(config, from, to);
  const at = direction === 'back' || direction === 'forward' ? await lastNoteWithin(db, config, personId, nowIso) : null;
  return { direction, covered: !!at, noteAt: at, minutes: recentMinutes(config) };
}
