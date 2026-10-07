// L2 (security review 07.10.2026): moving a person to Admitted by hand wrote a made-up matriculation
// number ('3-5-IM/2026/' + a random two digits) into student_no. That number belongs to the student
// system; an invented one looks real, can match a real student's, and was exported. It is no longer
// written: admitted_at is set, student_no stays as it was (empty until the SIS says).

import test from 'node:test';
import assert from 'node:assert/strict';
import { start, post, get, userCookie } from './security_helpers.js';

test('L2: Admitted by hand records when, and never invents a student number', async (t) => {
  const s = await start({ DATASET: 'empty' });
  t.after(() => s.child.kill());
  const cookie = userCookie();
  const made = await (await post(s, '/api/people', { cookie, body: { name: 'Ada Admitted', source_channel: 'website', confirmedNotDuplicate: true } })).json();
  const id = made.id || made.person.id;
  const r = await post(s, `/api/people/${id}/status`, { cookie, body: { status: 'Admitted', note: 'signed' } });
  assert.equal(r.status, 200, await r.text());
  const p = await (await get(s, `/api/people/${id}`, { cookie })).json();
  assert.ok(p.admitted_at, 'the admission is dated');
  assert.equal(p.student_no ?? null, null, `an invented student number was written: ${p.student_no}`);
});
