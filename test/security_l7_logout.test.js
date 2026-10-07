// L7 (security review 07.10.2026): Sign out only cleared the cookie in THIS browser. The signed session
// itself stayed valid until it expired, so a copied cookie (a shared PC, a leaked log) kept working after
// the person had signed out. Signing out now bumps session_version, which ends every session of that
// account at once - the same lever disabling an account already pulls.

import test from 'node:test';
import assert from 'node:assert/strict';
import { start, post, get, session, USER } from './security_helpers.js';

test('L7: after sign-out the same session cookie no longer opens anything', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  const cookie = session(USER, 'user', 0);
  assert.equal((await get(s, '/api/people', { cookie })).status, 200, 'signed in');
  const out = await post(s, '/api/auth/logout', { cookie });
  assert.equal(out.status, 200);
  assert.equal((await get(s, '/api/people', { cookie })).status, 401, 'the old cookie still worked');
  // and signing in again (a session minted with the new version) works
  assert.equal((await get(s, '/api/people', { cookie: session(USER, 'user', 1) })).status, 200);
});

test('L7: signing out with no session is harmless', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  assert.equal((await post(s, '/api/auth/logout')).status, 200);
});
