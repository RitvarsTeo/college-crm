// Every channel, through the real adapter path, with provider-shaped payloads.
//
// Nothing here calls a provider. The point is that the shape a provider will
// really send maps into one contract, and that a retry, a malformed body or a
// missing id is handled the same way on all thirteen.

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { receive, listInbound } from '../src/intake.js';
import { adapt, toIntake, ADAPTERS, adapterIds } from '../src/adapters.js';
import { FIXTURES, fixtureFor } from '../src/fixtures.js';
import { channelIds, channelDef, validateInbound, verifyRequest, channelStatus, BadInbound, handshake } from '../src/inbound.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CHANNELS = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'channels.json'), 'utf8'));

// The fixtures live in src/fixtures.js, because the local simulator uses the very
// same payloads. If they lived here, what is simulated could drift from what is
// tested without anybody noticing.

// ------------------------------------------------------------- the contract --

test('every channel in the register has an adapter, and every adapter has a register entry', async () => {
  const inRegister = channelIds().sort();
  const built = adapterIds().sort();
  assert.deepEqual(built, inRegister,
    'a channel without an adapter cannot receive; an adapter without a register entry has no status');
});

test('all fourteen channels are covered, and each one is honest about its mechanism', async () => {
  // 14 since 24.09.2026: Messenger became its own channel, sharing the Meta
  // connection with Facebook but staying separate for reporting.
  assert.equal(channelIds().length, 14);
  for (const id of channelIds()) {
    const d = channelDef(id);
    for (const key of ['label', 'mechanism', 'direction', 'auth', 'dedupKey', 'readiness',
      'weControl', 'providerControls', 'howWeTest', 'howWeGoLive', 'howWeDisable']) {
      assert.ok(d[key] !== undefined, `${id} is missing ${key}`);
    }
    // a channel that needs somebody outside to act must say who and what
    if (d.readiness === 'waiting_for_external_access' || d.readiness === 'capability_unconfirmed') {
      assert.ok(d.externalBlocker, id + ' must name its blocker');
    }
  }
});

test('LinkedIn and TikTok are automated social integrations, not a person typing', async () => {
  // Ritvars, 27.09.2026: the same rules as any other social page. The mechanism is the
  // providers' own documented webhook, waiting on app approval as Meta is.
  for (const id of ['linkedin', 'tiktok']) {
    const d = channelDef(id);
    assert.equal(d.direction, 'inbound_webhook');
    assert.equal(d.readiness, 'waiting_for_external_access');
    assert.equal(d.webhookPath, '/api/inbound/' + id);
    assert.ok(d.secretEnv, id + ' names the secret it is signed with');
    assert.doesNotMatch(JSON.stringify(d), /by hand|human bridge/i);
  }
  // WhatsApp's place in the shared Meta inbox was unverified and is now settled:
  // Ritvars confirmed on 24.09.2026 that all the Meta channels are Business Suite.
  // The rule is unchanged - the note must state which it is, never leave it open -
  // so the assertion moved from "say it is unverified" to "say it is settled".
  const note = channelDef('whatsapp').operationalNote;
  assert.match(note, /settled 24\.09\.2026/, 'the note must say when it was settled');
  assert.ok(!/NOT VERIFIED/.test(note), 'it is verified now, so do not still say otherwise');
  const CONFIG = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
  assert.equal(CONFIG.settled.metaAccessConfirmed.doNotReopen, true);
});

test('every fixture maps into the one contract', async () => {
  for (const [channel, raw] of Object.entries(FIXTURES)) {
    const ev = adapt(channel, raw);
    const check = validateInbound(ev);
    assert.equal(check.ok, true, channel + ': ' + check.errors.join(', '));
    assert.equal(ev.channel, channel);
    assert.ok(ev.externalEventId, channel + ' must produce an id to deduplicate on');
    assert.ok(ev.receivedAt, channel + ' must produce a time');
    assert.ok(ev.raw && typeof ev.raw === 'object', channel + ' must keep the provider payload');
    assert.equal(ev.adapterVersion, '1');
  }
});

test('an event with no id to deduplicate on is refused, not guessed at', async () => {
  for (const [channel, raw] of Object.entries(FIXTURES)) {
    const def = channelDef(channel);
    const stripped = JSON.parse(JSON.stringify(raw));
    // remove whatever that channel deduplicates on
    for (const k of ['submission_id', 'responseId', 'id', 'booking_ref', 'uniqueid', 'partner_ref',
      'entry_id', 'fired_at', 'leadGenFormResponse', 'event']) delete stripped[k];
    if (['facebook', 'instagram', 'messenger'].includes(channel)) {
      delete stripped.entry[0].messaging[0].message.mid;
    }
    if (channel === 'whatsapp') delete stripped.entry[0].changes[0].value.messages[0].id;
    assert.throws(() => adapt(channel, stripped), BadInbound,
      channel + ' must refuse an event it cannot deduplicate');
    void def;
  }
});

test('a malformed payload is refused on every channel', async () => {
  for (const channel of channelIds()) {
    assert.throws(() => adapt(channel, null), BadInbound, channel + ' must refuse null');
    assert.throws(() => adapt(channel, 'not an object'), BadInbound, channel + ' must refuse a string');
  }
  assert.throws(() => adapt('myspace', {}), BadInbound, 'an unknown channel is refused');
});

test('the provider payload never becomes the CRM data model', async () => {
  const ev = adapt('website', FIXTURES.website);
  // utm lives in attribution, not as a top level CRM field
  assert.equal(ev.attribution.utm_source, 'instagram');
  assert.equal(ev.source, 'instagram', 'the traffic source is recorded');
  assert.equal(ev.channel, 'website', 'but the CHANNEL is where it arrived');
  // and the original survives untouched
  assert.equal(ev.raw.submission_id, 'web-1');
  assert.equal(ev.raw.utm_medium, 'paid');
});

// ------------------------------------------------------------ the journey --

test('every channel reaches a valid end state, and none disappears', async () => {
  const VALID = new Set(['filtered', 'new', 'qualified', 'archived']);
  for (const [channel, raw] of Object.entries(FIXTURES)) {
    const db = await openDb();
    const ev = adapt(channel, raw);
    const r = await receive(db, toIntake(ev));
    const row = await db.prepare('SELECT * FROM inbound WHERE id = ?').get(r.id);
    assert.ok(row, channel + ' must be stored, never dropped on the floor');
    assert.ok(VALID.has(row.state), `${channel} ended in ${row.state}`);
    assert.equal(row.external_id, ev.externalEventId, channel + ' keeps the id it deduplicates on');
  }
});

test('the same provider event delivered twice is stored once', async () => {
  for (const [channel, raw] of Object.entries(FIXTURES)) {
    const db = await openDb();
    const ev = adapt(channel, raw);
    const first = await receive(db, toIntake(ev));
    const again = await receive(db, toIntake(adapt(channel, raw)));
    assert.equal(again.duplicate, true, channel + ' must recognise a retry');
    assert.equal(again.id, first.id, channel + ' must point at the same row');
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM inbound').get()).n, 1, channel + ' stored twice');
  }
});

test('a sales pitch is filtered on whichever channel it arrives on', async () => {
  const db = await openDb();
  const ev = adapt('instagram', { object: 'instagram', entry: [{ id: 'ig-1', messaging: [{
    sender: { id: 'spam-1' }, timestamp: 1758708060000,
    message: { mid: 'spam-msg', text: 'Hello, we offer social media promotion services, 5000 followers guaranteed' } }] }] });
  const r = await receive(db, toIntake(ev));
  assert.equal(r.filtered, true);
  assert.equal((await listInbound(db, { state: 'new' })).length, 0, 'it never costs anybody a second');
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM inbound').get()).n, 1, 'but it IS still stored');
});

// --------------------------------------------------------------- security --

test('a signed channel refuses a bad signature and says a secret is missing', async () => {
  const body = JSON.stringify(FIXTURES.instagram);
  const secret = 'test-app-secret';
  const good = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');

  assert.equal(verifyRequest('instagram', { headers: { 'x-hub-signature-256': good } },
    { secret, rawBody: body }).ok, true);
  assert.equal(verifyRequest('instagram', { headers: { 'x-hub-signature-256': 'sha256=wrong' } },
    { secret, rawBody: body }).ok, false);
  // no secret is an honest failure, not a silent pass
  const none = verifyRequest('instagram', { headers: {} }, { secret: null, rawBody: body });
  assert.equal(none.ok, false);
  assert.equal(none.missingSecret, true);
});

test('a shared-secret channel compares the whole secret', async () => {
  assert.equal(verifyRequest('website', { headers: { 'x-crm-secret': 'right' } }, { secret: 'right' }).ok, true);
  assert.equal(verifyRequest('website', { headers: { 'x-crm-secret': 'wrong' } }, { secret: 'right' }).ok, false);
  assert.equal(verifyRequest('website', { headers: { 'x-crm-secret': 'ri' } }, { secret: 'right' }).ok, false,
    'a prefix is not a match');
});

test('LinkedIn: the documented X-LI-Signature is checked, both ways', async () => {
  const body = '{"leadGenFormResponse":"urn:li:leadGenFormResponse:abc","occurredAt":1700000000000}';
  const sig = crypto.createHmac('sha256', 'li-secret').update('hmacsha256=' + body).digest('hex');
  assert.equal(verifyRequest('linkedin', { headers: { 'x-li-signature': sig } }, { secret: 'li-secret', rawBody: body }).ok, true);
  assert.equal(verifyRequest('linkedin', { headers: { 'x-li-signature': sig } }, { secret: 'li-secret', rawBody: body + ' ' }).ok, false);
  assert.equal(verifyRequest('linkedin', { headers: {} }, { rawBody: body }).missingSecret, true);
});

test('LinkedIn: the challenge is answered with the documented HMAC, as JSON', async () => {
  const url = new URL('https://x/api/inbound/linkedin?challengeCode=890e4665-4dfe-4ab1-b689-ed553bceeed0');
  const h = handshake('linkedin', url, { LINKEDIN_CLIENT_SECRET: 'li-secret' });
  assert.equal(h.status, 200);
  assert.equal(h.contentType, 'application/json');
  const j = JSON.parse(h.body);
  assert.equal(j.challengeCode, '890e4665-4dfe-4ab1-b689-ed553bceeed0');
  assert.equal(j.challengeResponse, crypto.createHmac('sha256', 'li-secret').update(j.challengeCode).digest('hex'));
  assert.equal(handshake('linkedin', url, {}).missingSecret, true);
});

test('TikTok: the documented t=,s= signature is checked, and an old one refused', async () => {
  const body = '{"client_key":"k","event":"e","create_time":1,"user_openid":"u","content":"{}"}';
  const t = String(Math.floor(Date.now() / 1000));
  const s = (ts) => crypto.createHmac('sha256', 'tt-secret').update(ts + '.' + body).digest('hex');
  assert.equal(verifyRequest('tiktok', { headers: { 'tiktok-signature': `t=${t},s=${s(t)}` } }, { secret: 'tt-secret', rawBody: body }).ok, true);
  assert.equal(verifyRequest('tiktok', { headers: { 'tiktok-signature': `t=${t},s=${s(t)}` } }, { secret: 'tt-secret', rawBody: body + 'x' }).ok, false);
  const old = String(Number(t) - 3600);
  assert.equal(verifyRequest('tiktok', { headers: { 'tiktok-signature': `t=${old},s=${s(old)}` } }, { secret: 'tt-secret', rawBody: body }).ok, false);
});

test('LinkedIn and TikTok dedupe on the keys their documentation gives', async () => {
  const li = adapt('linkedin', { leadGenFormResponse: 'urn:li:leadGenFormResponse:abc', occurredAt: 1700000000000 });
  assert.equal(li.externalEventId, 'urn:li:leadGenFormResponse:abc_1700000000000');
  const tt = adapt('tiktok', { client_key: 'k', event: 'e', create_time: 1700000000, user_openid: 'u', content: '{"a":1}' });
  assert.equal(tt.externalEventId, 'k:e:1700000000:u');
  assert.deepEqual(tt.raw.content, { a: 1 }, 'content arrives as a JSON string and is read as JSON');
});

test('Mailchimp says out loud that its url secret is the weak option', async () => {
  const url = new URL('http://x/api/inbound/mailchimp?s=abc');
  const r = verifyRequest('mailchimp', { headers: {} }, { secret: 'abc', url });
  assert.equal(r.ok, true);
  assert.match(r.how, /weak/, 'the weakness is stated, not hidden');
});

// -------------------------------------------------------------- readiness --

test('status is computed, never claimed, and no secret value is exposed', async () => {
  const off = channelStatus('website', {});
  assert.equal(off.mode, 'off');
  assert.equal(off.credentialsPresent, false);
  assert.equal(off.webhookVerified, false, 'only a real handshake could set this');
  assert.deepEqual(off.secretsNeeded, ['WEBSITE_FORM_SECRET'], 'names only');
  assert.equal(JSON.stringify(off).includes('super-secret'), false);

  const live = channelStatus('website', { CHANNEL_MODE_WEBSITE: 'live', WEBSITE_FORM_SECRET: 'super-secret' });
  assert.equal(live.state, 'CONNECTED');
  assert.equal(live.credentialsPresent, true);
  assert.equal(JSON.stringify(live).includes('super-secret'), false, 'the value must never leave the server');

  // claiming live without the secret is an error state, not a connected one
  assert.equal(channelStatus('website', { CHANNEL_MODE_WEBSITE: 'live' }).state, 'ERROR');
  assert.equal(channelStatus('linkedin', {}).state, 'WAITING FOR EXTERNAL ACCESS');
  assert.equal(channelStatus('tiktok', {}).state, 'WAITING FOR EXTERNAL ACCESS');
  assert.equal(channelStatus('in_person', {}).state, 'MANUAL ONLY');
});

test('nothing is connected in this repository', async () => {
  // the whole point: a checkout of this code activates nothing
  for (const c of channelIds()) {
    const st = channelStatus(c, {});
    assert.notEqual(st.state, 'CONNECTED', c + ' must not be connected by default');
    assert.equal(st.mode, 'off');
  }
});

// --------------------------------------------------------- over the wire --

function startServer(env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], {
      env: { ...process.env, PORT: '0', CRM_DB: ':memory:', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    // PORT=0: the system hands out a free port and the boot line names it. A random pick
    // from a 90-port range collided with parallel suites and other local servers.
    child.stdout.on('data', (d) => { const m = String(d).match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, port: Number(m[1]) }); });
    child.on('exit', (code) => reject(new Error(`server exited (${code}): ${err}`)));
    setTimeout(() => reject(new Error('server did not start: ' + err)), 8000);
  });
}

test('the endpoint refuses a channel that is off, and accepts a simulated one', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;

  const off = await fetch(`${base}/api/inbound/website`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(FIXTURES.website) });
  assert.equal(off.status, 409, 'a channel that is off refuses');

  const sim = await fetch(`${base}/api/inbound/website`, { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-crm-simulated': '1' },
    body: JSON.stringify(FIXTURES.website) });
  assert.equal(sim.status, 200);
  const body = await sim.json();
  assert.equal(body.outcome, 'waiting to be looked at');
  assert.match(body.verified, /simulated/);

  // a retry is not a second person
  const retry = await fetch(`${base}/api/inbound/website`, { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-crm-simulated': '1' },
    body: JSON.stringify(FIXTURES.website) }).then((r) => r.json());
  assert.equal(retry.outcome, 'already had it');
});

test('a real delivery to a signed channel is refused without the signature', async (t) => {
  const { child, port } = await startServer({ CHANNEL_MODE_INSTAGRAM: 'test', META_APP_SECRET: 's3cret' });
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;
  const body = JSON.stringify(FIXTURES.instagram);

  const bad = await fetch(`${base}/api/inbound/instagram`, { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=nope' }, body });
  assert.equal(bad.status, 401);

  const sig = 'sha256=' + crypto.createHmac('sha256', 's3cret').update(body).digest('hex');
  const good = await fetch(`${base}/api/inbound/instagram`, { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig }, body });
  assert.equal(good.status, 200, 'a correctly signed delivery is accepted');
  assert.match((await good.json()).verified, /signature matched/);
});

test('the connection register lists every channel and leaks no secret', async (t) => {
  const { child, port } = await startServer({ WEBSITE_FORM_SECRET: 'do-not-leak-me' });
  t.after(() => child.kill());
  const r = await fetch(`http://127.0.0.1:${port}/api/connections`).then((x) => x.json());
  assert.equal(r.channels.length, 14);
  assert.equal(JSON.stringify(r).includes('do-not-leak-me'), false, 'a secret must never be returned');
  assert.equal(r.channels.find((c) => c.channel === 'website').credentialsPresent, true);
});

test('the observability view says where each arrival ended up', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;
  const send = (channel, raw) => fetch(`${base}/api/inbound/${channel}`, { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-crm-simulated': '1' }, body: JSON.stringify(raw) });

  await send('website', FIXTURES.website);
  await send('instagram', { object: 'instagram', entry: [{ id: 'ig', messaging: [{ sender: { id: 's' },
    timestamp: 1758708060000, message: { mid: 'spam-1',
      text: 'we offer social media promotion services, 5000 followers guaranteed' } }] }] });

  const view = await fetch(`${base}/api/inbound/events`).then((x) => x.json());
  const outcomes = view.rows.map((r) => r.outcome);
  assert.ok(outcomes.includes('waiting in CAR'));
  assert.ok(outcomes.includes('filtered before the queue'));
  assert.equal(view.rows.every((r) => r.channel && r.externalId), true, 'every row is traceable');
  assert.ok(view.deliveries.length >= 2, 'and every delivery attempt is logged');
});

test('every channel can be simulated, end to end, over HTTP', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;

  const VALID = new Set(['waiting to be looked at', 'filtered out before the queue', 'already had it']);
  const results = {};
  for (const channel of channelIds()) {
    const r = await fetch(`${base}/api/inbound/${channel}/simulate`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: '{}' });
    const j = await r.json();
    assert.equal(r.status, 200, `${channel} simulate answered ${r.status}: ${j.error}`);
    assert.ok(VALID.has(j.outcome), `${channel} ended in an unexpected state: ${j.outcome}`);
    assert.ok(j.externalEventId, channel + ' produced no id');
    results[channel] = j.outcome;
  }
  assert.equal(Object.keys(results).length, 14, 'every channel simulates');

  // and every single one is visible in the diagnostic view, none lost
  const view = await fetch(`${base}/api/inbound/events`).then((x) => x.json());
  const seen = new Set(view.rows.map((r) => r.channel));
  for (const channel of channelIds()) {
    assert.ok(seen.has(channel), channel + ' arrived but is not in the diagnostic view');
  }
  assert.equal(view.deliveries.length, 14, 'and every delivery attempt was logged');
});

test('simulating the same event twice is recognised as a retry', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;
  const once = () => fetch(`${base}/api/inbound/website/simulate`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sameId: true }) })
    .then((r) => r.json());
  const a = await once();
  const b = await once();
  assert.equal(a.outcome, 'waiting to be looked at');
  assert.equal(b.outcome, 'already had it');
  assert.equal(a.inboundId, b.inboundId);
});

test('Meta is one connection but four separate reporting channels', async () => {
  // The integration groups them; the CRM must NOT. A combined "Meta" number
  // would hide whether people came from Instagram or from WhatsApp.
  assert.deepEqual(CHANNELS.metaGroup, ['facebook', 'instagram', 'messenger', 'whatsapp']);
  for (const id of CHANNELS.metaGroup) {
    const d = channelDef(id);
    assert.ok(d, id + ' must exist as its own channel');
    assert.equal(d.label, { facebook: 'Facebook', instagram: 'Instagram',
      messenger: 'Messenger', whatsapp: 'WhatsApp' }[id], id + ' keeps its own name');
  }
  // and each maps to itself, never to a lumped 'meta'
  for (const id of ['facebook', 'instagram', 'messenger']) {
    const ev = adapt(id, FIXTURES[id]);
    assert.equal(ev.channel, id, id + ' must not be normalised into a combined channel');
  }
});

test('no Latvian channel id survives in the interface', async () => {
  assert.ok(!channelIds().includes('klatiene'), 'klatiene is now in_person');
  assert.equal(channelDef('in_person').label, 'In person');
});

// ------------------------------------------------------------- the console --

test('the Console drives the real path, and every scenario ends somewhere valid', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;
  const send = (channel, scenario) => fetch(`${base}/api/console/send`, { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-acting-as': 'Ritvars' },
    body: JSON.stringify({ channel, scenario }) }).then((r) => r.json());

  const cat = await fetch(`${base}/api/console/scenarios`).then((r) => r.json());
  assert.equal(cat.channels.length, 14);
  assert.deepEqual(cat.metaGroup, ['facebook', 'instagram', 'messenger', 'whatsapp']);

  const VALID = new Set(['Waiting in the Inbox', 'Filtered before the Inbox',
    'The same event again - stored once']);

  // one message scenario on every channel that carries messages
  for (const channel of cat.channels.filter((c) => c !== 'phone')) {
    const r = await send(channel, 'study_enquiry');
    assert.ok(VALID.has(r.outcome), `${channel}: ${r.outcome || r.error}`);
  }
  // and the four phone buttons
  for (const s of ['phone_button_1', 'phone_button_2', 'phone_button_3', 'phone_missed']) {
    const r = await send('phone', s);
    assert.ok(VALID.has(r.outcome), `${s}: ${r.outcome || r.error}`);
  }
  // spam never reaches the working CRM
  assert.equal((await send('instagram', 'spam')).filtered, true);
  // a plain hello is NOT spam and must stay visible for a person to judge
  assert.equal((await send('instagram', 'unclear')).outcome, 'Waiting in the Inbox');

  // nothing was lost anywhere
  const view = await fetch(`${base}/api/inbound/events`).then((r) => r.json());
  assert.equal(view.rows.every((r) => r.outcome), true);
});

test('the report counts rows, separates Meta channels and says what it cannot measure', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;
  await fetch(`${base}/api/demo/scenario`, { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-acting-as': 'Tetiana' }, body: '{}' });

  const r = await fetch(`${base}/api/report?from=2020-01-01`).then((x) => x.json());
  assert.ok(r.summary.newLeads > 0);
  assert.equal(typeof r.summary.conversionPct, 'number');
  assert.ok(r.summary.conversionOf.includes('who arrived'), 'conversion names its population');
  assert.equal(r.trend.length, 12, 'twelve months of trend');

  // Facebook, Instagram, Messenger and WhatsApp are never added together
  const sources = r.breakdowns.source.map((b) => b.value);
  assert.ok(!sources.includes('meta'), 'there must be no combined Meta figure');

  // a breakdown always offers a not-recorded row rather than reading as zero
  for (const key of ['programme', 'studyForm', 'education', 'source']) {
    assert.ok(Array.isArray(r.breakdowns[key]), key + ' is missing');
  }
  // and the gaps are named
  const gaps = r.notMeasured.map((n) => n.metric);
  assert.ok(gaps.includes('Nationality'), 'nationality is not measurable and must say so');
  for (const n of r.notMeasured) {
    assert.ok(n.why && n.toFix, n.metric + ' must say why and what would fix it');
  }

  const csv = await fetch(`${base}/api/report.csv?from=2020-01-01`);
  assert.equal(csv.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.match(await csv.text(), /New leads/);
});

test('the export is a choice, and what is ticked is what comes out', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;
  await fetch(`${base}/api/demo/scenario`, { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-acting-as': 'Tetiana' }, body: '{}' });

  const cat = await fetch(`${base}/api/report/sections`).then((r) => r.json());
  assert.equal(cat.sections.length, 9, 'nine plain choices, kept deliberately short');
  assert.deepEqual(cat.defaults, ['summary', 'trend', 'programmes'],
    'the three a KPI meeting starts from');
  for (const sec of cat.sections) {
    assert.ok(sec.label, sec.id + ' needs a label');
    assert.ok(sec.label.length < 22, sec.label + ' is too long for a checkbox');
  }

  const get = (qs) => fetch(`${base}/api/report.csv?from=2020-01-01&${qs}`).then((r) => r.text());

  // one section only
  const justTrend = await get('sections=trend');
  assert.match(justTrend, /Twelve-month trend/);
  assert.ok(!justTrend.includes('By programme'), 'nothing that was not ticked may appear');
  assert.ok(!justTrend.includes('New leads,'), 'and not the summary either');

  // a different one
  const justPeople = await get('sections=people');
  assert.match(justPeople, /The people behind the numbers/);
  assert.ok(!justPeople.includes('Twelve-month trend'));

  // several
  const two = await get('sections=summary,lost');
  assert.match(two, /The headline figures/);
  assert.match(two, /Why people did not proceed/);
  assert.ok(!two.includes('Twelve-month trend'));

  // the period always travels with it, whatever was ticked
  assert.match(two, /Period/);
});

test('nationality is a field somebody types, not something derived', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;
  const H = { 'content-type': 'application/json', 'x-acting-as': 'Ieva' };

  const { id } = await fetch(`${base}/api/people`, { method: 'POST', headers: H,
    body: JSON.stringify({ name: 'Somebody New', source_channel: 'phone', by: 'Ieva' }) })
    .then((r) => r.json());

  // it starts empty. Nothing guesses it from a name or a phone number.
  const before = await fetch(`${base}/api/people/${id}`, { headers: H }).then((r) => r.json());
  assert.equal(before.nationality, null, 'nationality must never be inferred');

  const saved = await fetch(`${base}/api/people/${id}/edit`, { method: 'POST', headers: H,
    body: JSON.stringify({ nationality: 'Latvia', by: 'Ieva' }) }).then((r) => r.json());
  assert.equal(saved.ok, true);
  assert.equal(saved.person.nationality, 'Latvia');

  // and the change is in the history like any other edit
  const after = await fetch(`${base}/api/people/${id}`, { headers: H }).then((r) => r.json());
  const edit = after.timeline.find((e) => e.field === 'nationality');
  assert.ok(edit, 'typing a nationality is recorded');
  assert.equal(edit.new_value, 'Latvia');
  assert.equal(edit.actor, 'Ieva');

  // it reaches the report as its own breakdown
  const rep = await fetch(`${base}/api/report?from=2020-01-01`).then((r) => r.json());
  assert.ok(Array.isArray(rep.breakdowns.nationality));
  assert.ok(rep.coverage.nationality.filled >= 1, 'and its coverage is reported honestly');
});

test('maritime graduates is a real count, and the report says how complete it is', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;
  const H = { 'content-type': 'application/json', 'x-acting-as': 'Ieva' };

  for (const [name, education] of [['A', 'Maritime school'], ['B', 'LJA'], ['C', 'Secondary school'], ['D', null]]) {
    const { id } = await fetch(`${base}/api/people`, { method: 'POST', headers: H,
      body: JSON.stringify({ name: 'Person ' + name, source_channel: 'phone', by: 'Ieva' }) })
      .then((r) => r.json());
    if (education) {
      await fetch(`${base}/api/people/${id}/edit`, { method: 'POST', headers: H,
        body: JSON.stringify({ education, by: 'Ieva' }) });
    }
  }

  const rep = await fetch(`${base}/api/report?from=2020-01-01`).then((r) => r.json());
  assert.equal(rep.summary.maritimeGraduates, 2, 'Maritime school and LJA both count');
  assert.equal(rep.coverage.education.filled, 3, 'and the coverage is stated, not hidden');
  assert.equal(rep.coverage.education.of, 4);

  // it must NOT be listed as something that cannot be measured
  const gaps = rep.notMeasured;
  const maritime = gaps.find((g) => g.metric === 'Maritime school graduates');
  if (maritime) assert.equal(maritime.kind, 'needs typing in',
    'it is a data-entry gap, not a limit of the software');
  // the one that genuinely is a decision stays a decision
  assert.equal(gaps.find((g) => g.metric === 'HE applications').kind, 'needs a decision');
});
