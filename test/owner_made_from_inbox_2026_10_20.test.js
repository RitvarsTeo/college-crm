// THE OWNER OF A LEAD MADE FROM THE INBOX (Admissions, 20.10.2026). Ieva made a lead from an Inbox email and it got owner
// Marketing; she changed it to Admissions by hand. The cause: Make a lead with no programme picked files the person as
// 'unclear' (doQualify: interest ? 'lead' : 'unclear'), and ownerFor('unclear') is config routing.unclear = Marketing
// (decided 23.09.2026, when Marketing triaged unclear contacts). Production, read-only 20.10.2026: one person
// (p3dcd6d7...), made by Ieva Gudaneca from gmail as unclear on 19.10, owner changed by her to Admissions at 09:02; none
// left with owner Marketing. Now a person made or added to from the Inbox is Admissions (routing.madeFromInbox) unless
// a Marketing user made it unclear: the 23.09 rule still holds for them.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { receive, qualify, ownerFor, ownerForMade, roleOfMaker } from '../src/intake.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const SERVER = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');

let n = 0;
async function card(db, body = 'Labdien, vai varat atsūtīt vairāk informācijas?') {
  n++;
  return receive(db, { channel: 'gmail', body, name: 'Anna Testa ' + n, email: `anna${n}@example.com`, externalId: 'own-' + n });
}

test('the cause, pinned: no programme on the card files it unclear, and unclear routes to Marketing', () => {
  assert.match(APP, /const qualification = interest \? 'lead' : 'unclear';/);
  assert.equal(ownerFor('unclear'), 'Marketing');
  assert.equal(CONFIG.routing.unclear, 'Marketing', 'the 23.09.2026 rule is kept, not rewritten');
  assert.equal(CONFIG.routing.madeFromInbox, 'Admissions');
  assert.match(CONFIG.routing._madeFromInbox, /20\.10\.2026/);
});

test('the maker\'s role: by the config name, or a signed-in full name\'s first word', () => {
  assert.equal(roleOfMaker('Ieva'), 'Admissions');
  assert.equal(roleOfMaker('Ieva Gudaneca'), 'Admissions', 'the production account name');
  assert.equal(roleOfMaker('Tetiana'), 'Marketing');
  assert.equal(roleOfMaker('Tetiana Somebody'), 'Marketing');
  assert.equal(roleOfMaker('Maris Cirulis'), 'Other');
  assert.equal(roleOfMaker('Admissions'), null, 'the shared account is nobody in config: not Marketing');
  assert.equal(roleOfMaker(''), null);
  assert.equal(ownerForMade('unclear', 'Ieva Gudaneca'), 'Admissions');
  assert.equal(ownerForMade('unclear', 'Admissions'), 'Admissions');
  assert.equal(ownerForMade('unclear', 'Laura Skirmante'), 'Admissions');
  assert.equal(ownerForMade('unclear', 'Tetiana'), 'Marketing', 'the rule the owner set, for Marketing\'s own');
  assert.equal(ownerForMade('lead', 'Tetiana'), 'Admissions');
  assert.equal(ownerForMade('lead', 'Ieva'), 'Admissions');
});

test('Ieva makes a lead from an Inbox email without a programme: owner Admissions, and so is the next step', async () => {
  const db = await openDb(':memory:');
  const r = await card(db);
  const q = await qualify(db, r.id, { qualification: 'unclear', createPerson: true, by: 'Ieva Gudaneca', nextAction: 'Follow up',
    nextActionDue: '2026-10-22T09:00:00.000Z' });
  assert.equal(q.ok, true);
  assert.equal(q.owner, 'Admissions');
  const p = await db.prepare('SELECT owner, qualification FROM people WHERE id = ?').get(q.personId);
  assert.deepEqual({ ...p }, { owner: 'Admissions', qualification: 'unclear' }, 'the qualification still says no programme yet');
  assert.equal((await db.prepare('SELECT owner FROM tasks WHERE person_id = ?').get(q.personId)).owner, 'Admissions');
  assert.match((await db.prepare("SELECT body FROM events WHERE person_id = ? AND kind = 'task'").get(q.personId)).body, /, Admissions$/);
  await db.close();
});

test('Add to somebody we have, no programme picked: their owner becomes Admissions, never Marketing', async () => {
  const db = await openDb(':memory:');
  const first = await qualify(db, (await card(db)).id, { qualification: 'lead', createPerson: true, by: 'Ieva', nextAction: 'Follow up',
    stated: { interest: 'Navigation' } });
  const again = await receive(db, { channel: 'gmail', body: 'Paldies!', name: 'Anna', email: 'other@example.com', externalId: 'own-again' });
  const q = await qualify(db, again.id, { qualification: 'unclear', personId: first.personId, by: 'Ieva' });
  assert.equal(q.owner, 'Admissions');
  assert.equal((await db.prepare('SELECT owner FROM people WHERE id = ?').get(first.personId)).owner, 'Admissions');
  await db.close();
});

test('a Marketing user making it unclear: Marketing, as decided 23.09.2026', async () => {
  const db = await openDb(':memory:');
  const q = await qualify(db, (await card(db)).id, { qualification: 'unclear', createPerson: true, by: 'Tetiana', nextAction: 'Follow up' });
  assert.equal(q.owner, 'Marketing');
  assert.equal((await db.prepare('SELECT owner FROM people WHERE id = ?').get(q.personId)).owner, 'Marketing');
  await db.close();
});

test('the person page says the person\'s own owner as Routed to', () => {
  assert.match(SERVER, /p\.routedTo = p\.owner \|\| ownerFor\(p\.qualification \|\| 'raw'\);/);
});

test('the Help center says it in one sentence', () => {
  const help = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'help.json'), 'utf8'));
  const q = help.faq.find((x) => x.id === 'lead-owner');
  assert.ok(q);
  assert.match(q.a, /Admissions/);
  assert.match(q.a, /programme/);
  assert.equal(q.a.split(/[.!?](\s|$)/).filter((x) => x && x.trim()).length, 1, 'one sentence');
});
