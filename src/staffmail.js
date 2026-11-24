// A PERSON'S OWN MAILBOX IN THE EMAIL CONVERSATION (20.11.2026; the owner: "Ask in the app, not by me!", then the update
// popup "As drawn": "Allow Intake to include your own mailbox too. Only mail with students is kept." [Allow] [Not now]).
//
// Shown ONCE, at the next sign-in, to every Academy account (the people who handle the Inbox). The answer is recorded
// (who, when, what); either answer means it is never shown again. Allow opens Google's own consent for READ-ONLY Gmail
// (gmail.readonly + the account's email); nothing is read before the person allows it. Their Google account must be the
// same address as their Intake account. The refresh token is kept encrypted (AES-256-GCM, a key derived from
// CRM_SESSION_SECRET), one row per person; Disconnect revokes it at Google and removes the row.
//
// What is kept from such a mailbox: ONLY mail to or from a student Intake already holds (src/intake.js recordMailbox),
// in the same table as edu@'s sent mail (mail_sent) under the same 13-month retention; attachments by name and size only.
import crypto from 'node:crypto';
import { oauthClient, tokenUrl, CONSENT_URL, googleCodeOf, withCode, toSentShape, MAX_PAGES } from '../lib/gmail.js';

export const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'openid', 'email'];
export const ANSWERS = ['allow', 'later'];
export const PER_RUN = 60;          // messages per mailbox per run, oldest first
export const FIRST_DAYS = 30;       // the first run reaches back this far
const GMAIL = (env) => env.GMAIL_API_ROOT || 'https://gmail.googleapis.com/gmail/v1';
const REVOKE = 'https://oauth2.googleapis.com/revoke';
const keyOf = (env) => crypto.createHash('sha256').update('staff-mail-v1:' + String(env.CRM_SESSION_SECRET || '')).digest();
const low = (s) => String(s || '').trim().toLowerCase();

export function consentUrl({ env = process.env, state, redirectUri, email }) {
  const c = oauthClient(env);
  if (!c.ok) return null;
  const u = new URL(CONSENT_URL);
  for (const [k, v] of Object.entries({ client_id: c.id, redirect_uri: redirectUri, response_type: 'code', scope: SCOPES.join(' '),
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false', login_hint: email || '', state })) u.searchParams.set(k, v);
  return u.toString();
}

const emailOf = (idToken) => { try { return low(JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64url').toString('utf8')).email); } catch { return ''; } };

export async function exchangeCode({ env = process.env, code, redirectUri, fetchImpl = fetch }) {
  const c = oauthClient(env);
  if (!c.ok) return { ok: false, why: c.why };
  const res = await fetchImpl(tokenUrl(env), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: String(code || ''), client_id: c.id, client_secret: c.secret, redirect_uri: redirectUri }).toString() });
  if (!res.ok) return { ok: false, why: withCode('Google refused the code', await googleCodeOf(res)) };
  let t; try { t = await res.json(); } catch { return { ok: false, why: 'the token reply was not JSON' }; }
  if (!t.refresh_token) return { ok: false, why: 'Google gave no refresh token; allow again' };
  if (!String(t.scope || '').split(/\s+/).includes(SCOPES[0])) return { ok: false, why: 'Gmail was not allowed' };
  return { ok: true, refreshToken: t.refresh_token, email: emailOf(t.id_token) };
}

function seal(token, env) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', keyOf(env), iv);
  const ct = Buffer.concat([c.update(String(token), 'utf8'), c.final()]);
  return ['g1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}
function open(value, env) {
  const [v, iv, tag, ct] = String(value || '').split('.');
  if (v !== 'g1' || !iv || !tag || !ct) return null;
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', keyOf(env), Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
  } catch { return null; }
}

// ------------------------------------------------------------- the answer --
/** Should this signed-in user see the update popup? An Academy account that has not answered yet. */
export async function popupFor(db, user) {
  if (!user || !user.email || !Array.isArray(user.areas) || !user.areas.includes('academy')) return { show: false };
  const a = await db.prepare('SELECT answer FROM staff_mail_answers WHERE user_email = ?').get(low(user.email));
  return { show: !a };
}
/** The Inbox bar (email automation 7, the owner's pick 24.11.2026: ask in the app): an Academy account whose own mailbox is
 *  not connected sees "Connect your mailbox" on the Inbox until it is, whatever it answered the one-time popup. */
export async function connectBarFor(db, user) {
  if (!user || !user.email || !Array.isArray(user.areas) || !user.areas.includes('academy')) return { show: false, connected: false };
  const link = await db.prepare('SELECT 1 AS x FROM staff_mail_links WHERE user_email = ?').get(low(user.email));
  return { show: !link, connected: Boolean(link) };
}
/** Record the answer (allow | later) once; a second answer from the same person changes nothing. */
export async function recordAnswer(db, email, answer, at = new Date().toISOString()) {
  if (!ANSWERS.includes(answer)) throw new Error('Allow or Not now?');
  const u = low(email);
  const had = await db.prepare('SELECT answer FROM staff_mail_answers WHERE user_email = ?').get(u);
  if (had) return { recorded: false, answer: had.answer };
  await db.prepare('INSERT INTO staff_mail_answers (user_email, answer, answered_at) VALUES (?,?,?)').run(u, answer, at);
  return { recorded: true, answer };
}

// --------------------------------------------------------- the connection --
export async function saveLink(db, userEmail, refreshToken, env = process.env) {
  if (!env.CRM_SESSION_SECRET) throw new Error('CRM_SESSION_SECRET is needed to keep the token encrypted');
  const at = new Date().toISOString(), u = low(userEmail);
  await db.prepare(`INSERT INTO staff_mail_links (user_email, token, connected_at) VALUES (?, ?, ?)
    ON CONFLICT (user_email) DO UPDATE SET token = excluded.token, connected_at = excluded.connected_at`).run(u, seal(refreshToken, env), at);
}
export async function disconnect(db, userEmail, { env = process.env, fetchImpl = fetch } = {}) {
  const u = low(userEmail);
  const r = await db.prepare('SELECT token FROM staff_mail_links WHERE user_email = ?').get(u);
  if (r) {
    const t = open(r.token, env);
    if (t) { try { await fetchImpl(REVOKE, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: t }).toString() }); } catch {} }
    await db.prepare('DELETE FROM staff_mail_links WHERE user_email = ?').run(u);
  }
  return { connected: false };
}
/** For an admin: every answer and every connected mailbox. Never a token. */
export async function overview(db) {
  const answers = await db.prepare('SELECT user_email, answer, answered_at FROM staff_mail_answers ORDER BY answered_at').all();
  const links = await db.prepare('SELECT user_email, connected_at FROM staff_mail_links ORDER BY connected_at').all();
  return { answers, links };
}

async function accessToken(db, u, env, fetchImpl) {
  const r = await db.prepare('SELECT token FROM staff_mail_links WHERE user_email = ?').get(u);
  const refresh = r && open(r.token, env);
  if (!refresh) return null;
  const c = oauthClient(env);
  if (!c.ok) return null;
  const res = await fetchImpl(tokenUrl(env), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh, client_id: c.id, client_secret: c.secret }).toString() });
  if (res.status === 400 || res.status === 401) return 'gone';   // revoked at Google, or the password changed
  if (!res.ok) throw new Error('Google did not answer');
  return (await res.json()).access_token || null;
}

/** One mailbox's mail since `since`, OLDEST first, at most `limit`: { ok, items: [shape + mine], more, upTo }.
 * mine: 'out' when the person sent it (the SENT label), else 'in'. Spam, trash, drafts and chats are never asked for. */
export async function readMailbox(db, email, { env = process.env, fetchImpl = fetch, since, limit = PER_RUN, max = 50 } = {}) {
  const u = low(email);
  const tok = await accessToken(db, u, env, fetchImpl);
  if (tok === 'gone') { await db.prepare('DELETE FROM staff_mail_links WHERE user_email = ?').run(u); return { ok: false, gone: true, items: [] }; }
  if (!tok) return { ok: false, items: [], why: 'not connected' };
  const API = GMAIL(env) + '/users/me', headers = { authorization: 'Bearer ' + tok };
  const q = `after:${Math.floor(Date.parse(since) / 1000)} -in:spam -in:trash -in:drafts -in:chats`;
  const ids = []; let pageToken = null; let pages = 0;
  do {
    const r = await fetchImpl(`${API}/messages?maxResults=${max}&q=${encodeURIComponent(q)}` + (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''), { headers });
    if (!r.ok) return { ok: false, items: [], why: withCode('Gmail refused the list', await googleCodeOf(r)) };
    const page = await r.json();
    ids.push(...(page.messages || []).map((m) => m.id));
    pageToken = page.nextPageToken || null; pages++;
  } while (pageToken && pages < MAX_PAGES);
  const todo = ids.reverse().slice(0, limit);
  const items = []; let failed = 0; let upTo = null;
  for (const id of todo) {
    const r = await fetchImpl(`${API}/messages/${encodeURIComponent(id)}?format=full`, { headers });
    if (!r.ok) { failed++; break; }
    const m = await r.json();
    const s = toSentShape(m);
    if (!s || !s.sentAt) continue;
    upTo = s.sentAt;
    items.push({ ...s, mine: (m.labelIds || []).includes('SENT') ? 'out' : 'in' });
  }
  return { ok: failed === 0, items, more: Boolean(pageToken) || ids.length > todo.length, upTo };
}

export const _test = { seal, open };
