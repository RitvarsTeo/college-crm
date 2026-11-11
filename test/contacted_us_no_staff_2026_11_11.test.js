// "CONTACTED US" COUNTS PEOPLE FROM OUTSIDE ONLY (11.11.2026, under the owner's rule of 05.11.2026: no staff or test record
// in any figure). An item set aside as Internal, Spam or Supplier or vendor - the three marks - is not a contact, in the
// funnel's "Contacted us" and in each channel's contacts (the funnel route and its exports read the same numbers).
// "Not a prospective student" is a real person who got in touch and stays counted. Synthetic only.
import test from 'node:test';
import assert from 'node:assert/strict';

for (const k of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'CRM_DB_DATABASE_URL_UNPOOLED', 'INTAKE_DATABASE_URL']) process.env[k] = '';
const { openDb } = await import('../src/db.js');
const { receive, archive, funnel } = await import('../src/intake.js');

test('Contacted us leaves out Internal, Spam and Supplier or vendor; Not a prospective student stays', async () => {
  const db = await openDb(':memory:');
  let n = 0;
  const card = (channel, name) => receive(db, { channel, name, email: `c${++n}@example.com`, externalId: 'cu-' + n,
    body: 'Labdien, vēlos uzzināt par studijām navigācijā.' });
  const waiting = await card('gmail', 'Anna Paraugs');
  const notProspect = await card('gmail', 'Pēteris Paraugs');
  const internal = await card('sis', 'Kolēģis Paraugs');
  const spam = await card('gmail', 'Spams Paraugs');
  const vendor = await card('website', 'Piegādātājs Paraugs');
  await archive(db, notProspect.id, { reason: 'Not a prospective student', by: 'Ieva' });
  await archive(db, internal.id, { reason: 'Internal', by: 'Ritvars' });
  await archive(db, spam.id, { reason: 'Spam', by: 'Ieva' });
  await archive(db, vendor.id, { reason: 'Supplier or vendor', by: 'Ieva' });
  const states = (await db.prepare('SELECT state, archive_reason FROM inbound ORDER BY id').all()).map((r) => `${r.state}:${r.archive_reason || ''}`);
  assert.deepEqual(states, ['new:', 'archived:Not a prospective student', 'archived:Internal', 'archived:Spam', 'archived:Supplier or vendor']);
  const f = await funnel(db);
  const step = (name) => f.steps.find((s) => s.step === name).count;
  assert.equal(step('Contacted us'), 2, 'the waiting one and the one who is not a prospective student');
  assert.equal(step('Waiting to be looked at'), 1);
  const ch = Object.fromEntries(f.byChannel.map((c) => [c.channel, Number(c.contacts)]));
  assert.deepEqual(ch, { gmail: 2 }, 'the SIS item set aside as Internal and the vendor form are no channel contacts');
  assert.ok(waiting.id);
});
