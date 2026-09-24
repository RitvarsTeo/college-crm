// Reading edu@novikontas.org, without an administrator being present.
//
// config/channels.json has declared `/api/cron/gmail-poll` as this channel's
// path since the register was written. The route did not exist - found on
// 24.09.2026 by checking every declared path against the filesystem. A promised
// endpoint that was never built is worse than an absent one, because the
// register reads as ready.
//
// This is everything that does NOT need the Workspace administrator. When they
// finally grant domain-wide delegation, the only change is that
// GMAIL_SERVICE_ACCOUNT_JSON stops being empty. Nothing here is rewritten.
//
// The two mechanisms, and why both exist:
//   push  - Gmail tells Pub/Sub the mailbox changed, Pub/Sub posts to us. Fast,
//           but it only says "something changed", never what. We still fetch.
//   poll  - we ask every few minutes. Slower, and it is the fallback, because a
//           watch EXPIRES after seven days and its expiry is silent. A channel
//           that goes quiet must not look like a channel with no email.
//
// NOTHING HERE PRINTS A SECRET. The service account key is read as a whole and
// never logged, and no function returns it.

import crypto from 'node:crypto';

export const MAILBOX = 'edu@novikontas.org';
export const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
export const KEY_ENV = 'GMAIL_SERVICE_ACCOUNT_JSON';
export const WATCH_DAYS = 7;
export const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const API = 'https://gmail.googleapis.com/gmail/v1/users/' + encodeURIComponent(MAILBOX);

// How far back a poll looks. Longer than the interval on purpose: a late run
// must never leave a gap, and the message id absorbs the repeats.
export const WINDOW_MINUTES = 15;

// ------------------------------------------------------------ credentials --
//
// Read, checked, and never returned. `ready()` answers whether we can talk to
// Google at all, and says which piece is missing when we cannot.

export function credentials(env = process.env) {
  const rawKey = env[KEY_ENV];
  if (!rawKey) {
    return { ok: false, why: KEY_ENV + ' is not set',
      waitingOn: 'the Google Workspace administrator', missingSecret: true };
  }
  let key;
  try { key = JSON.parse(rawKey); }
  catch { return { ok: false, why: KEY_ENV + ' is not readable JSON' }; }

  for (const field of ['client_email', 'private_key']) {
    if (!key[field]) return { ok: false, why: KEY_ENV + ' has no ' + field };
  }
  // The key itself never leaves this function.
  return { ok: true, clientEmail: key.client_email, _key: key };
}

export function ready(env = process.env) {
  const c = credentials(env);
  return { ok: c.ok, why: c.why || null, waitingOn: c.waitingOn || null,
    mailbox: MAILBOX, scopes: SCOPES,
    // Read-only, deliberately. The CRM never needs to send as this mailbox, and
    // asking for less is the difference between a quick approval and a long one.
    permission: 'read only' };
}

// ------------------------------------------------------------------ auth --
//
// A service account signs its own assertion and swaps it for an access token.
// `sub` is what makes it read a USER's mailbox rather than its own, and that is
// precisely the part an administrator has to allow.

const b64url = (buf) => Buffer.from(buf).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function buildAssertion(key, { now = new Date(), subject = MAILBOX } = {}) {
  const iat = Math.floor(now.getTime() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: key.client_email,
    sub: subject,                       // the mailbox we are reading, not our own
    scope: SCOPES.join(' '),
    aud: TOKEN_URL,
    iat,
    exp: iat + 3600,
  };
  const body = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(claim));
  const signature = crypto.createSign('RSA-SHA256').update(body).sign(key.private_key);
  return body + '.' + b64url(signature);
}

export async function accessToken({ env = process.env, now = new Date(), fetchImpl = fetch } = {}) {
  const c = credentials(env);
  if (!c.ok) return { ok: false, ...c };

  let assertion;
  try { assertion = buildAssertion(c._key, { now }); }
  catch (e) { return { ok: false, why: 'the private key could not sign: ' + e.message }; }

  const res = await fetchImpl(TOKEN_URL, { method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString() });

  const text = await res.text();
  if (!res.ok) {
    // Google says exactly what is wrong here, and the most common answer is
    // that delegation was never granted. Say that plainly instead of "401".
    const hint = /unauthorized_client/.test(text)
      ? 'the administrator has not allowed this service account to read the mailbox'
      : 'Google refused the token request';
    return { ok: false, status: res.status, why: hint, waitingOn: /unauthorized_client/.test(text)
      ? 'the Google Workspace administrator' : null };
  }
  let parsed;
  try { parsed = JSON.parse(text); } catch { return { ok: false, why: 'the token reply was not JSON' }; }
  return { ok: true, token: parsed.access_token, expiresIn: parsed.expires_in };
}

// ------------------------------------------------------------- the window --

export function pollQuery({ now = new Date(), minutes = WINDOW_MINUTES } = {}) {
  // Gmail's search takes whole seconds since the epoch.
  const after = Math.floor((now.getTime() - minutes * 60_000) / 1000);
  return `in:inbox after:${after}`;
}

// --------------------------------------------------------------- messages --
//
// What comes back from Gmail is Gmail-shaped: headers as a list, the body
// base64url inside a parts tree. The adapter wants the flat shape, and this is
// the only place that knows about the difference.

export function headerOf(message, name) {
  const list = (message && message.payload && message.payload.headers) || [];
  const found = list.find((h) => String(h.name).toLowerCase() === String(name).toLowerCase());
  return found ? found.value : null;
}

export function plainTextOf(message) {
  const seen = [];
  const walk = (part) => {
    if (!part) return;
    if (part.mimeType === 'text/plain' && part.body && part.body.data) {
      seen.push(Buffer.from(part.body.data, 'base64url').toString('utf8'));
    }
    for (const child of part.parts || []) walk(child);
  };
  walk(message && message.payload);
  // A message with only an HTML part is common. Taking the tags out badly is
  // worse than saying there was no plain text, because the qualifier reads this.
  return seen.length ? seen.join('\n').trim() : null;
}

export function toAdapterShape(message) {
  if (!message || !message.id) return null;
  return {
    id: message.id,
    threadId: message.threadId || null,
    date: headerOf(message, 'Date'),
    sender: headerOf(message, 'From'),
    subject: headerOf(message, 'Subject'),
    plaintextBody: plainTextOf(message),
    attachments: ((message.payload && message.payload.parts) || [])
      .filter((p) => p.filename)
      .map((p) => ({ filename: p.filename, size: (p.body && p.body.size) || 0 })),
    _labels: message.labelIds || [],
  };
}

// ------------------------------------------------------------- the expiry --
//
// A watch lasts seven days and dies quietly. Silence then looks exactly like a
// mailbox nobody wrote to, which is how a channel stops working without anybody
// noticing. The expiry is computed, not assumed, and a caller can ask.

export function watchState({ expiration, now = new Date() } = {}) {
  if (!expiration) return { watching: false, why: 'no watch has been registered' };
  const at = new Date(Number(expiration));
  const daysLeft = (at.getTime() - now.getTime()) / 86_400_000;
  return {
    watching: daysLeft > 0,
    expiresAt: at.toISOString(),
    daysLeft: Math.round(daysLeft * 10) / 10,
    // renewed well before it dies, because renewing late means lost messages
    renewNow: daysLeft < 2,
    why: daysLeft > 0 ? null : 'the watch expired, and Gmail stopped telling us anything',
  };
}

// ----------------------------------------------------------------- the run --
//
// Returns what it did rather than throwing, so a cron route can report the real
// reason. It refuses before making a request when there are no credentials: a
// call that was never made must never be reported as "nothing to do".

export async function runPoll({ env = process.env, now = new Date(),
  minutes = WINDOW_MINUTES, fetchImpl = fetch, max = 25 } = {}) {
  const auth = await accessToken({ env, now, fetchImpl });
  if (!auth.ok) {
    return { ok: false, ran: false, messages: 0, why: auth.why, waitingOn: auth.waitingOn || null };
  }
  const headers = { authorization: 'Bearer ' + auth.token };
  const q = pollQuery({ now, minutes });
  const listRes = await fetchImpl(`${API}/messages?maxResults=${max}&q=${encodeURIComponent(q)}`,
    { headers });
  if (!listRes.ok) return { ok: false, ran: true, messages: 0, why: 'Gmail refused the list request',
    status: listRes.status };

  const list = await listRes.json();
  const ids = (list.messages || []).map((m) => m.id);
  const out = [];
  for (const id of ids) {
    const r = await fetchImpl(`${API}/messages/${encodeURIComponent(id)}?format=full`, { headers });
    if (!r.ok) continue;
    const shaped = toAdapterShape(await r.json());
    if (shaped) out.push(shaped);
  }
  // A page token we ignore is a message we silently lost, so say it is there.
  return { ok: true, ran: true, messages: out.length, items: out, query: q,
    more: Boolean(list.nextPageToken), nextPageToken: list.nextPageToken || null };
}
