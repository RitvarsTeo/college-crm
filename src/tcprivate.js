// PRIVATE CLIENTS (23.11.2026, patch 166; his words "but there should be b2b and b2c client segments!", his pick "A: Private clients
// list" and "Yes, build it" on TC_B2C_1..3). A Training Centre client who comes for themselves, not for a company (a seafarer paying
// for his own course): their own record under Clients, never a fake company. Name, phone, email, the course, where they came from,
// the person in charge, a next contact, and their own history. Nothing is deleted: a private client is archived.
// One number is one person: adding a phone that is already a private client's (last 8 digits) adds to that person instead.
export class PrivateError extends Error {}
const bad = (m) => { throw new PrivateError(m); };
const clip = (v, n = 2000) => { const s = String(v ?? '').trim(); return s ? s.slice(0, n) : null; };
const nowIso = () => new Date().toISOString();
const last8 = (n) => String(n || '').replace(/\D/g, '').slice(-8);
// no client levels (24.11.2026, his decision "Yes, remove"): the old status column is written with its default and never read
const KINDS = ['call', 'email', 'whatsapp', 'physical_meeting', 'digital_meeting', 'note'];

async function line(db, clientId, { kind, at, body, actor }) {
  await db.prepare('INSERT INTO tc_private_history (client_id, kind, occurred_at, body, actor, created_at) VALUES (?,?,?,?,?,?)')
    .run(clientId, kind, at || nowIso(), clip(body, 4000), actor || null, nowIso());
}

/** Every private client (not archived), the newest contact first: { rows: [{ id, name, phone, course, lastAt, lastKind }] }. */
export async function list(db) {
  const rows = await db.prepare(`SELECT c.id, c.name, c.phone, c.email, c.course, c.owner, c.next_at,
      (SELECT MAX(h.occurred_at) FROM tc_private_history h WHERE h.client_id = c.id) AS last_at
    FROM tc_private_clients c WHERE c.archived_at IS NULL`).all();
  const kinds = new Map();
  for (const r of rows) {
    const h = r.last_at ? await db.prepare('SELECT kind FROM tc_private_history WHERE client_id = ? AND occurred_at = ? ORDER BY id DESC LIMIT 1').get(r.id, r.last_at) : null;
    kinds.set(Number(r.id), h ? h.kind : null);
  }
  return { rows: rows.map((r) => ({ id: Number(r.id), name: r.name, phone: r.phone, email: r.email, course: r.course, owner: r.owner, nextAt: r.next_at,
    lastAt: r.last_at || null, lastKind: kinds.get(Number(r.id)) })).sort((a, b) => String(b.lastAt || '').localeCompare(String(a.lastAt || '')) || a.name.localeCompare(b.name, 'lv')) };
}

/** One private client with their history, newest first. */
export async function get(db, id) {
  const c = await db.prepare('SELECT * FROM tc_private_clients WHERE id = ? AND archived_at IS NULL').get(Number(id));
  if (!c) bad('There is no such private client, or they are archived.');
  const history = await db.prepare('SELECT id, kind, occurred_at, body, actor FROM tc_private_history WHERE client_id = ? ORDER BY occurred_at DESC, id DESC').all(c.id);
  return { client: { id: Number(c.id), name: c.name, phone: c.phone, email: c.email, course: c.course, cameFrom: c.came_from, owner: c.owner, nextAt: c.next_at, createdAt: c.created_at },
    history: history.map((h) => ({ id: Number(h.id), kind: h.kind, at: h.occurred_at, body: h.body, by: h.actor })), kinds: KINDS };
}

/** Add a private client (from "+ Private client", or B2C on a Training Centre Inbox card). Returns { id, created }. */
export async function add(db, b, actor) {
  if (!actor) bad('Who is adding?');
  const name = clip(b.name, 200), phone = clip(b.phone, 60), email = clip(b.email, 200);
  if (!name && !phone && !email) bad('A private client needs a name, a phone or an email.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) bad('That email address does not look right.');
  const at = nowIso();
  // one number is one person
  if (phone && last8(phone).length === 8) {
    const twin = (await db.prepare('SELECT id, phone FROM tc_private_clients WHERE archived_at IS NULL AND phone IS NOT NULL').all()).find((r) => last8(r.phone) === last8(phone));
    if (twin) {
      if (b.note) await line(db, twin.id, { kind: b.via === 'whatsapp' ? 'whatsapp' : 'note', at, body: b.via === 'whatsapp' ? `WhatsApp from ${name || phone}. ${b.note}` : b.note, actor });
      return { id: Number(twin.id), created: false };
    }
  }
  // patch 167: one email address is one person too (a training@ card)
  if (email && b.via === 'email') {
    const twin = await db.prepare('SELECT id FROM tc_private_clients WHERE archived_at IS NULL AND email = ?').get(email.toLowerCase());
    if (twin) { await line(db, twin.id, { kind: 'email', at, body: `Email from ${name || email}.${b.note ? ' ' + b.note : ''}`, actor }); return { id: Number(twin.id), created: false }; }
  }
  const r = await db.prepare(`INSERT INTO tc_private_clients (name, phone, email, course, came_from, owner, status, created_at, created_by) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(name || phone || email, phone, email ? email.toLowerCase() : null, clip(b.course, 200), clip(b.via === 'whatsapp' ? 'WhatsApp' : b.via === 'email' ? 'Email' : b.cameFrom, 100), clip(b.owner, 120) || actor, 'not_contacted', at, actor);
  const id = Number(r.lastInsertRowid);
  if (b.via === 'whatsapp') await line(db, id, { kind: 'whatsapp', at, body: `WhatsApp from ${name || phone}.${b.note ? ' ' + b.note : ''}`, actor });
  else if (b.via === 'email') await line(db, id, { kind: 'email', at, body: `Email from ${name || email}.${b.note ? ' ' + b.note : ''}`, actor });
  else if (b.note) await line(db, id, { kind: 'note', at, body: b.note, actor });
  return { id, created: true };
}

/** Change the details or the next contact. Each change is a line in the history. */
export async function update(db, id, b, actor) {
  const c = await db.prepare('SELECT * FROM tc_private_clients WHERE id = ? AND archived_at IS NULL').get(Number(id));
  if (!c) bad('There is no such private client, or they are archived.');
  const fields = { name: [b.name === undefined ? undefined : clip(b.name, 200), 'Name'], phone: [b.phone === undefined ? undefined : clip(b.phone, 60), 'Phone'], email: [b.email === undefined ? undefined : clip(b.email, 200), 'Email'],
    course: [b.course === undefined ? undefined : clip(b.course, 200), 'Course'], owner: [b.owner === undefined ? undefined : clip(b.owner, 120), 'Person in charge'],
    next_at: [b.nextAt === undefined ? undefined : (clip(b.nextAt, 10) || null), 'Next contact'] };
  if (fields.next_at[0] && !/^\d{4}-\d{2}-\d{2}$/.test(fields.next_at[0])) bad('The next contact is a day.');
  if (fields.email[0] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email[0])) bad('That email address does not look right.');
  const at = nowIso();
  for (const [col, [v, label]] of Object.entries(fields)) {
    if (v === undefined || (v === null && (col === 'name'))) continue;
    if (String(v ?? '') === String(c[col] ?? '')) continue;
    await db.prepare(`UPDATE tc_private_clients SET ${col} = ?, updated_at = ?, updated_by = ? WHERE id = ?`).run(v, at, actor || null, c.id);
    await line(db, c.id, { kind: 'edit', at, body: `${label}: ${v ?? 'none'}`, actor });
  }
  return { ok: true };
}

/** Log a communication: what (call, email, WhatsApp, meeting, note), the day, what was said, and the next contact. */
export async function log(db, id, b, actor) {
  const c = await db.prepare('SELECT id FROM tc_private_clients WHERE id = ? AND archived_at IS NULL').get(Number(id));
  if (!c) bad('There is no such private client, or they are archived.');
  const kind = String(b.kind || '');
  if (!KINDS.includes(kind)) bad('What was it: a call, an email, a WhatsApp, a meeting or a note?');
  const day = clip(b.day, 10);
  if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) bad('The day is a date.');
  await line(db, c.id, { kind, at: day ? day + 'T12:00:00.000Z' : nowIso(), body: clip(b.body, 4000), actor });
  if (b.nextAt !== undefined) await update(db, c.id, { nextAt: b.nextAt }, actor);
  return { ok: true };
}

/** Archive (never delete). */
export async function archive(db, id, actor) {
  const r = await db.prepare('UPDATE tc_private_clients SET archived_at = ?, archived_by = ? WHERE id = ? AND archived_at IS NULL').run(nowIso(), actor || null, Number(id));
  if (!Number(r.changes)) bad('There is no such private client, or they are archived.');
  return { ok: true };
}
