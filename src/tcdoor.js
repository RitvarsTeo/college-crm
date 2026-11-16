// THE DOOR BY CARD (16.11.2026, patch 148; concept Novikontas Academy Grand Opening/DOOR_SCANNER_concept_2026-11-16.png, his
// picks "Take it" and "Keep the map"; LOCKED "Invitation QR only"). Staff scan the guest's invitation card (its QR opens
// novikontas.org/grand-opening?k=<code>) or type the code. Five screens:
//   1 ready      the camera, Type a code, Companies N · People N
//   2 first      the first guest of this company: announce, hand over the piece (its place on the board), tick who is here
//   3 here       the company is already here: no second piece, tick the person, add a person not on the list
//   4 unlinked   a card no company has yet (a spare, or one handed out at a meeting): pick the company, link THIS card
//   5 notours    any other code (an old ticket too): the help desk, or find the guest by name or company
// One piece per card, never two. "Registered from this company" = everyone who registered through this card, and anyone
// registered whose Intake company is the card's company (read live, read-only: src/tctickets.js registrations).
// Kept in Intake, never deleted: tc_go_door_pieces, tc_go_door_people, tc_go_door_added.
import { TcInputError, nameKey } from './tc.js';
import * as cards from './tccards.js';

const nowIso = () => new Date().toISOString();
const bad = (m) => { throw new TcInputError(m); };
const low = (s) => String(s || '').trim().toLowerCase();
const norm = (s) => low(s).normalize('NFD').replace(/[̀-ͯ]/g, '');

export async function totals(db) {
  const c = await db.prepare('SELECT COUNT(*) AS n FROM tc_go_door_pieces').get();
  const p = await db.prepare('SELECT COUNT(*) AS n FROM tc_go_door_people WHERE here = 1').get();
  return { companies: Number(c.n) || 0, people: Number(p.n) || 0 };
}

// each registered person's own Intake company key: their contact by Client Hub id, else by email, else the company they wrote
async function keyer(db) {
  const contacts = await db.prepare(`SELECT ch_contact_id, email, company_id FROM tc_company_contacts WHERE archived_at IS NULL
    AND company_id IN (SELECT id FROM tc_companies WHERE archived_at IS NULL)`).all();
  const byCh = new Map(), byMail = new Map();
  for (const k of contacts) {
    if (k.ch_contact_id && !byCh.has(String(k.ch_contact_id))) byCh.set(String(k.ch_contact_id), Number(k.company_id));
    if (k.email && !byMail.has(low(k.email))) byMail.set(low(k.email), Number(k.company_id));
  }
  const byName = new Map();
  for (const c of await db.prepare('SELECT id, name_key FROM tc_companies WHERE archived_at IS NULL').all()) if (c.name_key && !byName.has(c.name_key)) byName.set(c.name_key, Number(c.id));
  return (r) => {
    const id = (r.chContactId && byCh.get(r.chContactId)) || (r.email && byMail.get(r.email)) || (r.company && byName.get(nameKey(r.company))) || null;
    return id ? 'id:' + id : r.company ? 'n:' + nameKey(r.company) : '';
  };
}

// a card is held by a company by its key, or by the company's name alone (patch 153: cards the Grand Opening session linked for
// companies Intake has under no key); such a card is that company's at the door, never "not linked"
const held = (card) => Boolean(card.companyKey || card.company);
async function needCard(db, code) {
  const card = await cards.byCode(db, code);
  if (card === undefined) bad('The cards are not reachable.');
  if (!card) bad('There is no such card.');
  return card;
}

/** The company screen of a linked card: first (no piece yet) or here (piece handed over), with the people to tick. */
async function companyView(db, card, regs) {
  const piece = await db.prepare('SELECT handed_at, handed_by FROM tc_go_door_pieces WHERE card = ?').get(card.code);
  let name = card.company;
  const m = /^id:(\d+)$/.exec(card.companyKey);
  if (m) { const c = await db.prepare('SELECT name FROM tc_companies WHERE id = ?').get(Number(m[1])); if (c && c.name) name = c.name; }
  const keyOf = await keyer(db);
  const ticks = new Map((await db.prepare('SELECT person_key, here FROM tc_go_door_people WHERE card = ?').all(card.code)).map((r) => [r.person_key, Number(r.here) === 1]));
  const people = [];
  for (const r of regs || []) {
    if (r.card === card.code || (card.companyKey && keyOf(r) === card.companyKey)) people.push({ key: 'R:' + r.regKey, name: r.name || r.email, here: ticks.get('R:' + r.regKey) || false });
  }
  for (const a of await db.prepare('SELECT id, name FROM tc_go_door_added WHERE card = ? ORDER BY id').all(card.code)) {
    people.push({ key: 'A:' + Number(a.id), name: a.name, here: ticks.get('A:' + Number(a.id)) || false, added: true });
  }
  return { state: piece ? 'here' : 'first', code: card.code, place: card.place, ...cards.placeParts(card.place), company: name, companyKey: card.companyKey,
    handedAt: piece ? piece.handed_at : null, handedBy: piece ? piece.handed_by || '' : '', people, registrations: Array.isArray(regs), totals: await totals(db) };
}

/** A scan or a typed code. */
export async function scan(db, text, regs) {
  const code = cards.codeFrom(text);
  if (!code) return { state: 'notours', totals: await totals(db) };
  const card = await cards.byCode(db, code);
  if (card === undefined) bad('The cards are not reachable.');
  if (!card) return { state: 'notours', totals: await totals(db) };
  if (!held(card)) return { state: 'unlinked', code: card.code, place: card.place, ...cards.placeParts(card.place), totals: await totals(db) };
  return companyView(db, card, regs);
}

/** "Piece handed over": once per card; the second time changes nothing. */
export async function handOver(db, code, regs, actor) {
  const card = await needCard(db, cards.codeFrom(code));
  if (!held(card)) bad('Link this card to a company first.');
  await db.prepare('INSERT INTO tc_go_door_pieces (card, company_key, company, place, handed_at, handed_by) VALUES (?,?,?,?,?,?) ON CONFLICT (card) DO NOTHING')
    .run(card.code, card.companyKey, card.company, card.place, nowIso(), actor);
  return companyView(db, card, regs);
}

/** Tick a person as here (or off again). Only a person shown on this card's screen. */
export async function tick(db, code, personKey, here, regs, actor) {
  const card = await needCard(db, cards.codeFrom(code));
  if (!held(card)) bad('Link this card to a company first.');
  const v = await companyView(db, card, regs);
  if (!v.people.some((p) => p.key === String(personKey))) bad('This person is not on this card.');
  await db.prepare(`INSERT INTO tc_go_door_people (person_key, card, here, set_at, set_by) VALUES (?,?,?,?,?)
    ON CONFLICT (person_key) DO UPDATE SET card = excluded.card, here = excluded.here, set_at = excluded.set_at, set_by = excluded.set_by`)
    .run(String(personKey), card.code, here ? 1 : 0, nowIso(), actor);
  return companyView(db, card, regs);
}

/** "+ Add a person not on the list": the name only, ticked as here. */
export async function addPerson(db, code, name, regs, actor) {
  const card = await needCard(db, cards.codeFrom(code));
  if (!held(card)) bad('Link this card to a company first.');
  const n = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (n.length < 2) bad('Type the guest\'s name.');
  const at = nowIso();
  const r = await db.prepare('INSERT INTO tc_go_door_added (card, name, added_at, added_by) VALUES (?,?,?,?)').run(card.code, n, at, actor);
  await db.prepare('INSERT INTO tc_go_door_people (person_key, card, here, set_at, set_by) VALUES (?,?,1,?,?)').run('A:' + Number(r.lastInsertRowid), card.code, at, actor);
  return companyView(db, card, regs);
}

const REFUSED = { 'this card belongs to another company': 'This card is already linked to another company.',
  'this company already has a card': 'This company already has its own card. Scan that one, or send the guest to the help desk.',
  'no such card': 'There is no such card.' };

/** Screen 4: link THIS card to an Intake company (one that has no card yet), then show its piece. */
export async function link(db, code, companyId, regs, actor) {
  const card = await needCard(db, cards.codeFrom(code));
  const co = await db.prepare('SELECT id, name FROM tc_companies WHERE id = ? AND archived_at IS NULL').get(Number(companyId));
  if (!co) bad('Pick a company from the list.');
  try { await cards.linkCode(db, card.code, 'id:' + Number(co.id), co.name, actor); }
  catch (e) {
    const why = Object.keys(REFUSED).find((k) => String(e.message || '').includes(k));
    if (why) bad(REFUSED[why]);
    throw e;
  }
  return companyView(db, await needCard(db, card.code), regs);
}

/** Screen 5: find a guest by name or company among the registered people and the companies with a card. */
export async function find(db, q, regs) {
  const n = norm(q).slice(0, 80);
  if (n.length < 2) return { rows: [] };
  const linked = (await cards.linked(db)) || new Map();
  const keyOf = await keyer(db);
  const rows = [];
  for (const r of regs || []) {
    if (!(norm(r.name).includes(n) || norm(r.company).includes(n) || norm(r.email).includes(n))) continue;
    const k = keyOf(r), c = (r.card && { code: r.card }) || linked.get(k) || null;
    rows.push({ name: r.name || r.email, company: r.company || '', card: c ? c.code : '' });
    if (rows.length >= 20) break;
  }
  if (rows.length < 20) {
    const names = new Map((await db.prepare('SELECT id, name FROM tc_companies WHERE archived_at IS NULL').all()).map((c) => ['id:' + Number(c.id), c.name]));
    for (const [k, c] of linked) {
      const name = names.get(k) || '';
      if (name && norm(name).includes(n) && !rows.some((x) => x.card === c.code && !x.name)) rows.push({ name: '', company: name, card: c.code });
      if (rows.length >= 20) break;
    }
  }
  return { rows };
}
