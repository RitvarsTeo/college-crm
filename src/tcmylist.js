// MY GRAND OPENING LIST (12.11.2026). The owner's picks: layout A with the people inside each company ("I like the simplicity of
// list A, but ... know which people are there inside"), folded tiles ("People shold fold unfold, not all be in huge list"), no
// button per person ("an invitation button for every single person separately - that sucks!"), "C1: tap a name", "Yes, build it",
// and then (12.11.2026) "I need the full flow. And alos let the people be drag and dropped from company to company ... they cant
// leave that page until they save the changes ... autosave also time to time ... undo button and a working ctrl+z function."
//
// Each list owner (config/tc.json grandOpening.stage2.senders) sees ONLY their own Stage 2 list, grouped by company. The page is a
// sandbox: every change stays on the page until Save. Per company Invite or No and how it goes out (digital = the personal Stage 2
// email from the owner's own mailbox; in person / post = the postcard), the people tapped out of an invited company, and the
// people dragged to another company on this list. The audit (12.11.2026): Save writes only what changed against the version the
// page loaded and refuses when someone else saved the list since; an Invite without a way is still to decide; a drag places the
// person on THIS list only (the shared Intake contact stays), unless they had no Intake company; a draft is per editor, never a
// decision, and an old draft never comes back over a newer Save. After Save: digital people are the only ones the owner's Stage 2 send goes to
// (src/tcs2send.js), in person / post people make the postcard list. Every person's result after each Save is kept
// (tc_go_decision_log), every move too (tc_go_moves). Admins open every list. Pure data functions; each takes the database first.
import { cachedAll } from './tcreadcache.js';
import { TC, TcInputError, nameKey, logTcActivity } from './tc.js';
import * as cards from './tccards.js';
import { splitNew } from './tcgosplit.js';
import { passState, waiverState } from './tcgopass.js';

/** Someone else saved the list after this page loaded it. */
export class MlConflict extends Error { constructor(msg, by, at) { super(msg); this.by = by; this.at = at; } }

const S2 = () => ((((TC.grandOpening || {}).stage2 || {}).senders) || []);
export const WAYS = ['digital', 'in_person', 'post'];
// INVITE = DIGITAL BY DEFAULT (patch 160, 20.11.2026, the owner: "visi saņem digital by default, bet tie kuri ir invited ... uzspied
// invite, paliek kā default poga"): an Invite is a digital invitation; "Hand over in person" and "Send by post" are optional extras on
// top. The way is kept as a comma list ("digital,post"); every Invite includes digital, a pick saved before too (23.11.2026).
export const wayParts = (w) => String(w || '').split(',').map((x) => x.trim()).filter((x) => WAYS.includes(x));
export const wayHas = (w, part) => wayParts(w).includes(part);
/** The way an Invite is saved with: its parts in a fixed order, ALWAYS with digital (the owner, 23.11.2026: "Digital by default is
 *  for everyone by the way!": a pick saved before as in person or by mail gets the digital invitation too). */
export const wayNorm = (decision, w) => {
  if (decision !== 'invite') return null;
  const parts = ['digital', ...wayParts(w)];
  return WAYS.filter((x) => parts.includes(x)).join(',');
};
const physical = (w) => (wayHas(w, 'in_person') ? 'in_person' : wayHas(w, 'post') ? 'post' : null);
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
/** The owners' names for the list switcher (proposal F, 12.11.2026). */
export const listNames = (codes) => Object.fromEntries(codes.map((c) => [c, (S2().find((s) => s.code === c) || {}).name || c]));

// a row that holds no person's name (a shared company mailbox written as "iPS - Latvia") shows its address
export function personLabel(name, company, email) {
  const n = String(name || '').trim(), c = nameKey(company || ''), e = String(email || '').trim();
  if (!n) return e;
  const first = c.split(' ')[0] || '';
  if (n.includes('@') || (first.length >= 3 && nameKey(n).startsWith(first)) || nameKey(n) === c) return e || n;
  return n;
}

async function rowsOf(db, code) {
  return db.prepare(`SELECT s.id, s.ch_contact_id, s.name, s.position, s.country, s.company, s.email, MIN(k.company_id) AS company_id, MAX(a.company_key) AS assigned,
      0 AS fresh   -- PEOPLE FOLLOW THE COMPANY (patch 152f, his pick 16.11.2026): nobody is "still to decide" inside a decided company
    FROM tc_go_stage2 s LEFT JOIN tc_company_contacts k ON k.ch_contact_id = s.ch_contact_id AND k.archived_at IS NULL
      AND k.company_id IN (SELECT id FROM tc_companies WHERE archived_at IS NULL)
    LEFT JOIN tc_go_assign a ON a.stage2_id = s.id AND a.sender = s.sender
    WHERE s.sender = ? AND s.gone = 0 GROUP BY s.id, s.ch_contact_id, s.name, s.position, s.country, s.company, s.email ORDER BY s.id`).all(String(code));
}
// a person's own company on the list: their Intake company, else the company name they came with
const homeOf = (r) => (r.company_id ? 'id:' + Number(r.company_id) : 'n:' + (nameKey(r.company || '') || String(r.company || '').trim().toLowerCase()));
const keyOf = (r, cos) => (r.assigned && cos.has(Number(String(r.assigned).slice(3))) ? String(r.assigned) : homeOf(r));
// "Thursday 12 November 2026, 14:32" (his rule: a date names the full weekday)
const when = (iso) => {
  if (!iso) return '';
  const o = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Riga', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${o.weekday} ${o.day} ${o.month} ${o.year}, ${o.hour}:${o.minute}`;
};

async function versionOf(db, code) {
  const v = await db.prepare('SELECT id, at, by_name FROM tc_go_saves WHERE sender = ? ORDER BY id DESC LIMIT 1').get(String(code));
  return v ? { id: Number(v.id), at: v.at, by: v.by_name || '' } : { id: 0, at: null, by: '' };
}

// a mailbox domain anyone can have says nothing about who knows the person
const FREE_MAIL = new Set(['gmail.com', 'inbox.lv', 'outlook.com', 'hotmail.com', 'yahoo.com', 'mail.ru', 'icloud.com', 'live.com', 'yandex.ru', 'gmx.de', 'gmx.net', 'one.lv', 'apollo.lv']);
const coNorm = (s) => String(s || '').toLowerCase().replace(/\b(sia|as|ltd|limited|gmbh|aps|a\/s|oy|ab|uab|ou|oü|inc|llc|co)\b/g, '').replace(/[^a-z0-9ā-ž]+/g, ' ').trim();
const domainOf = (e) => { const d = String(e || '').toLowerCase().split('@')[1] || ''; return d && !FREE_MAIL.has(d) ? d : ''; };
/** Who most likely knows a person: the list owner with the most people at the same company (2 points each) or the same email
 *  domain (1 point each). Returns (person, notCode) => owner codes, most likely first (empty when nothing points anywhere). */
async function likelyOwners(db) {
  const rows = await db.prepare('SELECT sender, company, email FROM tc_go_stage2 WHERE gone = 0').all();
  const byCo = new Map(), byDom = new Map();
  const bump = (m, k, s) => { if (!k) return; if (!m.has(k)) m.set(k, new Map()); m.get(k).set(s, (m.get(k).get(s) || 0) + 1); };
  for (const r of rows) { bump(byCo, coNorm(r.company), r.sender); bump(byDom, domainOf(r.email), r.sender); }
  return (person, notCode) => {
    const score = new Map();
    for (const [s, n] of byCo.get(coNorm(person.company)) || []) score.set(s, (score.get(s) || 0) + 2 * n);
    for (const [s, n] of byDom.get(domainOf(person.email)) || []) score.set(s, (score.get(s) || 0) + n);
    score.delete(notCode);
    return [...score].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).map(([s]) => s);
  };
}

/** The SAVED list: { code, name, people, companies, figures, groups, version, draft }; the editor's own draft comes with it when
 * it was made on this saved version. */
export async function myList(db, code, editor = '') {
  if (!S2().some((s) => s.code === code)) throw new TcInputError('There is no such list.');
  // PASS ON (patch 152): who is passed to this list, who on it is passed on, and who each person was with before.
  // A person this list passed on leaves it at once (patch 160, the owner 20.11.2026): no "Passed to X, waiting" line; he is on
  // the other owner's "Passed to you" until accepted or passed further
  const P = await passState(db, code);
  // WAIVER (patch 160): a person put on the shared list leaves this list too, until a colleague takes him
  const Wv = await waiverState(db);
  const rows = (await rowsOf(db, code)).filter((r) => !P.waiting[Number(r.id)] && !Wv.ids.has(Number(r.id)));
  const cos = new Map((await cachedAll(db, 'companies', 'SELECT id, name, country, address, city FROM tc_companies WHERE archived_at IS NULL')).map((c) => [Number(c.id), c]));
  const picks = new Map((await db.prepare('SELECT company_key, decision, way FROM tc_go_company_picks WHERE sender = ?').all(String(code))).map((p) => [p.company_key, p]));
  const out = new Set((await db.prepare('SELECT stage2_id FROM tc_go_people_out WHERE out_flag = 1').all()).map((r) => Number(r.stage2_id)));
  const groups = new Map();
  for (const r of rows) {
    const key = keyOf(r, cos), cid = key.startsWith('id:') ? Number(key.slice(3)) : null, co = cid ? cos.get(cid) : null;
    if (!groups.has(key)) {
      const p = picks.get(key) || {};
      // a group's own row carries TOTAL where a country stands (the Excel's group total); the person's country is shown instead
      const coCountry = co && co.country && !/^total$/i.test(String(co.country).trim()) ? co.country : '';
      groups.set(key, { key, name: (co && co.name) || String(r.company || '').trim() || 'No company', country: coCountry || r.country || '',
        address: [co && co.address, co && co.city].filter(Boolean).join(', '), intake: Boolean(co),
        decision: p.decision || null, way: wayNorm(p.decision, p.way), people: [] });
    }
    const g = groups.get(key), isOut = out.has(Number(r.id)), fresh = Boolean(Number(r.fresh));
    // an Invite reaches somebody only once its way is picked: until then its people are still to decide (the audit, 12.11.2026);
    // a person added from the company page after the company was decided is still to decide until Done (patch 145, 16.11.2026)
    // no email: Postcard only, with an Add email box on the list (patch 149, 16.11.2026)
    g.people.push({ id: Number(r.id), label: personLabel(r.name, g.name, r.email), position: r.position || '', email: String(r.email || '').toLowerCase(), out: isOut,
      postcard: !String(r.email || '').trim(),
      moved: key !== homeOf(r), fresh,
      decision: fresh ? null : g.decision === 'invite' ? (g.way ? (isOut ? 'no' : 'invite') : null) : g.decision === 'no' ? 'no' : null });
  }
  const list = [...groups.values()].sort((a, b) => b.people.length - a.people.length || a.name.localeCompare(b.name, 'lv'));
  const all = list.flatMap((g) => g.people);
  const version = await versionOf(db, code);
  let draft = null;
  if (editor) {
    const d = await db.prepare('SELECT state, base, saved_at, saved_by FROM tc_go_drafts WHERE sender = ? AND editor = ?').get(String(code), String(editor).toLowerCase());
    if (d && d.state && Number(d.base) === version.id) { try { draft = { state: JSON.parse(d.state), at: d.saved_at, by: d.saved_by || '' }; } catch (e) { draft = null; } }
  }
  for (const p of all) if (P.involved[p.id]) p.involved = P.involved[p.id];
  // MOST LIKELY (patch 160): the other owner who most likely knows the person, shown first in the Pass on window
  const likely = await likelyOwners(db);
  for (const g of list) for (const p of g.people) p.likely = likely({ company: g.name, email: p.email }, code);
  for (const x of P.passedToYou) x.likely = likely({ company: x.company, email: x.email }, code);
  // the shared list: everyone's waivers; the one most likely to know a person sees "You most likely know him"
  const shared = Wv.list.map((x) => ({ ...x, mine: x.from === code, likelyYou: x.from !== code && likely({ company: x.company, email: x.email }, x.from)[0] === code }));
  return { code, name: (S2().find((s) => s.code === code) || {}).name || code, people: all.length, companies: list.length, passedToYou: P.passedToYou, shared,
    owners: S2().map((s) => ({ code: s.code, name: s.name || s.code })),
    figures: { todo: all.filter((p) => !p.decision).length, invite: all.filter((p) => p.decision === 'invite').length, no: all.filter((p) => p.decision === 'no').length },
    groups: list, version, draft };
}

/** The state the page works on, read from what is saved: { picks: { key: { decision, way } }, out: [ids], moves: {}, settled: [] }.
 * settled = the new people (added after their company was decided) whose company the owner pressed Done on. */
export function stateOf(list) {
  const picks = {};
  for (const g of list.groups) if (g.decision || g.way) picks[g.key] = { decision: g.decision, way: g.way };
  return { picks, out: list.groups.flatMap((g) => g.people.filter((p) => p.out).map((p) => p.id)), moves: {}, settled: [] };
}

/** A state from the page, checked against this list. A wrong value is refused; a company or person no longer on the list (an old
 * draft) is dropped, never a reason to refuse the Save (the audit, 12.11.2026). A drag goes only onto a company in Intake. */
function clean(list, state) {
  const s = state && typeof state === 'object' ? state : {};
  const keys = new Set(list.groups.map((g) => g.key)), ids = new Set(list.groups.flatMap((g) => g.people.map((p) => p.id)));
  const intake = new Set(list.groups.filter((g) => g.intake).map((g) => g.key));
  const picks = {};
  for (const [k, v] of Object.entries(s.picks || {})) {
    const decision = v && v.decision ? String(v.decision) : null, way = v && v.way ? String(v.way) : null;
    if (decision && !['invite', 'no'].includes(decision)) throw new TcInputError('Invite or No?');
    if (way && way.split(',').some((x) => !WAYS.includes(x.trim()))) throw new TcInputError('Digital, in person or by mail?');
    if (keys.has(k)) picks[k] = { decision, way: wayNorm(decision, way) };
  }
  const out = [...new Set([].concat(s.out || []).map(Number))].filter((id) => ids.has(id));
  const moves = {};
  for (const [id, k] of Object.entries(s.moves || {})) if (ids.has(Number(id)) && intake.has(String(k))) moves[Number(id)] = String(k);
  const fresh = new Set(list.groups.flatMap((g) => g.people.filter((p) => p.fresh).map((p) => p.id)));
  const settled = [...new Set([].concat(s.settled || []).map(Number))].filter((id) => fresh.has(id));
  return { picks, out, moves, settled };
}

// one statement per table and chunk (the audit, 12.11.2026: a Save of the whole list stays one short round of writes)
async function insertMany(tx, sql, n, rows, tail = '') {
  for (let i = 0; i < rows.length; i += 200) {
    const part = rows.slice(i, i + 200);
    await tx.prepare(`${sql} VALUES ${part.map(() => '(' + Array(n).fill('?').join(',') + ')').join(',')} ${tail}`).run(...part.flat());
  }
}

/** Autosave: keep this editor's unsaved work as their draft. Never a decision; a draft on an older saved version is ignored. */
export async function saveDraft(db, code, state, actor, base = 0, editor = '') {
  const list = await myList(db, code);
  if (Number(base || 0) !== list.version.id) return { ok: true, ignored: true };
  const json = JSON.stringify(clean(list, state));
  if (json.length > 400000) throw new TcInputError('The draft is too large.');
  await db.prepare(`INSERT INTO tc_go_drafts (sender, editor, state, base, saved_at, saved_by) VALUES (?,?,?,?,?,?)
    ON CONFLICT (sender, editor) DO UPDATE SET state = excluded.state, base = excluded.base, saved_at = excluded.saved_at, saved_by = excluded.saved_by`)
    .run(code, String(editor || actor || '').toLowerCase(), json, list.version.id, nowIso(), actor);
  return { ok: true };
}
/** "Don't save": this editor's draft goes; what was saved stays. */
export async function dropDraft(db, code, editor = '') {
  // rows are never deleted (security_guards (e)): the draft is emptied, and an empty draft is no draft
  await db.prepare("UPDATE tc_go_drafts SET state = '', saved_at = ? WHERE sender = ? AND editor = ?").run(nowIso(), code, String(editor).toLowerCase());
  return { ok: true };
}

/** Save: only what changed against the saved list becomes the decision, in one transaction. Nothing changed = nothing written.
 * A page that loaded an older version (base) and sends its changes (patch 155, his pick "We need to fix this all!"): each change
 * carries the value the page saw before it; the changes go on top of the newest list, and only a company or person that somebody
 * else changed in between (now neither what the page saw nor what it wants) keeps the newer value and is named back in
 * `conflicts`. A data step or another save never makes a director's work vanish. A page without `changes` (an old tab) on an
 * older version is refused as before ("Saved by ... - load it?"). */
export async function saveState(db, code, state, actor, base = null, editor = '', changes = null) {
  const before = await myList(db, code);
  let conflicts = [];
  if (base !== null && base !== undefined && Number(base) !== before.version.id) {
    if (!changes || typeof changes !== 'object') {
      const v = before.version;
      throw new MlConflict(`Saved by ${v.by || 'someone else'} at ${when(v.at)} - load it?`, v.by, v.at);
    }
    const m = mergeOnto(before, state, changes);
    state = m.state; conflicts = m.conflicts;
  }
  const st = clean(before, state);
  const at = nowIso();
  const saved = stateOf(before), groupOf = new Map(before.groups.flatMap((g) => g.people.map((p) => [p.id, g])));
  const norm = (p) => ({ decision: (p && p.decision) || null, way: wayNorm(p && p.decision, p && p.way) });
  const pickRows = [...new Set([...Object.keys(saved.picks), ...Object.keys(st.picks)])]
    .filter((k) => JSON.stringify(norm(saved.picks[k])) !== JSON.stringify(norm(st.picks[k])))
    .map((k) => { const p = norm(st.picks[k]); return [code, k, p.decision, p.way, at, actor]; });
  const was = new Set(saved.out), now = new Set(st.out);
  const outRows = [...new Set([...was, ...now])].filter((id) => was.has(id) !== now.has(id)).map((id) => [id, now.has(id) ? 1 : 0, at, actor]);
  const moves = Object.entries(st.moves).map(([id, to]) => [Number(id), to]).filter(([id, to]) => groupOf.get(id).key !== to);
  const editorKey = String(editor || actor || '').toLowerCase();
  if (!pickRows.length && !outRows.length && !moves.length && !st.settled.length) {   // Ctrl+S on nothing: no stamp, no write (the audit, 12.11.2026)
    await dropDraft(db, code, editorKey);
    return { ...before, draft: null, unchanged: true, conflicts };
  }
  const was0 = new Map(before.groups.flatMap((g) => g.people.map((p) => [p.id, { key: g.key, decision: p.decision, way: p.decision === 'invite' ? g.way : null }])));
  await db.transaction(async (tx) => {
    // 1. the moves: on THIS list only; a person with no Intake company gets an Intake contact at the company they were dragged to
    if (moves.length) {
      const rows = new Map((await rowsOf(tx, code)).map((r) => [Number(r.id), r]));
      const assign = [], contacts = [], log = [];
      for (const [id, to] of moves) {
        const r = rows.get(id), from = groupOf.get(id).key;
        if (r.company_id) assign.push([id, code, to === homeOf(r) ? '' : to, at, actor]);
        else {
          const email = String(r.email || '').trim().toLowerCase() || null;
          contacts.push([Number(to.slice(3)), r.name || null, r.position || null, email, r.ch_contact_id, 'go-mylist-move', at, actor]);
          await logTcActivity(tx, Number(to.slice(3)), { kind: 'edit', field: 'contact', old: null, new: r.name || email, body: 'Contact added from My Grand Opening list', actor, at });
        }
        log.push([id, code, from, to, at, actor]);
      }
      if (assign.length) await insertMany(tx, 'INSERT INTO tc_go_assign (stage2_id, sender, company_key, set_at, set_by)', 5, assign,
        'ON CONFLICT (stage2_id) DO UPDATE SET company_key = excluded.company_key, set_at = excluded.set_at, set_by = excluded.set_by');
      if (contacts.length) await insertMany(tx, 'INSERT INTO tc_company_contacts (company_id, name, position, email, ch_contact_id, source, created_at, created_by)', 8, contacts);
      await insertMany(tx, 'INSERT INTO tc_go_moves (stage2_id, sender, from_key, to_key, at, by_name)', 6, log);
    }
    // 2. the companies whose decision or way changed
    if (pickRows.length) await insertMany(tx, 'INSERT INTO tc_go_company_picks (sender, company_key, decision, way, set_at, set_by)', 6, pickRows,
      'ON CONFLICT (sender, company_key) DO UPDATE SET decision = excluded.decision, way = excluded.way, set_at = excluded.set_at, set_by = excluded.set_by');
    // 3. the people tapped out or back in
    if (outRows.length) await insertMany(tx, 'INSERT INTO tc_go_people_out (stage2_id, out_flag, set_at, set_by)', 4, outRows,
      'ON CONFLICT (stage2_id) DO UPDATE SET out_flag = excluded.out_flag, set_at = excluded.set_at, set_by = excluded.set_by');
    // 3b. the new people whose company the owner pressed Done on: from now on they follow the company like everyone else
    if (st.settled.length) await tx.prepare(`UPDATE tc_go_people_new SET settled_at = ?, settled_by = ? WHERE settled_at IS NULL AND stage2_id IN (${st.settled.map(() => '?').join(',')})`)
      .run(at, actor, ...st.settled);
    // 4. every person whose result changed, kept
    const after = await myList(tx, code), logRows = [];
    for (const g of after.groups) for (const p of g.people) {
      const w = was0.get(p.id) || {}, way = p.decision === 'invite' ? g.way : null;
      if (w.decision === p.decision && w.way === way && w.key === g.key) continue;
      logRows.push([p.id, code, p.decision, way, at, actor]);
    }
    if (logRows.length) await insertMany(tx, 'INSERT INTO tc_go_decision_log (stage2_id, sender, decision, way, at, by_name)', 6, logRows);
    await tx.prepare('INSERT INTO tc_go_saves (sender, at, by_name) VALUES (?,?,?)').run(code, at, actor);
    await tx.prepare("UPDATE tc_go_drafts SET state = '', saved_at = ? WHERE sender = ? AND editor = ?").run(at, code, editorKey);
  });
  // the cards (patch 147, his pick "Automatic"): every company Invite on this list has its card; a failure never undoes the Save
  try { await linkCards(db, [code], actor); } catch (e) { console.error(`cards: linking after the save of list ${code} failed (${e.message})`); }
  return { ...(await myList(db, code, editorKey)), conflicts };
}

// THE MERGE (patch 155). `changes` = { picks: { key: { decision, way } | null (what the page saw) }, out: { id: true | false (was
// the person tapped out when the page loaded) }, moves: { id: 'key the person was under when the page loaded' } }. Pure: builds the
// state to save from the NEWEST list plus the page's changes; a change whose item moved on since (now differs from both what the
// page saw and what it wants) keeps the newest value and is named.
const MAX_CHANGES = 5000;
export function mergeOnto(list, state, changes) {
  const page = state && typeof state === 'object' ? state : {};
  const cur = stateOf(list), conflicts = [];
  const norm = (p) => (p && p.decision ? JSON.stringify({ decision: p.decision, way: wayNorm(p.decision, p.way) }) : 'null');
  const nameOf = new Map(list.groups.map((g) => [g.key, g.name]));
  const personOf = new Map(list.groups.flatMap((g) => g.people.map((p) => [p.id, { label: p.label, key: g.key, company: g.name, out: p.out }])));
  const picks = { ...cur.picks };
  for (const [k, from] of Object.entries((changes.picks && typeof changes.picks === 'object') ? changes.picks : {}).slice(0, MAX_CHANGES)) {
    const want = (page.picks || {})[k] || null, now = cur.picks[k] || null;
    if (norm(now) !== norm(from) && norm(now) !== norm(want)) { conflicts.push({ kind: 'company', key: k, name: nameOf.get(k) || k }); continue; }
    if (want && want.decision) picks[k] = { decision: want.decision, way: wayNorm(want.decision, want.way) };
    else delete picks[k];
  }
  const out = new Set(cur.out), pageOut = new Set([].concat(page.out || []).map(Number));
  for (const [id, wasOut] of Object.entries((changes.out && typeof changes.out === 'object') ? changes.out : {}).slice(0, MAX_CHANGES)) {
    const n = Number(id), p = personOf.get(n);
    if (!p) continue;
    const want = pageOut.has(n), now = out.has(n);
    if (now !== Boolean(wasOut) && now !== want) { conflicts.push({ kind: 'person', id: n, name: p.label, company: p.company }); continue; }
    if (want) out.add(n); else out.delete(n);
  }
  const moves = {};
  for (const [id, fromKey] of Object.entries((changes.moves && typeof changes.moves === 'object') ? changes.moves : {}).slice(0, MAX_CHANGES)) {
    const n = Number(id), p = personOf.get(n), to = (page.moves || {})[id];
    if (!p || !to) continue;
    if (p.key !== String(fromKey) && p.key !== String(to)) { conflicts.push({ kind: 'person', id: n, name: p.label, company: p.company }); continue; }
    moves[n] = String(to);
  }
  return { state: { picks, out: [...out], moves, settled: [].concat(page.settled || []) }, conflicts };
}

/** The people the owner's Stage 2 send goes to: invited, the company's way digital, not tapped out (saved state only). */
export async function digitalIds(db, code) {
  const L = await myList(db, code);
  return new Set(L.groups.filter((g) => g.decision === 'invite' && wayHas(g.way, 'digital')).flatMap((g) => g.people.filter((p) => p.decision === 'invite').map((p) => p.id)));
}

/** The postcard list: one row per invited person whose company goes in person or by mail, from the lists given. */
export async function postcardRows(db, codes) {
  const rows = [];
  for (const code of codes) {
    const L = await myList(db, code);
    for (const g of L.groups) {
      if (g.decision !== 'invite' || !g.way) continue;
      // a digital company's people with no email are Postcard only (patch 149): by mail, until somebody adds their email
      for (const p of g.people) if (p.decision === 'invite' && (physical(g.way) || p.postcard)) rows.push({ person: p.label, position: p.position, company: g.name, country: g.country, address: g.address, way: physical(g.way) || 'post', owner: L.name });
    }
  }
  return rows;
}

// A CONTACT ONTO A LIST FROM THE COMPANY PAGE (Client Hub step 4, his pick "Yes, A, build it", 16.11.2026, picture
// _pictures/CH_step4_business_cards.html column A): the Add contact form has one more box, "Grand Opening list", pre-set to the
// owner who already has this company. Save puts the new contact on that owner's Stage 2 list under this company.

/** Which list already has this company: the owner with the most people under it (as their list groups them), or null. */
export async function listHolding(db, companyId) {
  const id = Number(companyId);
  const co = await db.prepare('SELECT id, name FROM tc_companies WHERE id = ?').get(id);
  if (!co) return null;
  const rows = await db.prepare(`SELECT s.id, s.sender, s.company, MIN(k.company_id) AS company_id, MAX(a.company_key) AS assigned
    FROM tc_go_stage2 s LEFT JOIN tc_company_contacts k ON k.ch_contact_id = s.ch_contact_id AND k.archived_at IS NULL
      AND k.company_id IN (SELECT id FROM tc_companies WHERE archived_at IS NULL)
    LEFT JOIN tc_go_assign a ON a.stage2_id = s.id AND a.sender = s.sender
    WHERE s.gone = 0 AND (k.company_id = ? OR a.company_key = ? OR LOWER(s.company) = LOWER(?))
    GROUP BY s.id, s.sender, s.company`).all(id, 'id:' + id, String(co.name || ''));
  const want = 'id:' + id, wantName = 'n:' + nameKey(co.name || ''), n = new Map();
  for (const r of rows) {
    const key = r.assigned ? String(r.assigned) : homeOf(r);
    if (key !== want && key !== wantName) continue;
    if (S2().some((x) => x.code === r.sender)) n.set(r.sender, (n.get(r.sender) || 0) + 1);
  }
  const order = (c) => S2().findIndex((x) => x.code === c);
  const best = [...n.entries()].sort((a, b) => b[1] - a[1] || order(a[0]) - order(b[0]))[0];
  return best ? best[0] : null;
}

/** The box on the form: every list owner by name, and the one pre-set. */
export async function listBox(db, companyId) {
  return { options: S2().map((s) => ({ code: s.code, name: s.name || s.code })), has: await listHolding(db, companyId) };
}

/** A real list code, or '' for "Not on a list"; anything else is refused. */
export function checkListCode(code) {
  const c = String(code ?? '').trim();
  if (!c) return '';
  if (!S2().some((s) => s.code === c)) throw new TcInputError('Pick a Grand Opening list from the box.');
  return c;
}

/** Inside the Add contact transaction: put the new contact on list `code` under its company. An email already on any list is not
 * added twice. A company already decided (Invite or No) on that list keeps its decision; the person is still to decide there until
 * the owner presses Done on it. Returns what happened, for the form. */
export async function addContactToList(tx, { code, company, contactId, f, actor, at }) {
  const owner = S2().find((s) => s.code === code) || {};
  const ownerName = owner.name || code;
  if (f.email) {
    const on = await tx.prepare('SELECT sender FROM tc_go_stage2 WHERE gone = 0 AND LOWER(email) = ? ORDER BY id LIMIT 1').get(f.email);
    if (on) return { list: 'already', owner: (S2().find((s) => s.code === on.sender) || {}).name || on.sender };
  }
  const ch = 'intake:' + Number(contactId);   // no Client Hub id: the contact's own Intake id, so the list finds them under this company
  await tx.prepare('UPDATE tc_company_contacts SET ch_contact_id = ? WHERE id = ?').run(ch, Number(contactId));
  const country = company.country && !/^total$/i.test(String(company.country).trim()) ? company.country : null;
  const r = await tx.prepare(`INSERT INTO tc_go_stage2 (ch_contact_id, sender, name, company, position, country, email, gone, loaded_at, loaded_by)
    VALUES (?,?,?,?,?,?,?,0,?,?)`).run(ch, code, f.name, company.name, f.position, country, f.email, at, actor);
  const sid = Number(r.lastInsertRowid);
  const pick = await tx.prepare('SELECT decision FROM tc_go_company_picks WHERE sender = ? AND company_key = ?').get(code, 'id:' + Number(company.id));
  const decided = Boolean(pick && pick.decision);
  // a decided company: the person simply follows its decision and way (patch 152f, his pick "People follow company")
  await logTcActivity(tx, Number(company.id), { kind: 'edit', field: 'go_list', old: null, new: ownerName,
    body: `Added to the Grand Opening list of ${ownerName}`, actor, at, contactId: Number(contactId) });
  return { list: 'added', owner: ownerName, decided };
}

// EVERY CONTACT ON A LIST (16.11.2026, patch 149). His rule: "ALL CONTACTS have companies. all have the same mechanism. who cares
// how they got into the contact list?" and "no email people also need to be included, but they should be mentioned physical only or
// add an email!!!!". One rule for every contact, however they came in (the Client Hub split, the October Excel, an import, by hand):
//   - already on a list (by Client Hub id or by email): stays where they are
//   - a Do not invite / hold mark for the Grand Opening (src/tcgo.js marks: a manager's decision, a dead or company mailbox, our
//     own staff, hold): stays off, and is counted under that reason on the Grand Opening page
//   - waiting for an approver (hidden_at): stays off until approved
//   - dropped from a list once with no reason recorded (gone = 1, the 28.10 Client Hub reload): back on that same list
//   - else: onto the list of the owner who already has the company (listHolding's rule), under that company. A company already
//     decided (Invite or No) keeps its decision; the person is still to decide there until Done (patch 145's mechanism)
//   - a company nobody has yet: divided by his established rules (src/tcgosplit.js: recent clients only, C level to DS / AB,
//     offshore to Alma, else the most similar list, evenly); a company whose last course was before 2023 stays off with that reason
// A person with no email goes on the list too: the list shows them as Postcard only, with an Add email box.
// placeEveryone is NOT run by imports since patch 151 (the owner, 16.11.2026: back to the original lists); placement() still
// names who is off and why, for the Grand Opening page.
// Added the same day (his words through Intake MASTER CONTROL):
//   - "Info we will not invite." + "Only if that info or generic department email is the only one of that company, and its an
//     important company.": a company or department mailbox (info@, office@, crewing@ ...; config grandOpening.invite.
//     companyMailboxes) stays off; when it is the ONLY contact of its company it waits for his pick of the important ones
//   - "Make sure you merge the contacts that are under same company or daughter/morther companies!": the same person twice (the
//     same email, or the same name at the same company) is one person; a daughter company's people go to the list that has its
//     mother company (or any company of the family), never to another owner
export const LEFT_WHY = { approval: 'Waiting for approval', nobody: 'No list has this company yet', same_email: 'Same email as a person already on a list',
  same_person: 'Same person as one already on a list', mailbox: 'Company mailbox, not a person', mailbox_only: 'Only a company mailbox' };

const MAILBOXES = () => new Set((((TC.grandOpening || {}).invite || {}).companyMailboxes) || []);
/** A company or department mailbox (info@, office@, crewing@ ...), by the part before the @. */
export function isCompanyMailbox(email) {
  const local = String(email || '').trim().toLowerCase().split('@')[0];
  return Boolean(local) && MAILBOXES().has(local.replace(/[0-9]+$/, ''));
}
const personKey = (companyId, name) => { const n = nameKey(name || ''); return n ? companyId + '|' + n : null; };

/** Each company's mother: { companyId: motherId } for every company in a confirmed family (src/tcgo.js motherCompanyList's rule). */
export async function mothers(db) {
  return new Map((await db.prepare(`SELECT m.company_id, f.parent_id FROM tc_family_members m JOIN tc_families f ON f.id = m.family_id
    WHERE m.ended_at IS NULL AND f.ended_at IS NULL`).all()).map((r) => [Number(r.company_id), Number(r.parent_id)]));
}

/** Which list owner has each company: { companyId: code }, by the same count as listHolding (most people, then list order),
 *  counted per mother company: every company of a family gets the owner who has the most of the family's people. */
export async function holders(db) {
  const rows = await db.prepare(`SELECT s.id, s.sender, s.company, MIN(k.company_id) AS company_id, MAX(a.company_key) AS assigned
    FROM tc_go_stage2 s LEFT JOIN tc_company_contacts k ON k.ch_contact_id = s.ch_contact_id AND k.archived_at IS NULL
      AND k.company_id IN (SELECT id FROM tc_companies WHERE archived_at IS NULL)
    LEFT JOIN tc_go_assign a ON a.stage2_id = s.id AND a.sender = s.sender
    WHERE s.gone = 0 GROUP BY s.id, s.sender, s.company`).all();
  const all = await db.prepare('SELECT id, name FROM tc_companies WHERE archived_at IS NULL').all();
  const byName = new Map();
  for (const c of all) {
    const k = nameKey(c.name || '');
    if (k) byName.set(k, byName.has(k) ? null : Number(c.id));   // a name two companies share names neither
  }
  const mom = await mothers(db), top = (id) => mom.get(id) || id;
  const n = new Map();
  for (const r of rows) {
    if (!S2().some((x) => x.code === r.sender)) continue;
    const key = r.assigned ? String(r.assigned) : homeOf(r);
    const id = key.startsWith('id:') ? Number(key.slice(3)) : byName.get(key.slice(2)) || null;
    if (!id) continue;
    const m = n.get(top(id)) || new Map();
    m.set(r.sender, (m.get(r.sender) || 0) + 1);
    n.set(top(id), m);
  }
  const order = (c) => S2().findIndex((x) => x.code === c);
  const out = {};
  for (const c of all) {
    const m = n.get(top(Number(c.id)));
    if (m) out[Number(c.id)] = [...m.entries()].sort((a, b) => b[1] - a[1] || order(a[0]) - order(b[0]))[0][0];
  }
  return out;
}

/** What placeEveryone would do, writing nothing: { on, place: [...], revive: [...], left: [...] }. */
export async function placement(db) {
  // people with an email first, so the same person twice keeps the one that can be emailed
  const contacts = await db.prepare(`SELECT k.id, k.company_id, k.name, k.position, k.email, k.ch_contact_id, k.hidden_at,
      c.name AS co_name, c.country AS co_country, c.hidden_at AS co_hidden
    FROM tc_company_contacts k JOIN tc_companies c ON c.id = k.company_id AND c.archived_at IS NULL
    WHERE k.archived_at IS NULL ORDER BY CASE WHEN k.email IS NULL OR k.email = '' THEN 1 ELSE 0 END, k.id`).all();
  const live = await db.prepare(`SELECT s.ch_contact_id, s.email, s.name, MIN(k.company_id) AS company_id FROM tc_go_stage2 s
    LEFT JOIN tc_company_contacts k ON k.ch_contact_id = s.ch_contact_id AND k.archived_at IS NULL WHERE s.gone = 0
    GROUP BY s.id, s.ch_contact_id, s.email, s.name`).all();
  const liveCh = new Set(live.map((r) => r.ch_contact_id)), emails = new Set(live.map((r) => String(r.email || '').trim().toLowerCase()).filter(Boolean));
  const people = new Set(live.map((r) => (r.company_id ? personKey(Number(r.company_id), r.name) : null)).filter(Boolean));
  const gone = new Map((await db.prepare('SELECT id, ch_contact_id, sender FROM tc_go_stage2 WHERE gone = 1').all()).map((r) => [r.ch_contact_id, r]));
  const why = new Map(((((TC.grandOpening || {}).invite || {}).why) || []).map((w) => [w.id, w.label]));
  const marks = await db.prepare(`SELECT company_id, contact_id, kind, why FROM tc_invite_marks WHERE event = 'go' AND ended_at IS NULL`).all();
  const markOf = new Map(), coMark = new Map();
  for (const m of marks) { if (m.contact_id) markOf.set(Number(m.contact_id), m); else coMark.set(Number(m.company_id), m); }
  // a company whose every contact is a company mailbox
  const persons = new Set(contacts.filter((k) => !isCompanyMailbox(k.email) && (String(k.email || '').trim() || String(k.name || '').trim())).map((k) => Number(k.company_id)));
  const has = await holders(db);
  const out = { on: 0, place: [], revive: [], left: [] };
  const planned = new Set();   // emails this run puts on a list: a second contact with one of them is the same address twice
  const nobody = [];
  for (const k of contacts) {
    const email = String(k.email || '').trim().toLowerCase(), who = personKey(Number(k.company_id), k.name);
    if ((k.ch_contact_id && liveCh.has(k.ch_contact_id)) || (email && emails.has(email))) { out.on += 1; continue; }
    const base = { contactId: Number(k.id), companyId: Number(k.company_id), company: k.co_name, name: k.name || '', email, position: k.position || null,
      ch: k.ch_contact_id || null, country: k.co_country && !/^total$/i.test(String(k.co_country).trim()) ? k.co_country : null };
    const m = markOf.get(Number(k.id)) || coMark.get(Number(k.company_id));
    if (m) { out.left.push({ ...base, reason: 'mark', kind: m.kind, label: (m.kind === 'hold' ? 'Hold: ' : 'Do not invite: ') + String(why.get(m.why) || m.why).replace(/^Hold: /, '') }); continue; }
    if (k.hidden_at || k.co_hidden) { out.left.push({ ...base, reason: 'approval', label: LEFT_WHY.approval }); continue; }
    if (email && planned.has(email)) { out.left.push({ ...base, reason: 'same_email', label: LEFT_WHY.same_email }); continue; }
    if (who && people.has(who)) { out.left.push({ ...base, reason: 'same_person', label: LEFT_WHY.same_person }); continue; }
    if (isCompanyMailbox(email)) {
      // the only contact of its company: his pick 16.11.2026 "The 45 with a course since 2023" - such a mailbox goes on by the same
      // rules when the company has a course since 2023 (src/tcgosplit.js), else stays off as "Only a company mailbox"
      if (!persons.has(Number(k.company_id))) { if (email && !planned.has(email)) { planned.add(email); nobody.push({ ...base, mailboxOnly: true, holder: has[Number(k.company_id)] || null }); } continue; }
      out.left.push({ ...base, reason: 'mailbox', label: 'Do not invite: ' + LEFT_WHY.mailbox });
      continue;
    }
    const was = gone.get(k.ch_contact_id || 'intake:' + Number(k.id));
    if (was) { out.revive.push({ ...base, stage2Id: Number(was.id), code: was.sender }); if (email) planned.add(email); if (who) people.add(who); continue; }
    const code = has[Number(k.company_id)];
    if (!code) { nobody.push(base); continue; }
    if (email) planned.add(email);
    if (who) people.add(who);
    out.place.push({ ...base, code });
  }
  // the companies no list has yet: divided by his established rules (src/tcgosplit.js), a whole family to one owner
  if (nobody.length) {
    const alias = { 'alma@novikontas.org': 'Alma' };   // the person-in-charge address Intake holds for Alma (his mailbox is alm@)
    const picOwner = (mail) => alias[mail] || (S2().find((x) => String(x.email || '').toLowerCase() === mail) || {}).code || null;
    const sp = await splitNew(db, nobody, out.place, { owners: S2().map((x) => x.code), mom: await mothers(db), picOwner, mailboxOnly: LEFT_WHY.mailbox_only });
    out.place.push(...sp.place);
    out.left.push(...sp.left);
  }
  return out;
}

/** Every company an owner has decided, saved or still only in his draft: a Set of "<code>|<company key>". */
export async function decidedKeys(db) {
  const out = new Set((await db.prepare('SELECT sender, company_key, decision FROM tc_go_company_picks').all()).filter((p) => p.decision).map((p) => p.sender + '|' + p.company_key));
  for (const d of await db.prepare('SELECT sender, state FROM tc_go_drafts').all()) {
    let st = null; try { st = JSON.parse(d.state || 'null'); } catch (e) { st = null; }
    for (const [key, pick] of Object.entries((st && st.picks) || {})) if (pick && pick.decision) out.add(d.sender + '|' + key);
  }
  return out;
}

/** Every contact not on a list goes onto one by the rule above. Returns { on, placed, revived, left, byList, leftBy }. */
export async function placeEveryone(db, actor, at = nowIso()) {
  const P = await placement(db);
  if (P.place.length || P.revive.length) {
    await db.transaction(async (tx) => {
      // a person who comes into a decided company follows its decision and way (patch 152f, his pick "People follow company")
      const owner = (code) => (S2().find((s) => s.code === code) || {}).name || code;
      for (const r of P.revive) {
        await tx.prepare('UPDATE tc_go_stage2 SET gone = 0 WHERE id = ? AND gone = 1').run(r.stage2Id);
        await logTcActivity(tx, r.companyId, { kind: 'edit', field: 'go_list', old: null, new: owner(r.code), body: `Back on the Grand Opening list of ${owner(r.code)}`, actor, at, contactId: r.contactId });
      }
      for (const r of P.place) {
        const ch = r.ch || 'intake:' + r.contactId;
        if (!r.ch) await tx.prepare('UPDATE tc_company_contacts SET ch_contact_id = ? WHERE id = ? AND ch_contact_id IS NULL').run(ch, r.contactId);
        const ins = await tx.prepare(`INSERT INTO tc_go_stage2 (ch_contact_id, sender, name, company, position, country, email, gone, loaded_at, loaded_by)
          VALUES (?,?,?,?,?,?,?,0,?,?)`).run(ch, r.code, r.name || null, r.company, r.position, r.country, r.email || null, at, actor);
        await logTcActivity(tx, r.companyId, { kind: 'edit', field: 'go_list', old: null, new: owner(r.code), body: `Added to the Grand Opening list of ${owner(r.code)}` + (r.why ? ` (${r.why})` : ''), actor, at, contactId: r.contactId });
      }
    });
  }
  const tally = (rows, f) => rows.reduce((o, r) => { o[f(r)] = (o[f(r)] || 0) + 1; return o; }, {});
  return { on: P.on, placed: P.place.length, revived: P.revive.length, left: P.left.length,
    byList: tally([...P.place, ...P.revive], (r) => r.code), leftBy: tally(P.left, (r) => r.label) };
}

// BACK TO THE ORIGINAL LISTS (16.11.2026, the owner: "we need to get back to the original list, because people are asking me
// questions already, who are they!?"; patch 151): no import puts anyone on a list by itself any more. The people the rule would
// place stay off, counted as "Not on a list yet", until a list owner takes them (the General list, patch 152).
export const NOT_YET = 'Not on a list yet';

/** The people off every list, for the Grand Opening page: [{ label, n, people: [{ name, email, company, companyId }] }]. */
export async function leftOff(db) {
  const P = await placement(db);
  const groups = new Map();
  for (const r of [...P.place, ...P.revive].map((x) => ({ ...x, label: NOT_YET })).concat(P.left)) {
    if (!groups.has(r.label)) groups.set(r.label, []);
    groups.get(r.label).push({ name: r.name, email: r.email, company: r.company, companyId: r.companyId });
  }
  return [...groups.entries()].map(([label, people]) => ({ label, n: people.length, people: people.sort((a, b) => String(a.company).localeCompare(String(b.company), 'lv')) }))
    .sort((a, b) => b.n - a.n);
}

/** ADD EMAIL (16.11.2026): a person on list `code` with no email gets one; the Intake contact gets it too, when it has none. */
export async function addEmail(db, code, stage2Id, raw, actor, at = nowIso()) {
  const email = String(raw || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) throw new TcInputError('That email address does not look right.');
  const s = await db.prepare('SELECT id, ch_contact_id, email FROM tc_go_stage2 WHERE id = ? AND sender = ? AND gone = 0').get(Number(stage2Id), String(code));
  if (!s) throw new TcInputError('This person is not on this list.');
  if (String(s.email || '').trim()) throw new TcInputError('This person already has an email.');
  const on = await db.prepare('SELECT sender FROM tc_go_stage2 WHERE gone = 0 AND LOWER(email) = ? LIMIT 1').get(email);
  if (on) throw new TcInputError(`This email is already on the list of ${(S2().find((x) => x.code === on.sender) || {}).name || on.sender}.`);
  return db.transaction(async (tx) => {
    await tx.prepare('UPDATE tc_go_stage2 SET email = ? WHERE id = ?').run(email, Number(s.id));
    const k = await tx.prepare('SELECT id, company_id, email FROM tc_company_contacts WHERE ch_contact_id = ? AND archived_at IS NULL').get(s.ch_contact_id);
    if (k && !String(k.email || '').trim()) {
      await tx.prepare('UPDATE tc_company_contacts SET email = ?, updated_at = ? WHERE id = ?').run(email, at, Number(k.id));
      await logTcActivity(tx, Number(k.company_id), { kind: 'edit', field: 'contact_email', old: null, new: email, body: 'Email added on the Grand Opening list', actor, at, contactId: Number(k.id) });
    }
    return { ok: true, email };
  });
}

// THE CARDS (patch 147, 16.11.2026; src/tccards.js). One company = one card = one place; the card stays the company's for good.

/** Every company saved as Invite on these lists gets its card (the one it has, or the next free one). Returns counts. */
export async function linkCards(db, codes, by) {
  const out = { invited: 0, linked: 0, had: 0, failed: 0, reachable: cards.reachable(db) };
  if (!out.reachable) return out;
  const before = await cards.linked(db);
  const seen = new Set();
  for (const code of codes) {
    const L = await myList(db, code);
    for (const g of L.groups) {
      if (g.decision !== 'invite' || seen.has(g.key)) continue;
      seen.add(g.key); out.invited += 1;
      if (before.has(g.key)) { out.had += 1; continue; }
      try { (await cards.link(db, g.key, g.name, by)) ? out.linked += 1 : out.failed += 1; }
      catch (e) { out.failed += 1; console.error(`cards: no card for one company (${e.message})`); }
    }
  }
  return out;
}

/** The export for the print run: one row per company Invite on these lists, in board order; a company still without a card
 * comes last with no place, so nothing is hidden. Dear = the first invited person with a name; all = every invited name. */
export async function cardRows(db, codes) {
  const have = await cards.linked(db);
  if (!have) return null;
  const rows = [], seen = new Set();
  const WAY = { digital: 'Digital', in_person: 'In person', post: 'By mail' };
  for (const code of codes) {
    const L = await myList(db, code);
    for (const g of L.groups) {
      if (g.decision !== 'invite' || seen.has(g.key)) continue;
      seen.add(g.key);
      const c = have.get(g.key) || null;
      const people = g.people.filter((p) => (g.way ? p.decision === 'invite' : !p.out));
      const named = people.map((p) => p.label).filter((n) => n && !n.includes('@'));
      rows.push({ company: g.name, place: c ? c.place : '', code: c ? c.code : '', qr: c ? cards.qrUrl(c.code) : '', way: wayParts(g.way).map((x) => WAY[x]).join(' + '),
        owner: L.name, dear: named[0] || '', names: named.join('; '), country: g.country || '' });
    }
  }
  return rows.sort((a, b) => (a.place ? 0 : 1) - (b.place ? 0 : 1) || cards.placeOrder(a.place, b.place) || a.company.localeCompare(b.company, 'lv'));
}

/** What is still open on a list, for the deadline reminders (patch 152): companies with anyone still to decide, people passed to it. */
export async function openCounts(db, code) {
  const L = await myList(db, code);
  return { companies: L.groups.filter((g) => g.people.some((p) => !p.decision)).length, passed: (L.passedToYou || []).length };
}
