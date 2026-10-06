// Q45, THE YEAR SCOPE (MASTER CONTROL's GO for C, 05.10.2026; the owner: "always be sure, that we are checking the
// right year", "its a small detail on top right corner", of "Period · Whole year": "this is enough!"). ONE small
// labelled dropdown, frozen top-right; strict scope on every screen by ARRIVAL; the Admitted (and the Median) by
// their ADMISSION date (the owner's popup, 05.10.2026); the Inbox by the message's arrival; Reports has no period
// of its own any more; one server-side filter, so a count on arrival is the figure.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fnBody = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const riga = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Riga', year: 'numeric', month: '2-digit', day: '2-digit' });
const day = (iso) => (iso ? riga.format(new Date(iso)) : '');

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

test('the server: a year keeps who ARRIVED in it, the Admitted by their ADMISSION; no year = everyone', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const get = async (u) => (await fetch(`http://127.0.0.1:${port}${u}`)).json();
  const all = (await get('/api/people')).rows;
  assert.ok(all.length > 0);
  const years = (await get('/api/scope/years')).years;
  assert.ok(years.length >= 1, 'the dropdown has years to offer');
  assert.deepEqual(years, [...years].sort((a, b) => b - a), 'newest first');
  let checked = 0;
  for (const y of years) {
    const rows = (await get(`/api/people?y=${y}`)).rows;
    for (const p of rows) {
      if (p.status === 'Admitted' && p.admitted_at) assert.ok(day(p.admitted_at).startsWith(String(y)), `${p.id} admitted in ${y}`);
      else assert.ok(day(p.created_at).startsWith(String(y)), `${p.id} arrived in ${y}`);
    }
    // nobody who belongs is missing
    const want = all.filter((p) => (p.status === 'Admitted' && p.admitted_at ? day(p.admitted_at) : day(p.created_at)).startsWith(String(y)));
    assert.equal(rows.length, want.length, `${y}: every person who belongs, nobody else`);
    checked += rows.length;
  }
  assert.ok(checked > 0);
  // a month inside a year
  const y0 = years[0];
  const m = Number(day(all.find((p) => day(p.created_at).startsWith(String(y0)) && p.status !== 'Admitted').created_at).slice(5, 7));
  const mm = String(m).padStart(2, '0');
  for (const p of (await get(`/api/people?y=${y0}&m=${m}`)).rows) {
    const d = p.status === 'Admitted' && p.admitted_at ? day(p.admitted_at) : day(p.created_at);
    assert.ok(d.startsWith(`${y0}-${mm}`), `${p.id} in ${y0}-${mm}`);
  }
  // Today, the tasks and the summary count only people who arrived in the year
  const ids = new Set((await get(`/api/people?y=${y0}`)).rows.map((p) => p.id));
  for (const tk of await get(`/api/tasks?scope=open&y=${y0}`)) assert.ok(ids.has(tk.person_id), 'a task of somebody in the year');
  const sum = await get(`/api/summary?y=${y0}`);
  assert.ok(sum.noNextAction <= (await get('/api/summary')).noNextAction);
  // a year with nobody: everything empty, nothing borrowed from another year
  assert.equal((await get('/api/people?y=2001')).rows.length, 0);
  assert.equal((await get('/api/tasks?scope=open&y=2001')).length, 0);
  assert.equal((await get('/api/intake?y=2001')).rows.length, 0, 'the Inbox by the message\'s own arrival');
});

// The control itself is Q59's now (a set of whole years, no months): test/year_scope_q59.test.js.

test('the look: frozen top-right on a wide screen, a row of its own in the phone top bar; the heads leave it room; no amber, no bar', () => {
  assert.match(APP, /html\.ui-c \.c-scope\{position:fixed;top:14px;right:20px;z-index:30\}/);
  assert.match(APP, /html\.ui-c \.c-scope \.c-jf\.past\{background:#0a2463;border-color:#0a2463\}/);
  assert.match(APP, /@media \(min-width:901px\)\{ html\.ui-c #view \.c-head, html\.ui-c #view \.khead\{padding-right:var\(--scope-w,0px\)\} \}/);
  assert.match(APP, /html\.ui-c \.shell > nav > \.c-scope\{position:static;order:3;flex:1 0 100%;/);
  const css = APP.slice(APP.indexOf('/* Q45, Q59: the Year filter'), APP.indexOf(':root{--scope-w:0px}')).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /#F7C04F|#fff8e6|#E0A526/i, 'no amber, no cream');
});

test('Home, the Journey band and Reports read the years; Reports has no period bar; the download follows it', () => {
  const home = fnBody('async function cHomeData() {');
  assert.match(home, /api\('\/api\/report\?' \+ cScopeReportQs\(\)\)/);
  assert.match(home, /const admitted = people\.filter\(\(p\) => p\.status === 'Admitted' && p\.admitted_at\);/, 'the Admitted of the period, by admission');
  assert.match(fnBody('async function viewJourneyC() {'), /api\('\/api\/report\?' \+ cScopeReportQs\(\)\)/);
  assert.match(fnBody('function cRepPeriod() {'), /RPT = \{ from: '', to: '', years: \[\.\.\.l\] \};/);
  assert.doesNotMatch(fnBody('function cRepHtml('), /c-periodbar|type="date"/);
  // a change redraws the page and the NEW badges under the new years
  const set = fnBody('function cSetScope(years) {');
  assert.match(set, /route\(\);\s*cNavCounts\(\);/);
});
