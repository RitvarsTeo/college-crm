// M7 (security review 07.10.2026):
//   - lib/gmail.js runPoll skipped a message it could not fetch (`if (!r.ok) continue`) and still
//     reported ok, so syncGmail moved the bookmark past it: that enquiry was never asked for again.
//   - The SIS, LinkedIn/Meta and Google errors said only a status ("SIS answered 500"), so nobody
//     could tell a bad token from an outage. lib/pbx.js already carried a redacted slice of the body;
//     the others now do the same (for Google, only its `error` code), never the token.

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { openDb } from '../src/db.js';
import { syncGmail } from '../src/sync.js';
import { runPoll, accessToken } from '../lib/gmail.js';
import { fetchPage, fetchWebStats } from '../lib/sis.js';
import { fetchLinkedInLead, fetchMetaLead } from '../lib/leads.js';
import { sendFeedbackEmail } from '../lib/notify.js';

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const ENV = { CHANNEL_MODE_GMAIL: 'test', GMAIL_SERVICE_ACCOUNT_JSON: JSON.stringify({
  client_email: 'svc@example.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }) };
const reply = (status, body) => ({ ok: status < 300, status, json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)), headers: { get: () => null } });
const message = (id) => ({ id, threadId: 't-' + id, labelIds: ['INBOX'], payload: { headers: [
  { name: 'Date', value: 'Tue, 30 Sep 2026 09:00:00 +0300' }, { name: 'From', value: 'A <a@x.lv>' },
  { name: 'Subject', value: 'Hi' }], body: { data: Buffer.from('I want to study', 'utf8').toString('base64url') } } });

// two messages listed, the second one cannot be fetched
const gmailWithAHole = (fail = true) => async (url) => {
  if (url.includes('oauth2.googleapis.com/token')) return reply(200, { access_token: 'x', expires_in: 3600 });
  if (url.includes('/messages?')) return reply(200, { messages: [{ id: 'm1' }, { id: 'm2' }] });
  const id = decodeURIComponent(url.split('/messages/')[1].split('?')[0]);
  return id === 'm2' && fail ? reply(500, { error: { code: 500, status: 'INTERNAL' } }) : reply(200, message(id));
};

test('M7: a message Gmail would not hand over makes the poll NOT ok, and says how many', async () => {
  const r = await runPoll({ env: ENV, fetchImpl: gmailWithAHole() });
  assert.equal(r.ok, false);
  assert.equal(r.failed, 1);
  assert.equal(r.items.length, 1, 'what did arrive is still handed back');
});

test('M7: syncGmail keeps the bookmark when a message failed, so the next run asks for it again', async () => {
  const db = await openDb(':memory:');
  const t1 = new Date('2026-09-30T05:30:00Z');
  const ok = async (url) => (url.includes('token') ? reply(200, { access_token: 'x' }) : reply(200, { messages: [] }));
  await syncGmail(db, { env: ENV, fetchImpl: ok, now: t1 });
  const r = await syncGmail(db, { env: ENV, fetchImpl: gmailWithAHole(), now: new Date('2026-10-01T05:30:00Z') });
  assert.equal(r.ok, false, 'reported as a good run');
  assert.equal(r.inbox, 1, 'the message that did arrive is in New Leads');
  const asked = [];
  await syncGmail(db, { env: ENV, now: new Date('2026-10-02T05:30:00Z'), fetchImpl: async (url) => {
    if (url.includes('/messages?')) asked.push(new URL(url).searchParams.get('q'));
    return gmailWithAHole(false)(url);
  } });
  const after = Number(/after:(\d+)/.exec(asked[0])[1]) * 1000;
  assert.ok(after <= t1.getTime(), 'the day with the failed message is asked for again');
  // Q74 rule 2: the same sender's second message joins the waiting card as a second LINE, so the
  // proof that m2 arrived is its own message line, not a second card.
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM inbound_line WHERE channel = 'gmail'").get()).n, 2, 'm2 arrived on the retry');
});

test('M7: an SIS error carries a redacted slice of what the SIS said, never the token', async () => {
  const token = 'sis-token-not-real-123456';
  const env = { SIS_API_TOKEN: token };
  const body = 'upstream database timeout for token ' + token + ' ' + 'x'.repeat(400);
  for (const call of [() => fetchPage({ env, fetchImpl: async () => reply(503, body) }),
    () => fetchWebStats({ env, fetchImpl: async () => reply(503, body) })]) {
    await assert.rejects(call, (err) => {
      assert.match(err.message, /upstream database timeout/);
      assert.ok(!err.message.includes(token), 'the token was in the error');
      assert.ok(err.message.length < 320, 'a slice, not the whole body');
      return true;
    });
  }
});

test('M7: a LinkedIn or Meta lead error carries a redacted slice of the reply', async () => {
  const token = 'li-token-not-real-abcdef';
  const env = { LINKEDIN_ACCESS_TOKEN: token, META_PAGE_ACCESS_TOKEN: token };
  const body = { message: 'Not enough permissions to access: ' + token, status: 403 };
  for (const call of [() => fetchLinkedInLead('urn:li:leadGenFormResponse:1', { env, fetchImpl: async () => reply(403, body) }),
    () => fetchMetaLead('123', { env, fetchImpl: async () => reply(403, body) })]) {
    await assert.rejects(call, (err) => {
      assert.match(err.message, /Not enough permissions/);
      assert.ok(!err.message.includes(token));
      return true;
    });
  }
});

test("M7: Google's refusals name Google's error code and nothing else", async () => {
  const env = { GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret-not-real', CRM_SESSION_SECRET: 's'.repeat(32) };
  const refused = async () => reply(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked for someone@x.lv' });
  const a = await accessToken({ env, fetchImpl: refused, refreshToken: 'r-not-real' });
  assert.equal(a.ok, false);
  assert.match(a.why, /invalid_grant/);
  assert.doesNotMatch(a.why, /someone@x\.lv|expired or revoked/, 'only the error code');
  const db = await openDb(':memory:');
  const { saveToken } = await import('../lib/notify.js');
  await saveToken(db, 'r-not-real', env);
  const n = await sendFeedbackEmail(db, { id: 1, kind: 'idea', body: 'x' }, { env, fetchImpl: refused });
  assert.equal(n.ok, false);
  assert.match(n.why, /invalid_grant/);
  assert.doesNotMatch(n.why, /someone@x\.lv/);
});
