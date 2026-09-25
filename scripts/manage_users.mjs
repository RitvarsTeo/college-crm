#!/usr/bin/env node
// Accounts for the Academy CRM. The only way one is created.
//
// There is no sign-up page and no password reset by email on purpose: everybody
// who uses this works at Novikontas and sits down the corridor from somebody who
// can run this.
//
// A PASSWORD IS NEVER PRINTED, NEVER LOGGED AND NEVER WRITTEN TO A FILE.
// It is typed at a prompt with the echo off, and only the scrypt hash is stored.
// Nothing here accepts a password as a command line argument, because a command
// line argument lands in the shell history.
//
//   node scripts/manage_users.mjs list
//   node scripts/manage_users.mjs seed                  from config/prototype.json, no passwords
//   node scripts/manage_users.mjs add <email> [--name "Ieva Berzina"] [--role admin|user]
//   node scripts/manage_users.mjs password <email>      prompts, twice
//   node scripts/manage_users.mjs role <email> <admin|user>
//   node scripts/manage_users.mjs disable <email>
//   node scripts/manage_users.mjs enable <email>
//   node scripts/manage_users.mjs signout <email>       invalidates their cookies now
//   node scripts/manage_users.mjs secret                prints a CRM_SESSION_SECRET to set

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { hashPassword, canonicalEmail, passwordProblem, ROLES, MIN_PASSWORD } from '../src/auth.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DB_FILE = process.env.CRM_DB || path.join(ROOT, 'data', 'crm.db');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));

const die = (msg) => { console.error(msg); process.exit(1); };
const nowIso = () => new Date().toISOString();
const newId = () => 'u' + crypto.randomBytes(6).toString('hex');

// Reads a line with the echo off, so a password never appears on screen and
// never reaches the scrollback of a shared machine.
function askHidden(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const onData = (char) => {
      if (['\n', '\r', '\u0004'].includes(String(char))) process.stdin.removeListener('data', onData);
      else readline.clearLine(process.stdout, 0), readline.cursorTo(process.stdout, 0), process.stdout.write(prompt);
    };
    process.stdout.write(prompt);
    process.stdin.on('data', onData);
    rl.question('', (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}

const flag = (args, name) => {
  const i = args.indexOf('--' + name);
  return i === -1 ? null : args[i + 1];
};

async function main() {
  const [, , cmd, ...args] = process.argv;

  if (cmd === 'secret') {
    // Printed, not stored. It is not anybody's password: it is the key the server
    // signs sessions with, and it belongs in the host's environment settings.
    console.log(crypto.randomBytes(32).toString('base64url'));
    console.log('\nSet this as CRM_SESSION_SECRET on the host, and set CRM_AUTH=1.');
    console.log('Changing it later signs everybody out, which is the point of having it.');
    return;
  }

  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  const db = openDb(DB_FILE);
  const find = (email) => db.prepare('SELECT * FROM crm_users WHERE email = ?').get(canonicalEmail(email));

  if (!cmd || cmd === 'list') {
    const rows = db.prepare(`SELECT email, display_name, role, active, last_login_at,
      CASE WHEN password_hash IS NULL THEN 0 ELSE 1 END AS has_password
      FROM crm_users ORDER BY role, email`).all();
    if (!rows.length) return console.log('No accounts yet. Run: node scripts/manage_users.mjs seed');
    console.log('email'.padEnd(34) + 'name'.padEnd(20) + 'role'.padEnd(8) + 'password  active  last sign-in');
    for (const r of rows) {
      console.log(String(r.email).padEnd(34) + String(r.display_name || '').padEnd(20)
        + String(r.role).padEnd(8) + (r.has_password ? 'set     ' : 'NOT SET ').padEnd(10)
        + (r.active ? 'yes     ' : 'NO      ') + (r.last_login_at || 'never'));
    }
    return;
  }

  if (cmd === 'seed') {
    // ONLY the addresses written down in config/prototype.json -> accounts.
    //
    // THIS USED TO GUESS. It built first.last@novikontas.org out of a display
    // name, which produced ritvars@novikontas.org for somebody whose address is
    // ritvars.vilcins@novikontas.org - and with Google sign-in that is not a
    // cosmetic error: the allowlist matches on the address, so the guessed row
    // would have refused the real person and let nobody in at all.
    //
    // A NAME IS NOT AN ADDRESS. Anybody with no address recorded gets no account
    // and is named below, rather than being invented.
    const wanted = CONFIG.accounts || [];
    if (!wanted.length) die('config/prototype.json has no `accounts` list. Nothing to seed.');

    let made = 0;
    for (const w of wanted) {
      const email = canonicalEmail(w.email);
      if (!email.includes('@')) die(`"${w.email}" is not an address.`);
      if (!ROLES.includes(w.role)) die(`${email}: role must be one of ${ROLES.join(', ')}`);
      if (find(email)) { console.log(`exists  ${email}`); continue; }
      db.prepare(`INSERT INTO crm_users (id, email, display_name, password_hash, role, active,
        session_version, created_at) VALUES (?,?,?,NULL,?,1,0,?)`)
        .run(newId(), email, w.name, w.role, nowIso());
      made += 1;
      console.log(`created ${email.padEnd(34)} ${String(w.name).padEnd(12)} ${w.role}`
        + (w.shared ? `   shared by ${(w.sharedBy || []).join(' and ') || 'more than one person'}` : ''));
    }

    // Who is in the CRM but has no way in. Said out loud, because a silent gap
    // here looks exactly like a working rollout.
    const named = new Set([...(CONFIG.admins || []), ...(CONFIG.users || []).map((u) => u.name)]);
    for (const a of wanted) named.delete(a.name);
    if (named.size) {
      console.log(`\nNO ADDRESS RECORDED, so no account: ${[...named].join(', ')}.`);
      console.log('Add them to config/prototype.json -> accounts when you know their addresses.');
    }

    console.log(made ? `\n${made} account(s) created.` : '\nNothing new to create.');
    console.log('None of them has a password. Each can sign in EITHER once Google sign-in is');
    console.log('configured, OR after you run:  node scripts/manage_users.mjs password <email>');
    return;
  }

  if (cmd === 'add') {
    const email = canonicalEmail(args[0] || '');
    if (!email) die('usage: add <email> [--name "Full Name"] [--role admin|user]');
    if (find(email)) die(`${email} already exists.`);
    const role = flag(args, 'role') || 'user';
    if (!ROLES.includes(role)) die(`role must be one of ${ROLES.join(', ')}`);
    db.prepare(`INSERT INTO crm_users (id, email, display_name, password_hash, role, active,
      session_version, created_at) VALUES (?,?,?,NULL,?,1,0,?)`)
      .run(newId(), email, flag(args, 'name') || email.split('@')[0], role, nowIso());
    console.log(`created ${email} as ${role}. It cannot sign in until you run:`);
    console.log(`  node scripts/manage_users.mjs password ${email}`);
    return;
  }

  if (cmd === 'password') {
    const row = find(args[0] || '');
    if (!row) die(`no account for ${args[0]}. Run list to see them.`);
    console.log(`Setting the password for ${row.email} (${row.display_name || 'no name'}).`);
    console.log(`At least ${MIN_PASSWORD} characters. It is not shown as you type and is never stored in plain.`);
    const first = await askHidden('New password: ');
    const problem = passwordProblem(first, { email: row.email, name: row.display_name });
    if (problem) die(`Refused: the password must be ${problem}.`);
    const again = await askHidden('Again: ');
    if (first !== again) die('Refused: the two did not match.');
    db.prepare('UPDATE crm_users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?')
      .run(hashPassword(first), row.id);
    // session_version moved, so any cookie issued before now stops working.
    console.log(`Done. ${row.email} can sign in, and any existing session of theirs is now invalid.`);
    return;
  }

  if (cmd === 'role') {
    const row = find(args[0] || '');
    if (!row) die(`no account for ${args[0]}`);
    const role = args[1];
    if (!ROLES.includes(role)) die(`role must be one of ${ROLES.join(', ')}`);
    db.prepare('UPDATE crm_users SET role = ? WHERE id = ?').run(role, row.id);
    // No session bump needed: the role is re-read from this table on every
    // request, so the change is in force for their next click.
    console.log(`${row.email} is now ${role}. It takes effect on their next request, not on their next sign-in.`);
    return;
  }

  if (cmd === 'disable' || cmd === 'enable') {
    const row = find(args[0] || '');
    if (!row) die(`no account for ${args[0]}`);
    const on = cmd === 'enable' ? 1 : 0;
    db.prepare('UPDATE crm_users SET active = ?, session_version = session_version + 1 WHERE id = ?')
      .run(on, row.id);
    console.log(`${row.email} is now ${on ? 'active' : 'disabled'}, and signed out everywhere.`);
    return;
  }

  if (cmd === 'signout') {
    const row = find(args[0] || '');
    if (!row) die(`no account for ${args[0]}`);
    db.prepare('UPDATE crm_users SET session_version = session_version + 1 WHERE id = ?').run(row.id);
    console.log(`${row.email} is signed out everywhere. Their password is unchanged.`);
    return;
  }

  die(`Unknown command "${cmd}". Run with no arguments to list accounts.`);
}

main().catch((e) => die(String(e && e.stack || e)));
