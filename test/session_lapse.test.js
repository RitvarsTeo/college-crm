// SIGNED OUT WHILE THE TAB STAYED OPEN (16.10.2026). Admissions: "intake nerādās zvani, nevar leads atzīmēt" -
// calls did not show and leads could not be made. The live log at that time: one browser asked
// /api/calls/events again and again and was told 401 (not signed in), while another got 200. The session
// in that tab had ended (12 hours after sign-in, or somebody on the same account signed out), the page kept
// its old cards, and the call poller and the raw fetches failed without a word.
// Now: ONE place (apiFetch) handles a 401 from any of Intake's own requests - the pollers stop and the
// sign-in card comes up with one sentence; the call poller waits longer after each failure.
// The page's own code runs here against a fake page.
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
const SAID = 'You were signed out. Sign in again to carry on.';

// The page: the shell, the help button, the modal, the call card, the two forms (Make a lead on the Inbox
// card, Add a person), and whatever the sign-in card appends to <body>. Every request is answered by
// `answer(path, opts)`; timers are held so the test fires them one by one and reads each wait.
function page(answer) {
  const box = (extra = {}) => ({ value: '', innerHTML: '', style: {}, dataset: {}, ...extra });
  const els = { modal: box({ innerHTML: '<div class="modal">Add a person</div>' }), callpop: box({ innerHTML: 'Anna Ozola', dataset: { call: 'c1' } }),
    qInterest: box({ value: 'Navigation' }), qNote: box(), qErr: box(),
    aName: box({ value: 'Anna' }), aEmail: box(), aPhone: box(), aProg: box(), aSource: box(), aOwner: box(), aNext: box(),
    aDays: box({ value: '2' }), aNote: box(), addErr: box() };
  const shell = { style: {} };
  const help = { style: {} };
  const document = {
    querySelector: (q) => {
      if (q === '.shell') return shell;
      if (q === '#helpBtn') return help;
      return els[q.replace(/^#/, '')] || null;
    },
    querySelectorAll: () => [],
    createElement: () => box({ id: '' }),
    body: { appendChild: (el) => { els[el.id] = el; } },
    addEventListener: () => {},
  };
  const asked = [];
  const alerts = [];
  let timers = [];
  const ctx = {
    document, location: { hash: '#/inbox', search: '', pathname: '/' },
    AUTH: { on: true, auth: true, google: true, user: { name: 'Admissions', role: 'user' } }, ACTOR: 'Admissions',
    LOGIN_SEA: () => {}, busy: () => {}, cScoped: (p) => p, viewInbox: () => { ctx.inboxDrawn = true; },
    showDuplicate: () => {}, alert: (m) => alerts.push(m), JSON, Date,
    sessionStorage: { saved: {}, setItem(k, v) { this.saved[k] = v; } },
    setTimeout: (f, ms) => { const t = { f, ms }; timers.push(t); return t; },
    clearTimeout: (t) => { timers = timers.filter((x) => x !== t); },
    fetch: async (url, opts = {}) => {
      asked.push(`${opts.method || 'GET'} ${url}`);
      const [status, body] = await answer(url, opts);
      return { status, ok: status >= 200 && status < 300, statusText: String(status), json: async () => body };
    },
  };
  ctx.window = ctx;
  ctx.$ = (s) => document.querySelector(s);
  const CALLS = block('// ===================================================== THE CALL POP-UP (Q6) ==', '\n(async () => {\n  // WHO ARE YOU');
  vm.runInNewContext([line('const esc = '), block('const GOOGLE_MARK = `', '</svg>`;'), block('const loginShell = ', '</div>`;'),
    fn('function drawLogin('), fn('function startLoginSea('), line('function closeModal('),
    block('// SIGNED OUT WHILE THE TAB STAYED OPEN', "body: JSON.stringify({ by: ACTOR, ...(data || {}) }) });"),
    line('let LAST_RESULT = null;'), fn('async function doQualify('), line('let ADD_CONFIRMED_NEW = false;'), fn('async function saveAdd('),
    CALLS.slice(0, CALLS.lastIndexOf('\n(async () => {')),
    'this.state = () => ({ CP_STOPPED, CP_FAILS, CP_TIMER, CP_ENABLED, SIGNED_OUT });',
    'this.api = api; this.doQualify = doQualify; this.saveAdd = saveAdd; this.callPopStart = callPopStart;',
  ].join('\n'), ctx);
  const screen = () => (els.loginScreen ? els.loginScreen.innerHTML : '');
  // fire the one waiting poll and let it finish
  const fire = async () => {
    assert.equal(timers.length, 1, 'exactly one poll is waiting');
    const t = timers.shift();
    t.f();
    await settle();
    return t.ms;
  };
  return { ctx, els, shell, asked, alerts, screen, fire, timers: () => timers };
}
const settle = () => new Promise((r) => setImmediate(r));
const CALLS_OK = [200, { enabled: true, last: 5, events: [] }];
const NOT_SIGNED_IN = [401, { error: 'not signed in', how: 'Open / and sign in.' }];

function signedOutScreen(p) {
  assert.match(p.screen(), /You were signed out\. Sign in again to carry on\./, 'the one sentence');
  assert.match(p.screen(), /<div id="login-view">/, 'Intake\'s own sign-in shell');
  assert.match(p.screen(), /href="\/api\/auth\/google\/start"[\s\S]*Continue with Google/, 'with the Google button');
  assert.equal(p.shell.style.display, 'none', 'the old cards are no longer on screen');
  assert.equal(p.ctx.state().CP_STOPPED, true, 'the call poller has stopped');
  assert.equal(p.timers().length, 0, 'and nothing is waiting to ask again');
}

test('a 401 from api(): the sign-in card with the sentence, every poller stopped, no alert box', async () => {
  let session = true;
  const p = page((url) => (!session ? NOT_SIGNED_IN : url.startsWith('/api/calls/events') ? CALLS_OK : [200, {}]));
  p.ctx.callPopStart(); await settle();
  assert.equal(p.timers().length, 1, 'the poller is running');
  session = false;                                   // the session ends while the tab stays open
  await assert.rejects(p.ctx.api('/api/summary'), (e) => e.signedOut === true && /signed out/.test(e.message));
  signedOutScreen(p);
  assert.equal(p.els.modal.innerHTML, '', 'an open dialog is closed');
  assert.equal(p.els.callpop.innerHTML, '', 'and so is the call card');
  const n = p.asked.length;
  p.ctx.callPopStart(); await settle();
  assert.equal(p.asked.length, n, 'nothing starts the poller again');
  // a screen that answers a failure with alert(err.message) says nothing over the card
  p.ctx.alert('signed out');
  assert.deepEqual(p.alerts, [], 'no alert box');
  // signing in comes back here: the route is written down in the form src/signinfirst.js reads back
  const back = JSON.parse(p.ctx.sessionStorage.saved.crmReturnAfterSignIn);
  assert.equal(back.h, '#/inbox');
  const RETURN = fs.readFileSync(path.join(ROOT, 'src', 'signinfirst.js'), 'utf8');
  assert.ok(RETURN.includes("var K='crmReturnAfterSignIn'") && RETURN.includes('g.h') && RETURN.includes('g.at'), 'the same key and shape');
  // a second 401 does not draw the card twice
  await assert.rejects(p.ctx.api('/api/people'), /signed out/);
  assert.equal(p.screen().match(/You were signed out/g).length, 1);
});

test('a first visit (nobody signed in yet) is not told it "was signed out"', async () => {
  const p = page(() => NOT_SIGNED_IN);
  p.ctx.AUTH = { on: true, auth: true, google: true, user: null };
  await assert.rejects(p.ctx.api('/api/scope/years'), /signed out/);
  assert.equal(p.screen(), '', 'the boot draws the card, with its own words');
  assert.equal(p.ctx.state().CP_STOPPED, true, 'and nothing polls');
});

test('a copy with sign-in off: a 401 is an ordinary error, no sign-in card', async () => {
  const p = page(() => [401, { error: 'not signed in' }]);
  p.ctx.AUTH = { on: false, user: null };
  await assert.rejects(p.ctx.api('/api/summary'), (e) => !e.signedOut && /not signed in/.test(e.message));
  assert.equal(p.screen(), '');
});

test('the call poller: a 500 waits longer each time (never every few seconds), one good answer is back to 3 s', async () => {
  const replies = [CALLS_OK];
  const p = page(async () => replies.shift() || [500, { error: 'boom' }]);
  p.ctx.callPopStart(); await settle();
  const waits = [];
  waits.push(await p.fire());                        // first good answer: calls can arrive, every 3 s
  for (let i = 0; i < 9; i += 1) waits.push(await p.fire());
  assert.deepEqual(waits, [3000, 6000, 12000, 24000, 48000, 96000, 192000, 300000, 300000, 300000],
    'the first wait is the normal 3 s, then 6 s, 12 s ... never more often, capped at 5 minutes');
  assert.equal(p.ctx.state().CP_FAILS, 10, 'ten failed asks in a row');
  replies.push(CALLS_OK);
  assert.equal(await p.fire(), 300000);
  assert.equal(p.timers()[0].ms, 3000, 'one good answer: every 3 s again');
  assert.equal(p.ctx.state().CP_FAILS, 0);
  assert.equal(p.screen(), '', 'a server error is not a sign-out');
});

test('the call poller: no network at all also backs off; while calls cannot arrive it never asks more than every 5 min', async () => {
  const p = page(async () => { throw new TypeError('Failed to fetch'); });
  p.ctx.callPopStart(); await settle();
  assert.equal(p.timers()[0].ms, 300000, 'nothing known yet and the ask failed: the 5-minute wait, not faster');
  const ok = page(async () => [200, { enabled: true, last: 1, events: [] }]);
  ok.ctx.callPopStart(); await settle();
  assert.equal(ok.timers()[0].ms, 3000);
  ok.ctx.fetch = async () => { throw new TypeError('Failed to fetch'); };
  assert.equal(await ok.fire(), 3000);
  assert.equal(ok.timers()[0].ms, 6000, 'no network: twice as long');
});

test('the call poller: a 401 stops it and puts the sign-in card up', async () => {
  let session = true;
  const p = page(() => (session ? CALLS_OK : NOT_SIGNED_IN));
  p.ctx.callPopStart(); await settle();
  session = false;
  await p.fire();
  signedOutScreen(p);
  const n = p.asked.length;
  await settle();
  assert.equal(p.asked.length, n, 'it does not ask again');
});

test('Make a lead getting 401: the sign-in card, never a silent nothing', async () => {
  const p = page((url, o) => (o.method === 'POST' ? NOT_SIGNED_IN : CALLS_OK));
  await p.ctx.doQualify(7);
  assert.ok(p.asked.includes('POST /api/intake/7/qualify'));
  signedOutScreen(p);
  assert.equal(p.els.qErr.innerHTML, '', 'nothing written on the hidden card');
  assert.equal(p.ctx.inboxDrawn, undefined, 'and the Inbox is not redrawn as if it worked');
  assert.deepEqual(p.alerts, []);
});

test('Make a lead failing any other way: the error line on the card', async () => {
  const p = page(() => [500, { error: 'The database did not answer.' }]);
  await p.ctx.doQualify(7);
  assert.match(p.els.qErr.innerHTML, /<div class="err">The database did not answer\.<\/div>/);
  assert.equal(p.screen(), '', 'not a sign-out');
});

test('Add a person getting 401: the sign-in card; any other failure: the error line', async () => {
  const p = page(() => NOT_SIGNED_IN);
  await p.ctx.saveAdd();
  assert.ok(p.asked.includes('POST /api/people'));
  signedOutScreen(p);
  assert.equal(p.els.addErr.innerHTML, '');
  const q = page(async () => { throw new TypeError('Failed to fetch'); });
  await q.ctx.saveAdd();
  assert.match(q.els.addErr.innerHTML, /<div class="err">Failed to fetch<\/div>/, 'no network is said, not swallowed');
});

test('every request to Intake\'s own /api/ goes through the one 401 handler', () => {
  const script = APP;
  const raw = [...script.matchAll(/(?<![\w.])fetch\((['`])(\/api\/[^'`]*)\1/g)].map((m) => m[2]);
  // the only raw ones left are the two that are open before sign-in and never answer 401
  assert.deepEqual(raw.sort(), ['/api/auth/logout', '/api/auth/me']);
  assert.match(APP, /async function apiFetch\(path, opts\) \{\n  const r = await fetch\(path, opts\);\n  if \(r\.status === 401 && AUTH\.on\) \{/);
  assert.match(APP, /const r = await apiFetch\(path, o\);/, 'api() and post() use it');
  assert.match(APP, /apiFetch\('\/api\/calls\/events' \+ q/, 'the call poller uses it');
  assert.match(APP, /apiFetch\('\/api\/push\/key'/);
  assert.match(APP, /apiFetch\('\/api\/push\/subscribe'/);
  assert.match(APP, /apiFetch\('\/api\/people', \{ method: 'POST'/);
  assert.ok(APP.includes(`const SIGNED_OUT_SAID = '${SAID}';`));
});
