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
  shared_secret_header: (req, secret) => {
    if (!secret) return { ok: false, how: 'no secret configured', missingSecret: true };
    const got = String(req.headers['x-crm-secret'] || '');
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

  // Mailchimp sends no signature. The secret lives in the URL instead, which is
  // weaker, and saying so is part of the contract.
  secret_in_url: (req, secret, _raw, url) => {
    if (!secret) return { ok: false, how: 'no secret configured', missingSecret: true };
    const got = String((url && url.searchParams.get('s')) || '');
    const ok = got.length === String(secret).length && got === String(secret);
    return { ok, how: ok ? 'url secret matched (weak: this provider does not sign)' : 'url secret did not match' };
  },

  per_partner_token: (req, secrets) => {
    const got = String(req.headers['x-partner-token'] || '');
    const table = secrets || {};
    const partner = table[got];
    return partner
      ? { ok: true, how: 'partner token recognised', partner }
      : { ok: false, how: 'unknown partner token' };
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
    webhookVerified: false,                     // only a real handshake can set this
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
