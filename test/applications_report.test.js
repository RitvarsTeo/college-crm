// Applications in Reports (SESSION 4, 02.10.2026). Decided 01.10 (popup A): the Applications view
// is built from the SIS data already in Intake, per programme and week, sparse until the SIS has
// real applicants, nothing fabricated, placed in Reports under apply.novikontas.org, no menu item.
//
// What these pin: the weekly funnel is a REGISTRATION-WEEK COHORT from current status only (the SIS
// sends no status history), the six team tests a person set aside are never counted, the block is
// read-only, its state says what is true, and it sits inside Reports beside the web statistics.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { syncSis } from '../src/sync.js';
import { archive, receive } from '../src/intake.js';
import { rigaWeek, funnelFrom, applicationFunnel } from '../src/applications.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const ENV = { SIS_API_TOKEN: 'test-sis-token-not-real-0000', CHANNEL_MODE_SIS: 'test' };
const feed = (apps) => async () => ({ ok: true, status: 200, json: async () => ({ applicants: apps, nextCursor: null }) });
const row = (over) => ({ reference: 'r', application_id: 'a', programme_code: 'NAV', status: 'submitted',
  registered_at: '2026-09-29T08:00:00.000Z', changed_at: '2026-09-30T08:00:00.000Z', person_id: null, ...over });

test('cohort: the week is the Riga calendar week a person registered in, ISO numbered', () => {
  assert.deepEqual(rigaWeek('2026-09-27T21:30:00Z'), { week: '2026-W40', monday: '2026-09-28' }, '00:30 Monday in Riga');
  assert.deepEqual(rigaWeek('2026-09-27T20:30:00Z'), { week: '2026-W39', monday: '2026-09-21' }, '23:30 Sunday in Riga');
  assert.deepEqual(rigaWeek('2027-01-01T10:00:00Z'), { week: '2026-W53', monday: '2026-12-28' }, 'ISO year edge');
  assert.equal(rigaWeek('not a date'), null);
});

test('cohort: people by the week they registered, where they stand now; later steps count as passed', () => {
  const f = funnelFrom([
    row({ reference: 'p1', application_id: '', programme_code: null, status: 'registered' }),
    row({ reference: 'p2', status: 'started' }),
    row({ reference: 'p3', status: 'matriculated', registered_at: '2026-09-21T08:00:00.000Z' }),
    row({ reference: 'p4', status: 'rejected' }),
    // one person, two applications: one person in the week, two applications by programme
    row({ reference: 'p5', application_id: 'a1', programme_code: 'NAV', status: 'submitted' }),
    row({ reference: 'p5', application_id: 'a2', programme_code: 'ENG', status: 'withdrawn' }),
    row({ reference: 'p6', status: 'admitted', registered_at: null }),
  ]);
  assert.equal(f.people, 6);
  assert.equal(f.applications, 6, 'registered-only is not an application: 7 rows, 6 applications');
  assert.equal(f.undatedRegistration, 1, 'no registration date is counted apart, never placed in a week');
  assert.deepEqual(f.weeks.map((w) => w.week), ['2026-W40', '2026-W39'], 'newest first, and only weeks somebody registered in');
  const w40 = f.weeks[0];
  assert.equal(w40.people, 4);
  assert.deepEqual(w40.now, { registered: 1, started: 1, submitted: 1, admitted: 0, matriculated: 0, rejected: 1, withdrawn: 0 },
    'p5 is where their furthest open application is');
  assert.deepEqual(w40.reached, { registered: 4, started: 2, submitted: 1, admitted: 0, matriculated: 0 },
    'rejected counts as registered and nowhere further: the SIS does not say at which step it ended');
  assert.deepEqual(f.weeks[1].reached, { registered: 1, started: 1, submitted: 1, admitted: 1, matriculated: 1 });
  const eng = f.programmes.find((p) => p.code === 'ENG');
  assert.equal(eng.applications, 1); assert.equal(eng.now.withdrawn, 1);
  assert.equal(f.programmes.find((p) => p.code === 'NAV').applications, 5);
});

test('no fabricated history: nothing in the answer dates a status change, only the registration week', () => {
  const f = funnelFrom([row({ reference: 'p1', status: 'admitted' })]);
  const text = JSON.stringify(f);
  for (const k of ['changed_at', 'changedAt', 'submitted_at', 'movedAt', 'admittedAt', 'startedAt', 'history']) {
    assert.ok(!text.includes(k), `no ${k} in the funnel`);
  }
  for (const w of f.weeks) assert.deepEqual(Object.keys(w).sort(), ['monday', 'now', 'people', 'reached', 'week']);
  assert.ok(APP.includes('where each person stands now'), 'the screen names the basis');
});

test('set aside: the six archived team tests are held, never counted; the state says so', async () => {
  const db = await openDb(':memory:');
  const six = ['registered', 'registered', 'registered', 'registered', 'matriculated', 'submitted'].map((status, i) => ({
    reference: 'prod-like-' + i, applicationId: status === 'registered' ? '' : 'app-' + i, givenName: 'Test',
    familyName: 'Person ' + i, email: `test.person.${i}@example.com`, phone: null,
    programmeCode: status === 'registered' ? null : 'ENG', status, registeredAt: '2026-09-25T10:00:00.000Z',
    submittedAt: status === 'registered' ? null : '2026-09-27T10:00:00.000Z', changedAt: '2026-09-27T10:00:00.000Z' }));
  for (const a of six) {
    await db.prepare(`INSERT INTO sis_applicants (reference, application_id, given_name, family_name, email, phone,
      programme_code, status, registered_at, submitted_at, changed_at, synced_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      a.reference, a.applicationId, a.givenName, a.familyName, a.email, a.phone, a.programmeCode, a.status,
      a.registeredAt, a.submittedAt, a.changedAt, '2026-09-29T11:30:40.888Z');
    const { id } = await receive(db, { channel: 'sis', externalId: 'sis:' + a.reference,
      receivedAt: '2026-09-29T11:30:40.888Z', name: a.givenName + ' ' + a.familyName, email: a.email,
      body: 'SIS: registered, no application yet', source: 'simulated' });
    await db.prepare('UPDATE sis_applicants SET inbound_id = ? WHERE reference = ?').run(id, a.reference);
    await archive(db, id, { reason: 'Internal', by: 'Admin', note: 'team test submission' });
  }
  await syncSis(db, { now: new Date('2026-10-02T05:00:00Z'), env: ENV, fetchImpl: feed(six.map((a) => ({ ...a }))) });
  const live = await applicationFunnel(db, { env: { ...ENV, CHANNEL_MODE_SIS: 'live' } });
  assert.equal(live.setAside, 6);
  assert.equal(live.people, 0);
  assert.equal(live.feed.references, 6);
  assert.equal(live.state, 'no-real-applicant', 'live, and still truthfully no real applicant');
  assert.deepEqual(live.weeks, []);
  assert.ok(!JSON.stringify(live).match(/prod-like|example\.com|Person \d/), 'counts only, nobody named');

  // a real applicant arrives: counted, and the state turns live
  await syncSis(db, { now: new Date('2026-10-03T05:00:00Z'), env: { ...ENV, CHANNEL_MODE_SIS: 'live' }, fetchImpl: feed([{
    reference: 'real-1', applicationId: 'app-r', givenName: 'Anna', familyName: 'Liepa', email: 'anna.liepa@example.com',
    phone: null, programmeCode: 'NAV', status: 'submitted', registeredAt: '2026-10-02T09:00:00.000Z',
    submittedAt: '2026-10-02T09:30:00.000Z', changedAt: '2026-10-02T09:30:00.000Z' }]) });
  const now = await applicationFunnel(db, { env: { ...ENV, CHANNEL_MODE_SIS: 'live' } });
  assert.equal(now.people, 1); assert.equal(now.setAside, 6); assert.equal(now.state, 'live');
  assert.equal(now.weeks[0].week, '2026-W40');
});

test('state: off, then no run yet, are said as they are', async () => {
  const db = await openDb(':memory:');
  assert.equal((await applicationFunnel(db, { env: {} })).state, 'off');
  const t = await applicationFunnel(db, { env: { CHANNEL_MODE_SIS: 'test' } });
  assert.equal(t.state, 'no-run');
  assert.equal(t.statusHistory, false);
  assert.equal(t.basis, 'registration-week');
});

test('read-only: building the funnel writes nothing and never calls the SIS', async () => {
  const db = await openDb(':memory:');
  await syncSis(db, { now: new Date('2026-10-02T05:00:00Z'), env: ENV, fetchImpl: feed([{ reference: 'x', applicationId: 'a',
    givenName: 'A', familyName: 'B', email: 'a.b@example.com', phone: null, programmeCode: 'NAV', status: 'started',
    registeredAt: '2026-10-01T09:00:00.000Z', submittedAt: null, changedAt: '2026-10-01T09:00:00.000Z' }]) });
  const tables = ['sis_applicants', 'inbound', 'people', 'sync_state', 'lifecycle_events'];
  const count = async () => Promise.all(tables.map(async (t) => {
    try { return (await db.prepare(`SELECT COUNT(*) n FROM ${t}`).get()).n; } catch { return 'absent'; } }));
  const before = await count();
  const state = await db.prepare("SELECT ran_at, value FROM sync_state WHERE name = 'sis'").get();
  const real = globalThis.fetch; let called = 0;
  globalThis.fetch = async () => { called++; throw new Error('no network'); };
  try { await applicationFunnel(db, { env: ENV }); } finally { globalThis.fetch = real; }
  assert.equal(called, 0, 'no SIS call');
  assert.deepEqual(await count(), before, 'no row written');
  assert.deepEqual(await db.prepare("SELECT ran_at, value FROM sync_state WHERE name = 'sis'").get(), state, 'the bookmark is untouched');
  const src = fs.readFileSync(path.join(ROOT, 'src', 'applications.js'), 'utf8');
  assert.ok(!/\b(INSERT|UPDATE|DELETE|DROP|ALTER)\b/.test(src.replace(/^\s*\/\/.*$/gm, '')), 'SELECTs only');
  assert.ok(!/syncSis|fetchChanged|fetchPage|fetchWebStats/.test(src), 'no sync, no SIS client');
});

function start(env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], { env: { ...process.env,
      PORT: '0', CRM_DB: ':memory:', DATASET: 'empty', CRM_AUTH: '', CRM_PUBLIC: '', DATABASE_URL: '',
      CRM_DB_DATABASE_URL_UNPOOLED: '', SIS_API_TOKEN: '', CHANNEL_MODE_SIS: '', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const look = (d) => { out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, base: `http://127.0.0.1:${m[1]}` }); };
    child.stdout.on('data', look); child.stderr.on('data', look);
    child.on('exit', () => reject(new Error(out)));
  });
}

test('route: GET /api/applications answers counts; nothing else on it', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  const r = await fetch(s.base + '/api/applications', { headers: { 'x-acting-as': 'Ieva' } });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.state, 'off');
  assert.equal(d.people, 0);
  assert.equal(d.statusHistory, false);
  const post = await fetch(s.base + '/api/applications', { method: 'POST', headers: { 'x-acting-as': 'Ieva' } });
  assert.notEqual(post.status, 200, 'not a write route');
});

test('placement: Applications lives inside Reports, beside the web statistics, with no menu item', () => {
  const nav = APP.slice(APP.indexOf('<a href="#/reports" data-c="reports"') - 2000, APP.indexOf('<a href="#/reports" data-c="reports"') + 400);
  assert.ok(!/href="#\/applications"/.test(APP), 'no #/applications route or menu link');
  assert.ok(!/data-c="applications"/.test(nav), 'no Applications item in the menu');
  const rep = APP.slice(APP.indexOf('async function viewReportsC'), APP.indexOf('// apply.novikontas.org, from the SIS'));
  const ch = rep.slice(rep.indexOf('<section class="c-apps" id="applications"'), rep.indexOf('</section>\n', rep.indexOf('id="cSis"')) + 10);
  assert.ok(ch.includes('id="cWeb"') && ch.includes('id="cSis"'), 'web statistics and the SIS funnel are one chapter');
  assert.ok(ch.indexOf('id="cWeb"') < ch.indexOf('id="cSis"'), 'in the order of the journey: the site, then the SIS');
  assert.match(rep, /cWebStats\(\);\n\s*cApplications\(\);/);
  assert.ok(rep.includes('href="#/reports/applications"'), 'the report opens at the chapter from its own header');
  assert.match(APP, /arg === 'applications'\) \{ const a = \$\('#applications'\)/, '#/reports/applications scrolls to the chapter');
});

test('design: the frame carries the locked sea, the marks stay flat, one scene, mustard for traffic', () => {
  const css = APP.slice(APP.indexOf('/* APPLICATIONS (Reports, 02.10.2026)'), APP.indexOf('html.ui-c .c-reasons{margin:0 0 14px}'));
  assert.ok(css.includes('radial-gradient(120% 80% at 50% 0%,#fbfcfd 0%,rgba(251,252,253,0) 60%)'), 'light glow');
  assert.ok(css.includes('radial-gradient(120% 80% at 50% 0%,#17456e 0%,rgba(23,69,110,0) 60%)'), 'dark glow');
  const navies = new Set((css.match(/#[0-9a-f]{6}\b/gi) || []).map((x) => x.toLowerCase()));
  for (const c of navies) assert.ok(['#fbfcfd', '#f7f9fb', '#f5f7fa', '#e7ebf0', '#17456e', '#0f2f4f', '#08182e', '#e0a526'].includes(c), `no new colour ${c}`);
  assert.ok(!/\.c-f(bar|cell|step)[^{]*\{[^}]*(box-shadow|perspective|rotate|skew)/.test(css), 'no depth on a mark');
  assert.equal((css.match(/transition:transform/g) || []).length, 1, 'one scene in the chapter');
  assert.ok(!/@keyframes/.test(css), 'no extra animation');
  assert.ok(css.includes('prefers-reduced-motion'));
  assert.ok(css.includes('overflow-x:auto') && css.includes('@media(max-width:640px)'), 'the tables scroll inside themselves on a phone');
  const web = APP.slice(APP.indexOf('async function cWebStats'), APP.indexOf('// Applications: the SIS funnel'));
  assert.equal((web.match(/var\(--v-web\)/g) || []).length, 2, 'apply.novikontas.org traffic in the data mustard');
  assert.ok(!web.includes('var(--v-adm)'));
});

test('truthful empty: no applicant means the sentence, never a zero-filled funnel', () => {
  const fn = APP.slice(APP.indexOf('async function cApplications'), APP.indexOf('function cAppPeople'));
  assert.match(fn, /if \(!d\.people\) \{/);
  assert.ok(fn.includes('No real applicant yet.'));
  assert.ok(fn.includes('a person set aside'));
  assert.ok(fn.includes("'The SIS feed is off.'"));
});

test('state: a record that came by the webhook, before any pull, is counted and not hidden behind "no run"', async () => {
  const db = await openDb(':memory:');
  const { receiveSisApplication } = await import('../src/sync.js');
  const r = await receiveSisApplication(db, { reference: 'w1', applicationId: 'a', givenName: 'A', familyName: 'B',
    email: 'w1@example.com', phone: null, programmeCode: 'NAV', status: 'started', registeredAt: '2026-10-01T09:00:00.000Z',
    submittedAt: null, changedAt: '2026-10-01T09:00:00.000Z' }, { env: ENV, now: new Date('2026-10-01T09:01:00Z') });
  assert.equal(r.ok, true, JSON.stringify(r));
  const f = await applicationFunnel(db, { env: ENV });
  assert.equal(f.feed.lastRun, null);
  assert.equal(f.people, 1);
  assert.equal(f.state, 'test');
});

test('split: the funnel is two groups, the site steps then the college decision, on one scale', () => {
  const fn = APP.slice(APP.indexOf('async function cApplications'), APP.indexOf('function cAppPeople'));
  assert.match(APP, /const C_APP_SITE = \['registered', 'started', 'submitted'\];/);
  assert.ok(fn.indexOf("group('On the website'") < fn.indexOf("group('Academy decision'"));
  assert.equal((fn.match(/R\[k\] \/ top/g) || []).length, 1, 'one scale for both groups');
});
