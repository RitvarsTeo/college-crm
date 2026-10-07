// What a real provider does, before and during a real connection.
//
// Everything here was proved against the running server on 24.09.2026 BEFORE it
// was written, because three of these were genuine faults that every existing
// test walked past:
//
//   1. Meta GETs the webhook with a challenge before it will save the
//      subscription. That route did not exist, so it answered 404 and Facebook
//      could never have been connected at all. It never got as far as a message.
//   2. Mailchimp only ever posts application/x-www-form-urlencoded. The handler
//      ran JSON.parse on every body, so a real Mailchimp event answered 400.
//   3. An HTML form sends a ticked checkbox as the STRING "true". The website
//      adapter compared with === true, so a real form with both consent boxes
//      ticked recorded consent as NOT GIVEN. Consent is a legal record.
//
// The lesson these share: every one of them passed when driven by a JSON fixture
// we wrote ourselves. None of them survived contact with the shape a provider
// actually sends.

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { parseInboundBody, parseFormEncoded, unwrapPubSub, handshake } from '../src/inbound.js';
import { adapt, toIntake, truthy } from '../src/adapters.js';
import { openDb } from '../src/db.js';
import { receive, qualify } from '../src/intake.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));

// ------------------------------------------------------------- handshakes --

test('Meta echoes its challenge back, or nothing is ever connected', async () => {
  const env = { META_VERIFY_TOKEN: 'a-token-we-chose' };
  const url = new URL('https://x/api/inbound/facebook?hub.mode=subscribe'
    + '&hub.verify_token=a-token-we-chose&hub.challenge=1580227279');
  const h = handshake('facebook', url, env);
  assert.equal(h.ok, true);
  assert.equal(h.status, 200);
  assert.equal(h.body, '1580227279', 'the exact challenge, or Meta refuses the webhook');
  assert.equal(h.contentType, 'text/plain', 'Meta wants plain text, not JSON');
});

test('a wrong verify token is refused, and says nothing useful to whoever guessed', async () => {
  const env = { META_VERIFY_TOKEN: 'a-token-we-chose' };
  const url = new URL('https://x/api/inbound/facebook?hub.mode=subscribe'
    + '&hub.verify_token=not-it&hub.challenge=1580227279');
  const h = handshake('facebook', url, env);
  assert.equal(h.ok, false);
  assert.equal(h.status, 403);
  assert.ok(!String(h.how).includes('a-token-we-chose'), 'the real token must never be echoed back');
});

test('with no verify token set we say so, rather than letting anybody subscribe', async () => {
  const url = new URL('https://x/api/inbound/facebook?hub.mode=subscribe'
    + '&hub.verify_token=anything&hub.challenge=1');
  const h = handshake('facebook', url, {});
  assert.equal(h.ok, false);
  assert.equal(h.missingSecret, true);
  assert.equal(h.status, 503, 'not configured is not the same as refused');
});

test('all four Meta channels share the one handshake', async () => {
  const env = { META_VERIFY_TOKEN: 'tok' };
  for (const c of ['facebook', 'instagram', 'messenger', 'whatsapp']) {
    const url = new URL(`https://x/api/inbound/${c}?hub.mode=subscribe&hub.verify_token=tok&hub.challenge=42`);
    assert.equal(handshake(c, url, env).body, '42', c + ' must answer the same handshake');
  }
});

test('Mailchimp checks the URL works before it will save it', async () => {
  const h = handshake('mailchimp', new URL('https://x/api/inbound/mailchimp'), {});
  assert.equal(h.ok, true);
  assert.equal(h.status, 200, 'Mailchimp refuses to save a webhook whose GET fails');
});

test('a channel with no handshake says so plainly', async () => {
  assert.equal(handshake('website', new URL('https://x/api/inbound/website'), {}).status, 405);
  assert.equal(handshake('nonsense', new URL('https://x/a'), {}).status, 404);
});

// ------------------------------------------------------- reading the body --

test('a real Mailchimp webhook is form-encoded, and is read', async () => {
  const body = 'type=unsubscribe&fired_at=2026-09-24+10%3A00%3A00'
    + '&data%5Bemail%5D=liga%40inbox.lv&data%5Bid%5D=8a25ff1d98&data%5Blist_id%5D=c6ab4facba';
  const r = parseInboundBody('mailchimp', 'application/x-www-form-urlencoded', body);
  assert.equal(r.ok, true);
  assert.equal(r.as, 'form-encoded');
  assert.equal(r.payload.type, 'unsubscribe');
  assert.equal(r.payload.data.email, 'liga@inbox.lv', 'data[email] must become data.email');
  assert.equal(r.payload.data.list_id, CONFIG.mailchimp.audienceId,
    'and it is our audience, the one checked against the live account');
});

test('the same body as JSON still works, so nothing regressed', async () => {
  const r = parseInboundBody('mailchimp', 'application/json', '{"type":"subscribe"}');
  assert.equal(r.payload.type, 'subscribe');
  assert.equal(r.as, 'JSON');
});

test('a provider that declares no content type but sends key=value is still read', async () => {
  // Refusing a real event over a missing header would be our fault, not theirs.
  const r = parseInboundBody('website', undefined, 'submission_id=abc&name=Liga');
  assert.equal(r.ok, true);
  assert.equal(r.payload.submission_id, 'abc');
  assert.match(r.as, /undeclared/);
});

test('something genuinely unreadable is refused, not guessed at', async () => {
  const r = parseInboundBody('website', 'application/json', '<html>oops</html>');
  assert.equal(r.ok, false);
  assert.match(r.how, /not readable/);
});

test('a repeated form key does not silently lose the first value', async () => {
  const out = parseFormEncoded('tag=one&tag=two');
  assert.deepEqual(out.tag, ['one', 'two']);
});

test('Gmail arrives wrapped in a Pub/Sub envelope, and is unwrapped', async () => {
  const inner = { id: 'msg-1', sender: 'Liga <liga@inbox.lv>', subject: 'Par studijām' };
  const envelope = { message: { data: Buffer.from(JSON.stringify(inner)).toString('base64'),
    messageId: 'ps-99' }, subscription: 'projects/x/subscriptions/y' };
  const r = parseInboundBody('gmail', 'application/json', JSON.stringify(envelope));
  assert.equal(r.payload.id, 'msg-1');
  assert.equal(r.payload._pubsubMessageId, 'ps-99');
  assert.match(r.as, /Pub\/Sub/);
  // a plain Gmail payload with no envelope must still pass straight through
  assert.equal(parseInboundBody('gmail', 'application/json', '{"id":"m2"}').payload.id, 'm2');
});

test('a malformed envelope is not mistaken for a message', async () => {
  assert.equal(unwrapPubSub({ message: { data: 'not base64 json' } }), null);
  assert.equal(unwrapPubSub({}), null);
});

// ----------------------------------------------------------------- consent --

test('a ticked HTML checkbox is consent, whatever word the form uses for yes', async () => {
  for (const v of [true, 'true', 'on', 'yes', 'y', '1', 'Jā', 'JA']) {
    assert.equal(truthy(v), true, JSON.stringify(v) + ' is a ticked box');
  }
});

test('anything that is not clearly yes is NOT consent', async () => {
  for (const v of [false, 'false', 'off', 'no', '0', '', undefined, null, 'maybe', 'later']) {
    assert.equal(truthy(v), false, JSON.stringify(v) + ' must never be read as consent');
  }
});

test('a real form submission records the consent it was actually given', async () => {
  // The bug: === true on a form-encoded "true" recorded BOTH boxes as not given.
  const ticked = adapt('website', { submission_id: 'f1', email: 'a@b.lv',
    consent_admissions: 'true', consent_marketing: 'true' });
  assert.deepEqual(ticked.consent, { admissions: true, marketing: true });

  // an unticked box is not sent at all, and must stay false
  const partial = adapt('website', { submission_id: 'f2', email: 'a@b.lv',
    consent_admissions: 'on' });
  assert.deepEqual(partial.consent, { admissions: true, marketing: false });

  const none = adapt('website', { submission_id: 'f3', email: 'a@b.lv' });
  assert.deepEqual(none.consent, { admissions: false, marketing: false });
});

// ------------------------------------------------- the whole inbound path --
//
// provider event -> adapter -> filter -> identity -> Inbox -> qualification
// -> owner -> next action. Driven through the real functions, not a shortcut.

// The owner COLUMN holds the team, and the person responsible is Ieva. Both
// are read from config rather than typed, so a rename does not break the test
// and, more importantly, cannot quietly make it assert the wrong thing.
const OWNER = CONFIG.admissionsOwner;              // 'Admissions'
const ADMISSIONS = CONFIG.admissionsOwnerPerson;   // 'Ieva'

async function fresh() {
  const db = await openDb(':memory:');
  return db;
}

async function arrive(db, channel, raw) {
  return await receive(db, toIntake(adapt(channel, raw)));
}

test('a clear study enquiry reaches Admissions with an owner and a next action', async () => {
  const db = await fresh();
  const r = await arrive(db, 'website', { submission_id: 'w-1', name: 'Anete Liepa',
    email: 'anete.liepa@inbox.lv', phone: '+37126554400', programme: 'NAV',
    message: 'I would like to study navigation. When can I apply?',
    consent_admissions: 'true' });
  assert.notEqual(r.filtered, true, 'a real enquiry is not spam');
  assert.ok(r.id, 'it waits in the Inbox for a person');

  const q = await qualify(db, r.id, { qualification: 'lead', createPerson: true, by: ADMISSIONS,
    confirmFields: ['interest'], stated: { interest: 'NAV' },
    nextAction: 'Call and establish interest', differentPerson: true });
  assert.equal(q.ok, true);

  const person = await db.prepare('SELECT * FROM people WHERE id = ?').get(q.personId);
  assert.equal(person.name, 'Anete Liepa');
  assert.equal(person.source_channel, 'website', 'the channel it arrived on is kept');
  assert.equal(person.first_channel, 'website', 'and the first one is kept separately');

  const task = await db.prepare('SELECT * FROM tasks WHERE person_id = ? AND done_at IS NULL').get(q.personId);
  assert.ok(task, 'nobody reaches Admissions without a next action');
  assert.ok(task.due_at, 'and it has a due date');
});

test('a sales pitch never reaches the working Inbox', async () => {
  const db = await fresh();
  const r = await arrive(db, 'instagram', { object: 'instagram', entry: [{ id: 'ig', messaging: [{
    sender: { id: 'spammer' }, timestamp: 1758708060000,
    message: { mid: 'sp-1', text: 'we offer seo services and 5000 followers guaranteed' } }] }] });
  assert.equal(r.filtered, true, 'obvious rubbish is stopped before the queue');
  const stored = (await db.prepare("SELECT COUNT(*) n FROM inbound WHERE state = 'filtered'").get()).n;
  assert.equal(stored, 1, 'but it is still stored and findable, not thrown away');
});

test('a plain "Hi" is NOT spam and waits for a person to judge it', async () => {
  const db = await fresh();
  const r = await arrive(db, 'whatsapp', { object: 'whatsapp_business_account', entry: [{ id: 'wa',
    changes: [{ field: 'messages', value: { metadata: { display_phone_number: '37123111114' },
      contacts: [{ profile: { name: 'Jānis' }, wa_id: '37129001122' }],
      messages: [{ id: 'wamid.hi1', from: '37129001122', timestamp: '1758708060',
        type: 'text', text: { body: 'Hi' } }] } }] }] });
  assert.notEqual(r.filtered, true, 'a real person saying Hi is not rubbish');
  const row = await db.prepare('SELECT state FROM inbound WHERE id = ?').get(r.id);
  assert.equal(row.state, 'new', 'it waits in the Inbox');
});

test('a documents question is Admissions work, not Marketing, on any channel', async () => {
  for (const channel of ['instagram', 'facebook']) {
    const db = await fresh();
    const r = await arrive(db, channel, { object: channel, entry: [{ id: 'p', messaging: [{
      sender: { id: 'u1' }, timestamp: 1758708060000,
      message: { mid: 'dq-' + channel, text: 'Which documents do I need to submit for admission?' } }] }] });
    const q = await qualify(db, r.id, { qualification: 'lead', createPerson: true, by: ADMISSIONS,
      confirmFields: ['question'], nextAction: 'Answer the question', differentPerson: true });
    assert.equal(q.ok, true, channel + ': a documents question must be answerable');
    const person = await db.prepare('SELECT owner FROM people WHERE id = ?').get(q.personId);
    assert.equal(person.owner, OWNER, channel + ': it belongs to Admissions');
  }
});

test('somebody we already have is matched, not duplicated, across channels', async () => {
  const db = await fresh();
  const first = await arrive(db, 'website', { submission_id: 'w-9', name: 'Emīls Baltputnis',
    email: 'emils.baltputnis@gmail.com', phone: '+37120423829', message: 'Interested in MT' });
  const q = await qualify(db, first.id, { qualification: 'lead', createPerson: true, by: ADMISSIONS,
    nextAction: 'Call and establish interest', differentPerson: true });
  assert.equal(q.ok, true);

  // the same human, a different channel, and the phone written a different way
  const again = await arrive(db, 'whatsapp', { object: 'whatsapp_business_account', entry: [{ id: 'wa',
    changes: [{ field: 'messages', value: { metadata: { display_phone_number: '37123111114' },
      contacts: [{ profile: { name: 'Emils' }, wa_id: '37120423829' }],
      messages: [{ id: 'wamid.again', from: '37120423829', timestamp: '1758709000',
        type: 'text', text: { body: 'Any news?' } }] } }] }] });

  const second = await qualify(db, again.id, { qualification: 'lead', createPerson: true, by: ADMISSIONS,
    nextAction: 'Call back' });
  assert.notEqual(second.ok, true, 'it must refuse rather than quietly make a twin');
  assert.equal(second.duplicate, true, 'and it must say so');
  assert.equal(second.matches[0].name, 'Emīls Baltputnis', 'naming who we already have');
  assert.deepEqual(second.matches[0].matchedOn, ['phone'],
    'matched on the last 8 digits, so +371 and 371 and bare are one person');
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM people').get()).n, 1);
});

test('an unknown sender with no email or phone is still handled, and the gap is visible', async () => {
  const db = await fresh();
  const r = await arrive(db, 'instagram', { object: 'instagram', entry: [{ id: 'ig', messaging: [{
    sender: { id: 'anon-1' }, timestamp: 1758708060000,
    message: { mid: 'an-1', text: 'Do you have evening study?' } }] }] });
  assert.ok(r.id);
  const q = await qualify(db, r.id, { qualification: 'lead', createPerson: true, by: ADMISSIONS,
    nextAction: 'Ask for an email or a phone number', differentPerson: true });
  assert.equal(q.ok, true);
  const person = await db.prepare('SELECT email, phone FROM people WHERE id = ?').get(q.personId);
  assert.equal(person.email, null);
  assert.equal(person.phone, null);
  const task = await db.prepare('SELECT label, owner, due_at FROM tasks WHERE person_id = ?').get(q.personId);
  assert.ok(task, 'a person we cannot reach still gets a next action, or they are lost');
  assert.match(task.label, /email or a phone/);
  assert.ok(task.due_at, 'with a due date, so it surfaces in Follow-ups');
});

test('a provider retrying the same event stores it once', async () => {
  const db = await fresh();
  const raw = { submission_id: 'retry-1', name: 'Kārlis Ozols', email: 'karlis@inbox.lv' };
  const a = await arrive(db, 'website', raw);
  const b = await arrive(db, 'website', raw);
  const c = await arrive(db, 'website', raw);
  assert.ok(a.id);
  assert.equal(b.duplicate, true, 'providers retry; that is normal, not an error');
  assert.equal(c.duplicate, true);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM inbound').get()).n, 1);
});

// Q76 (07.10.2026, "Keep the text"): until then the body went once it was a record; now it stays for the History
test('the message body is used to qualify and then kept, for the person\'s History', async () => {
  const db = await fresh();
  const r = await arrive(db, 'gmail', { id: 'gm-1', sender: 'Liga <liga@inbox.lv>',
    subject: 'Par studijām', plaintextBody: 'Sveiki, es vēlos studēt navigāciju.' });
  const before = await db.prepare('SELECT body FROM inbound WHERE id = ?').get(r.id);
  assert.ok(before.body, 'it is there while somebody needs to read it');

  await qualify(db, r.id, { qualification: 'lead', createPerson: true, by: ADMISSIONS,
    nextAction: 'Send the programme description', differentPerson: true });
  const after = await db.prepare('SELECT body FROM inbound WHERE id = ?').get(r.id);
  assert.equal(after.body, before.body, 'and still there once it is a record, until the 13-month retention');
});

// ------------------------------------------------- the channels end to end --

test('every channel that can be driven locally goes the whole way', async () => {
  const { child, port } = await startServer({
    CHANNEL_MODE_WEBSITE: 'test', WEBSITE_FORM_SECRET: 'w-secret',
    CHANNEL_MODE_MAILCHIMP: 'test', MAILCHIMP_WEBHOOK_SECRET: 'm-secret',
    META_VERIFY_TOKEN: 'meta-verify', META_APP_SECRET: 'meta-secret',
    CHANNEL_MODE_FACEBOOK: 'test',
  });
  try {
    const base = `http://127.0.0.1:${port}`;

    // 1. Meta will not save a webhook until the challenge comes back
    const hs = await fetch(`${base}/api/inbound/facebook?hub.mode=subscribe`
      + `&hub.verify_token=meta-verify&hub.challenge=55512345`);
    assert.equal(hs.status, 200);
    assert.equal(await hs.text(), '55512345');

    // 2. a real HTML form, form-encoded, consent ticked
    const form = await fetch(`${base}/api/inbound/website`, { method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-crm-secret': 'w-secret' },
      body: new URLSearchParams({ submission_id: 'e2e-1', name: 'Liga Ozola',
        email: 'liga.ozola@inbox.lv', phone: '+37129887755', programme: 'NAV',
        message: 'I want to study navigation', consent_admissions: 'true' }).toString() });
    const fb = await form.json();
    assert.equal(fb.ok, true);
    assert.equal(fb.read, 'form-encoded');

    // 3. a real Mailchimp webhook, which is form-encoded and nothing else
    const mc = await fetch(`${base}/api/inbound/mailchimp?s=m-secret`, { method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'type=subscribe&fired_at=2026-09-24+10%3A00%3A00'
        + '&data%5Bemail%5D=elza%40inbox.lv&data%5Bid%5D=mc-1&data%5Blist_id%5D=c6ab4facba' });
    assert.equal((await mc.json()).ok, true);

    // 4. a Meta message, correctly signed over the RAW bytes
    const body = JSON.stringify({ object: 'page', entry: [{ id: 'pg', messaging: [{
      sender: { id: 'u-9' }, timestamp: 1758708060000,
      message: { mid: 'sig-1', text: 'Do you have evening study?' } }] }] });
    const sig = 'sha256=' + crypto.createHmac('sha256', 'meta-secret').update(body).digest('hex');
    const signed = await fetch(`${base}/api/inbound/facebook`, { method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig }, body });
    assert.equal((await signed.json()).ok, true, 'a correctly signed Meta event is accepted');

    // 5. the same body with a wrong signature is refused
    const bad = await fetch(`${base}/api/inbound/facebook`, { method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=deadbeef' }, body });
    assert.equal(bad.status, 401, 'an unsigned or wrongly signed event never enters the CRM');

    // 6. and the register now reports a REAL handshake, not a hardcoded false
    const conns = await fetch(`${base}/api/connections`).then((x) => x.json());
    const facebook = conns.channels.find((c) => c.channel === 'facebook');
    assert.equal(facebook.webhookVerified, true);
    assert.ok(facebook.webhookVerifiedAt);
    const instagram = conns.channels.find((c) => c.channel === 'instagram');
    assert.equal(instagram.webhookVerified, false, 'a channel nobody checked must not claim it');

    // nothing anywhere returns a secret value
    const text = JSON.stringify(conns);
    for (const secret of ['w-secret', 'm-secret', 'meta-secret', 'meta-verify']) {
      assert.ok(!text.includes(secret), 'a secret value must never leave the server');
    }
  } finally {
    child.kill();
  }
});

// A channel that is off refuses, and says how to turn it on rather than 500ing.
test('a channel that is off refuses and explains itself', async () => {
  const { child, port } = await startServer({});
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/inbound/website`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: '{"submission_id":"x"}' });
    assert.equal(r.status, 409);
    const b = await r.json();
    assert.match(b.error, /off/);
    assert.match(b.how, /CHANNEL_MODE_WEBSITE/);
  } finally {
    child.kill();
  }
});

// --------------------------------------------------------------- plumbing --

let nextPort = 3410;
async function startServer(env) {
  const port = nextPort++;
  const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], {
    env: { ...process.env, ...env, PORT: String(port), CRM_DB: ':memory:',
      CRM_SNAPSHOT: path.join(ROOT, 'data', '__test_never_written.json') },
    stdio: ['ignore', 'pipe', 'pipe'] });
  // A server that fails to start must fail the test, not be silently unreachable.
  let err = '';
  child.stderr.on('data', (d) => { err += d; });
  for (let i = 0; i < 100; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/connections`);
      if (r.ok) return { child, port };
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  child.kill();
  throw new Error('the server never started. stderr: ' + err.slice(0, 500));
}

test('Q26: the Mailchimp URL check is proof only with our secret in the address', () => {
  const env = { MAILCHIMP_WEBHOOK_SECRET: 'mc-secret' };
  const u = (q) => new URL('https://x/api/inbound/mailchimp' + q);
  assert.equal(handshake('mailchimp', u('?s=mc-secret'), env).record, true);
  for (const q of ['', '?s=mc-secreX', '?s=mc-secret-longer']) {
    const h = handshake('mailchimp', u(q), env);
    assert.equal(h.status, 200, 'it still answers: ' + q);
    assert.equal(h.record, false, 'but proves nothing: ' + q);
  }
  assert.equal(handshake('mailchimp', u('?s='), {}).record, false, 'no secret set: never recorded');
});
