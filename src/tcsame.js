// SAME COMPANY (23.11.2026, patch 163). His words, with screenshots of "TB MArine" / "TB marine Riga", "StenaLine" / "Stena",
// "Chalmers" / "Chalmers University of Technology": "THIS IS THE SAME COMPANY!" His pick: "Auto obvious, tick rest"; a name that
// differs only by a bracket or a branch goes on his tick list ("Tick list"); the tick screen as pictured (P163, "Yes, build it").
//
//   OBVIOUS  the same name once case, accents, punctuation, spaces and legal forms (SIA, Ltd, GmbH, B.V. ...) are dropped.
//            Merged by the one-off apply step, after a verified backup, from a dry-run list shown first.
//   TO CHECK one name is the start of the other (Chalmers / Chalmers University of Technology), or the two are the same once a
//            bracket or a "//" tail is dropped (DFDS / DFDS (Guernsey) Limited). Shown on "Same company?" until somebody answers.
//
// A MERGE keeps one company (most contacts; then the oldest) and moves EVERYTHING of the other onto it, in one transaction:
// contacts, areas, courses, activities, tasks, events, Do not invite marks, families, additions, import and review rows, and every
// Grand Opening row keyed 'id:<company>' (picks, gifts, places, list moves, door pieces, tickets, open drafts). The other company
// is archived, never deleted, with a log line on both. Its Grand Opening card: the company keeps ONE card, the one linked first
// (the one most likely printed or handed out), and any other goes back to the free pool (src/tccards.js mergeCards).
// A director's own decision is never chosen for him ("as he himself did it"): two DIFFERENT decisions on the two companies, by
// anyone, stop an automatic merge; on the tick list the company kept keeps its own decision and the other is logged.
import { nameKey } from './tc.js';
import * as cards from './tccards.js';

const nowIso = () => new Date().toISOString();
const LEGAL = ['gmbh co kg', 'sp z o o', 'pte ltd', 'co kg', 'sp zoo', 'a s', 'b v', 'n v', 's a', 'sia', 'as', 'ltd', 'limited', 'gmbh',
  'kg', 'aps', 'oy', 'oyj', 'ab', 'uab', 'ou', 'inc', 'llc', 'co', 'plc', 'bv', 'nv', 'sa', 'sas', 'srl', 'spa', 'pte', 'corp',
  'corporation', 'company', 'ehf', 'asa'];
const LEAD = ['sia', 'as', 'a s', 'uab'];
const plain = (name) => String(name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function strip(s) {
  s = s.replace(/[^a-z0-9]+/g, ' ').trim();
  for (let changed = true; changed;) {
    changed = false;
    for (const l of LEGAL) {
      if (s.endsWith(' ' + l)) { s = s.slice(0, -l.length - 1).trim(); changed = true; }
      // before the name only the forms written there (SIA X, AS X, UAB X): "AB Shipping" is a name
      if (LEAD.includes(l) && s.startsWith(l + ' ')) { s = s.slice(l.length + 1).trim(); changed = true; }
    }
  }
  return s.replace(/ /g, '');
}
/** The legal forms a name carries ("SIA Modumetals" -> ['sia'], "MODU METALS LTD" -> ['ltd']). */
export function legalForms(name) {
  let s = plain(name).replace(/[^a-z0-9]+/g, ' ').trim();
  const found = [];
  for (let changed = true; changed;) {
    changed = false;
    for (const l of LEGAL) {
      if (s.endsWith(' ' + l)) { found.push(l.replace(/ /g, '')); s = s.slice(0, -l.length - 1).trim(); changed = true; }
      if (LEAD.includes(l) && s.startsWith(l + ' ')) { found.push(l.replace(/ /g, '')); s = s.slice(l.length + 1).trim(); changed = true; }
    }
  }
  return found.sort();
}
/** The obvious key: "GoTa Ship Management SIA" = "GoTa Shipmanagement" = "gotashipmanagement". A bracket stays part of the name. */
export const obviousKey = (name) => strip(plain(name));
/** The loose key: brackets and a "//" tail dropped as well ("DFDS (Guernsey) Limited" = "dfds"). For the tick list only. */
export const looseKey = (name) => strip(plain(name).replace(/\([^)]*\)/g, ' ').replace(/\/\/.*$/, ' '));
const pairKey = (a, b) => [Number(a), Number(b)].sort((x, y) => x - y).join(':');

/** The companies that are the same, as { obvious: [[company...]], check: [[a, b]] }. Each company: { id, name, country, contacts }. */
export async function findSame(db) {
  const cos = await db.prepare(`SELECT c.id, c.name, c.country, c.created_at,
      (SELECT COUNT(*) FROM tc_company_contacts k WHERE k.company_id = c.id AND k.archived_at IS NULL) AS contacts
    FROM tc_companies c WHERE c.archived_at IS NULL ORDER BY c.id`).all();
  const all = cos.map((c) => ({ id: Number(c.id), name: c.name, country: c.country || '', contacts: Number(c.contacts) || 0, ok: obviousKey(c.name), lk: looseKey(c.name) }))
    .filter((c) => c.ok.length >= 2);
  const byKey = new Map();
  for (const c of all) { if (!byKey.has(c.ok)) byKey.set(c.ok, []); byKey.get(c.ok).push(c); }
  // obvious, unless a person should look (MASTER's rules, 23.11.2026): two companies with decisions from DIFFERENT list owners
  // (whose list the merged company lands on is theirs to say), or two DIFFERENT legal forms (SIA vs LTD: two legal entities)
  const decided = new Map();
  for (const p of await db.prepare("SELECT sender, company_key FROM tc_go_company_picks WHERE decision IS NOT NULL AND company_key LIKE 'id:%'").all()) {
    const id = Number(String(p.company_key).slice(3));
    if (!decided.has(id)) decided.set(id, new Set());
    decided.get(id).add(p.sender);
  }
  const owners = (c) => [...(decided.get(c.id) || [])];
  const look = (g) => {
    const withPicks = g.filter((c) => owners(c).length);
    const allOwners = new Set(withPicks.flatMap(owners));
    if (withPicks.length > 1 && allOwners.size > 1) return true;
    const forms = g.map((c) => legalForms(c.name).join(',')).filter(Boolean);
    return new Set(forms).size > 1;
  };
  const groupsOf = [...byKey.values()].filter((g) => g.length > 1).map(order);
  const obvious = groupsOf.filter((g) => !look(g));
  const toLook = groupsOf.filter(look);
  const dismissed = new Set((await db.prepare('SELECT pair_key FROM tc_same_dismissed').all()).map((r) => r.pair_key));
  // one representative per obvious group; only companies with people (an empty duplicate shows on no list)
  const reps = [...byKey.values()].map((g) => order(g)[0]).filter((c) => c.contacts > 0 && c.lk.length >= 3);
  const sorted = [...reps].sort((a, b) => a.lk.localeCompare(b.lk));
  // pairs that are the same, joined into groups (one card per group, never every pair of a group)
  const parent = new Map(reps.map((c) => [c.id, c.id]));
  const root = (x) => { while (parent.get(x) !== x) x = parent.get(x); return x; };
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i], b = sorted[j];
      if (!b.lk.startsWith(a.lk.slice(0, 4))) break;
      const same = a.lk === b.lk || (a.lk.length >= 5 && b.lk.startsWith(a.lk)) || (b.lk.length >= 5 && a.lk.startsWith(b.lk));
      if (same && !dismissed.has(pairKey(a.id, b.id))) parent.set(root(b.id), root(a.id));
    }
  }
  const groups = new Map();
  for (const c of reps) { const r = root(c.id); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(c); }
  const inLook = new Set(toLook.flat().map((c) => c.id));
  const check = [...toLook, ...[...groups.values()].filter((g) => g.length > 1 && !g.some((c) => inLook.has(c.id)))].map(order)
    .sort((a, b) => a[0].name.localeCompare(b[0].name));
  return { obvious, check };
}
// the company that stays: the most contacts, then the oldest (lowest id)
function order(g) { return [...g].sort((a, b) => b.contacts - a.contacts || a.id - b.id); }

/** "Not the same": the pair is not asked again. */
export async function dismiss(db, a, b, actor) {
  const k = pairKey(a, b);
  if (!/^\d+:\d+$/.test(k) || Number(a) === Number(b)) throw new SameError('Two different companies.');
  await db.prepare('INSERT INTO tc_same_dismissed (pair_key, dismissed_at, dismissed_by) VALUES (?,?,?) ON CONFLICT (pair_key) DO NOTHING').run(k, nowIso(), actor || null);
  return { ok: true };
}

export class SameError extends Error {}

/** Merge company `dropId` into `keepId`. mode 'auto' refuses two different Grand Opening decisions; 'ticked' keeps the kept company's.
 *  Returns what moved, for the log and the report. */
export async function merge(db, keepId, dropId, actor, { mode = 'ticked', at = nowIso() } = {}) {
  keepId = Number(keepId); dropId = Number(dropId);
  if (!(keepId > 0) || !(dropId > 0) || keepId === dropId) throw new SameError('Two different companies.');
  const K = 'id:' + keepId, D = 'id:' + dropId;
  return db.transaction(async (tx) => {
    const keep = await tx.prepare('SELECT * FROM tc_companies WHERE id = ? AND archived_at IS NULL').get(keepId);
    const drop = await tx.prepare('SELECT * FROM tc_companies WHERE id = ? AND archived_at IS NULL').get(dropId);
    if (!keep || !drop) throw new SameError('One of the two companies is not there any more (archived or merged already).');
    const out = { keep: { id: keepId, name: keep.name }, drop: { id: dropId, name: drop.name }, moved: {}, removed: {}, conflicts: [], cards: null };
    const n = (k, r) => { out.moved[k] = (out.moved[k] || 0) + Number(r && r.changes != null ? r.changes : r || 0); };

    // the Grand Opening decisions first: never choose between two directors' decisions on the quiet
    const picks = await tx.prepare('SELECT id, sender, company_key, decision, way FROM tc_go_company_picks WHERE company_key IN (?, ?)').all(K, D);
    const decided = (k) => picks.filter((p) => p.company_key === k && p.decision);
    const kd = decided(K), dd = decided(D);
    const differ = kd.length && dd.length && [...kd, ...dd].some((p) => p.decision !== kd[0].decision || (p.way || '') !== (kd[0].way || ''));
    if (differ && mode === 'auto') throw new SameError('The two companies carry different Grand Opening decisions: this one goes on the tick list.');
    const ownersOf = (list) => new Set(list.map((p) => p.sender));
    if (mode === 'auto' && kd.length && dd.length && new Set([...ownersOf(kd), ...ownersOf(dd)]).size > 1)
      throw new SameError('Two list owners decided on these companies: this one goes on the tick list.');
    for (const p of picks.filter((x) => x.company_key === D)) {
      const mine = picks.find((x) => x.company_key === K && x.sender === p.sender);
      if (mine) {
        if (p.decision && (p.decision !== mine.decision || (p.way || '') !== (mine.way || ''))) out.conflicts.push({ sender: p.sender, kept: mine.decision + (mine.way ? ' · ' + mine.way : ''), dropped: p.decision + (p.way ? ' · ' + p.way : '') });
        // never deleted (security_guards (e)): the dropped company's row is set aside under 'merged:<its key>'
        await tx.prepare('UPDATE tc_go_company_picks SET company_key = ? WHERE id = ?').run('merged:' + D, p.id);
        out.removed.picks = (out.removed.picks || 0) + 1;
      } else n('picks', await tx.prepare('UPDATE tc_go_company_picks SET company_key = ? WHERE id = ?').run(K, p.id));
    }

    // contacts: one per address on a company (tc_company_contacts_one_email)
    for (const c of await tx.prepare('SELECT id, email, ch_contact_id FROM tc_company_contacts WHERE company_id = ?').all(dropId)) {
      const twin = c.email ? await tx.prepare('SELECT id, ch_contact_id FROM tc_company_contacts WHERE company_id = ? AND email = ?').get(keepId, c.email) : null;
      if (!twin) { n('contacts', await tx.prepare('UPDATE tc_company_contacts SET company_id = ? WHERE id = ?').run(keepId, c.id)); continue; }
      if (!twin.ch_contact_id && c.ch_contact_id) await tx.prepare('UPDATE tc_company_contacts SET ch_contact_id = ? WHERE id = ?').run(c.ch_contact_id, twin.id);
      if (!c.ch_contact_id || !twin.ch_contact_id || c.ch_contact_id === twin.ch_contact_id) {
        await tx.prepare('UPDATE tc_company_contacts SET archived_at = COALESCE(archived_at, ?), archived_by = COALESCE(archived_by, ?) WHERE id = ?').run(at, 'Same company: ' + keep.name, c.id);
        out.removed.contacts = (out.removed.contacts || 0) + 1;
      } else {
        // two Client Hub contacts with one address: both stay linked to their list rows; the second without its address
        n('contacts', await tx.prepare('UPDATE tc_company_contacts SET company_id = ?, email = NULL WHERE id = ?').run(keepId, c.id));
      }
    }
    // areas and courses: the kept company's own stay; what it lacks comes over
    for (const a of await tx.prepare('SELECT area FROM tc_company_areas WHERE company_id = ?').all(dropId)) {
      if (!(await tx.prepare('SELECT 1 AS x FROM tc_company_areas WHERE company_id = ? AND area = ?').get(keepId, a.area)))
        n('areas', await tx.prepare('UPDATE tc_company_areas SET company_id = ? WHERE company_id = ? AND area = ?').run(keepId, dropId, a.area));
    }
    for (const y of await tx.prepare('SELECT id, year FROM tc_company_courses WHERE company_id = ?').all(dropId)) {
      if (!(await tx.prepare('SELECT 1 AS x FROM tc_company_courses WHERE company_id = ? AND year = ?').get(keepId, y.year)))
        n('courses', await tx.prepare('UPDATE tc_company_courses SET company_id = ? WHERE id = ?').run(keepId, y.id));
    }
    // events: one active row per event and company
    for (const e of await tx.prepare('SELECT id, event_id FROM tc_event_companies WHERE company_id = ? AND removed_at IS NULL').all(dropId)) {
      if (await tx.prepare('SELECT 1 AS x FROM tc_event_companies WHERE company_id = ? AND event_id = ? AND removed_at IS NULL').get(keepId, e.event_id)) {
        await tx.prepare('UPDATE tc_event_companies SET removed_at = ?, removed_by = ? WHERE id = ?').run(at, 'Same company: ' + keep.name, e.id);
      } else n('events', await tx.prepare('UPDATE tc_event_companies SET company_id = ? WHERE id = ?').run(keepId, e.id));
    }
    // families: a member of the kept company's own family ends; any other membership comes over
    for (const m of await tx.prepare('SELECT id, family_id FROM tc_family_members WHERE company_id = ? AND ended_at IS NULL').all(dropId)) {
      if (await tx.prepare('SELECT 1 AS x FROM tc_family_members WHERE company_id = ? AND family_id = ? AND ended_at IS NULL').get(keepId, m.family_id))
        await tx.prepare('UPDATE tc_family_members SET ended_at = ?, ended_by = ? WHERE id = ?').run(at, 'Same company: ' + keep.name, m.id);
      else n('families', await tx.prepare('UPDATE tc_family_members SET company_id = ? WHERE id = ?').run(keepId, m.id));
    }
    n('families', await tx.prepare('UPDATE tc_families SET parent_id = ? WHERE parent_id = ? AND ended_at IS NULL').run(keepId, dropId));
    // everything else that points at the company moves as it is
    for (const t of ['tc_activities', 'tc_tasks', 'tc_invite_marks', 'tc_additions', 'tc_import_rows', 'tc_review_contacts', 'tc_mr_names'])
      n(t.replace(/^tc_/, ''), await tx.prepare(`UPDATE ${t} SET company_id = ? WHERE company_id = ?`).run(keepId, dropId));

    // the Grand Opening rows keyed by the company
    for (const t of ['tc_go_gifts', 'tc_go_places']) {
      if (await tx.prepare(`SELECT 1 AS x FROM ${t} WHERE company_key = ?`).get(K)) {
        const r = await tx.prepare(`UPDATE ${t} SET company_key = ? WHERE company_key = ?`).run('merged:' + D, D);
        if (r.changes) out.removed[t.replace(/^tc_go_/, '')] = Number(r.changes);
      } else n(t.replace(/^tc_go_/, ''), await tx.prepare(`UPDATE ${t} SET company_key = ? WHERE company_key = ?`).run(K, D));
    }
    for (const [t, col] of [['tc_go_assign', 'company_key'], ['tc_go_door_pieces', 'company_key'], ['tc_go_tickets', 'mother_key']])
      n(t.replace(/^tc_go_/, ''), await tx.prepare(`UPDATE ${t} SET ${col} = ? WHERE ${col} = ?`).run(K, D));
    // open drafts: a pick or a move on the dropped company now reads the kept one (the kept company's own pick wins)
    for (const d of await tx.prepare(`SELECT id, state FROM tc_go_drafts WHERE state LIKE ?`).all('%"' + D + '"%')) {
      let st; try { st = JSON.parse(d.state); } catch { continue; }
      if (st.picks && st.picks[D]) { if (!st.picks[K]) st.picks[K] = st.picks[D]; delete st.picks[D]; }
      for (const [id, k] of Object.entries(st.moves || {})) if (k === D) st.moves[id] = K;
      n('drafts', await tx.prepare('UPDATE tc_go_drafts SET state = ? WHERE id = ?').run(JSON.stringify(st), d.id));
    }

    // the card: the company keeps the card linked first (the one most likely printed or handed out); any other is freed
    const map = await cards.linked(tx);
    if (map) {
      const held = [map.get(K), map.get(D)].filter(Boolean).sort((x, y) => String(x.linkedAt || '').localeCompare(String(y.linkedAt || '')) || x.code.localeCompare(y.code));
      if (held.length) out.cards = await cards.mergeCards(tx, D, K, held[0].code, keep.name, actor);
    } else out.cards = { notReachable: true };

    // the company itself: archived with its reason, a line on both
    await tx.prepare('UPDATE tc_companies SET archived_at = ?, archived_by = ? WHERE id = ?').run(at, 'Same company: ' + keep.name + ' (' + keepId + ')', dropId);
    const line = (cid, body) => tx.prepare(`INSERT INTO tc_activities (company_id, kind, occurred_at, body, actor, origin, field, old_value, new_value)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(cid, 'edit', at, body, actor || null, 'manual', 'same_company', String(dropId), String(keepId));
    await line(keepId, `Same company: ${drop.name} merged into ${keep.name}`);
    await line(dropId, `Same company: merged into ${keep.name}`);
    await tx.prepare('INSERT INTO tc_same_log (keep_id, drop_id, mode, at, by_name, detail) VALUES (?,?,?,?,?,?)')
      .run(keepId, dropId, mode, at, actor || null, JSON.stringify(out));
    return out;
  });
}

export const _test = { order, pairKey, nameKey };
