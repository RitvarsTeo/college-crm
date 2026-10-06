// Unified audit 29.09.2026 item 1 (dev kit part 3): the Help center carries the tour and the
// questions and answers - search, the questions in the order of config/help.json (opens are still
// counted on the server, help_faq_opens: a count per question id and nothing about who, but the
// screen never reads them), heading "Questions and answers", and "Ask a question" opening the same
// feedback box on A question.
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
    // Derived from the selector, not a hand-kept list. The list had to be edited every
    // time the menu changed, and a tour step pointing at a menu item that no longer
    // exists is exactly what this test is for - it should not also be the thing that
    // makes the test fail to compile its own expectation.
    const m = /^\.cnav a\[data-c="([a-z-]+)"\]$/.exec(s.target);
    const hook = m ? `data-c="${m[1]}"`
      : { '.cnav': 'class="cnav"', '#helpBtn': 'id="helpBtn"' }[s.target];
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
  assert.match(SERVER, /help: \{ map: HELP\.map, flow: HELP\.flow, howto: HELP\.howto, tour: HELP\.tour, faq: HELP\.faq \}/, 'Q54: the map and how-to travel with it');
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

// THE HELP CENTER IS NOT A POPULARITY SYSTEM (the owner, 01.10.2026, dev kit part 3 README): the
// questions show in the order of config/help.json, whatever other people opened. The fake page
// answers every fetch with counts that would put the LAST question first, so any ordering by opens
// shows up as a changed order, and any read of the counts shows up as a call.
test('the Help center shows the questions in the order of help.json, never by most opened', async () => {
  const faq = HELP.faq;
  const last = faq[faq.length - 1].id;
  const calls = [];
  const fakeFetch = (url) => { calls.push(url);
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ counts: { [last]: 999, [faq[1].id]: 50 } }) }); };
  const list = { innerHTML: '' };
  let onInput = null;
  const input = { value: '', addEventListener: (e, fn) => { if (e === 'input') onInput = fn; } };
  const el = { innerHTML: '', addEventListener() {},
    querySelector: (s) => (s === '.hc-list' ? list : s === 'input' ? input : { addEventListener() {} }) };
  const ctx = { fetch: fakeFetch };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'src', 'assets', 'help-center.js'), 'utf8'), ctx);
  ctx.HelpCenter.mount(el, { faq, fetch: fakeFetch });
  await new Promise((r) => setTimeout(r, 20));
  const ids = () => [...list.innerHTML.matchAll(/data-id="([a-z0-9-]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids(), faq.map((f) => f.id), 'the order of config/help.json');
  assert.deepEqual(calls, [], 'mounting reads no counts and asks the server nothing');
  input.value = ''; onInput();
  assert.deepEqual(ids(), faq.map((f) => f.id), 'a cleared search keeps the same order');
  const src = fs.readFileSync(path.join(ROOT, 'src', 'assets', 'help-center.js'), 'utf8');
  assert.ok(!/help\/counts|countsUrl|\.sort\(/.test(src), 'the Help center never fetches counts and never sorts');
  assert.doesNotMatch(APP, /help\/counts/, 'the app page never asks for the counts');
  assert.doesNotMatch(SERVER, /most opened come first/, 'the server no longer says the most opened come first');
  // the opens are still recorded per id, and the counts route stays (a separate decision)
  assert.ok(SERVER.includes("p === '/api/help/opened'") && SERVER.includes("p === '/api/help/counts'"));
});

// Q54 (the owner, 05.10.2026): "Also put in the help center the navigation of the app. Have a like a helper, how to
// where to, for what. Update it in other words".
test('Q54 the map lists exactly the menu places, in menu order, each a link to its route', () => {
  const nav = APP.slice(APP.indexOf('<div class="cnav"'), APP.indexOf('</div>`);', APP.indexOf('<div class="cnav"')));
  const menu = [...nav.matchAll(/<a href="(#\/[a-z]+)"[^>]*>(?:\$\{C_ICON\.[a-z]+\})?<span>([A-Za-z ]+)<\/span>/g)]
    .map((m) => [m[2], m[1]]).filter(([name]) => name !== 'Admissions');   // Admissions is the group, its three are the cards
  assert.deepEqual(HELP.map.map((m) => [m.name, m.href]), menu.map(([n, h]) => [n, h === '#/admissions' ? '#/leads' : h]));
  assert.deepEqual(HELP.map.map((m) => m.name), ['Home', 'Inbox', 'Today', 'Journey', 'Reports', 'Settings', 'Help center']);
  assert.deepEqual(HELP.map.filter((m) => m.group === 'Admissions').map((m) => m.name), ['Inbox', 'Today', 'Journey']);
  for (const m of HELP.map) {
    assert.ok(m.for && m.for.split(/\s+/).length <= 8, 'one short line, at most 8 words: ' + m.name);
    assert.ok(APP.includes(`  ${m.icon}: '<svg`), 'a real icon: ' + m.icon);
  }
  const view = APP.slice(APP.indexOf('function cHelpMap() {'), APP.indexOf('function cStartTour('));
  assert.match(view, /<a class="c-hmap-c" href="\$\{esc\(m\.href\)\}">/, 'every card is a click to its place');
  assert.match(view, /: cHelpMap\(\)\}/, 'the map is on the Help center page (Q56: unless ?helpflow=1)');
});

test('Q54 how to: short task links, each opens a real place', () => {
  const places = ['#/home', '#/leads', '#/today', '#/journey', '#/reports', '#/settings'];
  assert.deepEqual(HELP.howto.map((h) => h.do), ['Find a person', 'Add a lead', "Act on today's work", 'Move someone back a stage',
    'See who came from a channel', 'See a Home number in depth']);
  for (const h of HELP.howto) assert.ok(places.includes(h.href) && h.where, h.do);
  assert.ok(APP.includes('placeholder="Search name, email or phone"') && APP.includes('>Add lead</button>') && APP.includes("'Came from'"),
    'what the how-to names exists on screen');
  assert.doesNotMatch(JSON.stringify(HELP.howto), /year switch|year picker/i, 'nothing about features not built');
});

test('Q54 no tour or answer names a menu place that no longer exists', () => {
  const text = JSON.stringify({ tour: HELP.tour, faq: HELP.faq, map: HELP.map, howto: HELP.howto });
  for (const gone of ['Next steps', 'All people', 'Outcomes', 'New Leads', /\bPeople\b/]) {
    assert.doesNotMatch(text, gone instanceof RegExp ? gone : new RegExp(gone), 'still named: ' + gone);
  }
  const view = APP.slice(APP.indexOf('function viewHelpC() {'), APP.indexOf('function cStartTour('));
  assert.doesNotMatch(view, /<b>Outcomes<\/b>|<b>People<\/b>|href="#\/outcomes"/);
});

// Q56 (the owner, 06.10.2026, on the Q54 card grid: "whats the point of just showing replicated cards on help
// center???"). Behind ?helpflow=1: ONE flow of how a person moves through Intake, every stop a click to its place.
const PROTO = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
const fnSrc = (name) => {
  const at = APP.indexOf(`function ${name}(`);
  if (at >= 0) return APP.slice(at, APP.indexOf('\n}\n', at) + 3);
  const c = APP.indexOf(`const ${name} = `);
  return APP.slice(c, APP.indexOf('\n', c) + 1);
};
const helpCtx = (search) => {
  const view = { innerHTML: '' };
  const ctx = { CFG: { help: HELP, stages: PROTO.stages, stageRoles: PROTO.stageRoles }, C_TERMINAL: ['Admitted', 'Not proceeding'],
    C_ICON: new Proxy({}, { get: (t, k) => `<svg data-i="${String(k)}"></svg>` }), location: { search }, URLSearchParams,
    $: () => view, view, window: {}, scenes: 0 };
  ctx.cScenes = () => { ctx.scenes += 1; };
  vm.runInNewContext(['esc', 'cHelpFlowOn', 'cHelpMap', 'cHelpFlow', 'cHelpHowTo', 'viewHelpC'].map(fnSrc).join('\n')
    .replace(/^const (esc|cHelpFlowOn) = /gm, 'var $1 = '), ctx);
  return ctx;
};

test('Q56 the flow: six stops in order, each a link to the right route, stages and ends a click to their column', () => {
  assert.deepEqual(HELP.flow.map((m) => [m.name, m.href]), [['Inbox', '#/leads'], ['New lead', '#/journey'], ['Today', '#/today'],
    ['Journey', '#/journey'], ['The end', '#/journey'], ['Reports', '#/reports']]);
  for (const m of HELP.flow) {
    assert.ok(m.name.split(/\s+/).length <= 4, 'a short label: ' + m.name);
    assert.ok(!m.for || m.for.split(/\s+/).length <= 6, 'at most one short line: ' + m.name);
    assert.ok(APP.includes(`  ${m.icon}: '<svg`), 'a real icon: ' + m.icon);
  }
  const html = helpCtx('?helpflow=1').cHelpFlow();
  const steps = [...html.matchAll(/<li class="hf-step[^"]*"[^>]*data-step="(\d)">\s*<a class="hf-node" href="([^"]+)"[^>]*>.*?<b>([^<]+)<\/b>/gs)]
    .map((m) => [Number(m[1]), m[2], m[3]]);
  assert.deepEqual(steps, HELP.flow.map((m, i) => [i + 1, m.href, m.name]), 'drawn in order, each a click to its place');
  const chips = [...html.matchAll(/<a class="hf-chip[^"]*" href="#\/journey" data-stage="([^"]+)"\s+onclick="cHelpGo\(this\.dataset\.stage\);return false">/g)].map((m) => m[1]);
  assert.deepEqual(chips, ['New', 'Contacted', 'Follow-up', 'Application', 'Contract', 'Admitted', 'Not proceeding'], 'the stages, then the two ends');
  const journey = html.slice(html.indexOf('data-step="4"'), html.indexOf('data-step="5"'));
  assert.doesNotMatch(journey, /data-stage="(Admitted|Not proceeding)"/, 'the ends are their own stop');
  assert.match(html, /data-step="2">\s*<a class="hf-node" href="#\/journey" onclick="cGoPeople\(\{\}\);return false">/, 'New lead opens everyone');
  assert.doesNotMatch(html, /<p[ >]/, 'no paragraphs');
  // a stage click lands on the Journey, on that column; an end also sets the outcome it shows
  const go = vm.runInNewContext(fnSrc('cHelpGo') + `; const seen = []; cGoStage = (id) => seen.push(id); cHelpGo('Contract'); cHelpGo('Admitted'); ({ seen, C_OUTCOME })`,
    { C_PF: { stage: 'x' }, C_PF_EMPTY: () => ({}), C_PQ: 'q', C_PCOHORT: {}, C_TERMINAL: ['Admitted', 'Not proceeding'], C_OUTCOME: null, cGoStage: null });
  assert.deepEqual([...go.seen], ['Contract', 'Admitted']);
  assert.equal(go.C_OUTCOME, 'Admitted');
  assert.match(APP, /function cGoStage\(id\) \{[\s\S]*?C_JP\.col = id;[\s\S]*?location\.hash = '#\/journey'/, 'cGoStage opens that column');
});

test('Q56 with ?helpflow=1 the old card grid is not drawn; without it the page is unchanged', () => {
  const on = helpCtx('?helpflow=1'); on.viewHelpC();
  assert.match(on.view.innerHTML, /class="kflow jband c-hflow m-scene"/);
  assert.doesNotMatch(on.view.innerHTML, /c-hmap|Where things are/, 'no card grid');
  assert.match(on.view.innerHTML, /<h2 class="c-set-h">How to<\/h2>/, 'the how-to links stay');
  assert.ok(on.view.innerHTML.indexOf('c-hflow') < on.view.innerHTML.indexOf('>How to<'), 'below the flow');
  assert.equal(on.scenes, 1, 'the flow plays its one entrance');
  const off = helpCtx(''); off.viewHelpC();
  assert.match(off.view.innerHTML, /Where things are<\/h2><div class="c-hmap">/);
  assert.doesNotMatch(off.view.innerHTML, /c-hflow/);
  assert.match(off.view.innerHTML, /<h2 class="c-set-h">How to<\/h2>/);
  // phone: the same line stands up
  assert.match(APP, /@media \(max-width:760px\)\{\s*html\.ui-c \.hf-row\{grid-template-columns:1fr/);
});
