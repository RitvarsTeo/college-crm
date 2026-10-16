// "SIGNING YOU IN" (the owner, 16.10.2026: "Yes, add it"; one design across Intake, Client Hub and
// Talent Acquisition). On the way back from Google (?auth=google) Intake shows the dev kit's waiting
// card - kit part 1, signin-google-only.html, commits c3967b4 + 30822d1 + b4855d9 - in its own sign-in
// shell, until the first view is drawn. Its bar (the owner, 16.10.2026: "can we have a horizontally
// filled line? can you sync it with the actual timing of opening?") fills on Intake's three real
// events and never shows full before the view is drawn. An ?error= always wins over the card. The
// sign-in card is unchanged.
// The page's own boot code runs against a fake page here; the look is checked in a real browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fn = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const line = (start) => { const i = APP.indexOf(start); assert.ok(i >= 0, start); return APP.slice(i, APP.indexOf('\n', i) + 1); };
const block = (start, end) => { const i = APP.indexOf(start); assert.ok(i >= 0, start); return APP.slice(i, APP.indexOf(end, i) + end.length); };
const BOOT = block('(async () => {\n  // WHO ARE YOU', '\n})();');

// A fake page: the shell, the help button, and whatever the gate appends to <body>. The page's own
// boot block, startShell() and the kit's bar script run on it; /api/auth/me, /api/config and the
// first view (route) each answer only when the test says so - that is the wait being held.
const hold = () => { let open; const p = new Promise((resolve, reject) => { open = { resolve, reject }; }); return { p, ...open }; };
function page(search, me, { reduced = false, configFails = null } = {}) {
  const els = { ver: { innerHTML: '' } };
  const shell = { style: {} };
  const help = { style: {} };
  const html = () => (els.loginScreen ? els.loginScreen.innerHTML : '');
  // the bar and the view, as the kit's script sees them: one object per drawn card
  let barFor = null, bar = null, view = null;
  const seen = { shell: 0, seaStarts: 0, url: null, duringWait: null, duringRoute: null, creeps: 0, fadeMs: null, asked: [],
    atConfig: null, atRoute: null, atRemoval: null, viewDoneAtRemoval: null };
  const width = () => (bar && bar.fill.style.width ? parseFloat(bar.fill.style.width) : null);
  const document = {
    querySelector: (q) => {
      if (q === '.shell') return shell;
      if (q === '#helpBtn') return help;
      if (q === '#auth-pending') return html().includes('id="auth-pending"') ? {} : null;
      return els[q.replace(/^#/, '')] || null;
    },
    getElementById: (id) => {
      if (id === 'signinBar' && html().includes('id="signinBar"')) {
        if (barFor !== html()) {
          const drawn = html(); barFor = drawn;
          const fill = { style: {} };
          bar = { attrs: {}, fill, setAttribute(k, v) { this.attrs[k] = v; }, querySelector: (q) => (q === '.gate-bar-fill' ? fill : null),
            get isConnected() { return html() === drawn; } };
          view = { classes: new Set(), classList: { add: (c) => view.classes.add(c) } };
        }
        return bar;
      }
      if (id === 'login-view' && html().includes('id="login-view"')) return view;
      return null;
    },
    createElement: () => ({ id: '', innerHTML: '', remove() {
      seen.atRemoval = width(); seen.viewDoneAtRemoval = view ? view.classes.has('gate-done') : null; delete els[this.id]; } }),
    body: { appendChild: (el) => { els[el.id] = el; } },
    addEventListener: () => {},
  };
  const auth = hold(), config = hold(), first = hold();
  let creeps = [];
  const ctx = {
    document, location: { search, pathname: '/', hash: '' },
    history: { state: null, replaceState: (_s, _t, url) => { seen.url = url; } },
    URLSearchParams, Promise, String, Boolean, addEventListener: () => {},
    matchMedia: (q) => ({ matches: reduced && /prefers-reduced-motion: reduce/.test(q) }),
    setInterval: (f) => { creeps.push(f); seen.creeps += 1; return creeps.length; }, clearInterval: () => { creeps = []; },
    setTimeout: (f, ms) => { seen.fadeMs = ms; setImmediate(f); return 1; },
    AUTH: { on: false, user: null }, ACTOR: '', CFG: {}, UI: 'c', installCNav: () => {},
    LOGIN_SEA: () => { seen.seaStarts += 1; },
    loadAuth: async () => {
      seen.duringWait = html();
      await auth.p;
      ctx.AUTH = { on: me.on, user: me.user, google: true };
      return ctx.AUTH;
    },
    // the real startShell runs; what it calls is stubbed
    api: async (url) => {
      seen.asked.push(url); seen.shell += 1; seen.atConfig = width();
      await config.p;
      if (configFails === 401) { ctx.drawLogin('Your session has ended. Sign in again.'); throw new Error('signed out'); }
      if (configFails) throw new Error(configFails);
      return { version: 't', users: [{ name: 'Ieva', role: 'Admissions' }], admins: [] };
    },
    drawDatasetBadge: () => {}, setTheme: () => {}, localStorage: { getItem: () => null },
    cActorSide: (a) => a, drawActorPicker: () => {}, callPopStart: () => {},
    route: async () => { seen.atRoute = width(); seen.duringRoute = html(); await first.p; },
  };
  ctx.window = ctx;
  ctx.$ = (s) => document.querySelector(s);
  vm.runInNewContext([line('const esc = '), block('const GOOGLE_MARK = `', '</svg>`;'),
    fn('function readReturnFromGoogle('), block('const loginShell = ', '</div>`;'), fn('function drawLogin('),
    fn('function startLoginSea('), block('(function signinBar() {', '\n})();'), fn('function drawSigningIn('), fn('function clearSigningIn('),
    fn('async function startShell('),
    'this.boot = () => ' + BOOT.replace(/;$/, '')].join('\n'), ctx);
  const done = ctx.boot();
  done.catch(() => {});
  const tick = (n) => { for (let k = 0; k < n; k += 1) creeps.forEach((f) => f()); };
  return { els, seen, shell, auth, config, first, done, width, tick, bar: () => bar, view: () => view, creeping: () => creeps.length,
    answer: () => auth.resolve(), finish: () => { auth.resolve(); config.resolve(); first.resolve(); }, screen: html };
}
const settle = () => new Promise((r) => setImmediate(r));
const ME = { on: true, user: { name: 'Ieva', role: 'Admissions' } };

test('?auth=google shows the kit\'s waiting card with the kit\'s words and the bar, in the sign-in shell', async () => {
  const p = page('?auth=google', ME);
  await settle();
  const html = p.seen.duringWait;
  assert.match(html, /<div class="gate-card sso-only gate-loading" id="auth-pending" aria-live="polite">/);
  assert.match(html, /<div class="gate-wait"><div class="gate-bar" id="signinBar" role="progressbar" aria-label="Signing in" aria-valuemin="0" aria-valuemax="100" aria-valuenow="10" aria-valuetext="Opening"><span class="gate-bar-fill"><\/span><\/div><\/div>/, 'the bar, where the spinner was');
  assert.doesNotMatch(html, /gate-spin/, 'no spinner');
  assert.match(html, /<h1 id="pendingTitle">Signing you in<\/h1>/);
  assert.match(html, /<p class="sub" id="pendingSub">One moment - checking your Novikontas account\.<\/p>/);
  assert.match(html, /<div id="login-view">[\s\S]*id="login-sea"[\s\S]*class="sea-scrim"[\s\S]*NoAca_logo_whitehor\.svg/, 'the same sea, scrim and logo as the sign-in card');
  assert.doesNotMatch(html, /Continue with Google|loginErr/, 'the sign-in card is not under it');
  assert.equal(p.seen.seaStarts, 1, 'the sea moves behind it');
  assert.equal(p.seen.url, '/', 'and ?auth=google is gone from the address bar');
  assert.equal(p.width(), 10, 'the bar starts at 10');
  p.finish(); await p.done;
});

test('THE BAR follows Intake\'s three real events: /api/auth/me 40, /api/config 70, first view drawn 100', async () => {
  const p = page('?auth=google', ME);
  await settle();
  p.tick(3000);
  assert.ok(p.width() > 10 && p.width() <= 36, `while /api/auth/me is out it creeps but stops short of 40 (${p.width()})`);
  assert.equal(p.seen.shell, 0, 'nothing else has been asked yet');
  p.auth.resolve(); await settle();
  assert.deepEqual(p.seen.asked, ['/api/config'], 'then the settings');
  assert.equal(p.seen.atConfig, 40, 'step 1: account checked, before the settings are asked');
  assert.equal(p.bar().attrs['aria-valuenow'], '40');
  p.tick(3000);
  assert.ok(p.width() > 40 && p.width() <= 66, 'while /api/config is out it stops short of 70');
  p.config.resolve(); await settle();
  assert.equal(p.seen.atRoute, 70, 'step 2: settings loaded, before the first view is drawn');
  assert.equal(p.bar().attrs['aria-valuenow'], '70');
  assert.match(p.seen.duringRoute, /Signing you in/, 'the card stays while the first view is drawn under it');
  p.tick(5000);
  assert.ok(p.width() < 100 && p.width() <= 96, `never full before the view is drawn (${p.width()})`);
  assert.ok(!p.view().classes.has('gate-done'), 'and not fading');
  p.first.resolve(); await p.done;
  assert.equal(p.seen.atRemoval, 100, 'step 3: full once the first view is drawn');
  assert.equal(p.bar().attrs['aria-valuetext'], 'Ready');
  assert.equal(p.seen.viewDoneAtRemoval, true, 'it faded before it was taken down');
  assert.equal(p.seen.fadeMs, 400, 'the fill ends, then the fade');
  assert.equal(p.els.loginScreen, undefined, 'the whole gate is taken down');
  assert.equal(p.seen.shell, 1, 'the app started once, as without the wait');
  assert.notEqual(p.shell.style.display, 'none', 'the shell was never hidden');
  assert.equal(p.creeping(), 0, 'no creep left running');
});

test('reduced motion: no creep and no fade - only the steps', async () => {
  const p = page('?auth=google', ME, { reduced: true });
  await settle();
  assert.equal(p.seen.creeps, 0);
  p.finish(); await p.done;
  assert.equal(p.seen.creeps, 0, 'it never crept');
  assert.equal(p.seen.fadeMs, 0, 'and goes at once');
  assert.equal(p.seen.atRemoval, 100);
  assert.equal(p.els.loginScreen, undefined);
});

test('a settings request that fails takes the wait down without ever showing it full', async () => {
  const p = page('?auth=google', ME, { configFails: 'request failed' });
  await settle();
  p.finish();
  await assert.rejects(p.done, /request failed/);
  assert.equal(p.els.loginScreen, undefined, 'no card left on the page');
  assert.ok(p.seen.atRemoval < 100, `the bar was never full (${p.seen.atRemoval})`);
  assert.equal(p.seen.viewDoneAtRemoval, false);
});

test('a session refused on the way in (401) leaves the sign-in card, no bar', async () => {
  const p = page('?auth=google', ME, { configFails: 401 });
  await settle();
  p.finish();
  await assert.rejects(p.done, /signed out/);
  assert.match(p.screen(), /Your session has ended\. Sign in again\./);
  assert.match(p.screen(), /Continue with Google/);
  assert.doesNotMatch(p.screen(), /signinBar|Signing you in/);
  p.tick(1);
  assert.equal(p.creeping(), 0, 'the creep stopped by itself');
});

test('without ?auth=google there is no card and no bar; the steps do nothing', async () => {
  const p = page('', ME);
  p.finish(); await p.done;
  assert.equal(p.seen.duringWait, '');
  assert.equal(p.els.loginScreen, undefined);
  assert.equal(p.bar(), null);
  assert.equal(p.seen.shell, 1);
});

test('if the answer is "not signed in", the sign-in card replaces the wait', async () => {
  const p = page('?auth=google', { on: true, user: null });
  await settle();
  p.answer(); await p.done;
  assert.doesNotMatch(p.screen(), /auth-pending|Signing you in/);
  assert.match(p.screen(), /<h1>Intake<\/h1>[\s\S]*Continue with Google/);
  assert.equal(p.seen.shell, 0);
  p.tick(1);
  assert.equal(p.creeping(), 0, 'no bar left behind: the creep stopped by itself');
});

test('an ?error= always wins: no "Signing you in", the sign-in card with the refusal', async () => {
  for (const q of ['?error=not_authorised', '?auth=google&error=not_authorised']) {
    const p = page(q, { on: true, user: null });
    await settle();
    assert.equal(p.seen.duringWait, '', `${q}: nothing drawn before the answer`);
    p.answer(); await p.done;
    assert.doesNotMatch(p.screen(), /Signing you in|auth-pending/, q);
    assert.match(p.screen(), /That Google account cannot sign in to Intake\./, q);
  }
});

test('a first visit sees the sign-in card, never the wait', async () => {
  const p = page('', { on: true, user: null });
  await settle();
  assert.equal(p.seen.duringWait, '');
  p.answer(); await p.done;
  assert.doesNotMatch(p.screen(), /Signing you in/);
  assert.match(p.screen(), /Continue with Google/);
});

test('the sign-in card is unchanged: same shell, same card, same words', async () => {
  const p = page('', { on: true, user: null });
  p.answer(); await p.done;
  const html = p.screen().replace(/\s+/g, ' ');
  assert.match(html, /^<div id="login-view"> <canvas class="sea" id="login-sea" aria-hidden="true"><\/canvas> <div class="sea-scrim" aria-hidden="true"><\/div> <div class="gate-inner"> <div class="brand"><img src="\/assets\/NoAca_logo_whitehor\.svg" alt="Novikontas Academy"><\/div> <div class="gate-card sso-only">/);
  assert.match(html, /<h1>Intake<\/h1> <p class="sub">Sign in to continue<\/p> <a class="google-btn" href="\/api\/auth\/google\/start">/);
  assert.match(html, /<div id="loginErr" class="err hidden" role="alert"><\/div> <\/div> <\/div> <\/div>$/);
  // the card's own rules, as measured pixel for pixel against the kit
  assert.match(APP, /\.gate-card\.sso-only\{padding-top:22px\}/);
  assert.match(APP, /#login-view \.gate-card\.sso-only h1\{font-size:34px;line-height:36px;margin:0;text-align:center;letter-spacing:\.02em\}/);
  assert.match(APP, /#login-view \.gate-card\.sso-only \.sub\{text-align:center;margin:0 0 13\.55px\}/);
});

test('the waiting card\'s CSS is the kit\'s, and the old Spectral panel is gone (one, not two)', () => {
  assert.match(APP, /#auth-pending\.gate-loading\{text-align:center;display:flex;flex-direction:column;align-items:center\}/, 'centred');
  assert.match(APP, /#login-view #auth-pending h1\{font-size:20px;line-height:26px;font-weight:600;letter-spacing:0;margin:0 0 8px\}/, 'a light 20px status line, 8px above the sentence');
  assert.match(APP, /#auth-pending \.sub\{margin:0;text-align:center\}/);
  assert.match(APP, /#auth-pending \.gate-wait\{display:flex;justify-content:center;align-self:stretch;padding:0 0 16px\}/, 'the bar spans the card');
  assert.match(APP, /#auth-pending \.gate-bar\{display:block;width:100%;height:4px;margin:9px 0;border-radius:2px;\s*background:var\(--gate-line\);overflow:hidden\}/, '4px on a light track, in the spinner\'s 22px box');
  assert.match(APP, /#auth-pending \.gate-bar-fill\{display:block;width:10%;height:100%;border-radius:2px;\s*background:var\(--brand-navy\);transition:width \.2s ease-out\}/, 'the gate\'s navy');
  assert.match(APP, /#login-view\.gate-done\{opacity:0;pointer-events:none;transition:opacity \.22s ease \.18s\}/, 'fades once the first view is drawn');
  assert.match(APP, /@media\(prefers-reduced-motion:reduce\)\{\s*#auth-pending \.gate-bar-fill\{transition:none\}\s*#login-view\.gate-done\{transition:none\}\}/, 'reduced motion: steps only');
  assert.doesNotMatch(APP, /gate-spin|gatespin/, 'the spinner is gone, markup and CSS');
  assert.equal((APP.match(/#auth-pending\.gate-loading\{/g) || []).length, 1, 'one rule for the card');
  assert.doesNotMatch(APP, /#auth-pending#auth-pending|#auth-pending\.gate-loading::before|max-width:400px;padding:40px 34px 34px/, 'the old opaque Spectral panel is gone');
  assert.doesNotMatch(APP, /#auth-pending[^{]*\{[^}]*flex-start/, 'nothing in it is pushed to the left');
});

test('the sea stops painting once the gate is taken down', () => {
  assert.match(APP, /function loop\(now\) \{\n\s*if \(!cv\.isConnected\) return;/);
});
