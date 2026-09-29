// Item 14, 30.09.2026: a delivery carrying three messages gives three rows.
//
// One Meta webhook delivery can carry several entries, several changes inside an
// entry, several messaging events inside a change, and WhatsApp several messages
// inside one value. Every one of those was read as [0] and the rest were dropped -
// silently, with a 200 going back to the provider, so a person's message could go
// missing and nothing anywhere would have said so.
import test from 'node:test';
import assert from 'node:assert/strict';
import { adapt, adaptAll } from '../src/adapters.js';

const waMsg = (id, body, from = '37120000001') =>
  ({ id, from, timestamp: '1700000000', text: { body } });
const wa = (msgs, contacts) => ({ entry: [{ changes: [{ value: { contacts, messages: msgs } }] }] });
const fbMsg = (mid, text, sender = 's1') =>
  ({ message: { mid, text }, sender: { id: sender }, recipient: { id: 'page' }, timestamp: 1700000000 });

test('three WhatsApp messages in one delivery give three events', () => {
  const out = adaptAll('whatsapp', wa(
    [waMsg('m1', 'one'), waMsg('m2', 'two'), waMsg('m3', 'three')],
    [{ wa_id: '37120000001', profile: { name: 'A Person' } }]));
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((e) => e.externalEventId), ['m1', 'm2', 'm3']);
  assert.deepEqual(out.map((e) => e.messageBody), ['one', 'two', 'three']);
  for (const e of out) assert.equal(e.senderName, 'A Person', 'the contact is carried onto every message');
});

test('the contact is matched to its own message when several people write', () => {
  const out = adaptAll('whatsapp', wa(
    [waMsg('m1', 'hi', '371111'), waMsg('m2', 'hello', '371222')],
    [{ wa_id: '371111', profile: { name: 'First' } }, { wa_id: '371222', profile: { name: 'Second' } }]));
  assert.deepEqual(out.map((e) => e.senderName), ['First', 'Second']);
});

test('several entries, changes and messaging events are all kept', () => {
  const raw = { entry: [
    { messaging: [fbMsg('a', '1'), fbMsg('b', '2')] },
    { messaging: [fbMsg('c', '3')] },
  ] };
  assert.equal(adaptAll('facebook', raw).length, 3);
  assert.deepEqual(adaptAll('facebook', raw).map((e) => e.externalEventId), ['a', 'b', 'c']);
});

test('lead forms and direct messages in one delivery are both kept', () => {
  const raw = { entry: [{
    changes: [{ field: 'leadgen', value: { leadgen_id: 'L1', full_name: 'Lead One', created_time: 1700000000 } }],
    messaging: [fbMsg('d1', 'a message')],
  }] };
  const out = adaptAll('instagram', raw);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((e) => e.externalEventId), ['L1', 'd1']);
});

test('adapt() still answers with one event, because the rest of the app rests on it', () => {
  const one = adapt('whatsapp', wa([waMsg('m1', 'one')], [{ wa_id: '37120000001' }]));
  assert.equal(one.externalEventId, 'm1');
  assert.ok(!Array.isArray(one), 'still a single event');
  assert.equal(adaptAll('website', { submission_id: 's1', submitted_at: '2026-09-30T10:00:00Z', name: 'X' }).length, 1,
    'a channel that carries one thing still gives one');
});

test('an empty delivery is still refused, rather than silently giving nothing', () => {
  assert.throws(() => adaptAll('whatsapp', wa([], [])), /message id/);
});
