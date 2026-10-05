// Q8 (05.10.2026): the programme a person picked on a form reaches the Inbox on EVERY channel.
//
// toIntake() used to pass the adapter's `extracted` on for the website only (Q3), so an agent's
// lead, a Meta lead form, a typed-in contact, an Open Day booking or an apply-sheet answer lost
// its programme before the database. And even the website's answer stopped at the stored row:
// the suggestion read the message text only, so a form lead that never typed the programme into
// "Additional Comments" read as "nothing about studying was mentioned", with no interest
// preselected in the Inbox. Each channel below goes through the real adapter, the real toIntake
// and the real receive(), the same three steps every inbound route takes.

import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { adapt, adaptAll, toIntake } from '../src/adapters.js';
import { receive, listInbound, qualify } from '../src/intake.js';
import { programmeFromAnswer } from '../src/extract.js';

async function land(channel, raw, { all = false } = {}) {
  const db = await openDb(':memory:');
  const ev = all ? adaptAll(channel, raw)[0] : adapt(channel, raw);
  const r = await receive(db, { ...toIntake(ev), source: 'simulated' });
  const [item] = await listInbound(db, { state: 'new' });
  const field = (n) => (item.fields || []).find((x) => x.field === n);
  return { db, r, item, field };
}

const leadgen = (programme) => ({ object: 'page', entry: [{ id: 'page-1', time: 1727690000,
  changes: [{ field: 'leadgen', value: { leadgen_id: 'lead-q8', form_id: 'form-1', ad_id: 'ad-1',
    created_time: 1727690000, full_name: 'Liga Ozola', email: 'liga@example.com', programme } }] }] });

// --------------------------------------------- every channel that carries one --
const CASES = [
  ['website (the control case)', 'website',
    { tranid: 'q8-1', 'Name Surname': 'Janis Berzins', Email: 'janis@example.com', 'Study Program': 'Navigation' }],
  ['agent', 'agent',
    { partner_id: 'p-1', partner_ref: 'q8-2', name: 'Andris Kalns', email: 'andris@example.com', programme: 'Navigation' }],
  ['in person (typed in)', 'in_person',
    { entry_id: 'q8-3', name: 'Ilze Liepa', phone: '+37120000001', what_they_said: 'Came by the desk', programme: 'Navigation', by: 'Ieva' }],
  ['open day (PARKED, adapter still runs)', 'open_day',
    { booking_ref: 'q8-4', name: 'Karlis Ozols', email: 'karlis@example.com', programme: 'Navigation' }],
  ['apply sheet (DROPPED, adapter still runs)', 'google_form',
    { responseId: 'q8-5', answers: { 'Vārds uzvārds': ['Maija Koka'], Programma: ['Navigation'] } }],
  ['instagram lead form', 'instagram', leadgen('Navigation')],
  ['messenger lead form', 'messenger', leadgen('Navigation')],
];

for (const [label, channel, raw] of CASES) {
  test(`Q8 ${label}: the programme they picked reaches the Inbox`, async () => {
    const { item, r, field } = await land(channel, raw);
    assert.equal(field('form_programme')?.value, 'Navigation', 'kept as they gave it');
    assert.equal(field('form_programme')?.provenance, 'provider', 'as their own answer');
    assert.equal(field('interest')?.value, 'NAV', 'the Inbox preselects the programme it names');
    assert.equal(field('interest')?.provenance, 'extracted', 'as a suggestion a person confirms, never a fact');
    assert.equal(r.suggested, 'lead', 'somebody who picked a programme has said what they want');
    assert.match(item.suggestion_why, /programme NAV/);
  });
}

test('Q8 facebook lead form (the page delivery, adaptAll): the programme reaches the Inbox', async () => {
  const { field } = await land('facebook', leadgen('Marine Engineering'), { all: true });
  assert.equal(field('form_programme')?.value, 'Marine Engineering');
  assert.equal(field('interest')?.value, 'ENG');
});

// ------------------------------------------------------------- told the truth --
test('Q8: an answer that names none of our programmes is kept, and suggests nothing', async () => {
  const { field, r } = await land('agent',
    { partner_id: 'p-1', partner_ref: 'q8-6', name: 'Toms Egle', programme: 'Hotel management' });
  assert.equal(field('form_programme')?.value, 'Hotel management', 'their words stay, unmapped');
  assert.equal(field('interest'), undefined, 'never guessed into one of ours');
  assert.equal(r.suggested, 'unclear');
});

test('Q8: no programme given means none stored, none invented', async () => {
  const { field, r } = await land('agent', { partner_id: 'p-1', partner_ref: 'q8-7', name: 'Anna Berza' });
  assert.equal(field('form_programme'), undefined);
  assert.equal(field('interest'), undefined);
  assert.equal(r.suggested, 'unclear');
});

test('Q8: what they wrote in the message outranks the form pick for the suggestion; both are kept', async () => {
  const { field } = await land('website', { tranid: 'q8-8', 'Name Surname': 'Edgars Lacis',
    'Study Program': 'Navigation', 'Additional Comments': 'Actually I want marine engineering' });
  assert.equal(field('interest')?.value, 'ENG', 'the message is read first, as before');
  assert.equal(field('form_programme')?.value, 'Navigation', 'the form answer is still stored');
});

test('Q8: a direct message carries no form answers, exactly as before', async () => {
  const dm = { object: 'instagram', entry: [{ id: 'ig-1', time: 1727690000, messaging: [{
    sender: { id: 'ig-user-1', username: 'someone' }, recipient: { id: 'ig-page' }, timestamp: 1727690000,
    message: { mid: 'm-q8', text: 'Hi' } }] }] };
  const ev = adapt('instagram', dm);
  assert.equal(toIntake(ev).answers, null);
  const { field, r } = await land('instagram', dm);
  assert.equal(field('form_programme'), undefined);
  assert.equal(r.suggested, 'unclear');
});

test('Q8: the code itself, any case, is a programme; other words go through the message vocabulary', () => {
  assert.equal(programmeFromAnswer('nav'), 'NAV');
  assert.equal(programmeFromAnswer('MT WTT'), 'MT WTT');
  assert.equal(programmeFromAnswer('Wind turbine technician'), 'MT WTT');
  assert.equal(programmeFromAnswer(''), null);
  assert.equal(programmeFromAnswer('Hotel management'), null);
});

// ----------------------------------------------------------- onto the person --
test('Q8: qualifying an agent lead carries the answer onto the person; confirming sets the programme', async () => {
  const { db, item } = await land('agent',
    { partner_id: 'p-1', partner_ref: 'q8-9', name: 'Rihards Vitols', email: 'rihards@example.com', programme: 'Navigation' });
  const q = await qualify(db, item.id, { qualification: 'lead', createPerson: true, by: 'Ieva',
    confirmFields: ['interest'], nextAction: 'Call and establish interest' });
  assert.ok(q.ok, JSON.stringify(q));
  const p = await db.prepare('SELECT programme FROM people WHERE id = ?').get(q.personId);
  assert.equal(p.programme, 'NAV', 'the confirmed interest is the person programme');
  const kept = await db.prepare(`SELECT value, provenance FROM field_values
    WHERE person_id = ? AND field = 'form_programme'`).get(q.personId);
  assert.deepEqual({ ...kept }, { value: 'Navigation', provenance: 'provider' }, 'and their own answer stays on record');
});

test('Q8: NOT confirmed, the suggestion never becomes the person programme', async () => {
  const { db, item } = await land('agent',
    { partner_id: 'p-1', partner_ref: 'q8-10', name: 'Liene Avota', programme: 'Navigation' });
  const q = await qualify(db, item.id, { qualification: 'unclear', createPerson: true, by: 'Ieva',
    nextAction: 'Call and establish interest' });
  assert.ok(q.ok, JSON.stringify(q));
  const p = await db.prepare('SELECT programme FROM people WHERE id = ?').get(q.personId);
  assert.equal(p.programme, null);
});
