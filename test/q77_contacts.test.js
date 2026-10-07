// Q77, 07.10.2026: a caller made into a lead gets the contacts the call did not bring (their email),
// so a later email from that address JOINS the same person instead of becoming a new lead.
// Matching on arrival uses EVERY email and phone a person has.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { receive, qualify, listInbound } from '../src/intake.js';
import { findMatches } from '../src/identity.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const NEXT = 'First call';
const people = async (db) => Number((await db.prepare('SELECT COUNT(*) n FROM people').get()).n);
const waiting = async (db) => (await listInbound(db, { state: 'new' }));

async function aCall(db, ext = 'call-1', phone = '+371 2999 0001') {
  return receive(db, { channel: 'phone', externalId: ext, receivedAt: '2026-10-07T08:00:00Z', phone, body: 'Incoming call' });
}
async function anEmail(db, ext, email, name = 'Anna Ozola') {
  return receive(db, { channel: 'gmail', externalId: ext, receivedAt: '2026-10-07T10:00:00Z', name, email,
    body: 'Hello, about Navigation' });
}

test('call first, email second = ONE person', async () => {
  const db = await openDb(':memory:');
  const call = await aCall(db);
  const made = await qualify(db, call.id, { qualification: 'lead', createPerson: true, by: 'Ieva',
    nextAction: NEXT, stated: { email: 'anna@example.com' } });
  assert.ok(made.ok, made.error);
  const person = await db.prepare('SELECT * FROM people WHERE id = ?').get(made.personId);
  assert.equal(person.email, 'anna@example.com', 'the typed email is on the profile');
  assert.match(person.phone.replace(/\D/g, ''), /29990001/);

  const mail = await anEmail(db, 'gm-1', 'Anna@Example.com');
  const row = (await waiting(db)).find((r) => r.id === mail.id);
  assert.deepEqual({ ...row.joins }, { id: made.personId, name: person.name }, 'the Inbox says it joins them');

  const added = await qualify(db, mail.id, { qualification: 'lead', personId: row.joins.id, by: 'Ieva' });
  assert.ok(added.ok, added.error);
  assert.equal(await people(db), 1, 'one person, not two');
  assert.equal((await db.prepare('SELECT person_id FROM inbound WHERE id = ?').get(mail.id)).person_id, made.personId);
});

test('a typed email never replaces the one a person has, and still finds them', async () => {
  const db = await openDb(':memory:');
  const first = await anEmail(db, 'gm-a', 'anna@example.com');
  const made = await qualify(db, first.id, { qualification: 'lead', createPerson: true, by: 'Ieva', nextAction: NEXT });
  const call = await aCall(db, 'call-2', '+371 2999 0001');
  const before = (await waiting(db)).find((r) => r.id === call.id);
  assert.equal(before.joins, null, 'the number is not known yet');
  await qualify(db, call.id, { qualification: 'lead', personId: made.personId, by: 'Ieva',
    stated: { email: 'anna.work@example.com', phone: '+371 2999 0001' } });
  const p = await db.prepare('SELECT email, phone FROM people WHERE id = ?').get(made.personId);
  assert.equal(p.email, 'anna@example.com', 'the profile keeps the first email');
  assert.match(p.phone.replace(/\D/g, ''), /29990001/, 'the empty phone is filled');

  const second = await anEmail(db, 'gm-b', 'anna.work@example.com');
  const row = (await waiting(db)).find((r) => r.id === second.id);
  assert.equal(row.joins && row.joins.id, made.personId, 'the second email finds them too');
  const m = await findMatches(db, { email: 'anna.work@example.com' });
  assert.deepEqual(m[0].matchedOn, ['email']);
});

test('a typed email that belongs to somebody else stops the save and names them', async () => {
  const db = await openDb(':memory:');
  const first = await anEmail(db, 'gm-c', 'liga@example.com', 'Liga Kalnina');
  await qualify(db, first.id, { qualification: 'lead', createPerson: true, by: 'Ieva', nextAction: NEXT });
  const call = await aCall(db, 'call-3', '+371 2888 0002');
  const r = await qualify(db, call.id, { qualification: 'lead', createPerson: true, by: 'Ieva', nextAction: NEXT,
    stated: { email: 'liga@example.com' } });
  assert.equal(r.duplicate, true);
  assert.equal(r.strong, true);
  assert.equal(r.matches[0].name, 'Liga Kalnina');
  assert.equal(await people(db), 1);
});

test('a contact that does not look right is refused, not guessed at', async () => {
  const db = await openDb(':memory:');
  const call = await aCall(db);
  const bad = await qualify(db, call.id, { qualification: 'lead', createPerson: true, by: 'Ieva', nextAction: NEXT,
    stated: { email: 'anna at example' } });
  assert.equal(bad.error, 'that email does not look right');
  const short = await qualify(db, call.id, { qualification: 'lead', createPerson: true, by: 'Ieva', nextAction: NEXT,
    stated: { phone: '123' } });
  assert.equal(short.error, 'that phone number looks too short');
  const blank = await qualify(db, call.id, { qualification: 'lead', createPerson: true, by: 'Ieva', nextAction: NEXT,
    stated: { email: '   ' } });
  assert.ok(blank.ok, 'an empty field is simply not filled');
});

test('two people with the same number: no "joins" - that is a question for a person', async () => {
  const db = await openDb(':memory:');
  await db.prepare(`INSERT INTO people (id, name, phone, status) VALUES ('a', 'Anna', '29990001', 'New'), ('b', 'Juris', '29990001', 'New')`).run();
  const call = await aCall(db, 'call-4');
  assert.equal((await waiting(db)).find((r) => r.id === call.id).joins, null);
});

test('the card asks for the missing contact, and says who the message joins', () => {
  assert.match(APP, /\$\{r\.contact_email \? '' : `<label for="qEmail">Email<\/label><input id="qEmail" type="email"/);
  assert.match(APP, /\$\{r\.contact_phone \? '' : `<label for="qPhone">Phone<\/label><input id="qPhone" type="tel"/);
  assert.match(APP, /<span class="ib-joins">Joins \$\{esc\(r\.joins\.name\)\}<\/span>/);
  // H2 (security patch 32): the id is a JSON string, escaped for the attribute, never esc() inside quotes
  assert.match(APP, /doQualify\(\$\{Number\(r\.id\)\}, \{ personId: \$\{esc\(JSON\.stringify\(String\(r\.joins\.id \?\? ''\)\)\)\}, createPerson: false \}\)">Add to \$\{esc\(r\.joins\.name\)\}/);
  assert.match(APP, /typed\('#qEmail'\) \? \{ email: typed\('#qEmail'\) \}/);
  const help = fs.readFileSync(path.join(ROOT, 'config', 'help.json'), 'utf8');
  assert.match(help, /add the email or phone the message did not bring/, 'Help says it too');
});
