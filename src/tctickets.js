// STAGE 3, THE TICKET (12.11.2026). His picks, relayed by Intake MASTER: "Yes, build it" (place codes out, Stage 3 = the
// ticket), "QR + calendar now" (no Wallet button yet: Add to calendar), "Yes, read them" (Intake reads who registered,
// read-only) and "Yes, at the door" (the door scans the person's ticket QR). His correction 12.11.2026: "everyone at the end get
// the puzzle piece only at the door" and "yes, staff scan tickets at the door": EVERY checked-in guest gets a piece there.
//
// WHO GETS A TICKET: every person registered on the landing page, read live and read-only from Client Hub's
// intake_read.registered_people (docs/client-hub/intake_registered_people.sql) through the existing read-only login, kept 60 s
// in memory, never copied. Fails closed: without the address or the view, nobody is listed and nothing is guessed.
// THEIR COMPANY: the Intake contact of their Client Hub id, else of their email, else the Intake company with the name they
// wrote; a company in a confirmed family counts as its mother company (as src/tcgo.js motherCompanyList).
// THEIR LIST OWNER (who the ticket comes from): the owner of their own Stage 2 row (by Client Hub id, then email), else the
// owner with most people of that mother company on the Stage 2 lists. Nobody's ticket goes without an owner: those people are
// their own figure on the card, by name.
// THE EMAIL: the Grand Opening session's "See you soon" concept (docs/letters_concept_2026-11-11), its words and layout, with
// the person's own QR; from the owner's own mailbox and signed by them (src/tcs2send.js, the same "Send mail as"). Only
// on the owner's Send button (admins, like Stage 2); the ticket row is written BEFORE the email goes, so never twice.
// AT THE DOOR: staff scan the ticket's QR (or type its code); every guest checked in = hand over a piece; the same ticket again
// = already checked in, piece given; an unknown code = the help desk.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { TC, TcInputError, nameKey } from './tc.js';
import { pgSsl } from './db.js';
import { esc_ } from './tcs2mail.js';
import { mime, gmail, ready, todaySent, DAY_CAP, PER_CALL } from './tcs2send.js';
import { qrPng } from './qr.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const S2 = () => ((((TC.grandOpening || {}).stage2 || {}).senders) || []);
const TTL_MS = 60 * 1000;
const nowIso = () => new Date().toISOString();
const low = (s) => String(s || '').trim().toLowerCase();

// ------------------------------------------------------------ who registered --
let cache = null, fetcher = null;
/** For tests: registration rows without a database. Pass null to go back to the real one. */
export function setRegFetcher(fn) { fetcher = fn; cache = null; }
const configured = (env) => Boolean(String(env.CLIENT_HUB_RSVP_DATABASE_URL || '').trim());
async function readClientHub(env) {
  const url = String(env.CLIENT_HUB_RSVP_DATABASE_URL || '').trim();
  const { default: pg } = await import('pg');
  const c = new pg.Client({ connectionString: url, ssl: pgSsl(url), connectionTimeoutMillis: 5000, statement_timeout: 5000 });
  await c.connect();
  try { return (await c.query('SELECT reg_key, source, contact_id, first_name, last_name, email, company FROM intake_read.registered_people')).rows; }
  finally { await c.end().catch(() => {}); }
}
/** The registered people now (or up to 60 s ago): [{ regKey, source, chContactId, first, last, name, email, company }]; null
 *  when not configured or not reachable. */
export async function registrations({ env = process.env, now = Date.now() } = {}) {
  if (!fetcher && !configured(env)) return null;
  if (cache && now - cache.at < TTL_MS) return cache.rows;
  let rows;
  try { rows = await (fetcher || readClientHub)(env); } catch (e) {
    console.error('tickets: Client Hub could not be read:', e && e.code ? e.code : 'error');
    return cache ? cache.rows : null;
  }
  const clean = (rows || []).filter((r) => r && r.reg_key).map((r) => {
    const first = String(r.first_name || '').trim().slice(0, 80), last = String(r.last_name || '').trim().slice(0, 80);
    return { regKey: String(r.reg_key).slice(0, 80), source: ['link', 'gift', 'page'].includes(r.source) ? r.source : 'page',
      chContactId: r.contact_id ? String(r.contact_id) : '', first, last, name: [first, last].filter(Boolean).join(' '),
      email: low(r.email).slice(0, 200), company: String(r.company || '').trim().slice(0, 200) };
  });
  cache = { at: now, rows: clean };
  return clean;
}

// ----------------------------------------------------- company and list owner --
/** Every registered person with their mother company and list owner (null when none is found). */
export async function placed(db, regs) {
  if (!regs) return null;
  const cos = await db.prepare('SELECT id, name, name_key FROM tc_companies WHERE archived_at IS NULL').all();
  const byId = new Map(cos.map((c) => [Number(c.id), c.name]));
  const byName = new Map(); for (const c of cos) if (c.name_key && !byName.has(c.name_key)) byName.set(c.name_key, Number(c.id));
  const parent = new Map((await db.prepare(`SELECT m.company_id, f.parent_id FROM tc_family_members m JOIN tc_families f ON f.id = m.family_id
    WHERE m.ended_at IS NULL AND f.ended_at IS NULL`).all()).map((r) => [Number(r.company_id), Number(r.parent_id)]));
  const contacts = await db.prepare(`SELECT ch_contact_id, email, company_id FROM tc_company_contacts WHERE archived_at IS NULL
    AND company_id IN (SELECT id FROM tc_companies WHERE archived_at IS NULL)`).all();
  const coByCh = new Map(), coByMail = new Map();
  for (const k of contacts) { if (k.ch_contact_id && !coByCh.has(k.ch_contact_id)) coByCh.set(k.ch_contact_id, Number(k.company_id)); if (k.email && !coByMail.has(low(k.email))) coByMail.set(low(k.email), Number(k.company_id)); }
  const s2 = await db.prepare('SELECT ch_contact_id, email, sender, company FROM tc_go_stage2 WHERE gone = 0').all();
  const ownerByCh = new Map(), ownerByMail = new Map();
  for (const r of s2) { if (r.ch_contact_id && !ownerByCh.has(r.ch_contact_id)) ownerByCh.set(r.ch_contact_id, r.sender); if (r.email && !ownerByMail.has(low(r.email))) ownerByMail.set(low(r.email), r.sender); }
  const motherOf = (companyId, written) => {
    const name = /^\(.*\)$/.test(String(written || '').trim()) ? '' : String(written || '').trim();
    let id = companyId || (name ? byName.get(nameKey(name)) || null : null);
    if (id) id = parent.get(id) || id;
    return id ? { key: 'id:' + id, name: byId.get(id) || name } : name ? { key: 'n:' + nameKey(name), name } : { key: '', name: '' };
  };
  // the owner with most Stage 2 people of each mother company (ties: the first owner in config order)
  const order = S2().map((s) => s.code), byMother = new Map();
  for (const r of s2) {
    const m = motherOf((r.ch_contact_id && coByCh.get(r.ch_contact_id)) || (r.email && coByMail.get(low(r.email))) || null, r.company);
    if (!m.key) continue;
    const c = byMother.get(m.key) || {}; c[r.sender] = (c[r.sender] || 0) + 1; byMother.set(m.key, c);
  }
  const topOwner = (key) => { const c = byMother.get(key); if (!c) return null; return Object.keys(c).sort((a, b) => c[b] - c[a] || order.indexOf(a) - order.indexOf(b))[0] || null; };
  return regs.map((r) => {
    const cid = (r.chContactId && coByCh.get(r.chContactId)) || (r.email && coByMail.get(r.email)) || null;
    const m = motherOf(cid, r.company);
    const sender = (r.chContactId && ownerByCh.get(r.chContactId)) || (r.email && ownerByMail.get(r.email)) || (m.key ? topOwner(m.key) : null) || null;
    return { ...r, motherKey: m.key, motherName: m.name || r.company, sender: order.includes(sender) ? sender : null };
  });
}

// ------------------------------------------------------------------ the email --
const PHOTO = 'https://mcusercontent.com/742b7cc5cefdc84b1134d8ca1/images/5791191e-9348-b914-d4e1-8f7027aa609e.jpg';
const MAPS = 'https://www.google.com/maps/search/?api=1&amp;query=Novikontas+Academy,+Duntes+iela+17d,+Riga';
const ICS = 'https://novikontas-grand-opening-calendar.vercel.app/grand-opening.ics';
const F = 'font-family:Raleway,Arial,Helvetica,sans-serif';
export const SUBJECT = 'See you on 27 May 2027: Novikontas Academy Grand Opening';
const LOGO = () => fs.readFileSync(path.join(ROOT, 'src', 'assets', 'go-logo-email.png'));

/** The ticket email to one person, from their list owner. img = { qr, logo } sources ('cid:...' when sending). */
export function ticketMail({ first = '', name = '', company = '', code = '' }, from = {}, img = { qr: 'cid:qr', logo: 'cid:logo' }) {
  const hi = first ? 'Dear ' + esc_(first) + ',' : 'Hello,';
  const sig = [esc_(from.name || ''), 'Novikontas Academy'].filter(Boolean).join('<br>');
  const html = '<style>@media (max-width:620px){.tk-pad{padding-left:20px!important;padding-right:20px!important}.tk-h1{font-size:30px!important}.tk-date{font-size:25px!important}'
    + '.tk-qr{display:block!important;width:100%!important;text-align:center!important;padding:18px 0 12px!important}.tk-qr img{margin:0 auto!important}.tk-txt{display:block!important;width:100%!important;text-align:center!important}.tk-bar2{display:block!important;margin-top:2px}}</style>'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#e7ebf0"><tr><td align="center" style="padding:24px 0">'
    + '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff">'
    + '<tr><td align="center" style="background:#011111;padding:14px 16px;font-size:15px;font-weight:600;color:#ffffff;line-height:1.3;' + F + '"><span style="color:#53a7db;font-weight:800;font-size:19px">27.05.2005 &rarr; 27.05.2027</span><span class="tk-bar2">&nbsp;&nbsp;the Grand Opening</span></td></tr>'
    + '<tr><td class="tk-pad" style="padding:22px 36px 18px"><img src="' + esc_(img.logo) + '" width="78" alt="Novikontas Academy" style="display:block;width:78px;height:auto;border:0"></td></tr>'
    + '<tr><td style="line-height:0"><img src="' + PHOTO + '" width="600" alt="Novikontas Academy Campus in the morning" style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr>'
    + '<tr><td class="tk-pad" style="background:#53a7db;padding:18px 36px;' + F + '"><span class="tk-h1" style="font-size:36px;font-weight:800;color:#011111;letter-spacing:-.02em;line-height:1">See you soon</span></td></tr>'
    + '<tr><td class="tk-pad" style="padding:28px 36px 6px;font-size:17px;line-height:1.55;color:#011111;font-weight:500;' + F + '">' + hi + '<br><br>thank you for your Yes. Here is your personal ticket for the Grand Opening of Novikontas Academy.</td></tr>'
    + '<tr><td class="tk-pad" style="padding:18px 36px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1.5px solid #8cc4e8;border-radius:10px;background:#f2f8fc"><tr><td style="padding:18px 22px;' + F + '">'
    + '<div class="tk-date" style="font-size:34px;font-weight:800;color:#011111;letter-spacing:-.02em;line-height:1.1"><span style="border-bottom:2px solid #53a7db">Thursday 27 May 2027</span></div>'
    + '<div style="font-size:16px;font-weight:700;color:#011111;margin-top:12px">Doors open 10:00</div>'
    + '<div style="font-size:16px;font-weight:500;color:#011111;margin-top:4px">Novikontas Academy Campus, Duntes iela 17d, Riga</div>'
    + '<div style="margin-top:8px;font-size:15px;font-weight:700"><a href="' + MAPS + '" style="color:#415c8f;text-decoration:underline">Open in Maps</a></div></td></tr></table></td></tr>'
    + '<tr><td class="tk-pad" style="padding:18px 36px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1.5px solid #011111;border-radius:12px"><tr>'
    + '<td class="tk-qr" width="170" align="center" style="padding:18px 0 18px 18px;vertical-align:middle"><img src="' + esc_(img.qr) + '" width="150" height="150" alt="Your ticket QR ' + esc_(code) + '" style="display:block;width:150px;height:150px;border:0"></td>'
    + '<td class="tk-txt" style="padding:18px 20px;vertical-align:middle;' + F + '"><div style="font-size:14px;font-weight:700;color:#415c8f">Your ticket</div>'
    + '<div style="font-size:24px;font-weight:800;color:#011111;letter-spacing:-.01em;margin-top:2px">' + esc_(name) + '</div>'
    + (company ? '<div style="font-size:16px;font-weight:600;color:#011111;margin-top:2px">' + esc_(company) + '</div>' : '')
    + '<div style="font-size:14px;font-weight:600;color:#415c8f;margin-top:10px">Show it at the entrance.</div>'
    + '<div style="font-size:12px;font-weight:600;color:#7b8aa3;margin-top:6px">' + esc_(code) + '</div></td></tr></table></td></tr>'
    + '<tr><td class="tk-pad" style="padding:20px 36px 6px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
    + '<td align="center" style="background:#011111;border-radius:6px;' + F + '"><a href="' + ICS + '" style="display:block;padding:17px 18px;font-size:18px;font-weight:800;color:#ffffff;text-decoration:none">Add to calendar</a></td></tr></table></td></tr>'
    + '<tr><td class="tk-pad" style="padding:28px 36px 0;font-size:16px;line-height:1.5;color:#011111;font-weight:500;' + F + '">See you on Thursday,<br><br>' + sig + '</td></tr>'
    + '<tr><td class="tk-pad" style="padding:22px 36px 30px;font-size:14px;line-height:1.5;color:#415c8f;font-weight:500;' + F + '">You can reply to this email, it comes to me, or write to <a href="mailto:events@novikontas.org" style="color:#415c8f">events@novikontas.org</a>.</td></tr>'
    + '</table></td></tr></table>';
  const plain = (first ? 'Dear ' + first + ',' : 'Hello,') + '\n\nthank you for your Yes. Here is your personal ticket for the Grand Opening of Novikontas Academy.\n\n'
    + 'Thursday 27 May 2027\nDoors open 10:00\nNovikontas Academy Campus, Duntes iela 17d, Riga\n\nYour ticket: ' + name + (company ? ', ' + company : '') + '\n' + code + '\nShow it at the entrance.\n\n'
    + 'Add to calendar: ' + ICS + '\n\nSee you on Thursday,\n\n' + [from.name || '', 'Novikontas Academy'].filter(Boolean).join('\n')
    + '\n\nYou can reply to this email, it comes to me, or write to events@novikontas.org.';
  return { subject: SUBJECT, html, plain, inline: [{ cid: 'qr', type: 'image/png', name: 'ticket-' + code + '.png', bytes: qrPng(code) }, { cid: 'logo', type: 'image/png', name: 'novikontas-academy.png', bytes: LOGO() }] };
}
/** The same email to an example person, the pictures inside, for the screen. */
export function previewHtml(from = {}) {
  const code = 'GO27-EXAMPLE000';
  const m = ticketMail({ first: 'Anna', name: 'Anna Example', company: 'Example Shipping AS', code }, from,
    { qr: 'data:image/png;base64,' + qrPng(code).toString('base64'), logo: 'data:image/png;base64,' + LOGO().toString('base64') });
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc_(m.subject)
    + '</title><style>body{margin:0;background:#e7ebf0}.subj{max-width:600px;margin:16px auto 0;padding:10px 16px;background:#fff;border-radius:6px;font:600 14px Raleway,Arial;color:#0a2463}</style></head><body>'
    + '<div class="subj">Subject: ' + esc_(m.subject) + '</div>' + m.html + '</body></html>';
}

// ------------------------------------------------------------- the sending --
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newCode = () => 'GO27-' + [...crypto.randomBytes(10)].map((b) => ALPHA[b % ALPHA.length]).join('');
export const codeFromText = (t) => { const m = /GO27-[A-Z0-9]{10}/i.exec(String(t || '')); return m ? m[0].toUpperCase() : ''; };

/** Per list owner: registered, sent, refused, left, and the people without an owner or an email, by name. */
export async function overview(db, regs) {
  const list = await placed(db, regs);
  if (!list) return { connected: false, senders: [], noOwner: [] };
  const done = new Map((await db.prepare('SELECT reg_key, result FROM tc_go_tickets').all()).map((r) => [r.reg_key, r.result]));
  const senders = S2().map((s) => {
    const mine = list.filter((p) => p.sender === s.code);
    const sent = mine.filter((p) => done.get(p.regKey) === 'sent').length, refused = mine.filter((p) => done.get(p.regKey) === 'refused').length;
    const noEmail = mine.filter((p) => !p.email && !done.has(p.regKey));
    return { code: s.code, label: s.label, name: s.name || s.label, n: mine.length, sent, refused, left: mine.length - sent - refused - noEmail.length,
      noEmail: noEmail.map((p) => ({ name: p.name, company: p.motherName })) };
  });
  return { connected: true, today: await todaySent(db), dayCap: DAY_CAP, senders,
    noOwner: list.filter((p) => !p.sender).map((p) => ({ name: p.name, company: p.company || p.motherName })) };
}

/** The next few tickets of one owner (the screen calls it again until none is left). */
export async function sendNext(db, code, regs, me, { env = process.env, fetchImpl = fetch } = {}) {
  const r = await ready(db, code, env, fetchImpl);
  if (r.why) return { ok: false, why: r.why };
  if (await todaySent(db) >= DAY_CAP) return { ok: false, why: `Today's ${DAY_CAP} are sent. The next ones go tomorrow.` };
  const list = await placed(db, regs);
  if (!list) return { ok: false, why: 'Who registered cannot be read right now. Nothing was sent.' };
  const done = new Set((await db.prepare('SELECT reg_key FROM tc_go_tickets').all()).map((x) => x.reg_key));
  const due = list.filter((p) => p.sender === code && p.email && !done.has(p.regKey));
  const people = due.slice(0, PER_CALL);
  let sent = 0, refused = 0;
  for (const p of people) {
    const ticket = newCode();
    // the mark first, so a crash between the two can never send the same ticket twice
    const mark = await db.prepare(`INSERT INTO tc_go_tickets (reg_key, code, sender, name, email, company, mother_key, mother_name, result, sent_at, sent_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT (reg_key) DO NOTHING`).run(p.regKey, ticket, code, p.name, p.email, p.company, p.motherKey, p.motherName, 'sent', nowIso(), me && me.name);
    if (!Number(mark.changes)) continue;
    const mail = ticketMail({ first: p.first, name: p.name, company: p.company || p.motherName, code: ticket }, { name: r.s.name || r.s.label, title: r.s.title || '' });
    const raw = Buffer.from(mime({ fromName: r.s.name || r.s.label, fromEmail: r.s.email, to: p.email, mail }), 'utf8').toString('base64url');
    let ok = false, detail = '';
    try { const res = await gmail(env, fetchImpl, r.tok.token, '/users/me/messages/send', { method: 'POST', body: JSON.stringify({ raw }) }); ok = res.ok; if (!ok) detail = 'Gmail ' + res.status; }
    catch (e) { detail = 'no answer'; }
    if (ok) sent++; else { refused++; await db.prepare(`UPDATE tc_go_tickets SET result = 'refused', detail = ? WHERE reg_key = ?`).run(detail, p.regKey); }
  }
  const left = due.length - people.length;
  return { ok: true, sent, refused, left, done: !people.length || !left };
}

// ---------------------------------------------------------------- the door --
async function doorTotals(db) {
  const p = await db.prepare('SELECT COUNT(*) AS n FROM tc_go_ticket_checkins').get();
  return { people: Number(p.n) || 0 };
}
/** Scan or type a ticket: checks the guest in. state: in (hand over a piece) | again (this ticket is already in, its piece
 *  given) | unknown (send them to the help desk). */
export async function doorScan(db, text, actor) {
  const code = codeFromText(text);
  const t = code ? await db.prepare(`SELECT code, name, company, mother_key, mother_name FROM tc_go_tickets WHERE code = ? AND result = 'sent'`).get(code) : null;
  if (!t) return { state: 'unknown', code, totals: await doorTotals(db) };
  const who = { code: t.code, name: t.name || '', company: t.mother_name || t.company || '' };
  const at = nowIso();
  const inNow = await db.prepare('INSERT INTO tc_go_ticket_checkins (code, at, by_name) VALUES (?,?,?) ON CONFLICT (code) DO NOTHING').run(t.code, at, actor);
  if (!Number(inNow.changes)) {
    const was = await db.prepare('SELECT at FROM tc_go_ticket_checkins WHERE code = ?').get(t.code);
    return { state: 'again', ...who, at: was ? was.at : null, totals: await doorTotals(db) };
  }
  return { state: 'in', ...who, at, totals: await doorTotals(db) };
}
/** The door's figures before anyone scans. */
export const doorStart = async (db) => ({ totals: await doorTotals(db) });
export { TcInputError };
