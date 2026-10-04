// WEB PUSH FOR THE CALL POP-UP (Q6, 04.10.2026).
//
// The owner: the corner notification is for when Intake is NOT on screen - and that includes a
// colleague whose Intake is closed. A page cannot show anything once it is closed; the browser's
// push service can. So each colleague's browser subscribes once, and when a call event is stored
// Intake knocks on that subscription. The service worker (src/sw.js) then asks Intake who is
// calling and shows the same notification the open app would.
//
// THE KNOCK CARRIES NO DATA. A push without a payload needs no encryption, and nothing about the
// caller ever passes through Google's or Mozilla's push service: the worker fetches it from Intake
// over the colleague's own session. Only the VAPID signature goes out, made with Node's own
// crypto - no library, in keeping with this repository's one dependency.
//
// Configuration, by NAME only (generate with scripts/vapid-keys.mjs, set in Vercel):
//   VAPID_PUBLIC_KEY   base64url, the 65-byte uncompressed P-256 public key
//   VAPID_PRIVATE_KEY  base64url, the 32-byte private scalar
//   VAPID_SUBJECT      mailto: address the push services can contact
// Without them push is simply off, and the open app still pops up as before.

import crypto from 'node:crypto';
import { isOperator } from './callpop.js';

export const VAPID_ENV = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'];
const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export function pushConfigured(env = process.env) {
  return VAPID_ENV.every((k) => Boolean(env[k]));
}

// The signed token every push service checks: who we are (the public key), for which push
// service (aud), until when (12 h at most, the spec's ceiling is 24 h).
export function vapidHeader(endpoint, { env = process.env, now = Date.now() } = {}) {
  const pub = unb64u(env.VAPID_PUBLIC_KEY);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID_PUBLIC_KEY is not an uncompressed P-256 key');
  const key = crypto.createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256',
    d: b64u(unb64u(env.VAPID_PRIVATE_KEY)), x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) } });
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600,
    sub: env.VAPID_SUBJECT }));
  const sig = crypto.sign('sha256', Buffer.from(head + '.' + body), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${b64u(pub)}`;
}

// ----------------------------------------------------------- subscriptions --
export async function subscribe(db, { endpoint, userName, now = new Date() }) {
  if (!endpoint || !/^https:\/\//.test(String(endpoint))) throw new Error('a push endpoint is an https URL');
  const at = now.toISOString();
  const had = await db.prepare('SELECT id FROM push_subscriptions WHERE endpoint = ?').get(String(endpoint));
  if (had) {
    await db.prepare('UPDATE push_subscriptions SET user_name = ?, created_at = ? WHERE id = ?').run(userName || '', at, had.id);
  } else {
    await db.prepare('INSERT INTO push_subscriptions (endpoint, user_name, created_at) VALUES (?,?,?)')
      .run(String(endpoint), userName || '', at);
  }
  return { ok: true };
}
export async function unsubscribe(db, endpoint) {
  await db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(String(endpoint || ''));
  return { ok: true };
}

// Whose browser to knock on for one call event: a ring goes to everybody; an answer to whoever
// answered, when Intake knows them (an answer by a name it does not know goes to everybody).
export async function targetsFor(db, ev, users = []) {
  const subs = await db.prepare('SELECT endpoint, user_name FROM push_subscriptions').all();
  if (ev.event === 'ended') return [];
  if (ev.event === 'answered' && ev.operator && users.some((u) => isOperator(ev.operator, u))) {
    return subs.filter((s) => isOperator(ev.operator, s.user_name));
  }
  return subs;
}

// Knock. Never throws: a call event is stored whatever the push services answer. A subscription
// the push service says is gone (404, 410) is deleted.
export async function knock(db, ev, { env = process.env, users = null, fetchImpl = fetch, timeoutMs = 3000 } = {}) {
  if (!pushConfigured(env)) return { sent: 0, skipped: 'push is not configured' };
  if (!users) {
    try { users = (await db.prepare('SELECT display_name FROM crm_users WHERE active = 1').all()).map((u) => u.display_name).filter(Boolean); } catch { users = []; }
  }
  let targets;
  try { targets = await targetsFor(db, ev, users); } catch { return { sent: 0, failed: 0 }; }
  let sent = 0;
  let gone = 0;
  let failed = 0;
  await Promise.allSettled(targets.map(async (s) => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const r = await fetchImpl(s.endpoint, { method: 'POST', signal: ctrl.signal,
        headers: { TTL: '60', Urgency: 'high', 'Content-Length': '0', Authorization: vapidHeader(s.endpoint, { env }) } });
      clearTimeout(timer);
      if (r.status === 404 || r.status === 410) { await unsubscribe(db, s.endpoint); gone++; return; }
      if (r.ok) sent++; else failed++;
    } catch { failed++; }
  }));
  return { sent, gone, failed };
}
