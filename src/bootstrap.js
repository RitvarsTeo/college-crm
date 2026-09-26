// Making sure the accounts exist on a database that keeps forgetting them.
//
// THE PROBLEM THIS SOLVES. The V1 testing copy runs on Render Free with
// CRM_DB=/tmp/crm.db. Free has no disk, so that file is gone on every restart,
// redeploy and wake from idle sleep. Demo people self-seed, so the service looks
// healthy - but `crm_users` is written only by scripts/manage_users.mjs, which
// nothing on the host ever runs. Switching CRM_AUTH on without this would put a
// login screen in front of a database with zero accounts in it, and lock Aigars
// and Ieva out of the copy they are meant to be testing.
//
// WHAT IT WILL NOT DO, and each of these is deliberate:
//
//   - it never invents an account. Only the addresses written down in
//     config/prototype.json -> accounts, and those are real addresses somebody
//     gave us rather than names turned into addresses
//   - it never changes an account that already exists. Not the role, not the
//     password, not the active flag. A bootstrap that "corrects" a role on every
//     restart would quietly undo an administrator
//   - it never invents a password, never generates one, never prints one, and
//     never writes one anywhere. Values come from the host environment and stay
//     there
//   - it never creates an account it cannot give a password to. An account with
//     no password can never sign in, so creating one silently would produce
//     exactly the lockout this file exists to prevent, while looking like success
//
// It is safe to run on every startup, and is expected to be.

import { canonicalEmail, hashPassword, passwordProblem, ROLES } from './auth.js';

/** The environment variables the configured accounts need, by NAME. */
export const passwordEnvNames = (accounts = []) =>
  accounts.map((a) => a.passwordEnv).filter(Boolean);

/**
 * Check the configuration before touching anything.
 *
 * Returns the problems as a list of sentences. Every sentence names a VARIABLE
 * or an ADDRESS and never a value - these strings end up on a terminal, and on
 * Render they end up in a build log somebody else can read.
 */
export function checkAccountConfig(accounts, env) {
  const problems = [];
  if (!Array.isArray(accounts) || !accounts.length) {
    return ['config/prototype.json has no `accounts` list, so there is nobody to create.'];
  }
  for (const a of accounts) {
    const email = canonicalEmail(a.email);
    if (!email.includes('@')) { problems.push(`"${a.email}" is not an address.`); continue; }
    if (!ROLES.includes(a.role)) {
      problems.push(`${email}: role must be one of ${ROLES.join(', ')}.`);
    }
    if (!a.passwordEnv) {
      problems.push(`${email}: no passwordEnv is recorded, so there is no way to give it a password.`);
      continue;
    }
    const supplied = env[a.passwordEnv];
    if (!supplied) {
      problems.push(`${a.passwordEnv} is not set, so ${email} cannot be created.`);
      continue;
    }
    // The same policy the management script applies. A weak password on a copy
    // that is reachable from the internet is worth refusing over.
    const bad = passwordProblem(supplied, { email, name: a.name });
    if (bad) problems.push(`${a.passwordEnv} is refused: the password must be ${bad}.`);
  }
  return problems;
}

/**
 * Create whatever is missing. Idempotent: run it a hundred times and the second
 * run onwards does nothing at all.
 *
 * Returns { created, kept, skipped } as lists of ADDRESSES. No password, no
 * hash, and no environment value is in the return value, which is what makes it
 * safe for the caller to print.
 */
export async function bootstrapAccounts(db, { accounts = [], env = process.env, now = new Date() } = {}) {
  const created = [];
  const kept = [];
  const skipped = [];

  const find = db.prepare('SELECT id, role FROM crm_users WHERE email = ?');
  const insert = db.prepare(`INSERT INTO crm_users
    (id, email, display_name, password_hash, role, active, session_version, created_at)
    VALUES (?,?,?,?,?,1,0,?)`);

  for (const a of accounts) {
    const email = canonicalEmail(a.email);
    if (!email.includes('@') || !ROLES.includes(a.role)) { skipped.push(email || String(a.email)); continue; }

    // ALREADY THERE: leave it completely alone, whatever its role now is.
    if (await find.get(email)) { kept.push(email); continue; }

    const supplied = a.passwordEnv ? env[a.passwordEnv] : null;
    // No password means no account. Never a half-made one.
    if (!supplied || passwordProblem(supplied, { email, name: a.name })) { skipped.push(email); continue; }

    await insert.run(newId(), email, a.name || email.split('@')[0],
      hashPassword(supplied), a.role, now.toISOString());
    created.push(email);
  }

  return { created, kept, skipped };
}

// Not crypto.randomUUID, so the ids read like the ones manage_users.mjs makes.
function newId() {
  return 'u' + Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);
}

/**
 * The whole decision, for the server to call at boot.
 *
 * With sign-in OFF this does NOTHING and says nothing: a laptop must keep
 * working with none of these variables set, and a developer must never be asked
 * to put a password in a .env file.
 *
 * With sign-in ON and something wrong, it returns ok:false and the caller
 * refuses to start. That is louder than it sounds and it is the point: a service
 * that boots happily into a login screen nobody can pass looks healthy from
 * outside, and that is the failure this whole file exists to make impossible.
 */
export async function bootstrapIfAuthOn(db, { accounts = [], env = process.env, authOn = false } = {}) {
  if (!authOn) return { ok: true, ran: false, why: 'sign-in is off' };

  // IS THIS DEPLOYMENT USING BOOTSTRAP AT ALL?
  //
  // Not every copy provisions accounts this way. A laptop, a test, or a host
  // with a real disk may already hold its accounts, or make them with
  // manage_users.mjs. Demanding these variables there would refuse to start a
  // service that was working perfectly - which the first version of this did, to
  // eleven existing tests.
  //
  // So: NONE of the variables set means bootstrap is not in use. SOME set means
  // somebody intended to use it and got it wrong, and that is worth refusing
  // over, because a half-provisioned set is the confusing case - two people can
  // sign in and the third is told their password is wrong.
  const names = passwordEnvNames(accounts);
  const supplied = names.filter((n) => env[n]);

  if (supplied.length === 0) {
    const usable = await countUsableAccounts(db);
    return { ok: true, ran: false, created: [], kept: [], skipped: [],
      warn: usable === 0
        ? 'CRM_AUTH is on and this database holds no account anybody can sign in with. '
          + `Nobody can get in. Set ${names.join(', ')} to have them created at boot, `
          + 'or create accounts with scripts/manage_users.mjs.'
        : null,
      why: 'no account passwords are configured, so bootstrap did not run' };
  }

  if (supplied.length < names.length) {
    const absent = names.filter((n) => !env[n]);
    return { ok: false, ran: false,
      why: 'CRM_AUTH is on and account provisioning is half configured. Set all of them or '
         + `none.\n  - missing: ${absent.join(', ')}`
         + '\nTheir VALUES belong on the host and nowhere else.' };
  }

  // Only what is actually missing needs checking. An account that already exists
  // is left alone, so its password variable is not required to be valid.
  const problems = checkAccountConfig(accounts, env);
  if (problems.length) {
    return { ok: false, ran: false,
      why: 'CRM_AUTH is on, but the accounts cannot be created:\n  - ' + problems.join('\n  - ')
         + '\nSet those variables on the host. Their VALUES belong nowhere else.' };
  }

  const r = await bootstrapAccounts(db, { accounts, env });
  if (r.skipped.length) {
    return { ok: false, ran: true,
      why: 'Some accounts could not be created: ' + r.skipped.join(', ') };
  }
  return { ok: true, ran: true, ...r };
}

/** How many accounts could actually sign in right now. An account with no
 *  password cannot, so it does not count. */
export async function countUsableAccounts(db) {
  try {
    return (await db.prepare('SELECT COUNT(*) n FROM crm_users WHERE password_hash IS NOT NULL AND active = 1')
      .get()).n;
  } catch { return 0; }
}
