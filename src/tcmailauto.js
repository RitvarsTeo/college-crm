// THE TRAINING CENTRE EMAIL AUTOMATION (patch 172, 24.11.2026). His words "Make the same mechanism for TC email!": the Academy's
// email automation (patch 171, src/mailauto.js) for training@ in the Training Centre Inbox. His picks 24.11.2026 (through MASTER
// CONTROL, pictures TC_AUTO_1..5):
//   1. training@ replying in Gmail processes the card itself: onto the known contact or private client, else a new one; the
//      conversation moves to Handled with "B2B · added to <company> by Intake · Undo" / "B2C · made a private client by Intake".
//   2. The B2B/B2C rule, by who sent the email; the first row that fits decides, an address is matched whole:
//        1 already a contact of a company -> B2B onto them; 2 already a private client -> B2C onto them;
//        3 a private mailbox (gmail, inbox.lv, outlook, proton...) -> B2C a new private client, came from Email;
//        4 a company address whose domain is a company's website or another contact's address -> B2B a new contact there;
//        5 a company address Intake does not know -> B2B: Intake creates the company, named after the domain (his pick "B");
//        6 never a client: Novikontas, no-reply and system senders, Google, LinkedIn, invoices, CVs, suppliers -> nothing.
//   3. The course the email names fills the client (a private client's Course; a company line's topics).
//   4. A waiting email is late after one working day; a Follow up 7 days after our reply when nothing is planned.
//   5. They write back after our reply: a History line "They wrote back and asked about <topic>"; the level is not changed
//      (his pick "A: stays Contacted"; what Intake does with the levels waits for his answer on the levels, 24.11.2026).
//   6. A suggested reply from training@'s answers to emails like it, to Copy. Intake NEVER sends, drafts or changes Gmail.
// Every row Intake writes is recorded in tc_mail_auto; Undo takes it back and puts the card back in the Inbox.
import { PRIVATE, SYSTEM_SENDER, cleanReply, words, dm } from './mailauto.js';
import { emailShown } from './emailtext.js';
import { deadlinesFor } from './intake.js';
import * as tc from './tc.js';

export const BY = 'Intake';
export const FOLLOW_UP = 'Follow up';
export const SILENCE_DAYS = 7;
const PER_RUN = 40;                      // conversations processed in one run (the rest the next run)
const low = (s) => String(s || '').trim().toLowerCase();
const nowIso = () => new Date().toISOString();
const clip = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const day = (iso) => new Date(iso).toISOString().slice(0, 10);
const plusDays = (iso, d) => new Date(Date.parse(iso) + d * 86400000).toISOString();
const domainOf = (addr) => low(addr).split('@')[1] || '';

// row 6: never a client
const OWN = /(^|\.)novikontas\.(org|lv|com)$/i;
const NEVER_DOMAINS = /(^|\.)(google\.com|youtube\.com|linkedin\.com|facebook\.com|facebookmail\.com|meta\.com|instagram\.com|microsoft\.com|office\.com|outlook\.office365\.com|apple\.com|amazon\.\w+|visma\.\w+|tilda\.\w+|mailchimp\.com|mcsv\.net|hubspot\.\w+|zoom\.us|teams\.microsoft\.com|canva\.com|dropbox\.com|docusign\.\w+|paypal\.\w+|stripe\.com|swedbank\.\w+|seb\.\w+|citadele\.\w+|luminor\.\w+|lattelecom\.\w+|tet\.lv|bite\.lv|lmt\.lv|vid\.gov\.lv|gov\.lv)$/i;
const NEVER_TEXT = [
  [/rēķin|invoice|sąskait|payment reminder|apmaksas atgādin|parād/i, 'an invoice'],
  [/attached cv|curriculum vitae|\bmy cv\b|vacanc|vakanc|job application|darba pieteikum|apply for the position/i, 'a CV or job application'],
  [/unsubscribe|newsletter|webinar|special offer for your|we are a supplier|our services include|partnership proposal/i, 'a supplier or newsletter'],
];
const PROTON = /@(pm\.me|proton\.me)$/i;

// the courses the Training Centre teaches, as people write them (the topic of a History line, a private client's Course)
const COURSES = [
  ['GWO BST', /gwo\W{0,3}(bst|basic safety)/i], ['GWO ART', /gwo\W{0,3}(art|advanced rescue)/i], ['GWO', /\bgwo\b/i],
  ['BOSIET', /bosiet/i], ['FOET', /\bfoet\b/i], ['HUET', /\bhuet\b/i], ['CA-EBS', /ca\W?ebs/i],
  ['OPITO ERRV', /errv/i], ['OPITO', /opito/i], ['STCW refresher', /stcw\W{0,20}(refresh|atjauno|update)|(refresh|atjauno)\w*\W{0,20}stcw/i],
  ['STCW Basic Safety', /stcw\W{0,20}basic|basic safety|pamatdroš/i], ['STCW', /\bstcw\b/i], ['Banksman', /banksman|slinger/i],
  ['First aid', /first aid|pirm(ā|a) palīdz/i], ['Fire fighting', /fire ?fight|ugunsdzēs/i], ['Crowd management', /crowd/i],
];
const ASKS = [['the price', /price|cost|cena|cik maksā|quote|quotation|piedāvāj|offer/i], ['the dates', /\bdates?\b|datum|when (is|does|will)|kad (notiek|sāk|būs)/i],
  ['free places', /places|vietas|seats/i], ['the documents', /certificate|sertifik|document|dokument/i]];
export function coursesIn(text) { const t = String(text || ''); const out = []; for (const [n, r] of COURSES) if (r.test(t) && !out.some((x) => x.startsWith(n) || n.startsWith(x))) out.push(n); return out; }
export function topicOf(text) {
  const c = coursesIn(text), a = ASKS.filter(([, r]) => r.test(String(text || ''))).map(([n]) => n);
  return [...c, ...a].slice(0, 3).join(', ') || null;
}

/** Row 6: is this no client at all? { never: reason } or null. */
export function neverAClient(addr, text = '') {
  const a = low(addr), d = domainOf(a);
  if (!a || !d) return { never: 'no address' };
  if (OWN.test(d)) return { never: 'Novikontas' };
  if (SYSTEM_SENDER.test(a.split('@')[0])) return { never: 'a system sender' };
  if (NEVER_DOMAINS.test(d)) return { never: 'a system or supplier' };
  for (const [r, w] of NEVER_TEXT) if (r.test(String(text || ''))) return { never: w };
  return null;
}
const hostOf = (w) => low(w).replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#:]/)[0];
const sameSite = (host, dom) => Boolean(host && dom) && (host === dom || dom.endsWith('.' + host) || host.endsWith('.' + dom));
/** A company named after its domain: nordexample-shipping.com -> "Nordexample Shipping". */
export function nameFromDomain(dom) {
  const parts = low(dom).split('.');
  const base = parts.length > 2 && /^(co|com|org|net)$/.test(parts[parts.length - 2]) ? parts[parts.length - 3] : parts[parts.length - 2] || parts[0];
  return base.split(/[-_]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

/** THE B2B/B2C RULE: who sent it decides. { segment, rule, companyId?, contactId?, privateId?, domain } or { never } / { ask }. */
export async function classify(db, addr, text = '') {
  const a = low(addr), dom = domainOf(a);
  const k = await db.prepare(`SELECT k.id, k.company_id FROM tc_company_contacts k JOIN tc_companies c ON c.id = k.company_id
    WHERE k.archived_at IS NULL AND c.archived_at IS NULL AND LOWER(k.email) = ? ORDER BY k.id LIMIT 1`).get(a);
  if (k) return { segment: 'b2b', rule: 'contact', companyId: Number(k.company_id), contactId: Number(k.id), domain: dom };
  const p = await db.prepare('SELECT id FROM tc_private_clients WHERE archived_at IS NULL AND LOWER(email) = ? ORDER BY id LIMIT 1').get(a);
  if (p) return { segment: 'b2c', rule: 'private', privateId: Number(p.id), domain: dom };
  const never = neverAClient(a, text);
  if (never) return never;
  if (PRIVATE.test(a) || PROTON.test(a)) return { segment: 'b2c', rule: 'mailbox', domain: dom };
  // row 4: the domain is one company's website, or another contact's address there (never a shared mailbox domain: row 3 is before)
  const sites = (await db.prepare(`SELECT id, website FROM tc_companies WHERE archived_at IS NULL AND website IS NOT NULL AND website <> ''`).all())
    .filter((c) => sameSite(hostOf(c.website), dom)).map((c) => Number(c.id));
  const byMail = (await db.prepare(`SELECT DISTINCT k.company_id FROM tc_company_contacts k JOIN tc_companies c ON c.id = k.company_id
    WHERE k.archived_at IS NULL AND c.archived_at IS NULL AND LOWER(k.email) LIKE ?`).all('%@' + dom)).map((r) => Number(r.company_id));
  const ids = [...new Set([...sites, ...byMail])];
  if (ids.length === 1) return { segment: 'b2b', rule: 'domain', companyId: ids[0], domain: dom };
  if (ids.length > 1) return { ask: 'more than one company has this domain; a person decides' };
  return { segment: 'b2b', rule: 'new_company', domain: dom };
}

// ------------------------------------------------------------------------------------------------ the run --
async function threadMail(db, thread) {
  return db.prepare('SELECT id, direction, from_addr, from_name, subject, body, at, seen_at, seen_by FROM tc_mail WHERE thread_id = ? ORDER BY at, id').all(thread);
}
const shown = (m) => clip(emailShown(m.body || ''), 600);
const lineFor = (m, name, earlierOut) => m.direction === 'out'
  ? `training@ replied: ${clip(cleanReply(emailShown(m.body || '')), 600)}`
  : earlierOut ? `They wrote back${topicOf(emailShown(m.body || '')) ? ' and asked about ' + topicOf(emailShown(m.body || '')) : ''}: ${shown(m)}`   // what they newly wrote, not the old subject
    : `Email from ${name}${m.subject ? ': ' + clip(m.subject, 200) + '.' : ':'} ${shown(m)}`;

async function writeCompanyLines(db, auto, msgs, name, wrote) {
  let out = msgs.some((m) => m.direction === 'out' && auto.logged_to && String(m.at) <= String(auto.logged_to));
  for (const m of msgs) {
    if (auto.logged_to && String(m.at) <= String(auto.logged_to)) { if (m.direction === 'out') out = true; continue; }
    const r = await db.prepare(`INSERT INTO tc_activities (company_id, contact_id, kind, occurred_at, topics, body, actor, origin) VALUES (?,?,?,?,?,?,?,?)`)
      .run(auto.company_id, auto.contact_id || null, 'email', m.at, topicOf([m.subject, m.body].join(' ')), lineFor(m, name, out), BY, 'automatic');
    wrote.activities.push(Number(r.lastInsertRowid));
    if (m.direction === 'out') out = true;
  }
  const last = msgs[msgs.length - 1];
  if (last) await db.prepare('UPDATE tc_companies SET last_contact_at = ? WHERE id = ? AND (last_contact_at IS NULL OR last_contact_at < ?)').run(last.at, auto.company_id, last.at);
}
async function writePrivateLines(db, auto, msgs, name, wrote) {
  let out = msgs.some((m) => m.direction === 'out' && auto.logged_to && String(m.at) <= String(auto.logged_to));
  for (const m of msgs) {
    if (auto.logged_to && String(m.at) <= String(auto.logged_to)) { if (m.direction === 'out') out = true; continue; }
    const r = await db.prepare('INSERT INTO tc_private_history (client_id, kind, occurred_at, body, actor, created_at) VALUES (?,?,?,?,?,?)')
      .run(auto.private_id, 'email', m.at, lineFor(m, name, out), BY, nowIso());
    wrote.history.push(Number(r.lastInsertRowid));
    if (m.direction === 'out') out = true;
  }
}
/** pick 4: nothing planned -> "Follow up" 7 days after our last reply (a company task; a private client's next contact) */
async function followUp(db, auto, lastOut, wrote, at) {
  if (!lastOut) return;
  const due = day(plusDays(lastOut.at, SILENCE_DAYS));
  if (auto.segment === 'b2b') {
    const open = await db.prepare('SELECT id FROM tc_tasks WHERE company_id = ? AND done_at IS NULL').get(auto.company_id);
    if (open) return;
    const c = await db.prepare('SELECT pic_name FROM tc_companies WHERE id = ?').get(auto.company_id);
    const r = await db.prepare('INSERT INTO tc_tasks (company_id, contact_id, label, due_at, owner, created_at, created_by, kind) VALUES (?,?,?,?,?,?,?,?)')
      .run(auto.company_id, auto.contact_id || null, FOLLOW_UP, due, (c && c.pic_name) || null, at, BY, 'email');
    wrote.tasks.push(Number(r.lastInsertRowid));
  } else {
    const p = await db.prepare('SELECT next_at FROM tc_private_clients WHERE id = ?').get(auto.private_id);
    if (p && p.next_at) return;
    await db.prepare('UPDATE tc_private_clients SET next_at = ?, updated_at = ?, updated_by = ? WHERE id = ?').run(due, at, BY, auto.private_id);
    const r = await db.prepare('INSERT INTO tc_private_history (client_id, kind, occurred_at, body, actor, created_at) VALUES (?,?,?,?,?,?)')
      .run(auto.private_id, 'edit', at, `Next contact: ${due} (${FOLLOW_UP}, ${SILENCE_DAYS} days after our reply of ${dm(lastOut.at)})`, BY, at);
    wrote.history.push(Number(r.lastInsertRowid));
    wrote.nextAt = due;
  }
}
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };

/** One conversation training@ answered: who it is (the rule), the client, the whole conversation into their history. */
async function processThread(db, thread, msgs, at) {
  const ins = msgs.filter((m) => m.direction === 'in');
  const first = ins[0], lastIn = ins[ins.length - 1];
  const text = ins.map((m) => [m.subject, m.body].join(' ')).join('\n');
  const cls = await classify(db, lastIn.from_addr, text);
  if (!cls.segment) return { processed: false, why: cls.never || cls.ask };
  const name = lastIn.from_name || first.from_name || lastIn.from_addr;
  const made = {}, wrote = { activities: [], history: [], tasks: [] };
  const auto = { thread_id: thread, segment: cls.segment, rule: cls.rule, company_id: cls.companyId || null, contact_id: cls.contactId || null, private_id: cls.privateId || null, logged_to: null };
  const course = coursesIn(text)[0] || null;
  if (cls.segment === 'b2b') {
    if (cls.rule === 'new_company') {
      try { auto.company_id = (await tc.addCompany(db, { name: nameFromDomain(cls.domain), website: cls.domain }, BY)).id; made.company = true; }
      catch (e) { if (e && e.id) auto.company_id = Number(e.id); else throw e; }
    }
    if (!auto.contact_id) {
      const had = await db.prepare('SELECT id FROM tc_company_contacts WHERE company_id = ? AND LOWER(email) = ? AND archived_at IS NULL').get(auto.company_id, low(lastIn.from_addr));
      if (had) auto.contact_id = Number(had.id);
      else { auto.contact_id = (await tc.addContact(db, auto.company_id, { name: lastIn.from_name || '', email: low(lastIn.from_addr) }, BY)).id; made.contact = true; }
    }
    await writeCompanyLines(db, auto, msgs, name, wrote);
  } else {
    if (!auto.private_id) {
      const r = await db.prepare(`INSERT INTO tc_private_clients (name, phone, email, course, came_from, owner, status, created_at, created_by) VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(lastIn.from_name || lastIn.from_addr, null, low(lastIn.from_addr), course, 'Email', null, 'not_contacted', at, BY);
      auto.private_id = Number(r.lastInsertRowid); made.private = true;
    } else if (course) {
      const p = await db.prepare('SELECT course FROM tc_private_clients WHERE id = ?').get(auto.private_id);
      if (p && !p.course) {
        await db.prepare('UPDATE tc_private_clients SET course = ?, updated_at = ?, updated_by = ? WHERE id = ?').run(course, at, BY, auto.private_id);
        const h = await db.prepare('INSERT INTO tc_private_history (client_id, kind, occurred_at, body, actor, created_at) VALUES (?,?,?,?,?,?)').run(auto.private_id, 'edit', at, `Course: ${course} (from the email)`, BY, at);
        wrote.history.push(Number(h.lastInsertRowid)); wrote.course = true;
      }
    }
    await writePrivateLines(db, auto, msgs, name, wrote);
  }
  await followUp(db, auto, [...msgs].reverse().find((m) => m.direction === 'out'), wrote, at);
  auto.logged_to = msgs[msgs.length - 1].at;
  await db.prepare(`UPDATE tc_mail SET seen_at = ?, seen_by = ? WHERE thread_id = ? AND direction = 'in' AND seen_at IS NULL`).run(at, BY, thread);
  await db.prepare(`INSERT INTO tc_mail_auto (thread_id, segment, rule, company_id, contact_id, private_id, made, wrote, logged_to, at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(thread, auto.segment, auto.rule, auto.company_id, auto.contact_id, auto.private_id, JSON.stringify(made), JSON.stringify(wrote), auto.logged_to, at);
  return { processed: true, ...auto, made };
}

/** A conversation Intake already processed: what came after, into the same history; answered again -> handled again. */
async function carryOn(db, auto, msgs, at) {
  const fresh = msgs.filter((m) => String(m.at) > String(auto.logged_to || ''));
  if (!fresh.length) return false;
  const wrote = parse(auto.wrote, { activities: [], history: [], tasks: [] });
  const lastIn = [...msgs].reverse().find((m) => m.direction === 'in');
  const name = (lastIn && (lastIn.from_name || lastIn.from_addr)) || '';
  const before = { activities: wrote.activities.length, history: wrote.history.length };
  if (auto.segment === 'b2b') await writeCompanyLines(db, auto, msgs, name, wrote); else await writePrivateLines(db, auto, msgs, name, wrote);
  const lastOut = [...msgs].reverse().find((m) => m.direction === 'out');
  if (lastOut && lastIn && String(lastOut.at) > String(lastIn.at)) {
    await followUp(db, auto, lastOut, wrote, at);
    await db.prepare(`UPDATE tc_mail SET seen_at = ?, seen_by = ? WHERE thread_id = ? AND direction = 'in' AND seen_at IS NULL`).run(at, BY, auto.thread_id);
  }
  await db.prepare('UPDATE tc_mail_auto SET wrote = ?, logged_to = ? WHERE thread_id = ?').run(JSON.stringify(wrote), msgs[msgs.length - 1].at, auto.thread_id);
  return wrote.activities.length > before.activities || wrote.history.length > before.history;
}

/** After each training@ read (src/sync.js syncTcMail): process what training@ answered; carry on what Intake already holds. */
export async function processTcMail(db, { at = nowIso(), limit = PER_RUN } = {}) {
  const res = { processed: 0, b2b: 0, b2c: 0, madeCompany: 0, left: 0, carried: 0 };
  const autos = new Map((await db.prepare('SELECT * FROM tc_mail_auto').all()).map((a) => [a.thread_id, a]));
  // conversations with mail from outside still on the Inbox (not Done), answered after their last message
  const open = await db.prepare(`SELECT thread_id, MAX(at) AS last_in FROM tc_mail WHERE direction = 'in' AND seen_at IS NULL GROUP BY thread_id`).all();
  const outs = new Map((await db.prepare(`SELECT thread_id, MAX(at) AS last_out FROM tc_mail WHERE direction = 'out' GROUP BY thread_id`).all()).map((r) => [r.thread_id, r.last_out]));
  for (const o of open) {
    const a = autos.get(o.thread_id);
    if (a && a.undone_at) continue;                         // Undo: a person decides this one
    const lastOut = outs.get(o.thread_id);
    if (!a && !(lastOut && String(lastOut) > String(o.last_in))) continue;
    if (res.processed + res.carried >= limit) { res.left++; continue; }
    const msgs = await threadMail(db, o.thread_id);
    if (a) { if (await carryOn(db, a, msgs, at)) res.carried++; continue; }
    const r = await processThread(db, o.thread_id, msgs, at);   // like the Academy (src/mailauto.js processCard): the steps commit one by one
    if (r.processed) { res.processed++; res[r.segment]++; if (r.made && r.made.company) res.madeCompany++; }
  }
  // a processed conversation where only training@ wrote since (no new mail from outside): its reply into the history too
  for (const a of autos.values()) {
    if (a.undone_at || open.some((o) => o.thread_id === a.thread_id)) continue;
    const lastOut = outs.get(a.thread_id);
    if (lastOut && String(lastOut) > String(a.logged_to || '')) { if (await carryOn(db, a, await threadMail(db, a.thread_id), at)) res.carried++; }
  }
  return res;
}

// --------------------------------------------------------------------------------------------------- Undo --
/** Undo: the card is back in the Inbox; what Intake wrote is taken away; what Intake made is archived (nothing is deleted
 *  that a person touched: a company, contact or private client somebody worked on since stays, with a note). */
export async function undoTc(db, key, by, at = nowIso()) {
  if (!by) return { error: 'Who is undoing this?' };
  const thread = String(key || '').startsWith('m:') ? String(key).slice(2) : '';
  const a = thread ? await db.prepare('SELECT * FROM tc_mail_auto WHERE thread_id = ?').get(thread) : null;
  if (!a || a.undone_at) return { error: 'This is not a conversation Intake processed.' };
  const made = parse(a.made, {}), wrote = parse(a.wrote, { activities: [], history: [], tasks: [] });
  return db.transaction(async (tx) => {
    // nothing in the Training Centre is deleted (security_guards (e)): what Intake made is archived when nobody worked on it since,
    // Intake's lines stay as the record of the emails, its Follow up is closed with the outcome "Undo", and a line says who undid it
    const ids = (l) => (l || []).map(Number).filter(Boolean);
    const any = async (sql, ...p) => Number((await tx.prepare(sql).get(...p)).n) > 0;
    let kept = false;
    if (a.segment === 'b2c') {
      if (made.private) {
        if (await any(`SELECT COUNT(*) AS n FROM tc_private_history WHERE client_id = ? AND COALESCE(actor, '') <> ?`, a.private_id, BY)) kept = true;
        else await tx.prepare('UPDATE tc_private_clients SET archived_at = ?, archived_by = ? WHERE id = ? AND archived_at IS NULL').run(at, by, a.private_id);
      } else {
        if (wrote.nextAt) await tx.prepare('UPDATE tc_private_clients SET next_at = NULL WHERE id = ? AND next_at = ?').run(a.private_id, wrote.nextAt);
        if (wrote.course) await tx.prepare('UPDATE tc_private_clients SET course = NULL WHERE id = ?').run(a.private_id);
      }
    } else {
      // a company Intake made: archived when no person did anything on it; a contact Intake made: when no person did anything with them
      const companyTouched = await any(`SELECT COUNT(*) AS n FROM tc_activities WHERE company_id = ? AND COALESCE(actor, '') <> ?`, a.company_id, BY)
        || await any(`SELECT COUNT(*) AS n FROM tc_tasks WHERE company_id = ? AND COALESCE(created_by, '') <> ?`, a.company_id, BY);
      const contactTouched = await any(`SELECT COUNT(*) AS n FROM tc_activities WHERE contact_id = ? AND COALESCE(actor, '') <> ?`, a.contact_id || 0, BY);
      if (made.company && !companyTouched) {
        await tx.prepare('UPDATE tc_company_contacts SET archived_at = ? WHERE company_id = ? AND archived_at IS NULL').run(at, a.company_id);
        await tx.prepare('UPDATE tc_companies SET archived_at = ?, archived_by = ? WHERE id = ? AND archived_at IS NULL').run(at, by, a.company_id);
      } else if (made.contact && !contactTouched) {
        await tx.prepare('UPDATE tc_company_contacts SET archived_at = ? WHERE id = ? AND archived_at IS NULL').run(at, a.contact_id);
        if (made.company) kept = true;
      } else if (made.company || made.contact) kept = true;
    }
    for (const id of ids(wrote.tasks)) await tx.prepare(`UPDATE tc_tasks SET done_at = ?, outcome = 'Undo' WHERE id = ? AND done_at IS NULL AND created_by = ?`).run(at, id, BY);
    const note = `Undo by ${by}: the email conversation is back in the Inbox`;
    if (a.segment === 'b2b') await tx.prepare(`INSERT INTO tc_activities (company_id, contact_id, kind, occurred_at, body, actor, origin) VALUES (?,?,?,?,?,?,?)`).run(a.company_id, a.contact_id || null, 'note', at, note, by, 'manual');
    else await tx.prepare('INSERT INTO tc_private_history (client_id, kind, occurred_at, body, actor, created_at) VALUES (?,?,?,?,?,?)').run(a.private_id, 'note', at, note, by, at);
    await tx.prepare(`UPDATE tc_mail SET seen_at = NULL, seen_by = NULL WHERE thread_id = ? AND direction = 'in' AND seen_by = ?`).run(thread, BY);
    await tx.prepare('UPDATE tc_mail_auto SET undone_at = ?, undone_by = ? WHERE thread_id = ?').run(at, by, thread);
    return { ok: true, kept };
  });
}

// ---------------------------------------------------------------------------------------- suggested reply --
// From what is already kept: each email from outside and training@'s first answer after it in the same conversation. The answer
// to the most similar earlier email, with the greeting, the signature and the quoted mail cut. Shown to Copy; never sent.
let PAIRS = null, PAIRS_AT = 0;
async function pairs(db) {
  if (PAIRS && Date.now() - PAIRS_AT < 10 * 60000) return PAIRS;
  const rows = await db.prepare(`SELECT i.thread_id, i.subject, i.body AS q,
      (SELECT o.body FROM tc_mail o WHERE o.thread_id = i.thread_id AND o.direction = 'out' AND o.at > i.at ORDER BY o.at LIMIT 1) AS a
    FROM tc_mail i WHERE i.direction = 'in' AND i.body IS NOT NULL`).all();
  PAIRS = rows.filter((r) => r.a).map((r) => ({ thread: r.thread_id, q: words(emailShown([r.subject, r.q].join('\n'))), a: cleanReply(emailShown(r.a)) }))
    .filter((r) => r.q.size && r.a.length >= 20);
  PAIRS_AT = Date.now();
  return PAIRS;
}
export const forgetPairs = () => { PAIRS = null; };
const MIN_SCORE = 0.12;
/** { text, like } for a waiting training@ card, or null when nothing earlier is close enough. */
export async function tcSuggestedReply(db, key) {
  const thread = String(key || '').startsWith('m:') ? String(key).slice(2) : '';
  if (!thread) return null;
  const last = await db.prepare(`SELECT subject, body FROM tc_mail WHERE thread_id = ? AND direction = 'in' ORDER BY at DESC LIMIT 1`).get(thread);
  if (!last) return null;
  const want = words(emailShown([last.subject, last.body].join('\n')));
  if (want.size < 2) return null;
  const scored = (await pairs(db)).filter((p) => p.thread !== thread).map((p) => {
    let both = 0; for (const w of want) if (p.q.has(w)) both++;
    return { s: both / (want.size + p.q.size - both), p };
  }).filter((x) => x.s >= MIN_SCORE).sort((a, b) => b.s - a.s);
  return scored.length ? { text: scored[0].p.a, like: scored.length } : null;
}

/** Late (pick 4): an email from outside not answered one working day after it came (the Academy's email rule). */
export const lateAt = (iso) => deadlinesFor('gmail', iso).lateAt;
