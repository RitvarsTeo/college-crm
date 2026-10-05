// One inbound contract, for every channel.
//
// A provider payload is provider-shaped and stays that way: it is kept raw, for
// the inspector, and it is never allowed to become the CRM's data model. What the
// CRM works with is the normalised event below, and every channel produces one.
//
//   provider event -> adapter -> normalised event -> filter -> CAR -> a person
//
// The point of doing this before any real connection exists is that connecting
// Instagram later should be: set a secret, set a URL at Meta, verify, switch the
// mode to live. It should not be a redesign.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const CHANNELS = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'channels.json'), 'utf8'));

export const channelIds = () => Object.keys(CHANNELS.channels);
export const channelDef = (id) => CHANNELS.channels[id] || null;

// An INTEGRATION is not a channel. A channel receives a message from a person and
// needs an adapter; an integration is a system we PULL from on a schedule, so
// nothing is delivered to us and there is no adapter to write. SIS was briefly put
// in channels and the contract test caught it in one run. They are listed together
// on the Channels screen, because that is where somebody looks to see whether
// anything is coming in, and modelled apart everywhere else.
export const integrationIds = () => Object.keys(CHANNELS.integrations || {});
export const integrationDef = (id) => (CHANNELS.integrations || {})[id] || null;

// ---------------------------------------------------------------- the shape --
// Every field a normalised inbound event may carry. Anything a provider sends
// that is not in here stays in `raw` and never reaches the CRM's own tables.
export const INBOUND_SHAPE = {
  externalEventId: 'string, required. The provider id we deduplicate on.',
  channel: 'string, required. One of config/channels.json.',
  source: 'string. Where the traffic came from, if the provider says. NOT the channel.',
  receivedAt: 'ISO instant, required.',
  externalPersonId: 'string. The provider account id, where one exists.',
  externalContactId: 'string. A second provider id, where the provider has two.',
  senderName: 'string.',
  senderEmail: 'string.',
  senderPhone: 'string.',
  senderHandle: 'string. The visible @name, when there is no email or phone.',
  messageSubject: 'string.',
  messageBody: 'string. TEMPORARY. Held only until somebody qualifies or archives.',
  extracted: 'object. name, email, phone, programme, intent - what the machine read.',
  attribution: 'object. utm_source, utm_medium, utm_campaign, and similar.',
  consent: 'object. admissions and marketing, where the channel carries them.',
  raw: 'object. The provider payload, untouched.',
  adapterVersion: 'string. So an old row can be read back correctly later.',
};

const REQUIRED = ['externalEventId', 'channel', 'receivedAt'];

export class BadInbound extends Error {
  constructor(message, detail) { super(message); this.detail = detail; }
}

export function validateInbound(ev) {
  const errors = [];
  for (const f of REQUIRED) if (!ev || !ev[f]) errors.push(`${f} is required`);
  if (ev && ev.channel && !channelDef(ev.channel)) errors.push(`unknown channel: ${ev.channel}`);
  if (ev && ev.receivedAt && Number.isNaN(Date.parse(ev.receivedAt))) errors.push('receivedAt is not a time');
  return { ok: errors.length === 0, errors };
}

// The one place a normalised event is built, so every adapter produces the same
// thing whatever shape it started from.
export function makeInbound(channel, parts) {
  const ev = {
    externalEventId: null, channel, source: null, receivedAt: null,
    externalPersonId: null, externalContactId: null,
    senderName: null, senderEmail: null, senderPhone: null, senderHandle: null,
    messageSubject: null, messageBody: null,
    extracted: {}, attribution: {}, consent: {}, raw: {},
    adapterVersion: '1',
    ...parts,
  };
  const check = validateInbound(ev);
  if (!check.ok) throw new BadInbound('this event cannot be read', check.errors);
  return ev;
}

// ------------------------------------------------------------------ safety --
//
// Signature verification is a real interface, not a claim. Where a provider signs
// and we hold the secret, it is checked. Where we do not yet hold the secret, the
// adapter says so out loud instead of pretending the check happened.

export const VERIFY = {
  none: () => ({ ok: true, how: 'no verification: this channel carries no signature' }),

  // A secret we generate and both sides hold. Compared in constant time.
  // Tilda (01.10.2026) can send an "API key" as a header or as a form field, so the same secret
  // may also arrive as the form field crm_secret. The server removes that field before anything
  // is stored.
  shared_secret_header: (req, secret, rawBody) => {
    if (!secret) return { ok: false, how: 'no secret configured', missingSecret: true };
    let got = String(req.headers['x-crm-secret'] || '');
    if (!got && rawBody && !String(rawBody).trimStart().startsWith('{')) {
      try { got = new URLSearchParams(String(rawBody)).get('crm_secret') || ''; } catch { got = ''; }
    }
    const a = Buffer.from(got);
    const b = Buffer.from(String(secret));
    const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
    return { ok, how: ok ? 'shared secret matched' : 'shared secret did not match' };
  },

  // Meta signs the raw body with the app secret as sha256.
  meta_app_secret_signature: (req, secret, rawBody) => {
    if (!secret) return { ok: false, how: 'no app secret configured', missingSecret: true };
    const header = String(req.headers['x-hub-signature-256'] || '');
    const expect = 'sha256=' + crypto.createHmac('sha256', String(secret)).update(rawBody || '').digest('hex');
    const a = Buffer.from(header);
    const b = Buffer.from(expect);
    const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
    return { ok, how: ok ? 'signature matched' : 'signature did not match' };
  },

  // LinkedIn, from its webhook documentation (checked 27.09.2026): X-LI-Signature is the
  // lowercase hex HMAC-SHA256 of the literal "hmacsha256=" followed by the RAW body, keyed
  // with the app's client secret. The header carries only the digest.
  linkedin_signature: (req, secret, rawBody) => {
    if (!secret) return { ok: false, how: 'no LinkedIn client secret configured', missingSecret: true };
    const header = String(req.headers['x-li-signature'] || '');
    const expect = crypto.createHmac('sha256', String(secret)).update('hmacsha256=' + (rawBody || '')).digest('hex');
    const a = Buffer.from(header);
    const b = Buffer.from(expect);
    const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
    return { ok, how: ok ? 'LinkedIn signature matched' : 'LinkedIn signature did not match' };
  },

  // TikTok, from its webhook documentation (checked 27.09.2026): Tiktok-Signature is
  // "t=<unix seconds>,s=<hex>", s being HMAC-SHA256 of "<t>.<raw body>" with the client
  // secret. The timestamp is checked too, so an old delivery cannot be replayed.
  tiktok_signature: (req, secret, rawBody) => {
    if (!secret) return { ok: false, how: 'no TikTok client secret configured', missingSecret: true };
    const parts = Object.fromEntries(String(req.headers['tiktok-signature'] || '').split(',')
      .map((kv) => kv.split('=').map((x) => x.trim())).filter((kv) => kv.length === 2));
    if (!parts.t || !parts.s) return { ok: false, how: 'no TikTok signature on the request' };
    const expect = crypto.createHmac('sha256', String(secret)).update(parts.t + '.' + (rawBody || '')).digest('hex');
    const a = Buffer.from(parts.s);
    const b = Buffer.from(expect);
    if (!(a.length === b.length && crypto.timingSafeEqual(a, b))) return { ok: false, how: 'TikTok signature did not match' };
    const age = Math.abs(Date.now() / 1000 - Number(parts.t));
    if (!(age <= 300)) return { ok: false, how: 'TikTok signature is more than five minutes old' };
    return { ok: true, how: 'TikTok signature matched' };
  },

  // Mailchimp sends no signature. The secret lives in the URL instead, which is
  // weaker, and saying so is part of the contract.
  secret_in_url: (req, secret, _raw, url) => {
    if (!secret) return { ok: false, how: 'no secret configured', missingSecret: true };
    const got = String((url && url.searchParams.get('s')) || '');
    const ok = got.length === String(secret).length && got === String(secret);
    return { ok, how: ok ? 'url secret matched (weak: this provider does not sign)' : 'url secret did not match' };
  },

  // AGENT_TOKENS is JSON: { "<token>": "<partner id>" } (or { id, name }). It reaches
  // here as the raw environment STRING, and indexing a string with the header made a
  // real token fail while "0" or "length" passed (28.09.2026). Now: the JSON is read,
  // the header is compared in constant time against each real token, and only a real
  // token names a partner. That partner - not one the payload claims - is the source.
  per_partner_token: (req, secrets) => {
    let table = secrets;
    if (typeof table === 'string') { try { table = JSON.parse(table); } catch { table = null; } }
    if (!table || typeof table !== 'object' || Array.isArray(table) || !Object.keys(table).length) {
      return { ok: false, how: 'no partner tokens configured', missingSecret: true };
    }
    const got = Buffer.from(String(req.headers['x-partner-token'] || ''));
    let match = null;
    for (const token of Object.keys(table)) {
      const want = Buffer.from(token);
      if (got.length === want.length && crypto.timingSafeEqual(got, want)) match = token;
    }
    if (!match) return { ok: false, how: 'unknown partner token' };
    const v = table[match];
    const partner = typeof v === 'string' ? { id: v, name: null }
      : v && typeof v === 'object' && v.id ? { id: String(v.id), name: v.name ? String(v.name) : null } : null;
    return partner
      ? { ok: true, how: 'partner token recognised', partner }
      : { ok: false, how: 'the partner token has no partner id' };
  },

  token_in_query: () => ({ ok: true, how: 'we call them; they do not call us' }),
  none_needed: () => ({ ok: true, how: 'typed in by a member of staff' }),
  unknown: () => ({ ok: false, how: 'this provider has no confirmed mechanism', unconfirmed: true }),
  service_account_with_domain_delegation: () => ({ ok: true, how: 'we call them; they do not call us' }),
};

export function verifyRequest(channel, req, { secret, rawBody, url } = {}) {
  const def = channelDef(channel);
  if (!def) return { ok: false, how: 'unknown channel' };
  const fn = VERIFY[def.auth] || VERIFY.unknown;
  return fn(req, secret, rawBody, url);
}

// -------------------------------------------------------- reading the body --
//
// A provider sends what a provider sends, and only one of ours sends JSON by
// choice. Mailchimp posts application/x-www-form-urlencoded and nothing else;
// an HTML form posts the same. Gmail arrives wrapped in a Pub/Sub envelope with
// the real payload base64 inside it.
//
// This was JSON.parse for every channel, so a real Mailchimp webhook answered
// 400 "the payload is not readable JSON" - proved against the running server on
// 24.09.2026 before this was written.

// Mailchimp writes nested fields as data[email], and a repeated key as
// data[merges][INTERESTS][]. Rebuilt into the object the adapter expects.
function expand(target, key, value) {
  const path = [];
  const head = key.indexOf('[');
  if (head === -1) { path.push(key); }
  else {
    path.push(key.slice(0, head));
    for (const m of key.slice(head).matchAll(/\[([^\]]*)\]/g)) path.push(m[1]);
  }
  let node = target;
  for (let i = 0; i < path.length - 1; i += 1) {
    const k = path[i];
    if (typeof node[k] !== 'object' || node[k] === null) node[k] = {};
    node = node[k];
  }
  const last = path[path.length - 1];
  if (last === '') {                    // data[x][] - an array
    const owner = path[path.length - 2];
    void owner;
    if (!Array.isArray(node.__list)) node.__list = [];
    node.__list.push(value);
    return;
  }
  // a key sent twice becomes a list rather than the last value silently winning
  if (Object.prototype.hasOwnProperty.call(node, last)) {
    node[last] = Array.isArray(node[last]) ? node[last].concat(value) : [node[last], value];
  } else {
    node[last] = value;
  }
}

export function parseFormEncoded(text) {
  const out = {};
  for (const [k, v] of new URLSearchParams(text || '')) expand(out, k, v);
  return out;
}

// Gmail push does not carry the message. It carries a Pub/Sub envelope saying
// the mailbox changed, and the real content is base64 in message.data.
export function unwrapPubSub(obj) {
  const data = obj && obj.message && obj.message.data;
  if (typeof data !== 'string') return null;
  let text;
  try { text = Buffer.from(data, 'base64').toString('utf8'); } catch { return null; }
  try { return { ...JSON.parse(text), _pubsubMessageId: obj.message.messageId || null }; }
  catch { return null; }
}

export function parseInboundBody(channel, contentType, rawBody) {
  const type = String(contentType || '').split(';')[0].trim().toLowerCase();
  const text = rawBody == null ? '' : String(rawBody);

  if (type === 'application/x-www-form-urlencoded') {
    return { ok: true, payload: parseFormEncoded(text), as: 'form-encoded' };
  }
  if (!text) return { ok: true, payload: {}, as: 'empty' };

  let obj;
  try { obj = JSON.parse(text); }
  catch {
    // A provider that declares nothing and sends key=value is still readable,
    // and refusing it would be refusing a real event over a missing header.
    if (text.includes('=') && !text.trimStart().startsWith('{')) {
      return { ok: true, payload: parseFormEncoded(text), as: 'form-encoded, undeclared' };
    }
    return { ok: false, how: 'the payload is not readable JSON or form data' };
  }
  if (channel === 'gmail') {
    const inner = unwrapPubSub(obj);
    if (inner) return { ok: true, payload: inner, as: 'Pub/Sub envelope, unwrapped' };
  }
  return { ok: true, payload: obj, as: 'JSON' };
}

// ------------------------------------------------------------- handshakes --
//
// Before a provider ever sends a message it asks whether we are really there.
// Meta GETs the webhook with hub.challenge and will not save the subscription
// until the exact challenge comes back as plain text. Without this, connecting
// Facebook is impossible - it never gets as far as a message. It returned 404
// until 24.09.2026, proved against the running server.

export const META_CHANNELS = ['facebook', 'instagram', 'messenger', 'whatsapp'];

export function handshake(channel, url, env = process.env) {
  const def = channelDef(channel);
  if (!def) return { ok: false, status: 404, how: 'unknown channel' };

  if (META_CHANNELS.includes(channel)) {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    const want = env.META_VERIFY_TOKEN;
    if (!want) return { ok: false, status: 503, how: 'META_VERIFY_TOKEN is not set', missingSecret: true };
    if (mode !== 'subscribe') return { ok: false, status: 400, how: 'hub.mode was not subscribe' };
    if (!challenge) return { ok: false, status: 400, how: 'no hub.challenge to echo' };
    // constant time, and a wrong token must not be distinguishable by timing
    const a = Buffer.from(String(token || ''));
    const b = Buffer.from(String(want));
    const match = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!match) return { ok: false, status: 403, how: 'the verify token did not match' };
    return { ok: true, status: 200, body: challenge, contentType: 'text/plain',
      how: 'Meta verify token matched, challenge echoed' };
  }

  // LinkedIn validates the address before it will send anything, and again every two
  // hours: GET ?challengeCode=<uuid>, answered within 3 s with JSON carrying the code and
  // challengeResponse = hex HMAC-SHA256(challengeCode) keyed with the client secret.
  if (channel === 'linkedin') {
    const code = url.searchParams.get('challengeCode');
    const secret = env[def.secretEnv];
    if (!secret) return { ok: false, status: 503, how: def.secretEnv + ' is not set', missingSecret: true };
    if (!code) return { ok: false, status: 400, how: 'no challengeCode to answer' };
    const challengeResponse = crypto.createHmac('sha256', String(secret)).update(code).digest('hex');
    return { ok: true, status: 200, body: JSON.stringify({ challengeCode: code, challengeResponse }),
      contentType: 'application/json', how: 'LinkedIn challenge answered' };
  }

  // Mailchimp GETs the URL when somebody adds it in the audience settings, and
  // refuses to save it unless that GET succeeds. It sends no challenge.
  // It always answers, or Mailchimp would refuse to save. But it is RECORDED as proof only when the
  // address carries our secret (Q26, 05.10.2026): an open GET used to overwrite the proof, so anybody
  // could fake "Mailchimp checked our URL". Our callback URL carries ?s=, so Mailchimp's GET does too.
  if (channel === 'mailchimp') {
    const secret = env[def.secretEnv];
    const got = String(url.searchParams.get('s') || '');
    const record = Boolean(secret) && got.length === String(secret).length && got === String(secret);
    return { ok: true, status: 200, body: 'ok', contentType: 'text/plain', record,
      how: record ? 'Mailchimp URL check answered' : 'URL check answered, not recorded: no matching secret' };
  }

  return { ok: false, status: 405, how: 'this channel does not use a GET handshake' };
}

// --------------------------------------------------------------- readiness --
//
// What is actually true about a channel right now, computed rather than claimed.
// A secret is reported as present or absent; its value is never read out.

export function channelStatus(channel, env = process.env, counts = {}) {
  const def = channelDef(channel);
  if (!def) return null;
  const mode = String(env[`CHANNEL_MODE_${channel.toUpperCase()}`] || 'off').toLowerCase();
  const needs = def.secretEnv ? [def.secretEnv] : [];
  const present = needs.filter((k) => Boolean(env[k]));
  const credentialsPresent = needs.length === 0 ? null : present.length === needs.length;

  // 'live' is never inferred. It requires the mode to say so AND the secret to
  // exist, and nothing in this repository sets either.
  const state = def.readiness === 'capability_unconfirmed' ? 'WAITING FOR EXTERNAL ACCESS'
    : def.readiness === 'manual_only' ? 'MANUAL ONLY'
    : mode === 'live' && credentialsPresent ? 'CONNECTED'
    : mode === 'live' ? 'ERROR'
    : mode === 'test' ? 'TEST MODE'
    : def.externalBlocker ? 'WAITING FOR EXTERNAL ACCESS'
    : 'READY FOR CONFIGURATION';

  return {
    channel, label: def.label, mechanism: def.mechanism, direction: def.direction,
    auth: def.auth, webhookPath: def.webhookPath || def.pollPath || null,
    mode, state,
    credentialsPresent,
    secretsNeeded: needs,                       // names only, never values
    // Only a real handshake sets this. The caller passes what the database
    // recorded when the provider last checked we were here; nothing infers it.
    webhookVerified: Boolean(counts.handshakeAt),
    webhookVerifiedAt: counts.handshakeAt || null,
    webhookVerifiedHow: counts.handshakeHow || null,
    readyForTest: def.direction !== 'manual' && def.readiness !== 'capability_unconfirmed',
    externalBlocker: def.externalBlocker || null,
    externalActionRequired: def.externalActionRequired || null,
    lastEventAt: counts.lastEventAt || null,
    lastSuccessAt: counts.lastSuccessAt || null,
    events: counts.events || 0,
    dedupKey: def.dedupKey,
  };
}

export function allChannelStatus(env = process.env, countsByChannel = {}) {
  return channelIds().map((id) => channelStatus(id, env, countsByChannel[id] || {}));
}
