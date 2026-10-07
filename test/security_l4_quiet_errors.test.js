// L4 (security review 07.10.2026): /healthz is open before sign-in and told anybody how many people
// the CRM holds; and every unexpected error sent its own message back (SQL, file paths, driver text).
// Now /healthz says {ok:true} and nothing else, and a 500 says one generic sentence; the detail goes
// to the server log, where an admin can read it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { start, post, userCookie } from './security_helpers.js';

test('L4: /healthz answers ok and nothing about the data', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  const r = await fetch(s.base + '/healthz');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
});

test('L4: an unexpected error answers a generic 500; the detail is in the log only', async (t) => {
  const s = await start({ DATASET: 'empty' });
  t.after(() => s.child.kill());
  // an object where the database wants text: the driver throws with its own wording
  const r = await post(s, '/api/people', { cookie: userCookie(), body: { name: { not: 'text' }, source_channel: 'website', confirmedNotDuplicate: true } });
  assert.equal(r.status, 500);
  const j = await r.json();
  assert.deepEqual(Object.keys(j), ['error']);
  assert.match(j.error, /^Something went wrong on the server/);
  await new Promise((done) => setTimeout(done, 100));
  assert.match(s.log(), /500 POST \/api\/people/, 'the detail is logged for an admin');
});
