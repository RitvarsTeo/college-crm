// Google sign-in.
//
// Every token in this file is minted HERE, with a key pair generated in the test
// process. Nothing contacts Google, nothing needs a Google account, and nothing
// needs the real client secret - which is the only way this could be tested at
// all, since Academy CRM has no OAuth credentials yet.
//
// The shape of the suite follows the rule the feature exists to keep:
//
//   GOOGLE PROVES WHO SOMEBODY IS. crm_users DECIDES WHAT THEY MAY DO.
//
// So roughly half of it is about refusing people Google was perfectly happy with.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { verifyIdToken, decideAccountAccess, googleConfigured, tokenUrl, jwksUrl,
  REASON, VERIFIER_REASON, HOSTED_DOMAIN, GOOGLE_ENV, __setJwksCache } from '../src/google.js';
import { issueSession, readSession, AUTH_METHODS, canonicalEmail, hashPassword, SCRYPT }
  from '../src/auth.js';
import { openDb } from '../src/db.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SECRET = 'a-session-secret-long-enough-to-be-accepted';
const CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
const CLIENT_SECRET = 'test-client-secret-not-a-real-one';

// ------------------------------------------------------------- a fake Google --

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'test-key-1';
const JWK = { ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' };
const JWKS = [JWK];

// A second key, to prove a signature from the wrong key is refused.
const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

/** Mint an ID token the way Google would. `over` overrides any claim. */
function mintToken(over = {}, { key = privateKey, header = {} } = {}) {
  const nowSec = Math.floor(Date.now() / 1000);
  const head = { alg: 'RS256', kid: KID, typ: 'JWT', ...header };
  const body = {
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: '1234567890',
    hd: HOSTED_DOMAIN,
    email: 'ritvars@novikontas.org',
    email_verified: true,
    nonce: 'the-nonce',
    iat: nowSec,
    exp: nowSec + 3600,
    ...over,
  };
  const signing = `${b64(head)}.${b64(body)}`;
  if (key === null) return `${signing}.`;                 // unsigned
  const sig = crypto.createSign('RSA-SHA256').update(signing).end()
    .sign(key).toString('base64url');
  return `${signing}.${sig}`;
}

const verify = async (token, opts = {}) =>
  await verifyIdToken(token, { clientId: CLIENT_ID, nonce: 'the-nonce', jwks: JWKS, ...opts });

// ================================================================= the verifier

test('a well-formed token from the right key, domain and nonce verifies', async () => {
  const r = await verify(mintToken());
  assert.equal(r.ok, true);
  assert.equal(r.email, 'ritvars@novikontas.org');
  assert.equal(r.hd, HOSTED_DOMAIN);
});

test('A TOKEN FROM ANOTHER KEY IS REFUSED', async () => {
  // The whole point of checking a signature. Without this, anybody can write
  // themselves an ID token saying they are the owner.
  const r = await verify(mintToken({}, { key: other.privateKey }));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'bad_signature');
});

test('a token with the payload edited after signing is refused', async () => {
  const good = mintToken();
  const [h, , s] = good.split('.');
  const tampered = JSON.parse(Buffer.from(good.split('.')[1], 'base64url').toString('utf8'));
  tampered.email = 'somebody.else@novikontas.org';
  const r = await verify(`${h}.${b64(tampered)}.${s}`);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'bad_signature');
});

test('an unsigned token, or one claiming alg none, is refused', async () => {
  // The classic. A verifier that trusts the token's own alg field can be told
  // there is no signature to check.
  assert.equal((await verify(mintToken({}, { key: null, header: { alg: 'none' } }))).reason, 'bad_alg');
  assert.equal((await verify(mintToken({}, { header: { alg: 'HS256' } }))).reason, 'bad_alg');
});

test('a token signed with a key we do not hold is refused by kid', async () => {
  assert.equal((await verify(mintToken({}, { header: { kid: 'some-other-kid' } }))).reason, 'unknown_kid');
  assert.equal((await verify(mintToken({}, { header: { kid: undefined } }))).reason, 'no_kid');
});

test('A GOOGLE ACCOUNT OUTSIDE NOVIKONTAS IS REFUSED', async () => {
  // hd on the authorization request is a hint the user can edit out of the URL.
  // THIS is the check that keeps every Google account on earth out.
  for (const hd of ['gmail.com', 'novikontas.com', '', undefined]) {
    const r = await verify(mintToken({ hd, email: 'anybody@gmail.com' }));
    assert.equal(r.ok, false, `hd=${hd} must not verify`);
    assert.equal(r.reason, 'bad_hd');
  }
});

test('an unverified Google address is refused', async () => {
  assert.equal((await verify(mintToken({ email_verified: false }))).reason, 'email_not_verified');
  assert.equal((await verify(mintToken({ email_verified: 'true' }))).reason, 'email_not_verified');
});

test('a token minted for another application is refused', async () => {
  // aud. Without it, a token issued to any other Google app is accepted here.
  assert.equal((await verify(mintToken({ aud: 'some-other-app.apps.googleusercontent.com' }))).reason, 'bad_aud');
  assert.equal((await verifyIdToken(mintToken(), { nonce: 'the-nonce', jwks: JWKS })).reason, 'bad_aud');
});

test('a token from the wrong issuer is refused', async () => {
  assert.equal((await verify(mintToken({ iss: 'https://accounts.evil.example' }))).reason, 'bad_iss');
});

test('an expired token is refused, and the clock skew is bounded', async () => {
  const nowSec = Math.floor(Date.now() / 1000);
  assert.equal((await verify(mintToken({ exp: nowSec - 3600 }))).reason, 'expired');
  // Inside the 60 second skew it still passes; outside it does not.
  assert.equal((await verify(mintToken({ exp: nowSec - 30 }))).ok, true);
  assert.equal((await verify(mintToken({ exp: nowSec - 120 }))).reason, 'expired');
});

test('a token issued in the future is refused', async () => {
  const nowSec = Math.floor(Date.now() / 1000);
  assert.equal((await verify(mintToken({ iat: nowSec + 3600 }))).reason, 'issued_in_future');
});

test('A TOKEN OBTAINED SOMEWHERE ELSE CANNOT BE REPLAYED HERE', async () => {
  // The nonce ties the token to the browser that started THIS flow.
  assert.equal((await verify(mintToken({ nonce: 'a-different-nonce' }))).reason, 'bad_nonce');
  assert.equal((await verify(mintToken({ nonce: undefined }))).reason, 'bad_nonce');
  assert.equal((await verifyIdToken(mintToken(), { clientId: CLIENT_ID, jwks: JWKS })).reason, 'bad_nonce');
});

test('rubbish where a token should be is refused rather than throwing', async () => {
  for (const junk of [null, undefined, '', 'x', 'a.b', 'a.b.c.d', 42, {}, 'not.a.token']) {
    const r = await verify(junk);
    assert.equal(r.ok, false, String(junk));
    assert.ok(r.reason, 'every refusal must name a reason for the log');
  }
});

test('a missing or broken key set is refused rather than throwing', async () => {
  assert.equal((await verify(mintToken(), { jwks: undefined })).reason, 'no_jwks');
  assert.equal((await verify(mintToken(), { jwks: [] })).reason, 'unknown_kid');
  assert.equal((await verify(mintToken(), { jwks: [{ kid: KID, kty: 'RSA', n: '!!', e: '!!' }] })).ok, false);
});

// ================================================================ the allowlist

test('A VERIFIED NOVIKONTAS ADDRESS WITH NO ACCOUNT IS REFUSED', async () => {
  // The single most important line in the feature. Without it, everybody in the
  // Workspace becomes an Academy CRM user, and Ieva's applicants are in here.
  const d = decideAccountAccess(null);
  assert.equal(d.ok, false);
  assert.equal(d.reason, REASON.NO_ACCOUNT);
});

test('a disabled account is refused even though Google was happy', async () => {
  assert.equal(decideAccountAccess({ active: 0 }).reason, REASON.INACTIVE);
  assert.equal(decideAccountAccess({ active: false }).reason, REASON.INACTIVE);
  assert.equal(decideAccountAccess({ active: 1 }).ok, true);
});

test('the allowlist never returns a role and never proposes creating anything', async () => {
  const d = decideAccountAccess({ active: 1, role: 'admin' });
  assert.deepEqual(Object.keys(d), ['ok']);
  assert.equal(d.role, undefined);
});

test('every refusal reason is a bounded code, never free text', async () => {
  const allowed = new Set(Object.values(REASON));
  for (const code of Object.values(VERIFIER_REASON)) assert.ok(allowed.has(code), code);
  for (const code of Object.values(REASON)) assert.match(code, /^refused_google_[a-z_]+$/);
});

// ================================================================== the session

test('a Google session says so, inside the signature', async () => {
  const t = issueSession({ id: 'u1', email: 'ritvars@novikontas.org', name: 'Ritvars',
    role: 'admin', sessionVersion: 0, authMethod: 'google' }, SECRET);
  const s = readSession(t, SECRET);
  assert.equal(s.authMethod, 'google');
  assert.ok(s.authAt > 0);
});

test('EDITING a session to claim it was Google is refused', async () => {
  // authMethod is a claim about strength of proof. If the browser could assert
  // it, it would be worth nothing.
  const t = issueSession({ email: 'ieva@novikontas.org', role: 'user' }, SECRET);
  const [tag, payload, sig] = t.split('.');
  const body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  assert.equal(body.am, 'password');
  body.am = 'google';
  assert.equal(readSession(`${tag}.${b64(body)}.${sig}`, SECRET), null);
});

test('a session from before this field existed still signs its holder in', async () => {
  // Read as the WEAKER method rather than rejected, so adding the field did not
  // sign everybody out.
  const t = issueSession({ email: 'ieva@novikontas.org', role: 'user' }, SECRET);
  const [tag, payload] = t.split('.');
  const body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  delete body.am;
  const rebuilt = `${tag}.${b64(body)}`;
  const mac = crypto.createHmac('sha256', SECRET).update(rebuilt).digest('base64url');
  const s = readSession(`${rebuilt}.${mac}`, SECRET);
  assert.equal(s.authMethod, 'password');
});

test('an unknown auth method cannot be issued', async () => {
  assert.deepEqual(AUTH_METHODS, ['password', 'google']);
  assert.throws(() => issueSession({ email: 'x@novikontas.org', role: 'user',
    authMethod: 'magic-link' }, SECRET), /Unknown auth method/);
});

// =============================================================== configuration

test('Google is reported as not configured when anything is missing', async () => {
  assert.deepEqual(GOOGLE_ENV, ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI']);
  assert.equal(googleConfigured({}).ok, false);
  assert.deepEqual(googleConfigured({}).missing, GOOGLE_ENV);
  assert.equal(googleConfigured({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b' }).ok, false);
  assert.deepEqual(googleConfigured({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b' }).missing,
    ['GOOGLE_REDIRECT_URI']);
  assert.equal(googleConfigured({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b',
    GOOGLE_REDIRECT_URI: 'c' }).ok, true);
});

test('THE TEST SEAMS CANNOT POINT AT ANOTHER MACHINE', async () => {
  // They exist so the callback route can be proved offline. If one could point
  // anywhere, an environment variable would send a real authorization code and a
  // real client secret to somebody else's server.
  assert.equal(tokenUrl({}), 'https://oauth2.googleapis.com/token');
  assert.equal(jwksUrl({}), 'https://www.googleapis.com/oauth2/v3/certs');
  assert.equal(tokenUrl({ CRM_GOOGLE_TOKEN_URL: 'http://127.0.0.1:9/t' }), 'http://127.0.0.1:9/t');
  for (const bad of ['https://evil.example/t', 'http://oauth2.googleapis.com.evil.example/t',
    'http://localhost.evil.example/t', 'not-a-url']) {
    assert.throws(() => tokenUrl({ CRM_GOOGLE_TOKEN_URL: bad }), /only point at this machine|is not a URL/, bad);
    assert.throws(() => jwksUrl({ CRM_GOOGLE_JWKS_URL: bad }), /only point at this machine|is not a URL/, bad);
  }
});

// ================================== the whole route, against a real server

/** A stand-in for Google: serves the key set, and exchanges a code for whatever
 *  token the current test wants it to return. */
function startFakeGoogle() {
  const state = { idToken: null, tokenStatus: 200 };
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/certs')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ keys: JWKS }));
    }
    if (req.url.startsWith('/token')) {
      let body = '';
      req.on('data', (d) => { body += d; });
      return req.on('end', () => {
        state.lastTokenRequest = body;
        if (state.tokenStatus !== 200) { res.writeHead(state.tokenStatus); return res.end('{}'); }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ id_token: state.idToken, access_token: state.accessToken || 'not-used',
          ...(state.scope ? { scope: state.scope } : {}) }));
      });
    }
    // Google Drive's upload endpoint, for the Google Sheets export.
    if (req.url.startsWith('/upload')) {
      const chunks = [];
      req.on('data', (d) => chunks.push(d));
      return req.on('end', () => {
        state.uploads = (state.uploads || []).concat([{ url: req.url, headers: req.headers, body: Buffer.concat(chunks) }]);
        res.writeHead(state.uploadStatus || 200, { 'content-type': 'application/json' });
        res.end(state.uploadBody || JSON.stringify({ id: 'sheet123', webViewLink: 'https://docs.google.com/spreadsheets/d/sheet123/edit' }));
      });
    }
    res.writeHead(404); res.end();
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () =>
    resolve({ server, port: server.address().port, state })));
}

async function seededDb(dir) {
  const file = path.join(dir, 'crm.db');
  const db = await openDb(file);
  const add = async (email, name, role, active = 1) => await db.prepare(`INSERT INTO crm_users
    (id, email, display_name, password_hash, role, active, session_version, created_at)
    VALUES (?,?,?,?,?,?,0,?)`).run('u' + crypto.randomBytes(4).toString('hex'), email, name,
    hashPassword('a-long-enough-password-here', { ...SCRYPT, N: 1024 }), role, active,
    new Date().toISOString());
  await add('ritvars@novikontas.org', 'Ritvars', 'admin');
  await add('ieva@novikontas.org', 'Ieva', 'user');
  await add('gone@novikontas.org', 'Left The Company', 'user', 0);
  return file;
}

function startServer(env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')],
      { env: { ...process.env, PORT: '0', CRM_INSECURE_COOKIE: '1', CRM_PUBLIC: '',
        DATASET: 'empty', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const done = (fn, arg) => { clearTimeout(timer); fn(arg); };
    const timer = setTimeout(() => { child.kill(); reject(new Error('never started: ' + out)); }, 15000);
    const look = (d) => {
      out += d;
      if (/REFUSING TO START/.test(out)) { child.kill(); return done(reject, new Error(out)); }
      const m = out.match(/http:\/\/localhost:(\d+)/);
      if (m) done(resolve, { child, port: Number(m[1]) });
    };
    child.stdout.on('data', look);
    child.stderr.on('data', look);
    child.on('exit', () => done(reject, new Error('exited: ' + out)));
  });
}

function request(port, method, p, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, method, path: p,
      headers: { ...(payload ? { 'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload) } : {}), ...headers } }, (res) => {
      let text = '';
      res.on('data', (d) => { text += d; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(text); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, text, json,
          cookies: res.headers['set-cookie'] || [], location: res.headers.location });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const cookieValue = (list, name) => {
  for (const c of [].concat(list || [])) {
    const [pair] = c.split(';');
    const eq = pair.indexOf('=');
    if (pair.slice(0, eq).trim() === name) return pair.slice(eq + 1);
  }
  return null;
};

/** Everything a signed-in Google flow needs, ready to drive. */
async function rig(t, extraEnv = {}) {
  const fake = await startFakeGoogle();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-google-'));
  const file = await seededDb(dir);
  const s = await startServer({
    CRM_DB: file, CRM_AUTH: '1', CRM_SESSION_SECRET: SECRET,
    GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: CLIENT_SECRET,
    GOOGLE_REDIRECT_URI: 'http://127.0.0.1/api/auth/google/callback',
    CRM_GOOGLE_TOKEN_URL: `http://127.0.0.1:${fake.port}/token`,
    CRM_GOOGLE_JWKS_URL: `http://127.0.0.1:${fake.port}/certs`,
    CRM_GOOGLE_DRIVE_UPLOAD_URL: `http://127.0.0.1:${fake.port}/upload`,
    ...extraEnv,
  });
  // One cleanup, registered once, that cannot throw.
  t.after(() => {
    try { s.child.kill(); } catch {}
    try { fake.server.close(); } catch {}
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });
  RIG_FAKE.set(s.port, fake);
  return { ...s, fake };
}
const RIG_FAKE = new Map();

/** Start the flow and read back the state and nonce the server minted. */
async function beginFlow(port) {
  const r = await request(port, 'GET', '/api/auth/google/start');
  assert.equal(r.status, 302, 'start must redirect to Google');
  const flow = decodeURIComponent(cookieValue(r.cookies, 'crm_oauth'));
  const body = JSON.parse(Buffer.from(flow.split('.')[0], 'base64url').toString('utf8'));
  return { flow, state: body.state, nonce: body.nonce, to: new URL(r.location) };
}

const withFlow = (flow) => ({ cookie: `crm_oauth=${encodeURIComponent(flow)}` });

test('start redirects to Google with every parameter that matters', async (t) => {
  const s = await rig(t);
  const f = await beginFlow(s.port);
  assert.equal(f.to.origin + f.to.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(f.to.searchParams.get('client_id'), CLIENT_ID);
  assert.equal(f.to.searchParams.get('response_type'), 'code');
  assert.equal(f.to.searchParams.get('scope'), 'openid email profile');
  assert.equal(f.to.searchParams.get('hd'), HOSTED_DOMAIN);
  assert.ok(f.to.searchParams.get('state'));
  assert.ok(f.to.searchParams.get('nonce'));
  // Never a photo: the scope is openid, email and profile, and nothing asks for
  // a picture, so there is no avatar anywhere to invent.
  assert.equal(f.to.searchParams.get('scope').includes('drive'), false);
});

test('the flow cookie is HttpOnly and scoped to the Google routes only', async (t) => {
  const s = await rig(t);
  const r = await request(s.port, 'GET', '/api/auth/google/start');
  const raw = [].concat(r.cookies).find((c) => c.startsWith('crm_oauth='));
  assert.match(raw, /HttpOnly/);
  assert.match(raw, /SameSite=Lax/);       // Strict would not survive the return from Google
  assert.match(raw, /Path=\/api\/auth\/google/);
});

test('A KNOWN GOOGLE USER SIGNS IN AND GETS THE ROLE FROM crm_users', async (t) => {
  const s = await rig(t);
  const f = await beginFlow(s.port);
  s.fake.state.idToken = mintToken({ nonce: f.nonce, email: 'ritvars@novikontas.org' });

  const cb = await request(s.port, 'GET', `/api/auth/google/callback?code=abc&state=${f.state}`,
    { headers: withFlow(f.flow) });
  assert.equal(cb.status, 303);
  assert.equal(cb.location, '/?auth=google');

  const session = cookieValue(cb.cookies, 'crm_session');
  assert.ok(session, 'a session cookie must be set');
  const me = await request(s.port, 'GET', '/api/auth/me',
    { headers: { cookie: `crm_session=${session}` } });
  assert.equal(me.json.user.email, 'ritvars@novikontas.org');
  assert.equal(me.json.user.role, 'admin');
  assert.equal(me.json.user.name, 'Ritvars', 'the name comes from crm_users, not from Google');
});

test('an ordinary user signs in as an ordinary user, not an admin', async (t) => {
  const s = await rig(t);
  const f = await beginFlow(s.port);
  s.fake.state.idToken = mintToken({ nonce: f.nonce, email: 'ieva@novikontas.org' });
  const cb = await request(s.port, 'GET', `/api/auth/google/callback?code=abc&state=${f.state}`,
    { headers: withFlow(f.flow) });
  const session = cookieValue(cb.cookies, 'crm_session');
  const me = await request(s.port, 'GET', '/api/auth/me', { headers: { cookie: `crm_session=${session}` } });
  assert.equal(me.json.user.role, 'user');

  // And the admin boundary still holds for her.
  const ch = await request(s.port, 'GET', '/api/admin/channels', { headers: { cookie: `crm_session=${session}` } });
  assert.equal(ch.status, 403);
});

test('A VERIFIED NOVIKONTAS ACCOUNT WITH NO crm_users ROW IS REFUSED', async (t) => {
  // Google is entirely happy with this person. They work here. They still do not
  // get in, and no account is created for them.
  const s = await rig(t);
  const f = await beginFlow(s.port);
  s.fake.state.idToken = mintToken({ nonce: f.nonce, email: 'brand.new@novikontas.org' });
  const cb = await request(s.port, 'GET', `/api/auth/google/callback?code=abc&state=${f.state}`,
    { headers: withFlow(f.flow) });
  assert.equal(cb.status, 303);
  assert.equal(cb.location, '/?error=not_authorised');
  assert.equal(cookieValue(cb.cookies, 'crm_session'), null, 'no session may be issued');
});

test('a disabled account is refused through Google too', async (t) => {
  const s = await rig(t);
  const f = await beginFlow(s.port);
  s.fake.state.idToken = mintToken({ nonce: f.nonce, email: 'gone@novikontas.org' });
  const cb = await request(s.port, 'GET', `/api/auth/google/callback?code=abc&state=${f.state}`,
    { headers: withFlow(f.flow) });
  assert.equal(cb.location, '/?error=not_authorised');
  assert.equal(cookieValue(cb.cookies, 'crm_session'), null);
});

test('a personal Google account is refused', async (t) => {
  const s = await rig(t);
  const f = await beginFlow(s.port);
  s.fake.state.idToken = mintToken({ nonce: f.nonce, hd: 'gmail.com', email: 'ritvars@gmail.com' });
  const cb = await request(s.port, 'GET', `/api/auth/google/callback?code=abc&state=${f.state}`,
    { headers: withFlow(f.flow) });
  assert.equal(cb.location, '/?error=not_authorised');
  assert.equal(cookieValue(cb.cookies, 'crm_session'), null);
});

test('EVERY REFUSAL LOOKS THE SAME FROM OUTSIDE', async (t) => {
  // No account, wrong domain, disabled, bad token. Four different causes, one
  // sentence, so nobody learns how to try again differently.
  const s = await rig(t);

  // Each case names its own claims AND its own signing key. An earlier version of
  // this test re-signed every case with the GOOD key, so the "wrong key" case
  // quietly became a valid admin sign-in and the test caught it. Keeping the key
  // beside the claims is what stops that.
  const cases = [
    { why: 'no account',   claims: { email: 'brand.new@novikontas.org' }, key: privateKey },
    { why: 'wrong domain', claims: { hd: 'gmail.com', email: 'x@gmail.com' }, key: privateKey },
    { why: 'disabled',     claims: { email: 'gone@novikontas.org' }, key: privateKey },
    { why: 'unverified',   claims: { email_verified: false }, key: privateKey },
    { why: 'wrong key',    claims: {}, key: other.privateKey },
  ];

  const seen = new Set();
  for (const c of cases) {
    const f = await beginFlow(s.port);
    s.fake.state.idToken = mintToken({ ...c.claims, nonce: f.nonce }, { key: c.key });
    const cb = await request(s.port, 'GET', `/api/auth/google/callback?code=abc&state=${f.state}`,
      { headers: withFlow(f.flow) });
    seen.add(cb.location);
    assert.equal(cookieValue(cb.cookies, 'crm_session'), null,
      `${c.why}: a session was issued and must not have been`);
  }
  assert.deepEqual([...seen], ['/?error=not_authorised'], 'every cause must look identical');
});

test('a callback with no flow cookie is refused, and never reaches Google', async (t) => {
  const s = await rig(t);
  s.fake.state.lastTokenRequest = null;
  const cb = await request(s.port, 'GET', '/api/auth/google/callback?code=abc&state=anything');
  assert.equal(cb.location, '/?error=not_authorised');
  assert.equal(s.fake.state.lastTokenRequest, null,
    'the code must not be exchanged when the flow cannot be proved');
});

test('A CALLBACK WITH SOMEBODY ELSE STATE IS REFUSED', async (t) => {
  const s = await rig(t);
  const f = await beginFlow(s.port);
  s.fake.state.idToken = mintToken({ nonce: f.nonce });
  const cb = await request(s.port, 'GET', '/api/auth/google/callback?code=abc&state=not-the-state',
    { headers: withFlow(f.flow) });
  assert.equal(cb.location, '/?error=not_authorised');
  assert.equal(cookieValue(cb.cookies, 'crm_session'), null);
});

test('a forged flow cookie is refused', async (t) => {
  const s = await rig(t);
  const forged = Buffer.from(JSON.stringify({ state: 'mine', nonce: 'mine',
    exp: Date.now() + 60000 })).toString('base64url') + '.not-a-real-signature';
  const cb = await request(s.port, 'GET', '/api/auth/google/callback?code=abc&state=mine',
    { headers: withFlow(forged) });
  assert.equal(cb.location, '/?error=not_authorised');
});

test('a replayed token from an earlier flow is refused', async (t) => {
  const s = await rig(t);
  const first = await beginFlow(s.port);
  const stolen = mintToken({ nonce: first.nonce });
  const second = await beginFlow(s.port);
  s.fake.state.idToken = stolen;                 // right key, right domain, WRONG flow
  const cb = await request(s.port, 'GET', `/api/auth/google/callback?code=abc&state=${second.state}`,
    { headers: withFlow(second.flow) });
  assert.equal(cb.location, '/?error=not_authorised');
  assert.equal(cookieValue(cb.cookies, 'crm_session'), null);
});

test('Google failing at the token endpoint is a refusal, not a crash', async (t) => {
  const s = await rig(t);
  const f = await beginFlow(s.port);
  s.fake.state.tokenStatus = 400;
  const cb = await request(s.port, 'GET', `/api/auth/google/callback?code=abc&state=${f.state}`,
    { headers: withFlow(f.flow) });
  assert.equal(cb.location, '/?error=not_authorised');
});

test('every sign-in decision is written to the log, with a bounded code', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-google-'));
  const file = await seededDb(dir);
  const fake = await startFakeGoogle();
  const s = await startServer({ CRM_DB: file, CRM_AUTH: '1', CRM_SESSION_SECRET: SECRET,
    GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: CLIENT_SECRET,
    GOOGLE_REDIRECT_URI: 'http://127.0.0.1/api/auth/google/callback',
    CRM_GOOGLE_TOKEN_URL: `http://127.0.0.1:${fake.port}/token`,
    CRM_GOOGLE_JWKS_URL: `http://127.0.0.1:${fake.port}/certs` });
  t.after(() => {
    try { s.child.kill(); } catch {}
    try { fake.server.close(); } catch {}
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  const good = await beginFlow(s.port);
  fake.state.idToken = mintToken({ nonce: good.nonce });
  await request(s.port, 'GET', `/api/auth/google/callback?code=abc&state=${good.state}`,
    { headers: withFlow(good.flow) });

  const bad = await beginFlow(s.port);
  fake.state.idToken = mintToken({ nonce: bad.nonce, email: 'nobody@novikontas.org' });
  await request(s.port, 'GET', `/api/auth/google/callback?code=abc&state=${bad.state}`,
    { headers: withFlow(bad.flow) });

  s.child.kill();
  await new Promise((r) => setTimeout(r, 300));
  const db = await openDb(file);
  const rows = await db.prepare('SELECT email, method, outcome FROM crm_login_attempt ORDER BY id').all();
  assert.ok(rows.some((r) => r.outcome === 'success_google' && r.email === 'ritvars@novikontas.org'));
  assert.ok(rows.some((r) => r.outcome === REASON.NO_ACCOUNT && r.email === 'nobody@novikontas.org'));
  // NOTHING sensitive may reach this table.
  const text = JSON.stringify(rows);
  assert.equal(text.includes(CLIENT_SECRET), false);
  assert.equal(text.includes('eyJ'), false, 'no JWT may be logged');
});

// ============================================ when Google is NOT configured

test('WITH NO CREDENTIALS, THE BUTTON IS NOT OFFERED AND NOTHING PRETENDS', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-google-'));
  const file = await seededDb(dir);
  const s = await startServer({ CRM_DB: file, CRM_AUTH: '1', CRM_SESSION_SECRET: SECRET });
  t.after(() => {
    try { s.child.kill(); } catch {}
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  const me = await request(s.port, 'GET', '/api/auth/me');
  assert.equal(me.json.google, false, 'the page must not draw a button for a flow that cannot run');
  assert.deepEqual(me.json.googleMissing, GOOGLE_ENV);

  const start = await request(s.port, 'GET', '/api/auth/google/start');
  assert.equal(start.status, 503);
  assert.equal(start.json.error, 'google_not_configured');
  assert.deepEqual(start.json.missing, GOOGLE_ENV);
});

test('the names of the settings are given and no value ever is', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-google-'));
  const file = await seededDb(dir);
  const s = await startServer({ CRM_DB: file, CRM_AUTH: '1', CRM_SESSION_SECRET: SECRET,
    GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: CLIENT_SECRET,
    GOOGLE_REDIRECT_URI: 'http://127.0.0.1/api/auth/google/callback' });
  t.after(() => {
    try { s.child.kill(); } catch {}
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });
  const me = await request(s.port, 'GET', '/api/auth/me');
  assert.equal(me.json.google, true);
  assert.equal(me.text.includes(CLIENT_SECRET), false, 'THE CLIENT SECRET WAS SENT TO THE BROWSER');
  assert.equal(me.text.includes(SECRET), false);
  // The client id is not a secret, but there is no reason for it to be here either.
  assert.equal(me.text.includes(CLIENT_ID), false);
});

test('Google sign-in is refused outright when sign-in itself is off', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-google-'));
  const file = await seededDb(dir);
  const s = await startServer({ CRM_DB: file,
    GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: CLIENT_SECRET,
    GOOGLE_REDIRECT_URI: 'http://127.0.0.1/api/auth/google/callback' });
  t.after(() => {
    try { s.child.kill(); } catch {}
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });
  assert.equal((await request(s.port, 'GET', '/api/auth/google/start')).status, 400);
  assert.equal((await request(s.port, 'GET', '/api/auth/google/callback?code=a&state=b')).status, 400);
});

// ============================================== the header still cannot bypass

test('x-acting-as STILL cannot bypass sign-in, Google or not', async (t) => {
  const s = await rig(t);
  // /api/auth/me is open before sign-in - it is how the page finds out there is
  // nobody signed in - so it answers 200 with a null user rather than refusing.
  const me = await request(s.port, 'GET', '/api/auth/me', { headers: { 'x-acting-as': 'Ritvars' } });
  assert.equal(me.status, 200);
  assert.equal(me.json.user, null);

  // Everything else answers 401. This asserted 403 when the API had no sign-in
  // door on it, so the header reached the admin check and was turned away there.
  for (const p of ['/api/admin/channels', '/api/people', '/api/config']) {
    const r = await request(s.port, 'GET', p, { headers: { 'x-acting-as': 'Ritvars' } });
    assert.equal(r.status, 401, `${p} answered ${r.status}`);
  }
});

test('a Google session is a real session everywhere, not just on the Channels screen', async (t) => {
  // The gate must recognise a session issued by the Google route exactly as it
  // recognises one issued by the password route. If it only understood one, half
  // the people who signed in would find the CRM empty.
  const s = await rig(t);
  const f = await beginFlow(s.port);
  s.fake.state.idToken = mintToken({ nonce: f.nonce, email: 'ritvars@novikontas.org' });
  const cb = await request(s.port, 'GET', `/api/auth/google/callback?code=abc&state=${f.state}`,
    { headers: withFlow(f.flow) });
  const session = cookieValue(cb.cookies, 'crm_session');
  const headers = { cookie: `crm_session=${session}` };

  for (const p of ['/api/people', '/api/tasks', '/api/config', '/api/whoami', '/api/admin/channels']) {
    const r = await request(s.port, 'GET', p, { headers });
    assert.equal(r.status, 200, `${p} answered ${r.status} to a signed-in admin`);
  }
});

test('Google is the only way in: a correct password is refused', async (t) => {
  // Aigars, 28.09.2026. The account has a password hash from before; it opens nothing.
  const s = await rig(t);
  const r = await request(s.port, 'POST', '/api/auth/login',
    { body: { email: 'ritvars@novikontas.org', password: 'a-long-enough-password-here' } });
  assert.equal(r.status, 410);
  assert.equal(cookieValue(r.cookies, 'crm_session'), null, 'no session is issued');
});

test('signing out clears a Google session the same as any other', async (t) => {
  const s = await rig(t);
  const f = await beginFlow(s.port);
  s.fake.state.idToken = mintToken({ nonce: f.nonce });
  const cb = await request(s.port, 'GET', `/api/auth/google/callback?code=abc&state=${f.state}`,
    { headers: withFlow(f.flow) });
  const session = cookieValue(cb.cookies, 'crm_session');
  const out = await request(s.port, 'POST', '/api/auth/logout', { headers: { cookie: `crm_session=${session}` } });
  assert.match([].concat(out.cookies).join('; '), /Max-Age=0/);
});

// ================================ the management report as a Google Sheet
// 28.09.2026: "Download for management review should be ... also ... google sheets".
// A new sheet in the signed-in person's OWN Drive, made through the one registered
// callback. These prove the extra permission is only drive.file, that Google must
// answer for the person signed in to the CRM, and that every failure says why.

// Signed in through Google itself, against the fake Google.
async function signedIn(port) {
  const f = await beginFlow(port);
  const fake = RIG_FAKE.get(port);
  fake.state.idToken = mintToken({ nonce: f.nonce });
  const cb = await request(port, 'GET', `/api/auth/google/callback?code=abc&state=${f.state}`, { headers: withFlow(f.flow) });
  assert.equal(cb.status, 303);
  return cookieValue(cb.cookies, 'crm_session');
}
async function beginSheet(port, session) {
  const r = await request(port, 'GET', '/api/report.gsheet?from=2026-01-01&to=2026-12-31&sections=summary,trend',
    { headers: { cookie: `crm_session=${session}` } });
  assert.equal(r.status, 302, 'it goes to Google');
  const flow = decodeURIComponent(cookieValue(r.cookies, 'crm_oauth'));
  const body = JSON.parse(Buffer.from(flow.split('.')[0], 'base64url').toString('utf8'));
  return { flow, state: body.state, nonce: body.nonce, body, to: new URL(r.location) };
}
const both = (session, flow) => ({ cookie: `crm_session=${session}; crm_oauth=${encodeURIComponent(flow)}` });

test('Google Sheets asks only for drive.file and makes the sheet in the signed-in person\'s Drive', async (t) => {
  const s = await rig(t);
  const session = await signedIn(s.port);
  const f = await beginSheet(s.port, session);
  assert.equal(f.to.searchParams.get('scope'), 'openid email https://www.googleapis.com/auth/drive.file');
  assert.equal(f.to.searchParams.get('login_hint'), 'ritvars@novikontas.org');
  assert.equal(f.to.searchParams.get('hd'), HOSTED_DOMAIN);
  assert.equal(f.to.searchParams.get('redirect_uri'), 'http://127.0.0.1/api/auth/google/callback', 'the one registered callback');
  assert.equal(f.body.purpose, 'sheet');
  assert.deepEqual(f.body.want, { from: '2026-01-01', to: '2026-12-31', sections: ['summary', 'trend'] });

  s.fake.state.idToken = mintToken({ nonce: f.nonce });
  s.fake.state.accessToken = 'at-for-the-sheet';
  s.fake.state.scope = 'openid email https://www.googleapis.com/auth/drive.file';
  const cb = await request(s.port, 'GET', `/api/auth/google/callback?code=abc&state=${f.state}`, { headers: both(session, f.flow) });
  assert.equal(cb.status, 303);
  assert.equal(cb.location, 'https://docs.google.com/spreadsheets/d/sheet123/edit', 'straight to the new sheet');
  assert.match([].concat(cb.cookies).join('; '), /crm_oauth=;/, 'the flow cookie is cleared');
  assert.equal(cookieValue(cb.cookies, 'crm_session'), null, 'and no new sign-in session is issued');

  const up = s.fake.state.uploads[0];
  assert.equal(up.headers.authorization, 'Bearer at-for-the-sheet');
  assert.match(up.headers['content-type'], /^multipart\/related; boundary=/);
  const text = up.body.toString('latin1');
  assert.match(text, /"mimeType":"application\/vnd.google-apps.spreadsheet"/, 'Drive converts it into a Google Sheet');
  assert.match(text, /"name":"Academy CRM report 2026-01-01 to 2026-12-31 \(made \d{4}-\d{2}-\d{2}\)"/);
  assert.ok(up.body.includes(Buffer.from('PK')), 'the file sent is a zip, the .xlsx');
});

test('no sheet is made when Google answers for a different account', async (t) => {
  const s = await rig(t);
  const session = await signedIn(s.port);
  const f = await beginSheet(s.port, session);
  s.fake.state.idToken = mintToken({ nonce: f.nonce, email: 'ieva@novikontas.org' });
  s.fake.state.accessToken = 'at-x';
  const cb = await request(s.port, 'GET', `/api/auth/google/callback?code=abc&state=${f.state}`, { headers: both(session, f.flow) });
  assert.equal(cb.location, '/?sheet=wrong_account#/reports');
  assert.equal((s.fake.state.uploads || []).length, 0, 'nothing reached Drive');
});

test('a Google Sheets export that fails says why, and never as a sign-in refusal', async (t) => {
  const s = await rig(t);
  const session = await signedIn(s.port);
  // the person said no on Google's screen
  let f = await beginSheet(s.port, session);
  let cb = await request(s.port, 'GET', `/api/auth/google/callback?error=access_denied&state=${f.state}`, { headers: both(session, f.flow) });
  assert.equal(cb.location, '/?sheet=declined#/reports');
  // the Google Drive API is not switched on in the Cloud project
  f = await beginSheet(s.port, session);
  s.fake.state.idToken = mintToken({ nonce: f.nonce });
  s.fake.state.accessToken = 'at-y';
  s.fake.state.uploadStatus = 403;
  s.fake.state.uploadBody = JSON.stringify({ error: { code: 403, errors: [{ reason: 'accessNotConfigured' }],
    message: 'Google Drive API has not been used in project 1 before or it is disabled.' } });
  cb = await request(s.port, 'GET', `/api/auth/google/callback?code=abc&state=${f.state}`, { headers: both(session, f.flow) });
  assert.equal(cb.location, '/?sheet=drive_api_disabled#/reports');
  // signed out in between: nothing is made for nobody
  f = await beginSheet(s.port, session);
  cb = await request(s.port, 'GET', `/api/auth/google/callback?code=abc&state=${f.state}`, { headers: withFlow(f.flow) });
  assert.equal(cb.location, '/?sheet=wrong_account#/reports');
});

test('Google Sheets cannot be started by somebody who is not signed in', async (t) => {
  const s = await rig(t);
  const r = await request(s.port, 'GET', '/api/report.gsheet');
  assert.equal(r.status, 401);
});
