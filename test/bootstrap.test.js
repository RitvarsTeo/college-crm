// Account provisioning on a database that forgets.
//
// THE FAULT THESE EXIST FOR, found on 25.09.2026 before it reached anybody:
// the Render testing copy runs on CRM_DB=/tmp/crm.db, which is gone on every
// restart. Demo people self-seed, so the service looks healthy - but crm_users
// is written only by a script nothing on the host runs. Switching CRM_AUTH on
// would have put a login screen in front of an empty table and locked Aigars
// and Ieva out of the copy they are meant to be testing.
//
// So the two things most of this file asserts are not "it creates accounts".
// They are: it NEVER creates an account it cannot give a password to, and it
// NEVER touches one that already exists.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { bootstrapAccounts, bootstrapIfAuthOn, checkAccountConfig, passwordEnvNames }
  from '../src/bootstrap.js';
import { openDb } from '../src/db.js';
import { verifyPassword, canonicalEmail } from '../src/auth.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
const ACCOUNTS = CONFIG.accounts;
const SECRET = 'a-session-secret-long-enough-to-be-accepted';

// Fixture values that announce themselves. Nothing here is anybody's password.
const PW = {
  CRM_RITVARS_PASSWORD: 'fixture-only-not-a-secret-R9',
  CRM_AIGARS_PASSWORD: 'fixture-only-not-a-secret-A7',
  CRM_ADMISSIONS_PASSWORD: 'fixture-only-not-a-secret-E4',
};

const freshDb = () => openDb(':memory:');

// ============================================================ configuration

test('every configured account names the variable its password comes from', () => {
  assert.deepEqual(passwordEnvNames(ACCOUNTS).sort(), Object.keys(PW).sort());
  for (const a of ACCOUNTS) {
    assert.match(a.passwordEnv, /^CRM_[A-Z_]+_PASSWORD$/, `${a.email} -> ${a.passwordEnv}`);
  }
});

test('the variable name says WHO, not what role they hold', () => {
  // A role can change. If the name encoded it, the variable would start lying
  // the moment somebody was promoted, and nobody would notice.
  for (const a of ACCOUNTS) {
    assert.equal(/ADMIN|USER/.test(a.passwordEnv), false,
      `${a.passwordEnv} encodes a role and must not`);
  }
});

test('the configuration is accepted when every variable is supplied', () => {
  assert.deepEqual(checkAccountConfig(ACCOUNTS, PW), []);
});

// ============================================== a fresh database gets accounts

test('A FRESH DATABASE WITH VALID SECRETS GETS EXACTLY THE THREE ACCOUNTS', () => {
  const db = freshDb();
  const r = bootstrapAccounts(db, { accounts: ACCOUNTS, env: PW });
  assert.equal(r.created.length, 3);
  assert.equal(r.skipped.length, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM crm_users').get().n, 3);
});

test('the roles are right, and the shared Admissions account is a user', () => {
  const db = freshDb();
  bootstrapAccounts(db, { accounts: ACCOUNTS, env: PW });
  const role = (e) => db.prepare('SELECT role FROM crm_users WHERE email = ?').get(e).role;
  assert.equal(role('ritvars.vilcins@novikontas.org'), 'admin');
  assert.equal(role('aigars.kluga@novikontas.org'), 'admin');
  assert.equal(role('edu@novikontas.org'), 'user',
    'edu@ is the Admissions account Ieva and Laura share, and Channels is admin-only for everybody');
});

test('the shared Admissions account is labelled as Admissions, not as a person', () => {
  const db = freshDb();
  bootstrapAccounts(db, { accounts: ACCOUNTS, env: PW });
  const row = db.prepare('SELECT display_name FROM crm_users WHERE email = ?').get('edu@novikontas.org');
  assert.equal(row.display_name, 'Admissions');
  const cfg = ACCOUNTS.find((a) => a.email === 'edu@novikontas.org');
  assert.deepEqual(cfg.sharedBy, ['Ieva', 'Laura']);
});

test('every created account can actually be signed in to', () => {
  // The whole point. An account with no usable password is the lockout.
  const db = freshDb();
  bootstrapAccounts(db, { accounts: ACCOUNTS, env: PW });
  for (const a of ACCOUNTS) {
    const row = db.prepare('SELECT password_hash FROM crm_users WHERE email = ?').get(canonicalEmail(a.email));
    assert.ok(row.password_hash, `${a.email} has no password`);
    assert.equal(verifyPassword(PW[a.passwordEnv], row.password_hash), true, a.email);
  }
});

test('nobody outside the configured list is created', () => {
  const db = freshDb();
  bootstrapAccounts(db, { accounts: ACCOUNTS, env: PW });
  const emails = db.prepare('SELECT email FROM crm_users').all().map((r) => r.email);
  for (const name of ['marina', 'tetiana', 'maris.cirulis', 'arina', 'ieva', 'laura']) {
    assert.equal(emails.includes(`${name}@novikontas.org`), false,
      `${name}@ was invented and must not have been`);
  }
});

// ================================================================ idempotency

test('RUNNING IT AGAIN CREATES NOTHING AND DUPLICATES NOTHING', () => {
  const db = freshDb();
  bootstrapAccounts(db, { accounts: ACCOUNTS, env: PW });
  for (let i = 0; i < 5; i += 1) {
    const again = bootstrapAccounts(db, { accounts: ACCOUNTS, env: PW });
    assert.equal(again.created.length, 0, `run ${i + 2} created something`);
    assert.equal(again.kept.length, 3);
  }
  assert.equal(db.prepare('SELECT COUNT(*) n FROM crm_users').get().n, 3);
  assert.equal(db.prepare('SELECT COUNT(DISTINCT email) n FROM crm_users').get().n, 3);
});

test('IT NEVER CHANGES AN ACCOUNT THAT ALREADY EXISTS', () => {
  // A bootstrap that "corrects" a role on every restart would quietly undo an
  // administrator who had changed one on purpose.
  const db = freshDb();
  bootstrapAccounts(db, { accounts: ACCOUNTS, env: PW });
  db.prepare("UPDATE crm_users SET role = 'admin' WHERE email = ?").run('edu@novikontas.org');
  const before = db.prepare('SELECT password_hash FROM crm_users WHERE email = ?')
    .get('ritvars.vilcins@novikontas.org').password_hash;

  bootstrapAccounts(db, { accounts: ACCOUNTS, env: PW });

  assert.equal(db.prepare('SELECT role FROM crm_users WHERE email = ?').get('edu@novikontas.org').role,
    'admin', 'the hand-made change was overwritten');
  assert.equal(db.prepare('SELECT password_hash FROM crm_users WHERE email = ?')
    .get('ritvars.vilcins@novikontas.org').password_hash, before, 'the password was re-hashed');
});

test('a disabled account is not quietly re-enabled', () => {
  const db = freshDb();
  bootstrapAccounts(db, { accounts: ACCOUNTS, env: PW });
  db.prepare('UPDATE crm_users SET active = 0 WHERE email = ?').run('aigars.kluga@novikontas.org');
  bootstrapAccounts(db, { accounts: ACCOUNTS, env: PW });
  assert.equal(db.prepare('SELECT active FROM crm_users WHERE email = ?')
    .get('aigars.kluga@novikontas.org').active, 0);
});

// ========================================= failing safely, not silently

test('NO VARIABLES AT ALL means bootstrap is not in use, and creates nothing', () => {
  // Not every copy provisions accounts this way: a laptop, a test, or a host
  // with a real disk may already hold them. Refusing here would refuse to start
  // a service that was working, which an earlier version of this did to eleven
  // existing tests. What it must never do is create a passwordless account.
  const db = freshDb();
  const r = bootstrapIfAuthOn(db, { accounts: ACCOUNTS, env: {}, authOn: true });
  assert.equal(r.ok, true);
  assert.equal(r.ran, false);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM crm_users').get().n, 0);
});

test('but it WARNS when that leaves nobody able to sign in', () => {
  // The Render lockout, said out loud. A login screen nobody can pass looks
  // healthy from outside, so silence here is the dangerous answer.
  const r = bootstrapIfAuthOn(freshDb(), { accounts: ACCOUNTS, env: {}, authOn: true });
  assert.ok(r.warn, 'an empty database with sign-in on must warn');
  assert.match(r.warn, /Nobody can get in/);
  for (const name of Object.keys(PW)) assert.match(r.warn, new RegExp(name));
});

test('and it does NOT warn when the database already holds usable accounts', () => {
  const db = freshDb();
  bootstrapAccounts(db, { accounts: ACCOUNTS, env: PW });
  const r = bootstrapIfAuthOn(db, { accounts: ACCOUNTS, env: {}, authOn: true });
  assert.equal(r.ok, true);
  assert.equal(r.warn, null, 'the accounts are there, so there is nothing to warn about');
});

test('an account with no password does not count as a way in', () => {
  const db = freshDb();
  db.prepare(`INSERT INTO crm_users (id, email, display_name, password_hash, role, active,
    session_version, created_at) VALUES ('u1','x@novikontas.org','X',NULL,'admin',1,0,'now')`).run();
  const r = bootstrapIfAuthOn(db, { accounts: ACCOUNTS, env: {}, authOn: true });
  assert.ok(r.warn, 'a passwordless row must not count as somebody who can sign in');
});

test('HALF CONFIGURED IS REFUSED, because half a set is the confusing case', () => {
  // Two people can sign in and the third is told their password is wrong, which
  // reads as their mistake rather than a deployment one.
  const partial = { ...PW };
  delete partial.CRM_ADMISSIONS_PASSWORD;
  const db = freshDb();
  const r = bootstrapIfAuthOn(db, { accounts: ACCOUNTS, env: partial, authOn: true });
  assert.equal(r.ok, false);
  assert.match(r.why, /half configured/);
  assert.match(r.why, /CRM_ADMISSIONS_PASSWORD/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM crm_users').get().n, 0,
    'nothing may be created when the set is incomplete');
});

test('a password that is too weak is refused, and the rule is given', () => {
  const weak = { ...PW, CRM_RITVARS_PASSWORD: 'short' };
  const r = bootstrapIfAuthOn(freshDb(), { accounts: ACCOUNTS, env: weak, authOn: true });
  assert.equal(r.ok, false);
  assert.match(r.why, /CRM_RITVARS_PASSWORD/);
  assert.match(r.why, /at least 12 characters/);
});

test('NO PASSWORD VALUE APPEARS IN ANYTHING IT RETURNS', () => {
  // Every one of these strings can end up on a terminal, and on Render in a
  // build log somebody else can read.
  const weak = { ...PW, CRM_RITVARS_PASSWORD: 'short' };
  const outputs = [
    JSON.stringify(bootstrapIfAuthOn(freshDb(), { accounts: ACCOUNTS, env: PW, authOn: true })),
    JSON.stringify(bootstrapIfAuthOn(freshDb(), { accounts: ACCOUNTS, env: {}, authOn: true })),
    JSON.stringify(bootstrapIfAuthOn(freshDb(), { accounts: ACCOUNTS, env: weak, authOn: true })),
    JSON.stringify(checkAccountConfig(ACCOUNTS, weak)),
    JSON.stringify(bootstrapAccounts(freshDb(), { accounts: ACCOUNTS, env: PW })),
  ].join(' ');
  for (const value of Object.values(PW)) {
    assert.equal(outputs.includes(value), false, 'A PASSWORD VALUE WAS RETURNED');
  }
  assert.equal(outputs.includes('fixture-only'), false);
  assert.equal(outputs.includes('short'), false);
  // And no stored hash either - a hash is not a password, but it is not output.
  assert.equal(/scrypt\$/.test(outputs), false, 'a password hash was returned');
});

test('the stored hash is never the password', () => {
  const db = freshDb();
  bootstrapAccounts(db, { accounts: ACCOUNTS, env: PW });
  const all = db.prepare('SELECT password_hash FROM crm_users').all().map((r) => r.password_hash).join(' ');
  for (const value of Object.values(PW)) assert.equal(all.includes(value), false);
});

// ============================================== local development is untouched

test('WITH SIGN-IN OFF IT DOES NOTHING, AND DEMANDS NOTHING', () => {
  // A laptop must keep working with none of these variables set, and nobody
  // should ever be asked to put a password in a .env file.
  const db = freshDb();
  const r = bootstrapIfAuthOn(db, { accounts: ACCOUNTS, env: {}, authOn: false });
  assert.equal(r.ok, true);
  assert.equal(r.ran, false);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM crm_users').get().n, 0);
});

// ====================================== against a real server, Render's shape

function startServer(env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')],
      { env: { ...process.env, PORT: '0', CRM_INSECURE_COOKIE: '1', CRM_PUBLIC: '',
        DATASET: 'empty', CRM_AUTH: '', CRM_SESSION_SECRET: '', ...env },
        stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const done = (fn, arg) => { clearTimeout(timer); fn(arg); };
    const timer = setTimeout(() => { child.kill(); reject(new Error('never started: ' + out)); }, 15000);
    const look = (d) => {
      out += d;
      const m = out.match(/http:\/\/localhost:(\d+)/);
      if (m) done(resolve, { child, port: Number(m[1]), out: () => out });
    };
    child.stdout.on('data', look);
    child.stderr.on('data', look);
    child.on('exit', (code) => done(reject, Object.assign(new Error(out), { code, out })));
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
        resolve({ status: res.statusCode, text, json, cookies: res.headers['set-cookie'] || [] });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const cookieValue = (list, name) => {
  for (const c of [].concat(list)) {
    const [pair] = c.split(';');
    const eq = pair.indexOf('=');
    if (pair.slice(0, eq).trim() === name) return pair.slice(eq + 1);
  }
  return null;
};

const RENDER_ENV = { CRM_AUTH: '1', CRM_SESSION_SECRET: SECRET, ...PW };

test('THE SERVER REFUSES TO START when provisioning is half configured', async () => {
  // Some variables set means somebody meant to use bootstrap and got it wrong.
  // That is worth exiting over; it is not the same as not using it at all.
  const partial = { CRM_AUTH: '1', CRM_SESSION_SECRET: SECRET,
    CRM_RITVARS_PASSWORD: PW.CRM_RITVARS_PASSWORD };
  await assert.rejects(
    () => startServer(partial),
    (err) => {
      assert.equal(err.code, 1, 'it must exit, not warn and carry on');
      assert.match(err.out, /REFUSING TO START/);
      assert.match(err.out, /CRM_AIGARS_PASSWORD/);
      assert.match(err.out, /CRM_ADMISSIONS_PASSWORD/);
      // And not a single value, even in the refusal.
      for (const v of Object.values(PW)) assert.equal(err.out.includes(v), false);
      return true;
    });
});

test('with no provisioning variables the server STARTS, and says nobody can get in', async (t) => {
  // It must start: existing tests and local development run exactly like this.
  // But the warning has to be there, because this is the Render lockout.
  const s = await startServer({ CRM_AUTH: '1', CRM_SESSION_SECRET: SECRET });
  t.after(() => { try { s.child.kill(); } catch {} });
  assert.match(s.out(), /WARNING/);
  assert.match(s.out(), /Nobody can get in/);
  assert.equal((await request(s.port, 'GET', '/healthz')).status, 200);
});

test('a fresh database booted with Render\'s shape ends up with three accounts', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-boot-'));
  const file = path.join(dir, 'crm.db');
  const s = await startServer({ ...RENDER_ENV, CRM_DB: file });
  t.after(() => {
    try { s.child.kill(); } catch {}
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });
  assert.match(s.out(), /accounts: 3 created, 0 already there/);
  // No value in the boot output, which on Render is a log somebody can read.
  for (const v of Object.values(PW)) assert.equal(s.out().includes(v), false);
});

test('all three sign in, with the authorization each is meant to have', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-boot-'));
  const s = await startServer({ ...RENDER_ENV, CRM_DB: path.join(dir, 'crm.db') });
  t.after(() => {
    try { s.child.kill(); } catch {}
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  const expected = {
    'ritvars.vilcins@novikontas.org': { role: 'admin', channels: 200 },
    'aigars.kluga@novikontas.org': { role: 'admin', channels: 200 },
    'edu@novikontas.org': { role: 'user', channels: 403 },
  };

  for (const a of ACCOUNTS) {
    const email = canonicalEmail(a.email);
    const login = await request(s.port, 'POST', '/api/auth/login',
      { body: { email, password: PW[a.passwordEnv] } });
    assert.equal(login.status, 200, `${email} could not sign in: ${login.text}`);
    assert.equal(login.json.user.role, expected[email].role, email);

    const cookie = `crm_session=${cookieValue(login.cookies, 'crm_session')}`;
    const ch = await request(s.port, 'GET', '/api/admin/channels', { headers: { cookie } });
    assert.equal(ch.status, expected[email].channels, `${email} Channels`);
  }
});

test('an unknown company address is still refused after bootstrapping', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-boot-'));
  const s = await startServer({ ...RENDER_ENV, CRM_DB: path.join(dir, 'crm.db') });
  t.after(() => {
    try { s.child.kill(); } catch {}
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });
  const r = await request(s.port, 'POST', '/api/auth/login',
    { body: { email: 'somebody.else@novikontas.org', password: PW.CRM_RITVARS_PASSWORD } });
  assert.equal(r.status, 401);
});

test('the API stays closed to an unauthenticated caller', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-boot-'));
  const s = await startServer({ ...RENDER_ENV, CRM_DB: path.join(dir, 'crm.db') });
  t.after(() => {
    try { s.child.kill(); } catch {}
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });
  for (const p of ['/api/people', '/api/config', '/api/admin/channels']) {
    assert.equal((await request(s.port, 'GET', p)).status, 401, p);
  }
  assert.equal((await request(s.port, 'GET', '/healthz')).status, 200, '/healthz must stay open');
});

test('restarting on the same database keeps the accounts and adds none', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-boot-'));
  const file = path.join(dir, 'crm.db');
  const running = [];
  t.after(() => {
    for (const c of running) { try { c.kill(); } catch {} }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  const first = await startServer({ ...RENDER_ENV, CRM_DB: file });
  running.push(first.child);
  assert.match(first.out(), /3 created, 0 already there/);
  first.child.kill();
  await new Promise((r) => setTimeout(r, 300));

  const second = await startServer({ ...RENDER_ENV, CRM_DB: file });
  running.push(second.child);
  assert.match(second.out(), /0 created, 3 already there/);
  assert.equal(openDb(file).prepare('SELECT COUNT(*) n FROM crm_users').get().n, 3);
});
