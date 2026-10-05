// The admin Channels panel: what is wired, what is missing, what is broken.
//
// This sits ON TOP of `inbound.js`. It does not replace `channelStatus()`, which
// the inbound observability view and five tests still use, and it does not touch
// a single adapter. It reads the same register and adds the two things an admin
// needs and that view does not give: a four-state model where CONFIGURED and
// CONNECTED are different things, and a record of checks that really ran.
//
// THE RULE THIS FILE EXISTS TO ENFORCE
//
//   Having a secret set proves somebody typed a secret.
//   It does not prove Meta has ever heard of us.
//
// So CONFIGURED never becomes CONNECTED on its own, and it does not become
// CONNECTED because OUR OWN check passed either - see `runCheck` below, which is
// careful to say what it proves and what it does not.
//
// ON/OFF is a separate axis, read from the channel mode. A channel can be
// CONNECTED and OFF, which is the correct state for everything here right now.
//
// NO SECRET VALUE LEAVES THIS FILE. Secrets are read - a signature cannot be
// computed without one - and only ever the NAME and the word present or missing
// come out. `assertNoSecretValues` is the backstop, and it is called on the
// payload before the server sends it.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { channelDef, channelIds, handshake, verifyRequest, parseInboundBody } from './inbound.js';
import { adapt, toIntake, hasAdapter } from './adapters.js';
import { fixtureFor } from './fixtures.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export const STATES = ['NOT CONFIGURED', 'CONFIGURED', 'CONNECTED', 'ERROR'];

// A self-test older than this is reported as stale. It is not a different state:
// the check did pass, it was just a while ago and the world may have moved.
export const STALE_DAYS = 30;

// ---------------------------------------------------------------- settings --

/** Every environment variable this channel needs before it could work, by NAME.
 *  Read out of the existing register, never listed by hand here. */
export function requiredSettings(id) {
  const def = channelDef(id);
  if (!def) return [];
  const names = [];
  for (const key of ['secretEnv', 'handshakeEnv', 'verifyTokenEnv']) {
    const name = def[key];
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

export const modeOf = (id, env = process.env) =>
  String(env[`CHANNEL_MODE_${String(id).toUpperCase()}`] || 'off').toLowerCase();

const isManual = (def) => def.direction === 'manual' && def.readiness === 'manual_only';
const isUnconfirmed = (def) => def.readiness === 'capability_unconfirmed';

// ------------------------------------------------------------ what we know --

/**
 * One channel as the admin panel sees it.
 *
 * Everything that could be a guess is passed in instead of inferred:
 *   `lastCheck`   newest row from channel_check, or null
 *   `handshakeAt` when a PROVIDER last verified the URL against us (channel_handshake)
 *   `counts`      real event counts from the events table
 */
export function statusOf(id, { env = process.env, lastCheck = null, handshakeAt = null,
  handshakeHow = null, counts = {}, now = Date.now() } = {}) {
  const def = channelDef(id);
  if (!def) return null;

  const needs = requiredSettings(id);
  const settings = needs.map((name) => ({ name, present: Boolean(env[name]) }));
  const missing = settings.filter((s) => !s.present).map((s) => s.name);
  const allPresent = needs.length === 0 ? true : missing.length === 0;

  const mode = modeOf(id, env);
  const live = mode === 'live';                       // ON/OFF, and nothing else sets it

  // Evidence the PROVIDER has actually reached us. This is the only thing that
  // can make a channel CONNECTED. Our own check cannot, however well it goes.
  const providerHandshake = Boolean(handshakeAt);
  const providerEvent = Boolean(counts.lastEventAt);
  const connected = providerHandshake || providerEvent;

  const selfTestOk = lastCheck ? lastCheck.ok === 1 : null;
  const checkAgeDays = lastCheck && lastCheck.at
    ? Math.floor((now - Date.parse(lastCheck.at)) / 86400000) : null;

  let state;
  if (isUnconfirmed(def))            state = 'NOT CONFIGURED';
  else if (isManual(def))            state = 'CONFIGURED';   // nothing to configure; works today
  else if (!allPresent)              state = 'NOT CONFIGURED';
  else if (selfTestOk === false)     state = 'ERROR';
  else if (connected)                state = 'CONNECTED';
  else                               state = 'CONFIGURED';

  const plan = checkPlanFor(id);

  return {
    channel: id,
    label: def.label,
    mechanism: def.mechanism,
    direction: def.direction,

    state,
    live,                                       // ON/OFF, deliberately separate
    mode,

    endpoint: def.webhookPath || def.pollPath || null,

    // NAMES ONLY, and present or missing. Never a value.
    settings,
    missingSettings: missing,
    allSettingsPresent: allPresent,

    // what a rule sets aside on this channel, short labels (Q27, 05.10.2026)
    filters: def.filters || [],

    // what a provider has actually done
    providerHandshakeAt: handshakeAt,
    providerHandshakeHow: handshakeHow,
    lastEventAt: counts.lastEventAt || null,
    lastSuccessAt: counts.lastSuccessAt || null,
    events: counts.events || 0,
    filtered: counts.filtered || 0,

    // what OUR OWN check found, kept clearly apart from the above
    lastCheckAt: lastCheck ? lastCheck.at : null,
    lastCheckOk: lastCheck ? lastCheck.ok === 1 : null,
    lastCheckKind: lastCheck ? lastCheck.kind : null,
    lastCheckBy: lastCheck ? lastCheck.by : null,
    lastError: lastCheck && lastCheck.ok === 0 ? lastCheck.detail : null,
    lastCheckDetail: lastCheck ? lastCheck.detail : null,
    checkAgeDays,
    checkStale: checkAgeDays != null && checkAgeDays > STALE_DAYS,

    // what the Test button would do, in words, so it cannot overstate itself
    canTest: plan.kind !== 'none',
    testKind: plan.kind,
    testWhat: plan.what,
    testProves: plan.proves,
    testDoesNotProve: plan.doesNotProve,

    // why it is stuck, if it is
    ownerPerson: def.ownerPerson || null,
    ownerAction: def.ownerAction || null,
    externalBlocker: def.externalBlocker || null,
    blockerKind: def.blockerKind || null,

    // WHETHER THE PRODUCT HAS THIS CHANNEL AT ALL (02.10.2026). readiness says whether
    // OUR SIDE is technically ready; it said yes for Google Form and Open Day, which are
    // dropped and parked. A screen that reads readiness asks for work nobody intends to
    // do, and names people as holding it. lifecycle carries the decision instead.
    lifecycle: def.lifecycle || 'active',
    lifecycleWhy: def.lifecycleWhy || null,
    lifecycleDecidedOn: def.lifecycleDecidedOn || null,
    lifecycleDecidedBy: def.lifecycleDecidedBy || null,

    // THE RECONCILED RECORD (02.10.2026, Session 3): what was last SEEN about access,
    // deployment, production configuration and live verification, each with its date
    // and source. A local checkout cannot read production, so this is what it shows.
    record: def.record || null,

    // the one sentence a human should read first
    summary: summarise({ state, live, def, missing, connected, selfTestOk, plan }),
  };
}

function summarise({ state, live, def, missing, connected, selfTestOk, plan }) {
  if (isUnconfirmed(def)) return 'Nobody has established whether this is possible at all.';
  if (isManual(def)) return 'Nothing to configure. A member of staff types it in, and that works today.';
  if (missing.length) return `Not set up yet: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} missing.`;
  if (selfTestOk === false) return 'The last check failed. See the error below.';
  if (connected && live) return 'Connected and switched on.';
  if (connected) return 'The provider has reached us, but the channel is switched OFF.';
  if (selfTestOk === true) return 'Our side is configured and passed its own check. '
    + 'The provider has never reached us, so this is not a live connection yet.';
  if (plan.kind === 'none') return 'Configured. There is nothing here that can be checked automatically.';
  return 'Configured, never checked. Run the check.';
}

export function allStatuses({ env = process.env, checks = {}, handshakes = {},
  countsByChannel = {}, now = Date.now() } = {}) {
  return channelIds().map((id) => statusOf(id, {
    env,
    lastCheck: checks[id] || null,
    handshakeAt: (handshakes[id] || {}).verified_at || null,
    handshakeHow: (handshakes[id] || {}).how || null,
    counts: countsByChannel[id] || {},
    now,
  })).filter(Boolean);
}

// --------------------------------------------------------- what a check is --
//
// Four honest kinds, chosen from how the channel works rather than from a list:
//
//   handshake  we run the provider's own verification exchange against our own
//              code, in process. Proves the token is set and our verification
//              accepts the right one AND refuses a wrong one.
//   simulated  we push a provider-shaped payload through the real verify, parse
//              and adapt path, with a real signature. Proves the whole inbound
//              path works, including that a tampered payload is refused.
//   config     the settings exist and the poller is wired. Nothing more can be
//              said without calling the provider, which we deliberately do not.
//   none       nothing can be checked without a person doing something.
//
// NOTHING here goes out to a network. No provider is contacted, no candidate is
// written to, nothing is stored in the Inbox.

export function checkPlanFor(id) {
  const def = channelDef(id);
  if (!def) return { kind: 'none', what: 'unknown channel', proves: null, doesNotProve: null };

  if (isUnconfirmed(def)) return { kind: 'none',
    what: 'Nothing to check. It is not known whether this channel can send us anything at all.',
    proves: null, doesNotProve: null };

  if (isManual(def)) return { kind: 'none',
    what: 'Nothing to check. Somebody types this in, and Intake already accepts it.',
    proves: null, doesNotProve: null };

  if (def.direction === 'inbound_poll') return { kind: 'config',
    what: 'Check that the settings exist and the poll route is wired. '
        + 'The provider is deliberately NOT called.',
    proves: 'the credential is set and we know where to poll',
    doesNotProve: 'that the credential is valid, or that the provider will answer us' };

  if (def.handshake) return { kind: 'handshake',
    what: 'Run the provider verification exchange against our own code, in process: '
        + 'the correct token must be accepted and a wrong one must be refused.',
    proves: 'the verify token is set, our verification really verifies, and we answer the way the provider requires',
    doesNotProve: 'that the provider has been pointed at us, or can reach us over the internet' };

  return { kind: 'simulated',
    what: 'Push a provider-shaped payload through the real verify, parse and adapt path, '
        + 'signed with the real secret. Nothing is stored and nothing is sent.',
    proves: 'the signature check, the body parsing and the adapter all work, and a tampered payload is refused',
    doesNotProve: 'that the provider has been pointed at us, or can reach us over the internet' };
}

const step = (name, ok, note) => ({ name, ok, note });

/**
 * Run the check. Returns a result; it does NOT write to the database - the
 * caller records it, so this stays testable with no database anywhere near it.
 *
 * `ok` false is a real failure of OUR side. It is never invented, and there is
 * no code path that returns ok:true without a step having actually run.
 */
export function runCheck(id, { env = process.env } = {}) {
  const def = channelDef(id);
  const plan = checkPlanFor(id);
  if (!def) return { ok: false, kind: 'none', detail: 'unknown channel', steps: [] };
  if (plan.kind === 'none') {
    return { ok: null, skipped: true, kind: 'none', detail: plan.what, steps: [],
      proves: null, doesNotProve: null };
  }

  const needs = requiredSettings(id);
  const missing = needs.filter((n) => !env[n]);
  if (missing.length) {
    return { ok: false, kind: plan.kind, steps: [step('settings present', false, missing.join(', ') + ' missing')],
      detail: `Cannot check: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not set.`,
      proves: null, doesNotProve: plan.doesNotProve };
  }

  const steps = [step('settings present', true, needs.join(', '))];

  // Every group that applies, not just one. A Meta channel has BOTH a handshake
  // and a signed payload path, and checking only the handshake would report a
  // pass while the thing that actually receives messages was broken.
  try {
    if (plan.kind === 'config') steps.push(...checkConfig(id, def, env));
    if (def.handshake) steps.push(...checkHandshake(id, def, env));
    if (def.webhookPath && hasAdapter(id) && fixtureFor(id)) steps.push(...checkSimulated(id, def, env));
  } catch (e) {
    steps.push(step('ran without throwing', false, String(e && e.message || e)));
  }
  if (steps.length === 1) steps.push(step('something was actually checked', false,
    'nothing beyond the settings could be checked, so this is not a pass'));

  const ok = steps.every((s) => s.ok);
  return {
    ok, kind: plan.kind, steps,
    detail: ok ? summariseSteps(steps) : firstFailure(steps),
    proves: ok ? plan.proves : null,
    doesNotProve: plan.doesNotProve,
  };
}

const summariseSteps = (steps) => steps.map((s) => s.name).join('; ');
const firstFailure = (steps) => {
  const bad = steps.find((s) => !s.ok);
  return bad ? `${bad.name}: ${bad.note}` : 'failed';
};

// A poll channel. We know where we would poll and that the credential is set.
// We do NOT call TeleGroup or Google: an outbound call to a live provider is not
// something a button in an admin panel should do on its own.
function checkConfig(id, def, env) {
  const out = [];
  out.push(step('a poll route is declared', Boolean(def.pollPath), def.pollPath || 'none declared'));

  // AND A HANDLER REALLY EXISTS FOR IT. "Declared" only means the register names
  // a path, and the register is a document. The poll routes are Vercel functions
  // under api/, NOT routes in src/server.js, so the local prototype answers 404
  // on them - a check that stopped at the declaration would show a green tick
  // beside a path nothing serves.
  if (def.pollPath) {
    const handler = path.join(ROOT, def.pollPath.replace(/^\//, '') + '.js');
    const exists = fs.existsSync(handler);
    out.push(step('a handler file exists for it', exists,
      exists ? path.relative(ROOT, handler).replace(/\\/g, '/')
             : `nothing at ${path.relative(ROOT, handler).replace(/\\/g, '/')}`));
  }

  if (id === 'gmail') {
    // The credential is a JSON blob. Whether it PARSES is checkable; what is in
    // it is not printed.
    const raw = env.GMAIL_SERVICE_ACCOUNT_JSON;
    let parsed = null;
    try { parsed = JSON.parse(String(raw)); } catch { parsed = null; }
    out.push(step('the service account credential is valid JSON', Boolean(parsed),
      parsed ? 'parsed, with the fields ' + Object.keys(parsed).filter(
        (k) => !/key|secret|token/i.test(k)).join(', ') : 'it does not parse as JSON'));
    if (parsed) out.push(step('it carries a client_email',
      Boolean(parsed.client_email), parsed.client_email ? 'present' : 'missing'));
  }
  out.push(step('an adapter exists', hasAdapter(id), hasAdapter(id) ? id : 'none'));
  return out;
}

// The provider's own verification exchange, run against our own code in process.
// It does NOT go through the HTTP route, deliberately: that route writes to
// channel_handshake, and a row there means "a provider verified us". Our own
// check must never be able to forge that.
function checkHandshake(id, def, env) {
  const out = [];
  const path = def.webhookPath || `/api/inbound/${id}`;
  const token = env[def.handshakeEnv || def.verifyTokenEnv || ''] || '';
  const challenge = 'check-' + crypto.randomBytes(6).toString('hex');

  const good = new URL('https://check.invalid' + path
    + `?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(token)}&hub.challenge=${challenge}`);
  const okRes = handshake(id, good, env);
  out.push(step('the correct token is accepted', Boolean(okRes.ok), okRes.how));
  if (okRes.ok && def.handshakeEnv) {
    out.push(step('the challenge is echoed back exactly',
      String(okRes.body) === challenge, String(okRes.body) === challenge ? 'echoed' : 'the answer was not the challenge'));
  }

  // The negative probe is the half that makes this mean anything. A verification
  // that accepts everything would pass the test above.
  if (def.handshakeEnv) {
    const bad = new URL('https://check.invalid' + path
      + `?hub.mode=subscribe&hub.verify_token=definitely-not-the-token&hub.challenge=${challenge}`);
    const badRes = handshake(id, bad, env);
    out.push(step('a wrong token is refused', badRes.ok === false, badRes.how));
  }
  return out;
}

// A provider-shaped payload through the real path: verify, parse, adapt. Signed
// with the real secret, because an unsigned payload would only prove the
// signature check can be skipped.
function checkSimulated(id, def, env) {
  const out = [];
  const raw = fixtureFor(id);
  out.push(step('a provider-shaped payload exists', Boolean(raw), raw ? 'fixture present' : 'no fixture'));
  if (!raw) return out;
  out.push(step('an adapter exists', hasAdapter(id), hasAdapter(id) ? id : 'none'));
  if (!hasAdapter(id)) return out;

  const secret = env[def.secretEnv] || '';
  const form = id === 'mailchimp';
  const body = form
    ? Object.entries(raw).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
    : JSON.stringify(raw);
  const contentType = form ? 'application/x-www-form-urlencoded' : 'application/json';

  const { req, url, tamper } = signedRequest(def, id, secret, body);

  const good = verifyRequest(id, req, { secret: secretFor(def, secret), rawBody: body, url });
  out.push(step('the signature or secret is accepted', Boolean(good.ok), good.how));

  const badRes = verifyRequest(id, tamper.req, { secret: secretFor(def, secret), rawBody: tamper.body, url: tamper.url });
  out.push(step('a tampered payload is refused', badRes.ok === false, badRes.how));

  // parseInboundBody answers { ok, payload, as } - the wrapper is NOT the payload,
  // and handing the wrapper to an adapter fails on every channel at once.
  const parsed = parseInboundBody(id, contentType, body);
  out.push(step('the body parses', Boolean(parsed && parsed.ok),
    parsed && parsed.ok ? parsed.as : (parsed && parsed.how) || 'it did not parse'));
  if (!parsed || !parsed.ok) return out;

  const ev = adapt(id, parsed.payload);
  const ok = Boolean(ev && ev.externalEventId && ev.channel === id);
  out.push(step('the adapter produces a normalised event', ok,
    ok ? `event id and channel present` : 'the adapter returned nothing usable'));
  if (!ok) return out;

  const intake = toIntake(ev);
  out.push(step('it can be turned into an Inbox item', Boolean(intake),
    intake ? 'nothing was stored - this was a check' : 'it could not'));
  return out;
}

// The agent channel's secret is a TABLE of partner tokens, not one string.
function secretFor(def, raw) {
  if (def.auth !== 'per_partner_token') return raw;
  try { return JSON.parse(String(raw)); } catch { return {}; }
}

function signedRequest(def, id, secret, body) {
  const url = new URL('https://check.invalid' + (def.webhookPath || `/api/inbound/${id}`));
  const badUrl = new URL(url.href);
  const headers = {};
  const badHeaders = {};

  if (def.auth === 'meta_app_secret_signature') {
    const sig = 'sha256=' + crypto.createHmac('sha256', String(secret)).update(body).digest('hex');
    headers['x-hub-signature-256'] = sig;
    badHeaders['x-hub-signature-256'] = sig;          // right signature, WRONG body
  } else if (def.auth === 'linkedin_signature') {
    const sig = crypto.createHmac('sha256', String(secret)).update('hmacsha256=' + body).digest('hex');
    headers['x-li-signature'] = sig;
    badHeaders['x-li-signature'] = sig;               // right signature, WRONG body
  } else if (def.auth === 'tiktok_signature') {
    const t = String(Math.floor(Date.now() / 1000));
    const sig = crypto.createHmac('sha256', String(secret)).update(t + '.' + body).digest('hex');
    headers['tiktok-signature'] = `t=${t},s=${sig}`;
    badHeaders['tiktok-signature'] = `t=${t},s=${sig}`; // right signature, WRONG body
  } else if (def.auth === 'shared_secret_header') {
    headers['x-crm-secret'] = String(secret);
    badHeaders['x-crm-secret'] = String(secret).split('').reverse().join('');
  } else if (def.auth === 'secret_in_url') {
    url.searchParams.set('s', String(secret));
    badUrl.searchParams.set('s', String(secret) + 'x');
  } else if (def.auth === 'per_partner_token') {
    const table = secretFor(def, secret);
    const first = Object.keys(table)[0] || '';
    headers['x-partner-token'] = first;
    badHeaders['x-partner-token'] = 'not-a-partner';
  }

  return {
    req: { headers }, url,
    tamper: { req: { headers: badHeaders }, url: badUrl,
      body: ['meta_app_secret_signature', 'linkedin_signature', 'tiktok_signature'].includes(def.auth) ? body + ' ' : body },
  };
}

// ------------------------------------------------------------- the backstop --

/** Called on the payload before the server sends it. If a secret VALUE ever
 *  reached the panel, this throws rather than publishing it. */
export function assertNoSecretValues(payload, env = process.env) {
  const text = JSON.stringify(payload ?? null);
  const names = new Set(['CRM_SESSION_SECRET', 'CRM_ACCESS_PASSWORD', 'CRON_SECRET']);
  for (const id of channelIds()) for (const n of requiredSettings(id)) names.add(n);
  for (const name of names) {
    const value = env[name];
    if (value && String(value).length >= 6 && text.includes(String(value))) {
      throw new Error(`REFUSING to send the channels panel: it contains the VALUE of ${name}`);
    }
  }
  return true;
}
