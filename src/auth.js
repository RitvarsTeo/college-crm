// Who you are, proved rather than asserted.
//
// ADAPTED FROM THE TALENT ACQUISITION HUB, `workforce-hub/lib/_auth.js`, which
// itself was lifted from the Client Hub and has been running since August 2026.
// Reused rather than rewritten on purpose: hand-rolling scrypt parameters and
// HMAC comparison a third time would only be a third chance to get it wrong.
//
// What was taken unchanged in shape: the versioned scrypt hash format, the
// signed session carrying identity AND role inside the signature, the decoy
// hash on a missing account so timing cannot be used to enumerate who has one,
// and the rule that the role is read from the DATABASE on every request and
// never from the cookie.
//
// What was left behind: four roles, vacancy and candidate capabilities, Google
// SSO, first-password flows. The Academy CRM needs two roles and a password.
//
// Deliberately PURE. Nothing here opens a database. `authenticate()` takes a
// lookup callback, so the whole decision is testable against fixtures.
//
// Zero dependencies. scrypt, randomBytes and timingSafeEqual are in node:crypto.

import { scryptSync, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';

// --- password hashing -------------------------------------------------------
//
// Format: scrypt$1$N$r$p$<salt-base64url>$<hash-base64url>
//
// The version field is the point. When these parameters are one day too weak, a
// version 2 can be added and old hashes still verify, so nobody is locked out.
export const SCRYPT = { version: 1, N: 16384, r: 8, p: 1, keylen: 32, saltBytes: 16 };

export function hashPassword(plain, params = SCRYPT) {
  const { version, N, r, p, keylen, saltBytes } = params;
  const salt = randomBytes(saltBytes);
  const hash = scryptSync(String(plain), salt, keylen, { N, r, p, maxmem: 256 * 1024 * 1024 });
  return ['scrypt', version, N, r, p,
    salt.toString('base64url'), hash.toString('base64url')].join('$');
}

export function parseHash(stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 7 || parts[0] !== 'scrypt') return null;
  const [, version, N, r, p, salt, hash] = parts;
  if (Number(version) !== 1) return null;
  return { N: Number(N), r: Number(r), p: Number(p),
    salt: Buffer.from(salt, 'base64url'), hash: Buffer.from(hash, 'base64url') };
}

export function verifyPassword(plain, stored) {
  const parsed = parseHash(stored);
  if (!parsed) return false;
  const { N, r, p, salt, hash } = parsed;
  let computed;
  try {
    computed = scryptSync(String(plain), salt, hash.length, { N, r, p, maxmem: 256 * 1024 * 1024 });
  } catch { return false; }
  return computed.length === hash.length && timingSafeEqual(computed, hash);
}

// --- roles ------------------------------------------------------------------
//
// Two, because the CRM only ever asks one question about a person: may they see
// and change how the system is wired?
//
//   admin  Aigars, Ritvars, Marina. Everything, plus the Channels panel, the
//          connection tests, and turning a channel on.
//   user   Ieva, Laura, Tetiana, Maris, Arina. The whole CRM, no wiring.
//
// The existing config already held exactly this split in `admins` and `users`,
// so this is the same rule written down somewhere it can be enforced.
export const ROLES = ['admin', 'user'];

export const CAN_SEE_CHANNELS   = new Set(['admin']);
export const CAN_TEST_CHANNELS  = new Set(['admin']);
export const CAN_ENABLE_CHANNEL = new Set(['admin']);

export const canSeeChannels   = (role) => CAN_SEE_CHANNELS.has(role);
export const canTestChannels  = (role) => CAN_TEST_CHANNELS.has(role);
export const canEnableChannel = (role) => CAN_ENABLE_CHANNEL.has(role);

// --- email ------------------------------------------------------------------

export const DEFAULT_DOMAIN = 'novikontas.org';
export const normalizeEmail = (raw) => String(raw ?? '').trim().toLowerCase();

/** Bare names are allowed, because everybody here is at the same domain. */
export function canonicalEmail(raw, domain = DEFAULT_DOMAIN) {
  const e = normalizeEmail(raw);
  if (!e) return '';
  return e.includes('@') ? e : `${e}@${domain}`;
}

// --- sessions ---------------------------------------------------------------
//
// The cookie carries the verified identity AND the role inside the signed
// region. The browser never asserts either: the server reads who this is out of
// the signature. That is what makes the history log mean anything, because
// until now `x-acting-as` was a header the browser set and the server believed.
//
// `sv` is the user's session_version at sign-in. Bumping that column invalidates
// every existing cookie for that person without waiting for expiry.
// HOW somebody proved who they are, carried INSIDE the signed region.
//
// The browser cannot assert it. That matters because 'signed in with Google'
// and 'signed in with a password' are different strengths of proof, and if the
// page could claim the stronger one, the weaker one would be worth nothing.
// Lifted from the merged sign-in kit, which uses it to gate setting a first
// password on a RECENT Google sign-in.
export const AUTH_METHODS = ['password', 'google'];

const SESSION_TAG = 'c1';
export const COOKIE = 'crm_session';
export const DEFAULT_MINUTES = 12 * 60;

const sign = (payload, secret) =>
  createHmac('sha256', secret).update(payload).digest('base64url');

export function issueSession({ id, email, name, role, sessionVersion,
  authMethod = 'password', authAt = Date.now() }, secret, minutes = DEFAULT_MINUTES) {
  if (!email || !role) throw new Error('Refusing to issue a session with no identity or role');
  if (!ROLES.includes(role)) throw new Error(`Refusing to issue a session for unknown role ${role}`);
  if (!AUTH_METHODS.includes(authMethod)) throw new Error(`Unknown auth method ${authMethod}`);
  if (!secret) throw new Error('Refusing to issue an unsigned session');
  const body = {
    exp: Date.now() + minutes * 60 * 1000,
    uid: id ?? null,
    em: email,
    nm: name ?? null,
    ro: role,
    sv: Number(sessionVersion ?? 0),
    am: authMethod,
    aat: Number(authAt),
    n: randomBytes(8).toString('base64url'),
  };
  const encoded = Buffer.from(JSON.stringify(body)).toString('base64url');
  const payload = `${SESSION_TAG}.${encoded}`;
  return `${payload}.${sign(payload, secret)}`;
}

/** Verify and decode. Returns null on any problem and never says which check
 *  failed, because the caller only ever needs "no". */
export function readSession(token, secret) {
  if (typeof token !== 'string' || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== SESSION_TAG) return null;
  const payload = `${parts[0]}.${parts[1]}`;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(parts[2]);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let body;
  try { body = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); }
  catch { return null; }
  if (!body || typeof body !== 'object') return null;
  if (!(Number(body.exp) > Date.now())) return null;
  const email = normalizeEmail(body.em);
  if (!email) return null;
  if (!ROLES.includes(body.ro)) return null;

  // An unknown auth method is read as the WEAKER one rather than rejected, so a
  // cookie issued before this field existed still signs its holder in.
  const authMethod = AUTH_METHODS.includes(body.am) ? body.am : 'password';

  return { id: body.uid ?? null, email, name: body.nm ?? null, role: body.ro,
    sessionVersion: Number(body.sv ?? 0), authMethod, authAt: Number(body.aat ?? 0),
    expires: Number(body.exp) };
}

export function cookieHeader(token, { secure = true, minutes = DEFAULT_MINUTES } = {}) {
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${minutes * 60}`
    + `; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

export const clearCookie = ({ secure = true } = {}) =>
  `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;

export function readCookie(header, name = COOKIE) {
  for (const part of String(header || '').split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

// --- the decision -----------------------------------------------------------

/**
 * `lookup(email)` returns the stored row, or nothing. It is a callback so this
 * whole decision can be tested with no database anywhere near it.
 *
 * Every failure answers the same `invalid_credentials`, and a missing account
 * still pays the scrypt cost, so "no such person" and "wrong password" take the
 * same time and cannot be used to find out who works here.
 */
export async function authenticate({ email, password }, lookup) {
  const canonical = canonicalEmail(email);
  const generic = { ok: false, reason: 'invalid_credentials' };
  if (!canonical || typeof password !== 'string' || password === '') return generic;

  const row = await lookup(canonical);

  if (!row || !row.password_hash) {
    verifyPassword(password, hashPassword('decoy-so-timing-does-not-leak'));
    return generic;
  }
  if (!verifyPassword(password, row.password_hash)) return generic;
  if (row.active === 0 || row.active === false) return { ok: false, reason: 'account_disabled' };
  if (!ROLES.includes(row.role)) return { ok: false, reason: 'account_disabled' };

  return {
    ok: true,
    user: { id: row.id, email: canonical, name: row.display_name ?? null, role: row.role,
      sessionVersion: Number(row.session_version ?? 0) },
  };
}

// --- password policy --------------------------------------------------------
//
// Length is what matters most; a wall of composition rules pushes people towards
// Passw0rd! and a sticky note. Twelve, matching what the shared door already
// demands, and a refusal of the handful a spray would actually try.
export const MIN_PASSWORD = 12;
const OBVIOUS = ['password', 'parole', 'novikontas', 'academy', 'admissions', 'qwerty', '123456'];

export function passwordProblem(plain, { email = '', name = '' } = {}) {
  const s = String(plain ?? '');
  if (s.length < MIN_PASSWORD) return `at least ${MIN_PASSWORD} characters`;
  if (new Set(s).size < 5) return 'at least five different characters';
  const low = s.toLowerCase();
  for (const word of OBVIOUS) if (low.includes(word)) return `must not contain "${word}"`;
  const local = canonicalEmail(email).split('@')[0];
  if (local && low.includes(local.toLowerCase())) return 'must not contain your own name';
  if (name && low.includes(String(name).toLowerCase())) return 'must not contain your own name';
  return null;
}

// --- is authentication switched on? -----------------------------------------
//
// Off by default so the 346 existing tests, which send `x-acting-as`, keep
// working unchanged. On, the header is ignored entirely and only a signed
// session identifies anybody.
export const authOn = (env = process.env) =>
  String(env.CRM_AUTH || '').toLowerCase() === '1'
  || String(env.CRM_AUTH || '').toLowerCase() === 'true';

export function requireConfigured(env = process.env) {
  // AUDIT C2 (07.10.2026): fail CLOSED on a hosted copy. With CRM_AUTH unset the app used to
  // start with no login at all, so one setting missed while creating a Vercel project would
  // publish every applicant. A shared demo copy behind the CRM_PUBLIC door is the one exception.
  if (!authOn(env) && env.VERCEL && String(env.CRM_PUBLIC || '') !== '1') {
    return { ok: false, auth: false,
      why: 'This is a hosted copy (VERCEL is set) and CRM_AUTH is not 1. Refusing to start '
         + 'rather than serving the CRM with no sign-in.' };
  }
  if (!authOn(env)) return { ok: true, auth: false };
  if (!env.CRM_SESSION_SECRET) {
    return { ok: false, auth: true,
      why: 'CRM_AUTH is on but CRM_SESSION_SECRET is not set. Refusing to start rather '
         + 'than signing sessions with a guessable key.' };
  }
  if (String(env.CRM_SESSION_SECRET).length < 24) {
    return { ok: false, auth: true,
      why: 'CRM_SESSION_SECRET is shorter than 24 characters. Refusing to start.' };
  }
  return { ok: true, auth: true };
}
