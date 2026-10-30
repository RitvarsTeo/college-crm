// STAGE 2 SENDING FROM INTAKE (30.10.2026, the owner's pick "Yes, build it", picture board-stage2-sending): per sender, Test to
// me and Send next 100, from his Gmail as that colleague ("Send mail as"), the same three emails the Apps Script sent
// (src/tcs2mail.js). Never twice: a person is marked in tc_go_s2_sent before the next one goes. A sender whose address is
// not a confirmed "Send mail as" in his Gmail sends nothing (Gmail would put his own address in From). Admins only.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { TC } from './tc.js';
import { s2Mail } from './tcs2mail.js';
import { senderToken, GMAIL_API } from '../lib/notify.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BUILDING = () => fs.readFileSync(path.join(ROOT, 'src', 'assets', 'go-building.jpg'));
const S2 = ((TC.grandOpening && TC.grandOpening.stage2 && TC.grandOpening.stage2.senders) || []);
export const BATCH = 100, PER_CALL = 10, DAY_CAP = 1400;
const nowIso = () => new Date().toISOString();
const low = (s) => String(s || '').trim().toLowerCase();
const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64');
const wrap76 = (b) => b.replace(/.{1,76}/g, (x) => x + '\r\n').trimEnd();
const SETTINGS = 'https://www.googleapis.com/auth/gmail.settings.basic';

/** The whole email as Gmail's send call wants it: text + HTML, and the building picture inline for 'confirm'. */
export function mime({ fromName, fromEmail, to, mail }) {
  const alt = 'alt' + crypto.randomBytes(8).toString('hex'), rel = 'rel' + crypto.randomBytes(8).toString('hex');
  const head = [`From: =?UTF-8?B?${b64(fromName)}?= <${fromEmail}>`, `Reply-To: ${fromEmail}`, `To: ${to}`, `Subject: =?UTF-8?B?${b64(mail.subject)}?=`, 'MIME-Version: 1.0'];
  const altPart = [`Content-Type: multipart/alternative; boundary="${alt}"`, '', `--${alt}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
    wrap76(b64(mail.plain)), `--${alt}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap76(b64(mail.html)), `--${alt}--`];
  if (!mail.inline) return [...head, ...altPart].join('\r\n');
  return [...head, `Content-Type: multipart/related; boundary="${rel}"`, '', `--${rel}`, ...altPart, `--${rel}`,
    'Content-Type: image/jpeg; name="building.jpg"', 'Content-Transfer-Encoding: base64', 'Content-ID: <building>', 'Content-Disposition: inline; filename="building.jpg"', '',
    wrap76(BUILDING().toString('base64')), `--${rel}--`].join('\r\n');
}

async function gmail(env, fetchImpl, token, p, opts = {}) {
  return fetchImpl(GMAIL_API(env) + p, { ...opts, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json', ...(opts.headers || {}) } });
}
/** The confirmed "Send mail as" addresses, or null when Intake may not read them yet (connect sending again). */
async function aliases(env, fetchImpl, tok) {
  if (!tok.scope.split(/\s+/).includes(SETTINGS)) return null;
  const r = await gmail(env, fetchImpl, tok.token, '/users/me/settings/sendAs');
  if (!r.ok) return null;
  return new Set(((await r.json()).sendAs || []).filter((a) => a.isPrimary || a.verificationStatus === 'accepted').map((a) => low(a.sendAsEmail)));
}
const todaySent = async (db) => Number((await db.prepare(`SELECT COUNT(*) AS n FROM tc_go_s2_sent WHERE sent_at >= ?`).get(new Date(Date.now() - 864e5).toISOString())).n) || 0;

/** The cards and the log: per sender, the list, sent, refused, left, and whether the address is confirmed. */
export async function overview(db, { env = process.env, fetchImpl = fetch } = {}) {
  const rows = await db.prepare(`SELECT s.sender, COUNT(*) AS n, SUM(CASE WHEN x.result = 'sent' THEN 1 ELSE 0 END) AS sent,
    SUM(CASE WHEN x.result = 'refused' THEN 1 ELSE 0 END) AS refused, SUM(CASE WHEN s.link_code IS NULL THEN 1 ELSE 0 END) AS nocode
    FROM tc_go_stage2 s LEFT JOIN tc_go_s2_sent x ON x.stage2_id = s.id WHERE s.gone = 0 GROUP BY s.sender`).all();
  const by = new Map(rows.map((r) => [r.sender, r]));
  let ok = null, why = '';
  try { const tok = await senderToken(db, { env, fetchImpl }); if (tok.token) { ok = await aliases(env, fetchImpl, tok); if (!ok) why = 'connect'; } else why = 'connect'; } catch (e) { why = 'connect'; }
  const log = (await db.prepare('SELECT * FROM tc_go_s2_log ORDER BY started_at DESC, id DESC LIMIT 200').all())
    .map((l) => ({ at: l.started_at, sender: l.sender, what: l.what, sent: Number(l.sent), refused: Number(l.refused), by: l.started_by || '' }));
  return { needsConnect: why === 'connect', today: await todaySent(db), dayCap: DAY_CAP, batch: BATCH, log,
    senders: S2.map((s) => { const r = by.get(s.code) || {}; const n = Number(r.n) || 0, sent = Number(r.sent) || 0, refused = Number(r.refused) || 0;
      return { code: s.code, label: s.label, name: s.name || s.label, email: s.email, n, sent, refused, left: n - sent - refused - (Number(r.nocode) || 0), noCode: Number(r.nocode) || 0,
        confirmed: ok ? ok.has(low(s.email)) : null }; }) };
}

async function ready(db, code, env, fetchImpl) {
  const s = S2.find((x) => x.code === code);
  if (!s) return { why: 'Which sender?' };
  const tok = await senderToken(db, { env, fetchImpl });
  if (!tok.token) return { why: 'Sending is not connected. An admin connects it once (Help center, For admins).' };
  const al = await aliases(env, fetchImpl, tok);
  if (!al) return { why: 'Connect sending again once, so Intake can see the "Send mail as" addresses.' };
  if (!al.has(low(s.email))) return { why: `${s.email} is not a confirmed "Send mail as" address in the Gmail yet. Nothing was sent.` };
  return { s, tok };
}
async function logRow(db, batch, sender, what, by) {
  if (!(await db.prepare('SELECT id FROM tc_go_s2_log WHERE batch = ?').get(batch))) {
    await db.prepare('INSERT INTO tc_go_s2_log (batch, sender, what, started_at, started_by) VALUES (?,?,?,?,?)').run(batch, sender, what, nowIso(), by);
  }
}

/** Test to me: the sender's emails (confirm and invite) to the signed-in person's own address. */
export async function sendTest(db, code, me, { env = process.env, fetchImpl = fetch } = {}) {
  if (!me || !me.email) return { ok: false, why: 'Sign in first.' };
  const r = await ready(db, code, env, fetchImpl);
  if (r.why) return { ok: false, why: r.why };
  const first = String(me.name || '').split(/\s+/)[0] || '';
  const batch = 'test-' + crypto.randomBytes(6).toString('hex');
  await logRow(db, batch, code, 'test', me.name);
  let sent = 0;
  for (const kind of ['confirm', 'invite']) {
    const mail = s2Mail(kind, first, 'test00');
    const raw = Buffer.from(mime({ fromName: r.s.name || r.s.label, fromEmail: r.s.email, to: me.email, mail }), 'utf8').toString('base64url');
    const res = await gmail(env, fetchImpl, r.tok.token, '/users/me/messages/send', { method: 'POST', body: JSON.stringify({ raw }) });
    if (res.ok) sent++;
  }
  await db.prepare('UPDATE tc_go_s2_log SET sent = ? WHERE batch = ?').run(sent, batch);
  return sent ? { ok: true, sent } : { ok: false, why: 'Gmail refused the test.' };
}

/** The next few of one sender's list (the screen calls it again until 100 are done); each person is marked as they go. */
export async function sendNext(db, code, batch, me, { env = process.env, fetchImpl = fetch } = {}) {
  if (!/^[a-z0-9-]{8,40}$/.test(String(batch || ''))) return { ok: false, why: 'Start the batch again.' };
  const r = await ready(db, code, env, fetchImpl);
  if (r.why) return { ok: false, why: r.why };
  if (await todaySent(db) >= DAY_CAP) return { ok: false, why: `Today's ${DAY_CAP} are sent. The next ones go tomorrow.` };
  await logRow(db, batch, code, 'batch', me && me.name);
  const done = Number((await db.prepare('SELECT sent + refused AS n FROM tc_go_s2_log WHERE batch = ?').get(batch)).n) || 0;
  const want = Math.min(PER_CALL, BATCH - done);
  if (want <= 0) return { ok: true, sent: 0, refused: 0, done: true };
  const people = await db.prepare(`SELECT s.id, s.email, s.first_name, s.link_code, s.mail_kind FROM tc_go_stage2 s LEFT JOIN tc_go_s2_sent x ON x.stage2_id = s.id
    WHERE s.gone = 0 AND s.sender = ? AND x.id IS NULL AND s.link_code IS NOT NULL AND s.email IS NOT NULL ORDER BY s.id LIMIT ?`).all(code, want);
  let sent = 0, refused = 0;
  for (const p of people) {
    // the mark first, so a crash between the two can never send the same person twice
    const mark = await db.prepare(`INSERT INTO tc_go_s2_sent (stage2_id, sender, mail_kind, result, sent_at, sent_by) VALUES (?,?,?,?,?,?)
      ON CONFLICT (stage2_id) DO NOTHING`).run(p.id, code, p.mail_kind || 'invite', 'sent', nowIso(), me && me.name);
    if (!Number(mark.changes)) continue;
    const mail = s2Mail(p.mail_kind || 'invite', p.first_name || '', p.link_code);
    const raw = Buffer.from(mime({ fromName: r.s.name || r.s.label, fromEmail: r.s.email, to: p.email, mail }), 'utf8').toString('base64url');
    let ok = false, detail = '';
    try { const res = await gmail(env, fetchImpl, r.tok.token, '/users/me/messages/send', { method: 'POST', body: JSON.stringify({ raw }) }); ok = res.ok; if (!ok) detail = 'Gmail ' + res.status; }
    catch (e) { detail = 'no answer'; }
    if (ok) sent++; else { refused++; await db.prepare(`UPDATE tc_go_s2_sent SET result = 'refused', detail = ? WHERE stage2_id = ?`).run(detail, p.id); }
  }
  await db.prepare('UPDATE tc_go_s2_log SET sent = sent + ?, refused = refused + ? WHERE batch = ?').run(sent, refused, batch);
  const left = Number((await db.prepare(`SELECT COUNT(*) AS n FROM tc_go_stage2 s LEFT JOIN tc_go_s2_sent x ON x.stage2_id = s.id
    WHERE s.gone = 0 AND s.sender = ? AND x.id IS NULL AND s.link_code IS NOT NULL`).get(code)).n) || 0;
  return { ok: true, sent, refused, left, done: !people.length || done + people.length >= BATCH || !left };
}
