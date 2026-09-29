// Unified audit 29.09.2026 item 1 (dev kit part 3): the Help center carries the tour and the
// questions and answers - search, the most opened first counted on the server (help_faq_opens: a
// count per question id and nothing about who), heading "Questions and answers", and "Ask a
// question" opening the same feedback box on A question.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb, pgSchemaSql, toPg } from '../src/db.js';
import { helpOpened, helpCounts, HELP_ID, BadScreenshot } from '../src/feedback.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const SERVER = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
const SCHEMA = fs.readFileSync(path.join(ROOT, 'src', 'db.js'), 'utf8');   // the schema, as written
const HELP = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'help.json'), 'utf8'));

test('the help file: valid unique ids, plain-text answers, tour steps that name real things on screen', () => {
  const ids = HELP.faq.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  for (const f of HELP.faq) {
    assert.match(f.id, HELP_ID, f.id);
    assert.ok(f.q && f.a, f.id);
    assert.doesNotMatch(f.q + f.a, /[<>]/, 'plain text only: ' + f.id);
  }
  for (const s of HELP.tour) {
    assert.ok(s.title && s.body && s.target, s.title);
    if (s.target === '@theme-switch') continue;
    const hook = { '.cnav': 'class="cnav"', '.cnav a[data-c="next"]': 'data-c="next"', '.cnav a[data-c="journey"]': 'data-c="journey"', '#helpBtn': 'id="helpBtn"' }[s.target];
    assert.ok(hook, 'a known target: ' + s.target);
    assert.ok(APP.includes(hook), 'the target exists in the page: ' + s.target);
  }
});

test('counting: a count per question and nothing else; concurrent-safe upsert; a bad id refused', async () => {
  const db = await openDb();
  await helpOpened(db, 'install-as-app', '2026-09-29T09:00:00.000Z');
  await helpOpened(db, 'install-as-app', '2026-09-29T09:01:00.000Z');
  await helpOpened(db, 'time-zone', '2026-09-29T09:02:00.000Z');
  assert.deepEqual(await helpCounts(db), { 'install-as-app': 2, 'time-zone': 1 });
  await assert.rejects(helpOpened(db, '<script>', 'x'), BadScreenshot);
  await assert.rejects(helpOpened(db, 'Upper-Case', 'x'), BadScreenshot);
  const cols = (await db.prepare("SELECT name FROM pragma_table_info('help_faq_opens')").all()).map((c) => c.name);
  assert.deepEqual(cols, ['faq_id', 'opens', 'last_at'], 'no column that could say who opened it');
});

test('the table: created only if missing (safe to run on every boot), and its Postgres form', async () => {
  assert.match(SCHEMA, /CREATE TABLE IF NOT EXISTS help_faq_opens \(\s*faq_id TEXT PRIMARY KEY,[^;]*opens INTEGER NOT NULL DEFAULT 0,\s*last_at TEXT\s*\);/);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'crm-help-')), 'twice.db');
  try {
    const a = await openDb(file); await helpOpened(a, 'time-zone', 'x');
    const b = await openDb(file);   // the same schema run again on the same database
    assert.deepEqual(await helpCounts(b), { 'time-zone': 1 }, 'the second boot kept what was there');
    for (const d of [a, b]) if (d.close) await d.close();
  } finally { try { fs.rmSync(path.dirname(file), { recursive: true, force: true }); } catch { /* Windows may still hold the file; it is in the temp folder */ } }
  const pg = pgSchemaSql();
  assert.match(pg, /CREATE TABLE IF NOT EXISTS help_faq_opens \(\s*faq_id TEXT COLLATE "C" PRIMARY KEY,/);
  const upsert = toPg("INSERT INTO help_faq_opens (faq_id, opens, last_at) VALUES (?, 1, ?)\n    ON CONFLICT (faq_id) DO UPDATE SET opens = help_faq_opens.opens + 1, last_at = excluded.last_at");
  assert.match(upsert, /VALUES \(\$1, 1, \$2\)\s+ON CONFLICT \(faq_id\) DO UPDATE SET opens = help_faq_opens\.opens \+ 1, last_at = excluded\.last_at/);
});

test('the routes sit behind the sign-in door, and the config carries the help file', () => {
  const door = SERVER.indexOf("if (AUTH_ON && p.startsWith('/api/') && !openBeforeSignIn(p)");
  assert.ok(door > 0);
  for (const r of ["p === '/api/help/opened'", "p === '/api/help/counts'"]) {
    assert.ok(SERVER.indexOf(r) > door, r + ' comes after the door');
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8').match(/function openBeforeSignIn[\s\S]*?\n}\n/)[0], /api\/help/, 'not opened before sign-in');
  }
  assert.match(SERVER, /help: \{ tour: HELP\.tour, faq: HELP\.faq \}/);
  for (const f of ['help-tour.js', 'help-center.js', 'help-center.css']) {
    assert.match(SERVER, new RegExp(`'${f.replace('.', '\\.')}': 'text/`), f + ' is served');
    assert.ok(fs.existsSync(path.join(ROOT, 'src', 'assets', f)), f);
    assert.ok(APP.includes(`/assets/${f}`), f + ' is loaded');
  }
});

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], {
      env: { ...process.env, PORT: '0', CRM_DB: ':memory:' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.stdout.on('data', (d) => { const m = String(d).match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, port: Number(m[1]) }); });
    child.on('exit', (code) => reject(new Error(`server exited (${code}): ${err}`)));
    setTimeout(() => reject(new Error('server did not start: ' + err)), 8000);
  });
}

test('the routes: open counts one, counts come back, a bad id is 400', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;
  const open = (id) => fetch(`${base}/api/help/opened`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) });
  assert.equal((await open('home-numbers')).status, 200);
  assert.equal((await open('home-numbers')).status, 200);
  assert.equal((await open('../etc')).status, 400);
  assert.deepEqual((await (await fetch(`${base}/api/help/counts`)).json()).counts, { 'home-numbers': 2 });
  const cfg = await (await fetch(`${base}/api/config`)).json();
  assert.deepEqual(cfg.help.faq.map((f) => f.id), HELP.faq.map((f) => f.id));
});

test('the Help center screen: tour button, heading exactly "Questions and answers", ask opens A question', () => {
  const view = APP.slice(APP.indexOf('function viewHelpC() {'), APP.indexOf('function cStartTour('));
  assert.match(view, /<h2 class="c-set-h">Questions and answers<\/h2>/);
  assert.doesNotMatch(APP, /asked most|ask most|most asked/i, 'never claims what people ask most');
  assert.match(view, /onclick="cStartTour\(this\)">Take the tour<\/button>/);
  assert.match(view, /HelpCenter\.mount\(document\.getElementById\('helpFaq'\), \{\s*faq: \(CFG\.help && CFG\.help\.faq\) \|\| \[\], onAsk: \(text\) => fbOpen\('QUESTION', text\) \}\)/);
  assert.match(view, /onclick="fbOpen\('BUG'\)">Report a problem<\/button>/);
});

test('the tour rings the switch where it is on screen: the menu on a wide screen, the page bottom on a narrow one', () => {
  const src = APP.slice(APP.indexOf('function cStartTour('), APP.indexOf('\n}\n', APP.indexOf('function cStartTour(')) + 2);
  let made = null;
  const run = (narrow) => {
    const ctx = { CFG: { help: HELP }, window: { HelpTour: {}, matchMedia: () => ({ matches: narrow }) } };
    ctx.window.HelpTour.create = (o) => { made = o; return { open() {} }; };
    ctx.HelpTour = ctx.window.HelpTour;
    vm.runInNewContext(src + '\ncStartTour(null);', ctx);
    return made.steps.find((s) => s.title.startsWith('Light')).target;
  };
  assert.equal(run(false), '#cThemeBar .theme-switch');
  assert.equal(run(true), '#cThemeBar2 .theme-switch');
});
