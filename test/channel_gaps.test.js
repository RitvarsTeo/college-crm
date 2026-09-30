// The channel gaps Session C found on 30.09.2026 (crm-channel-docs HANDOVER.md, C1-C7), fixed by
// Session B the same day on Ritvars' "LETS DO ALL as per maximum in our code".
//
// NOTHING HERE CALLS A PROVIDER. Every token and secret below is a fake that says so.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { adaptAll } from '../src/adapters.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export function start(env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], { env: { ...process.env,
      PORT: '0', CRM_DB: ':memory:', DATASET: 'empty', CRM_AUTH: '', CRM_PUBLIC: '', DATABASE_URL: '',
      CRM_DB_DATABASE_URL_UNPOOLED: '', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const look = (d) => { out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, base: `http://127.0.0.1:${m[1]}` }); };
    child.stdout.on('data', look); child.stderr.on('data', look);
    child.on('exit', () => reject(new Error(out)));
  });
}
const send = (base, channel, payload) => fetch(`${base}/api/inbound/${channel}`, { method: 'POST',
  headers: { 'content-type': 'application/json', 'x-crm-simulated': '1', 'x-acting-as': 'Ieva' },
  body: JSON.stringify(payload) }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));
const newLeads = (base) => fetch(`${base}/api/intake?state=new`, { headers: { 'x-acting-as': 'Ieva' } })
  .then((r) => r.json()).then((j) => (Array.isArray(j) ? j : j.items || j.rows || []));

// ------------------------------------------------------------------ C1 ----
// Decided by Ritvars 30.09 (popup B): the Facebook Page registers ONE Meta address,
// /api/inbound/facebook. Inside it, messaging[] is Messenger and a leadgen change is Facebook.
const page = {
  object: 'page',
  entry: [{
    id: 'page-1', time: 1727690000,
    changes: [{ field: 'leadgen', value: { leadgen_id: 'lead-1', form_id: 'form-1', ad_id: 'ad-1', created_time: 1727690000 } }],
    messaging: [{ sender: { id: 'psid-1' }, recipient: { id: 'page-1' }, timestamp: 1727690001000,
      message: { mid: 'm-1', text: 'Hello, I want to study navigation' } }],
  }],
};

test('C1: a Page delivery on the facebook address: messages are Messenger, lead forms are Facebook', () => {
  const evs = adaptAll('facebook', page);
  assert.deepEqual(evs.map((e) => [e.channel, e.externalEventId]), [['facebook', 'lead-1'], ['messenger', 'm-1']]);
  // Instagram keeps its own channel for both
  assert.deepEqual(adaptAll('instagram', page).map((e) => e.channel), ['instagram', 'instagram']);
});

test('C1 over the wire: one POST to /api/inbound/facebook lands as one Messenger and one Facebook item', async (t) => {
  const s = await start({ CHANNEL_MODE_FACEBOOK: 'test' });
  t.after(() => s.child.kill());
  const r = await send(s.base, 'facebook', page);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const items = await newLeads(s.base);
  assert.deepEqual(items.map((i) => i.channel).sort(), ['facebook', 'messenger']);
  // a Meta retry of the same delivery adds nothing
  await send(s.base, 'facebook', page);
  assert.equal((await newLeads(s.base)).length, 2);
});

// ------------------------------------------------------------------ C4 ----
// Open Day: the booking tool sends the booking, and later whether the person came. The second
// message has the same booking_ref, so it used to be dropped as a repeat. Now a linked booking is a
// registration on the Open Day list, and attendance from the tool updates it exactly as the hand
// tick on that list does ("Attended the visit" + "Follow up after the visit").
const booking = (over = {}) => ({ booking_ref: 'od-77', event_id: 'openday-2026-10', booked_at: '2026-09-30T08:00:00.000Z',
  name: 'Gatis Purmalis', email: 'gatis.p@example.com', phone: '+37126550077', programme: 'NAV', slot: '14:00', ...over });
const qualifyItem = (base, id) => fetch(`${base}/api/intake/${id}/qualify`, { method: 'POST',
  headers: { 'content-type': 'application/json', 'x-acting-as': 'Ieva' },
  body: JSON.stringify({ qualification: 'lead', createPerson: true, nextAction: 'Call after the visit', by: 'Ieva' }) })
  .then((r) => r.json());
const personOf = (base, id) => fetch(`${base}/api/people/${id}`, { headers: { 'x-acting-as': 'Ieva' } }).then((r) => r.json());

test('C4: attendance sent later for the same booking reaches the Open Day list and the person', async (t) => {
  const s = await start({ CHANNEL_MODE_OPEN_DAY: 'test' });
  t.after(() => s.child.kill());
  const b1 = await send(s.base, 'open_day', booking());
  assert.equal(b1.status, 200);
  // attendance arrives before anybody linked the booking: kept, not dropped
  const a1 = await send(s.base, 'open_day', booking({ attended: true }));
  assert.equal(a1.json.outcome, 'attendance recorded');
  assert.equal((await newLeads(s.base)).length, 1, 'still one item in New Leads');

  const q = await qualifyItem(s.base, b1.json.inboundId);
  assert.equal(q.ok, true, JSON.stringify(q));
  let person = await personOf(s.base, q.personId);
  assert.equal(person.registrations.length, 1, 'the booking is on the Open Day list');
  assert.equal(person.registrations[0].open_day_id, 'openday-2026-10');
  assert.equal(person.registrations[0].slot, '14:00');
  assert.equal(person.registrations[0].attended, 1);
  assert.equal(person.timeline.filter((e) => e.subject === 'Attended the visit').length, 1);
  assert.ok(person.tasks.some((x) => x.label === 'Follow up after the visit' && !x.done_at));

  // the tool sends the same again: nothing new
  const a2 = await send(s.base, 'open_day', booking({ attended: true }));
  assert.equal(a2.json.outcome, 'already had it');
  person = await personOf(s.base, q.personId);
  assert.equal(person.timeline.filter((e) => e.subject === 'Attended the visit').length, 1);
  assert.equal(person.tasks.filter((x) => x.label === 'Follow up after the visit').length, 1);

  // a correction from the tool
  const a3 = await send(s.base, 'open_day', booking({ attended: 'false' }));
  assert.equal(a3.json.outcome, 'attendance recorded');
  person = await personOf(s.base, q.personId);
  assert.equal(person.registrations[0].attended, 0);
  assert.equal(person.timeline.filter((e) => e.subject === 'Did not attend').length, 1);
  const days = await fetch(`${s.base}/api/opendays`, { headers: { 'x-acting-as': 'Ieva' } }).then((r) => r.json());
  assert.equal(days.find((d) => d.id === 'openday-2026-10').registrations.length, 1);
});

test('C4: a booking with no attendance yet is a registration with attendance not marked', async (t) => {
  const s = await start({ CHANNEL_MODE_OPEN_DAY: 'test' });
  t.after(() => s.child.kill());
  const b1 = await send(s.base, 'open_day', booking({ booking_ref: 'od-78', email: 'other@example.com', phone: '+37126550078' }));
  const q = await qualifyItem(s.base, b1.json.inboundId);
  const person = await personOf(s.base, q.personId);
  assert.equal(person.registrations.length, 1);
  assert.equal(person.registrations[0].attended, null);
  // an unreadable attendance value is ignored, not guessed
  const a = await send(s.base, 'open_day', booking({ booking_ref: 'od-78', attended: 'maybe' }));
  assert.equal(a.json.outcome, 'already had it');
});
