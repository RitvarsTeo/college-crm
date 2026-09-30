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

// ------------------------------------------------------------------ C3 (30.09.2026) ----
// Session C found nothing ever called /api/cron/gmail-poll; reading it showed the route also
// called runPoll(), which reads and throws away, and asked for the last 15 minutes only - on a
// once-a-day run that misses the day.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function pagedGmail(pages) {
  const lists = [];
  const fetchImpl = async (url) => {
    const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
    if (url.includes('oauth2.googleapis.com/token')) return ok({ access_token: 'x', expires_in: 3600 });
    if (url.includes('/messages?')) {
      const u = new URL(url);
      lists.push({ q: u.searchParams.get('q'), pageToken: u.searchParams.get('pageToken') });
      const i = u.searchParams.get('pageToken') ? Number(u.searchParams.get('pageToken')) : 0;
      return ok({ messages: pages[i].map((m) => ({ id: m.id })), ...(i + 1 < pages.length ? { nextPageToken: String(i + 1) } : {}) });
    }
    const id = decodeURIComponent(url.split('/messages/')[1].split('?')[0]);
    return ok(pages.flat().find((m) => m.id === id));
  };
  return { fetchImpl, lists };
}

test('C3: the Gmail poll is on the cron list', () => {
  const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  assert.ok(v.crons.some((c) => c.path === '/api/cron/gmail-poll'), 'scheduled');
});

test('C3: every page is read, and the next run asks for everything since the last good run', async () => {
  const db = await openDb(':memory:');
  const g = pagedGmail([[message('p1', 'A <a@x.lv>', 'Hi', 'I want to study NAV')],
    [message('p2', 'B <b@x.lv>', 'Hi', 'I want to study MEH')]]);
  const t1 = new Date('2026-09-30T05:30:00Z');
  const r1 = await syncGmail(db, { env: ENV, fetchImpl: g.fetchImpl, now: t1 });
  assert.equal(r1.ok, true, JSON.stringify(r1));
  assert.equal(r1.inbox, 2, 'both pages');
  assert.equal(r1.more, false);
  assert.equal(g.lists[1].pageToken, '1');
  const g2 = pagedGmail([[]]);
  const t2 = new Date('2026-10-01T05:30:00Z');
  await syncGmail(db, { env: ENV, fetchImpl: g2.fetchImpl, now: t2 });
  const after = Number(/after:(\d+)/.exec(g2.lists[0].q)[1]) * 1000;
  assert.ok(after <= t1.getTime() && after >= t1.getTime() - 15 * 60000,
    `asks from the last run (with a small overlap), not the last 15 minutes: ${new Date(after).toISOString()}`);
});

test('C3: a failed run does not move the bookmark', async () => {
  const db = await openDb(':memory:');
  const t1 = new Date('2026-09-30T05:30:00Z');
  await syncGmail(db, { env: ENV, fetchImpl: pagedGmail([[]]).fetchImpl, now: t1 });
  const refuse = async (url) => (url.includes('token')
    ? { ok: true, status: 200, json: async () => ({ access_token: 'x' }), text: async () => '{"access_token":"x"}' }
    : { ok: false, status: 500, json: async () => ({}), text: async () => '' });
  await syncGmail(db, { env: ENV, fetchImpl: refuse, now: new Date('2026-10-01T05:30:00Z') });
  const g3 = pagedGmail([[]]);
  await syncGmail(db, { env: ENV, fetchImpl: g3.fetchImpl, now: new Date('2026-10-02T05:30:00Z') });
  const after = Number(/after:(\d+)/.exec(g3.lists[0].q)[1]) * 1000;
  assert.ok(after <= t1.getTime(), 'the failed day is asked for again');
});

test('C3: the cron route writes to New Leads (it used to read and throw away)', async () => {
  const src = fs.readFileSync(path.join(ROOT, 'api', 'cron', 'gmail-poll.js'), 'utf8');
  assert.match(src, /syncGmail\(/);
  assert.doesNotMatch(src, /runPoll\(/);
  const g = pagedGmail([[message('c1', 'C <c@x.lv>', 'Hi', 'I want to study')]]);
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  Object.assign(process.env, { ...ENV, CRON_SECRET: 'test-cron-secret-not-real', CRM_DB: ':memory:',
    DATABASE_URL: '', CRM_DB_DATABASE_URL_UNPOOLED: '' });
  globalThis.fetch = g.fetchImpl;
  try {
    const { default: handler } = await import('../api/cron/gmail-poll.js');
    const out = {};
    const res = { statusCode: 0, setHeader() {}, writeHead(c) { this.statusCode = c; },
      end(b) { out.body = b; }, status(c) { this.statusCode = c; return this; }, json(b) { out.body = JSON.stringify(b); } };
    await handler({ method: 'GET', headers: { authorization: 'Bearer test-cron-secret-not-real' } }, res);
    const body = JSON.parse(out.body);
    assert.equal(body.inbox, 1, out.body);
    const { cronDb } = await import('../src/crondb.js');
    const cdb = await cronDb();
    assert.equal((await cdb.prepare("SELECT COUNT(*) n FROM inbound WHERE channel = 'gmail'").get()).n, 1);
  } finally {
    globalThis.fetch = realFetch;
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});
