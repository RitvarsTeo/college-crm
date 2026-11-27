// META APP REVIEW (27.11.2026, his picks "Yes, on Intake" and "Inbox-only reviewer login").
//   1. /data-deletion: a public STATIC page, English and Latvian, on how to ask for one's data to be deleted.
//   2. The reviewer: an account whose only area is 'review' opens the Messenger, Instagram and WhatsApp threads, read-only,
//      and NOTHING else; an admin switches it off with one tick (the area) on People and access.
// Every person and message here is invented.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, start, startWithAreas } from './security_helpers.js';
import { areaAllows, areaOfApi, AREAS } from '../src/areas.js';
import { DATA_DELETION_PAGE } from '../src/datadeletion.js';
import { openDb } from '../src/db.js';
import { reviewInbox, reviewThread, REVIEW_CHANNELS } from '../src/review.js';
import { receive } from '../src/intake.js';

const SERVER = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');

test('the data deletion page: open without sign-in, static, both languages, the sourced contact and deadlines', async (t) => {
  const s = await start({ DATASET: 'empty' });
  t.after(() => s.child.kill());
  const r = await fetch(s.base + '/data-deletion', { redirect: 'manual' });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/html/);
  assert.match(r.headers.get('content-security-policy'), /default-src 'none'/, 'no script can run on it');
  const html = await r.text();
  assert.equal(html, DATA_DELETION_PAGE, 'exactly the static text, nothing read from the database');
  for (const s2 of ['dataregulation@novikontas.org', 'Within one month', 'Viena mēneša laikā', '13 months', '13 mēnešus',
    'Facebook Messenger, Instagram and WhatsApp', 'www.dvi.gov.lv', '40003746413', 'Datu dzēšana']) assert.ok(html.includes(s2), s2);
  assert.ok(!/<script|<form|\$\{/.test(html), 'no script, no form, no template left');
  assert.match(SERVER, /if \(PAGE_READ && p === '\/data-deletion'\) \{\n[^\n]*\n[^\n]*\n\s*return res\.end\(DATA_DELETION_PAGE\);/);
});

// patch 198 (27.11.2026): Meta checks the URL with HEAD, which answered 404. The static pages answer HEAD like GET, no body;
// an /api/ route never does (the sign-in door still answers).
test('HEAD on /data-deletion and the other static pages: 200, the same headers as GET, no body; never on /api/', async (t) => {
  const s = await start({ DATASET: 'empty', CRM_AUTH: '1', GOOGLE_CLIENT_ID: 'x', GOOGLE_CLIENT_SECRET: 'y', CRM_SESSION_SECRET: 'test-session-secret-not-real-000' });
  t.after(() => s.child.kill());
  const get = await fetch(s.base + '/data-deletion');
  await get.text();
  const head = await fetch(s.base + '/data-deletion', { method: 'HEAD' });
  assert.equal(head.status, 200);
  for (const h of ['content-type', 'content-security-policy', 'cache-control', 'x-content-type-options']) assert.equal(head.headers.get(h), get.headers.get(h), h);
  assert.equal((await head.arrayBuffer()).byteLength, 0, 'no body');
  for (const p of ['/', '/healthz', '/manifest.webmanifest', '/favicon.ico', '/sw.js']) {
    const r = await fetch(s.base + p, { method: 'HEAD' });
    await r.arrayBuffer();
    assert.equal(r.status, 200, p);
  }
  for (const p of ['/api/people', '/api/review/inbox', '/api/intake']) {
    const r = await fetch(s.base + p, { method: 'HEAD', redirect: 'manual' });
    await r.arrayBuffer();
    assert.notEqual(r.status, 200, 'HEAD on ' + p + ' is never a way past the sign-in door');
  }
  assert.match(SERVER, /const PAGE_READ = req\.method === 'GET' \|\| \(req\.method === 'HEAD' && !p\.startsWith\('\/api\/'\)\);/);
});

test('the review area: a reviewer-only account opens only the review paths and signing in/out; nobody else opens review', () => {
  const reviewer = { areas: ['review'] };
  assert.ok(AREAS.includes('review'));
  assert.equal(areaOfApi('/api/review/inbox'), 'review');
  for (const p of ['/api/review/inbox', '/api/review/inbox/3', '/api/auth/me', '/api/auth/logout', '/api/whoami']) assert.ok(areaAllows(reviewer, p), p);
  for (const p of ['/api/people', '/api/intake', '/api/help/counts', '/api/feedback', '/api/admin/access', '/api/tc/home', '/api/export/people', '/api/config'])
    assert.equal(areaAllows(reviewer, p), false, p);
  for (const areas of [['academy'], ['tc'], ['academy', 'tc'], []]) assert.equal(areaAllows({ areas }, '/api/review/inbox'), false, 'review needs the review area: ' + areas);
  assert.equal(areaAllows(null, '/api/review/inbox'), false);
});

test('a running copy as the reviewer: every other route answers 403; the review Inbox answers and refuses writes', async (t) => {
  const s = await startWithAreas();
  t.after(() => s.child.kill());
  const ask = async (p, method = 'GET', who = 'reviewer') => {
    const r = await fetch(s.base + p, { method, redirect: 'manual', headers: { origin: s.base, 'content-type': 'application/json',
      accept: 'application/json', cookie: s.cookie(who) }, ...(method === 'POST' ? { body: '{}' } : {}) });
    const text = await r.text();
    return { status: r.status, text };
  };
  const paths = [...new Set([...SERVER.matchAll(/p === '(\/api\/[^']+)'/g)].map((m) => m[1]))]
    .filter((p) => !/^\/api\/(auth|cron|inbound|intake\/application|review)\b/.test(p) && p !== '/api/whoami');
  assert.ok(paths.length > 100, 'the routes were found: ' + paths.length);
  const open = [];
  for (const p of paths) for (const m of ['GET', 'POST']) { const r = await ask(p, m); if (r.status !== 403) open.push(`${m} ${p} -> ${r.status}`); }
  assert.deepEqual(open, [], 'a reviewer-only account reaches nothing but the review Inbox');
  const inbox = await ask('/api/review/inbox');
  assert.equal(inbox.status, 200);
  assert.deepEqual(JSON.parse(inbox.text).threads, []);
  assert.equal((await ask('/api/review/inbox', 'POST')).status, 405, 'read-only');
  assert.equal((await ask('/api/review/inbox/1', 'POST')).status, 405);
  // without the area: the gate says no, even for an admin
  assert.equal((await ask('/api/review/inbox', 'GET', 'admin')).status, 403);
  assert.equal((await ask('/api/review/inbox', 'GET', 'academy')).status, 403);
  // the screen is told the area, so it draws only the review Inbox
  const me = JSON.parse((await ask('/api/auth/me')).text);
  assert.deepEqual(me.user.areas, ['review']);
});

test('the review Inbox: only Messenger, Instagram and WhatsApp, newest first, a thread with our replies; never another channel', async () => {
  const db = await openDb();
  const add = async (channel, at, name, body) => (await receive(db, { channel, externalId: channel + at, receivedAt: at, name, body, noFilter: true })).id;
  const m = await add('messenger', '2026-11-27T09:00:00.000Z', 'Anna Example', 'Hello, when does Navigation start?');
  await add('instagram', '2026-11-27T10:00:00.000Z', 'Ben Sample', 'Hi');
  await add('gmail', '2026-11-27T11:00:00.000Z', 'Mail Person', 'not for the reviewer');
  await add('phone', '2026-11-27T12:00:00.000Z', 'Caller', 'not for the reviewer');
  const seq = Number((await db.prepare('SELECT MAX(seq) n FROM inbound_line WHERE inbound_id = ?').get(m)).n || 0) + 1;
  await db.prepare(`INSERT INTO inbound_line (inbound_id, seq, channel, received_at, kind, body) VALUES (?,?,?,?,?,?)`)
    .run(m, seq, 'messenger', '2026-11-27T09:20:00.000Z', 'reply', 'In September.');
  const list = await reviewInbox(db);
  assert.deepEqual(list.map((x) => x.channel), ['instagram', 'messenger']);
  const t = await reviewThread(db, m);
  assert.deepEqual(t.messages.map((x) => [x.kind, x.text]), [['message', 'Hello, when does Navigation start?'], ['reply', 'In September.']]);
  const mail = (await db.prepare(`SELECT id FROM inbound WHERE channel = 'gmail'`).get()).id;
  assert.equal(await reviewThread(db, mail), null, 'another channel\'s card is never shown');
  assert.deepEqual(REVIEW_CHANNELS, ['facebook', 'messenger', 'instagram', 'whatsapp']);
});

test('the screen: a reviewer-only account gets the review Inbox at any address, no menu, no Year filter', () => {
  const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  assert.match(APP, /if \(mine\.includes\('review'\) && !mine\.includes\('academy'\) && !mine\.includes\('tc'\)\) \{ cSetArea\('review'\); await viewReview\(hash\); return true; \}/);
  assert.match(APP, /html\.ui-c\[data-area="review"\] \.shell > nav > \.cnav, html\.ui-c\[data-area="review"\] \.ctabs, html\.ui-c\[data-area="review"\] #cScope\{display:none!important\}/);
  const v = APP.slice(APP.indexOf('async function viewReview('), APP.indexOf('\n}\n', APP.indexOf('async function viewReview(')));
  assert.ok(!/post\(|api\('\/api\/(?!review)/.test(v), 'the view reads only the review Inbox and writes nothing');
});
