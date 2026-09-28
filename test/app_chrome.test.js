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

test('the Academy logo is in the tab and the CRM installs as "Academy CRM" - all before sign-in', async (t) => {
  const s = await start();
  t.after(() => s.child.kill());
  const m = await fetch(s.base + '/manifest.webmanifest');
  assert.equal(m.status, 200, 'the manifest is open before sign-in, like the page');
  assert.match(m.headers.get('content-type'), /^application\/manifest\+json/);
  const man = await m.json();
  assert.equal(man.short_name, 'Academy CRM');
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

test('Settings is for everybody and holds the Help center; its admin rows are still for admins', () => {
  assert.match(APP, /const s = document\.querySelector\('#cnSettings'\); if \(s\) s\.style\.display = '';/);
  const i = APP.indexOf('async function viewSettingsC()');
  const settings = APP.slice(i, APP.indexOf('\n}\n', i));
  assert.match(settings, /\$\{item\('#\/help', 'Help center'/);
  const guard = settings.indexOf('if (isAdmin()) {');
  assert.ok(guard > 0 && settings.indexOf("'#/channels'") > guard && settings.indexOf("'#/feedback'") > guard, 'Channels and Feedback stay behind the admin check');
  assert.match(APP, /if \(page === 'help'\) return viewHelpC\(\);/);
  assert.match(APP, /help: 'settings'/, 'the Help center lights Settings in the menu');
});

test('the (c) Novikontas Academy line with the Help center link is in the menu', () => {
  assert.match(APP, /<div class="c-foot"><span>&copy; Novikontas Academy<\/span> <a href="#\/help">Help center<\/a><\/div>/);
});

test('the corner button is the feedback box, says so, and opens solid', () => {
  assert.match(APP, /<button class="helpbtn" id="helpBtn" onclick="fbToggle\(\)"[^>]*>FEEDBACK<\/button>/);
  assert.doesNotMatch(APP, />HELP<\/button>/, 'it is not called Help: Help is the Help center');
  assert.match(APP, /return `<h4>Feedback<\/h4>/);
  const panel = APP.match(/\.helppanel\{position:fixed[\s\S]*?\}/)[0];
  assert.match(panel, /background:var\(--menu\)/, 'an opaque ground, not the 5.5% dark overlay');
  assert.doesNotMatch(panel, /background:var\(--card\)/);
});
