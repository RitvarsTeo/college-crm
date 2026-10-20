// THE PERSON IN CHARGE IS AN ACCOUNT WHERE ONE EXISTS (20.10.2026).
//
// The owner, 20.10.2026: the person in charge is stored as the name written in the Excel (pic_name); pic_email is the
// link to an Intake account. A name is linked only when it CLEARLY matches one account: the full name, case and
// diacritics folded ("Maris Cirulis" = "Māris Cīrulis"), or the account email's name ("aigars.kluga@" = "Aigars Klūga").
// A one-word display name ("Aigars") never matches on its own, and a name two accounts could be is left alone. Names
// without an account stay plain names: colleagues without Intake access. "A ; B" (two people) is not one person, so it
// is never linked; "Mine" still finds it for both.
//
// Pure data functions: every one takes the database first, like src/tc.js.

/** Lower case, accents folded, anything that is not a letter or digit a space. */
export function foldName(v) {
  return String(v ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
const fullName = (k) => (k.split(' ').length >= 2 ? k : '');

/** The names an account clearly answers to: its display name and its email's name, each only when two words or more. */
export function accountKeys(u) {
  const keys = new Set();
  const a = fullName(foldName(u && (u.display_name ?? u.name)));
  if (a) keys.add(a);
  const local = String((u && u.email) || '').split('@')[0];
  const b = fullName(foldName(local.replace(/[._-]+/g, ' ')));
  if (b) keys.add(b);
  return keys;
}

/** The people a person-in-charge field names: "A ; B" is two. */
export const picParts = (name) => String(name ?? '').split(/\s*;\s*/).map(foldName).filter(Boolean);

/** Every active account with what it answers to and whether it opens Training Centre. */
export async function accountIndex(db) {
  const users = await db.prepare('SELECT id, email, display_name FROM crm_users WHERE active = 1').all();
  const tc = new Set((await db.prepare(`SELECT user_id FROM crm_user_areas WHERE area = 'tc'`).all()).map((r) => String(r.user_id)));
  const byKey = new Map();
  const list = users.map((u) => ({ id: String(u.id), email: String(u.email).toLowerCase(), name: u.display_name || u.email, tc: tc.has(String(u.id)),
    keys: accountKeys(u) }));
  for (const u of list) for (const k of u.keys) { if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(u); }
  return { list, byKey, byEmail: new Map(list.map((u) => [u.email, u])), byId: new Map(list.map((u) => [u.id, u])) };
}

/** The one account a name clearly is, or null (no account, two accounts, or two people in the field). */
export function matchAccount(index, name) {
  const parts = picParts(name);
  if (parts.length !== 1) return null;
  const hit = [...new Set(index.byKey.get(parts[0]) || [])];
  return hit.length === 1 ? hit[0] : null;
}

/**
 * Fill pic_email where the name clearly is an account and nothing is linked yet. Once per name per company: a row an
 * admin already linked or unlinked is never touched. Each link is one line in the company's log.
 */
export async function linkPicAccounts(db, { at = new Date().toISOString(), actor = 'Intake' } = {}) {
  const index = await accountIndex(db);
  const rows = await db.prepare(`SELECT id, pic_name FROM tc_companies WHERE archived_at IS NULL AND pic_email IS NULL
    AND pic_name IS NOT NULL`).all();
  const linked = {};
  const todo = rows.map((r) => ({ r, u: matchAccount(index, r.pic_name) })).filter((x) => x.u);
  if (!todo.length) return { linked: 0, names: linked };
  await db.transaction(async (tx) => {
    for (const { r, u } of todo) {
      const done = await tx.prepare('UPDATE tc_companies SET pic_email = ?, updated_at = ? WHERE id = ? AND pic_email IS NULL').run(u.email, at, r.id);
      if (!Number(done.changes)) continue;   // another instance booting at the same moment linked it first
      await tx.prepare(`INSERT INTO tc_activities (company_id, kind, occurred_at, body, actor, origin, field, old_value, new_value)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(r.id, 'edit', at, `Person in charge linked to the Intake account of ${r.pic_name}`, actor, 'system',
        'pic_account', null, r.pic_name);
      linked[r.pic_name] = (linked[r.pic_name] || 0) + 1;
    }
  });
  return { linked: Object.values(linked).reduce((n, k) => n + k, 0), names: linked };
}

/** The name an account goes by as person in charge: the name already written on its companies, else its display name. */
export async function picLabels(db) {
  const rows = await db.prepare(`SELECT pic_email, pic_name, COUNT(*) AS n FROM tc_companies WHERE archived_at IS NULL
    AND pic_email IS NOT NULL AND pic_name IS NOT NULL GROUP BY pic_email, pic_name`).all();
  const best = new Map();
  for (const r of rows) {
    const e = String(r.pic_email).toLowerCase();
    if (!best.has(e) || Number(r.n) > best.get(e).n) best.set(e, { name: r.pic_name, n: Number(r.n) });
  }
  return new Map([...best].map(([e, v]) => [e, v.name]));
}

/**
 * The list an admin picks from: every active account that opens Training Centre (value 'u:<id>'), then the plain names
 * already on companies that are no account (colleagues without Intake access). "A ; B" stays a choice of its own.
 */
export async function picChoices(db) {
  const index = await accountIndex(db);
  const labels = await picLabels(db);
  const byLv = (a, b) => String(a.label).localeCompare(String(b.label), 'lv');
  const accounts = index.list.filter((u) => u.tc).map((u) => ({ value: 'u:' + u.id, label: labels.get(u.email) || u.name, account: true }))
    .sort(byLv);
  const names = (await db.prepare(`SELECT DISTINCT pic_name FROM tc_companies WHERE archived_at IS NULL AND pic_name IS NOT NULL
    AND pic_email IS NULL`).all()).map((r) => r.pic_name).filter((n) => n && !matchAccount(index, n))
    .map((n) => ({ value: n, label: n, account: false })).sort(byLv);
  const seen = new Set(accounts.map((a) => foldName(a.label)));
  return [...accounts, ...names.filter((n) => !seen.has(foldName(n.label)))];
}

/** What the signed-in person answers to, for "Mine": their email and their full names. */
export function meKeys(me) {
  if (!me) return null;
  const keys = accountKeys({ display_name: me.name, email: me.email || '' });
  return { email: String(me.email || '').toLowerCase(), keys };
}

/** Is this company the signed-in person's? Linked to their account, or their full name in the field (alone or with another). */
export function isMine(c, mk) {
  if (!mk) return false;
  if (mk.email && c.picEmail && String(c.picEmail).toLowerCase() === mk.email) return true;
  const names = [...picParts(c.pic), ...picParts(c.next && c.next.owner)];
  return names.some((k) => mk.keys.has(k));
}
