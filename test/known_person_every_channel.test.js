// A KNOWN PERSON LANDS ON THEIR PROFILE, ON EVERY CHANNEL (the owner, 14.10.2026: "Already handled" is gone as a
// reason, so a known person must land on their profile automatically). Before this, only the phone (src/sync.js
// storeCall), the SIS and email (Q74) asked "is this somebody already in Intake?"; the website, Meta, WhatsApp,
// LinkedIn, agent, open day and TikTok put every message in the Inbox with "Joins X / Add to X".
//   one person, still being worked with -> their history + Answer the question for today, no Inbox card
//   nobody                             -> the Inbox
//   two or more people                 -> the Inbox (the machine cannot choose)
//   a marked address or number         -> set aside, as before (the mark wins over the match; the phone pull unchanged)
//   a finished person (Admitted, Not proceeding) -> their profile and the step too (the owner, 14.10.2026, B), listed
//                                         on their owner's Due; the stage is never changed by machine
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { receive, qualify, listInbound, activePersonFor, setMark, messagesFor } from '../src/intake.js';
import { onePersonFor } from '../src/identity.js';
import { queueLeadAnswers } from '../src/leadanswers.js';
import { adapt, adaptAll, toIntake } from '../src/adapters.js';
import { fixtureFor } from '../src/fixtures.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const at = (h) => `2026-10-14T${String(h).padStart(2, '0')}:00:00Z`;
const inbox = (db) => listInbound(db, { state: 'new' });

// a channel's message the way the webhook hands it to receive(): the one question asked first
async function arrive(db, channel, raw) {
  const it = toIntake(adapt(channel, raw));
  return receive(db, { ...it, source: 'simulated', attachTo: await activePersonFor(db, { email: it.email, phone: it.phone }) });
}
async function personFrom(db, channel, raw, status = null) {
  const first = await receive(db, { ...toIntake(adapt(channel, raw)), source: 'simulated' });
  const q = await qualify(db, first.id, { qualification: 'lead', createPerson: true, by: 'Ieva', nextAction: 'First call' });
  assert.ok(q.ok, JSON.stringify(q));
  if (status) await db.prepare('UPDATE people SET status = ? WHERE id = ?').run(status, q.personId);
  return { pid: q.personId, cardId: first.id };
}
const openSteps = async (db, pid) => (await db.prepare(`SELECT label, due_at, owner FROM tasks WHERE person_id = ?
  AND label = 'Answer the question' AND done_at IS NULL`).all(pid));

test('the one question: email in any case, phone on its last 8 digits, every contact they have; a name alone never', async () => {
  const db = await openDb(':memory:');
  await db.prepare(`INSERT INTO people (id, name, email, phone, status) VALUES ('p1', 'Anna Ozola', 'Anna@Example.lv', '+371 20 111 222', 'New')`).run();
  await db.prepare(`INSERT INTO field_values (person_id, field, value, provenance, recorded_at, recorded_by)
    VALUES ('p1', 'email', 'anna.work@example.lv', 'operator', ?, 'Ieva')`).run(at(8));
  for (const c of [{ email: 'anna@example.lv' }, { email: ' ANNA@EXAMPLE.LV ' }, { phone: '20111222' }, { phone: '37120111222' },
    { email: 'anna.work@example.lv' }, { email: 'nobody@example.lv', phone: '+371 20 111 222' }]) {
    assert.equal((await onePersonFor(db, c) || {}).id, 'p1', JSON.stringify(c));
    assert.equal(await activePersonFor(db, c), 'p1', JSON.stringify(c));
  }
  assert.equal(await activePersonFor(db, 'anna@example.lv'), 'p1', 'the email poll still asks with an address alone');
  assert.equal(await onePersonFor(db, { email: 'other@example.lv' }), null);
  assert.equal(await onePersonFor(db, {}), null);
  const src = fs.readFileSync(path.join(ROOT, 'src', 'sync.js'), 'utf8');
  assert.match(src, /onePersonFor\(db, \{ email: contact\.email, phone: contact\.phone \}\)/, 'the phone and the SIS ask the same question');
  assert.doesNotMatch(src, /findMatches|isStrong/, 'no second matcher in the pollers');
});

test('website: a known person -> their history and Answer the question today, no card; consent and answers reach them', async () => {
  const db = await openDb(':memory:');
  const { pid } = await personFrom(db, 'website', fixtureFor('website'));
  assert.equal((await inbox(db)).length, 0);
  const r = await arrive(db, 'website', { ...fixtureFor('website'), submitted_at: at(10), message: 'Is there still a place?', consent_marketing: true });
  assert.equal(r.attached, true);
  assert.equal(r.personId, pid);
  assert.equal((await inbox(db)).length, 0, 'no Inbox card');
  const row = await db.prepare('SELECT state, person_id, processed_by FROM inbound WHERE id = ?').get(r.id);
  assert.deepEqual({ ...row }, { state: 'qualified', person_id: pid, processed_by: 'machine' });
  assert.ok((await messagesFor(db, pid)).some((m) => /still a place/.test(m.body)), 'what they wrote is on their History');
  const [step] = await openSteps(db, pid);
  assert.equal(step.due_at, new Date(at(10)).toISOString(),'due when they wrote, on their owner\'s Today');
  assert.equal(step.owner, 'Admissions');
  const p = await db.prepare('SELECT last_contact_at FROM people WHERE id = ?').get(pid);
  assert.equal(p.last_contact_at, new Date(at(10)).toISOString(),'last contact moves on');
  const consents = await db.prepare(`SELECT purpose FROM consents WHERE person_id = ? AND source = ?`).all(pid, `inbound #${r.id}`);
  assert.deepEqual(consents.map((c) => c.purpose).sort(), ['admissions', 'marketing']);
  const answered = await db.prepare(`SELECT field FROM field_values WHERE person_id = ? AND inbound_id = ?`).all(pid, r.id);
  assert.ok(answered.some((f) => f.field === 'form_programme'), 'the form\'s answers stay with the person');
  await arrive(db, 'website', { ...fixtureFor('website'), submitted_at: at(11) });
  assert.equal((await openSteps(db, pid)).length, 1, 'one open Answer the question at a time');
});

test('every channel that carries an email or a phone: known -> profile, unknown -> Inbox', async () => {
  const tik = (email) => ({ client_key: 'ck', event: 'lead.create', create_time: 1790000000 + Math.floor(Math.random() * 1e6),
    user_openid: 'oid-' + Math.random().toString(36).slice(2), content: JSON.stringify({ lead: { full_name: 'Ance Roze', email } }) });
  const channels = {
    website: () => fixtureFor('website'),
    google_form: () => fixtureFor('google_form'),
    whatsapp: () => fixtureFor('whatsapp'),
    open_day: () => fixtureFor('open_day'),
    agent: () => fixtureFor('agent'),
    in_person: () => fixtureFor('in_person'),
    tiktok: () => tik('ance@example.lv'),
    gmail: () => fixtureFor('gmail'),
  };
  for (const [channel, make] of Object.entries(channels)) {
    const db = await openDb(':memory:');
    const unknown = await arrive(db, channel, make());
    assert.ok(!unknown.attached, `${channel}: nobody yet -> the Inbox`);
    assert.equal((await inbox(db)).length, 1, `${channel}: one card`);
    const q = await qualify(db, unknown.id, { qualification: 'lead', createPerson: true, by: 'Ieva', nextAction: 'First call' });
    const again = await arrive(db, channel, make());
    assert.equal(again.attached, true, `${channel}: known -> their profile`);
    assert.equal(again.personId, q.personId, channel);
    assert.equal((await inbox(db)).length, 0, `${channel}: no Inbox card`);
    assert.equal((await openSteps(db, q.personId)).length, 1, `${channel}: Answer the question`);
  }
});

test('two people share the address: the Inbox card stays - the machine cannot choose', async () => {
  const db = await openDb(':memory:');
  await db.prepare(`INSERT INTO people (id, name, email, status) VALUES ('a', 'Anna', 'anna@example.lv', 'New'), ('b', 'Juris', 'anna@example.lv', 'New')`).run();
  const r = await arrive(db, 'website', fixtureFor('website'));
  assert.ok(!r.attached);
  const [card] = await inbox(db);
  assert.equal(card.id, r.id);
  assert.equal(card.joins, null, 'no one name to join: Make a lead shows both');
  // an email that points at one and a phone that points at the other is two people too
  const db2 = await openDb(':memory:');
  await db2.prepare(`INSERT INTO people (id, name, email, phone, status) VALUES ('a', 'Anna', 'anna@example.lv', NULL, 'New'),
    ('b', 'Juris', NULL, '+37120111222', 'New')`).run();
  assert.ok(!(await arrive(db2, 'website', fixtureFor('website'))).attached);
  assert.equal((await inbox(db2)).length, 1);
});

test('a marked address wins over the match: set aside with the mark, never on the profile', async () => {
  const db = await openDb(':memory:');
  const { pid, cardId } = await personFrom(db, 'website', fixtureFor('website'));
  assert.ok((await setMark(db, cardId, { mark: 'Internal', by: 'Ieva' })).ok);
  const r = await arrive(db, 'website', fixtureFor('website'));
  assert.ok(!r.attached);
  assert.equal(r.filtered, true);
  const row = await db.prepare('SELECT state, person_id, archive_note FROM inbound WHERE id = ?').get(r.id);
  assert.equal(row.state, 'filtered');
  assert.equal(row.person_id, null);
  assert.match(row.archive_note, /marked "Internal"/);
  assert.equal((await inbox(db)).length, 0, 'never the Inbox');
  assert.equal((await openSteps(db, pid)).length, 0, 'no step on the person');
  // the same for an email from them (Q74 path)
  const e = await receive(db, { channel: 'gmail', externalId: 'g-m', receivedAt: at(12), email: 'anna@example.lv', body: 'hello',
    attachTo: await activePersonFor(db, 'anna@example.lv'), joinOpenSender: true });
  assert.equal(e.filtered, true);
  assert.ok(!e.attached);
});

// The owner, 14.10.2026 (B): a finished person who gets in touch lands on their profile like anybody, with the step for
// their owner; their stage is never changed (no machine reopening).
test('a finished person (Admitted, Not proceeding) writes again: their profile and Answer the question, the stage untouched', async () => {
  for (const status of ['Admitted', 'Not proceeding']) {
    const db = await openDb(':memory:');
    const { pid } = await personFrom(db, 'website', fixtureFor('website'), status);
    await db.prepare("UPDATE tasks SET done_at = ? WHERE person_id = ?").run(at(9), pid);   // finishing closed their steps
    assert.equal(await activePersonFor(db, { email: 'anna@example.lv' }), pid, status);
    const r = await arrive(db, 'website', { ...fixtureFor('website'), submitted_at: at(10), message: 'A question about my diploma' });
    assert.equal(r.attached, true, status);
    assert.equal((await inbox(db)).length, 0, `${status}: no Inbox card`);
    assert.ok((await messagesFor(db, pid)).some((m) => /diploma/.test(m.body)), `${status}: on their History`);
    const steps = await openSteps(db, pid);
    assert.equal(steps.length, 1, `${status}: one Answer the question`);
    assert.equal(steps[0].due_at, new Date(at(10)).toISOString(), `${status}: due when they wrote`);
    const p = await db.prepare('SELECT status, last_contact_at FROM people WHERE id = ?').get(pid);
    assert.equal(p.status, status, 'the stage is not touched');
    assert.equal(p.last_contact_at, new Date(at(10)).toISOString(), 'last contact moves on');
  }
});

test('phone, the same rule: a finished person\'s missed call gets a Call back for their owner, the stage untouched', async () => {
  const { storeCall } = await import('../src/sync.js');
  const out = () => ({ seen: 0, logged: 0, callBack: 0, again: 0, filtered: 0, inbox: 0, noNumber: 0 });
  for (const status of ['Admitted', 'Not proceeding']) {
    const db = await openDb(':memory:');
    await db.prepare(`INSERT INTO people (id, name, phone, status, owner) VALUES ('f1', 'Finished', '+37129111222', ?, 'Admissions')`).run(status);
    const o = out();
    await storeCall(db, { uniqueid: 'u1', created_at: '2026-10-14T09:00:00.000Z', queue: '1001*Q-ADMISSION',
      caller_num: '29111222', picked_up: false, operator_name: null }, 'live', '2026-10-14T09:01:00Z', o);
    assert.equal(o.logged, 1, `${status}: on their history`);
    assert.equal(o.callBack, 1, `${status}: a Call back`);
    const t = await db.prepare(`SELECT label, due_at, owner FROM tasks WHERE person_id = 'f1' AND done_at IS NULL`).all();
    assert.deepEqual(t.map((x) => [x.label, x.due_at, x.owner]), [['Call back', '2026-10-14T09:00:00.000Z', 'Admissions']]);
    assert.equal((await db.prepare(`SELECT status FROM people WHERE id = 'f1'`).get()).status, status);
    assert.equal((await inbox(db)).length, 0);
  }
});

test('a lead form (ids only on arrival) lands on the profile once its answers name a known person', async () => {
  const delivery = (id) => ({ object: 'page', entry: [{ id: 'page-1', time: 1727690000,
    changes: [{ field: 'leadgen', value: { leadgen_id: id, page_id: 'page-1', form_id: 'form-1', created_time: 1727690000 } }] }] });
  const meta = (email) => async () => ({ ok: true, status: 200,
    json: async () => ({ field_data: [{ name: 'full_name', values: ['Anna Ozola'] }, { name: 'email', values: [email] }] }) });
  const env = { META_PAGE_ACCESS_TOKEN: 'test-token-not-real' };
  const db = await openDb(':memory:');
  const { pid } = await personFrom(db, 'website', fixtureFor('website'));
  const ev = adaptAll('facebook', delivery('lead-known'))[0];
  const got = await receive(db, { ...toIntake(ev), source: 'simulated', attachTo: await activePersonFor(db, toIntake(ev)) });
  assert.ok(!got.attached, 'ids only: nothing to match on yet');
  assert.equal((await queueLeadAnswers(db, ev, { env, fetchImpl: meta('ANNA@example.lv') })).state, 'done');
  const row = await db.prepare('SELECT state, person_id FROM inbound WHERE id = ?').get(got.id);
  assert.deepEqual({ ...row }, { state: 'qualified', person_id: pid });
  assert.equal((await inbox(db)).length, 0);
  assert.equal((await openSteps(db, pid)).length, 1);
  // somebody new stays in the Inbox, now with their name and address
  const ev2 = adaptAll('facebook', delivery('lead-new'))[0];
  const got2 = await receive(db, { ...toIntake(ev2), source: 'simulated' });
  await queueLeadAnswers(db, ev2, { env, fetchImpl: meta('new.person@example.lv') });
  const [card] = await inbox(db);
  assert.equal(card.id, got2.id);
  assert.equal(card.contact_email, 'new.person@example.lv');
});

test('the webhook, the simulate button and the Console all ask the one question; phone, SIS and Mailchimp ask their own', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
  assert.equal((src.match(/attachTo: await knownPersonOf\(it\)/g) || []).length, 3);
  assert.match(src, /const MATCHED_ELSEWHERE = new Set\(\['phone', 'sis', 'mailchimp'\]\)/);
  assert.match(src, /activePersonFor\(db, \{ email: it\.email, phone: it\.phone \}\)/);
  assert.match(src, /const known = await onePersonFor\(db, \{ email: ev\.senderEmail \}\)/, 'Mailchimp: set aside, noted on the person');
});

// ------------------------------------------------------------ the real route ---
function start(env = {}) {
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
const H = { 'content-type': 'application/json', 'x-acting-as': 'Ieva' };
const send = (base, channel, payload) => fetch(`${base}/api/inbound/${channel}`, { method: 'POST',
  headers: { ...H, 'x-crm-simulated': '1' }, body: JSON.stringify(payload) }).then(async (r) => ({ status: r.status, json: await r.json() }));
const post = (base, p, b) => fetch(base + p, { method: 'POST', headers: H, body: JSON.stringify(b) }).then((r) => r.json());
const get = (base, p) => fetch(base + p, { headers: H }).then((r) => r.json());

test('the webhook route: unknown -> Inbox; Make a lead; the next message -> their profile, no card', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  for (const channel of ['website', 'whatsapp', 'open_day', 'agent']) {
    const first = await send(s.base, channel, fixtureFor(channel));
    assert.equal(first.status, 200, JSON.stringify(first.json));
    assert.equal(first.json.outcome, 'waiting to be looked at', channel);
    const q = await post(s.base, `/api/intake/${first.json.inboundId}/qualify`, { qualification: 'lead', createPerson: true,
      nextAction: 'First call', by: 'Ieva' });
    assert.ok(q.ok, JSON.stringify(q));
    const again = await send(s.base, channel, fixtureFor(channel));
    assert.equal(again.json.outcome, "on the person's profile, not the Inbox", channel);
    const waiting = (await get(s.base, '/api/intake?state=new')).rows;
    assert.ok(!waiting.some((r) => r.id === again.json.inboundId), `${channel}: no Inbox card`);
    const person = await get(s.base, `/api/people/${q.personId}`);
    assert.ok(person.tasks.some((x) => x.label === 'Answer the question' && !x.done_at), `${channel}: the owner's step`);
  }
  // the open day booking from a known person is on the Open Day list at once
  const od = await get(s.base, '/api/intake?state=qualified');
  assert.ok(od.rows.some((r) => r.channel === 'open_day' && r.person_id), 'the booking is linked');
  // the simulate button takes the same path
  const sim = await post(s.base, '/api/inbound/website/simulate', {});
  assert.equal(sim.outcome, "on the person's profile, not the Inbox");
  assert.ok(sim.personId);

  // B (14.10.2026): a finished person who writes again is on their owner's Due and Home, their stage unchanged; any
  // other leftover step of a finished person stays off the lists, as before
  const pid = sim.personId;
  const cold = await post(s.base, `/api/people/${pid}/status`, { status: 'Not proceeding', closedTag: 'cold', by: 'Ieva' });
  assert.ok(!cold.error, JSON.stringify(cold));
  await post(s.base, `/api/people/${pid}/task`, { label: 'Get in touch', by: 'Ieva' });
  const back = await send(s.base, 'website', fixtureFor('website'));
  assert.equal(back.json.outcome, "on the person's profile, not the Inbox");
  const due = (await get(s.base, '/api/tasks?scope=open')).filter((x) => x.person_id === pid);
  assert.deepEqual(due.map((x) => x.label), ['Answer the question'], 'the step is listed; the leftover is not');
  const home = await get(s.base, '/api/summary');
  assert.ok([...home.overdue, ...home.today].some((x) => x.person_id === pid && x.label === 'Answer the question'), 'Home counts it');
  assert.equal((await get(s.base, `/api/people/${pid}`)).status, 'Not proceeding', 'never reopened by machine');
});
