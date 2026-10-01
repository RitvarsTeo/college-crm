// The SIS to LIVE (01.10.2026), from the SIS team's contract "Novikontas CRM API":
//   GET /api/v1/crm/applicants  ?since ?cursor ?limit=1..500   and   GET /api/v1/crm/web-stats ?range
//   Bearer token; 404 = wrong/revoked token or feed off; 429 = too many; 400 = bad parameter.
// Nothing here calls the SIS: a stand-in plays it, with the contract's own field names.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { syncSis } from '../src/sync.js';
import { fetchWebStats, webStatsFrom, WEB_STATS_URL, SIS_URL } from '../lib/sis.js';
import { sisLiveCheck, yesterdayInRiga } from '../src/sischeck.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TOKEN = 'test-sis-token-not-real-0000';
const ENV = { SIS_API_TOKEN: TOKEN, CHANNEL_MODE_SIS: 'live' };
const NOW = new Date('2026-10-01T12:00:00Z');

const person = (i, over = {}) => ({ reference: `ref-${i}`, applicationId: `app-${i}`, givenName: 'Test', familyName: `Person${i}`,
  email: `p${i}@example.com`, phone: null, programmeCode: 'NAV', programmeName: 'Maritime Transport', status: 'registered',
  registeredAt: '2026-09-28T07:40:11.000Z', submittedAt: null, changedAt: `2026-09-28T08:0${i}:00.000Z`, ...over });

const WEB = {
  host: 'apply.novikontas.org', range: '30d', from: '2026-09-01', to: '2026-09-30',
  totals: { visits: 1303, pageViews: 11355, botRequests: 776, notFound: 401, serverErrors: 70 },
  previous: { visits: 1290, pageViews: 11240 },
  daily: [{ day: '2026-09-01', visits: 43, pageViews: 376 }],
  referrers: [{ name: 'www.google.com', visitors: 738, hits: 1620 }],
  campaigns: [{ name: 'autumn-intake', detail: 'facebook / cpc', visitors: 168, hits: 330 }],
  search: null, lastLoadedAt: '2026-10-01T00:33:12.000Z', somethingNew: { secretish: 'x' },
};

// A stand-in SIS that follows the contract: the token, limit 1..500, cursor paging, since = changed after.
function fakeSis(records, { failOn = null } = {}) {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    const u = new URL(url);
    calls.push({ url, auth: opts.headers && opts.headers.authorization });
    const reply = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
    if (failOn && failOn(u, calls.length)) return reply(failOn.status || 404, {});
    if ((opts.headers || {}).authorization !== `Bearer ${TOKEN}`) return reply(404, {});
    if (u.pathname.endsWith('/web-stats')) {
      if (![...u.searchParams.keys()].every((k) => k === 'range')) return reply(400, {});
      if (!['1d', '7d', '30d', '90d', 'all'].includes(u.searchParams.get('range'))) return reply(400, {});
      return reply(200, WEB);
    }
    const limit = Number(u.searchParams.get('limit') || 200);
    if (!(limit >= 1 && limit <= 500)) return reply(400, {});
    let list = records();
    const since = u.searchParams.get('since');
    if (since) list = list.filter((a) => a.changedAt > since);
    const offset = Number(u.searchParams.get('cursor') || 0);
    const page = list.slice(offset, offset + limit);
    return reply(200, { applicants: page, nextCursor: offset + limit < list.length ? String(offset + limit) : null });
  };
  return { fetchImpl, calls };
}

test('web-stats: the token goes only in the header, the range is checked, only documented fields travel', async () => {
  const sis = fakeSis(() => []);
  const w = await fetchWebStats({ range: '30d', env: ENV, fetchImpl: sis.fetchImpl });
  assert.equal(sis.calls[0].url, WEB_STATS_URL + '?range=30d');
  assert.ok(!sis.calls[0].url.includes(TOKEN));
  assert.equal(sis.calls[0].auth, `Bearer ${TOKEN}`);
  assert.equal(w.totals.visits, 1303);
  assert.equal(w.previous.visits, 1290);
  assert.equal(w.campaigns[0].detail, 'facebook / cpc');
  assert.equal(w.search, null, 'search not connected stays null, never a zero');
  assert.ok(!('somethingNew' in w), 'an undocumented field is not passed on');
  await assert.rejects(fetchWebStats({ range: '14d', env: ENV, fetchImpl: sis.fetchImpl }), /range must be one of/);
});

test('web-stats: 404 and 429 are plain sentences with no token', async () => {
  for (const status of [404, 429]) {
    const failOn = () => true; failOn.status = status;
    const sis = fakeSis(() => [], { failOn });
    await assert.rejects(fetchWebStats({ env: ENV, fetchImpl: sis.fetchImpl }), (e) => e.status === status && !e.message.includes(TOKEN));
  }
});

test('web-stats: a missing value stays missing, never becomes 0', () => {
  const w = webStatsFrom({ totals: { visits: 5 }, daily: [{ day: '2026-09-30', visits: null }] });
  assert.equal(w.totals.pageViews, null);
  assert.equal(w.daily[0].visits, null);
  assert.equal(w.previous, null);
});

test('sync: a 404 or 429 half way stores nothing and keeps the bookmark; the next good run catches up', async () => {
  for (const status of [404, 429]) {
    const db = await openDb(':memory:');
    const rows = [person(1), person(2), person(3)];
    const failOn = (u) => u.searchParams.get('cursor') === '1'; failOn.status = status;
    const sis = fakeSis(() => rows, { failOn });
    const origLimit = 1;
    // force paging with limit 1 by wrapping the fake: the sync asks 200, the fake answers 1 per page
    const paged = async (url, opts) => { const u = new URL(url); if (!u.searchParams.get('cursor')) u.searchParams.set('limit', String(origLimit)); else u.searchParams.set('limit', '1'); return sis.fetchImpl(u.toString(), opts); };
    await assert.rejects(syncSis(db, { now: NOW, env: ENV, fetchImpl: paged }), (e) => e.status === status);
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM sis_applicants').get()).n, 0, `${status}: nothing half-stored`);
    assert.equal(await db.prepare("SELECT value FROM sync_state WHERE name = 'sis'").get(), undefined, `${status}: bookmark untouched`);
    const good = fakeSis(() => rows);
    const r = await syncSis(db, { now: NOW, env: ENV, fetchImpl: good.fetchImpl });
    assert.equal(r.stored, 3);
  }
});

test('sync: a changed record updates the row it already has, by reference, and is never a second one', async () => {
  const db = await openDb(':memory:');
  let rows = [person(1)];
  const sis = fakeSis(() => rows);
  await syncSis(db, { now: NOW, env: ENV, fetchImpl: sis.fetchImpl });
  rows = [person(1, { status: 'submitted', submittedAt: '2026-09-29T10:00:00.000Z', changedAt: '2026-09-29T10:00:00.000Z', phone: '+371 20000000' })];
  const r = await syncSis(db, { now: new Date('2026-10-01T12:05:00Z'), env: ENV, fetchImpl: sis.fetchImpl });
  assert.equal(r.fetched, 1);
  const held = await db.prepare("SELECT status, phone, submitted_at FROM sis_applicants WHERE reference = 'ref-1'").all();
  assert.equal(held.length, 1, 'one row per reference and application');
  assert.equal(held[0].status, 'submitted');
  assert.equal(held[0].phone, '+371 20000000');
  const third = await syncSis(db, { now: new Date('2026-10-01T12:10:00Z'), env: ENV, fetchImpl: sis.fetchImpl });
  assert.equal(third.fetched, 0, 'since the bookmark nothing changed, so nothing comes back');
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM sis_applicants').get()).n, 1);
});

test('sync: it only ever reads from the SIS', async () => {
  const db = await openDb(':memory:');
  const methods = [];
  const sis = fakeSis(() => [person(1)]);
  await syncSis(db, { now: NOW, env: ENV, fetchImpl: (u, o) => { methods.push(o.method); return sis.fetchImpl(u, o); } });
  assert.ok(methods.length > 0 && methods.every((m) => m === 'GET'));
  assert.ok(sis.calls.every((c) => c.url.startsWith(SIS_URL)));
});

test('live check: pages, since, refusals and web stats proved in counts, with no person in the answer', async () => {
  const db = await openDb(':memory:');
  const rows = [person(1), person(2), person(3), person(4, { applicationId: null, status: 'registered' })];
  const sis = fakeSis(() => rows);
  await syncSis(db, { now: NOW, env: ENV, fetchImpl: sis.fetchImpl });
  const c = await sisLiveCheck({ db, env: ENV, fetchImpl: sis.fetchImpl, now: NOW });
  assert.equal(c.api.authenticated, true);
  assert.equal(c.api.records, 4);
  assert.equal(c.api.people, 4);
  assert.equal(c.api.pagination.pages, 4);
  assert.equal(c.api.pagination.sameSetAsOnePage, true);
  assert.equal(c.api.since.fromNow, 0);
  assert.equal(c.api.since.fromNewestOnlyThatInstant, true);
  assert.deepEqual(c.api.wrongToken, { refused: true, status: 404 });
  assert.deepEqual(c.api.badParameter, { refused: true, status: 400 });
  assert.equal(c.api.webStats.ok, true);
  assert.equal(c.api.webStats.endsByYesterday, true);
  assert.equal(c.api.webStats.searchConnected, false);
  assert.equal(c.database.rows, 4);
  assert.equal(c.database.repeatedKeys, 0);
  assert.equal(c.database.inTheSisNotHere, 0);
  const text = JSON.stringify(c);
  for (const leak of ['ref-1', 'p1@example.com', 'Person1', TOKEN]) assert.ok(!text.includes(leak), `no ${leak} in the answer`);
  const sisCalls = sis.calls.length;
  assert.ok(sisCalls < 60, `inside the 60-a-minute limit (${sisCalls})`);
});

test('live check: yesterday is a Riga calendar day', () => {
  assert.equal(yesterdayInRiga(new Date('2026-10-01T21:30:00Z')), '2026-10-01', '00:30 Riga on the 2nd: yesterday is the 1st');
  assert.equal(yesterdayInRiga(new Date('2026-10-01T12:00:00Z')), '2026-09-30');
});

function start(env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], { env: { ...process.env,
      PORT: '0', CRM_DB: ':memory:', DATASET: 'empty', CRM_AUTH: '', CRM_PUBLIC: '', DATABASE_URL: '',
      CRM_DB_DATABASE_URL_UNPOOLED: '', SIS_API_TOKEN: '', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const look = (d) => { out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, base: `http://127.0.0.1:${m[1]}` }); };
    child.stdout.on('data', look); child.stderr.on('data', look);
    child.on('exit', () => reject(new Error(out)));
  });
}

test('routes: web-stats refuses a bad range, and without a token says so plainly; the admin routes are admin only', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  assert.equal((await fetch(s.base + '/api/web-stats?range=14d')).status, 400);
  const r = await fetch(s.base + '/api/web-stats?range=30d').then((x) => x.json());
  assert.equal(r.ok, false);
  assert.match(r.error, /SIS_API_TOKEN/);
  assert.equal((await fetch(s.base + '/api/admin/sis/check', { headers: { 'x-acting-as': 'Ieva' } })).status, 403);
  assert.equal((await fetch(s.base + '/api/admin/sis/sync', { method: 'POST', headers: { 'x-acting-as': 'Ieva' } })).status, 403);
});

test('reports: the web-stats section draws search only when the SIS sends it, and no invented zero', async () => {
  const fs = await import('node:fs');
  const html = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  const fn = html.slice(html.indexOf('async function cWebStats'), html.indexOf('async function cWebStats') + 4000);
  assert.match(fn, /\$\{sr \?/, 'search block is conditional');
  assert.match(fn, /v == null \? ''/, 'a missing total is not drawn');
  assert.ok(html.includes('id="cWeb"'), 'the section is on the Reports screen');
});
