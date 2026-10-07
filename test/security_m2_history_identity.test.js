// M2 (security review 07.10.2026): GET /api/history read who is asking from ?as= or x-acting-as even
// with sign-in on, so any signed-in user could ask as an admin ("?as=Ritvars") and be shown the
// admin's scope and labelled an admin. With sign-in on, the session is the only answer.

import test from 'node:test';
import assert from 'node:assert/strict';
import { start, get, userCookie, adminCookie } from './security_helpers.js';

test('M2: with sign-in on, ?as= and x-acting-as are ignored by the history; the session decides', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  for (const [p, headers] of [['/api/history?as=Ritvars', {}], ['/api/history', { 'x-acting-as': 'Ritvars' }]]) {
    const r = await (await get(s, p, { cookie: userCookie(), headers })).json();
    assert.equal(r.actor, 'Admissions', 'the history answered as somebody the session is not');
    assert.equal(r.isAdmin, false, 'a user was told they are an admin');
  }
  const a = await (await get(s, '/api/history', { cookie: adminCookie() })).json();
  assert.equal(a.actor, 'Ritvars');
  assert.equal(a.isAdmin, true, 'the admin is still an admin');
  assert.equal(a.scope, 'everything');
});

test('M2: without sign-in the history still follows "Acting as", as before', async (t) => {
  const s = await start({ CRM_AUTH: '' });
  t.after(() => s.child.kill());
  const r = await (await get(s, '/api/history?as=Ritvars')).json();
  assert.equal(r.actor, 'Ritvars');
  assert.equal(r.isAdmin, true);
});
