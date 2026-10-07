// L1 (security review 07.10.2026): a person id was 'p' + five characters of Math.random: guessable,
// and a clash (one in 60 million per pair) fails the INSERT. Now 'p' + 32 hex characters from
// crypto.randomUUID. Hex is inside the old [a-z0-9] alphabet, and no route or screen reads the
// length, so every link, hash and regex that took the old ids takes the new ones.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, start, post, userCookie } from './security_helpers.js';
import { newPersonId } from '../src/intake.js';

test('L1: a new person id is p + 32 hex characters from a secure source, and never repeats', () => {
  const ids = new Set();
  for (let i = 0; i < 2000; i++) {
    const id = newPersonId();
    assert.match(id, /^p[0-9a-f]{32}$/);
    ids.add(id);
  }
  assert.equal(ids.size, 2000);
});

test('L1: no person id is made from Math.random any more', () => {
  for (const f of ['src/server.js', 'src/intake.js', 'src/simulator.js']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.doesNotMatch(src, /'p' \+ Math\.random/, f);
  }
});

test('L1: a person added by hand gets the new id, and their page and routes work with it', async (t) => {
  const s = await start({ DATASET: 'empty' });
  t.after(() => s.child.kill());
  const r = await (await post(s, '/api/people', { cookie: userCookie(), body: { name: 'New Id', source_channel: 'website', confirmedNotDuplicate: true } })).json();
  assert.match(r.id || r.person?.id || '', /^p[0-9a-f]{32}$/, JSON.stringify(r));
  const id = r.id || r.person.id;
  const one = await fetch(`${s.base}/api/people/${id}`, { headers: { cookie: userCookie() } });
  assert.equal(one.status, 200);
});
