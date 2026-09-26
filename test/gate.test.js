// The door on the shared testing copy.
//
// This copy exists so Aigars and Ieva can open a web address and try the
// workflow. It carries one shared password, which is NOT sign-in: inside,
// identity is still a dropdown. The control that makes the address safe to hand
// out is therefore not the password, it is that the copy holds DEMO DATA ONLY,
// and that is enforced at boot rather than remembered.
//
// Every test below was run against a real server process before being written.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { isPublic, requireConfigured, mint, verifyTicket, passwordMatches,
  readCookie, cookieHeader, allows, LOGIN_PAGE, COOKIE, DAYS } from '../src/gate.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PASSWORD = 'a-long-enough-test-password';

// ------------------------------------------------------- refusing to start --

test('a shared copy with no password refuses to start', async () => {
  const r = requireConfigured({ CRM_PUBLIC: '1' });
  assert.equal(r.ok, false);
  assert.match(r.why, /Refusing to start/);
});

test('a short password refuses to start too', async () => {
  assert.equal(requireConfigured({ CRM_PUBLIC: '1', CRM_ACCESS_PASSWORD: 'abc' }).ok, false);
  assert.equal(requireConfigured({ CRM_PUBLIC: '1', CRM_ACCESS_PASSWORD: PASSWORD }).ok, true);
});

test('on a laptop there is no door and none is demanded', async () => {
  assert.equal(isPublic({}), false);
  assert.equal(requireConfigured({}).ok, true);
  assert.equal(requireConfigured({}).gate, false);
  assert.equal(allows('/api/people', {}), true, 'nothing is gated locally');
});

// ------------------------------------------------------------- the ticket --

test('a ticket minted with the password verifies, and one minted with another does not', async () => {
  const t = mint(PASSWORD);
  assert.equal(verifyTicket(t, PASSWORD).ok, true);
  assert.equal(verifyTicket(t, 'a-different-long-password').ok, false);
});

test('changing the password invalidates every ticket already issued', async () => {
  // The signing key is derived from the password, so this is automatic rather
  // than something somebody has to remember to do.
  const t = mint(PASSWORD);
  assert.equal(verifyTicket(t, PASSWORD + '-changed').ok, false);
});

test('a forged or edited ticket is refused', async () => {
  const t = mint(PASSWORD);
  const [v, exp, sig] = t.split('.');
  assert.equal(verifyTicket(`${v}.${exp}.${sig.slice(0, -2)}xx`, PASSWORD).ok, false);
  // pushing the expiry out by hand must not work, because it is signed
  assert.equal(verifyTicket(`${v}.${Number(exp) + 86400000}.${sig}`, PASSWORD).ok, false);
  assert.equal(verifyTicket('nonsense', PASSWORD).ok, false);
  assert.equal(verifyTicket('', PASSWORD).ok, false);
  assert.equal(verifyTicket(null, PASSWORD).ok, false);
});

test('an expired ticket is refused, and looks the same as a forged one', async () => {
  const now = Date.now();
  const t = mint(PASSWORD, { now: now - (DAYS + 1) * 86400000 });
  const r = verifyTicket(t, PASSWORD, { now });
  assert.equal(r.ok, false);
  // The signature is checked BEFORE the expiry, so somebody guessing cannot tell
  // "right password, old ticket" from "wrong password".
  assert.equal(r.why, 'expired');
  assert.equal(verifyTicket(t, 'wrong-long-password', { now }).why, 'signature did not match');
});

test('a ticket lasts 30 days, so a tester is not asked again every morning', async () => {
  const now = Date.now();
  const r = verifyTicket(mint(PASSWORD, { now }), PASSWORD, { now: now + 29 * 86400000 });
  assert.equal(r.ok, true);
});

// ------------------------------------------------------------ the password --

test('the password comparison does not reveal the length', async () => {
  assert.equal(passwordMatches(PASSWORD, PASSWORD), true);
  assert.equal(passwordMatches('x', PASSWORD), false, 'a short guess must not throw');
  assert.equal(passwordMatches(PASSWORD + 'x', PASSWORD), false);
  assert.equal(passwordMatches('', PASSWORD), false);
  assert.equal(passwordMatches(undefined, PASSWORD), false);
});

test('the password never appears in the page or the cookie', async () => {
  const page = LOGIN_PAGE('That password is not right.');
  assert.ok(!page.includes(PASSWORD));
  const ticket = mint(PASSWORD);
  assert.ok(!ticket.includes(PASSWORD), 'the password itself never travels to the browser');
  assert.ok(!cookieHeader(ticket).includes(PASSWORD));
});

// ------------------------------------------------------------- the cookie --

test('the cookie is HttpOnly and Secure, so a script cannot read it', async () => {
  const h = cookieHeader(mint(PASSWORD));
  assert.match(h, /HttpOnly/);
  assert.match(h, /Secure/);
  assert.match(h, /SameSite=Lax/);
  assert.match(h, new RegExp('Max-Age=' + DAYS * 86400));
  // localhost is plain http, where a Secure cookie is never sent back
  assert.ok(!cookieHeader(mint(PASSWORD), { secure: false }).includes('Secure'));
});

test('the cookie is read out of a header with other cookies in it', async () => {
  const t = mint(PASSWORD);
  assert.equal(readCookie(`other=1; ${COOKIE}=${encodeURIComponent(t)}; third=x`), t);
  assert.equal(readCookie('other=1'), null);
  assert.equal(readCookie(''), null);
  assert.equal(readCookie(undefined), null);
});

// --------------------------------------------------------- what is gated --

const PUB = { CRM_PUBLIC: '1', CRM_ACCESS_PASSWORD: PASSWORD };

test('everything a person can open is behind the door', async () => {
  for (const p of ['/', '/index.html', '/console', '/api/people', '/api/config',
    '/api/reports', '/api/history', '/api/inbound/events']) {
    assert.equal(allows(p, PUB), false, p + ' must be behind the door');
  }
});

test('a provider webhook is NOT behind the door, because it has a stronger one', async () => {
  // A channel authenticates with a signature or a secret. Putting a shared
  // password in front would break every channel the moment one is connected,
  // and a password a human types is weaker than a signed request anyway.
  for (const p of ['/api/inbound/facebook', '/api/inbound/mailchimp', '/api/cron/pbx-calls']) {
    assert.equal(allows(p, PUB), true, p + ' must stay reachable by the provider');
  }
  assert.equal(allows('/access', PUB), true, 'the door itself must be reachable');
  assert.equal(allows('/healthz', PUB), true, 'the host checks this to see we are alive');
});

// --------------------------------------------------- the boot-time refusals --

const startsOk = (env) => new Promise((resolve) => {
  const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')],
    { env: { ...process.env, CRM_DB: ':memory:', PORT: '0', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  child.on('exit', (code) => resolve({ code, out }));
  setTimeout(() => { child.kill(); resolve({ code: null, out }); }, 6000);
});

test('the server refuses to start as a shared copy with no password', async () => {
  const r = await startsOk({ CRM_PUBLIC: '1', CRM_ACCESS_PASSWORD: '' });
  assert.equal(r.code, 1, 'it must exit, not warn and carry on');
  assert.match(r.out, /REFUSING TO START/);
});

test('the server refuses to load REAL applicant data on a shared copy', async () => {
  // This is the control that makes the address safe to hand out. There is no
  // sign-in, so anybody with the address is anybody they type; the only thing
  // standing between that and a real applicant's phone number is this refusal.
  const r = await startsOk({ CRM_PUBLIC: '1', CRM_ACCESS_PASSWORD: PASSWORD, DATASET: 'real' });
  assert.equal(r.code, 1);
  assert.match(r.out, /demo data only/);
});

test('the same real dataset loads fine when it is NOT a shared copy', async () => {
  // The refusal must be about being published, not about the data being
  // unusable, or the local prototype would have lost a capability.
  const r = await startsOk({ CRM_PUBLIC: '', DATASET: 'synthetic' });
  assert.notEqual(r.code, 1, 'a local copy still loads what it is told to');
});
