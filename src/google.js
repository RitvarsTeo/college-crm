// Google ID token verification, and the JWKS cache behind it.
//
// TAKEN FROM the merged sign-in kit at
// `Desktop/WF/Local Repo/Dev kits to share/Component library/1 Sign-in, merged (Client Hub + Talent Acquisition)`,
// whose `lib/_google.js` is byte-identical to the Talent Acquisition hub's and has
// been signing people in since September 2026. Adapted, not rewritten: the order
// of the checks below is the whole value of the file, and re-deriving it would
// only be a fresh chance to get that order wrong.
//
// GOOGLE PROVES WHO SOMEBODY IS. `crm_users` still decides what they may do.
// This file returns a verified email and nothing else: no role, no capability,
// and above all no account creation.
//
// Zero dependencies. node:crypto's webcrypto verifies RS256 straight from a JWK.
//
// `verifyIdToken` takes the key set as an ARGUMENT rather than fetching it, so
// the whole decision is testable against a locally generated key pair with no
// network and no Google account. test/google.test.js does exactly that.

import { webcrypto } from 'node:crypto';

export const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const HOSTED_DOMAIN = 'novikontas.org';

// --- JWKS cache --------------------------------------------------------------
//
// Module scope, one hour. Refetching per request is slow and makes every sign-in
// depend on Google being reachable at that exact instant.
let CACHE = { keys: null, fetchedAt: 0 };
const JWKS_TTL_MS = 60 * 60 * 1000;

export async function getGoogleJwks({ now = Date.now(), fetchImpl = fetch } = {}) {
  if (CACHE.keys && now - CACHE.fetchedAt < JWKS_TTL_MS) return CACHE.keys;
  const res = await fetchImpl(jwksUrl());
  if (!res.ok) {
    // Serve a stale key set rather than fail a sign-in over a blip. Google
    // rotates these slowly, so an expired cache is far more likely usable than not.
    if (CACHE.keys) return CACHE.keys;
    throw new Error(`Could not fetch Google JWKS (${res.status})`);
  }
  const body = await res.json();
  if (!Array.isArray(body?.keys) || !body.keys.length) {
    if (CACHE.keys) return CACHE.keys;
    throw new Error('Google JWKS came back empty');
  }
  CACHE = { keys: body.keys, fetchedAt: now };
  return CACHE.keys;
}

/** Test seam. Never called by the app. */
export function __setJwksCache(keys, fetchedAt = Date.now()) {
  CACHE = { keys, fetchedAt };
}

// --- verification ------------------------------------------------------------

const b64urlToBuf = (s) =>
  Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function decodeSegment(seg) {
  try { return JSON.parse(b64urlToBuf(seg).toString('utf8')); } catch { return null; }
}

/**
 * Verify a Google ID token.
 *
 * Returns { ok: true, email, sub, hd } or { ok: false, reason }. The reason is
 * for the server's own log only: every caller maps it to ONE identical refusal,
 * exactly as password sign-in does, so the screen never says which check failed.
 *
 * ORDER MATTERS. The signature is checked first. Reading claims out of an
 * unverified token and acting on them is the entire class of bug this exists to
 * avoid.
 */
export async function verifyIdToken(idToken, {
  clientId,
  nonce,
  jwks,
  hostedDomain = HOSTED_DOMAIN,
  now = Date.now(),
  clockSkewSec = 60,
} = {}) {
  if (typeof idToken !== 'string' || idToken.split('.').length !== 3) {
    return { ok: false, reason: 'malformed_token' };
  }
  const [h, p, s] = idToken.split('.');

  const header = decodeSegment(h);
  const payload = decodeSegment(p);
  if (!header || !payload) return { ok: false, reason: 'malformed_token' };

  // Only RS256. Taking `alg` from the token without constraining it is how the
  // "alg: none" and HMAC-confusion attacks work.
  if (header.alg !== 'RS256') return { ok: false, reason: 'bad_alg' };
  if (!header.kid) return { ok: false, reason: 'no_kid' };

  const keys = Array.isArray(jwks) ? jwks : jwks?.keys;
  if (!Array.isArray(keys)) return { ok: false, reason: 'no_jwks' };
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return { ok: false, reason: 'unknown_kid' };

  let key;
  try {
    key = await webcrypto.subtle.importKey(
      'jwk',
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
  } catch { return { ok: false, reason: 'bad_jwk' }; }

  const signed = new TextEncoder().encode(`${h}.${p}`);
  let valid = false;
  try {
    valid = await webcrypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBuf(s), signed);
  } catch { valid = false; }
  if (!valid) return { ok: false, reason: 'bad_signature' };

  // Claims, and only now that the signature holds.
  if (!GOOGLE_ISSUERS.includes(payload.iss)) return { ok: false, reason: 'bad_iss' };
  if (!clientId || payload.aud !== clientId) return { ok: false, reason: 'bad_aud' };

  const nowSec = Math.floor(now / 1000);
  if (typeof payload.exp !== 'number' || payload.exp + clockSkewSec < nowSec) {
    return { ok: false, reason: 'expired' };
  }
  if (typeof payload.iat === 'number' && payload.iat - clockSkewSec > nowSec) {
    return { ok: false, reason: 'issued_in_future' };
  }

  // The nonce ties this token to the browser that started the flow. Without it,
  // a token obtained elsewhere can be replayed into our callback.
  if (!nonce || payload.nonce !== nonce) return { ok: false, reason: 'bad_nonce' };

  // `hd` in the authorization request is a HINT a user can edit out of the URL.
  // THIS is the check that keeps every Google account on earth out.
  if (hostedDomain && payload.hd !== hostedDomain) return { ok: false, reason: 'bad_hd' };

  if (payload.email_verified !== true) return { ok: false, reason: 'email_not_verified' };
  if (typeof payload.email !== 'string' || !payload.email) return { ok: false, reason: 'no_email' };

  return { ok: true, email: payload.email, sub: payload.sub, hd: payload.hd };
}

// --- the allowlist -----------------------------------------------------------
//
// THE RULE THIS SECTION EXISTS TO KEEP: an account is never created by signing
// in. A verified novikontas.org address with no `crm_users` row is refused.
//
// Without it, everybody in the Workspace becomes an Academy CRM user with
// whatever the default role is, which is the single worst thing this feature
// could do. Ieva's applicants are in this database.

// Bounded vocabulary, never free text, so a refusal can be told apart in the log
// while the person refused sees one sentence.
export const REASON = {
  TOKEN:      'refused_google_token',
  DOMAIN:     'refused_google_domain',
  UNVERIFIED: 'refused_google_unverified',
  NO_ACCOUNT: 'refused_google_no_account',
  INACTIVE:   'refused_google_inactive',
};

// Which verifier failures mean "wrong domain" or "unverified", and which are
// simply a bad token. Mapping here keeps the verifier free of policy.
export const VERIFIER_REASON = {
  bad_hd: REASON.DOMAIN,
  email_not_verified: REASON.UNVERIFIED,
};

/**
 * `row` is the `crm_users` record for the verified email, or null.
 *
 * A pure function on purpose, so it can be tested exhaustively with no Google,
 * no network and no HTTP round trip. It never returns a role and never proposes
 * creating anything.
 *
 * Academy CRM has no account lockout, so unlike the kit this checks `active`
 * only. Inventing a lockout here that the password path does not have would be a
 * Google-specific business rule the original does not establish.
 */
export function decideAccountAccess(row) {
  if (!row) return { ok: false, reason: REASON.NO_ACCOUNT };
  if (row.active === 0 || row.active === false) return { ok: false, reason: REASON.INACTIVE };
  return { ok: true };
}

// --- configuration -----------------------------------------------------------

export const GOOGLE_ENV = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'];

/**
 * Is Google sign-in usable on this copy? NAMES only ever leave this function.
 *
 * GOOGLE_REDIRECT_URI is required rather than derived from the request host.
 * Google compares the redirect_uri character for character against what is
 * registered, and when it does not match it refuses on ITS OWN error page,
 * before any code here runs - so a guessed value fails in the one way that
 * leaves no trace on our side to debug.
 */
// --- test seams --------------------------------------------------------------
//
// The two Google endpoints can be pointed elsewhere, so the WHOLE callback route
// - state, nonce, the code exchange, the allowlist, the session - can be proved
// without a Google account and without a network.
//
// Each one REFUSES to point anywhere but this machine. An environment variable
// must never be able to send a real authorization code, or a real client secret,
// to somebody else's server.
const localOnly = (raw, name) => {
  let u;
  try { u = new URL(raw); } catch { throw new Error(name + ' is not a URL'); }
  if (!/^(localhost|127.0.0.1|[::1])$/i.test(u.hostname)) {
    throw new Error(name + ' may only point at this machine. It is a test seam, not a setting.');
  }
  return raw;
};

export const tokenUrl = (env = process.env) =>
  env.CRM_GOOGLE_TOKEN_URL ? localOnly(env.CRM_GOOGLE_TOKEN_URL, 'CRM_GOOGLE_TOKEN_URL') : GOOGLE_TOKEN_URL;

export const jwksUrl = (env = process.env) =>
  env.CRM_GOOGLE_JWKS_URL ? localOnly(env.CRM_GOOGLE_JWKS_URL, 'CRM_GOOGLE_JWKS_URL') : GOOGLE_JWKS_URL;

export function googleConfigured(env = process.env) {
  const missing = GOOGLE_ENV.filter((name) => !env[name]);
  return { ok: missing.length === 0, missing };
}
