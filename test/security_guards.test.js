// SECURITY GUARDS (KB 08 P11, 07.10.2026). Not one finding: the four rules every LATER change must keep,
// written against fix/security-2026-10-07 (Aigars). The findings themselves are proved, once each, in
// test/security_2026_10_07.test.js; this file is the tripwire for what comes next.
//
//   (a) every route that answers WITHOUT a session is in ONE list below, with its proof;
//   (b) no inline handler builds JavaScript out of data;
//   (c) every demo, reset and simulator write refuses on the live copy;
//   (d) a hosted copy without sign-in does not start.
//
// A NEW OPEN ROUTE WITHOUT AN ENTRY HERE FAILS THIS SUITE, three ways: the source of openBeforeSignIn is
// pinned, every route under an open prefix must be named, and a running copy is asked every route it
// has, without a session, and must refuse all but the listed ones.

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, start, startHosted, adminCookie } from './security_helpers.js';
import { verifyRequest, channelIds, channelDef, acceptsWebhook, isActiveChannel, handshake } from '../src/inbound.js';
import { authoriseCron } from '../lib/pbx.js';
import { requireConfigured } from '../src/auth.js';

const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const SERVER = read('src', 'server.js');

// ------------------------------------------------------------------------------------------ (a)
const OPEN_API = {
  '/api/auth/login': { proof: 'none needed: it refuses every request (410), password sign-in is off', answers: true },
  '/api/auth/google/start': { proof: 'starts Google sign-in; mints a signed state + nonce cookie', answers: true },
  '/api/auth/google/callback': { proof: "Google's code + the state and nonce this browser was given", answers: true },
  '/api/auth/gmail/connect': { proof: 'a signed, expiring gmail-invite flow token', answers: true },
  '/api/auth/me': { proof: 'says only whether the caller is signed in', answers: true },
  '/api/auth/logout': { proof: "ends only the caller's own session", answers: true },
  '/api/intake/application': { proof: 'the SIS shared secret header', answers: false },
  '/api/inbound/phone-event': { proof: 'PHONE_EVENT_SECRET', answers: false },
};
// What each delivery mechanism proves. A channel may be open to deliveries only with one of these.
const INBOUND_PROOF = {
  shared_secret_header: 'a shared secret header, compared in constant time',
  meta_app_secret_signature: "Meta's X-Hub-Signature-256 over the raw body",
  linkedin_signature: "LinkedIn's signature over the raw body",
  tiktok_signature: "TikTok's signature over the raw body",
  secret_in_url: 'a secret in the address the provider was given, compared in constant time',
  per_partner_token: 'a token issued to one partner',
};
// A provider's address check that must answer a stranger (the provider will not save the address
// otherwise) and therefore WRITES NOTHING unless the request carries our secret (P11 rule 3).
const MUST_ANSWER = { 'GET /api/inbound/mailchimp': 'Mailchimp saves a webhook only after a 200; recorded only with ?s=<secret>' };
// Pages outside /api: the app shell and its files, holding no data; every call they make goes through
// the sign-in door. `/access` is the shared demo copy's password form.
const OPEN_PAGES = ['/', '/index.html', '/healthz', '/sw.js', '/manifest.webmanifest', '/favicon.ico',
  '/console', '/console/', '/access', '/assets/'];

// ONE running copy (sign-in on) for the read-only checks, so this file adds as little load as it can:
// several suites start servers at once, and a slow start fails somebody else's test.
let shared = null;
const sharedServer = () => (shared ||= start({ DATASET: 'empty', CHANNEL_MODE_GOOGLE_FORM: 'live', CHANNEL_MODE_OPEN_DAY: 'live',
  GOOGLE_FORM_SECRET: 'configured-secret-1', OPEN_DAY_SECRET: 'configured-secret-2' }));
after(async () => { if (shared) (await shared).child.kill(); });

test('(a) the door function is pinned: a new open path must be added here, with its proof', () => {
  const at = SERVER.indexOf('function openBeforeSignIn(');
  const body = SERVER.slice(at, SERVER.indexOf('\n}\n', at));
  const opens = body.split('\n').map((l) => l.replace(/\/\/.*$/, '').trim()).filter((l) => /return true;/.test(l));
  assert.deepEqual(opens, [
    "if (pathname.startsWith('/api/auth/')) return true;",
    "if (pathname.startsWith('/api/cron/')) return true;",
    'if (inbound && channelDef(inbound[1]) && acceptsWebhook(inbound[1])) return true;',
    "if (pathname === '/api/intake/application') return true;",
    "if (pathname === '/api/inbound/phone-event') return true;",
  ], 'openBeforeSignIn changed: add the new door to OPEN_API with its proof, then update this list');
});

test('(a) every route under an open prefix is named in the list, and nothing named is stale', () => {
  const authRoutes = new Set([...SERVER.matchAll(/p === '(\/api\/auth\/[^']+)'/g)].map((m) => m[1]));
  const listed = Object.keys(OPEN_API).filter((k) => k.startsWith('/api/auth/'));
  assert.deepEqual([...authRoutes].sort(), listed.sort(), 'a route under /api/auth/ is open to everybody: list it with its proof');
  assert.ok(!/\/\^\\\/api\\\/auth\\\//.test(SERVER), 'no pattern-matched routes under /api/auth/ (each must be named)');
  for (const k of Object.keys(OPEN_API)) assert.ok(SERVER.includes(`'${k}'`), `${k} is listed but no longer exists`);
});

test('(a) every cron function demands CRON_SECRET before it does anything', () => {
  const files = fs.readdirSync(path.join(ROOT, 'api', 'cron')).filter((f) => f.endsWith('.js'));
  assert.ok(files.length > 0);
  for (const f of files) {
    const handler = read('api', 'cron', f).slice(read('api', 'cron', f).indexOf('export default'));
    assert.match(handler, /authoriseCron\(/, `${f} does not check CRON_SECRET`);
    assert.match(handler, /if \(!auth\.ok\)/, `${f} does not stop on a refused CRON_SECRET`);
  }
  assert.equal(authoriseCron('Bearer x', {}).ok, false, 'no CRON_SECRET configured refuses everything');
  assert.equal(authoriseCron('', { CRON_SECRET: 's3cret' }).ok, false);
  assert.equal(authoriseCron('Bearer wrong!', { CRON_SECRET: 's3cret' }).ok, false);
  assert.equal(authoriseCron('Bearer s3cret', { CRON_SECRET: 's3cret' }).ok, true);
});

test('(a) every channel open to deliveries is active, proves itself, and its verifier refuses an unproven request', () => {
  for (const id of channelIds()) {
    if (!acceptsWebhook(id)) continue;
    const def = channelDef(id);
    assert.ok(isActiveChannel(id), `${id} is ${def.lifecycle} but still open`);
    assert.ok(INBOUND_PROOF[def.auth], `${id} is open with "${def.auth}", which proves nothing listed: name its proof here`);
    const url = new URL(`http://localhost/api/inbound/${id}`);
    assert.equal(verifyRequest(id, { headers: {} }, { secret: 'a-configured-secret', rawBody: '{"x":1}', url }).ok, false,
      `${id}: a request with no proof was accepted`);
    assert.equal(verifyRequest(id, { headers: {} }, { secret: '', rawBody: '{}', url }).ok, false, `${id}: no secret configured must refuse`);
  }
});

test('(a) the address checks that must answer a stranger write nothing without our secret', () => {
  const env = { MAILCHIMP_WEBHOOK_SECRET: 'the-configured-secret' };
  const stranger = handshake('mailchimp', new URL('http://x/api/inbound/mailchimp'), env);
  assert.equal(stranger.status, 200);
  assert.equal(stranger.record, false, 'a GET from a stranger must not be recorded as "Mailchimp checked our URL"');
  assert.equal(handshake('mailchimp', new URL('http://x/api/inbound/mailchimp?s=the-configured-secret'), env).record, true);
  assert.equal(handshake('linkedin', new URL('http://x/api/inbound/linkedin?challengeCode=not-a-uuid'), { LINKEDIN_CLIENT_SECRET: 'k' }).ok, false);
  assert.deepEqual(Object.keys(MUST_ANSWER), ['GET /api/inbound/mailchimp']);
});

// The routes the server has, as paths that can be asked for: literals, and patterns with a sample.
function routePaths() {
  const out = new Set([...SERVER.matchAll(/p === '(\/api\/[^']+)'/g)].map((m) => m[1]));
  for (const m of SERVER.matchAll(/\/\^(\\\/api\\\/[^\s]*?)\$\/\.(?:test|exec)\(p\)/g)) {
    const sample = m[1].replace(/\\\//g, '/').replace(/\\\./g, '.').replace(/\[\^\/\]\+/g, 'x1').replace(/\\d\+/g, '1')
      .replace(/\[a-z_\]\+/g, 'website').replace(/\(([^|()]*)\|[^)]*\)/g, '$1').replace(/[()]/g, '');
    assert.ok(!/[\\[\]*+?|{}^$]/.test(sample), `could not make a sample path for /^${m[1]}$/: teach routePaths()`);
    out.add(sample);
  }
  for (const id of channelIds()) { out.add(`/api/inbound/${id}`); out.add(`/api/inbound/${id}/simulate`); }
  out.add('/api/admin/channels/website');
  return [...out];
}
const openListed = (p) => Boolean(OPEN_API[p]) || (/^\/api\/inbound\/([a-z_]+)$/.test(p) && acceptsWebhook(p.split('/')[3]));

test('(a) a running copy, asked every route without a session, refuses all but the listed doors', async () => {
  const s = await sharedServer();
  const leaks = [];
  for (const p of routePaths()) {
    for (const method of ['GET', 'POST']) {
      const r = await fetch(s.base + p, { method, redirect: 'manual',
        headers: { origin: s.base, 'content-type': 'application/json', accept: 'application/json' }, ...(method === 'POST' ? { body: '{}' } : {}) });
      await r.arrayBuffer();
      if (r.status === 401 || r.status === 404) continue;
      if (openListed(p)) {
        if (MUST_ANSWER[`${method} ${p}`]) continue;
        if (!(OPEN_API[p] && OPEN_API[p].answers) && r.status >= 200 && r.status < 300) leaks.push(`${method} ${p} answered ${r.status} with no proof`);
        continue;
      }
      leaks.push(`${method} ${p} answered ${r.status} without a session and is not in OPEN_API`);
    }
  }
  assert.deepEqual(leaks, []);
});

test('(a) a channel that is not active has no door on a running copy', async () => {
  const s = await sharedServer();
  for (const id of channelIds().filter((c) => !isActiveChannel(c))) {
    const r = await fetch(`${s.base}/api/inbound/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"name":"x"}' });
    await r.arrayBuffer();
    assert.ok([401, 404].includes(r.status), `${id} (${channelDef(id).lifecycle}) answered ${r.status}`);
  }
});

test('(a) the pages outside /api are only the app shell and its files', () => {
  const pages = new Set([...SERVER.matchAll(/p === '(\/(?!api\/)[^']*)'/g)].map((m) => m[1]));
  for (const m of SERVER.matchAll(/p\.startsWith\('(\/(?!api\/)[^']*)'\)/g)) pages.add(m[1]);
  assert.deepEqual([...pages].sort(), [...OPEN_PAGES].sort(), 'a new page outside /api: list it in OPEN_PAGES and say why it holds no data');
});

// ------------------------------------------------------------------------------------------ (b)
// Inside an on*="..." attribute every ${...} must be a JSON literal (esc(JSON.stringify(...)) or jsq),
// a Number(), or one of the values below, each read on 07.10.2026. A NEW one fails until it is made a
// literal or reviewed into this list with its reason.
const REVIEWED = new Map(Object.entries({
  // numbers, booleans, counts, years
  'r.id': 'database row id (number)', 'id': 'database row id (number)', 't.id': 'task id (number)', 'openTask.id': 'task id (number)',
  'taskId': 'task id (number)', 'item.taskId': 'task id (number)', 'i': 'loop index', 'y': 'a year (number)', 'items.length': 'a count',
  'p.notes.length': 'a count', 'done': 'boolean', 'more': 'boolean', 'out.year': 'a year (number)',
  "r.handledAt ? 'false' : 'true'": 'boolean literal', "MORE_FILTERS ? 'false' : 'true'": 'boolean literal',
  '\n        C_TERMINAL.includes((byId.get(t.person_id) || {}).status)': 'boolean',
  'on(c.id)': 'boolean', 'on(out.admLabel)': 'boolean', 'on(out.npLabel)': 'boolean',
  // fixed pieces of code the screen itself chose
  'pick': 'a function name from the screen', 'set': 'code from the screen', 'clear': 'code from the screen', 'toggle': 'code from the screen',
  // ids from the screen's own constants (columns, groups, filter keys), never from data
  'which': 'a fixed panel name', 'col': 'a board column id', 'g.id': 'a Today group id', 'c.id': 'an Inbox column id', 'k': 'a filter key',
  // person ids: made only by the server (newPersonId, crypto.randomUUID), never taken from input
  'r.person_id': 'server-made person id', 'r.personId': 'server-made person id', 't.person_id': 'server-made person id',
  'esc(pid)': 'server-made person id', 'esc(p.id)': 'server-made person id', 'esc(ts[0].person_id)': 'server-made person id',
  'esc(t.person_id)': 'server-made person id', 'esc(r.id)': 'server-made id', 'esc(m.id)': 'server-made person id',
  'esc(id)': 'a channel id from config/channels.json (console)', 'esc(s.id)': 'a scenario id from config (console)',
  // the classic view (?ui=classic), read 07.10.2026: the same kinds of value, quoted the old way
  'p.id': 'server-made person id', 'personId': 'server-made person id', 'item.person_id': 'server-made person id',
  'item.id': 'server-made id', 's.id': 'a scenario id from config', 'c.open': 'an app address built from a server-made id (todayCard)',
  'key': 'a fixed column key', 'v': 'a fixed history filter', 'p': "a theme name: 'light' | 'system' | 'dark'",
  'f.go': "a report figure key the server builds ('outcome|...')", 'f.k': 'a cohort key the server builds from a date',
  "TODAY_VIEW === 'table' ? 'card' : 'table'": 'a fixed view name',
}));

function handlerExprs(src) {
  const out = [];
  const re = /\son[a-z]+="/g; let m;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length;
    while (i < src.length && src[i] !== '"') {
      if (src[i] === '$' && src[i + 1] === '{') {
        let d = 1, j = i + 2;
        while (j < src.length && d) { if (src[j] === '{') d++; else if (src[j] === '}') d--; j++; }
        out.push({ expr: src.slice(i + 2, j - 1), line: src.slice(0, m.index).split('\n').length });
        i = j; continue;
      }
      i++;
    }
  }
  return out;
}
const literal = (e) => /^(jsq|Number)\(/.test(e) || /^esc\(JSON\.stringify\(/.test(e)
  || /^C_PEDIT === p\.id \? 'null' : `\$\{esc\(JSON\.stringify\(/.test(e);

test('(b) no inline handler builds JavaScript out of data', () => {
  for (const f of ['app.html', 'console.html']) {
    const bad = handlerExprs(read('src', f)).filter(({ expr }) => !literal(expr) && !REVIEWED.has(expr));
    assert.deepEqual(bad.map((b) => `${f}:${b.line} \${${b.expr.trim().slice(0, 60)}}`), [],
      'make it ${esc(JSON.stringify(String(x ?? \'\')))} or Number(...), or review it into REVIEWED with its reason');
  }
});

test('(b) a JSON literal keeps a hostile value one harmless string', () => {
  const src = read('src', 'app.html');
  const esc = new Function(`${src.match(/^const esc = .*$/m)[0]}; return esc;`)();
  const v = esc(JSON.stringify(String("'); alert(1)//\" onmouseover=x")));
  assert.ok(!v.includes('"') && !v.includes("'"), 'no raw quote survives into the attribute');
});

// ------------------------------------------------------------------------------------------ (c)
// The words that mark a reset, a demo or a simulator. Every POST route matching them must be a demo
// write (DEMO_WRITES / isDemoWrite in src/server.js) and answer 410 on the live copy, even to an admin.
const DANGER = /reset|wipe|demo|scenario|dataset|\/sim\/|simulate|console\/(mode|send|phone-event)|intake\/receive/;
// Matched by the words but reviewed 07.10.2026 as harmless: read-only lists, behind sign-in.
const REVIEWED_READ_ONLY = new Set(['/api/console/scenarios', '/api/sim/providers', '/api/sim/events', '/api/sim/events/1']);

test('(c) on the live copy every reset, demo and simulator write answers 410, even to an admin', async (t) => {
  const s = await startHosted();
  t.after(() => s.child.kill());
  const cookie = adminCookie();
  const writes = routePaths().filter((p) => DANGER.test(p) && !REVIEWED_READ_ONLY.has(p));
  assert.ok(writes.length >= 10, 'the danger list found the demo writes');
  const open = [];
  for (const p of writes) {
    const r = await fetch(s.base + p, { method: 'POST', headers: { origin: s.base, 'content-type': 'application/json', cookie }, body: '{}' });
    await r.arrayBuffer();
    if (r.status !== 410) open.push(`POST ${p} answered ${r.status}`);
  }
  assert.deepEqual(open, [], 'add it to DEMO_WRITES in src/server.js, or review it into REVIEWED_READ_ONLY');
});

// ------------------------------------------------------------------------------------------ (d)
test('(d) a hosted copy without sign-in does not start (the boot itself: security_2026_10_07 C2)', () => {
  assert.equal(requireConfigured({ VERCEL: '1' }).ok, false);
  assert.equal(requireConfigured({ VERCEL: '1', CRM_AUTH: '0' }).ok, false);
  assert.match(SERVER, /requireConfigured\(/, 'server.js still asks it at boot');
});
