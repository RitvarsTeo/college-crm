// THE TRAINING@ CATCH-UP, FASTER (patch 181, his word 24.11.2026 "Yes, speed it up"). training@ reads up to TC_CATCHUP messages
// a run, TC_PARALLEL at a time, stopping at TC_READ_MS; the order and the bookmark stay exactly as before. Invented addresses only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import * as staffMail from '../src/staffmail.js';
import { syncTcMail, TC_CATCHUP, TC_PARALLEL, TC_READ_MS } from '../src/sync.js';
import { TC_MAILBOX } from '../src/tcmail.js';

const NOW = new Date('2026-11-24T12:00:00Z');
const H = 3600000;
const ENV = { CRM_SESSION_SECRET: 'k'.repeat(40), GMAIL_OAUTH_CLIENT_ID: 'c', GMAIL_OAUTH_CLIENT_SECRET: 's' };
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64url');
const msg = (id, at) => ({ id, threadId: 't' + id, labelIds: ['INBOX'], internalDate: String(at),
  payload: { headers: [{ name: 'Date', value: new Date(at).toUTCString() }, { name: 'From', value: `Client <c${id}@example.lv>` }, { name: 'To', value: TC_MAILBOX }, { name: 'Subject', value: 'Course ' + id }],
    parts: [{ mimeType: 'text/plain', body: { data: b64('Hello, about a course. ' + id) } }] } });

// n messages spread over `hours` before NOW; message gets resolve in REVERSE order of asking, to prove the result keeps order
function mailbox(n, hours, { refuse = null, onGet = () => {} } = {}) {
  const all = [];
  for (let i = 0; i < n; i++) all.push({ id: 'm' + String(i).padStart(5, '0'), at: NOW.getTime() - hours * H + Math.floor((i + 0.5) * hours * H / n) });
  let inFlight = 0, most = 0;
  const fetchImpl = async (url) => {
    const ok = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
    if (/token/.test(url) && !url.includes('/messages')) return ok({ access_token: 'x', expires_in: 3600 });
    if (url.includes('/messages?')) {
      const u = new URL(url), q = u.searchParams.get('q'), max = Number(u.searchParams.get('maxResults'));
      const after = Number((q.match(/after:(\d+)/) || [])[1]) * 1000, before = (q.match(/before:(\d+)/) || [])[1];
      const hit = all.filter((m) => m.at > after && (!before || m.at < Number(before) * 1000)).sort((a, b) => b.at - a.at);
      const start = Number(u.searchParams.get('pageToken') || 0);
      return ok({ messages: hit.slice(start, start + max).map((m) => ({ id: m.id })), ...(start + max < hit.length ? { nextPageToken: String(start + max) } : {}) });
    }
    const id = decodeURIComponent(url.split('/messages/')[1].split('?')[0]);
    inFlight++; most = Math.max(most, inFlight); onGet(id);
    await new Promise((r) => setTimeout(r, 5 - (Number(id.slice(1)) % 5)));
    inFlight--;
    if (id === refuse) return { ok: false, status: 429, json: async () => ({}), text: async () => '' };
    const m = all.find((x) => x.id === id);
    return ok(msg(m.id, m.at));
  };
  return { all, fetchImpl, most: () => most };
}

test('the numbers: up to 400 a run, 5 at a time, 20 seconds of reading', () => {
  assert.deepEqual([TC_CATCHUP, TC_PARALLEL, TC_READ_MS], [400, 5, 20000]);
  assert.ok(TC_CATCHUP > staffMail.PER_RUN, 'more than the other mailboxes read');
});

test('read 5 at a time, the messages still come back oldest first', async () => {
  const db = await openDb(':memory:');
  await staffMail.saveLink(db, TC_MAILBOX, 'refresh-not-real', ENV);
  const box = mailbox(23, 12);
  const got = await staffMail.readMailbox(db, TC_MAILBOX, { env: ENV, fetchImpl: box.fetchImpl, since: new Date(NOW.getTime() - 13 * H).toISOString(), now: NOW, parallel: 5 });
  assert.deepEqual(got.items.map((m) => m.id), box.all.map((m) => m.id));
  assert.equal(box.most(), 5);
  assert.equal(got.more, false);
});

test('a refusal in the middle of a batch: kept up to the message before it, the bookmark never passes it', async () => {
  const db = await openDb(':memory:');
  await staffMail.saveLink(db, TC_MAILBOX, 'refresh-not-real', ENV);
  const box = mailbox(20, 12, { refuse: 'm00007' });
  const got = await staffMail.readMailbox(db, TC_MAILBOX, { env: ENV, fetchImpl: box.fetchImpl, since: new Date(NOW.getTime() - 13 * H).toISOString(), now: NOW, parallel: 5 });
  assert.deepEqual(got.items.map((m) => m.id), box.all.slice(0, 7).map((m) => m.id));
  assert.equal(got.ok, false);
  assert.equal(got.upTo, new Date(box.all[6].at).toISOString());
});

test('the clock runs out: what was read is kept, the bookmark is the last message read, and there is more', async () => {
  const db = await openDb(':memory:');
  await staffMail.saveLink(db, TC_MAILBOX, 'refresh-not-real', ENV);
  let t = 0; const box = mailbox(30, 12, { onGet: () => { t += 100; } });
  const got = await staffMail.readMailbox(db, TC_MAILBOX, { env: ENV, fetchImpl: box.fetchImpl, since: new Date(NOW.getTime() - 13 * H).toISOString(), now: NOW,
    parallel: 5, deadline: 1000, clock: () => t });
  assert.equal(got.items.length, 10, 'two batches of 5 (1000 ms of a fake clock), then it stops');
  assert.equal(got.ok, true);
  assert.equal(got.more, true);
  assert.equal(Date.parse(got.upTo), Math.floor(box.all[9].at / 1000) * 1000);
});

test('syncTcMail reads past the old 60 in one run and keeps its bookmark where the reading stopped', async () => {
  const db = await openDb(':memory:');
  await staffMail.saveLink(db, TC_MAILBOX, 'refresh-not-real', ENV);
  await db.prepare("INSERT INTO sync_state (name, value, ran_at, detail) VALUES ('tc_mail', ?, ?, '{}')").run(new Date(NOW.getTime() - 12 * H).toISOString(), NOW.toISOString());
  const box = mailbox(150, 10);
  const r = await syncTcMail(db, { now: NOW, env: ENV, fetchImpl: box.fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(r.more, false, 'all 150 in one run');
  assert.equal(Number((await db.prepare('SELECT COUNT(*) n FROM tc_mail').get()).n), 150);
});
