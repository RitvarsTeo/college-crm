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

// A field by any of its names, whatever the case: a form author on Tilda names fields freely.
// Spaces, underscores and hyphens count as the same thing (04.10.2026): the live college form's
// "Name Surname" can arrive as "Name Surname" or "Name_Surname" depending on how it is encoded.
const fieldKey = (k) => String(k).trim().toLowerCase().replace(/[\s_-]+/g, '_');
function pickFrom(raw) {
  const lower = new Map(Object.keys(raw || {}).map((k) => [fieldKey(k), k]));
  return (...names) => {
    for (const n of names) { const k = lower.get(fieldKey(n)); if (k && raw[k] !== '' && raw[k] != null) return raw[k]; }
    return null;
  };
}

// The person's name. The college enquiry form sends one field, "Name Surname"; the contact form
// on college/en/contacts sends two, Name and Name_2, which are joined. Fields are never renamed
// in Tilda: two Make webhooks read the same forms (Q3, 04.10.2026).
function nameFrom(f) {
  const whole = f('name surname', 'full_name', 'vards uzvards', 'vārds uzvārds');
  if (whole) return str(whole);
  const first = f('name', 'vards', 'vārds');
  const second = f('name_2', 'surname', 'uzvards', 'uzvārds');
  return str([first, second].filter((x) => x != null && String(x).trim() !== '').map((x) => String(x).trim()).join(' '));
}

// Tilda's COOKIES field carries TILDAUTM=utm_source%3D...%7C%7C%7Cutm_medium%3D...; read the
// utm_ pairs out of it and nothing else.
export function utmFromCookies(cookies) {
  const out = {};
  if (!cookies) return out;
  let text = String(cookies);
  for (let i = 0; i < 2; i++) { try { text = decodeURIComponent(text); } catch { break; } }
  for (const m of text.matchAll(/(utm_source|utm_medium|utm_campaign|gclid)=([^|;&]+)/g)) out[m[1]] = m[2].trim();
  return out;
}

export const ADAPTERS = {
  // ------------------------------------------------------------- website --
  website: (raw) => {
    // Our own field names first, then Tilda's (01.10.2026, C8): Tilda posts form-encoded with its
    // own id `tranid`, the field names the form author chose (Name, Email, Phone, Comments...),
    // and the advert tags inside the COOKIES field when "Send cookies" is on.
    const f = pickFrom(raw);
    const utm = { ...utmFromCookies(raw.COOKIES || raw.cookies) };
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'gclid']) if (f(k)) utm[k] = f(k);
    return makeInbound('website', {
      externalEventId: need(raw.submission_id || raw.idempotency_key || (raw.tranid && 'tilda-' + raw.tranid), 'website', 'submission_id'),
      receivedAt: iso(raw.submitted_at) || now(),
      source: str(utm.utm_source) || 'website',
      senderName: nameFrom(f),
      senderEmail: str(f('email', 'e-mail', 'epasts', 'e-pasts')),
      senderPhone: str(f('phone', 'telefons', 'tel')),
      messageBody: str(f('message', 'additional comments', 'comments', 'comment', 'textarea', 'jautajums', 'jautājums')),
      // "Source" on the college form is the person's own answer to "where did you hear about
      // us". It is an answer, not advert tracking, so it never becomes the utm source.
      extracted: { programme: str(f('programme', 'program', 'study program', 'study programme', 'programma')),
        study_form: str(f('study_form')), heard_from: str(f('source')) },
      attribution: { utm_source: str(utm.utm_source), utm_medium: str(utm.utm_medium),
        utm_campaign: str(utm.utm_campaign), gclid: str(utm.gclid) },
      consent: { admissions: truthy(f('consent_admissions')), marketing: truthy(f('consent_marketing')) },
      raw,
    });
  },

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
    const said = contactIn(content);
    return makeInbound('tiktok', {
      externalEventId: [raw.client_key || '', event, created, raw.user_openid || ''].join(':'),
      receivedAt: iso(Number(created) * 1000) || now(),
      source: 'tiktok',
      externalPersonId: raw.user_openid || null,
      senderName: said.name,
      senderEmail: said.email,
      senderPhone: said.phone,
      messageBody: said.text || `TikTok ${event}`,
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
      // The form asks for a Google sign-in, so the address it collects arrives as respondentEmail
      // (scripts/google-form/Code.gs, 30.09.2026); a typed-in answer still wins.
      senderEmail: pick('E-pasta adrese', 'email', 'Email') || str(raw.respondentEmail),
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
  whatsapp: (raw) => whatsappAll(raw)[0],

  // ----------------------------------------------------------- mailchimp --
  // Activity about somebody, not a new person. Mailchimp sends no event id, so
  // the deduplication key is assembled from what it does send.
  mailchimp: (raw) => {
    // an email change (upemail) carries the new address as data[new_email] (C9, 01.10.2026)
    const email = str(raw['data[email]'] || raw.data?.email || raw['data[new_email]'] || raw.data?.new_email);
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

// C7 (30.09.2026): TikTok documents no single shape for `content`, and no real event has reached us
// yet. So only a field that plainly IS a name, an email, a phone or a message text is read, at any
// depth, the first one found; an email must look like one. Nothing else is guessed.
const CONTENT_KEYS = {
  name: ['full_name', 'name', 'display_name', 'nickname'],
  email: ['email', 'email_address'],
  phone: ['phone_number', 'phone', 'mobile'],
  text: ['text', 'message_text', 'comment_text'],
};
function contactIn(content) {
  const out = { name: null, email: null, phone: null, text: null };
  const walk = (o, depth) => {
    if (!o || typeof o !== 'object' || depth > 4) return;
    for (const [want, keys] of Object.entries(CONTENT_KEYS)) {
      if (out[want]) continue;
      for (const k of keys) {
        const v = o[k];
        if (typeof v !== 'string' && typeof v !== 'number') continue;
        const t = String(v).trim();
        if (!t) continue;
        if (want === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) continue;
        out[want] = t;
        break;
      }
    }
    for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v, depth + 1);
  };
  walk(content, 0);
  return out;
}

const QUEUE_INTENT = {
  '1001*Q-ADMISSION': 'admissions',
  '1001*Q-COORDINATORS': 'coordinator',
  '1001*Q-OTHER': 'other',
};

// EVERY message in a WhatsApp delivery. A value carries messages[] and contacts[];
// the contact is matched to the message by wa_id, and falls back to the first when
// the provider sends only one contact for several messages from the same person.
function whatsappAll(raw) {
  const out = [];
  for (const entry of raw.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const contacts = value.contacts || [];
      for (const msg of value.messages || []) {
        const contact = contacts.find((c) => c.wa_id === msg.from) || contacts[0] || {};
        out.push(makeInbound('whatsapp', {
          externalEventId: need(msg.id, 'whatsapp', 'message id'),
          externalPersonId: str(msg.from || contact.wa_id),
          receivedAt: iso(Number(msg.timestamp)) || now(),
          source: 'whatsapp',
          senderName: str(contact.profile?.name),
          senderPhone: str(msg.from || contact.wa_id),
          messageBody: str(msg.text?.body),
          raw: { ...raw, _media: msg.image || msg.document ? { type: msg.type, id: (msg.image || msg.document).id } : null },
        }));
      }
    }
  }
  // an empty delivery is still a bad payload, and need() is what says so
  if (!out.length) need(null, 'whatsapp', 'message id');
  return out;
}

const pageDm = (channel) => (channel === 'facebook' ? 'messenger' : channel);

// EVERY lead form and EVERY direct message in a Meta delivery.
function metaAll(channel, raw) {
  const out = [];
  for (const entry of raw.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field === 'leadgen') out.push(metaLead(channel, change.value || {}, raw));
    }
    // Decided by Ritvars 30.09.2026 (popup B): a Page registers ONE Meta address, the facebook one.
    // Its messaging[] events are Messenger conversations; its leadgen changes are Facebook lead forms.
    // Only the real webhook path splits them; adapt() (the Console simulator, the demo) keeps the
    // channel it is asked for.
    for (const m of entry.messaging || []) out.push(metaDirect(pageDm(channel), m, raw));
  }
  if (!out.length) return [metaMessage(channel, raw)];   // let the old path raise the right error
  return out;
}

function metaLead(channel, v, raw) {
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

function metaDirect(channel, m, raw) {
  return makeInbound(channel, {
    externalEventId: need(m.message?.mid, channel, 'message id'),
    externalPersonId: str(m.sender?.id),
    externalContactId: str(m.recipient?.id),
    receivedAt: iso(m.timestamp) || now(),
    source: channel,
    senderName: str(m.sender?.name),
    senderHandle: str(m.sender?.username || m.sender?.id),
    messageBody: str(m.message?.text),
    raw,
  });
}

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

// EVERY event in one delivery. adapt() stays as it is - one event - because three
// call sites and the suite rest on that; this is what the webhook route walks, so a
// delivery carrying three messages becomes three rows instead of one.
export function adaptAll(channel, raw) {
  const fn = ADAPTERS[channel];
  if (!fn) throw new BadInbound(`no adapter for channel: ${channel}`);
  if (!raw || typeof raw !== 'object') throw new BadInbound(`${channel}: the payload is not an object`);
  if (channel === 'whatsapp') return whatsappAll(raw);
  if (channel === 'facebook' || channel === 'instagram' || channel === 'messenger') return metaAll(channel, raw);
  return [fn(raw)];
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
    // Where the adapter recorded one (the agent channel). It used to stop here, so
    // which partner a lead came from never reached the database (28.09.2026).
    attribution: ev.attribution && Object.keys(ev.attribution).length ? ev.attribution : null,
    // The consent the person gave on the form, read by truthy() above. It stopped here too,
    // so a ticked box never reached the person's consent record (found 28.09.2026).
    consent: ev.consent && Object.keys(ev.consent).length ? ev.consent : null,
    // What the person ANSWERED on the website form (Q3, 04.10.2026): the programme they picked
    // and where they heard of us. Stored as their own answers, provider provenance, never as
    // the confirmed interest or as advert tracking. Website only for now: every other adapter's
    // `extracted` still stops here, which is a known gap, not a decision.
    answers: ev.channel === 'website' ? websiteAnswers(ev.extracted) : null,
  };
}

const WEBSITE_ANSWERS = { programme: 'form_programme', study_form: 'form_study_form', heard_from: 'heard_from' };
function websiteAnswers(x) {
  const out = {};
  for (const [k, field] of Object.entries(WEBSITE_ANSWERS)) if (x && x[k]) out[field] = String(x[k]);
  return Object.keys(out).length ? out : null;
}

export const adapterIds = () => Object.keys(ADAPTERS);
export const hasAdapter = (id) => Boolean(ADAPTERS[id]);
export { channelDef };
