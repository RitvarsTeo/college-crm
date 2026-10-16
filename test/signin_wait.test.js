// "SIGNING YOU IN" (the owner, 16.10.2026: "Yes, add it"; one design across Intake, Client Hub and
// Talent Acquisition). On the way back from Google (?auth=google) Intake shows the dev kit's waiting
// card - kit part 1, signin-google-only.html, commits c3967b4 + 30822d1 - in its own sign-in shell,
// until /api/auth/me has answered. An ?error= always wins over it. The sign-in card is unchanged.
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

// A fake page: the shell, the help button, and whatever the gate appends to <body>.
function page(search, me) {
  const els = {};
  const shell = { style: {} };
  const help = { style: {} };
  const document = {
    querySelector: (q) => (q === '.shell' ? shell : q === '#helpBtn' ? help : els[q.replace(/^#/, '')] || null),
    createElement: () => ({ id: '', innerHTML: '', remove() { delete els[this.id]; } }),
    body: { appendChild: (el) => { els[el.id] = el; } },
    addEventListener: () => {},
  };
  let answer;
  const asked = new Promise((resolve) => { answer = resolve; });
  const seen = { shell: 0, seaStarts: 0, url: null, duringWait: null };
  const ctx = {
    document, location: { search, pathname: '/', hash: '' },
    history: { state: null, replaceState: (_s, _t, url) => { seen.url = url; } },
    URLSearchParams, window: { addEventListener: () => {} },
    AUTH: { on: false, user: null }, UI: 'c', installCNav: () => {}, route: () => {},
    LOGIN_SEA: () => { seen.seaStarts += 1; },
    // /api/auth/me, answered only when the test says so - that is the wait being held
    loadAuth: async () => {
      seen.duringWait = els.loginScreen ? els.loginScreen.innerHTML : '';
      await asked;
      ctx.AUTH = { on: me.on, user: me.user, google: true };
      return ctx.AUTH;
    },
    startShell: async () => { seen.shell += 1; },
  };
  ctx.$ = (s) => document.querySelector(s);
  vm.runInNewContext([line('const esc = '), block('const GOOGLE_MARK = `', '</svg>`;'),
    fn('function readReturnFromGoogle('), block('const loginShell = ', '</div>`;'), fn('function drawLogin('),
    fn('function startLoginSea('), fn('function drawSigningIn('), fn('function clearSigningIn('),
    'this.boot = () => ' + BOOT.replace(/;$/, '')].join('\n'), ctx);
  const done = ctx.boot();
  return { els, seen, shell, answer, done, screen: () => (els.loginScreen ? els.loginScreen.innerHTML : '') };
}
const settle = () => new Promise((r) => setImmediate(r));

test('?auth=google shows the kit\'s waiting card with the kit\'s words, in the sign-in shell', async () => {
  const p = page('?auth=google', { on: true, user: { name: 'Ieva', role: 'Admissions' } });
  await settle();
  const html = p.seen.duringWait;
  assert.match(html, /<div class="gate-card sso-only gate-loading" id="auth-pending" aria-live="polite">/);
  assert.match(html, /<div class="gate-wait"><span class="gate-spin" aria-hidden="true"><\/span><\/div>/, 'the spinner');
  assert.match(html, /<h1 id="pendingTitle">Signing you in<\/h1>/);
  assert.match(html, /<p class="sub" id="pendingSub">One moment - checking your Novikontas account\.<\/p>/);
  assert.match(html, /<div id="login-view">[\s\S]*id="login-sea"[\s\S]*class="sea-scrim"[\s\S]*NoAca_logo_whitehor\.svg/, 'the same sea, scrim and logo as the sign-in card');
  assert.doesNotMatch(html, /Continue with Google|loginErr/, 'the sign-in card is not under it');
  assert.equal(p.seen.seaStarts, 1, 'the sea moves behind it');
  assert.equal(p.seen.url, '/', 'and ?auth=google is gone from the address bar');
  p.answer(); await p.done;
});

test('the card leaves once /api/auth/me answers, and the app starts as before', async () => {
  const p = page('?auth=google', { on: true, user: { name: 'Ieva', role: 'Admissions' } });
  await settle();
  assert.match(p.screen(), /Signing you in/, 'still waiting while the answer is out');
  assert.equal(p.seen.shell, 0, 'the app has not started under it');
  p.answer(); await p.done;
  assert.equal(p.els.loginScreen, undefined, 'the whole gate is taken down');
  assert.equal(p.seen.shell, 1, 'then the app, exactly as without the wait');
  assert.notEqual(p.shell.style.display, 'none', 'the shell was never hidden');
});

test('if the answer is "not signed in", the sign-in card replaces the wait', async () => {
  const p = page('?auth=google', { on: true, user: null });
  await settle();
  p.answer(); await p.done;
  assert.doesNotMatch(p.screen(), /auth-pending|Signing you in/);
  assert.match(p.screen(), /<h1>Intake<\/h1>[\s\S]*Continue with Google/);
  assert.equal(p.seen.shell, 0);
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
  assert.match(APP, /#auth-pending \.gate-wait\{display:flex;justify-content:center;padding:0 0 16px\}/);
  assert.match(APP, /@media\(prefers-reduced-motion:reduce\)\{\s*#auth-pending \.gate-spin\{animation:none;border-top-color:var\(--gate-ink\)\}\}/, 'the spinner stands still for reduced motion');
  assert.equal((APP.match(/#auth-pending\.gate-loading\{/g) || []).length, 1, 'one rule for the card');
  assert.doesNotMatch(APP, /#auth-pending#auth-pending|#auth-pending\.gate-loading::before|max-width:400px;padding:40px 34px 34px/, 'the old opaque Spectral panel is gone');
  assert.doesNotMatch(APP, /#auth-pending[^{]*\{[^}]*flex-start/, 'nothing in it is pushed to the left');
});

test('the sea stops painting once the gate is taken down', () => {
  assert.match(APP, /function loop\(now\) \{\n\s*if \(!cv\.isConnected\) return;/);
});
