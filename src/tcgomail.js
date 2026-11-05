// AFTER THE ANSWER (05.11.2026, his picks: the "You're in" email "Checked first", and "OK, build them" for the three texts
// as drafted): three emails that collect in a list and go only when someone presses Send, each from the person's own list
// sender, the same way Stage 2 sends (src/tcs2send.js: a confirmed "Send mail as", marked before it goes, never twice).
//   in  "You're in"   - a Yes person: their company's puzzle place and the QR (the phone ticket at the door)
//   r1  Reminder 1    - sent the Stage 2 email 21 days or more ago, no answer: the same email with a reminder line
//   r2  "See you soon"- a Yes person who got "You're in": the place and the QR again, closer to the day
// The digital piece's front picture is config/tc.json grandOpening.mails.pieceImage; until it is picked, "You're in" and
// "See you soon" carry the QR alone and do not send (his design pick comes first). Admins only, like Stage 2 sending.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { TC } from './tc.js';
import { s2Mail } from './tcs2mail.js';
import { mime, gmail, ready, todaySent, DAY_CAP, PER_CALL } from './tcs2send.js';
import { giftKey, placesForYes, placeLink, PLACE_CODES } from './tcgo.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CFG = () => ((TC.grandOpening || {}).mails || {});
export const KINDS = ['in', 'r1', 'r2'];
export const LABEL = { in: "You're in", r1: 'Reminder: no answer yet', r2: 'See you soon' };
const REMIND_DAYS = 21;
const esc_ = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const qrPng = (code) => (PLACE_CODES.includes(code) ? fs.readFileSync(path.join(ROOT, 'src', 'assets', 'go-qr', code + '.png')) : null);
export const pieceImage = () => String(CFG().pieceImage || '').trim();

/** The email. qrSrc: 'cid:qr' when sending, a data or file address in a preview. */
export function mailFor(kind, { first = '', company = '', code = '', linkCode = '' } = {}, qrSrc = 'cid:qr') {
  if (kind === 'r1') return s2Mail('invite', first, linkCode || 'test00', { remind: true });
  const hi = first ? 'Dear ' + esc_(first) + ',' : 'Hello,';
  const hiPlain = first ? 'Dear ' + first + ',' : 'Hello,';
  const co = company ? esc_(company) + "'s" : 'Your company\'s';
  const coPlain = company ? company + "'s" : "Your company's";
  const piece = pieceImage();
  const door = 'Show this QR at the door on 27 May 2027, Novikontas Academy Campus, Duntes iela 17d, Riga.';
  const contact = 'You can reply to my email or write to <a href="mailto:events@novikontas.org" style="color:#0a2463">events@novikontas.org</a>.';
  const wrap = (inner) => '<div style="background:#e7ebf0;padding:24px 0"><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;margin:0 auto;font-family:Raleway,Arial,sans-serif">' + inner + '</table></div>';
  const tr = (pad, css, inner) => '<tr><td style="background:#fff;padding:' + pad + ';' + css + '">' + inner + '</td></tr>';
  const lead = kind === 'in' ? 'thank you for your Yes. ' + co + ' place in the Grand Opening puzzle is <b>' + esc_(code) + '</b>.'
    : 'See you on 27 May 2027. ' + co + ' place in the puzzle is <b>' + esc_(code) + '</b>.';
  const leadPlain = kind === 'in' ? 'thank you for your Yes. ' + coPlain + ' place in the Grand Opening puzzle is ' + code + '.'
    : 'See you on 27 May 2027. ' + coPlain + ' place in the puzzle is ' + code + '.';
  const subject = kind === 'in' ? "You're in: Novikontas Academy Grand Opening, 27 May 2027" : 'See you on 27 May 2027: Novikontas Academy Grand Opening';
  const html = wrap(tr('30px 36px 6px', 'border-radius:6px 6px 0 0;color:#011111;font-size:16px;line-height:1.6', hi + '<br>' + lead)
    + (piece ? tr('18px 36px 0', 'text-align:center', '<img src="' + esc_(piece) + '" width="260" alt="Your puzzle piece" style="display:inline-block;width:260px;max-width:100%;border:0">') : '')
    + tr('18px 36px 0', 'text-align:center', '<img src="' + esc_(qrSrc) + '" width="200" height="200" alt="QR ' + esc_(code) + '" style="display:inline-block;width:200px;height:200px;border:0"><div style="font-weight:800;font-size:22px;color:#0a2463">' + esc_(code) + '</div>')
    + tr('18px 36px 0', 'color:#011111;font-size:15px;line-height:1.6', door)
    + tr('14px 36px 30px', 'border-radius:0 0 6px 6px;color:#415c8f;font-size:14px;line-height:1.6', contact));
  const plain = hiPlain + '\n' + leadPlain + '\n\n' + door + '\nYour place online: ' + placeLink(code) + '\n\nYou can reply to my email or write to events@novikontas.org.';
  return { subject, html, plain, inline: [{ cid: 'qr', type: 'image/png', name: 'qr-' + code + '.png', bytes: qrPng(code) || Buffer.alloc(0) }] };
}

/** Who is due, per kind: [{ id, sender, name, first, email, company, code, linkCode }]. */
export async function due(db, kind, answers) {
  if (!KINDS.includes(kind)) return [];
  const rows = await db.prepare(`SELECT s.id, s.ch_contact_id, s.sender, s.name, s.first_name, s.email, s.company, s.link_code, k.company_id, c.name AS co_name,
      x.sent_at AS s2_at, x.result AS s2_result
    FROM tc_go_stage2 s LEFT JOIN tc_company_contacts k ON k.ch_contact_id = s.ch_contact_id AND k.archived_at IS NULL
    LEFT JOIN tc_companies c ON c.id = k.company_id LEFT JOIN tc_go_s2_sent x ON x.stage2_id = s.id
    WHERE s.gone = 0 AND s.email IS NOT NULL`).all();
  const sent = new Map();
  for (const m of await db.prepare(`SELECT stage2_id, kind FROM tc_go_mails`).all()) sent.set(m.stage2_id + ':' + m.kind, true);
  const ans = new Map((answers || []).map((a) => [a.chContactId, a]));
  const places = kind === 'r1' ? {} : await placesForYes(db, answers);
  const old = new Date(Date.now() - REMIND_DAYS * 864e5).toISOString();
  const seen = new Set();
  return rows.filter((r) => (seen.has(r.id) ? false : seen.add(r.id))).filter((r) => {
    if (sent.get(r.id + ':' + kind)) return false;
    const a = ans.get(r.ch_contact_id);
    if (kind === 'r1') return !a && r.s2_result === 'sent' && String(r.s2_at || '') <= old;
    if (!a || a.answer !== 'yes') return false;
    if (kind === 'r2' && !sent.get(r.id + ':in')) return false;
    return Boolean(places[giftKey(r.company_id, r.company)]);
  }).map((r) => ({ id: Number(r.id), sender: r.sender, name: r.name || '', first: r.first_name || String(r.name || '').split(/\s+/)[0] || '', email: r.email,
    company: r.co_name || r.company || '', code: places[giftKey(r.company_id, r.company)] || '', linkCode: r.link_code || '' }));
}

/** The three cards: how many are due per kind and per sender, and whether the kind may send yet. */
export async function overview(db, answers) {
  const out = {};
  for (const k of KINDS) {
    const list = await due(db, k, answers);
    const per = {};
    for (const p of list) per[p.sender] = (per[p.sender] || 0) + 1;
    out[k] = { label: LABEL[k], n: list.length, perSender: per, blocked: k !== 'r1' && !pieceImage() ? 'The digital piece design is not picked yet.' : '' };
  }
  const sent = await db.prepare(`SELECT kind, COUNT(*) AS n FROM tc_go_mails WHERE result = 'sent' GROUP BY kind`).all();
  for (const r of sent) if (out[r.kind]) out[r.kind].sent = Number(r.n);
  return out;
}

/** The next few of one kind from one sender (the screen calls it again until nothing is left). */
export async function sendNext(db, kind, code, answers, me, { env = process.env, fetchImpl = fetch } = {}) {
  if (!KINDS.includes(kind)) return { ok: false, why: 'Which email?' };
  if (kind !== 'r1' && !pieceImage()) return { ok: false, why: 'The digital piece design is not picked yet. Nothing was sent.' };
  const r = await ready(db, code, env, fetchImpl);
  if (r.why) return { ok: false, why: r.why };
  if (await todaySent(db) >= DAY_CAP) return { ok: false, why: `Today's ${DAY_CAP} are sent. The next ones go tomorrow.` };
  const people = (await due(db, kind, answers)).filter((p) => p.sender === code).slice(0, PER_CALL);
  let sent = 0, refused = 0;
  for (const p of people) {
    const mark = await db.prepare(`INSERT INTO tc_go_mails (stage2_id, kind, sender, result, sent_at, sent_by) VALUES (?,?,?,?,?,?) ON CONFLICT DO NOTHING`)
      .run(p.id, kind, code, 'sent', new Date().toISOString(), me && me.name);
    if (!Number(mark.changes)) continue;
    const mail = mailFor(kind, p);
    const raw = Buffer.from(mime({ fromName: r.s.name || r.s.label, fromEmail: r.s.email, to: p.email, mail }), 'utf8').toString('base64url');
    let ok = false, detail = '';
    try { const res = await gmail(env, fetchImpl, r.tok.token, '/users/me/messages/send', { method: 'POST', body: JSON.stringify({ raw }) }); ok = res.ok; if (!ok) detail = 'Gmail ' + res.status; }
    catch (e) { detail = 'no answer'; }
    if (ok) sent++; else { refused++; await db.prepare(`UPDATE tc_go_mails SET result = 'refused', detail = ? WHERE stage2_id = ? AND kind = ?`).run(detail, p.id, kind); }
  }
  const left = (await due(db, kind, answers)).filter((p) => p.sender === code).length;
  return { ok: true, sent, refused, left, done: !people.length || !left };
}

/** A preview for the screen: the email to a made-up person, the QR drawn from the file. */
export function preview(kind) {
  const m = mailFor(kind, { first: 'Anna', company: 'Example Shipping AS', code: '13H', linkCode: 'test00' }, 'data:image/png;base64,' + qrPng('13H').toString('base64'));
  const html = String(m.html).replace('src="cid:building"', 'src="data:image/jpeg;base64,' + fs.readFileSync(path.join(ROOT, 'src', 'assets', 'go-building.jpg')).toString('base64') + '"');
  return { subject: m.subject, html };
}
