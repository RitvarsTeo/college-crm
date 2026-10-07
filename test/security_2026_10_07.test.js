// The 07.10.2026 entry audit (before the move to the college's Vercel + Supabase).
//
// One test per finding that was fixed, each against a real server process with sign-in ON,
// the way production runs. Each test states what would be possible if its guard were deleted.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SECRET = 'a-session-secret-long-enough-to-be-accepted';
const AUTH_ENV = { CRM_AUTH: '1', CRM_SESSION_SECRET: SECRET };

function startServer(env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')],
      { env: { ...process.env, CRM_DB: ':memory:', PORT: '0', CRM_INSECURE_COOKIE: '1',
        CRM_PUBLIC: '', DATASET: 'empty', VERCEL: '', VERCEL_ENV: '', ...env },
        stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const done = (fn, arg) => { clearTimeout(timer); fn(arg); };
    const timer = setTimeout(() => { child.kill(); reject(new Error('the server never started: ' + out)); }, 15000);
    child.stdout.on('data', (d) => {
      out += d;
      if (/REFUSING TO START|Error/.test(out)) { child.kill(); return done(reject, new Error(out)); }
      const m = out.match(/http:\/\/localhost:(\d+)/);
      if (m) done(resolve, { child, port: Number(m[1]), out: () => out });
    });
    child.stderr.on('data', (d) => { out += d; });
    child.on('exit', () => done(reject, new Error('the server exited: ' + out)));
  });
}

function request(port, method, p, { raw, contentType = 'application/json', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: p,
      headers: { ...(raw != null ? { 'content-type': contentType, 'content-length': Buffer.byteLength(raw) } : {}),
        ...headers } },
      (res) => {
        let text = '';
        res.on('data', (d) => { text += d; });
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(text); } catch {}
          resolve({ status: res.statusCode, text, json });
        });
      });
    req.on('error', reject);
    if (raw != null) req.write(raw);
    req.end();
  });
}

// ------------------------------------------------------------------ C1 ----
// Without the guard: anybody on the internet could POST an invented email or a "missed call"
// with a premium-rate number into the Inbox, recorded as if the provider had sent it.
test('C1: the pull channels (gmail, phone, in_person) refuse an outside POST, even when switched on', async (t) => {
  const s = await startServer({ ...AUTH_ENV, CHANNEL_MODE_GMAIL: 'test', CHANNEL_MODE_PHONE: 'test',
    CHANNEL_MODE_IN_PERSON: 'test' });
  t.after(() => s.child.kill());
  for (const channel of ['gmail', 'phone', 'in_person']) {
    const json = await request(s.port, 'POST', '/api/inbound/' + channel,
      { raw: JSON.stringify({ id: 'forged-1', from: 'x@example.com', text: 'hello' }) });
    assert.notEqual(json.status, 200, channel + ' accepted an unauthenticated JSON POST');
    const plain = await request(s.port, 'POST', '/api/inbound/' + channel,
      { raw: '{"id":"forged-2"}', contentType: 'text/plain' });
    assert.notEqual(plain.status, 200, channel + ' accepted an unauthenticated text/plain POST');
  }
  const people = await request(s.port, 'GET', '/api/intake?state=new');
  assert.equal(people.status, 401, 'and the queue itself stays behind sign-in');
});

// ------------------------------------------------------------------ C2 ----
// Without the guard: a Vercel project created without CRM_AUTH=1 would serve every applicant
// to anybody with the address, and any web page could POST /api/reset.
import { requireConfigured } from '../src/auth.js';

test('C2: a hosted copy (VERCEL set) refuses to start without CRM_AUTH=1', () => {
  assert.equal(requireConfigured({ VERCEL: '1' }).ok, false);
  assert.equal(requireConfigured({ VERCEL: '1', CRM_AUTH: '0' }).ok, false);
  assert.equal(requireConfigured({ VERCEL: '1', CRM_AUTH: '1', CRM_SESSION_SECRET: SECRET }).ok, true);
  assert.equal(requireConfigured({ VERCEL: '1', CRM_PUBLIC: '1' }).ok, true, 'the shared demo door stays possible');
  assert.equal(requireConfigured({}).ok, true, 'a laptop copy without sign-in still starts');
});

test('C2: the real boot exits on a hosted copy with sign-in off', async () => {
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')],
      { env: { ...process.env, CRM_DB: ':memory:', PORT: '0', CRM_AUTH: '', CRM_PUBLIC: '',
        DATASET: 'empty', VERCEL: '1' }, stdio: 'ignore' });
    const timer = setTimeout(() => { child.kill(); resolve('still running'); }, 15000);
    child.on('exit', (c) => { clearTimeout(timer); resolve(c); });
  });
  assert.equal(code, 1);
});

test('C2: a laptop copy listens on this machine only', async (t) => {
  const s = await startServer(AUTH_ENV);
  t.after(() => s.child.kill());
  const net = await import('node:net');
  const { networkInterfaces } = await import('node:os');
  const lan = Object.values(networkInterfaces()).flat()
    .find((i) => i && i.family === 'IPv4' && !i.internal);
  if (!lan) return t.skip('no non-loopback IPv4 address on this machine');
  const reached = await new Promise((resolve) => {
    const sock = net.connect({ host: lan.address, port: s.port });
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('error', () => resolve(false));
    sock.setTimeout(3000, () => { sock.destroy(); resolve(false); });
  });
  assert.equal(reached, false, 'the server answered on ' + lan.address);
});

// ------------------------------------------------------------------ H1 ----
// Without the guard: GET ?challengeCode=hmacsha256=<body> returned a valid LinkedIn signature
// for any body, so anybody could inject fake LinkedIn leads and "withdrew" notes.
import crypto from 'node:crypto';
import { handshake, verifyRequest } from '../src/inbound.js';

test('H1: the LinkedIn handshake answers a UUID only, so it cannot sign a forged delivery', () => {
  const env = { LINKEDIN_CLIENT_SECRET: 'li-secret' };
  const secretEnv = 'LINKEDIN_CLIENT_SECRET';
  const body = JSON.stringify({ type: 'LEAD_ACTION', leadGenFormResponse: 'urn:li:forged:1' });
  const forged = handshake('linkedin', new URL('https://x/api/inbound/linkedin?challengeCode='
    + encodeURIComponent('hmacsha256=' + body)), { ...env, [secretEnv]: 'li-secret' });
  assert.equal(forged.ok, false, 'a non-UUID challenge was answered');
  assert.equal(forged.status, 400);

  const real = handshake('linkedin', new URL('https://x/api/inbound/linkedin?challengeCode=890e4665-4dfe-4ab1-b689-ed553bceeed0'),
    { ...env, [secretEnv]: 'li-secret' });
  assert.equal(real.ok, true, 'a real LinkedIn challenge is still answered');

  // and the signature the old oracle would have produced is still refused without the secret's help
  const sig = crypto.createHmac('sha256', 'li-secret').update('hmacsha256=' + body).digest('hex');
  assert.equal(verifyRequest('linkedin', { headers: { 'x-li-signature': sig } },
    { secret: 'li-secret', rawBody: body }).ok, true, 'sanity: this IS a valid signature, which is why the oracle mattered');
});

// ---------------------------------------------------------- H3 + M3 ----
// A copy the way Vercel runs it: VERCEL set, so server.js does not listen and the platform
// calls handle(). Here a tiny harness plays the platform. Accounts come from bootstrap, and
// the admin's cookie is minted with the same secret, exactly as a Google sign-in would.
import { issueSession, cookieHeader } from '../src/auth.js';

const HOSTED_PW = 'Tq7#vLm2!pZ9wXr4';
function startHosted(env = {}) {
  const harness = `
    const http = await import('node:http');
    const { pathToFileURL } = await import('node:url');
    const { handle } = await import(pathToFileURL(${JSON.stringify(path.join(ROOT, 'src', 'server.js'))}).href);
    const s = http.createServer(handle);
    s.listen(0, '127.0.0.1', () => console.log('http://localhost:' + s.address().port));`;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', harness],
      { env: { ...process.env, CRM_DB: ':memory:', PORT: '0', CRM_INSECURE_COOKIE: '1', CRM_PUBLIC: '',
        DATASET: 'empty', VERCEL: '1', VERCEL_ENV: 'production', ...AUTH_ENV,
        CRM_RITVARS_PASSWORD: HOSTED_PW, CRM_AIGARS_PASSWORD: HOSTED_PW, CRM_ADMISSIONS_PASSWORD: HOSTED_PW, ...env },
        stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('never started: ' + out)); }, 15000);
    const look = (d) => {
      out += d;
      if (/REFUSING TO START/.test(out)) { clearTimeout(timer); child.kill(); return reject(new Error(out)); }
      const m = out.match(/http:\/\/localhost:(\d+)/);
      if (m) { clearTimeout(timer); resolve({ child, port: Number(m[1]) }); }
    };
    child.stdout.on('data', look); child.stderr.on('data', look);
    child.on('exit', () => { clearTimeout(timer); reject(new Error('exited: ' + out)); });
  });
}
const adminCookie = () => cookieHeader(issueSession({ email: 'aigars.kluga@novikontas.org', name: 'Aigars',
  role: 'admin', sessionVersion: 0, authMethod: 'google' }, SECRET), { secure: false }).split(';')[0];

test('H3 + M3: on the live copy a signed-in admin cannot reset, swap data or write demo records', async (t) => {
  const s = await startHosted();
  t.after(() => s.child.kill());
  const cookie = adminCookie();
  const me = await request(s.port, 'GET', '/api/auth/me', { headers: { cookie } });
  assert.equal(me.json && me.json.user && me.json.user.role, 'admin', 'sanity: the test admin is signed in');

  for (const p of ['/api/reset', '/api/dataset', '/api/demo/scenario', '/api/console/mode', '/api/intake/demo',
    '/api/intake/receive', '/api/console/phone-event', '/api/console/send', '/api/sim/demo',
    '/api/sim/website/run', '/api/inbound/website/simulate']) {
    const r = await request(s.port, 'POST', p, { raw: '{}', headers: { cookie } });
    assert.equal(r.status, 410, p + ' answered ' + r.status + ' for an admin on the live copy');
  }

  // and the x-crm-simulated shortcut no longer skips a channel's signature check
  const sim = await request(s.port, 'POST', '/api/inbound/website',
    { raw: '{"submission_id":"s-1","name":"Forged"}', headers: { cookie, 'x-crm-simulated': '1' } });
  assert.notEqual(sim.status, 200, 'a simulated delivery was accepted on the live copy');
});

// ------------------------------------------------------------------ H2 ----
// Without these guards: a task label or a planted source_channel ran as script in whoever
// opened Today, including an admin, who could then be made to export or wipe the CRM.
import fs from 'node:fs';
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const lineOf = (re) => { const m = APP.match(re); assert.ok(m, 'not found: ' + re); return m[0]; };
const helpers = new Function('CFG', [lineOf(/^const esc = .*$/m),
  "const jsq = (s) => esc(JSON.stringify(String(s ?? '')));",   // the form every handler now writes inline
  APP.match(/^const channelLabel = [\s\S]*?;$/m)[0], 'return { esc, jsq, channelLabel };'].join('\n'));
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&amp;/g, '&');

test('H2: a hostile value inside an onclick attribute stays one string argument', () => {
  const { jsq } = helpers({});
  for (const evil of ["');fetch('/api/reset',{method:'POST'});//", '");alert(1);//', "\');x();//", '</b><img src=x onerror=1>']) {
    const attr = `f(1,${jsq(evil)})`;                       // what goes between onclick=" and "
    assert.equal(attr.includes('"'), false, 'a raw double quote would end the attribute');
    let got;
    new Function('f', decode(attr))((id, label) => { got = label; });   // what the browser runs
    assert.equal(got, evil);
  }
});

test('H2: an unknown source_channel cannot carry HTML, and the Today card escapes it', () => {
  const { channelLabel } = helpers({ channels: { website: 'Website' } });
  assert.equal(channelLabel('website'), 'Website');
  assert.equal(/[<>"'=()]/.test(channelLabel('<img src=x onerror=alert(1)>')), false);
  assert.equal(channelLabel('agent_partner'), 'agent_partner', 'a plain unknown id still reads');
  assert.equal(/\$\{channelLabel\(item\.(channel \|\||source_channel)/.test(APP), false,
    'a Today card meta line still interpolates channelLabel without esc()');
});

test('H2: no inline handler builds a JavaScript string from esc() alone', () => {
  const bad = [...APP.matchAll(/on[a-z]+="[^"]*'\$\{esc\(/g)].map((m) => m[0].slice(0, 80));
  assert.deepEqual(bad, []);
  assert.ok((APP.match(/\$\{esc\(JSON\.stringify\(String\(/g) || []).length >= 45, 'the safe form is in place');
});

// ------------------------------------------------------------------ M1 ----
// Without the guard: a page on any other *.novikontas.org app could POST to the CRM with a
// staff member's cookie (SameSite=Lax treats sibling subdomains as the same site).
test('M1: a signed-in write from another origin is refused; our own page and webhooks still work', async (t) => {
  const s = await startHosted();
  t.after(() => s.child.kill());
  const cookie = adminCookie();
  const body = JSON.stringify({ name: 'Origin Test', phone: '+37120000000' });
  const evil = await request(s.port, 'POST', '/api/people',
    { raw: body, headers: { cookie, origin: 'https://b2b.novikontas.org', 'sec-fetch-site': 'same-site' } });
  assert.equal(evil.status, 403, 'a sibling subdomain could write');
  const evilOld = await request(s.port, 'POST', '/api/people',
    { raw: body, headers: { cookie, origin: 'https://b2b.novikontas.org' } });
  assert.equal(evilOld.status, 403, 'an older browser (Origin only) from a sibling could write');

  const own = await request(s.port, 'POST', '/api/people',
    { raw: body, headers: { cookie, origin: 'http://127.0.0.1:' + s.port, 'sec-fetch-site': 'same-origin' } });
  assert.notEqual(own.status, 403, 'our own page was refused');

  const hook = await request(s.port, 'POST', '/api/inbound/website',
    { raw: '{}', headers: { origin: 'https://tilda.cc', 'sec-fetch-site': 'cross-site' } });
  assert.notEqual(hook.status, 403, 'a webhook must not be judged by origin');
});

// ------------------------------------------------------- H4, M6, M11 ----
// Proved live against the Supabase project on 07.10.2026 as well (schema crm, verified TLS, a
// connection without Supabase's root refused, nothing in public). These hold without a database.
import { pgSsl, openDb } from '../src/db.js';

test('M6: Postgres certificates are verified; Supabase hosts use the Supabase root', () => {
  const sb = pgSsl('postgresql://u:p@aws-1-eu-central-1.pooler.supabase.com:5432/postgres');
  assert.equal(sb.rejectUnauthorized, true);
  assert.match(sb.ca, /BEGIN CERTIFICATE/);
  assert.deepEqual(pgSsl('postgresql://u:p@ep-x.eu-central-1.aws.neon.tech/db'), { rejectUnauthorized: true });
  assert.equal(pgSsl('postgresql://u:p@localhost/db?sslmode=disable'), false);
});

test('M11: the web server refuses Postgres without CRM_PG_SCHEMA, before connecting', async () => {
  const keep = { url: process.env.DATABASE_URL, schema: process.env.CRM_PG_SCHEMA };
  process.env.DATABASE_URL = 'postgresql://nobody:nothing@127.0.0.1:1/none?sslmode=disable';
  delete process.env.CRM_PG_SCHEMA;
  try {
    await assert.rejects(() => openDb('data/crm.db'), /CRM_PG_SCHEMA/);
  } finally {
    if (keep.url === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = keep.url;
    if (keep.schema !== undefined) process.env.CRM_PG_SCHEMA = keep.schema;
  }
});
