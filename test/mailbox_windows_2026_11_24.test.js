// THE FIRST FILL IN DATE WINDOWS (patch 174, his word "Yes, fix and fetch"). A busy mailbox (more mail since the bookmark
// than one run can list) is read one day at a time, oldest first, and nothing is skipped: the bookmark only passes mail that
// was read. Against a fake Gmail that lists newest first, 50 a page, at most MAX_PAGES pages, and honours after: / before:.
// Invented addresses only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import * as staffMail from '../src/staffmail.js';
import { syncTcMail } from '../src/sync.js';
import { TC_MAILBOX } from '../src/tcmail.js';
import { MAX_PAGES } from '../lib/gmail.js';

const NOW = new Date('2026-11-24T12:00:00Z');
const H = 3600000;
const ENV = { CRM_SESSION_SECRET: 'k'.repeat(40), GMAIL_OAUTH_CLIENT_ID: 'c', GMAIL_OAUTH_CLIENT_SECRET: 's' };
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64url');
const msg = (id, at, from) => ({ id, threadId: 't' + id, labelIds: ['INBOX'], internalDate: String(at),
  payload: { headers: [{ name: 'Date', value: new Date(at).toUTCString() }, { name: 'From', value: from }, { name: 'To', value: TC_MAILBOX }, { name: 'Subject', value: 'Course ' + id }],
    parts: [{ mimeType: 'text/plain', body: { data: b64('Hello, about a course. ' + id) } }] } });

// 1800 messages over 30 days (60 a day), more than MAX_PAGES x 50 can list at once
function mailbox(n = 1800, days = 30) {
  const all = [];
  for (let i = 0; i < n; i++) all.push({ id: 'm' + String(i).padStart(5, '0'), at: NOW.getTime() - days * 86400000 + Math.floor((i + 0.5) * days * 86400000 / n) });
  const fetchImpl = async (url) => {
    const ok = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
    if (/token/.test(url) && !url.includes('/messages')) return ok({ access_token: 'x', expires_in: 3600 });
    if (url.includes('/messages?')) {
      const u = new URL(url), q = u.searchParams.get('q'), max = Number(u.searchParams.get('maxResults'));
      const after = Number((q.match(/after:(\d+)/) || [])[1]) * 1000, before = (q.match(/before:(\d+)/) || [])[1];
      const hit = all.filter((m) => m.at > after && (!before || m.at < Number(before) * 1000)).sort((a, b) => b.at - a.at);
      const start = Number(u.searchParams.get('pageToken') || 0);
      const page = hit.slice(start, start + max);
      return ok({ messages: page.map((m) => ({ id: m.id })), ...(start + max < hit.length ? { nextPageToken: String(start + max) } : {}) });
    }
    const id = decodeURIComponent(url.split('/messages/')[1].split('?')[0]);
    const m = all.find((x) => x.id === id);
    return ok(msg(m.id, m.at, 'Client ' + id + ' <client' + id + '@example.lv>'));
  };
  return { all, fetchImpl };
}

test('the fake is busy enough: listing 30 days at once cannot reach the oldest mail', () => {
  assert.ok(1800 > MAX_PAGES * 50);
});

test('readMailbox: a reading more than a day behind asks for one day, oldest first; a day read to its end moves the bookmark to its end', async () => {
  const db = await openDb(':memory:');
  await staffMail.saveLink(db, TC_MAILBOX, 'refresh-not-real', ENV);
  const { all, fetchImpl } = mailbox();
  const since = new Date(NOW.getTime() - 30 * 86400000).toISOString();
  const got = await staffMail.readMailbox(db, TC_MAILBOX, { env: ENV, fetchImpl, since, now: NOW });
  assert.equal(got.ok, true);
  assert.equal(got.items.length, 60, 'one day, 60 mails');
  assert.equal(got.items[0].id, all[0].id, 'the oldest mail first');
  assert.equal(got.more, true);
  assert.equal(got.upTo, new Date(Date.parse(since) + staffMail.WINDOW_MS).toISOString(), 'the bookmark goes to the end of the day');
});

test('the whole first fill, run after run: every mail is read once, oldest first, nothing skipped, then it reads as before', async () => {
  const db = await openDb(':memory:');
  await staffMail.saveLink(db, TC_MAILBOX, 'refresh-not-real', ENV);
  const { all, fetchImpl } = mailbox();
  const seen = [];
  let runs = 0;
  // the same bookmark rule as syncTcMail / syncStaffMail: !ok keeps it, more -> upTo, else now; ten minutes of overlap
  let last = null;
  while (runs < 200) {
    runs++;
    const since = new Date(last ? Date.parse(last) - 10 * 60000 : NOW.getTime() - 30 * 86400000).toISOString();
    const got = await staffMail.readMailbox(db, TC_MAILBOX, { env: ENV, fetchImpl, since, now: NOW });
    assert.equal(got.ok, true);
    for (const m of got.items) if (!seen.includes(m.id)) seen.push(m.id);
    last = got.more ? (got.upTo || last) : NOW.toISOString();
    if (!got.more) break;
  }
  assert.deepEqual(seen, all.map((m) => m.id), 'every mail, in order');
  assert.ok(runs <= 40, 'about one run a day of mail: ' + runs);
});

test('syncTcMail: the first run from 30 days back keeps the oldest day, and the bookmark is that day\'s end', async () => {
  const db = await openDb(':memory:');
  await staffMail.saveLink(db, TC_MAILBOX, 'refresh-not-real', ENV);
  const { all, fetchImpl } = mailbox();
  const r = await syncTcMail(db, { now: NOW, env: ENV, fetchImpl });
  assert.equal(r.ran, true);
  assert.equal(r.stored, 60);
  const first = await db.prepare('SELECT MIN(at) a FROM tc_mail').get();
  assert.equal(Date.parse(first.a), Math.floor(all[0].at / 1000) * 1000);
  const st = await db.prepare("SELECT value FROM sync_state WHERE name = 'tc_mail'").get();
  assert.equal(st.value, new Date(NOW.getTime() - 29 * 86400000).toISOString());
});

test('a day too full to list whole is asked for in smaller pieces, still oldest first', async () => {
  const db = await openDb(':memory:');
  await staffMail.saveLink(db, TC_MAILBOX, 'refresh-not-real', ENV);
  const { all, fetchImpl } = mailbox(2400, 2);   // 1200 a day, more than one listing holds
  const since = new Date(NOW.getTime() - 2 * 86400000).toISOString();
  const got = await staffMail.readMailbox(db, TC_MAILBOX, { env: ENV, fetchImpl, since, now: NOW });
  assert.equal(got.items[0].id, all[0].id, 'still the oldest mail first');
  assert.ok(Date.parse(got.upTo) < Date.parse(since) + 86400000, 'the bookmark stays inside the smaller piece');
});

test('a mailbox less than a day behind reads as before (no before:)', async () => {
  const db = await openDb(':memory:');
  await staffMail.saveLink(db, TC_MAILBOX, 'refresh-not-real', ENV);
  const { fetchImpl } = mailbox(50, 0.5);
  const asked = [];
  const spy = async (url) => { if (url.includes('/messages?')) asked.push(new URL(url).searchParams.get('q')); return fetchImpl(url); };
  const got = await staffMail.readMailbox(db, TC_MAILBOX, { env: ENV, fetchImpl: spy, since: new Date(NOW.getTime() - 12 * H).toISOString(), now: NOW });
  assert.equal(got.items.length, 50);
  assert.equal(got.more, false);
  assert.ok(asked.every((q) => !q.includes('before:')));
});
