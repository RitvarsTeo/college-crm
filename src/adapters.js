// One adapter per channel. Provider shape in, normalised event out.
//
// These are the mappings a real connection will use. They are written now, while
// there is nothing to connect to, so that switching a channel on later is a
// matter of credentials and a URL rather than of design.
//
// Each adapter is deliberately dull: read the provider's fields, put them in the
// contract's fields, keep the original in `raw`. No adapter decides anything. The
// machine filter runs after this, and a human decides after that.

import { makeInbound, BadInbound, channelDef } from './inbound.js';

const iso = (v) => {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number') return new Date(v < 1e12 ? v * 1000 : v).toISOString();
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};
const str = (v) => (v === undefined || v === null || v === '' ? null : String(v));
const now = () => new Date().toISOString();

// A ticked HTML checkbox arrives as the STRING "true", or "on", or whatever the
// form author chose. `=== true` recorded a real form's ticked consent boxes as
// consent NOT GIVEN - proved against the running server on 24.09.2026. Consent
// is a legal record, so it is read deliberately here rather than guessed.
//
// An unticked checkbox is not sent at all, so absence must stay false, and an
// explicit "false"/"off"/"no"/"0" must stay false too.
const YES = new Set(['true', 'on', 'yes', 'y', '1', 'jā', 'ja']);
const NO = new Set(['false', 'off', 'no', 'n', '0', '', 'nē', 'ne']);
export function truthy(v) {
  if (v === true) return true;
  if (v === false || v === undefined || v === null) return false;
  const t = String(v).trim().toLowerCase();
  if (YES.has(t)) return true;
  if (NO.has(t)) return false;
  return false;                       // anything unrecognised is NOT consent
}

// A provider that sends no usable id gives us nothing to deduplicate on, and a
// retry would become a second message. Refusing is safer than guessing.
function need(id, channel, what) {
  if (!id) throw new BadInbound(`${channel}: no ${what}, so this event cannot be deduplicated`);
  return String(id);
}

export const ADAPTERS = {
  // ------------------------------------------------------------- website --
  website: (raw) => makeInbound('website', {
    externalEventId: need(raw.submission_id || raw.idempotency_key, 'website', 'submission_id'),
    receivedAt: iso(raw.submitted_at) || now(),
    source: str(raw.utm_source) || 'website',
    senderName: str(raw.name),
    senderEmail: str(raw.email),
    senderPhone: str(raw.phone),
    messageBody: str(raw.message),
    extracted: { programme: str(raw.programme), study_form: str(raw.study_form) },
    attribution: { utm_source: str(raw.utm_source), utm_medium: str(raw.utm_medium),
      utm_campaign: str(raw.utm_campaign), gclid: str(raw.gclid) },
    consent: { admissions: truthy(raw.consent_admissions), marketing: truthy(raw.consent_marketing) },
    raw,
  }),

  // ------------------------------------------------------------ linkedin --
  // LinkedIn Lead Sync (checked 27.09.2026). The webhook only SAYS a lead arrived: it
  // carries the leadGenFormResponse URN and occurredAt. The answers - name, email - are
  // fetched afterwards from the Lead Sync API with the app's token, which is not built
  // yet, so this records the arrival and nothing it was not told. LinkedIn documents the
  // dedupe key as the URN plus occurredAt, because one URN is reused when the same member
  // acts on the same form again.
  linkedin: (raw) => {
    const urn = need(raw.leadGenFormResponse, 'linkedin', 'leadGenFormResponse');
    const at = need(raw.occurredAt, 'linkedin', 'occurredAt');
    return makeInbound('linkedin', {
      externalEventId: `${urn}_${at}`,
      receivedAt: iso(Number(at)) || now(),
      source: 'linkedin',
      externalContactId: urn,
      messageBody: 'LinkedIn lead form response - the answers are fetched from LinkedIn, not sent in the notification',
      extracted: {},
      raw,
    });
  },

  // -------------------------------------------------------------- tiktok --
  // TikTok webhooks (checked 27.09.2026): client_key, event, create_time (seconds),
  // user_openid and content, a JSON STRING. TikTok documents NO unique event id, so the
  // dedupe key is built from the four fields that together identify one delivery.
  tiktok: (raw) => {
    const event = need(raw.event, 'tiktok', 'event');
    const created = need(raw.create_time, 'tiktok', 'create_time');
    let content = null;
    try { content = typeof raw.content === 'string' ? JSON.parse(raw.content) : (raw.content || null); } catch { content = null; }
    return makeInbound('tiktok', {
      externalEventId: [raw.client_key || '', event, created, raw.user_openid || ''].join(':'),
      receivedAt: iso(Number(created) * 1000) || now(),
      source: 'tiktok',
      externalPersonId: raw.user_openid || null,
      messageBody: `TikTok ${event}`,
      extracted: {},
      raw: { ...raw, content },
    });
  },

  // --------------------------------------------------------- google form --
  // The Apps Script contract. The script posts exactly this; the field names on
  // the form are Latvian because the form is, and that is provider data.
  google_form: (raw) => {
    const answers = raw.answers || raw.namedValues || {};
    const first = (k) => (Array.isArray(answers[k]) ? answers[k][0] : answers[k]);
    const pick = (...keys) => { for (const k of keys) { const v = first(k); if (v) return String(v); } return null; };
    return makeInbound('google_form', {
      externalEventId: need(raw.responseId, 'google_form', 'responseId'),
      receivedAt: iso(raw.timestamp) || now(),
      source: 'website',
      senderName: pick('Vārds uzvārds', 'name', 'Name'),
      senderEmail: pick('E-pasta adrese', 'email', 'Email'),
      senderPhone: pick('Tālrunis', 'phone', 'Phone'),
      extracted: { programme: pick('Programma', 'programme'), study_form: pick('Studiju forma', 'study_form') },
      consent: { admissions: true,
        marketing: truthy(pick('Piekrītu saņemt informāciju par studijām')) },
      raw: { ...raw, _formId: str(raw.formId) },
    });
  },

  // --------------------------------------------------------------- gmail --
  gmail: (raw) => makeInbound('gmail', {
    externalEventId: need(raw.id, 'gmail', 'message id'),
    externalContactId: str(raw.threadId),
    receivedAt: iso(raw.date) || now(),
    source: 'email',
    senderName: str((/^\s*"?([^"<]+?)"?\s*</.exec(raw.sender || '') || [])[1]),
    senderEmail: str((/[\w.+-]+@[\w-]+\.[\w.]+/.exec(raw.sender || '') || [])[0]),
    messageSubject: str(raw.subject),
    messageBody: str(raw.plaintextBody),          // deleted on qualification
    extracted: {},
    raw: { ...raw, attachments: (raw.attachments || []).map((a) => ({ name: a.filename, size: a.size })) },
  }),

  // ------------------------------------------------------- facebook / ig --
  // Meta sends one envelope with entries and messaging events inside. Both
  // channels share the shape; only the object name differs.
  facebook: (raw) => metaMessage('facebook', raw),
  instagram: (raw) => metaMessage('instagram', raw),
  // Messenger arrives over the same Meta connection as Facebook and is mapped the
  // same way. It stays a separate channel because Reports has to tell them apart.
  messenger: (raw) => metaMessage('messenger', raw),

  // ------------------------------------------------------------ whatsapp --
  whatsapp: (raw) => {
    const value = raw.entry?.[0]?.changes?.[0]?.value || {};
    const msg = (value.messages || [])[0] || {};
    const contact = (value.contacts || [])[0] || {};
    return makeInbound('whatsapp', {
      externalEventId: need(msg.id, 'whatsapp', 'message id'),
      externalPersonId: str(msg.from || contact.wa_id),
      receivedAt: iso(Number(msg.timestamp)) || now(),
      source: 'whatsapp',
      senderName: str(contact.profile?.name),
      senderPhone: str(msg.from || contact.wa_id),
      messageBody: str(msg.text?.body),
      raw: { ...raw, _media: msg.image || msg.document ? { type: msg.type, id: (msg.image || msg.document).id } : null },
    });
  },

  // ----------------------------------------------------------- mailchimp --
  // Activity about somebody, not a new person. Mailchimp sends no event id, so
  // the deduplication key is assembled from what it does send.
  mailchimp: (raw) => {
    const email = str(raw['data[email]'] || raw.data?.email);
    const type = str(raw.type) || 'unknown';
    const fired = str(raw.fired_at || raw.fired);
    return makeInbound('mailchimp', {
      externalEventId: need(email && fired && `${type}:${email}:${fired}`, 'mailchimp', 'email and fired_at'),
      externalPersonId: str(raw['data[id]'] || raw.data?.id),
      receivedAt: iso(fired && fired.replace(' ', 'T') + 'Z') || now(),
      source: 'mailchimp',
      senderEmail: email,
      senderName: [raw['data[merges][FNAME]'], raw['data[merges][LNAME]']].filter(Boolean).join(' ') || null,
      messageSubject: type,
      extracted: { intent: type === 'subscribe' ? 'newsletter' : null },
      consent: type === 'subscribe' ? { marketing: true } : type === 'unsubscribe' ? { marketing: false } : {},
      raw,
    });
  },

  // ------------------------------------------------------------ open day --
  open_day: (raw) => makeInbound('open_day', {
    externalEventId: need(raw.booking_ref || raw.registration_id, 'open_day', 'booking reference'),
    externalContactId: str(raw.event_id),
    receivedAt: iso(raw.booked_at) || now(),
    source: 'event',
    senderName: str(raw.name),
    senderEmail: str(raw.email),
    senderPhone: str(raw.phone),
    extracted: { programme: str(raw.programme), intent: 'visit' },
    raw: { ...raw, _slot: str(raw.slot), _attended: raw.attended ?? null },
  }),

  // --------------------------------------------------------------- phone --
  // We poll for these; the PBX never calls us.
  phone: (raw) => makeInbound('phone', {
    externalEventId: need(raw.uniqueid, 'phone', 'uniqueid'),
    receivedAt: iso(raw.created_at) || now(),
    source: 'phone',
    senderPhone: str(raw.caller_num),
    messageSubject: str(raw.queue),
    extracted: { intent: QUEUE_INTENT[raw.queue] || null },
    raw: { uniqueid: raw.uniqueid, queue: raw.queue, picked_up: raw.picked_up,
      operator_name: raw.operator_name, created_at: raw.created_at },
  }),

  // --------------------------------------------------------------- agent --
  agent: (raw) => makeInbound('agent', {
    externalEventId: need(raw.partner_ref && `${raw.partner_id}:${raw.partner_ref}`, 'agent', 'partner reference'),
    externalPersonId: str(raw.partner_id),
    receivedAt: iso(raw.submitted_at) || now(),
    source: 'agent',
    senderName: str(raw.name),
    senderEmail: str(raw.email),
    senderPhone: str(raw.phone),
    messageBody: str(raw.notes),
    extracted: { programme: str(raw.programme) },
    attribution: { agent: str(raw.partner_id), agent_name: str(raw.partner_name) },
    raw,
  }),

  // ------------------------------------------------- walk-in and the two --
  // that have no confirmed mechanism. They normalise identically, so if a
  // mechanism ever appears nothing downstream changes.
  in_person: (raw) => typedIn('in_person', raw),
  // linkedin and tiktok are webhook adapters above since 27.09.2026, not typed-in ones.
};

const QUEUE_INTENT = {
  '1001*Q-ADMISSION': 'admissions',
  '1001*Q-COORDINATORS': 'coordinator',
  '1001*Q-OTHER': 'other',
};

function metaMessage(channel, raw) {
  const entry = raw.entry?.[0] || {};
  const change = entry.changes?.[0];
  // a lead form submission carries its fields; a direct message carries text
  if (change?.field === 'leadgen') {
    const v = change.value || {};
    return makeInbound(channel, {
      externalEventId: need(v.leadgen_id, channel, 'leadgen_id'),
      externalPersonId: str(v.form_id),
      receivedAt: iso(v.created_time) || now(),
      source: channel,
      senderName: str(v.full_name),
      senderEmail: str(v.email),
      senderPhone: str(v.phone_number),
      extracted: { programme: str(v.programme), intent: 'lead_form' },
      attribution: { ad_id: str(v.ad_id), campaign_id: str(v.campaign_id) },
      raw,
    });
  }
  const m = entry.messaging?.[0] || {};
  return makeInbound(channel, {
    externalEventId: need(m.message?.mid, channel, 'message id'),
    externalPersonId: str(m.sender?.id),
    externalContactId: str(m.recipient?.id),
    receivedAt: iso(m.timestamp) || now(),
    source: channel,
    // Meta usually gives only a handle or a page-scoped id on a direct message.
    // A name is used when the payload carries one and is never invented: on a real
    // Instagram DM there often is no name until the person tells us.
    senderName: str(m.sender?.name),
    senderHandle: str(m.sender?.username || m.sender?.id),
    messageBody: str(m.message?.text),
    raw,
  });
}

function typedIn(channel, raw) {
  return makeInbound(channel, {
    externalEventId: need(raw.entry_id, channel, 'entry id'),
    receivedAt: iso(raw.at) || now(),
    source: channel,
    senderName: str(raw.name),
    senderEmail: str(raw.email),
    senderPhone: str(raw.phone),
    senderHandle: str(raw.handle),
    messageBody: str(raw.what_they_said),
    extracted: { programme: str(raw.programme) },
    raw: { ...raw, _typedBy: str(raw.by) },
  });
}

export function adapt(channel, raw) {
  const fn = ADAPTERS[channel];
  if (!fn) throw new BadInbound(`no adapter for channel: ${channel}`);
  if (!raw || typeof raw !== 'object') throw new BadInbound(`${channel}: the payload is not an object`);
  return fn(raw);
}

// What receive() in intake.js expects. The normalised event is the contract; this
// is the small translation into the existing queue, kept in one place so the
// queue's own shape can change without touching thirteen adapters.
export function toIntake(ev) {
  return {
    channel: ev.channel,
    externalId: ev.externalEventId,
    threadKey: ev.externalContactId || ev.externalPersonId || null,
    receivedAt: ev.receivedAt,
    name: ev.senderName,
    handle: ev.senderHandle,
    email: ev.senderEmail,
    phone: ev.senderPhone,
    body: [ev.messageSubject, ev.messageBody].filter(Boolean).join('\n') || null,
  };
}

export const adapterIds = () => Object.keys(ADAPTERS);
export const hasAdapter = (id) => Boolean(ADAPTERS[id]);
export { channelDef };
