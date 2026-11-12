// MY GRAND OPENING LIST (12.11.2026). The owner's picks: layout A with the people inside each company ("I like the simplicity of
// list A, but ... know which people are there inside"), folded tiles ("People shold fold unfold, not all be in huge list"), no
// button per person ("an invitation button for every single person separately - that sucks!"), "C1: tap a name", "Yes, build it".
//
// Each list owner (config/tc.json grandOpening.stage2.senders: DS, Mārcis, MC, AB, JS, Alma) sees ONLY their own Stage 2 list,
// grouped by company. Per company: Invite or No, and after Invite how it goes out: digital (the personal Stage 2 email from the
// owner's own mailbox), in person (the postcard handed over) or post (the postcard mailed). Inside an invited company a person
// tapped out is not invited. Admins open every list. Every person's result after each change is kept in tc_go_decision_log.
// Nothing is sent from here; the Stage 2 sending is untouched. Pure data functions; every one takes the database first.
import { TC, TcInputError, nameKey } from './tc.js';

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
  return db.prepare(`SELECT s.id, s.name, s.position, s.country, s.company, s.email, MIN(k.company_id) AS company_id
    FROM tc_go_stage2 s LEFT JOIN tc_company_contacts k ON k.ch_contact_id = s.ch_contact_id AND k.archived_at IS NULL
    WHERE s.sender = ? AND s.gone = 0 GROUP BY s.id, s.name, s.position, s.country, s.company, s.email ORDER BY s.id`).all(String(code));
}
const keyOf = (r) => (r.company_id ? 'id:' + Number(r.company_id) : 'n:' + (nameKey(r.company || '') || String(r.company || '').trim().toLowerCase()));

/** The list: { code, name, people, companies, figures: { todo, invite, no }, groups: [...] }, the biggest companies first. */
export async function myList(db, code) {
  if (!S2().some((s) => s.code === code)) throw new TcInputError('There is no such list.');
  const rows = await rowsOf(db, code);
  const cos = new Map((await db.prepare('SELECT id, name, country FROM tc_companies').all()).map((c) => [Number(c.id), c]));
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
        decision: p.decision || null, way: p.way || null, people: [] });
    }
    const g = groups.get(key), isOut = out.has(Number(r.id));
    g.people.push({ id: Number(r.id), label: personLabel(r.name, g.name, r.email), position: r.position || '', out: isOut,
      decision: g.decision === 'invite' ? (isOut ? 'no' : 'invite') : g.decision === 'no' ? 'no' : null });
  }
  const list = [...groups.values()].sort((a, b) => b.people.length - a.people.length || a.name.localeCompare(b.name, 'lv'));
  const all = list.flatMap((g) => g.people);
  const name = (S2().find((s) => s.code === code) || {}).name || code;
  return { code, name, people: all.length, companies: list.length,
    figures: { todo: all.filter((p) => !p.decision).length, invite: all.filter((p) => p.decision === 'invite').length, no: all.filter((p) => p.decision === 'no').length },
    groups: list };
}

async function logGroup(tx, code, key, actor, at) {
  const g = (await myList(tx, code)).groups.find((x) => x.key === key);
  if (!g) return;
  for (const p of g.people) {
    await tx.prepare('INSERT INTO tc_go_decision_log (stage2_id, sender, decision, way, at, by_name) VALUES (?,?,?,?,?,?)')
      .run(p.id, code, p.decision, p.decision === 'invite' ? g.way : null, at, actor);
  }
}
async function mustGroup(db, code, key) {
  const k = String(key || '');
  if (!/^(id:\d{1,12}|n:.{1,200})$/.test(k)) throw new TcInputError('Which company?');
  if (!(await rowsOf(db, code)).some((r) => keyOf(r) === k)) throw new TcInputError('That company is not on this list.');
  return k;
}
async function savePick(tx, code, key, decision, way, actor, at) {
  await tx.prepare(`INSERT INTO tc_go_company_picks (sender, company_key, decision, way, set_at, set_by) VALUES (?,?,?,?,?,?)
    ON CONFLICT (sender, company_key) DO UPDATE SET decision = excluded.decision, way = excluded.way, set_at = excluded.set_at, set_by = excluded.set_by`)
    .run(code, key, decision, way, at, actor);
}

/** Invite or No for a company (a second press of the same button clears it). No clears the way. */
export async function decide(db, code, key, decision, actor) {
  if (!['invite', 'no'].includes(decision)) throw new TcInputError('Invite or No?');
  const k = await mustGroup(db, code, key);
  const at = nowIso();
  await db.transaction(async (tx) => {
    const was = await tx.prepare('SELECT decision, way FROM tc_go_company_picks WHERE sender = ? AND company_key = ?').get(code, k);
    const next = was && was.decision === decision ? null : decision;
    await savePick(tx, code, k, next, next === 'invite' ? (was && was.way) || null : null, actor, at);
    await logGroup(tx, code, k, actor, at);
  });
  return myList(db, code);
}
/** How an invited company's invitation goes out. */
export async function setWay(db, code, key, way, actor) {
  if (!WAYS.includes(way)) throw new TcInputError('Digital, in person or by post?');
  const k = await mustGroup(db, code, key);
  const at = nowIso();
  await db.transaction(async (tx) => {
    const was = await tx.prepare('SELECT decision FROM tc_go_company_picks WHERE sender = ? AND company_key = ?').get(code, k);
    if (!was || was.decision !== 'invite') throw new TcInputError('Invite the company first.');
    await savePick(tx, code, k, 'invite', way, actor, at);
    await logGroup(tx, code, k, actor, at);
  });
  return myList(db, code);
}
/** Tap a name: that person is left out of the company's invitation, or back in. Only a person on this list. */
export async function toggleOut(db, code, id, actor) {
  const n = Number(id);
  const row = (await rowsOf(db, code)).find((r) => Number(r.id) === n);
  if (!row) throw new TcInputError('That person is not on this list.');
  const at = nowIso();
  await db.transaction(async (tx) => {
    const was = await tx.prepare('SELECT out_flag FROM tc_go_people_out WHERE stage2_id = ?').get(n);
    const next = was && Number(was.out_flag) === 1 ? 0 : 1;
    await tx.prepare(`INSERT INTO tc_go_people_out (stage2_id, out_flag, set_at, set_by) VALUES (?,?,?,?)
      ON CONFLICT (stage2_id) DO UPDATE SET out_flag = excluded.out_flag, set_at = excluded.set_at, set_by = excluded.set_by`).run(n, next, at, actor);
    await logGroup(tx, code, keyOf(row), actor, at);
  });
  return myList(db, code);
}
