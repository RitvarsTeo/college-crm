// The door, for the shared testing copy.
//
// This is NOT authentication and it must never be called that. It is one shared
// password in front of the whole app so that Aigars and Ieva can open a web
// address and try the workflow, and nobody else can. It says nothing about WHO
// is using it: inside, identity is still a dropdown, exactly as on a laptop.
//
// Real sign-in - who you are, enforced per person - is a separate piece of work
// and is described in docs/PRODUCTION_MIGRATION.md section 6. Until that exists
// this copy carries DEMO DATA ONLY. That is not a convention, it is enforced
// below and by a test: with CRM_PUBLIC on, loading the real admissions export is
// refused outright.
//
// The password is read from the environment, is never written to a file, never
// logged, never returned by any endpoint, and never compared in a way that leaks
// its length or content through timing.

import crypto from 'node:crypto';
import { channelDef } from './inbound.js';

export const COOKIE = 'crm_access';
export const DAYS = 30;

export const isPublic = (env = process.env) =>
  String(env.CRM_PUBLIC || '').toLowerCase() === '1'
  || String(env.CRM_PUBLIC || '').toLowerCase() === 'true';

// Refuses to start rather than starting open. A copy on the internet with no
// door is worse than no copy, and a warning in a log nobody reads is not a door.
export function requireConfigured(env = process.env) {
  if (!isPublic(env)) return { ok: true, gate: false };
  const password = env.CRM_ACCESS_PASSWORD || '';
  if (!password) {
    return { ok: false, gate: true,
      why: 'CRM_PUBLIC is on but CRM_ACCESS_PASSWORD is not set. Refusing to start '
         + 'rather than publishing the CRM with no door on it.' };
  }
  if (password.length < 12) {
    return { ok: false, gate: true,
      why: 'CRM_ACCESS_PASSWORD is shorter than 12 characters. Refusing to start.' };
  }
  return { ok: true, gate: true };
}

// The cookie is signed with a key DERIVED from the password, so the password
// itself never travels to the browser and changing it invalidates every cookie.
const keyFor = (password) => crypto.createHash('sha256')
  .update('crm-access-v1:' + String(password)).digest();

export function mint(password, { now = Date.now() } = {}) {
  const expires = now + DAYS * 86400000;
  const body = 'v1.' + expires;
  const sig = crypto.createHmac('sha256', keyFor(password)).update(body).digest('base64url');
  return body + '.' + sig;
}

export function verifyTicket(ticket, password, { now = Date.now() } = {}) {
  const parts = String(ticket || '').split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return { ok: false, why: 'not a ticket' };
  const expires = Number(parts[1]);
  if (!Number.isFinite(expires)) return { ok: false, why: 'not a ticket' };

  const body = parts[0] + '.' + parts[1];
  const expect = crypto.createHmac('sha256', keyFor(password)).update(body).digest('base64url');
  const a = Buffer.from(parts[2]);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, why: 'signature did not match' };
  }
  // Checked AFTER the signature, so an expired ticket and a forged one are not
  // distinguishable to somebody guessing.
  if (now > expires) return { ok: false, why: 'expired' };
  return { ok: true, expires };
}

// Constant time, and it must not reveal the length either.
export function passwordMatches(given, password) {
  const a = crypto.createHash('sha256').update(String(given || '')).digest();
  const b = crypto.createHash('sha256').update(String(password || '')).digest();
  return crypto.timingSafeEqual(a, b);
}

export function readCookie(header, name = COOKIE) {
  for (const part of String(header || '').split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

export function cookieHeader(ticket, { secure = true } = {}) {
  return `${COOKIE}=${encodeURIComponent(ticket)}; Path=/; Max-Age=${DAYS * 86400}`
    + `; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

// Paths that work before the door, and only these.
export const OPEN_PATHS = new Set(['/access', '/favicon.ico', '/healthz']);

export function allows(pathname, env = process.env) {
  if (!isPublic(env)) return true;              // on a laptop there is no door
  if (OPEN_PATHS.has(pathname)) return true;
  // A provider webhook authenticates with its own signature or secret, which is
  // stronger than this door. Putting the door in front of it would break every
  // channel the moment one is connected.
  //
  // Only a REAL CHANNEL, though. `/api/inbound/events` lives under the same
  // prefix and is the observability view: every arrival, with sender names and
  // message bodies in it. A prefix match published that. Caught by this file's
  // own test before it went anywhere, and the same trap as the Meta handshake
  // route, which matched `/api/inbound/events` for the same reason.
  const inbound = /^\/api\/inbound\/([a-z_]+)$/.exec(pathname);
  if (inbound && channelDef(inbound[1])) return true;
  if (pathname.startsWith('/api/cron/')) return true;
  return false;
}

export const LOGIN_PAGE = (message = '') => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Academy CRM</title>
<style>
  :root { color-scheme: light dark; --bg:#f6f7f9; --card:#fff; --ink:#15202b;
          --muted:#5b6b7a; --line:#dde3ea; --accent:#0b3d6b; }
  @media (prefers-color-scheme: dark) { :root {
    --bg:#11161c; --card:#171e26; --ink:#e8edf2; --muted:#9aa8b6; --line:#2a333d; --accent:#7fb3e0; } }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; padding:24px;
         background:var(--bg); color:var(--ink);
         font:15px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:14px;
          padding:28px; width:100%; max-width:380px; }
  h1 { margin:0 0 4px; font-size:19px; letter-spacing:-.01em; }
  p  { margin:0 0 18px; color:var(--muted); font-size:13.5px; }
  label { display:block; font-size:12.5px; color:var(--muted); margin:0 0 6px; }
  input { width:100%; padding:11px 12px; font-size:15px; border:1px solid var(--line);
          border-radius:9px; background:transparent; color:var(--ink); }
  input:focus { outline:2px solid var(--accent); outline-offset:1px; }
  button { width:100%; margin-top:14px; padding:11px; font-size:15px; font-weight:600;
           border:0; border-radius:9px; background:var(--accent); color:#fff; cursor:pointer; }
  .err { margin:14px 0 0; padding:9px 11px; border-radius:8px; font-size:13px;
         background:#fdecec; color:#8d2020; }
  @media (prefers-color-scheme: dark) { .err { background:#3a1f1f; color:#ffb4b4; } }
  .note { margin-top:20px; padding-top:16px; border-top:1px solid var(--line);
          font-size:12.5px; color:var(--muted); }
</style></head>
<body><form class="card" method="POST" action="/access">
  <h1>Academy CRM</h1>
  <p>Testing copy. Enter the password you were given.</p>
  <label for="p">Password</label>
  <input id="p" name="password" type="password" autocomplete="current-password" autofocus required>
  <button type="submit">Open</button>
  ${message ? `<p class="err">${message}</p>` : ''}
  <p class="note"><strong>Demo data only</strong> - changes reset when the demo restarts.
    No real applicant is in it.</p>
</form></body></html>`;
