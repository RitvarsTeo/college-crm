// Q59, the owner 06.10.2026: "nnoononono, periods need to be just a whole year! I told you this explicitly, and inside
// this year we can in app choose the periods we need. In the drop down, its only a year choice! Whole calendar year from
// start to finish, one year. GET IT? It can be clickable, so as to look at many years combined! Any years combined!"
// Pinned here: the corner holds whole years only, ticked in any combination; the server takes the SET; Reports chooses a
// month inside the chosen years; an old ?y=YYYY&m=M link still lands on that month.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { report } from '../src/reports.js';
import { yearsOf, yearRanges, scopeRanges } from '../src/yearscope.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fnBody = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// the corner's code, as the page has it, on 6 October 2026, with 2026, 2025 and 2024 holding people
function corner(search = '') {
  const ctx = { cTodayIso: () => '2026-10-06', esc: (s) => String(s), UI: 'c', C_PCOHORT: null, location: { search }, URLSearchParams,
    C_REP_MONTH: '', set: [], cDrawScope() { ctx.drawn = (ctx.drawn || 0) + 1; }, route() {}, cNavCounts() {} };
  ctx.cSetScope = (y) => { ctx.set.push(y); };
  vm.runInNewContext(APP.slice(APP.indexOf('const C_SCOPED = '), APP.indexOf('// Desktop: the corner of the window')).replace(/^(const|let) /gm, 'var ')
    + '\n' + fnBody('function cScopeFromUrl() {'), ctx);
  ctx.C_SCOPE_YEARS = [2026, 2025, 2024];
  return ctx;
}

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], {
      env: { ...process.env, PORT: '0', CRM_DB: ':memory:', DATASET: 'synthetic', CRM_AUTH: '', DATABASE_URL: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.stdout.on('data', (d) => { const m = String(d).match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, port: Number(m[1]) }); });
    child.on('exit', (code) => reject(new Error(`server exited (${code}): ${err}`)));
    setTimeout(() => reject(new Error('server did not start: ' + err)), 15000);
  });
}

test('the dropdown: "Year", ticks, whole years only - All years then each year with people, newest first; NO months, no "Period"', () => {
  const ctx = corner();
  ctx.C_SCOPE_OPEN = true;
  const html = ctx.cScopeHtml();
  assert.match(html, /^<div class="c-jf c-jfm c-scope-jf"><span>Year<\/span><button type="button" class="c-jfb"/, 'labelled Year, the filter look, plain on the current year');
  const boxes = [...html.matchAll(/<input type="checkbox" value="([^"]+)"( checked)?/g)].map((m) => [m[1], !!m[2]]);
  assert.deepEqual(boxes, [['all', false], ['2026', true], ['2025', false], ['2024', false]], 'All years, then each year; the current one ticked');
  assert.doesNotMatch(html, new RegExp(MONTHS.join('|')), 'no month anywhere');
  assert.doesNotMatch(html, /Period|Whole year|optgroup|<select/, 'no Period wording, no month list');
  assert.doesNotMatch(APP.slice(APP.indexOf('const C_SCOPED = '), APP.indexOf('// Desktop: the corner of the window')), /aria-label="Period"/);
});

test('every open: the current year alone, plain; any other choice reads its years and is navy', () => {
  const ctx = corner();
  assert.equal(ctx.cScopeWord(), '2026');
  assert.equal(ctx.cScopeQs(), 'y=2026');
  assert.equal(ctx.cScopeReportQs(), 'years=2026');
  assert.doesNotMatch(ctx.cScopeHtml(), /past/);
  ctx.C_SCOPE = { years: [2024, 2026] };
  assert.equal(ctx.cScopeWord(), '2024, 2026');
  assert.equal(ctx.cScopeQs(), 'y=2024,2026');
  assert.equal(ctx.cScopeReportQs(), 'years=2024,2026');
  assert.equal(ctx.cScopeYear(), 'multi', 'several years: no single year (no target)');
  assert.match(ctx.cScopeHtml(), /class="c-jf c-jfm c-scope-jf past"/);
  assert.match(ctx.cScopeHtml(), /aria-label="Year"[^>]*>2024, 2026<\/button>/, 'the closed control reads the years');
  ctx.C_SCOPE = { years: [2025] };
  assert.match(ctx.cScopeHtml(), /past/, 'one other year: navy too');
  ctx.C_SCOPE = { years: 'all' };
  assert.equal(ctx.cScopeWord(), 'All years');
  assert.equal(ctx.cScopeQs(), '', 'All years: no filter');
  assert.equal(ctx.cScopeReportQs(), 'from=2024-01-01');
  assert.equal(ctx.cScoped('/api/people?y=2025&m=3'), '/api/people?y=2025&m=3', 'a read that names its year keeps it');
  // the app opens on the current year: the state starts empty, and nothing remembers a choice across opens
  assert.match(APP, /let C_SCOPE = \{ years: null \};/);
});

test('ticks: any combination; All years ticks all; unticking All years goes back to the current year; the last year stays', () => {
  const ctx = corner();
  ctx.cPickScope(2024, true);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.set.pop())), [2026, 2024]);
  ctx.C_SCOPE = { years: [2024, 2026] };
  ctx.cPickScope(2025, true);
  assert.equal(ctx.set.pop(), 'all', 'every year ticked = All years');
  ctx.C_SCOPE = { years: 'all' };
  ctx.cPickScope(2025, false);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.set.pop())), [2026, 2024]);
  ctx.cPickScope('all', false);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.set.pop())), [2026]);
  ctx.cPickScope('all', true);
  assert.equal(ctx.set.pop(), 'all');
  ctx.C_SCOPE = { years: null };
  const before = ctx.set.length;
  ctx.cPickScope(2026, false);
  assert.equal(ctx.set.length, before, 'the last year can not be unticked');
  // the page's own cSetScope: the current year alone is the plain state; a month on Reports goes with its year
  const set = fnBody('function cSetScope(years) {');
  assert.match(set, /years\.length === 1 && Number\(years\[0\]\) === now \? null/);
  assert.match(set, /if \(C_REP_MONTH && !cRepMonths\(\)\.includes\(C_REP_MONTH\)\) C_REP_MONTH = '';/);
});

test('the server takes the SET: neighbours join, a gap is two ranges; nobody counted twice or borrowed from another year', async (t) => {
  assert.deepEqual(yearsOf('2026,2024,x,2024'), [2024, 2026]);
  assert.equal(yearRanges([2024, 2025]).length, 1, '2024 + 2025 is one range');
  assert.equal(yearRanges([2024, 2026]).length, 2, '2024 + 2026 is two');
  assert.equal(scopeRanges(new URLSearchParams('')), null, 'no y = every year');
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const get = async (u) => (await fetch(`http://127.0.0.1:${port}${u}`)).json();
  const years = (await get('/api/scope/years')).years;
  assert.ok(years.length >= 1);
  const ids = async (u) => new Set((await get(u)).rows.map((p) => p.id));
  for (const y of years) {
    const one = await ids(`/api/people?y=${y}`);
    const withEmpty = await ids(`/api/people?y=${y},2001`);
    assert.deepEqual([...withEmpty].sort(), [...one].sort(), `${y} + an empty year = ${y}`);
  }
  if (years.length >= 2) {
    const [a, b] = years;
    const A = await ids(`/api/people?y=${a}`), B = await ids(`/api/people?y=${b}`), AB = await ids(`/api/people?y=${a},${b}`);
    assert.equal(AB.size, A.size + B.size, 'two years = the sum, each person once');
    for (const id of [...A, ...B]) assert.ok(AB.has(id));
    const tasks = await get(`/api/tasks?scope=open&y=${a},${b}`);
    for (const tk of tasks) assert.ok(AB.has(tk.person_id), 'a task of somebody in the two years');
    const ia = (await get(`/api/intake?y=${a}`)).counts, ib = (await get(`/api/intake?y=${b}`)).counts, iab = (await get(`/api/intake?y=${a},${b}`)).counts;
    assert.equal(iab.new, ia.new + ib.new, 'the Inbox sums by the message\'s arrival');
  }
  assert.equal((await get('/api/people?y=2001,2002')).rows.length, 0, 'years with nobody: nobody');
});

test('the report over a set of years: 2024 + 2026 counts both and never 2025; the Admitted by admission year', async () => {
  const db = await openDb(':memory:');
  const add = (id, created, admitted = null) => db.prepare(`INSERT INTO people (id,name,status,owner,source_channel,created_at,last_contact_at,admitted_at)
    VALUES (?,?,?,?,?,?,?,?)`).run(id, 'T ' + id, admitted ? 'Admitted' : 'New', 'Admissions', 'website', created, created, admitted);
  await add('a24', '2024-03-10T10:00:00Z'); await add('b24', '2024-11-02T10:00:00Z', '2025-01-20T10:00:00Z');
  await add('a25', '2025-05-05T10:00:00Z'); await add('b25', '2025-06-05T10:00:00Z', '2026-02-01T10:00:00Z');
  await add('a26', '2026-02-14T10:00:00Z'); await add('b26', '2026-04-01T10:00:00Z', '2026-06-01T10:00:00Z');
  const r = await report(db, { years: [2024, 2026] });
  assert.equal(r.period.ranges.length, 2);
  assert.deepEqual(r.period.years, [2024, 2026]);
  assert.match(r.period.label, /^2024-01-01 to 2024-12-31, 2026-01-01 to 2026-/, 'the label names both ranges');
  assert.equal(r.summary.newLeads, 4, 'arrived in 2024 or 2026: a24 b24 a26 b26');
  assert.equal(r.summary.admitted, 2, 'admitted in 2024 or 2026: b25 (Feb 2026) and b26; b24 was admitted in 2025');
  const one = async (y) => (await report(db, { years: [y] })).summary;
  assert.equal((await one(2024)).newLeads + (await one(2026)).newLeads, r.summary.newLeads, 'the set = the sum of its years');
  assert.equal((await one(2025)).admitted, 1);
  assert.equal((await report(db, { years: [2024, 2025] })).period.ranges.length, 1, 'neighbours: one range');
  // a run of days (a month chosen on Reports, an export) still reads as before
  assert.equal((await report(db, { from: '2026-02-01', to: '2026-02-28' })).summary.newLeads, 1);
});

test('Reports: "Whole year" or ONE month of the chosen years, never another year; the download follows it', () => {
  const block = APP.slice(APP.indexOf("let C_REP_MONTH = '';"), APP.indexOf('async function viewReportsC() {'));
  let years = [2025];
  const ctx = { RPT: {}, cTodayIso: () => '2026-10-06', cScopeList: () => years, cScopeAllYears: () => [2026, 2025, 2024], cNowYear: () => 2026,
    cScopeWord: () => (years === 'all' ? 'All years' : years.join(', ')), C_SCOPE_YEARS: [2026, 2025, 2024], C_MONTHS_LONG: MONTHS,
    esc: (s) => String(s), viewReportsC() { ctx.drew = (ctx.drew || 0) + 1; } };
  vm.runInNewContext(block.replace(/^let /gm, 'var '), ctx);
  assert.deepEqual([...ctx.cRepMonths()], ['2025-12', '2025-11', '2025-10', '2025-09', '2025-08', '2025-07', '2025-06', '2025-05', '2025-04', '2025-03', '2025-02', '2025-01']);
  years = [2025, 2026];
  assert.equal(ctx.cRepMonths()[0], '2026-10', 'no month that has not begun');
  assert.ok(!ctx.cRepMonths().some((m) => m.startsWith('2024')), 'never a year that is not chosen');
  ctx.cRepPickMonth('2024-05');
  assert.equal(ctx.C_REP_MONTH, '', 'a month outside the chosen years is not taken');
  ctx.cRepPickMonth('2025-03');
  assert.equal(ctx.C_REP_MONTH, '2025-03');
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.cRepPeriod())), { from: '2025-03-01', to: '2025-03-31', month: '2025-03', word: 'March 2025' });
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.RPT)), { from: '2025-03-01', to: '2025-03-31', years: [] }, 'the download is that month');
  years = [2026];
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.cRepPeriod())), { years: [2026], word: '2026' }, 'its year no longer chosen: the whole year again');
  assert.equal(ctx.C_REP_MONTH, '');
  const html = ctx.cRepMonthHtml();
  assert.match(html, /^<label class="c-jf rp-month"><select aria-label="Month" onchange="cRepPickMonth\(this\.value\)"><option value="" selected>Whole year<\/option><optgroup label="2026"><option value="2026-10">October 2026<\/option>/);
  years = [2025, 2026];
  assert.match(ctx.cRepMonthHtml(), /<option value="" selected>Whole years<\/option>/);
  // it sits on Reports only, beside the download; nothing else in the app picks a month
  assert.match(fnBody('function cRepHtml('), /<div class="act">\$\{cRepMonthHtml\(\)\}<button class="btn" onclick="openExport\(\)">/);
  assert.equal((APP.match(/\$\{cRepMonthHtml\(\)\}/g) || []).length, 1, 'drawn in one place');
  assert.match(fnBody('function doExport('), /if \(RPT\.years && RPT\.years\.length\) qs\.set\('years', RPT\.years\.join\(','\)\);/);
});

test('an old link with a month still lands: ?y=2025&m=3 opens 2025 with March 2025 on Reports; the server reads it as that month', async (t) => {
  const ctx = corner('?y=2025&m=3');
  ctx.cScopeFromUrl();
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.C_SCOPE)), { years: [2025] });
  assert.equal(ctx.C_REP_MONTH, '2025-03');
  const two = corner('?y=2024,2026');
  two.cScopeFromUrl();
  assert.deepEqual(JSON.parse(JSON.stringify(two.C_SCOPE)), { years: [2024, 2026] });
  assert.equal(two.C_REP_MONTH, '');
  const r = scopeRanges(new URLSearchParams('y=2025&m=3'));
  assert.equal(r.length, 1);
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const get = async (u) => (await fetch(`http://127.0.0.1:${port}${u}`)).json();
  const riga = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Riga', year: 'numeric', month: '2-digit', day: '2-digit' });
  const all = (await get('/api/people')).rows;
  const ym = riga.format(new Date(all.find((p) => p.status !== 'Admitted').created_at)).slice(0, 7);
  const rows = (await get(`/api/people?y=${Number(ym.slice(0, 4))}&m=${Number(ym.slice(5))}`)).rows;
  assert.ok(rows.length > 0);
  for (const p of rows) assert.ok(riga.format(new Date(p.status === 'Admitted' && p.admitted_at ? p.admitted_at : p.created_at)).startsWith(ym), `${p.id} in ${ym}`);
});

test('the Help center keeps up (the owner, 06.10.2026): the Year filter and the month on Reports, never a Period with months', () => {
  const HELP = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'help.json'), 'utf8'));
  const home = HELP.faq.find((f) => f.q === 'Where do the Home numbers come from?');
  assert.match(home.a, /Year filter, top right/);
  assert.match(home.a, /any years together/);
  assert.match(home.a, /On Reports, the Whole year box shows one month/);
  assert.deepEqual(HELP.howto.slice(-2).map((h) => [h.do, h.where, h.href]), [
    ['Look at other years', 'The Year filter, top right: tick any years', '#/home'],
    ['See one month', 'Reports, the Whole year box', '#/reports']]);
  assert.doesNotMatch(JSON.stringify(HELP), /\bPeriod\b|counted for this year/, 'no Period, no "this year" only');
  // what the help names is on the screen
  assert.match(APP, /<span>Year<\/span><button type="button" class="c-jfb"/);
  assert.match(APP, /\$\{several \? 'Whole years' : 'Whole year'\}/);
});
