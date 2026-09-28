// The admin Channels panel.
//
// It answers four questions and nothing else: what channels exist, what is
// missing, what is working, what is broken. The hard part is not showing that -
// it is refusing to overstate it. A panel that says CONNECTED because a secret
// is set would be worse than no panel, because somebody would believe it.
//
// So most of this suite is about what the panel must NOT say.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { statusOf, allStatuses, runCheck, checkPlanFor, requiredSettings, modeOf,
  assertNoSecretValues, STATES } from '../src/channeladmin.js';
import { channelIds, channelDef } from '../src/inbound.js';
import { openDb } from '../src/db.js';
import { hashPassword, SCRYPT, issueSession } from '../src/auth.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SECRET = 'a-session-secret-long-enough-to-be-accepted';

// Values that are obviously fake AND obviously distinctive, so a test that greps
// the payload for them cannot pass by accident.
const FAKE = {
  META_APP_SECRET: 'FAKE-meta-app-secret-zzqq',
  META_VERIFY_TOKEN: 'FAKE-meta-verify-token-zzqq',
  WEBSITE_FORM_SECRET: 'FAKE-website-secret-zzqq',
  GOOGLE_FORM_SECRET: 'FAKE-google-form-secret-zzqq',
  MAILCHIMP_WEBHOOK_SECRET: 'FAKE-mailchimp-secret-zzqq',
  OPEN_DAY_SECRET: 'FAKE-open-day-secret-zzqq',
  LINKEDIN_CLIENT_SECRET: 'FAKE-linkedin-secret-zzqq',
  TIKTOK_CLIENT_SECRET: 'FAKE-tiktok-secret-zzqq',
  PBX_API_TOKEN: 'FAKE-pbx-token-zzqq',
  AGENT_TOKENS: JSON.stringify({ 'FAKE-partner-token-zzqq': 'A Partner' }),
  GMAIL_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'crm@fake.iam.gserviceaccount.com',
    private_key: 'FAKE-private-key-zzqq' }),
};

// ===================================================================== states

test('every channel reports one of the four states and nothing else', async () => {
  for (const s of allStatuses({ env: {} })) {
    assert.ok(STATES.includes(s.state), `${s.channel} reported "${s.state}"`);
  }
  for (const s of allStatuses({ env: FAKE })) {
    assert.ok(STATES.includes(s.state), `${s.channel} reported "${s.state}"`);
  }
});

test('a channel with its secret missing is NOT CONFIGURED', async () => {
  assert.equal(statusOf('website', { env: {} }).state, 'NOT CONFIGURED');
  assert.deepEqual(statusOf('website', { env: {} }).missingSettings, ['WEBSITE_FORM_SECRET']);
});

test('SETTING THE SECRET DOES NOT MAKE IT CONNECTED', async () => {
  // The single most important assertion in this file. Somebody typing a secret
  // into Render proves that somebody typed a secret into Render. It does not
  // prove Meta has ever heard of us, and a panel that claimed otherwise would
  // send Tetiana away thinking her job was done.
  const s = statusOf('whatsapp', { env: FAKE });
  assert.equal(s.state, 'CONFIGURED');
  assert.notEqual(s.state, 'CONNECTED');
  assert.match(s.summary, /never checked/);
});

test('OUR OWN CHECK PASSING DOES NOT MAKE IT CONNECTED EITHER', async () => {
  // The second trap. Our check runs against our own code in our own process.
  // Passing it proves our side works. It says nothing about whether the provider
  // has been pointed at us, and the wording has to reflect that.
  const s = statusOf('whatsapp', { env: FAKE,
    lastCheck: { at: new Date().toISOString(), ok: 1, kind: 'handshake', detail: 'all steps passed' } });
  assert.equal(s.state, 'CONFIGURED');
  assert.equal(s.lastCheckOk, true);
  assert.match(s.summary, /never reached us/);
});

test('only the PROVIDER reaching us makes it CONNECTED', async () => {
  const s = statusOf('whatsapp', { env: FAKE, handshakeAt: '2026-09-25T09:00:00.000Z',
    handshakeHow: 'Meta verify token matched, challenge echoed' });
  assert.equal(s.state, 'CONNECTED');
  assert.equal(s.live, false, 'and it is still switched OFF, which is a separate question');
  assert.match(s.summary, /switched OFF/);
});

test('a failed check is an ERROR, and the error is readable', async () => {
  const s = statusOf('website', { env: FAKE,
    lastCheck: { at: new Date().toISOString(), ok: 0, kind: 'simulated',
      detail: 'a tampered payload is refused: signature matched' } });
  assert.equal(s.state, 'ERROR');
  assert.match(s.lastError, /tampered/);
});

test('a secret removed after a good check drops it back to NOT CONFIGURED', async () => {
  // Order matters here. If the passed check were read first, deleting the secret
  // would leave a channel reading CONNECTED with nothing behind it.
  const s = statusOf('website', { env: {}, handshakeAt: '2026-09-25T09:00:00.000Z',
    lastCheck: { at: new Date().toISOString(), ok: 1, kind: 'simulated', detail: 'fine' } });
  assert.equal(s.state, 'NOT CONFIGURED');
});

test('ON and OFF is a separate axis from working or not', async () => {
  const off = statusOf('website', { env: FAKE });
  const on = statusOf('website', { env: { ...FAKE, CHANNEL_MODE_WEBSITE: 'live' } });
  assert.equal(off.live, false);
  assert.equal(on.live, true);
  assert.equal(off.state, on.state, 'switching it on must not change what we KNOW about it');
});

test('everything is OFF unless something explicitly turned it on', async () => {
  for (const s of allStatuses({ env: FAKE })) {
    assert.equal(s.live, false, `${s.channel} must not be live by default`);
    assert.equal(modeOf(s.channel, FAKE), 'off');
  }
});

test('a channel a person types in is not reported as something to go and fix', async () => {
  const s = statusOf('in_person', { env: {} });
  assert.equal(s.state, 'CONFIGURED');
  assert.equal(s.canTest, false);
  assert.match(s.summary, /Nothing to configure/);
});

test('LinkedIn and TikTok name the secret they are waiting for, like any social page', async () => {
  for (const [id, env] of [['linkedin', 'LINKEDIN_CLIENT_SECRET'], ['tiktok', 'TIKTOK_CLIENT_SECRET']]) {
    const s = statusOf(id, { env: {} });
    assert.equal(s.state, 'NOT CONFIGURED');
    assert.match(JSON.stringify(s), new RegExp(env));
    assert.doesNotMatch(s.summary, /whether this is possible/);
  }
});

test('a check that passed long ago is flagged stale without changing the state', async () => {
  const old = new Date(Date.now() - 90 * 86400000).toISOString();
  const s = statusOf('website', { env: FAKE,
    lastCheck: { at: old, ok: 1, kind: 'simulated', detail: 'fine' } });
  assert.equal(s.checkStale, true);
  assert.ok(s.checkAgeDays >= 89);
  assert.equal(s.state, 'CONFIGURED', 'stale is a note, not a different state');
});

// ============================================================= secret safety

test('the panel carries the NAME of every setting and the VALUE of none', async () => {
  const payload = allStatuses({ env: FAKE });
  const text = JSON.stringify(payload);
  for (const [name, value] of Object.entries(FAKE)) {
    assert.ok(text.includes(name), `${name} must be shown by name`);
    assert.equal(text.includes(value), false, `THE VALUE OF ${name} IS IN THE PANEL`);
  }
  assert.equal(text.includes('FAKE-'), false, 'no fake secret value may appear anywhere');
});

test('a check result carries no secret value either', async () => {
  for (const id of channelIds()) {
    const r = runCheck(id, { env: FAKE });
    const text = JSON.stringify(r);
    for (const value of Object.values(FAKE)) {
      assert.equal(text.includes(value), false, `${id}'s check result leaked a secret`);
    }
  }
});

test('the backstop catches a leak that everything else missed', async () => {
  // Proved by breaking it: a payload that really does contain a secret must be
  // refused. Without this test the backstop could be a no-op and look fine.
  assert.equal(assertNoSecretValues({ safe: 'nothing here' }, FAKE), true);
  assert.throws(() => assertNoSecretValues({ oops: FAKE.META_APP_SECRET }, FAKE),
    /REFUSING to send/);
  assert.throws(() => assertNoSecretValues({ nested: { deep: [FAKE.PBX_API_TOKEN] } }, FAKE),
    /PBX_API_TOKEN/);
});

test('every setting the register names is reported, and nothing is invented', async () => {
  for (const id of channelIds()) {
    const def = channelDef(id);
    const names = requiredSettings(id);
    if (def.secretEnv) assert.ok(names.includes(def.secretEnv), `${id} must report ${def.secretEnv}`);
    if (def.handshakeEnv) assert.ok(names.includes(def.handshakeEnv));
    assert.equal(new Set(names).size, names.length, `${id} listed a setting twice`);
  }
});

// ================================================================== checking

test('a check says what it proves AND what it does not', async () => {
  // The line between an honest check and a fake one. Every passing check has to
  // carry its own limit, or somebody reads a green tick as "WhatsApp is live".
  for (const id of channelIds()) {
    const plan = checkPlanFor(id);
    if (plan.kind === 'none') continue;
    assert.ok(plan.proves, `${id} must say what its check proves`);
    assert.ok(plan.doesNotProve, `${id} must say what its check does NOT prove`);
    if (plan.kind !== 'config') {
      assert.match(plan.doesNotProve, /provider/, `${id} must be explicit about the provider`);
    }
  }
});

test('a check cannot pass when the settings it needs are missing', async () => {
  for (const id of channelIds()) {
    if (checkPlanFor(id).kind === 'none') continue;
    const r = runCheck(id, { env: {} });
    assert.equal(r.ok, false, `${id} passed a check with nothing configured`);
  }
});

test('a check never passes on no evidence at all', async () => {
  // A check that ran against nothing reports no problems. Every passing result
  // must carry more than the one step that only says the settings exist.
  for (const id of channelIds()) {
    const r = runCheck(id, { env: FAKE });
    if (r.skipped) continue;
    if (r.ok) assert.ok(r.steps.length > 1, `${id} passed on one step`);
    assert.ok(r.steps.every((s) => typeof s.name === 'string' && s.name.length > 3));
  }
});

test('a channel that cannot be checked is SKIPPED, not passed', async () => {
  // Not ok:true. A manual channel reporting a passing check would be a green
  // tick for something nobody ran.
  for (const id of ['in_person']) {
    const r = runCheck(id, { env: FAKE });
    assert.equal(r.skipped, true);
    assert.equal(r.ok, null, `${id} must not report a pass`);
  }
});

test('every webhook check refuses a tampered payload, and is asserted to', async () => {
  // The negative probe. A verification that accepted everything would pass the
  // positive half of every check in this file.
  for (const id of channelIds()) {
    const def = channelDef(id);
    if (!def.webhookPath) continue;
    const r = runCheck(id, { env: FAKE });
    const names = r.steps.map((s) => s.name);
    assert.ok(names.includes('a tampered payload is refused'),
      `${id} never checks that a bad payload is refused`);
  }
});

test('every handshake check refuses a wrong token, and is asserted to', async () => {
  for (const id of ['facebook', 'messenger', 'instagram', 'whatsapp']) {
    const names = runCheck(id, { env: FAKE }).steps.map((s) => s.name);
    assert.ok(names.includes('a wrong token is refused'), `${id} never checks a wrong token`);
    assert.ok(names.includes('the challenge is echoed back exactly'));
  }
});

test('a Meta channel checks the handshake AND the message path, not one of them', async () => {
  // They are different failures. The handshake is what lets Meta save the
  // subscription; the signature is what lets a message through afterwards.
  const names = runCheck('whatsapp', { env: FAKE }).steps.map((s) => s.name);
  assert.ok(names.includes('the correct token is accepted'));
  assert.ok(names.includes('the signature or secret is accepted'));
  assert.ok(names.includes('the adapter produces a normalised event'));
});

test('a poll channel is checked WITHOUT calling the provider', async () => {
  // The rule: no button in an admin panel reaches out to TeleGroup or Google on
  // its own. So the check is honest about being a configuration check only.
  for (const id of ['phone', 'gmail']) {
    const plan = checkPlanFor(id);
    assert.equal(plan.kind, 'config');
    assert.match(plan.what, /NOT called/);
    assert.match(plan.doesNotProve, /valid|answer/);
  }
});

test('a check stores nothing and sends nothing', async () => {
  // Proved by counting rows before and after. A check that quietly wrote an
  // Inbox item would put a fake applicant in front of Ieva.
  const db = await openDb(':memory:');
  const before = (await db.prepare('SELECT COUNT(*) n FROM inbound').get()).n;
  for (const id of channelIds()) runCheck(id, { env: FAKE });
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM inbound').get()).n, before);
});

test('a broken register does not crash the panel', async () => {
  assert.equal(statusOf('not_a_channel', { env: FAKE }), null);
  assert.equal(runCheck('not_a_channel', { env: FAKE }).ok, false);
});

// ============================================== against a real server process

async function seededDb(dir) {
  const file = path.join(dir, 'crm.db');
  const db = await openDb(file);
  const add = async (email, name, role, password) => await db.prepare(`INSERT INTO crm_users
    (id, email, display_name, password_hash, role, active, session_version, created_at)
    VALUES (?,?,?,?,?,1,0,?)`).run('u' + crypto.randomBytes(4).toString('hex'), email, name,
    hashPassword(password, { ...SCRYPT, N: 1024 }), role, new Date().toISOString());
  await add('admin@novikontas.org', 'An Admin', 'admin', 'a-long-enough-admin-password');
  await add('user@novikontas.org', 'A User', 'user', 'a-long-enough-user-password');
  return file;
}

function startServer(env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')],
      { env: { ...process.env, PORT: '0', CRM_INSECURE_COOKIE: '1', CRM_PUBLIC: '',
        DATASET: 'empty', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const done = (fn, arg) => { clearTimeout(timer); fn(arg); };
    const timer = setTimeout(() => { child.kill(); reject(new Error('never started: ' + out)); }, 15000);
    const look = (d) => {
      out += d;
      if (/REFUSING TO START/.test(out)) { child.kill(); return done(reject, new Error(out)); }
      const m = out.match(/http:\/\/localhost:(\d+)/);
      if (m) done(resolve, { child, port: Number(m[1]) });
    };
    child.stdout.on('data', look);
    child.stderr.on('data', look);
    child.on('exit', () => done(reject, new Error('exited: ' + out)));
  });
}

function request(port, method, p, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, method, path: p,
      headers: { ...(payload ? { 'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload) } : {}), ...headers } }, (res) => {
      let text = '';
      res.on('data', (d) => { text += d; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(text); } catch {}
        resolve({ status: res.statusCode, text, json,
          cookie: [].concat(res.headers['set-cookie'] || []).join('; ').split(';')[0] });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// Google sign-in only since 28.09.2026, so the tests hold the session a Google sign-in
// would have issued for the seeded account. The server still checks it against crm_users.
const SEEDED_ROLE = { 'admin@novikontas.org': 'admin', 'user@novikontas.org': 'user' };
async function signedIn(port, email) {
  const token = issueSession({ email, role: SEEDED_ROLE[email], sessionVersion: 0, authMethod: 'google' }, SECRET);
  const me = await request(port, 'GET', '/api/auth/me', { headers: { cookie: `crm_session=${token}` } });
  assert.equal(me.json && me.json.user && me.json.user.email, email, 'the session was not accepted');
  return { cookie: `crm_session=${token}` };
}

async function withServer(extraEnv = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-admin-'));
  const file = await seededDb(dir);
  return startServer({ CRM_DB: file, CRM_AUTH: '1', CRM_SESSION_SECRET: SECRET,
    ...FAKE, ...extraEnv }).then((s) => ({ ...s, dir }));
}

// Killing the child is asynchronous, and Windows refuses to delete a directory
// while the server still holds the database file open. Deleting it eagerly made
// eleven tests fail in t.after with EPERM while every assertion in them passed -
// a cleanup fault reported as a product fault. Temp directories are cheap.
function cleanup(s) {
  try { s.child.kill(); } catch {}
  try { fs.rmSync(s.dir, { recursive: true, force: true }); } catch {}
}

test('a signed-in ADMIN can see the channels', async (t) => {
  const s = await withServer();
  t.after(() => cleanup(s));
  const me = await signedIn(s.port, 'admin@novikontas.org');
  const r = await request(s.port, 'GET', '/api/admin/channels', { headers: { cookie: me.cookie } });
  assert.equal(r.status, 200);
  assert.equal(r.json.channels.length, channelIds().length);
  assert.equal(r.json.identityIsProved, true);
});

test('a signed-in ORDINARY USER cannot, however they ask', async (t) => {
  const s = await withServer();
  t.after(() => cleanup(s));
  const me = await signedIn(s.port, 'user@novikontas.org');
  for (const [method, p] of [['GET', '/api/admin/channels'], ['GET', '/api/admin/channels/whatsapp'],
    ['POST', '/api/admin/channels/whatsapp/check'], ['POST', '/api/admin/channels/whatsapp/mode']]) {
    const r = await request(s.port, method, p,
      { headers: { cookie: me.cookie, 'x-acting-as': 'Ritvars' },
        ...(method === 'POST' ? { body: { mode: 'live' } } : {}) });
    assert.equal(r.status, 403, `${method} ${p} was allowed for an ordinary user`);
  }
});

test('the real panel carries no secret value over the wire', async (t) => {
  // Not the module this time - the actual HTTP response, which is the thing that
  // would leave the building.
  const s = await withServer();
  t.after(() => cleanup(s));
  const me = await signedIn(s.port, 'admin@novikontas.org');
  const list = await request(s.port, 'GET', '/api/admin/channels', { headers: { cookie: me.cookie } });
  const one = await request(s.port, 'GET', '/api/admin/channels/whatsapp', { headers: { cookie: me.cookie } });
  const check = await request(s.port, 'POST', '/api/admin/channels/whatsapp/check', { headers: { cookie: me.cookie } });
  for (const r of [list, one, check]) {
    assert.equal(r.text.includes('FAKE-'), false, 'a secret value was sent to the browser');
    assert.equal(r.text.includes(SECRET), false, 'the session secret was sent to the browser');
  }
  assert.match(list.text, /META_APP_SECRET/, 'but the NAME must be there, or it is not useful');
});

test('a check is recorded, and what it found is what the panel then shows', async (t) => {
  const s = await withServer();
  t.after(() => cleanup(s));
  const me = await signedIn(s.port, 'admin@novikontas.org');
  const before = await request(s.port, 'GET', '/api/admin/channels/whatsapp', { headers: { cookie: me.cookie } });
  assert.equal(before.json.lastCheckAt, null);

  const check = await request(s.port, 'POST', '/api/admin/channels/whatsapp/check', { headers: { cookie: me.cookie } });
  assert.equal(check.status, 200);
  assert.equal(check.json.ok, true);

  const after = await request(s.port, 'GET', '/api/admin/channels/whatsapp', { headers: { cookie: me.cookie } });
  assert.ok(after.json.lastCheckAt, 'the check must be recorded, not just answered');
  assert.equal(after.json.lastCheckOk, true);
  assert.equal(after.json.lastCheckBy, 'An Admin', 'and it must say who ran it');
  assert.equal(after.json.state, 'CONFIGURED', 'a passing check is still not a connection');
});

test('a channel cannot be switched on before a check has passed', async (t) => {
  const s = await withServer();
  t.after(() => cleanup(s));
  const me = await signedIn(s.port, 'admin@novikontas.org');
  const early = await request(s.port, 'POST', '/api/admin/channels/whatsapp/mode',
    { headers: { cookie: me.cookie }, body: { mode: 'live' } });
  assert.equal(early.status, 409);
  assert.match(early.json.error, /check/);

  await request(s.port, 'POST', '/api/admin/channels/whatsapp/check', { headers: { cookie: me.cookie } });
  const now = await request(s.port, 'POST', '/api/admin/channels/whatsapp/mode',
    { headers: { cookie: me.cookie }, body: { mode: 'live' } });
  assert.equal(now.status, 200);
  assert.equal(now.json.live, true);
});

test('a channel with a setting missing cannot be switched on at all', async (t) => {
  const s = await withServer({ WEBSITE_FORM_SECRET: '' });
  t.after(() => cleanup(s));
  const me = await signedIn(s.port, 'admin@novikontas.org');
  const r = await request(s.port, 'POST', '/api/admin/channels/website/mode',
    { headers: { cookie: me.cookie }, body: { mode: 'live' } });
  assert.equal(r.status, 409);
  assert.match(r.json.error, /WEBSITE_FORM_SECRET/);
});

test('nothing is live until somebody makes it live', async (t) => {
  const s = await withServer();
  t.after(() => cleanup(s));
  const me = await signedIn(s.port, 'admin@novikontas.org');
  const r = await request(s.port, 'GET', '/api/admin/channels', { headers: { cookie: me.cookie } });
  assert.equal(r.json.channels.filter((c) => c.live).length, 0);
});

test('a switch survives a restart, because it is stored and not just remembered', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-admin-'));
  const file = await seededDb(dir);
  const running = [];
  // One cleanup, registered once, that cannot throw. Deleting the directory
  // before the servers were killed left a server alive and hung the whole runner.
  t.after(() => {
    for (const c of running) { try { c.kill(); } catch {} }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });
  const env = { CRM_DB: file, CRM_AUTH: '1', CRM_SESSION_SECRET: SECRET, ...FAKE };

  const first = await startServer(env);
  running.push(first.child);
  const me = await signedIn(first.port, 'admin@novikontas.org');
  await request(first.port, 'POST', '/api/admin/channels/website/check', { headers: { cookie: me.cookie } });
  const on = await request(first.port, 'POST', '/api/admin/channels/website/mode',
    { headers: { cookie: me.cookie }, body: { mode: 'test' } });
  assert.equal(on.status, 200);
  first.child.kill();
  await new Promise((r) => setTimeout(r, 300));

  const second = await startServer(env);
  running.push(second.child);
  const me2 = await signedIn(second.port, 'admin@novikontas.org');
  const r = await request(second.port, 'GET', '/api/admin/channels/website', { headers: { cookie: me2.cookie } });
  assert.equal(r.json.mode, 'test', 'the switch was forgotten on restart');
});

test('a demo build does NOT make channels look connected', async (t) => {
  // The trap this exists for: the demo builder writes through the same intake
  // table a real provider writes to. Counting those rows would show every
  // channel on the testing copy as CONNECTED, to Aigars, on day one.
  const s = await withServer({ DATASET: 'demo' });
  t.after(() => cleanup(s));
  const me = await signedIn(s.port, 'admin@novikontas.org');
  await request(s.port, 'POST', '/api/dataset', { headers: { cookie: me.cookie }, body: { kind: 'demo' } });
  const r = await request(s.port, 'GET', '/api/admin/channels', { headers: { cookie: me.cookie } });
  const connected = r.json.channels.filter((c) => c.state === 'CONNECTED');
  assert.deepEqual(connected.map((c) => c.channel), [],
    'a demo build must never read as a real connection');
});

test('a simulated event does not make a channel look connected either', async (t) => {
  const s = await withServer();
  t.after(() => cleanup(s));
  const me = await signedIn(s.port, 'admin@novikontas.org');
  const sim = await request(s.port, 'POST', '/api/inbound/website/simulate', { headers: { cookie: me.cookie }, body: {} });
  assert.equal(sim.status, 200, sim.text);
  const r = await request(s.port, 'GET', '/api/admin/channels/website', { headers: { cookie: me.cookie } });
  assert.notEqual(r.json.state, 'CONNECTED');
  assert.equal(r.json.events, 0, 'a simulated event is not a provider event');
});

test('an unknown channel is a 404, not a crash or an empty panel', async (t) => {
  const s = await withServer();
  t.after(() => cleanup(s));
  const me = await signedIn(s.port, 'admin@novikontas.org');
  const r = await request(s.port, 'GET', '/api/admin/channels/telepathy', { headers: { cookie: me.cookie } });
  assert.equal(r.status, 404);
});

test('a poll channel check confirms a HANDLER exists, not just a declaration', async () => {
  // "Declared" only means the register names a path, and the register is a
  // document. The poll routes are Vercel functions under api/, not routes in
  // src/server.js, so a check that stopped at the declaration would show a green
  // tick beside a path nothing serves.
  for (const id of ['phone', 'gmail']) {
    const names = runCheck(id, { env: FAKE }).steps.map((s) => s.name);
    assert.ok(names.includes('a poll route is declared'), `${id} must state the route`);
    assert.ok(names.includes('a handler file exists for it'),
      `${id} must check something actually serves it`);
  }
});

test('the handler check names a real file that is really there', async () => {
  // Driven, not assumed: the note is the path it looked at, and that path must
  // resolve from the repository root.
  const step = runCheck('phone', { env: FAKE }).steps
    .find((s) => s.name === 'a handler file exists for it');
  assert.equal(step.ok, true);
  assert.ok(fs.existsSync(path.join(ROOT, step.note)), `${step.note} does not exist`);
});
