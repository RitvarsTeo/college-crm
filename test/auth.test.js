// Sign-in.
//
// The prototype's identity was a dropdown and an `x-acting-as` header: the
// browser said who it was and the server believed it, which meant every history
// entry, every admin screen and every "who did this" was self-declared.
//
// This suite is written the way the rest of this repository is written: a guard
// is not trusted because the code looks right, it is trusted because there is a
// test that breaks it and watches it refuse. Every test below states what would
// be possible if the line it covers were deleted.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { hashPassword, verifyPassword, parseHash, issueSession, readSession,
  cookieHeader, clearCookie, readCookie, authenticate, canonicalEmail, normalizeEmail,
  passwordProblem, canSeeChannels, canTestChannels, canEnableChannel, authOn,
  requireConfigured, ROLES, COOKIE, MIN_PASSWORD, SCRYPT } from '../src/auth.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SECRET = 'a-session-secret-long-enough-to-be-accepted';
const PASSWORD = 'correct horse battery staple';

// A deliberately cheap scrypt for the tests. The real parameters are used by the
// two tests that check the stored format, and nowhere else, or this suite would
// spend its whole life hashing.
const FAST = { ...SCRYPT, N: 1024 };

// ------------------------------------------------------------- the hashing --

test('a password round-trips, and a wrong one does not', () => {
  const stored = hashPassword(PASSWORD, FAST);
  assert.equal(verifyPassword(PASSWORD, stored), true);
  assert.equal(verifyPassword(PASSWORD + '!', stored), false);
  assert.equal(verifyPassword('', stored), false);
});

test('the plain password is nowhere in what gets stored', () => {
  // The whole point of storing a hash. If this ever fails, a copy of the
  // database is a copy of everybody's password.
  const stored = hashPassword(PASSWORD, FAST);
  assert.equal(stored.includes(PASSWORD), false);
  assert.equal(stored.includes('horse'), false);
});

test('the same password hashes differently every time', () => {
  // A per-password salt. Without it, two people who chose the same password
  // would be visibly identical in the table, and one rainbow table would do.
  assert.notEqual(hashPassword(PASSWORD, FAST), hashPassword(PASSWORD, FAST));
});

test('the stored format carries its version and parameters', () => {
  // So that when these parameters are one day too weak, a version 2 can be added
  // and nobody is locked out of their account.
  const stored = hashPassword(PASSWORD, FAST);
  const [tag, version, N, r, p] = stored.split('$');
  assert.equal(tag, 'scrypt');
  assert.equal(version, '1');
  assert.equal(Number(N), FAST.N);
  assert.equal(Number(r), FAST.r);
  assert.equal(Number(p), FAST.p);
  const parsed = parseHash(stored);
  assert.equal(parsed.N, FAST.N);
});

test('rubbish in the password column is refused rather than throwing', () => {
  // A half-written row, a hand-edited database, a column from another system.
  for (const junk of ['', null, undefined, 'plaintext', 'scrypt$9$1$1$1$a$b', 'a$b$c', {}]) {
    assert.equal(verifyPassword(PASSWORD, junk), false, String(junk) + ' must not verify');
  }
});

// ------------------------------------------------------------- the session --

test('a session round-trips and carries the identity and the role', () => {
  const t = issueSession({ id: 'u1', email: 'ieva@novikontas.org', name: 'Ieva', role: 'user',
    sessionVersion: 3 }, SECRET);
  const s = readSession(t, SECRET);
  assert.equal(s.email, 'ieva@novikontas.org');
  assert.equal(s.name, 'Ieva');
  assert.equal(s.role, 'user');
  assert.equal(s.sessionVersion, 3);
});

test('a session signed with another secret is refused', () => {
  const t = issueSession({ email: 'ieva@novikontas.org', role: 'user' }, SECRET);
  assert.equal(readSession(t, 'a-completely-different-session-secret'), null);
});

test('EDITING the role inside a session invalidates it', () => {
  // The attack this exists for: sign in as a user, change "user" to "admin" in
  // the cookie, reload, and read everybody's channel configuration. The role is
  // inside the signed region, so the signature stops matching.
  const t = issueSession({ email: 'ieva@novikontas.org', role: 'user' }, SECRET);
  const [tag, payload, sig] = t.split('.');
  const body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  assert.equal(body.ro, 'user');
  body.ro = 'admin';
  const forged = `${tag}.${Buffer.from(JSON.stringify(body)).toString('base64url')}.${sig}`;
  assert.equal(readSession(forged, SECRET), null, 'an edited role must not be accepted');
});

test('a session with no signature at all is refused', () => {
  const t = issueSession({ email: 'ieva@novikontas.org', role: 'user' }, SECRET);
  const [tag, payload] = t.split('.');
  assert.equal(readSession(`${tag}.${payload}.`, SECRET), null);
  assert.equal(readSession(`${tag}.${payload}`, SECRET), null);
});

test('an expired session is refused even though it is correctly signed', () => {
  const t = issueSession({ email: 'ieva@novikontas.org', role: 'user' }, SECRET, -1);
  assert.equal(readSession(t, SECRET), null);
});

test('a session naming a role that does not exist is refused', () => {
  // Belt and braces: a role removed from the code later must not keep working
  // because somebody's old cookie still names it.
  assert.throws(() => issueSession({ email: 'x@y.lv', role: 'superuser' }, SECRET));
});

test('a session cannot be issued without an identity, a role or a secret', () => {
  assert.throws(() => issueSession({ role: 'user' }, SECRET), /identity or role/);
  assert.throws(() => issueSession({ email: 'x@y.lv' }, SECRET), /identity or role/);
  assert.throws(() => issueSession({ email: 'x@y.lv', role: 'user' }, ''), /unsigned/);
});

test('rubbish where a session should be is refused rather than throwing', () => {
  for (const junk of [null, undefined, '', 'x', 'a.b.c', 'c1.!!!.zzz', 42, {}]) {
    assert.equal(readSession(junk, SECRET), null, String(junk));
  }
});

// -------------------------------------------------------------- the cookie --

test('the cookie is HttpOnly and SameSite, and Secure off localhost', () => {
  // HttpOnly is what stops a script on the page reading the session. It is not
  // decoration: without it, one injected script is everybody's account.
  const h = cookieHeader('token-value');
  assert.match(h, /HttpOnly/);
  assert.match(h, /SameSite=Lax/);
  assert.match(h, /Secure/);
  assert.equal(/Secure/.test(cookieHeader('t', { secure: false })), false,
    'a Secure cookie is never sent over plain http, so localhost needs it off');
});

test('signing out sends a cookie that expires immediately', () => {
  assert.match(clearCookie(), new RegExp(`${COOKIE}=; `));
  assert.match(clearCookie(), /Max-Age=0/);
});

test('the cookie is found among others and is not confused with a similar name', () => {
  assert.equal(readCookie(`theme=dark; ${COOKIE}=abc; other=1`), 'abc');
  assert.equal(readCookie(`not_${COOKIE}=abc`), null);
  assert.equal(readCookie(''), null);
  assert.equal(readCookie(undefined), null);
});

// ----------------------------------------------------------- the decision --

const rowFor = (over = {}) => ({ id: 'u1', email: 'ieva@novikontas.org', display_name: 'Ieva',
  password_hash: hashPassword(PASSWORD, FAST), role: 'user', active: 1, session_version: 0, ...over });

test('the right password signs in and the wrong one does not', async () => {
  const lookup = async () => rowFor();
  assert.equal((await authenticate({ email: 'ieva', password: PASSWORD }, lookup)).ok, true);
  assert.equal((await authenticate({ email: 'ieva', password: 'nope' }, lookup)).ok, false);
});

test('a missing account and a wrong password answer identically', async () => {
  // Otherwise the login page is a tool for finding out who works here.
  const missing = await authenticate({ email: 'nobody', password: PASSWORD }, async () => null);
  const wrong = await authenticate({ email: 'ieva', password: 'nope' }, async () => rowFor());
  assert.deepEqual(missing, wrong);
  assert.equal(missing.reason, 'invalid_credentials');
});

test('an account with no password set can never sign in', async () => {
  // `seed` creates accounts with password_hash NULL on purpose. If an empty
  // password matched an empty hash, seeding would create eight open doors.
  const lookup = async () => rowFor({ password_hash: null });
  for (const attempt of ['', PASSWORD, 'null', 'undefined']) {
    assert.equal((await authenticate({ email: 'ieva', password: attempt }, lookup)).ok, false);
  }
});

test('an empty password is refused before anything is looked up', async () => {
  let looked = false;
  const lookup = async () => { looked = true; return rowFor(); };
  assert.equal((await authenticate({ email: 'ieva', password: '' }, lookup)).ok, false);
  assert.equal(looked, false);
});

test('a disabled account is refused even with the right password', async () => {
  const r = await authenticate({ email: 'ieva', password: PASSWORD },
    async () => rowFor({ active: 0 }));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'account_disabled');
});

test('an account carrying a role we do not recognise is refused', async () => {
  const r = await authenticate({ email: 'ieva', password: PASSWORD },
    async () => rowFor({ role: 'superuser' }));
  assert.equal(r.ok, false);
});

test('the email is canonicalised, so Ieva and IEVA@ are the same account', async () => {
  const seen = [];
  const lookup = async (e) => { seen.push(e); return rowFor(); };
  await authenticate({ email: '  IEVA  ', password: PASSWORD }, lookup);
  await authenticate({ email: 'Ieva@Novikontas.ORG', password: PASSWORD }, lookup);
  assert.deepEqual(seen, ['ieva@novikontas.org', 'ieva@novikontas.org']);
});

test('canonicalEmail leaves a foreign address alone', () => {
  assert.equal(canonicalEmail('somebody@gmail.com'), 'somebody@gmail.com');
  assert.equal(canonicalEmail('marina'), 'marina@novikontas.org');
  assert.equal(canonicalEmail(''), '');
  assert.equal(normalizeEmail(null), '');
});

// ------------------------------------------------------------------ roles --

test('only an admin may see, test or enable a channel', () => {
  assert.deepEqual(ROLES, ['admin', 'user']);
  for (const fn of [canSeeChannels, canTestChannels, canEnableChannel]) {
    assert.equal(fn('admin'), true);
    assert.equal(fn('user'), false);
    assert.equal(fn(''), false);
    assert.equal(fn(undefined), false);
    assert.equal(fn('Admin'), false, 'the check is exact, not case-insensitive');
  }
});

// -------------------------------------------------------- password policy --

test('a short password is refused, and the message says what is needed', () => {
  assert.match(passwordProblem('short'), new RegExp(String(MIN_PASSWORD)));
  assert.equal(passwordProblem('a-long-enough-passphrase'), null);
});

test('a long password made of two characters is still refused', () => {
  assert.match(passwordProblem('abababababababab'), /different characters/);
});

test('a password containing your own name or an obvious word is refused', () => {
  assert.match(passwordProblem('novikontas-2026-crm'), /novikontas/);
  assert.match(passwordProblem('my-password-here-12'), /password/);
  assert.match(passwordProblem('ieva-is-the-best-1', { email: 'ieva@novikontas.org' }), /your own name/);
  assert.match(passwordProblem('marina-rules-2026', { name: 'Marina' }), /your own name/);
});

// ------------------------------------------------- refusing to start badly --

test('authentication is off unless it is switched on', () => {
  assert.equal(authOn({}), false);
  assert.equal(authOn({ CRM_AUTH: '0' }), false);
  assert.equal(authOn({ CRM_AUTH: 'no' }), false);
  assert.equal(authOn({ CRM_AUTH: '1' }), true);
  assert.equal(authOn({ CRM_AUTH: 'true' }), true);
});

test('with sign-in on and no session secret, the server must refuse to start', () => {
  const r = requireConfigured({ CRM_AUTH: '1' });
  assert.equal(r.ok, false);
  assert.match(r.why, /CRM_SESSION_SECRET/);
});

test('a short session secret is refused too', () => {
  assert.equal(requireConfigured({ CRM_AUTH: '1', CRM_SESSION_SECRET: 'tooshort' }).ok, false);
  assert.equal(requireConfigured({ CRM_AUTH: '1', CRM_SESSION_SECRET: SECRET }).ok, true);
});

test('with sign-in off, nothing is demanded', () => {
  assert.deepEqual(requireConfigured({}), { ok: true, auth: false });
});

// ======================================================================
// Against a real server process. Nothing below is a unit test: each one
// starts src/server.js and talks to it over http.
// ======================================================================

function startServer(env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')],
      { env: { ...process.env, CRM_DB: ':memory:', PORT: '0', CRM_INSECURE_COOKIE: '1',
        CRM_PUBLIC: '', DATASET: 'empty', ...env },
        stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const done = (fn, arg) => { clearTimeout(timer); fn(arg); };
    const timer = setTimeout(() => { child.kill(); reject(new Error('the server never started: ' + out)); }, 15000);
    child.stdout.on('data', (d) => {
      out += d;
      // The boot line is read for ERRORS FIRST. A port already in use used to be
      // swallowed and a stale server answered in its place.
      if (/REFUSING TO START|Error/.test(out)) { child.kill(); return done(reject, new Error(out)); }
      const m = out.match(/http:\/\/localhost:(\d+)/);
      if (m) done(resolve, { child, port: Number(m[1]), out: () => out });
    });
    child.stderr.on('data', (d) => { out += d; });
    child.on('exit', () => done(reject, new Error('the server exited: ' + out)));
  });
}

function request(port, method, path, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, method, path,
      headers: { ...(payload ? { 'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload) } : {}), ...headers } },
      (res) => {
        let text = '';
        res.on('data', (d) => { text += d; });
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(text); } catch {}
          resolve({ status: res.statusCode, headers: res.headers, text, json,
            cookie: [].concat(res.headers['set-cookie'] || []).join('; ') });
        });
      });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const AUTH_ENV = { CRM_AUTH: '1', CRM_SESSION_SECRET: SECRET };

test('the server exits rather than starting with sign-in on and no secret', async () => {
  await assert.rejects(() => startServer({ CRM_AUTH: '1', CRM_SESSION_SECRET: '' }),
    /REFUSING TO START/);
});

test('with sign-in on, an unauthenticated request is nobody', async (t) => {
  const s = await startServer(AUTH_ENV);
  t.after(() => s.child.kill());
  const me = await request(s.port, 'GET', '/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.json.auth, true);
  assert.equal(me.json.user, null);
});

test('THE HEADER IS IGNORED: x-acting-as cannot make you an admin', async (t) => {
  // This is the whole reason the login exists. Before it, this request was a
  // successful one, and the Channels panel would have been handed over.
  const s = await startServer(AUTH_ENV);
  t.after(() => s.child.kill());
  const r = await request(s.port, 'GET', '/api/admin/channels',
    { headers: { 'x-acting-as': 'Ritvars' } });
  // 401, not 403. This asserted 403 while the API had no sign-in door on it at
  // all, so the header reached the admin check and was turned away there. Now it
  // is turned away one step earlier, for the better reason: nobody is signed in.
  assert.equal(r.status, 401);
  assert.equal(r.json.error, 'not signed in');
  assert.equal(r.text.includes('META_APP_SECRET'), false, 'and no channel data comes back');

  const me = await request(s.port, 'GET', '/api/auth/me', { headers: { 'x-acting-as': 'Ritvars' } });
  assert.equal(me.json.user, null, 'the header must not identify anybody at all');
});

test('THE HEADER OPENS NOTHING ELSE EITHER', async (t) => {
  // The header used to be the identity, so every route believed it. With sign-in
  // on, a request carrying it and no session must get nothing anywhere - not just
  // on the admin screens.
  const s = await startServer(AUTH_ENV);
  t.after(() => s.child.kill());
  for (const p of ['/api/people', '/api/tasks', '/api/reports', '/api/config',
    '/api/whoami', '/api/connections', '/api/inbound/events']) {
    const r = await request(s.port, 'GET', p, { headers: { 'x-acting-as': 'Ritvars' } });
    assert.equal(r.status, 401, `${p} answered ${r.status} to an unauthenticated caller`);
  }
});

test('whoami never invents an identity when nobody is signed in', async (t) => {
  // It used to fall back to the first name in the config, so an unauthenticated
  // caller was told it was Ieva - on the one route whose whole job is to say who
  // you are.
  const s = await startServer(AUTH_ENV);
  t.after(() => s.child.kill());
  const r = await request(s.port, 'GET', '/api/whoami');
  assert.equal(r.status, 401);
  assert.equal(r.text.includes('Ieva'), false, 'no name may be handed to a stranger');
});

test('a provider webhook still works with no session at all', async (t) => {
  // The other half of the door, and the half that breaks silently: a provider
  // proves itself with a signature, never with a cookie. If the sign-in door
  // closed over these paths, every channel would stop the moment one went live.
  const s = await startServer({ ...AUTH_ENV, META_VERIFY_TOKEN: 'fixture-verify-token' });
  t.after(() => s.child.kill());

  const ok = await request(s.port, 'GET',
    '/api/inbound/whatsapp?hub.mode=subscribe&hub.verify_token=fixture-verify-token&hub.challenge=ABC123');
  assert.equal(ok.status, 200, 'Meta could not verify the webhook');
  assert.equal(ok.text, 'ABC123', 'the challenge must come back exactly');

  // And a wrong token must be refused by the HANDSHAKE, not by the sign-in door,
  // or the door is sitting in front of a check it is hiding.
  const bad = await request(s.port, 'GET',
    '/api/inbound/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=ABC123');
  assert.equal(bad.status, 403);
  assert.match(bad.json.why, /verify token/);
});

test('the observability view is NOT treated as a channel and stays closed', async (t) => {
  // /api/inbound/events lives under the same prefix as the channel endpoints and
  // carries sender names and message bodies. A prefix match would publish it.
  const s = await startServer(AUTH_ENV);
  t.after(() => s.child.kill());
  assert.equal((await request(s.port, 'GET', '/api/inbound/events')).status, 401);
  assert.equal((await request(s.port, 'POST', '/api/inbound/website/simulate', { body: {} })).status, 401);
});

test('signing in with an account that does not exist is refused', async (t) => {
  const s = await startServer(AUTH_ENV);
  t.after(() => s.child.kill());
  const r = await request(s.port, 'POST', '/api/auth/login',
    { body: { email: 'nobody', password: 'whatever-long-enough' } });
  assert.equal(r.status, 401);
  assert.equal(r.headers['set-cookie'], undefined, 'a failed sign-in must not set a cookie');
});

test('sign-in is refused outright when it is not switched on', async (t) => {
  const s = await startServer({});
  t.after(() => s.child.kill());
  const r = await request(s.port, 'POST', '/api/auth/login',
    { body: { email: 'ieva', password: PASSWORD } });
  assert.equal(r.status, 400);
});

test('with sign-in OFF the old header still works, so nothing that exists broke', async (t) => {
  // The 346 tests written before this one all send x-acting-as. The header is
  // ignored only when sign-in is ON.
  const s = await startServer({});
  t.after(() => s.child.kill());
  const me = await request(s.port, 'GET', '/api/whoami', { headers: { 'x-acting-as': 'Ieva' } });
  assert.equal(me.status, 200);
  assert.equal(me.json.actor, 'Ieva');
  const ch = await request(s.port, 'GET', '/api/admin/channels', { headers: { 'x-acting-as': 'Ritvars' } });
  assert.equal(ch.status, 200);
  assert.equal(ch.json.identityIsProved, false,
    'and it must say out loud that this identity is not proved');
});

test('too many wrong passwords in a row start being refused', async (t) => {
  const s = await startServer(AUTH_ENV);
  t.after(() => s.child.kill());
  let sawLimit = false;
  for (let i = 0; i < 10; i += 1) {
    const r = await request(s.port, 'POST', '/api/auth/login',
      { body: { email: 'ieva', password: 'wrong-guess-' + i } });
    if (r.status === 429) { sawLimit = true; break; }
  }
  assert.equal(sawLimit, true, 'guessing must cost something');
});

test('signing out clears the cookie', async (t) => {
  const s = await startServer(AUTH_ENV);
  t.after(() => s.child.kill());
  const r = await request(s.port, 'POST', '/api/auth/logout');
  assert.equal(r.status, 200);
  assert.match(r.cookie, /Max-Age=0/);
});

// ======================================================================
// The accounts that may sign in.
//
// These pin one rule: AN ADDRESS IS NEVER DERIVED FROM A NAME. `seed` used to
// build first.last@novikontas.org out of a display name and produced
// ritvars@novikontas.org for somebody whose address is ritvars.vilcins@. With
// Google sign-in that is not cosmetic - the allowlist matches on the address, so
// the guessed row refuses the real person and lets nobody in at all.
// ======================================================================

const CONFIG = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));

test('every configured account is a real address with a real role', () => {
  assert.ok(Array.isArray(CONFIG.accounts) && CONFIG.accounts.length,
    'config/prototype.json must carry an accounts list');
  for (const a of CONFIG.accounts) {
    assert.match(a.email, /^[a-z0-9._-]+@novikontas\.org$/, `${a.email} is not a company address`);
    assert.equal(canonicalEmail(a.email), a.email, `${a.email} is not already canonical`);
    assert.ok(ROLES.includes(a.role), `${a.email} has role ${a.role}`);
    assert.ok(a.name && a.name.length > 1, `${a.email} has no display name`);
  }
});

test('NO ADDRESS IS DERIVED FROM A DISPLAY NAME', () => {
  // The exact shape of the bug, asserted directly: if somebody reinstates the
  // guess, the configured address and the guessed one stop matching.
  const guess = (name) => canonicalEmail(String(name).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z ]/g, '').trim().split(/\s+/).join('.'));

  const ritvars = CONFIG.accounts.find((a) => a.name === 'Ritvars');
  assert.ok(ritvars, 'Ritvars must have a configured address');
  assert.equal(ritvars.email, 'ritvars.vilcins@novikontas.org');
  assert.notEqual(ritvars.email, guess('Ritvars'),
    'the configured address must NOT be the one a name would produce');

  const aigars = CONFIG.accounts.find((a) => a.name === 'Aigars');
  assert.equal(aigars.email, 'aigars.kluga@novikontas.org');
  assert.notEqual(aigars.email, guess('Aigars'));
});

test('the three accounts that were asked for are all there', () => {
  const byEmail = Object.fromEntries(CONFIG.accounts.map((a) => [a.email, a]));
  assert.equal(byEmail['ritvars.vilcins@novikontas.org'].role, 'admin');
  assert.equal(byEmail['aigars.kluga@novikontas.org'].role, 'admin');
  assert.ok(byEmail['edu@novikontas.org'], 'the shared Admissions account must be able to sign in');
});

test('the shared Admissions account belongs to Ieva and Laura, and says so', () => {
  // edu@ is how Admissions works: Ieva and Laura both sign in with it. It is a
  // first-class way to use the CRM, and the config records WHO shares it so that
  // nobody reading the account list has to guess whose it is.
  const edu = CONFIG.accounts.find((a) => a.email === 'edu@novikontas.org');
  assert.equal(edu.name, 'Admissions');
  assert.equal(edu.shared, true);
  assert.deepEqual(edu.sharedBy, ['Ieva', 'Laura'],
    'the account list must name the people who share it');
});

test('the shared Admissions account is a user, like every other admissions seat', () => {
  // Not a restriction placed on Ieva and Laura: Channels is admin-only for
  // everybody, and admissions work needs no channel configuration. If this ever
  // flips to admin, Ieva and Laura gain the ability to switch a live provider on.
  const edu = CONFIG.accounts.find((a) => a.email === 'edu@novikontas.org');
  assert.equal(edu.role, 'user');
  assert.equal(canSeeChannels(edu.role), false);
  assert.equal(canEnableChannel(edu.role), false);
  assert.equal(canTestChannels(edu.role), false);
});

test('a company address that is not on the list still cannot sign in', () => {
  // Being at novikontas.org is not the qualification. Being listed is.
  const listed = new Set(CONFIG.accounts.map((a) => a.email));
  assert.equal(listed.has('somebody.else@novikontas.org'), false);
});
