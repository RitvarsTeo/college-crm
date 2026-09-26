// The history log. One table, two origins.
//
// Decided 23.09.2026: manual actions and automatic events belong in the same log,
// each labelled, and an edit is written the same way - which field, from what, to
// what, by whom, when. Every write in the prototype goes through logEvent so that
// 'origin' cannot be forgotten in one place and remembered in twenty others.

export const MANUAL = 'manual';
export const AUTOMATIC = 'automatic';

// Which fields a person may correct after the record exists.
// Decided 23.09.2026: everything except where the person came from and when we
// first heard from them. Those two are historical fact, not current state, and a
// later touch must never be able to rewrite them.
export const EDITABLE_FIELDS = [
  'name', 'email', 'phone', 'programme', 'study_form', 'education', 'nationality', 'owner', 'notes',
];

// Named so a refusal can say WHY, not just no.
export const IMMUTABLE_FIELDS = {
  source_channel: 'where the person came from is a historical fact',
  source_campaign: 'where the person came from is a historical fact',
  source_detail: 'where the person came from is a historical fact',
  created_at: 'the first contact date is a historical fact',
  id: 'the identifier never changes',
  status: 'the status has its own control and its own history entry',
  student_no: 'the matriculation number comes from the student system',
  contract_at: 'set by the contract step, not by hand',
  admitted_at: 'set by the admission step, not by hand',
  last_contact_at: 'follows the events by itself',
};

export const FIELD_LABELS = {
  name: 'Name', email: 'Email', phone: 'Phone', programme: 'Programme',
  study_form: 'Study form', education: 'Education', nationality: 'Nationality',
  owner: 'Owner', notes: 'Notes',
};

export async function logEvent(db, e) {
  if (!e.origin) throw new Error('logEvent: origin is required (manual or automatic)');
  if (![MANUAL, AUTOMATIC].includes(e.origin)) throw new Error('logEvent: unknown origin ' + e.origin);
  await db.prepare(`INSERT INTO events
    (person_id,kind,channel,direction,occurred_at,subject,body,actor,origin,field,old_value,new_value)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    e.personId, e.kind, e.channel ?? null, e.direction ?? 'note', e.at,
    e.subject ?? null, e.body ?? null, e.actor ?? null, e.origin,
    e.field ?? null, e.oldValue ?? null, e.newValue ?? null);
}

// Applies an edit and writes one history entry per field that really changed.
// Returns { changes: [...] } or { error, field, reason } - it never half-applies:
// an attempt to touch a locked field is refused before anything is written.
export async function applyEdit(db, personId, patch, actor, at) {
  const person = await db.prepare('SELECT * FROM people WHERE id = ?').get(personId);
  if (!person) return { error: 'not found' };

  for (const key of Object.keys(patch)) {
    if (key === 'by') continue;
    if (IMMUTABLE_FIELDS[key]) {
      return { error: `${key} cannot be edited: ${IMMUTABLE_FIELDS[key]}`, field: key };
    }
    if (!EDITABLE_FIELDS.includes(key)) {
      return { error: `${key} is not an editable field`, field: key };
    }
  }

  const norm = (v) => (v === undefined || v === null || v === '' ? null : String(v));
  const changes = [];
  for (const key of EDITABLE_FIELDS) {
    if (!(key in patch)) continue;
    const before = norm(person[key]);
    const after = norm(patch[key]);
    if (before === after) continue;
    changes.push({ field: key, from: before, to: after });
  }

  if (!changes.length) return { changes: [] };
  if (changes.some((c) => c.field === 'name' && !c.to)) {
    return { error: 'name cannot be emptied', field: 'name' };
  }

  for (const c of changes) {
    await db.prepare(`UPDATE people SET ${c.field} = ? WHERE id = ?`).run(c.to, personId);
    await logEvent(db, {
      personId, kind: 'edit', direction: 'note', at, actor, origin: MANUAL,
      subject: `${FIELD_LABELS[c.field] || c.field} changed`,
      body: `${c.from ?? '(empty)'} -> ${c.to ?? '(empty)'}`,
      field: c.field, oldValue: c.from, newValue: c.to,
    });
  }
  return { changes };
}

// The one log the screen reads: person events and integration events merged and
// sorted together, because a reader should not have to know which table a line
// came from to understand what happened.
export async function readHistory(db, { origin = '', kind = '', personId = '', actor = '', limit = 200 } = {}) {
  const rows = [];

  for (const e of await db.prepare(`SELECT ev.*, pe.name AS person_name FROM events ev
      LEFT JOIN people pe ON pe.id = ev.person_id ORDER BY ev.occurred_at DESC, ev.id DESC`).all()) {
    rows.push({
      at: e.occurred_at, origin: e.origin, kind: e.kind, channel: e.channel,
      personId: e.person_id, personName: e.person_name, actor: e.actor,
      subject: e.subject, body: e.body,
      field: e.field, oldValue: e.old_value, newValue: e.new_value,
      source: 'person history', ref: null,
    });
  }

  for (const s of await db.prepare(`SELECT se.*, pe.name AS person_name FROM sim_events se
      LEFT JOIN people pe ON pe.id = se.person_id ORDER BY se.id DESC`).all()) {
    rows.push({
      at: s.at, origin: AUTOMATIC, kind: 'integration', channel: s.channel,
      personId: s.person_id, personName: s.person_name, actor: s.provider || s.account,
      subject: `${s.channel}: ${s.scenario}`,
      body: `${s.direction} - ${s.decision} (${s.status})`,
      field: null, oldValue: null, newValue: null,
      source: 'integration log', ref: s.id,
    });
  }

  let out = rows.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  if (origin) out = out.filter((r) => r.origin === origin);
  if (kind) out = out.filter((r) => r.kind === kind);
  if (personId) out = out.filter((r) => r.personId === personId);
  // 'own actions only': an ordinary user sees what was done under their name.
  // An automatic event carries the provider or the CRM as its actor, so it is
  // excluded by this filter rather than by a rule of its own - it was never
  // their action.
  if (actor) out = out.filter((r) => r.actor === actor);
  return { count: out.length, rows: out.slice(0, limit) };
}
