// NEW FEEDBACK, BY EMAIL (Ritvars 04.10.2026: "Email to me", sent from ritvars.vilcins@novikontas.org).
//
// The same Google OAuth client Intake already uses for edu@ (lib/gmail.js), asked for ONE more thing:
// gmail.send, by the one account that sends and receives. He opens /api/admin/notify/connect once
// while signed in, presses Allow, and the refresh token is kept encrypted in sync_state like edu@'s.
// gmail.send cannot read the profile, so who signed in comes from the id_token (openid email).
//
// A failed email never fails the feedback: it is saved first, the email is a courtesy after it.
import crypto from 'node:crypto';
import { oauthClient, tokenUrl, CONSENT_URL, googleCodeOf, withCode } from './gmail.js';

export const SENDER = 'ritvars.vilcins@novikontas.org';
export const RECIPIENTS = [SENDER];
export const SCOPES = ['https://www.googleapis.com/auth/gmail.send', 'openid', 'email'];
const STATE_NAME = 'notify_oauth';
const apiRoot = (env) => env.GMAIL_API_ROOT || 'https://gmail.googleapis.com/gmail/v1';
const keyOf = (env) => crypto.createHash('sha256').update('notify-oauth-v1:' + String(env.CRM_SESSION_SECRET || '')).digest();

export function consentUrl({ env = process.env, state, redirectUri }) {
  const c = oauthClient(env);
  if (!c.ok) return null;
  const u = new URL(CONSENT_URL);
  for (const [k, v] of Object.entries({ client_id: c.id, redirect_uri: redirectUri, response_type: 'code',
    scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent', login_hint: SENDER, state })) u.searchParams.set(k, v);
  return u.toString();
}

/** The email in a Google id_token. It came straight from Google's token endpoint over TLS. */
function emailOf(idToken) {
  try { return String(JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64url').toString('utf8')).email || '').toLowerCase(); }
  catch { return ''; }
}

export async function exchangeCode({ env = process.env, code, redirectUri, fetchImpl = fetch }) {
  const c = oauthClient(env);
  if (!c.ok) return { ok: false, why: c.why };
  const res = await fetchImpl(tokenUrl(env), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: String(code || ''),
      client_id: c.id, client_secret: c.secret, redirect_uri: redirectUri }).toString() });
  if (!res.ok) return { ok: false, why: withCode('Google refused the code', await googleCodeOf(res)) };
  let t;
  try { t = await res.json(); } catch { return { ok: false, why: 'the token reply was not JSON' }; }
  if (!t.refresh_token) return { ok: false, why: 'Google gave no refresh token; open the link again' };
  return { ok: true, refreshToken: t.refresh_token, mailbox: emailOf(t.id_token) };
}

export async function saveToken(db, token, env = process.env) {
  if (!env.CRM_SESSION_SECRET) throw new Error('CRM_SESSION_SECRET is needed to keep the token encrypted');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', keyOf(env), iv);
  const ct = Buffer.concat([c.update(String(token), 'utf8'), c.final()]);
  const value = ['n1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
  await db.prepare(`INSERT INTO sync_state (name, value, ran_at, detail) VALUES (?, ?, ?, ?)
    ON CONFLICT (name) DO UPDATE SET value = excluded.value, ran_at = excluded.ran_at, detail = excluded.detail`)
    .run(STATE_NAME, value, new Date().toISOString(), JSON.stringify({ mailbox: SENDER }));
}

export async function loadToken(db, env = process.env) {
  if (!db || !env.CRM_SESSION_SECRET) return null;
  const row = await db.prepare('SELECT value FROM sync_state WHERE name = ?').get(STATE_NAME);
  if (!row || !row.value) return null;
  const [tag, iv, auth, ct] = String(row.value).split('.');
  if (tag !== 'n1') return null;
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', keyOf(env), Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(auth, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
  } catch { return null; }
}

const KIND = { BUG: 'Something broken', IDEA: 'An idea', QUESTION: 'A question' };
const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64');

/** The message itself, RFC 822, as Gmail's send call wants it. Plain text, no tracking. */
export function buildMessage({ id, kind, body, path, by, at, screenshot, origin }) {
  const subject = `Intake feedback: ${KIND[kind] || kind} from ${by || 'somebody'}`;
  const text = [`${KIND[kind] || kind} from ${by || 'somebody'}, ${at}`, '', String(body || ''), '',
    `Screen: ${path || 'not recorded'}`, screenshot ? 'A screenshot is attached in Intake.' : '',
    origin ? `Open it: ${origin}/#/feedback` : '', '', `Feedback #${id}`].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\r\n');
  return [`From: Intake <${SENDER}>`, `To: ${RECIPIENTS.join(', ')}`, `Subject: =?UTF-8?B?${b64(subject)}?=`,
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
    b64(text)].join('\r\n');
}

/** Send one feedback item. Returns { ok, why } and never throws. */
export async function sendFeedbackEmail(db, item, { env = process.env, fetchImpl = fetch } = {}) {
  try {
    const refresh = await loadToken(db, env);
    if (!refresh) return { ok: false, why: 'not connected' };
    const c = oauthClient(env);
    if (!c.ok) return { ok: false, why: c.why };
    const tr = await fetchImpl(tokenUrl(env), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh, client_id: c.id, client_secret: c.secret }).toString() });
    if (!tr.ok) return { ok: false, why: withCode('Google refused the stored sign-in; connect again', await googleCodeOf(tr)) };
    const { access_token: token } = await tr.json();
    const raw = Buffer.from(buildMessage(item), 'utf8').toString('base64url');
    const sr = await fetchImpl(apiRoot(env) + '/users/me/messages/send', { method: 'POST',
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify({ raw }) });
    return sr.ok ? { ok: true } : { ok: false, why: withCode('Gmail refused the send (' + sr.status + ')', await googleCodeOf(sr)) };
  } catch (e) {
    return { ok: false, why: e.message };
  }
}
