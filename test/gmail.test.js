// The Gmail path, everything that does not need the Workspace administrator.
//
// config/channels.json named /api/cron/gmail-poll as this channel's path and the
// file did not exist. Found on 24.09.2026 by checking every declared path
// against the filesystem, so the last test here is the one that matters most:
// it checks every channel's declared path, and fails the next time the register
// promises something nobody built.

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { credentials, ready, buildAssertion, accessToken, pollQuery, headerOf,
  plainTextOf, toAdapterShape, watchState, runPoll, MAILBOX, SCOPES,
  TOKEN_URL } from '../lib/gmail.js';
import { adapt } from '../src/adapters.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CHANNELS = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'channels.json'), 'utf8'));

// A real RSA key, generated here, so the signing path is actually exercised.
// It is a throwaway: it exists for the length of this file and authorises nothing.
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const KEY = {
  client_email: 'crm-reader@novikontas-crm.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
};
const env = (extra = {}) => ({ GMAIL_SERVICE_ACCOUNT_JSON: JSON.stringify(KEY), ...extra });

// ----------------------------------------------------------- credentials --

test('with no key we say who we are waiting for, not just "failed"', () => {
  const c = credentials({});
  assert.equal(c.ok, false);
  assert.equal(c.missingSecret, true);
  assert.match(c.waitingOn, /Workspace administrator/);
});

test('a broken or half-filled key is refused clearly', () => {
  assert.match(credentials({ GMAIL_SERVICE_ACCOUNT_JSON: 'not json' }).why, /not readable JSON/);
  assert.match(credentials({ GMAIL_SERVICE_ACCOUNT_JSON: '{"client_email":"a@b"}' }).why,
    /no private_key/);
});

test('the key itself is never handed back to a caller', () => {
  const state = ready(env());
  assert.equal(state.ok, true);
  const text = JSON.stringify(state);
  assert.ok(!text.includes('PRIVATE KEY'), 'a readiness answer must never carry the key');
  assert.ok(!text.includes(KEY.private_key));
});

test('we ask for read only, because asking for less is approved faster', () => {
  assert.deepEqual(SCOPES, ['https://www.googleapis.com/auth/gmail.readonly']);
  assert.equal(ready(env()).permission, 'read only');
});

// ------------------------------------------------------------------ auth --

test('the assertion asks to read the MAILBOX, not the service account itself', () => {
  const jwt = buildAssertion(KEY, { now: new Date('2026-09-24T10:00:00Z') });
  const [, claimPart, sigPart] = jwt.split('.');
  const claim = JSON.parse(Buffer.from(claimPart, 'base64url').toString('utf8'));

  assert.equal(claim.sub, MAILBOX, 'sub is what makes it read edu@, and is what the admin allows');
  assert.equal(claim.iss, KEY.client_email);
  assert.equal(claim.aud, TOKEN_URL);
  assert.equal(claim.scope, SCOPES.join(' '));
  assert.equal(claim.exp - claim.iat, 3600);
  assert.ok(sigPart.length > 100, 'and it is really signed');
});

test('the signature verifies against the public key', () => {
  const jwt = buildAssertion(KEY);
  const [h, c, s] = jwt.split('.');
  const ok = crypto.createVerify('RSA-SHA256').update(h + '.' + c)
    .verify(privateKey, Buffer.from(s, 'base64url'));
  assert.equal(ok, true);
});

test('unauthorized_client is reported as what it actually means', async () => {
  // This is the error everybody hits, and "401" tells nobody what to do.
  const fetchImpl = async () => ({ ok: false, status: 401,
    text: async () => '{"error":"unauthorized_client"}' });
  const r = await accessToken({ env: env(), fetchImpl });
  assert.equal(r.ok, false);
  assert.match(r.why, /administrator has not allowed/);
  assert.match(r.waitingOn, /Workspace administrator/);
});

test('with no credentials, NO request is made at all', async () => {
  let called = 0;
  const fetchImpl = async () => { called += 1; return { ok: true, text: async () => '{}' }; };
  const r = await accessToken({ env: {}, fetchImpl });
  assert.equal(r.ok, false);
  assert.equal(called, 0, 'a call that was never made must not be reported as a result');
});

// --------------------------------------------------------------- reading --

test('the poll window looks further back than the interval, so a late run leaves no gap', () => {
  const now = new Date('2026-09-24T12:00:00Z');
  const q = pollQuery({ now, minutes: 15 });
  const after = Number(/after:(\d+)/.exec(q)[1]);
  assert.equal(now.getTime() / 1000 - after, 900);
  assert.match(q, /in:inbox/);
});

const MESSAGE = {
  id: '19943aa1f2', threadId: 'th-1', labelIds: ['INBOX', 'UNREAD'],
  payload: {
    headers: [
      { name: 'From', value: 'Līga Ozola <liga.ozola@inbox.lv>' },
      { name: 'Subject', value: 'Jautājums par studijām' },
      { name: 'Date', value: 'Wed, 24 Sep 2026 10:14:02 +0300' },
    ],
    parts: [
      { mimeType: 'text/html', body: { data: Buffer.from('<p>ignored</p>').toString('base64url') } },
      { mimeType: 'text/plain',
        body: { data: Buffer.from('Sveiki, vēlos studēt navigāciju.').toString('base64url') } },
      { filename: 'CV.pdf', mimeType: 'application/pdf', body: { size: 90210 } },
    ],
  },
};

test('a Gmail-shaped message becomes the flat shape the adapter expects', () => {
  const flat = toAdapterShape(MESSAGE);
  assert.equal(flat.id, '19943aa1f2');
  assert.equal(flat.sender, 'Līga Ozola <liga.ozola@inbox.lv>');
  assert.equal(flat.subject, 'Jautājums par studijām');
  assert.equal(flat.plaintextBody, 'Sveiki, vēlos studēt navigāciju.');
  assert.deepEqual(flat.attachments, [{ filename: 'CV.pdf', size: 90210 }]);

  // and it goes straight into the adapter with nothing in between
  const ev = adapt('gmail', flat);
  assert.equal(ev.externalEventId, '19943aa1f2');
  assert.equal(ev.senderEmail, 'liga.ozola@inbox.lv');
  assert.equal(ev.senderName, 'Līga Ozola');
  assert.equal(ev.channel, 'gmail');
});

test('a nested multipart message still gives up its plain text', () => {
  const nested = { id: 'n1', payload: { mimeType: 'multipart/mixed', parts: [
    { mimeType: 'multipart/alternative', parts: [
      { mimeType: 'text/plain', body: { data: Buffer.from('deep inside').toString('base64url') } },
    ] },
  ] } };
  assert.equal(plainTextOf(nested), 'deep inside');
});

test('an HTML-only message says it has no plain text rather than inventing some', () => {
  const htmlOnly = { id: 'h1', payload: { parts: [
    { mimeType: 'text/html', body: { data: Buffer.from('<b>hello</b>').toString('base64url') } },
  ] } };
  assert.equal(plainTextOf(htmlOnly), null, 'stripping tags badly is worse than saying none');
});

test('headers are found whatever case the sender used', () => {
  assert.equal(headerOf(MESSAGE, 'from'), 'Līga Ozola <liga.ozola@inbox.lv>');
  assert.equal(headerOf(MESSAGE, 'SUBJECT'), 'Jautājums par studijām');
  assert.equal(headerOf(MESSAGE, 'Reply-To'), null);
});

// ---------------------------------------------------------------- expiry --

test('a watch expires after seven days, silently, so we compute it', () => {
  const now = new Date('2026-09-24T10:00:00Z');
  const alive = watchState({ expiration: now.getTime() + 5 * 86400000, now });
  assert.equal(alive.watching, true);
  assert.equal(alive.daysLeft, 5);
  assert.equal(alive.renewNow, false);

  const soon = watchState({ expiration: now.getTime() + 1 * 86400000, now });
  assert.equal(soon.renewNow, true, 'renew before it dies, not after');

  const dead = watchState({ expiration: now.getTime() - 3600000, now });
  assert.equal(dead.watching, false);
  assert.match(dead.why, /stopped telling us/);

  const never = watchState({});
  assert.equal(never.watching, false);
});

// ----------------------------------------------------------------- a run --

test('a poll with no credentials reports what it is waiting for, and makes no request', async () => {
  let called = 0;
  const r = await runPoll({ env: {}, fetchImpl: async () => { called += 1; } });
  assert.equal(r.ok, false);
  assert.equal(r.ran, false, 'it did not run, and must not claim it did');
  assert.equal(r.messages, 0);
  assert.match(r.waitingOn, /Workspace administrator/);
  assert.equal(called, 0);
});

test('a real poll fetches each message and reports an unread page rather than losing it', async () => {
  const calls = [];
  const fetchImpl = async (u, opts) => {
    calls.push(String(u));
    if (String(u) === TOKEN_URL) {
      return { ok: true, text: async () => JSON.stringify({ access_token: 'tok', expires_in: 3599 }) };
    }
    assert.equal(opts.headers.authorization, 'Bearer tok', 'every call carries the token');
    if (String(u).includes('/messages?')) {
      return { ok: true, json: async () => ({ messages: [{ id: '19943aa1f2' }],
        nextPageToken: 'page-2' }) };
    }
    return { ok: true, json: async () => MESSAGE };
  };
  const r = await runPoll({ env: env(), fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(r.messages, 1);
  assert.equal(r.items[0].subject, 'Jautājums par studijām');
  assert.equal(r.more, true, 'an ignored page token is a message silently lost');
  assert.equal(r.nextPageToken, 'page-2');
  assert.ok(calls.some((u) => u.includes(encodeURIComponent(MAILBOX))),
    'it reads the shared mailbox, not somebody personal');
});

// ------------------------------------------------- the register must not lie --

test('every path the channel register declares exists on disk', () => {
  // The register named /api/cron/gmail-poll and nothing implemented it. A
  // promised endpoint that was never built is worse than an absent one, because
  // the register reads as ready.
  const missing = [];
  for (const [id, c] of Object.entries(CHANNELS.channels)) {
    const poll = c.pollPath;
    if (!poll) continue;
    const file = path.join(ROOT, poll.replace(/^\/api/, 'api') + '.js');
    if (!fs.existsSync(file)) missing.push(`${id} declares ${poll}, but ${file} does not exist`);
  }
  assert.deepEqual(missing, [], missing.join('; '));
});

test('the gmail cron route refuses without the scheduled-invocation secret', async () => {
  const { default: handler } = await import('../api/cron/gmail-poll.js');
  const answer = (req, envVars = {}) => new Promise((resolve) => {
    const old = { ...process.env };
    Object.assign(process.env, envVars);
    const res = { status(code) { this._c = code; return this; },
      json(body) { Object.assign(process.env, old); resolve({ status: this._c, body }); } };
    handler(req, res);
  });

  const noSecret = await answer({ method: 'GET', headers: {} }, { CRON_SECRET: '' });
  assert.equal(noSecret.status, 500, 'with no secret configured it refuses everything');

  const wrong = await answer({ method: 'GET', headers: { authorization: 'Bearer nope' } },
    { CRON_SECRET: 'the-real-one' });
  assert.equal(wrong.status, 401);

  const offChannel = await answer({ method: 'GET', headers: { authorization: 'Bearer s' } },
    { CRON_SECRET: 's', CHANNEL_MODE_GMAIL: 'off' });
  assert.equal(offChannel.status, 200);
  assert.equal(offChannel.body.ran, false, 'a channel that is off does not run');

  const waiting = await answer({ method: 'GET', headers: { authorization: 'Bearer s' } },
    { CRON_SECRET: 's', CHANNEL_MODE_GMAIL: 'test', GMAIL_SERVICE_ACCOUNT_JSON: '' });
  assert.equal(waiting.status, 200, 'waiting for an administrator is not an error every 5 minutes');
  assert.equal(waiting.body.ran, false);
  assert.match(waiting.body.waitingOn, /Workspace administrator/);
});
