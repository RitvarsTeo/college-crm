// Item 16, 30.09.2026: the Gmail poll writes to New Leads.
//
// runPoll fetched and shaped the messages and handed them back to nobody: the mailbox
// was read and the queue never saw a thing. Each message now goes through the gmail
// adapter and receive(), the same door every channel uses, which is what gives it the
// dedupe, the ageing rule and the junk filter.
//
// The mode stays OFF: nothing runs until somebody switches the channel on.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { openDb } from '../src/db.js';
import { syncGmail } from '../src/sync.js';

// a Gmail API message, as the real one arrives
const message = (id, from, subject, body) => ({
  id, threadId: 't-' + id, labelIds: ['INBOX'],
  payload: { headers: [
    { name: 'Date', value: 'Tue, 30 Sep 2026 09:00:00 +0300' },
    { name: 'From', value: from },
    { name: 'Subject', value: subject },
  ], body: { data: Buffer.from(body, 'utf8').toString('base64url') } },
});

function fakeGmail(messages) {
  const calls = { list: 0, get: 0 };
  const fetchImpl = async (url) => {
    if (url.includes('oauth2.googleapis.com/token')) {
      const body = { access_token: 'x', expires_in: 3600 };
      return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
    }
    if (url.includes('/messages?')) {
      calls.list++;
      const body = { messages: messages.map((m) => ({ id: m.id })) };
      return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
    }
    calls.get++;
    const id = decodeURIComponent(url.split('/messages/')[1].split('?')[0]);
    const body = messages.find((m) => m.id === id);
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
  };
  return { fetchImpl, calls };
}

// A throwaway key generated here and used nowhere else. The poll signs a real JWT, so a
// made-up string cannot get past the signer and the test would fail for the wrong reason.
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const ENV = { CHANNEL_MODE_GMAIL: 'test', GMAIL_SERVICE_ACCOUNT_JSON: JSON.stringify({
  client_email: 'svc@example.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
}) };

test('the channel is OFF by default, and nothing runs', async () => {
  const db = await openDb(':memory:');
  const { fetchImpl, calls } = fakeGmail([message('g1', 'A <a@x.lv>', 'Hello', 'I want to study')]);
  const r = await syncGmail(db, { db, env: {}, fetchImpl });
  assert.equal(r.ran, false);
  assert.match(r.why, /off/);
  assert.equal(calls.list, 0, 'nothing was even fetched');
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM inbound').get()).n, 0);
  await db.close();
});

test('a fake fetch gives rows in New Leads', async (t) => {
  const db = await openDb(':memory:');
  const { fetchImpl } = fakeGmail([
    message('g1', 'Anna <anna@x.lv>', 'Question about NAV', 'When does the navigation course start?'),
    message('g2', 'Bruno <bruno@x.lv>', 'Application', 'I would like to apply, what documents do I need?'),
  ]);
  const r = await syncGmail(db, { env: ENV, fetchImpl });
  if (!r.ok) t.diagnostic('why: ' + r.why);
  assert.equal(r.ok, true, 'the run completed: ' + (r.why || ''));
  assert.equal(r.fetched, 2);
  assert.equal(r.inbox + r.filtered, 2, 'both reached the queue');
  const rows = await db.prepare('SELECT channel, external_id FROM inbound ORDER BY external_id').all();
  assert.deepEqual(rows.map((x) => x.external_id), ['g1', 'g2']);
  assert.deepEqual([...new Set(rows.map((x) => x.channel))], ['gmail']);
  await db.close();
});

test('a second run over the same window adds none', async () => {
  const db = await openDb(':memory:');
  const { fetchImpl } = fakeGmail([message('g1', 'Anna <anna@x.lv>', 'Q', 'when does it start?')]);
  await syncGmail(db, { env: ENV, fetchImpl });
  const before = (await db.prepare('SELECT COUNT(*) n FROM inbound').get()).n;
  const again = await syncGmail(db, { env: ENV, fetchImpl });
  const after = (await db.prepare('SELECT COUNT(*) n FROM inbound').get()).n;
  assert.equal(after, before, 'the same message twice is still one row');
  assert.equal(again.repeat, 1, 'and the run says it was a repeat');
  await db.close();
});

test('the run is recorded, and an extra page is admitted rather than hidden', async () => {
  const db = await openDb(':memory:');
  const { fetchImpl } = fakeGmail([message('g1', 'A <a@x.lv>', 'Q', 'hello')]);
  await syncGmail(db, { env: ENV, fetchImpl });
  const st = await db.prepare("SELECT detail FROM sync_state WHERE name = 'gmail'").get();
  assert.ok(st, 'the run is in sync_state');
  const detail = JSON.parse(st.detail);
  assert.equal(detail.fetched, 1);
  assert.equal(detail.more, false, 'and says whether Gmail had another page');
  await db.close();
});
