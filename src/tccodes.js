// PERSONAL CODES FOR EVERYONE ON A LIST (16.11.2026, patch 146 reshaped; HIS PICK "Yes, build it (Rec.)"; his rule "ALL CONTACTS
// have companies. all have the same mechanism. who cares how they got into the contact list?"). Every person on a Grand
// Opening list with an email has a 6-character personal code, the same kind as the 1,563 the Client Hub split brought: the
// Stage 2 email's link carries it, and the landing page prefills their name and email from it (public.std_go_prefill,
// docs/client-hub/intake_go_person_codes.sql). One generic rule, whatever way the person came in: ensureCodes gives a code to
// everyone on a list with an email and none yet. It runs after a person is added or gets an email, before the Stage 2 send
// screen is drawn, and once as the one-off. A code is issued by intake_go.person_code_issue (one per contact id, never changed).
//
// The store is the database function under Postgres; a test or the local prototype puts its own here, and without one no code is
// issued and nothing is guessed.

const CODE = /^[a-z0-9]{6}$/;
let store = null;
/** For tests and the local prototype: { issue(db, contactId, name, company) -> code }. null = the default. */
export function setStore(s) { store = s; }
const pgStore = {
  async issue(db, contactId, name, company) {
    const r = await db.prepare('SELECT intake_go.person_code_issue(?, ?, ?) AS code').get(contactId, name, company);
    return r && r.code;
  },
};
const active = (db) => store || (db && db.kind === 'pg' ? pgStore : null);
export const reachable = (db) => Boolean(active(db));

/** Everyone on a list with an email and no code gets one. Returns { missing, issued, failed, reachable }. */
export async function ensureCodes(db) {
  const out = { missing: 0, issued: 0, failed: 0, reachable: reachable(db) };
  const rows = await db.prepare(`SELECT id, ch_contact_id, name, company FROM tc_go_stage2
    WHERE gone = 0 AND email IS NOT NULL AND email <> '' AND (link_code IS NULL OR link_code = '') ORDER BY id`).all();
  out.missing = rows.length;
  if (!out.reachable || !rows.length) return out;
  const s = active(db);
  for (const r of rows) {
    try {
      const code = String((await s.issue(db, String(r.ch_contact_id), String(r.name || '').slice(0, 160), String(r.company || '').slice(0, 200))) || '');
      if (!CODE.test(code)) { out.failed += 1; continue; }
      // only where it is still empty: a code already there is never changed
      await db.prepare("UPDATE tc_go_stage2 SET link_code = ? WHERE id = ? AND (link_code IS NULL OR link_code = '')").run(code, Number(r.id));
      out.issued += 1;
    } catch (e) { out.failed += 1; console.error(`codes: no code for one person (${e.message})`); }
  }
  return out;
}

/** The Stage 2 email link: the company's card and the person's code together, or the code alone when the company has no card. */
export const PAGE = 'https://novikontas.org/grand-opening';
export function personLink(code, card = '') {
  const c = String(code || ''), k = /^[a-hj-km-np-z2-9]{6}$/.test(String(card || '')) ? String(card) : '';
  return k ? `${PAGE}?k=${k}&c=${encodeURIComponent(c)}` : `${PAGE}?c=${encodeURIComponent(c)}`;
}
