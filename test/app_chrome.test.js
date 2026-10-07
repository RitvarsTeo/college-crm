// The standard app chrome, 28.09.2026, for every app of the owner's: the Academy logo in
// the browser tab and on the desktop, a light/dark switch with icons, a Help center in
// Settings, and the "(c) Novikontas Academy" line. College CRM proves it first.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');

function start() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], { env: { ...process.env,
      PORT: '0', CRM_DB: ':memory:', DATASET: 'empty', CRM_AUTH: '1', CRM_SESSION_SECRET: crypto.randomBytes(32).toString('hex'),
      CRM_INSECURE_COOKIE: '1', CRM_PUBLIC: '', DATABASE_URL: '', DATABASE_URL_UNPOOLED: '', CRM_DB_DATABASE_URL_UNPOOLED: '' },
      stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const look = (d) => { out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, base: `http://127.0.0.1:${m[1]}` }); };
    child.stdout.on('data', look); child.stderr.on('data', look);
    child.on('exit', () => reject(new Error(out)));
  });
}

test('the Academy logo is in the tab and it installs as "Intake" - all before sign-in', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  const m = await fetch(s.base + '/manifest.webmanifest');
  assert.equal(m.status, 200, 'the manifest is open before sign-in, like the page');
  assert.match(m.headers.get('content-type'), /^application\/manifest\+json/);
  const man = await m.json();
  // The installed window titles itself manifest.name + the page title. A manifest name that
  // disagrees with the product read back as "Novikontas Academy CRM - Novikontas Intake".
  assert.equal(man.short_name, 'Intake');
  assert.equal(man.name, 'Novikontas Intake');
  assert.ok(APP.includes('<title>Novikontas Intake</title>'), 'and the page agrees with it');
  assert.equal(man.display, 'standalone');
  assert.equal(man.start_url, '/'); assert.equal(man.scope, '/');
  assert.equal(man.theme_color, '#000000', 'the installed window bar is black');
  assert.ok(man.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable'));
  for (const src of [...man.icons.map((i) => i.src), '/assets/favicon.svg', '/assets/apple-touch-icon.png', '/favicon.ico']) {
    const r = await fetch(s.base + src);
    assert.equal(r.status, 200, `${src} is served`);
    assert.match(r.headers.get('content-type'), /^image\//, `${src} is an image`);
  }
  for (const bad of ['/assets/icon-1024.png', '/assets/../src/server.js', '/assets/%2e%2e/server.js', '/assets/favicon.svg.map']) {
    assert.equal((await fetch(s.base + bad)).status, 404, `${bad} is refused: the asset list is exact`);
  }
  assert.equal((await fetch(s.base + '/api/people')).status, 401, 'opening the icons opened nothing else');
});

test('the page names the icons, the manifest and the black window bar', () => {
  const head = APP.slice(0, APP.indexOf('</head>'));
  assert.match(head, /<link rel="icon" href="\/assets\/favicon\.svg" type="image\/svg\+xml">/);
  assert.match(head, /<link rel="apple-touch-icon" href="\/assets\/apple-touch-icon\.png">/);
  assert.match(head, /<link rel="manifest" href="\/manifest\.webmanifest">/);
  assert.match(head, /<meta name="theme-color" content="#000000">/, 'the window bar is black');
  assert.doesNotMatch(head, /theme-color" content="#0a2463"/, 'not navy any more');
});

test('the theme switch has Light, System and Dark, says which is on, and System follows the computer', () => {
  const a = APP.indexOf('const THEME_PREFS'); const b = APP.indexOf('function syncThemeSwitches(');
  const src = APP.slice(a, APP.indexOf('\n}', b) + 2);
  const attrs = {}; const store = {}; let osDark = false; const listeners = [];
  const radio = (t) => ({ t, a: {}, getAttribute(k) { return k === 'data-t' ? this.t : this.a[k]; }, setAttribute(k, v) { this.a[k] = v; } });
  const radios = ['light', 'system', 'dark'].map(radio);
  const group = { a: {}, setAttribute(k, v) { this.a[k] = v; }, querySelectorAll: () => radios };
  const ctx = { localStorage: { setItem: (k, v) => { store[k] = v; } },
    matchMedia: () => ({ get matches() { return osDark; }, addEventListener: (e, f) => listeners.push(f) }),
    document: { documentElement: { getAttribute: (k) => attrs[k], setAttribute: (k, v) => { attrs[k] = v; } },
      querySelectorAll: () => [group], querySelector: () => null } };
  vm.runInNewContext(src + '\nthis.api = { setTheme, themeSwitchHtml };', ctx);
  const html = ctx.api.themeSwitchHtml();
  assert.equal((html.match(/role="radio"/g) || []).length, 3, 'three positions');
  for (const w of ['Light', 'System', 'Dark']) assert.match(html, new RegExp(`<svg[^>]*>.*?</svg><span>${w}</span>`, 's'), `${w} has its icon`);
  assert.match(html, /data-t="light" aria-checked="true"/, 'Light is on by default');

  ctx.api.setTheme('dark');
  assert.equal(attrs['data-theme'], 'dark'); assert.equal(store.crmTheme, 'dark'); assert.equal(group.a['data-pref'], 'dark');
  assert.deepEqual(radios.map((r) => r.a['aria-checked']), ['false', 'false', 'true'], 'exactly one position is on');

  ctx.api.setTheme('system');
  assert.equal(store.crmTheme, 'system', 'the CHOICE is kept, not what it resolved to');
  assert.equal(attrs['data-theme'], 'light', 'System on a light computer is light');
  osDark = true; listeners.forEach((f) => f());
  assert.equal(attrs['data-theme'], 'dark', 'and turns dark when the computer does');
  ctx.api.setTheme('dark'); osDark = false; listeners.forEach((f) => f());
  assert.equal(attrs['data-theme'], 'dark', 'a chosen Dark ignores the computer');

  ctx.api.setTheme('purple');
  assert.equal(attrs['data-theme'], 'light', 'an unknown value falls back to Light');
  assert.match(APP, /\.theme-switch button\[aria-checked="true"\]\{color:var\(--ink\);font-weight:600\}/, 'on = bold full ink, not colour alone');
  assert.match(APP, /\.theme-switch\[data-pref="dark"\] \.ts-thumb\{transform:translateX\(200%\)\}/);
  assert.match(APP, /html\.ui-c #themeBlock\{display:none\}/, 'C shows the switch instead of the old select');
  assert.match(APP, /if \(!\['light', 'dark', 'system'\]\.includes\(saved\)\) saved = 'light';/, 'a saved System survives a reload');
});

// 06.10.2026, the owner: "whats the point of settings please tell me!?!! ... the light switch is already on the card
// and tell about problem is helps job. plus whtf is this layout mega horizontal cards for few words?"
test('no Settings page: #/settings opens the Help center, which holds the admin items, for admins only', () => {
  assert.ok(!APP.includes('function viewSettingsC('), 'the page is gone');
  assert.ok(!APP.includes('#cnSettings') && !APP.includes('href="#/settings"'), 'no link to it anywhere');
  assert.match(APP, /settings: 'help', channels: 'help', feedback: 'help',\s*help: 'help' \}\)\[page \|\| ''\]/, 'an old #/settings lands in the Help center');
  assert.match(APP, /if \(place === 'help'\) return viewHelpC\(\);/);
  const i = APP.indexOf('async function cHelpAdmin()');
  const admin = APP.slice(i, APP.indexOf('\n}\n', i));
  assert.match(admin, /if \(!box \|\| !isAdmin\(\)\) return;/, 'admins only');
  for (const h of ['#/channels', '#/feedback', '#/journey?v=list&amp;p_data=odd']) assert.ok(admin.indexOf(h) > admin.indexOf('isAdmin()'), h + ' behind the admin check');
  assert.match(admin, /class="c-helpadmin"/, 'a small group, not wide rows');
  assert.doesNotMatch(admin, /c-line|c-sheet c-set/, 'no mega horizontal cards');
  assert.match(APP, /<p class="c-crumb"><a href="#\/help">Help center<\/a><\/p><div class="c-head"><div><h1>Channels/, 'Channels sits under the Help center');
  assert.ok(!APP.includes('<a href="#/settings">Settings</a>'), 'no Settings crumb left');
});

// 05.10.2026 the owner: the (c) line leaves the menu card and becomes the foot of EVERY page; the Help center
// link stayed in the menu foot until Q53 made it a menu item; the phone's page foot keeps it
test('the (c) line is the foot of every page; the phone page foot keeps the Help center link', () => {
  assert.match(APP, /<div class="c-pagefoot">[^\n]*\n\s*<div class="c-foot"><a href="#\/help">Help center<\/a><\/div><\/div>/);
  assert.doesNotMatch(APP, /<span>&copy; Novikontas Academy<\/span>/, 'no (c) line in the menu card, light or dark, desktop or phone');
  assert.match(APP, /html\.ui-c #view::after\{content:"© Novikontas Academy";display:block;/, 'one shared page foot, drawn by #view itself');
  assert.doesNotMatch(APP, /class="c-help-foot"/, 'Help no longer carries its own, so it is not there twice');
});

test('the corner button is the feedback box, says so, and opens solid', () => {
  assert.match(APP, /<button class="helpbtn" id="helpBtn" onclick="fbToggle\(\)"[^>]*>FEEDBACK<\/button>/);
  assert.doesNotMatch(APP, />HELP<\/button>/, 'it is not called Help: Help is the Help center');
  assert.match(APP, /return `<h4>Feedback<\/h4>/);
  const panel = APP.match(/\.helppanel\{position:fixed[\s\S]*?\}/)[0];
  assert.match(panel, /background:var\(--menu\)/, 'an opaque ground, not the 5.5% dark overlay');
  assert.doesNotMatch(panel, /background:var\(--card\)/);
});

// 05.10.2026, Ritvars: "also the icons dont match?! I want the white on also on the broswers tab." The tab icon
// is the same white tile as the installed app, the taskbar and "Open in app" (icon-192.png) in light AND dark.
// This replaces the 30.09.2026 dark variant (dark tile, white letters), which made the tab and the app differ.
test('the tab icon is the white tile in light and dark, like the installed app', () => {
  const svg = fs.readFileSync(path.join(ROOT, 'src', 'assets', 'favicon.svg'), 'utf8');
  assert.match(svg, /\.tile \{ fill: #ffffff/, 'the white tile');
  assert.match(svg, /\.mark \{ fill: #011111 \}/, 'black letters');
  assert.doesNotMatch(svg, /prefers-color-scheme/, 'no dark variant: the tab never turns dark');
  assert.equal((svg.match(/#29a8df/gi) || []).length, 1, 'the Novikontas blue leg, declared once on the shape');
  assert.match(svg, /viewBox="155\.18 59\.40 589\.35 589\.35"/, 'the symbol geometry is unchanged');
});
