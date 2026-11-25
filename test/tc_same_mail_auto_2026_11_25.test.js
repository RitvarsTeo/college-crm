// A MERGE TAKES THE TRAINING@ CONVERSATIONS WITH IT (patch 185, his "Yes, fix it" 25.11.2026). After two companies the automation made
// were merged by hand, their tc_mail_auto rows still pointed at the archived company. Now tcsame.merge moves them to the company kept,
// and a company Intake made that is merged away is no longer "made" (an Undo can never archive the company kept). Invented names.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import * as tc from '../src/tc.js';
import { merge } from '../src/tcsame.js';

test('the automation rows follow the merge; made.company is cleared on the merged-away side; nothing is deleted', async () => {
  const db = await openDb(':memory:');
  const keep = await tc.addCompany(db, { name: 'Example Shipping Group', country: 'United Kingdom' }, 'Ritvars');
  const drop = await tc.addCompany(db, { name: 'Exampleshipping', country: '' }, 'Intake');
  const other = await tc.addCompany(db, { name: 'Sample Offshore', country: 'Norway' }, 'Ritvars');
  const at = '2026-11-25T10:00:00.000Z';
  const row = (thread, company, made) => db.prepare(`INSERT INTO tc_mail_auto (thread_id, segment, rule, company_id, made, wrote, at) VALUES (?, 'b2b', 'new_company', ?, ?, '{}', ?)`)
    .run(thread, company, JSON.stringify(made), at);
  await row('t1', drop.id, { company: true, contact: true });
  await row('t2', drop.id, {});
  await row('t3', other.id, { company: true });
  const r = await merge(db, keep.id, drop.id, 'Ritvars Vilcins', { mode: 'ticked' });
  assert.equal(r.moved.mail_auto, 2);
  const all = await db.prepare('SELECT thread_id, company_id, made FROM tc_mail_auto ORDER BY thread_id').all();
  assert.deepEqual(all.map((a) => [a.thread_id, Number(a.company_id), JSON.parse(a.made)]), [
    ['t1', keep.id, { company: false, contact: true }],
    ['t2', keep.id, {}],
    ['t3', other.id, { company: true }],
  ]);
  assert.ok((await db.prepare('SELECT archived_at FROM tc_companies WHERE id = ?').get(drop.id)).archived_at, 'archived, not deleted');
});
