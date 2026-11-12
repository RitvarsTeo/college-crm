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
import { TC, TcInputError, nameKey, logTcActivity } from './tc.js';

/** Someone else saved the list after this page loaded it. */
export class MlConflict extends Error { constructor(msg, by, at) { super(msg); this.by = by; this.at = at; } }

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
  return db.prepare(`SELECT s.id, s.ch_contact_id, s.name, s.position, s.country, s.company, s.email, MIN(k.company_id) AS company_id, MAX(a.company_key) AS assigned
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

/** The SAVED list: { code, name, people, companies, figures, groups, version, draft }; the editor's own draft comes with it when
 * it was made on this saved version. */
export async function myList(db, code, editor = '') {
  if (!S2().some((s) => s.code === code)) throw new TcInputError('There is no such list.');
  const rows = await rowsOf(db, code);
  const cos = new Map((await db.prepare('SELECT id, name, country, address, city FROM tc_companies WHERE archived_at IS NULL').all()).map((c) => [Number(c.id), c]));
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
        decision: p.decision || null, way: p.decision === 'invite' ? p.way || null : null, people: [] });
    }
    const g = groups.get(key), isOut = out.has(Number(r.id));
    // an Invite reaches somebody only once its way is picked: until then its people are still to decide (the audit, 12.11.2026)
    g.people.push({ id: Number(r.id), label: personLabel(r.name, g.name, r.email), position: r.position || '', out: isOut,
      moved: key !== homeOf(r), decision: g.decision === 'invite' ? (g.way ? (isOut ? 'no' : 'invite') : null) : g.decision === 'no' ? 'no' : null });
  }
  const list = [...groups.values()].sort((a, b) => b.people.length - a.people.length || a.name.localeCompare(b.name, 'lv'));
  const all = list.flatMap((g) => g.people);
  const version = await versionOf(db, code);
  let draft = null;
  if (editor) {
    const d = await db.prepare('SELECT state, base, saved_at, saved_by FROM tc_go_drafts WHERE sender = ? AND editor = ?').get(String(code), String(editor).toLowerCase());
    if (d && d.state && Number(d.base) === version.id) { try { draft = { state: JSON.parse(d.state), at: d.saved_at, by: d.saved_by || '' }; } catch (e) { draft = null; } }
  }
  return { code, name: (S2().find((s) => s.code === code) || {}).name || code, people: all.length, companies: list.length,
    figures: { todo: all.filter((p) => !p.decision).length, invite: all.filter((p) => p.decision === 'invite').length, no: all.filter((p) => p.decision === 'no').length },
    groups: list, version, draft };
}

/** The state the page works on, read from what is saved: { picks: { key: { decision, way } }, out: [ids], moves: {} }. */
export function stateOf(list) {
  const picks = {};
  for (const g of list.groups) if (g.decision || g.way) picks[g.key] = { decision: g.decision, way: g.way };
  return { picks, out: list.groups.flatMap((g) => g.people.filter((p) => p.out).map((p) => p.id)), moves: {} };
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
    if (way && !WAYS.includes(way)) throw new TcInputError('Digital, in person or by post?');
    if (keys.has(k)) picks[k] = { decision, way: decision === 'invite' ? way : null };
  }
  const out = [...new Set([].concat(s.out || []).map(Number))].filter((id) => ids.has(id));
  const moves = {};
  for (const [id, k] of Object.entries(s.moves || {})) if (ids.has(Number(id)) && intake.has(String(k))) moves[Number(id)] = String(k);
  return { picks, out, moves };
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

/** Save: only what changed against the saved list becomes the decision, in one transaction. Refused when the list was saved by
 * someone else after the page loaded it (base = the version the page had). Nothing changed = nothing written. */
export async function saveState(db, code, state, actor, base = null, editor = '') {
  const before = await myList(db, code);
  if (base !== null && base !== undefined && Number(base) !== before.version.id) {
    const v = before.version;
    throw new MlConflict(`Saved by ${v.by || 'someone else'} at ${when(v.at)} - load it?`, v.by, v.at);
  }
  const st = clean(before, state);
  const at = nowIso();
  const saved = stateOf(before), groupOf = new Map(before.groups.flatMap((g) => g.people.map((p) => [p.id, g])));
  const norm = (p) => ({ decision: (p && p.decision) || null, way: p && p.decision === 'invite' ? p.way || null : null });
  const pickRows = [...new Set([...Object.keys(saved.picks), ...Object.keys(st.picks)])]
    .filter((k) => JSON.stringify(norm(saved.picks[k])) !== JSON.stringify(norm(st.picks[k])))
    .map((k) => { const p = norm(st.picks[k]); return [code, k, p.decision, p.way, at, actor]; });
  const was = new Set(saved.out), now = new Set(st.out);
  const outRows = [...new Set([...was, ...now])].filter((id) => was.has(id) !== now.has(id)).map((id) => [id, now.has(id) ? 1 : 0, at, actor]);
  const moves = Object.entries(st.moves).map(([id, to]) => [Number(id), to]).filter(([id, to]) => groupOf.get(id).key !== to);
  const editorKey = String(editor || actor || '').toLowerCase();
  if (!pickRows.length && !outRows.length && !moves.length) {   // Ctrl+S on nothing: no stamp, no write (the audit, 12.11.2026)
    await dropDraft(db, code, editorKey);
    return { ...before, draft: null, unchanged: true };
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
  return myList(db, code, editorKey);
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
