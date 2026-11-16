// THE GRAND OPENING CARDS (16.11.2026, patch 147; his picks "Automatic (Recommended)", "A: card table (Rec.)", "Yes
// (Recommended)"). 770 printed puzzle cards live in public.std_go_cards (code, place 1A..35V); the card's QR opens
// novikontas.org/grand-opening?k=<code>, and a registration through it is stored with that card (the landing page, v57).
// Intake links one card to each company saved as Invite, through the one function and one view it may use
// (docs/client-hub/intake_go_cards.sql): the card a company has stays its own for good. One source of truth: the card table.
// crm.tc_go_places (the one place 1A given on 05.11 and archived on 13.11) is history and is not read.
//
// The store is the card table under Postgres; a test or the local prototype (SQLite) puts its own here, and without one
// Intake links nothing and the export says the cards are not reachable (fails closed: nothing is guessed).

export const QR_BASE = 'https://novikontas.org/grand-opening?k=';
const CODE = /^[a-hj-km-np-z2-9]{6}$/;

let store = null;
/** For tests and the local prototype: { link(db, key, company, by) -> { code, place }, all(db) -> rows }. null = the default. */
export function setStore(s) { store = s; }

const pgStore = {
  async link(db, key, company, by) {
    return db.prepare('SELECT card_code AS code, card_place AS place FROM intake_go.card_link(?, ?, ?)').get(key, company, by);
  },
  async all(db) {
    return db.prepare('SELECT code, place, company_key, company, linked_at FROM intake_go.cards WHERE company_key IS NOT NULL').all();
  },
};

const active = (db) => store || (db && db.kind === 'pg' ? pgStore : null);
export const reachable = (db) => Boolean(active(db));

/** The card of this company: the one it has, or the next free one, linked now. Null when no card store is reachable. */
export async function link(db, key, company, by) {
  const s = active(db);
  if (!s) return null;
  const r = await s.link(db, String(key), String(company || '').slice(0, 200), String(by || '').slice(0, 120));
  return r && CODE.test(String(r.code)) ? { code: String(r.code), place: String(r.place) } : null;
}

/** Every linked card by company key: Map key -> { code, place, linkedAt }. Null when no card store is reachable. */
export async function linked(db) {
  const s = active(db);
  if (!s) return null;
  const m = new Map();
  for (const r of await s.all(db)) if (r.company_key) m.set(String(r.company_key), { code: String(r.code), place: String(r.place), linkedAt: r.linked_at || null });
  return m;
}

/** Board order: 1A, 1B ... 1V, 2A ... 35V (the number as a number). */
export function placeOrder(a, b) {
  const p = (x) => { const m = /^(\d+)([A-Z]+)$/.exec(String(x || '')); return m ? [Number(m[1]), m[2]] : [Infinity, '']; };
  const [an, al] = p(a), [bn, bl] = p(b);
  return an - bn || (al < bl ? -1 : al > bl ? 1 : 0);
}

export const qrUrl = (code) => QR_BASE + encodeURIComponent(String(code));
