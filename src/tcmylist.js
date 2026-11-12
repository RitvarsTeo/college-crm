// MY GRAND OPENING LIST (12.11.2026). The owner's picks: layout A with the people inside each company ("I like the simplicity of
// list A, but ... know which people are there inside"), folded tiles ("People shold fold unfold, not all be in huge list"), no
// button per person ("an invitation button for every single person separately - that sucks!"), "C1: tap a name", "Yes, build it",
// and then (12.11.2026) "I need the full flow. And alos let the people be drag and dropped from company to company ... they cant
// leave that page until they save the changes ... autosave also time to time ... undo button and a working ctrl+z function."
//
// Each list owner (config/tc.json grandOpening.stage2.senders) sees ONLY their own Stage 2 list, grouped by company. The page is a
// sandbox: every change stays on the page until Save. Save sends the whole state: per company Invite or No and how it goes out
// (digital = the personal Stage 2 email from the owner's own mailbox; in person / post = the postcard), the people tapped out of
// an invited company, and the people dragged to another company (their Intake contact moves). Autosave keeps a draft per list on
// the server; a draft is never a decision. After Save: digital people are the only ones the owner's Stage 2 send goes to
// (src/tcs2send.js), in person / post people make the postcard list. Every person's result after each Save is kept
// (tc_go_decision_log), every move too (tc_go_moves). Admins open every list. Pure data functions; each takes the database first.
import { TC, TcInputError, nameKey, logTcActivity } from './tc.js';

const S2 = () => ((((TC.grandOpening || {}).stage2 || {}).senders) || []);
export const WAYS = ['digital', 'in_person', 'post'];
const nowIso = () => new Date().toISOString();

/** The list the signed-in account owns: its code, or null. */
export const ownCode = (me) => {
  const mail = String((me && me.email) || '').trim().toLowerCase();
  return mail ? (S2().find((s) => String(s.email || '').toLowerCase() === mail) || {}).code || null : null;
};
/** Who may open which list: the owner their own, an admin any; nobody else, and never a list that does not exist. */
export function mayOpen(me, admin, code) {
  if (!S2().some((s) => s.code === code)) return false;
  return Boolean(admin) || (Boolean(me) && ownCode(me) === code);
}
/** The lists a viewer may open: an admin every list, an owner their own. */
export const openable = (me, admin) => (admin ? S2().map((s) => s.code) : [ownCode(me)].filter(Boolean));

// a row that holds no person's name (a shared company mailbox written as "iPS - Latvia") shows its address
export function personLabel(name, company, email) {
  const n = String(name || '').trim(), c = nameKey(company || ''), e = String(email || '').trim();
  if (!n) return e;
  const first = c.split(' ')[0] || '';
  if (n.includes('@') || (first.length >= 3 && nameKey(n).startsWith(first)) || nameKey(n) === c) return e || n;
  return n;
}

async function rowsOf(db, code) {
  return db.prepare(`SELECT s.id, s.ch_contact_id, s.name, s.position, s.country, s.company, s.email, MIN(k.company_id) AS company_id
    FROM tc_go_stage2 s LEFT JOIN tc_company_contacts k ON k.ch_contact_id = s.ch_contact_id AND k.archived_at IS NULL
      AND k.company_id IN (SELECT id FROM tc_companies WHERE archived_at IS NULL)
    WHERE s.sender = ? AND s.gone = 0 GROUP BY s.id, s.ch_contact_id, s.name, s.position, s.country, s.company, s.email ORDER BY s.id`).all(String(code));
}
const keyOf = (r) => (r.company_id ? 'id:' + Number(r.company_id) : 'n:' + (nameKey(r.company || '') || String(r.company || '').trim().toLowerCase()));

/** The SAVED list: { code, name, people, companies, figures, groups, draft }; a draft (autosave) comes with it, untouched. */
export async function myList(db, code) {
  if (!S2().some((s) => s.code === code)) throw new TcInputError('There is no such list.');
  const rows = await rowsOf(db, code);
  const cos = new Map((await db.prepare('SELECT id, name, country, address, city FROM tc_companies').all()).map((c) => [Number(c.id), c]));
  const picks = new Map((await db.prepare('SELECT company_key, decision, way FROM tc_go_company_picks WHERE sender = ?').all(String(code))).map((p) => [p.company_key, p]));
  const out = new Set((await db.prepare('SELECT stage2_id FROM tc_go_people_out WHERE out_flag = 1').all()).map((r) => Number(r.stage2_id)));
  const groups = new Map();
  for (const r of rows) {
    const key = keyOf(r), co = r.company_id ? cos.get(Number(r.company_id)) : null;
    if (!groups.has(key)) {
      const p = picks.get(key) || {};
      // a group's own row carries TOTAL where a country stands (the Excel's group total); the person's country is shown instead
      const coCountry = co && co.country && !/^total$/i.test(String(co.country).trim()) ? co.country : '';
      groups.set(key, { key, name: (co && co.name) || String(r.company || '').trim() || 'No company', country: coCountry || r.country || '',
        address: [co && co.address, co && co.city].filter(Boolean).join(', '), intake: Boolean(co),
        decision: p.decision || null, way: p.way || null, people: [] });
    }
    const g = groups.get(key), isOut = out.has(Number(r.id));
    g.people.push({ id: Number(r.id), label: personLabel(r.name, g.name, r.email), position: r.position || '', out: isOut,
      decision: g.decision === 'invite' ? (isOut ? 'no' : 'invite') : g.decision === 'no' ? 'no' : null });
  }
  const list = [...groups.values()].sort((a, b) => b.people.length - a.people.length || a.name.localeCompare(b.name, 'lv'));
  const all = list.flatMap((g) => g.people);
  const d = await db.prepare('SELECT state, saved_at, saved_by FROM tc_go_drafts WHERE sender = ?').get(String(code));
  let draft = null;
  if (d && d.state) { try { draft = { state: JSON.parse(d.state), at: d.saved_at, by: d.saved_by || '' }; } catch (e) { draft = null; } }
  return { code, name: (S2().find((s) => s.code === code) || {}).name || code, people: all.length, companies: list.length,
    figures: { todo: all.filter((p) => !p.decision).length, invite: all.filter((p) => p.decision === 'invite').length, no: all.filter((p) => p.decision === 'no').length },
    groups: list, draft };
}

/** The state the page works on, read from what is saved: { picks: { key: { decision, way } }, out: [ids], moves: {} }. */
export function stateOf(list) {
  const picks = {};
  for (const g of list.groups) if (g.decision || g.way) picks[g.key] = { decision: g.decision, way: g.way };
  return { picks, out: list.groups.flatMap((g) => g.people.filter((p) => p.out).map((p) => p.id)), moves: {} };
}

/** A state from the page, checked against this list: only its companies, its people, Intake companies as drop targets. */
function clean(list, state) {
  const s = state && typeof state === 'object' ? state : {};
  const keys = new Set(list.groups.map((g) => g.key)), ids = new Set(list.groups.flatMap((g) => g.people.map((p) => p.id)));
  const intake = new Set(list.groups.filter((g) => g.intake).map((g) => g.key));
  const picks = {};
  for (const [k, v] of Object.entries(s.picks || {})) {
    if (!keys.has(k)) throw new TcInputError('A company is not on this list.');
    const decision = v && v.decision ? String(v.decision) : null, way = v && v.way ? String(v.way) : null;
    if (decision && !['invite', 'no'].includes(decision)) throw new TcInputError('Invite or No?');
    if (way && !WAYS.includes(way)) throw new TcInputError('Digital, in person or by post?');
    picks[k] = { decision, way: decision === 'invite' ? way : null };
  }
  const out = [...new Set([].concat(s.out || []).map(Number))];
  if (out.some((id) => !ids.has(id))) throw new TcInputError('A person is not on this list.');
  const moves = {};
  for (const [id, k] of Object.entries(s.moves || {})) {
    if (!ids.has(Number(id))) throw new TcInputError('A person is not on this list.');
    if (!intake.has(String(k))) throw new TcInputError('A person can move only to a company in Intake.');
    moves[Number(id)] = String(k);
  }
  return { picks, out, moves };
}

/** Autosave: keep the page's unsaved state as this list's draft. Never a decision. */
export async function saveDraft(db, code, state, actor) {
  const list = await myList(db, code);
  const st = clean(list, state);
  const json = JSON.stringify(st);
  if (json.length > 400000) throw new TcInputError('The draft is too large.');
  await db.prepare(`INSERT INTO tc_go_drafts (sender, state, saved_at, saved_by) VALUES (?,?,?,?)
    ON CONFLICT (sender) DO UPDATE SET state = excluded.state, saved_at = excluded.saved_at, saved_by = excluded.saved_by`).run(code, json, nowIso(), actor);
  return { ok: true };
}
/** "Don't save": the draft goes; what was saved stays. */
export async function dropDraft(db, code) {
  // rows are never deleted (security_guards (e)): the draft is emptied, and an empty draft is no draft
  await db.prepare("UPDATE tc_go_drafts SET state = '', saved_at = ? WHERE sender = ?").run(nowIso(), code);
  return { ok: true };
}

/** Save: the whole state becomes the list's decision in one transaction; moves change the person's Intake company. */
export async function saveState(db, code, state, actor) {
  const before = await myList(db, code);
  const st = clean(before, state);
  const at = nowIso();
  const was = new Map(before.groups.flatMap((g) => g.people.map((p) => [p.id, { key: g.key, decision: p.decision, way: p.decision === 'invite' ? g.way : null }])));
  await db.transaction(async (tx) => {
    // 1. the moves: the person's Intake contact goes to the company they were dragged to
    const rows = new Map((await rowsOf(tx, code)).map((r) => [Number(r.id), r]));
    for (const [id, to] of Object.entries(st.moves)) {
      const r = rows.get(Number(id)), from = keyOf(r);
      if (from === to) continue;
      const toId = Number(to.slice(3));
      const k = await tx.prepare('SELECT id, company_id, email FROM tc_company_contacts WHERE ch_contact_id = ? AND archived_at IS NULL ORDER BY id').get(r.ch_contact_id);
      const email = String(r.email || '').trim().toLowerCase() || null;
      const there = email ? await tx.prepare('SELECT id, ch_contact_id FROM tc_company_contacts WHERE company_id = ? AND email = ? AND archived_at IS NULL').get(toId, email) : null;
      if (there) {   // the same address is already a contact there: that contact carries the person from now on
        if (!there.ch_contact_id) await tx.prepare('UPDATE tc_company_contacts SET ch_contact_id = ?, updated_at = ? WHERE id = ?').run(r.ch_contact_id, at, there.id);
        if (k && Number(k.id) !== Number(there.id)) await tx.prepare('UPDATE tc_company_contacts SET archived_at = ?, archived_by = ? WHERE id = ?').run(at, actor, k.id);
      } else if (k) {
        await tx.prepare('UPDATE tc_company_contacts SET company_id = ?, updated_at = ? WHERE id = ?').run(toId, at, k.id);
      } else {
        await tx.prepare(`INSERT INTO tc_company_contacts (company_id, name, position, email, ch_contact_id, source, created_at, created_by) VALUES (?,?,?,?,?,?,?,?)`)
          .run(toId, r.name || null, r.position || null, email, r.ch_contact_id, 'go-mylist-move', at, actor);
      }
      const fromName = (before.groups.find((g) => g.key === from) || {}).name || '';
      const toName = (before.groups.find((g) => g.key === to) || {}).name || '';
      if (from.startsWith('id:')) await logTcActivity(tx, Number(from.slice(3)), { kind: 'edit', field: 'contact', old: r.name || email, new: null, body: `Contact moved to ${toName} (My Grand Opening list)`, actor, at });
      await logTcActivity(tx, toId, { kind: 'edit', field: 'contact', old: null, new: r.name || email, body: `Contact moved here from ${fromName} (My Grand Opening list)`, actor, at });
      await tx.prepare('INSERT INTO tc_go_moves (stage2_id, sender, from_key, to_key, at, by_name) VALUES (?,?,?,?,?,?)').run(Number(id), code, from, to, at, actor);
    }
    // 2. the companies: every key the list has, as the state says (a key not in it is not decided)
    const after = await myList(tx, code);
    for (const g of after.groups) {
      const p = st.picks[g.key] || { decision: null, way: null };
      await tx.prepare(`INSERT INTO tc_go_company_picks (sender, company_key, decision, way, set_at, set_by) VALUES (?,?,?,?,?,?)
        ON CONFLICT (sender, company_key) DO UPDATE SET decision = excluded.decision, way = excluded.way, set_at = excluded.set_at, set_by = excluded.set_by`)
        .run(code, g.key, p.decision, p.decision === 'invite' ? p.way : null, at, actor);
    }
    // 3. the people tapped out
    const outs = new Set(st.out);
    for (const g of after.groups) for (const p of g.people) {
      if (p.out === outs.has(p.id)) continue;
      await tx.prepare(`INSERT INTO tc_go_people_out (stage2_id, out_flag, set_at, set_by) VALUES (?,?,?,?)
        ON CONFLICT (stage2_id) DO UPDATE SET out_flag = excluded.out_flag, set_at = excluded.set_at, set_by = excluded.set_by`).run(p.id, outs.has(p.id) ? 1 : 0, at, actor);
    }
    // 4. every person whose result changed, kept
    const now = await myList(tx, code);
    for (const g of now.groups) for (const p of g.people) {
      const w = was.get(p.id) || {}, way = p.decision === 'invite' ? g.way : null;
      if (w.decision === p.decision && w.way === way && w.key === g.key) continue;
      await tx.prepare('INSERT INTO tc_go_decision_log (stage2_id, sender, decision, way, at, by_name) VALUES (?,?,?,?,?,?)').run(p.id, code, p.decision, way, at, actor);
    }
    await tx.prepare("UPDATE tc_go_drafts SET state = '', saved_at = ? WHERE sender = ?").run(at, code);
  });
  return myList(db, code);
}

/** The people the owner's Stage 2 send goes to: invited, the company's way digital, not tapped out (saved state only). */
export async function digitalIds(db, code) {
  const L = await myList(db, code);
  return new Set(L.groups.filter((g) => g.decision === 'invite' && g.way === 'digital').flatMap((g) => g.people.filter((p) => p.decision === 'invite').map((p) => p.id)));
}

/** The postcard list: one row per invited person whose company goes in person or by post, from the lists given. */
export async function postcardRows(db, codes) {
  const rows = [];
  for (const code of codes) {
    const L = await myList(db, code);
    for (const g of L.groups) {
      if (g.decision !== 'invite' || !['in_person', 'post'].includes(g.way)) continue;
      for (const p of g.people) if (p.decision === 'invite') rows.push({ person: p.label, position: p.position, company: g.name, country: g.country, address: g.address, way: g.way, owner: L.name });
    }
  }
  return rows;
}
