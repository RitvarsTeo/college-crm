// New feedback is emailed to Ritvars, from ritvars.vilcins@novikontas.org (decided 04.10.2026).
// Against a fake Google: no network, no real token.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import * as notify from '../lib/notify.js';

const ENV = { CRM_SESSION_SECRET: 'test-secret-not-real-000000000000', GMAIL_OAUTH_CLIENT_ID: 'cid', GMAIL_OAUTH_CLIENT_SECRET: 'cs',
  GMAIL_TOKEN_URL: 'https://token.test', GMAIL_API_ROOT: 'https://gmail.test/gmail/v1' };
const item = { id: 7, kind: 'BUG', body: 'Pogas nestrādā ā', path: '#/journey', by: 'Admissions', at: '2026-10-04T18:00:00Z', origin: 'https://intake.test' };

test('sender and recipient are his address, and the scope is send only', () => {
  assert.equal(notify.SENDER, 'ritvars.vilcins@novikontas.org');
  assert.deepEqual(notify.RECIPIENTS, ['ritvars.vilcins@novikontas.org']);
  assert.ok(notify.SCOPES.includes('https://www.googleapis.com/auth/gmail.send'));
  assert.ok(!notify.SCOPES.some((s) => /readonly|modify|mail\.google/.test(s)), 'nothing more than send');
});

test('not connected: nothing is sent and nothing throws', async () => {
  const db = await openDb(':memory:');
  let called = 0;
  const r = await notify.sendFeedbackEmail(db, item, { env: ENV, fetchImpl: async () => { called++; } });
  assert.equal(r.ok, false);
  assert.equal(called, 0);
});

test('connected: one message to him, readable subject and body, token kept encrypted', async () => {
  const db = await openDb(':memory:');
  await notify.saveToken(db, 'refresh-abc', ENV);
  const stored = await db.prepare("SELECT value FROM sync_state WHERE name = 'notify_oauth'").get();
  assert.ok(!stored.value.includes('refresh-abc'), 'never stored in clear');
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    if (url === 'https://token.test') return { ok: true, json: async () => ({ access_token: 'at' }) };
    return { ok: true, status: 200, json: async () => ({ id: 'm1' }) };
  };
  const r = await notify.sendFeedbackEmail(db, item, { env: ENV, fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(calls[1].url, 'https://gmail.test/gmail/v1/users/me/messages/send');
  const raw = Buffer.from(JSON.parse(calls[1].opts.body).raw, 'base64url').toString('utf8');
  assert.match(raw, /^From: Intake <ritvars\.vilcins@novikontas\.org>/);
  assert.match(raw, /\r\nTo: ritvars\.vilcins@novikontas\.org\r\n/);
  const subject = Buffer.from(raw.match(/=\?UTF-8\?B\?([^?]+)\?=/)[1], 'base64').toString('utf8');
  assert.equal(subject, 'Intake feedback: Something broken from Admissions');
  const text = Buffer.from(raw.split('\r\n\r\n')[1], 'base64').toString('utf8');
  assert.match(text, /Pogas nestrādā ā/);
  assert.match(text, /https:\/\/intake\.test\/#\/feedback/);
});

test('the id_token says who signed in, and only his account is kept', async () => {
  const idt = 'x.' + Buffer.from(JSON.stringify({ email: 'Ritvars.Vilcins@novikontas.org' })).toString('base64url') + '.y';
  const r = await notify.exchangeCode({ env: ENV, code: 'c', redirectUri: 'https://r', fetchImpl: async () => ({ ok: true,
    json: async () => ({ refresh_token: 'rt', id_token: idt }) }) });
  assert.equal(r.mailbox, 'ritvars.vilcins@novikontas.org');
});

// Failure handling (05.10.2026): every way Google can say no comes back as { ok:false, why } and never throws,
// so the route that saved the feedback first still answers 200.
test('Google refuses the stored sign-in: not sent, a reason, no throw', async () => {
  const db = await openDb(':memory:');
  await notify.saveToken(db, 'refresh-abc', ENV);
  let sends = 0;
  const r = await notify.sendFeedbackEmail(db, item, { env: ENV, fetchImpl: async (url) => {
    if (url === 'https://token.test') return { ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) };
    sends++; return { ok: true };
  } });
  assert.equal(r.ok, false);
  assert.match(r.why, /connect again/);
  assert.equal(sends, 0);
});

test('Gmail refuses the send: not sent, the status is in the reason, no throw', async () => {
  const db = await openDb(':memory:');
  await notify.saveToken(db, 'refresh-abc', ENV);
  const r = await notify.sendFeedbackEmail(db, item, { env: ENV, fetchImpl: async (url) =>
    url === 'https://token.test' ? { ok: true, json: async () => ({ access_token: 'at' }) } : { ok: false, status: 403 } });
  assert.equal(r.ok, false);
  assert.match(r.why, /403/);
});

test('the network fails: not sent, no throw', async () => {
  const db = await openDb(':memory:');
  await notify.saveToken(db, 'refresh-abc', ENV);
  const r = await notify.sendFeedbackEmail(db, item, { env: ENV, fetchImpl: async () => { throw new Error('ECONNRESET'); } });
  assert.equal(r.ok, false);
  assert.match(r.why, /ECONNRESET/);
});
