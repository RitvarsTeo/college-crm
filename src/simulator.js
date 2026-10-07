// The channel integration simulator.
//
// Every channel has a FICTIONAL provider account. Pressing a test button really
// runs the local integration: a provider-shaped payload is built, authenticated
// the way the real provider authenticates, normalised, mapped, resolved to a
// person, written to the CRM, and where the channel supports it, answered.
//
// Nothing here talks to a provider. The rules each simulator follows are the
// researched real ones, recorded in config/providers.json.

import crypto from 'node:crypto';
import fs from 'node:fs';
import { logEvent, MANUAL, AUTOMATIC } from './history.js';
import { newPersonId } from './intake.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { localDate } from './bizday.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const PROVIDERS = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'providers.json'), 'utf8'));
const CRMCFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));

const APP_SECRET = 'sim-app-secret';
const VERIFY_TOKEN = 'sim-verify-token';
const GFORM_SECRET = 'sim-gform-secret';
const MAILCHIMP_SECRET = 'sim-mc-secret';
const AGENT_TOKENS = { tok_india_partner_1: 'india-partner-1' };

export const channel = (id) => PROVIDERS.channels.find((c) => c.id === id);
const nowIso = () => new Date().toISOString();
const newId = newPersonId;     // L1, 07.10.2026: one id maker, src/intake.js
const rid = () => Math.random().toString(36).slice(2, 10);

// ---------------------------------------------------------------- identity --
export function normEmail(v) {
  if (!v) return null;
  const s = String(v).trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(s) ? s : null;
}
export function normPhone(v) {
  if (!v) return null;
  let s = String(v).replace(/[^\d+]/g, '');
  if (!s) return null;
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (!s.startsWith('+')) {
    if (s.length === 8) s = '+371' + s;
    else if (s.startsWith('371') && s.length === 11) s = '+' + s;
    else s = '+' + s;
  }
  return s.replace(/\D/g, '').length < 7 ? null : s;
}
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

async function findPerson(db, { email, phone, handle }) {
  const hits = [];
  if (email) {
    const r = await db.prepare('SELECT id FROM people WHERE lower(email) = ?').get(email);
    if (r) hits.push({ key: 'email', value: email, id: r.id });
  }
  if (phone) {
    const rows = await db.prepare('SELECT id, phone FROM people WHERE phone IS NOT NULL').all();
    const r = rows.find((x) => normPhone(x.phone) === phone);
    if (r) hits.push({ key: 'phone', value: phone, id: r.id });
  }
  if (handle) {
    const r = await db.prepare("SELECT id FROM people WHERE notes LIKE ?").get('%' + handle + '%');
    if (r) hits.push({ key: 'handle', value: handle, id: r.id });
  }
  return hits;
}

// ------------------------------------------------------------------ payloads -
function utm(source, medium, campaign, gclid) {
  const o = {};
  if (source) o.utm_source = source;
  if (medium) o.utm_medium = medium;
  if (campaign) o.utm_campaign = campaign;
  if (gclid) o.gclid = gclid;
  return o;
}

async function existingPerson(db, which = 'any') {
  const rows = await db.prepare("SELECT * FROM people WHERE email IS NOT NULL AND phone IS NOT NULL ORDER BY created_at DESC LIMIT 40").all();
  if (!rows.length) return null;
  return rows[which === 'any' ? 0 : Math.min(which, rows.length - 1)];
}

// The prototype starts with an empty table on purpose, so a scenario that needs
// somebody who already exists has to invent one rather than fall over. Anything
// invented this way is flagged, and the console says it out loud.
let INVENTED = false;
async function someone(db, which = 'any') {
  const real = await existingPerson(db, which);
  if (real) return real;
  INVENTED = true;
  const n = ['Ilze Ozola', 'Kārlis Ziediņš', 'Rūdolfs Krastiņš'][which === 'any' ? 0 : Math.min(which, 2)];
  return {
    id: null,
    name: n,
    email: n.toLowerCase().normalize('NFKD').replace(/[^a-z]+/g, '.') + '.' + rid().slice(0, 4) + '@example.lv',
    phone: '+3712' + String(1000000 + Math.floor(Math.random() * 8999999)),
  };
}

// Each builder returns { raw, transport, auth, meta }
const BUILDERS = {
  async website_form(db, scenario) {
    const base = {
      submission_id: 'web-' + rid(),
      submitted_at: nowIso(),
      name: 'Kristaps Ozoliņš',
      email: 'kristaps.ozolins.' + rid().slice(0, 4) + '@inbox.lv',
      phone: '+371 26 411 900',
      programme: 'NAV',
      study_form: 'Full time',
      consent_admissions: true,
      consent_marketing: true,
      ...utm('instagram', 'paid', 'nav-2026-09'),
    };
    if (scenario === 'known_email') {
      const p = await someone(db);
      Object.assign(base, { name: p.name, email: p.email, phone: '+371 20 000 111' });
    }
    if (scenario === 'known_phone') {
      const p = await someone(db, 1);
      Object.assign(base, { name: p.name, email: 'another.address.' + rid().slice(0, 4) + '@example.lv', phone: p.phone });
    }
    if (scenario === 'missing') { delete base.email; base.name = 'Bez E-pasta'; }
    if (scenario === 'conflict') {
      const a = await someone(db, 0), b = await someone(db, 2);
      Object.assign(base, { name: 'Konflikta Gadījums', email: a.email, phone: b.phone });
    }
    if (scenario === 'no_consent') { base.consent_marketing = false; base.name = 'Bez Piekrišanas'; }
    return { raw: base, transport: 'HTTPS POST from the form', auth: { type: 'none required', ok: true } };
  },

  async google_form(db, scenario) {
    const answers = {
      'Vārds uzvārds': ['Elza Zariņa'],
      'E-pasta adrese': ['elza.zarina.' + rid().slice(0, 4) + '@gmail.com'],
      'Tālrunis': ['+371 29 155 244'],
      'Programma': ['ENG'],
      'Piekrītu saņemt informāciju par studijām': ['Jā'],
    };
    const responseId = '2_ABaOnu' + rid();
    if (scenario === 'forms_api') {
      return {
        raw: {
          _notification: { formId: '1FAIpQLSe-SIMULATED', eventType: 'RESPONSES', watchId: 'watch-sim-1', publishedAt: nowIso() },
          _note: 'A Forms API watch notification carries the form id and the event type only. The answers are NOT in it.',
        },
        transport: 'Forms API watch to Cloud Pub/Sub',
        auth: { type: 'OAuth service account', ok: true },
        fetch: { call: 'forms.responses.list(formId)', result: { responseId, createTime: nowIso(), answers } },
      };
    }
    if (scenario === 'bad_secret') {
      return { raw: { responseId, timestamp: nowIso(), namedValues: answers, _secret: 'wrong-secret' },
        transport: 'Apps Script UrlFetchApp', auth: { type: 'shared secret', ok: false, reason: 'the shared secret did not match' } };
    }
    if (scenario === 'watch_expired') {
      return { raw: { _watch: { id: 'watch-sim-1', expireTime: new Date(Date.now() - 86400000).toISOString() } },
        transport: 'Forms API watch to Cloud Pub/Sub', auth: { type: 'OAuth service account', ok: true },
        fail: 'The watch expired, so no notification was ever published. Nothing arrives, and nothing errors: this is the silent failure mode the renewal job exists to prevent.' };
    }
    return { raw: { responseId, timestamp: nowIso(), namedValues: answers, _secret: GFORM_SECRET },
      transport: 'Apps Script installable onFormSubmit trigger', auth: { type: 'shared secret', ok: true } };
  },

  async gmail(db, scenario) {
    const msgId = '1a' + rid();
    const booking = {
      id: msgId, threadId: msgId, date: nowIso(), sender: 'edu@novikontas.org',
      toRecipients: ['ritvars.vilcins@novikontas.org'],
      subject: 'Jauns pieteikums: Raivis Bresis (30.09.2026 14:00)',
      plaintextBody: 'Jauns pieteikums vizītei.\n\nVārds: Raivis Bresis\nE-pasts: raivis.bresis.' + rid().slice(0, 4) + '@gmail.com\nTālrunis: 28662447\nProfesija: Kuģu kapteinis\nDatums: 30.09.2026\nLaiks: 14:00\nVieta: Duntes iela 17A, Rīga',
    };
    if (scenario === 'human') {
      return { raw: { id: msgId, threadId: msgId, date: nowIso(), sender: '"Mārtiņš Liepa" <martins.liepa.' + rid().slice(0, 4) + '@inbox.lv>',
        toRecipients: ['edu@novikontas.org'], subject: 'Jautājums par studijām',
        plaintextBody: 'Labdien!\n\nVai vēl var pieteikties navigācijas programmā šoruden?\nMans tālrunis 26123456.\n\nAr cieņu,\nMārtiņš' },
        transport: 'Gmail API push, then history.list and messages.get', auth: { type: 'service account, gmail.readonly', ok: true },
        push: { emailAddress: 'edu@novikontas.org', historyId: String(1229969 + Math.floor(Math.random() * 500)) } };
    }
    if (scenario === 'watch_expired') {
      return { raw: { _watch: { historyId: '1229969', expiration: new Date(Date.now() - 8 * 86400000).toISOString() } },
        transport: 'Gmail API push', auth: { type: 'service account', ok: true },
        fail: 'The watch expired 8 days ago. Gmail stopped publishing and said nothing. Every message since then is invisible until watch is called again and history is replayed.' };
    }
    const mode = scenario === 'booking_poll' ? 'polling' : 'push';
    return { raw: booking, transport: mode === 'push' ? 'users.watch to Pub/Sub, then history.list and messages.get' : 'history.list poll every 60 seconds',
      auth: { type: 'service account, gmail.readonly', ok: true },
      push: mode === 'push' ? { emailAddress: 'edu@novikontas.org', historyId: String(1229969 + Math.floor(Math.random() * 500)) } : null };
  },

  async mailchimp(db, scenario) {
    const p = await someone(db);
    const email = scenario === 'unknown' ? 'never.seen.' + rid().slice(0, 4) + '@example.lv' : p.email;
    const type = { subscribe: 'subscribe', unsubscribe: 'unsubscribe', profile: 'profile', cleaned: 'cleaned', upemail: 'upemail', unknown: 'subscribe', bad_secret: 'unsubscribe' }[scenario] || 'subscribe';
    const raw = {
      type, fired_at: nowIso().slice(0, 19).replace('T', ' '),
      'data[id]': '8a25ff1d98', 'data[list_id]': 'a6b5da1054-SIM', 'data[email]': email,
      'data[email_type]': 'html', 'data[merges][EMAIL]': email,
      'data[merges][FNAME]': (p?.name || 'Jauns Cilvēks').split(' ')[0],
      'data[merges][LNAME]': (p?.name || 'Jauns Cilvēks').split(' ').slice(1).join(' '),
    };
    if (type === 'cleaned') raw['data[reason]'] = 'hard';
    if (type === 'upemail') { raw['data[new_email]'] = 'changed.' + rid().slice(0, 4) + '@example.lv'; raw['data[old_email]'] = email; }
    return { raw, transport: 'Audience webhook, application/x-www-form-urlencoded',
      auth: { type: 'secret in the URL (Mailchimp does not sign its webhooks)', ok: scenario !== 'bad_secret', reason: scenario === 'bad_secret' ? 'the URL secret did not match' : null },
      secret: scenario === 'bad_secret' ? 'wrong-secret' : MAILCHIMP_SECRET };
  },

  async facebook(db, scenario) {
    const now = Math.floor(Date.now() / 1000);
    if (scenario === 'verify') {
      return { raw: { 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': String(100000 + Math.floor(Math.random() * 899999)) },
        transport: 'GET verification handshake', auth: { type: 'verify token', ok: true } };
    }
    if (scenario === 'bad_token') {
      return { raw: { 'hub.mode': 'subscribe', 'hub.verify_token': 'not-our-token', 'hub.challenge': '123456' },
        transport: 'GET verification handshake', auth: { type: 'verify token', ok: false, reason: 'the verify token did not match, so Meta is refused' } };
    }
    if (scenario === 'malformed') {
      return { raw: { object: 'page', entry: [{ id: '102938-SIM', changes: [{ field: 'leadgen' }] }] },
        transport: 'POST webhook', auth: { type: 'app secret HMAC', ok: true }, malformed: true };
    }
    const lead = { object: 'page', entry: [{ id: '102938-SIM', time: now, changes: [{ field: 'leadgen', value: {
      leadgen_id: scenario === 'duplicate' ? 'lead-fixed-001' : 'lead-' + rid(), page_id: '102938-SIM', form_id: '905-SIM', ad_id: '120210-SIM',
      adgroup_id: '6543-SIM', created_time: now,
      full_name: 'Marta Liepa', email: 'marta.liepa.' + (scenario === 'duplicate' ? 'fixed' : rid().slice(0, 4)) + '@gmail.com',
      phone_number: '+37129123456', programme: 'ENG' } }] }] };
    const message = { object: 'page', entry: [{ id: '102938-SIM', time: Date.now(), messaging: [{
      sender: { id: 'fb-user-' + rid() }, recipient: { id: '102938-SIM' }, timestamp: Date.now(),
      message: { mid: 'm_' + rid(), text: 'Labdien! Vai vēl var pieteikties uz ENG programmu?' } }] }] };
    const raw = scenario === 'message' ? message : lead;
    const okSig = !['unsigned', 'bad_signature'].includes(scenario);
    return { raw, transport: 'POST webhook',
      auth: { type: 'X-Hub-Signature-256 HMAC-SHA256', ok: okSig,
        reason: scenario === 'unsigned' ? 'no signature header at all' : scenario === 'bad_signature' ? 'the signature does not match the body' : null },
      signature: scenario === 'unsigned' ? null : scenario === 'bad_signature' ? 'sha256=' + 'a'.repeat(64) : null };
  },

  async instagram(db, scenario) {
    const text = scenario === 'message_with_email'
      ? 'Sveiki! Mans e-pasts ir liene.kalnina.' + rid().slice(0, 4) + '@gmail.com, atsūtiet info par NAV'
      : 'Sveiki! Vai vēl var pieteikties uz NAV programmu?';
    const raw = { object: 'instagram', entry: [{ id: '17841400000-SIM', time: Date.now(), messaging: [{
      sender: { id: scenario === 'duplicate' ? 'ig-user-fixed' : 'ig-user-' + rid() }, recipient: { id: '17841400000-SIM' },
      timestamp: Date.now(), message: { mid: scenario === 'duplicate' ? 'ig_mid_fixed' : 'ig_' + rid(), text } }] }] };
    return { raw, transport: 'POST webhook, object=instagram',
      auth: { type: 'X-Hub-Signature-256', ok: scenario !== 'bad_signature', reason: scenario === 'bad_signature' ? 'the signature does not match the body' : null },
      signature: scenario === 'bad_signature' ? 'sha256=' + 'b'.repeat(64) : null };
  },

  async whatsapp(db, scenario) {
    let from = '37122193374';
    if (scenario === 'inbound_local') { const p = await someone(db); from = String(p.phone || '+37126411900').replace(/\D/g, ''); }
    if (scenario === 'unknown') from = '37129998877';
    if (scenario === 'inbound') { const p = await someone(db); from = String(p.phone || '+37126411900').replace(/\D/g, ''); }
    const wamid = scenario === 'duplicate' ? 'wamid.FIXED001' : 'wamid.' + rid();
    const raw = { object: 'whatsapp_business_account', entry: [{ id: '102290129340398-SIM', changes: [{ field: 'messages', value: {
      messaging_product: 'whatsapp',
      metadata: { display_phone_number: '37120000000', phone_number_id: '106540352242922-SIM' },
      contacts: [{ profile: { name: 'Dagnis J.' }, wa_id: from }],
      messages: [{ from, id: wamid, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text',
        text: { body: 'Labdien! Vai vēl var pieteikties NAV programmai?' } }] } }] }] };
    return { raw, transport: 'POST webhook, field=messages',
      auth: { type: 'X-Hub-Signature-256', ok: scenario !== 'bad_signature', reason: scenario === 'bad_signature' ? 'the signature does not match the body' : null },
      signature: scenario === 'bad_signature' ? 'sha256=' + 'c'.repeat(64) : null };
  },

  async agent(db, scenario) {
    const token = scenario === 'unknown_token' ? 'tok_not_ours' : 'tok_india_partner_1';
    const raw = {
      token,
      name: 'Arun Kumar', email: scenario === 'duplicate' ? 'arun.kumar.fixed@example.in' : 'arun.kumar.' + rid().slice(0, 4) + '@example.in',
      phone: '+919812345678', programme: 'NAV', country: 'India',
      passport: scenario === 'duplicate' ? 'Z1234567' : 'Z' + (1000000 + Math.floor(Math.random() * 8999999)),
    };
    if (scenario === 'spoof') raw.agent = 'website';  // the agent trying to relabel the source
    return { raw, transport: 'POST to the agent link',
      auth: { type: 'per-agent token', ok: scenario !== 'unknown_token', reason: scenario === 'unknown_token' ? 'the token is not one of ours' : null } };
  },

  async open_day(db, scenario) {
    const raw = {
      booking_id: scenario === 'duplicate' ? 'od-fixed-001' : 'od-' + rid(),
      name: 'Emīls Baltputnis', email: 'emils.baltputnis.' + (scenario === 'duplicate' ? 'fixed' : rid().slice(0, 4)) + '@gmail.com',
      phone: '20423829', professions: 'Kuģu kapteinis; Vēja turbīnu tehniķis',
      visit_date: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10), visit_time: '14:00',
      consent_admissions: true, created_at: nowIso(),
    };
    return { raw, transport: 'POST from the booking app', auth: { type: 'shared secret', ok: true } };
  },

  async klatiene(db, scenario) {
    if (scenario === 'qr') {
      return { raw: { submission_id: 'qr-' + rid(), name: 'Rihards Sīlis', email: 'rihards.silis.' + rid().slice(0, 4) + '@inbox.lv',
        phone: '25443322', ...utm('qr', 'reception', 'open-day-qr'), consent_admissions: true, submitted_at: nowIso() },
        transport: 'QR to a web form: this IS a digital inbound channel', auth: { type: 'none required', ok: true } };
    }
    const p = scenario === 'duplicate' ? await existingPerson(db) : null;
    return { raw: { name: p ? p.name : 'Gatis Purmalis', email: p ? p.email : '', phone: p ? p.phone : '26551234',
      note: 'Walked into reception, asked about NAV part time', by: (CRMCFG.users && CRMCFG.users[0] && CRMCFG.users[0].name) || 'unknown user', at: nowIso(), consent_admissions: true },
      transport: 'Typed into the CRM by a member of staff', auth: { type: 'the logged-in member of staff', ok: true } };
  },

  async phone(db, scenario) {
    const p = await someone(db);
    if (scenario === 'future_event') {
      return { raw: { event: 'call.ended', direction: 'inbound', from: p.phone, to: '+37123111114',
        started_at: nowIso(), duration_seconds: 96, disposition: 'answered', recording_url: null },
        transport: 'Telephony webhook - NOT AVAILABLE, no provider confirmed', auth: { type: 'provider signature', ok: true },
        notAvailable: true };
    }
    return { raw: { person_id: p.id, phone: p.phone, outcome: scenario === 'no_answer' ? 'No answer' : 'Answered',
      note: scenario === 'no_answer' ? 'Try again on Friday' : 'Interested in the January intake, send the document list',
      by: (CRMCFG.users && CRMCFG.users[0] && CRMCFG.users[0].name) || 'unknown user', at: nowIso(), next_action: scenario === 'no_answer' ? 'Call back' : 'Send the document list', next_days: 3 },
      transport: 'Typed into the CRM by a member of staff', auth: { type: 'the logged-in member of staff', ok: true } };
  },
};

// ------------------------------------------------------------- normalisation -
// Provider payload -> our internal event, with the field mapping recorded so the
// console can show provider field -> CRM field.
// What a person reads on a person's page. The full payload is NOT thrown away -
// it is kept in sim_events and shown on the Channels and Inspector screens, where
// somebody is deliberately looking at the plumbing. On a person's record it
// belongs in plain words, because Ieva reads it between phone calls.
const SOURCE_NAME = { instagram: 'Instagram', facebook: 'Facebook', google: 'Google',
  linkedin: 'LinkedIn', tiktok: 'TikTok', email: 'email', newsletter: 'the newsletter' };

function plainSubmission({ programme, studyForm, phone, email, consent, utm }) {
  const lines = [];
  lines.push(programme
    ? `Wants to study ${programme}${studyForm ? ', ' + String(studyForm).toLowerCase() : ''}.`
    : 'Did not say what they want to study.');
  const reach = [phone, email].filter(Boolean).join(' or ');
  if (reach) lines.push(`Reach them on ${reach}.`);
  if (consent) {
    const yes = [];
    if (consent.admissions) yes.push('about applying');
    if (consent.marketing) yes.push('about news and offers');
    lines.push(yes.length
      ? `Agreed to be contacted ${yes.join(' and ')}.`
      : 'Did not agree to be contacted. Ask before writing to them.');
  }
  if (utm && (utm.source || utm.campaign)) {
    const paid = utm.medium && /paid|cpc|ppc/i.test(utm.medium);
    const where = SOURCE_NAME[String(utm.source || '').toLowerCase()] || utm.source || 'a link';
    lines.push(`Found us through ${paid ? 'a paid ' + where + ' ad' : where}`
      + (utm.campaign ? ` (campaign ${utm.campaign}).` : '.'));
  }
  return lines.join('\n');
}

function normalise(channelId, built, scenario) {
  const map = [];
  const take = (from, to, value) => { if (value !== undefined && value !== null && value !== '') map.push({ from, to, value }); return value; };
  const raw = built.raw;
  const ev = { channel: channelId, externalId: null, occurredAt: nowIso(), person: {}, source: {}, consent: {}, subject: null, body: null };

  if (channelId === 'website_form' || (channelId === 'klatiene' && scenario === 'qr')) {
    ev.externalId = channelId + ':' + raw.submission_id;
    ev.occurredAt = raw.submitted_at || nowIso();
    ev.person.name = take('name', 'person.name', raw.name);
    ev.person.email = take('email', 'person.email', normEmail(raw.email));
    ev.person.phone = take('phone', 'person.phone', normPhone(raw.phone));
    ev.source.channel = take('utm_source', 'source.channel', raw.utm_source) || 'website';
    ev.source.campaign = take('utm_campaign', 'source.campaign', raw.utm_campaign);
    ev.source.detail = take('utm_medium', 'source.detail', raw.utm_medium);
    ev.meta = { programme: take('programme', 'person.programme', raw.programme), gclid: raw.gclid || null };
    ev.consent = { admissions: raw.consent_admissions === true, marketing: raw.consent_marketing === true };
    ev.subject = scenario === 'qr' ? 'Applied by scanning a QR code'
      : 'Applied through the website';
    ev.body = plainSubmission({
      programme: raw.programme, studyForm: raw.study_form,
      phone: ev.person.phone, email: ev.person.email,
      consent: { admissions: raw.consent_admissions === true,
        marketing: raw.consent_marketing === true },
      utm: { source: raw.utm_source, medium: raw.utm_medium, campaign: raw.utm_campaign },
    });
  } else if (channelId === 'google_form') {
    const answers = built.fetch ? built.fetch.result.answers : raw.namedValues;
    const responseId = built.fetch ? built.fetch.result.responseId : raw.responseId;
    const first = (k) => (Array.isArray(answers?.[k]) ? answers[k][0] : answers?.[k]);
    ev.externalId = 'google_form:' + responseId;
    ev.person.name = take('namedValues["Vārds uzvārds"]', 'person.name', first('Vārds uzvārds'));
    ev.person.email = take('namedValues["E-pasta adrese"]', 'person.email', normEmail(first('E-pasta adrese')));
    ev.person.phone = take('namedValues["Tālrunis"]', 'person.phone', normPhone(first('Tālrunis')));
    ev.meta = { programme: take('namedValues["Programma"]', 'person.programme', first('Programma')) };
    ev.source.channel = 'website'; ev.source.detail = 'google-form';
    ev.consent = { admissions: true, marketing: first('Piekrītu saņemt informāciju par studijām') === 'Jā' };
    map.push({ from: 'Piekrītu saņemt informāciju par studijām', to: 'consent.marketing', value: String(ev.consent.marketing) });
    ev.subject = 'Applied through the Google form';
    ev.body = plainSubmission({
      programme: ev.meta.programme, phone: ev.person.phone,
      email: ev.person.email, consent: ev.consent,
    });
  } else if (channelId === 'gmail') {
    const body = raw.plaintextBody || '';
    const fields = {};
    for (const line of body.split('\n')) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      fields[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    }
    const senderEmail = (EMAIL_RE.exec(raw.sender || '') || [])[0] || null;
    const isNotification = senderEmail === 'edu@novikontas.org' && !!fields['e-pasts'];
    ev.externalId = 'gmail:' + raw.id;
    ev.occurredAt = raw.date;
    ev.person.name = take(isNotification ? 'body "Vārds:"' : 'From header', 'person.name',
      fields['vārds'] || (/^\s*"?([^"<]+?)"?\s*</.exec(raw.sender || '') || [])[1] || null);
    ev.person.email = take(isNotification ? 'body "E-pasts:"' : 'From header', 'person.email', normEmail(fields['e-pasts'] || senderEmail));
    ev.person.phone = take(isNotification ? 'body "Tālrunis:"' : 'body text', 'person.phone',
      normPhone(fields['tālrunis'] || (/(?:\+\d[\d\s().-]{6,}\d|\b[2-9]\d{7}\b)/.exec(body) || [])[0]));
    ev.source.channel = isNotification ? 'event' : 'email';
    ev.source.campaign = isNotification ? 'piemeri-profesiju' : null;
    // A real email keeps its own subject, whatever language the sender used - that
    // is their words. Our own booking notification does not: it is the system
    // talking, so it says what happened in the interface language.
    ev.subject = isNotification
      ? 'Booked a visit through the website'
      : take('subject', 'event.subject', raw.subject);
    ev.body = isNotification ? `Booked a visit. Profession: ${fields['profesija'] || '-'}, ${fields['datums'] || ''} ${fields['laiks'] || ''}` : body;
    ev.consent = { admissions: true };
  } else if (channelId === 'mailchimp') {
    const email = normEmail(raw['data[email]']);
    ev.externalId = `mailchimp:${raw.type}:${email}:${raw.fired_at}`;
    ev.occurredAt = new Date(raw.fired_at.replace(' ', 'T') + 'Z').toISOString();
    ev.person.email = take('data[email]', 'person.email', email);
    ev.person.name = take('data[merges][FNAME] + [LNAME]', 'person.name',
      [raw['data[merges][FNAME]'], raw['data[merges][LNAME]']].filter(Boolean).join(' ') || null);
    ev.source.campaign = take('data[list_id]', 'source.campaign (only if new)', raw['data[list_id]']);
    ev.subject = { subscribe: 'Signed up for the newsletter', unsubscribe: 'Unsubscribed',
      profile: 'Updated their details', cleaned: 'Their email address stopped working',
      upemail: 'Changed their email address' }[raw.type] || 'Newsletter';
    ev.body = { subscribe: 'Subscribed to the newsletter', unsubscribe: 'Unsubscribed from the newsletter', profile: 'Updated the profile',
      cleaned: 'Address bounced (' + (raw['data[reason]'] || '') + ')', upemail: 'Changed the email to ' + (raw['data[new_email]'] || '') }[raw.type] || raw.type;
    ev.consentChange = raw.type === 'unsubscribe' ? { marketing: 'withdrawn' } : raw.type === 'subscribe' ? { marketing: 'given' } : null;
  } else if (channelId === 'facebook' || channelId === 'instagram' || channelId === 'whatsapp') {
    const entry = raw.entry?.[0] || {};
    const change = entry.changes?.[0];
    if (change?.field === 'leadgen') {
      const v = change.value;
      ev.externalId = 'leadgen:' + v.leadgen_id;
      ev.occurredAt = new Date(v.created_time * 1000).toISOString();
      ev.person.name = take('full_name', 'person.name', v.full_name);
      ev.person.email = take('email', 'person.email', normEmail(v.email));
      ev.person.phone = take('phone_number', 'person.phone', normPhone(v.phone_number));
      ev.source.channel = 'facebook'; ev.source.campaign = take('ad_id', 'source.campaign', v.ad_id); ev.source.detail = 'lead ad';
      ev.meta = { programme: v.programme || null };
      ev.subject = 'Facebook lead form'; ev.body = 'Filled in the advertising lead form';
      ev.consent = { admissions: true, marketing: false };
    } else if (change?.field === 'messages') {
      const v = change.value;
      const m = v.messages[0];
      ev.externalId = 'wa:' + m.id;
      ev.occurredAt = new Date(Number(m.timestamp) * 1000).toISOString();
      ev.person.name = take('contacts[0].profile.name', 'person.name', v.contacts?.[0]?.profile?.name);
      ev.person.phone = take('messages[0].from', 'person.phone', normPhone('+' + m.from));
      ev.source.channel = 'whatsapp';
      ev.subject = 'WhatsApp message'; ev.body = m.text?.body || '[' + m.type + ']';
      ev.window = { opensAt: ev.occurredAt, closesAt: new Date(Date.parse(ev.occurredAt) + 24 * 3600000).toISOString() };
      ev.consent = { admissions: true };
    } else if (entry.messaging?.[0]) {
      const msg = entry.messaging[0];
      const isIg = raw.object === 'instagram';
      ev.externalId = (isIg ? 'ig:' : 'fb:') + msg.message.mid;
      ev.occurredAt = new Date(msg.timestamp).toISOString();
      ev.person.handle = take('sender.id', 'person.handle', msg.sender.id);
      const inText = (EMAIL_RE.exec(msg.message.text || '') || [])[0];
      if (inText) ev.person.email = take('message text', 'person.email', normEmail(inText));
      ev.source.channel = isIg ? 'instagram' : 'facebook'; ev.source.detail = 'direct message';
      ev.subject = (isIg ? 'Instagram' : 'Facebook') + ' message'; ev.body = msg.message.text;
      ev.consent = { admissions: true };
    }
  } else if (channelId === 'agent') {
    ev.externalId = 'agent:' + (built.agent || 'unknown') + ':' + (raw.passport || raw.email);
    ev.person.name = take('name', 'person.name', raw.name);
    ev.person.email = take('email', 'person.email', normEmail(raw.email));
    ev.person.phone = take('phone', 'person.phone', normPhone(raw.phone));
    ev.source.channel = 'agent';
    ev.source.campaign = take('token -> agent (NOT the typed field)', 'source.campaign', built.agent);
    ev.meta = { programme: raw.programme, country: raw.country };
    ev.subject = 'Agent application'; ev.body = `Programme: ${raw.programme}, ${raw.country}`;
    ev.consent = { admissions: true, marketing: false };
  } else if (channelId === 'open_day') {
    ev.externalId = 'open_day:' + raw.booking_id;
    ev.occurredAt = raw.created_at;
    ev.person.name = take('name', 'person.name', raw.name);
    ev.person.email = take('email', 'person.email', normEmail(raw.email));
    ev.person.phone = take('phone', 'person.phone', normPhone(raw.phone));
    ev.source.channel = 'event'; ev.source.campaign = 'piemeri-profesiju'; ev.source.detail = take('professions', 'source.detail', raw.professions);
    ev.subject = 'Booked a visit'; ev.body = `Visit ${raw.visit_date} ${raw.visit_time}. Professions: ${raw.professions}`;
    ev.consent = { admissions: raw.consent_admissions === true };
    ev.booking = { date: raw.visit_date, time: raw.visit_time };
  } else if (channelId === 'klatiene') {
    ev.externalId = 'klatiene:' + (raw.email || raw.phone || raw.name) + ':' + raw.at;
    ev.occurredAt = raw.at;
    ev.person.name = take('name', 'person.name', raw.name);
    ev.person.email = take('email', 'person.email', normEmail(raw.email));
    ev.person.phone = take('phone', 'person.phone', normPhone(raw.phone));
    ev.source.channel = 'klatiene'; ev.source.detail = take('by', 'source.detail', 'entered by ' + raw.by);
    ev.subject = 'Walk-in at reception'; ev.body = raw.note;
    ev.consent = { admissions: raw.consent_admissions === true };
  } else if (channelId === 'phone') {
    ev.externalId = 'phone:' + (raw.phone || raw.from) + ':' + (raw.at || raw.started_at);
    ev.occurredAt = raw.at || raw.started_at;
    ev.person.phone = take(raw.from ? 'from' : 'phone', 'person.phone', normPhone(raw.phone || raw.from));
    ev.source.channel = 'phone';
    ev.subject = raw.disposition ? `Call: ${raw.disposition} (${raw.duration_seconds}s)` : `Call: ${raw.outcome}`;
    ev.body = raw.note || '';
    ev.nextAction = raw.next_action ? { label: raw.next_action, days: raw.next_days || 3 } : null;
  }
  return { ev, map };
}

// ------------------------------------------------------------------ the run --
export async function runScenario(db, channelId, scenarioId) {
  const ch = channel(channelId);
  if (!ch) throw new Error('unknown channel ' + channelId);
  const scenario = (ch.scenarios || []).find((s) => s.id === scenarioId) || { id: scenarioId, label: scenarioId, kind: 'inbound' };
  const steps = [];
  const at = nowIso();
  const step = (name, detail, ok = true) => { steps.push({ step: name, detail, ok }); };

  INVENTED = false;
  const built = await BUILDERS[channelId](db, scenarioId);
  if (INVENTED) {
    step('empty table', 'this scenario needs somebody who already exists, and the table was empty, so the other party was invented for the test', true);
  }
  if (channelId === 'agent') built.agent = AGENT_TOKENS[built.raw.token] || null;
  step('provider', `${ch.account.label} produced a ${scenario.label.toLowerCase()}`);
  step('transport', built.transport);

  // 1. authentication, the way the real provider does it.
  //    The builder states its intent in built.auth.ok; a failure it declared is
  //    never talked back up to a pass by this block.
  let authOk = built.auth.ok;
  const isMeta = ['facebook', 'instagram', 'whatsapp'].includes(channelId);
  const isWebhookPost = isMeta && !!built.raw?.object;
  if (isWebhookPost && authOk && !built.signature) {
    // a genuine delivery: Meta signs the raw body with the app secret
    built.signature = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(JSON.stringify(built.raw)).digest('hex');
  }
  if (isWebhookPost) {
    const expected = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(JSON.stringify(built.raw)).digest('hex');
    authOk = !!built.signature && built.signature === expected;
  }
  if (isMeta && !isWebhookPost) {
    // the GET verification handshake: the verify token is the whole check
    authOk = built.raw['hub.verify_token'] === VERIFY_TOKEN;
  }
  if (channelId === 'mailchimp') authOk = built.secret === MAILCHIMP_SECRET;
  if (channelId === 'google_form' && scenarioId === 'bad_secret') authOk = false;
  if (channelId === 'agent') authOk = !!built.agent;

  step('authentication', `${built.auth.type}: ${authOk ? 'accepted' : 'REFUSED - ' + (built.auth.reason || 'did not verify')}`, authOk);
  if (!authOk) return record(db, { ch, scenario, at, steps, built, decision: 'rejected', status: 'refused',
    crmResult: { note: 'Nothing was written. An unauthenticated delivery never reaches the CRM.' } });

  if (scenario.kind === 'check') {
    step('handshake', `challenge ${built.raw['hub.challenge']} echoed back to Meta`);
    return record(db, { ch, scenario, at, steps, built, decision: 'verified', status: 'ok',
      crmResult: { note: 'Verification only. No person and no timeline entry: this is the call Meta makes before it will send anything.' } });
  }

  if (built.fail) {
    step('delivery', built.fail, false);
    return record(db, { ch, scenario, at, steps, built, decision: 'nothing arrived', status: 'refused',
      crmResult: { note: 'This is the silent failure. Nothing errors, nothing arrives, and only a staleness check notices.' } });
  }
  if (built.notAvailable) {
    step('capability', 'This channel has no provider. The payload below is what an automatic call event WOULD look like.', false);
    return record(db, { ch, scenario, at, steps, built, decision: 'not available', status: 'refused',
      crmResult: { note: 'NOT AVAILABLE / NOT CONNECTED UNTIL PROVIDER CONFIRMED. Nothing was written.' } });
  }
  if (built.malformed) {
    step('parse', 'the payload has a leadgen change with no value object', false);
    return record(db, { ch, scenario, at, steps, built, decision: 'error', status: 'error',
      crmResult: { note: 'Refused at the door rather than half-written. A malformed delivery is logged and dropped.' } });
  }

  // 2. the second call, where the provider only notifies
  if (built.fetch) {
    step('fetch', `the notification carried no answers, so we called ${built.fetch.call}`);
  }
  if (built.push) {
    step('push', `Pub/Sub said mailbox ${built.push.emailAddress} changed at historyId ${built.push.historyId}; we called history.list then messages.get`);
  }

  // 3. normalise and map
  const { ev, map } = normalise(channelId, built, scenarioId);
  step('normalise', `email=${ev.person.email || '-'} phone=${ev.person.phone || '-'} handle=${ev.person.handle || '-'}`);
  step('mapping', `${map.length} fields mapped`);

  // 4. idempotency
  const dup = await db.prepare('SELECT id, person_id FROM sim_events WHERE external_id = ? AND status = ?').get(ev.externalId, 'ok');
  if (dup) {
    step('idempotency', `external id ${ev.externalId} already on the timeline, nothing written`, true);
    return record(db, { ch, scenario, at, steps, built, ev, map, decision: 'duplicate-ignored', status: 'ok', personId: dup.person_id,
      crmResult: { personId: dup.person_id, note: 'The provider retried. One event, one timeline entry.' } });
  }

  // 5. required fields
  if (channelId === 'website_form' && !ev.person.email) {
    step('required fields', 'person.email is required on this channel and is missing', false);
    return record(db, { ch, scenario, at, steps, built, ev, map, decision: 'rejected', status: 'refused',
      crmResult: { note: 'Refused. Nothing half-written.' } });
  }

  // 6. identity
  const hits = await findPerson(db, ev.person);
  const distinct = [...new Set(hits.map((h) => h.id))];
  const identity = { looked: ev.person, hits, rule: 'email, then phone, then handle. A name never creates a match.' };
  if (distinct.length > 1) {
    step('identity', `conflict: ${hits.map((h) => h.key + ' -> ' + h.id).join(' vs ')}. Never merged.`, false);
    return record(db, { ch, scenario, at, steps, built, ev, map, identity, decision: 'review', status: 'ok',
      crmResult: { note: 'Sent to the review queue. Two different people carry these identifiers and only a human may decide.' } });
  }

  let personId = distinct[0] || null;
  let decision;
  if (personId) {
    decision = 'matched-' + hits[0].key;
    step('identity', `${decision}: ${personId}`);
  } else if (!ev.person.email && !ev.person.phone) {
    step('identity', 'no email and no phone, only a provider handle. A half-person is not created.', false);
    return record(db, { ch, scenario, at, steps, built, ev, map, identity, decision: 'review', status: 'ok',
      crmResult: { note: 'Sent to the review queue. A direct message carries no identifier we can match on.' } });
  } else {
    decision = 'created';
    step('identity', 'nothing matched, so a new person is created');
  }

  // 7. write to the CRM
  const crmResult = await writeToCrm(db, { channelId, ev, personId, decision, scenarioId, account: ch.account.label, typedBy: built.raw && built.raw.by });
  personId = crmResult.personId;
  step('crm', crmResult.summary);
  if (crmResult.sourceNote) step('attribution', crmResult.sourceNote);
  if (crmResult.taskNote) step('next action', crmResult.taskNote);
  if (crmResult.consentNote) step('consent', crmResult.consentNote);

  return record(db, { ch, scenario, at, steps, built, ev, map, identity, decision, status: 'ok', personId, crmResult });
}

// A channel event is automatic unless a named member of staff typed it in. The
// walk-in desk and the phone log carry 'by', so they are manual actions in the
// same history as the rest - decided 23.09.2026.
async function writeToCrm(db, { channelId, ev, personId, decision, scenarioId, account, typedBy }) {
  const now = nowIso();
  const out = {};
  if (!personId) {
    personId = newId();
    await db.prepare(`INSERT INTO people (id,name,email,phone,programme,status,owner,source_channel,source_campaign,source_detail,created_at,last_contact_at,notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      personId, ev.person.name || 'Unknown', ev.person.email || null, ev.person.phone || null,
      ev.meta?.programme || null, 'New', CRMCFG.quickAddDefaults.owner,
      ev.source.channel || channelId, ev.source.campaign || null, ev.source.detail || null, now, now,
      ev.person.handle ? 'handle:' + ev.person.handle : null);
    out.created = true;
    out.sourceNote = `source stamped ${ev.source.channel || channelId}${ev.source.campaign ? ' / ' + ev.source.campaign : ''} and locked`;
  } else {
    const before = await db.prepare('SELECT source_channel, source_campaign, email, phone FROM people WHERE id = ?').get(personId);
    // first touch wins: a later event never rewrites where the person came from
    out.sourceNote = `first touch stays ${before.source_channel}${before.source_campaign ? ' / ' + before.source_campaign : ''}; this event is recorded as a later touch`;
    if (!before.email && ev.person.email) await db.prepare('UPDATE people SET email = ? WHERE id = ?').run(ev.person.email, personId);
    if (!before.phone && ev.person.phone) await db.prepare('UPDATE people SET phone = ? WHERE id = ?').run(ev.person.phone, personId);
    await db.prepare('UPDATE people SET last_contact_at = ? WHERE id = ?').run(now, personId);
  }

  const byHand = Boolean(typedBy);
  await logEvent(db, {
    personId,
    kind: byHand ? (channelId === 'phone' ? 'call' : 'note') : 'channel',
    // the channel it ARRIVED on, not where the traffic came from. A website form
    // with utm_source=instagram used to read as an Instagram message.
    channel: channelId,
    direction: byHand ? 'note' : 'in',
    at: ev.occurredAt || now,
    subject: ev.subject, body: ev.body,
    actor: byHand ? typedBy : account,
    origin: byHand ? MANUAL : AUTOMATIC,
  });

  // consent, recorded rather than assumed
  const notes = [];
  for (const [purpose, given] of Object.entries(ev.consent || {})) {
    await db.prepare('INSERT INTO consents (person_id,purpose,state,basis,source,recorded_at,note) VALUES (?,?,?,?,?,?,?)')
      .run(personId, purpose, given ? 'given' : 'not given', purpose === 'marketing' ? 'consent' : 'to be decided', channelId, now, null);
    notes.push(`${purpose}=${given ? 'given' : 'not given'}`);
  }
  if (ev.consentChange) {
    for (const [purpose, state] of Object.entries(ev.consentChange)) {
      await db.prepare('INSERT INTO consents (person_id,purpose,state,basis,source,recorded_at,note) VALUES (?,?,?,?,?,?,?)')
        .run(personId, purpose, state, 'consent', channelId, now, 'from a provider event');
      notes.push(`${purpose}=${state}`);
    }
  }
  if (notes.length) out.consentNote = notes.join(', ');

  // next action
  const label = ev.nextAction?.label || ({ website_form: 'First call', google_form: 'First call', gmail: 'Reply',
    facebook: 'Reply to the message', instagram: 'Reply to the message', whatsapp: 'Reply on WhatsApp', agent: 'Check the documents',
    open_day: 'Confirm the visit', klatiene: 'Follow-up call', phone: null, mailchimp: null }[channelId]);
  if (label) {
    const days = ev.nextAction?.days ?? 1;
    const due = new Date(Date.now() + days * 86400000).toISOString();
    await db.prepare('INSERT INTO tasks (person_id,label,due_at,owner,created_at) VALUES (?,?,?,?,?)')
      .run(personId, label, due, CRMCFG.quickAddDefaults.owner, now);
    out.taskNote = `${label}, due ${localDate(due)}`;
  }

  if (ev.booking) {
    const od = await db.prepare('SELECT id FROM open_days ORDER BY held_on DESC LIMIT 1').get();
    if (od) await db.prepare('INSERT INTO registrations (open_day_id,person_id,slot,attended,professions) VALUES (?,?,?,?,?)')
      .run(od.id, personId, ev.booking.time, null, ev.source.detail || null);
    out.bookingNote = 'registration added to the open day';
  }

  const person = await db.prepare('SELECT * FROM people WHERE id = ?').get(personId);
  out.personId = personId;
  out.person = person;
  out.summary = `${decision === 'created' ? 'created' : 'updated'} ${person.name} (${personId}), timeline entry added`;
  return out;
}

async function record(db, { ch, scenario, at, steps, built, ev, map, identity, decision, status, personId, crmResult, outbound, providerResult }) {
  const info = await db.prepare(`INSERT INTO sim_events (at,channel,provider,account,scenario,direction,transport,external_id,person_id,
    decision,status,raw,normalized,mapping,identity,steps,crm_result,outbound,provider_result,audit)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    at, ch.id, ch.account.provider, ch.account.label, scenario.id,
    scenario.kind === 'check' ? 'check' : outbound ? 'outbound' : 'inbound',
    built?.transport || null, ev?.externalId || null, personId || null, decision, status,
    JSON.stringify(built?.raw ?? null), JSON.stringify(ev ?? null), JSON.stringify(map ?? null),
    JSON.stringify(identity ?? null), JSON.stringify(steps), JSON.stringify(crmResult ?? null),
    JSON.stringify(outbound ?? null), JSON.stringify(providerResult ?? null),
    JSON.stringify({ by: 'simulator test button', account: ch.account.label, simulated: true }));
  const id = Number(info.lastInsertRowid);
  await db.prepare('UPDATE sim_events SET id = id WHERE id = ?').run(id);
  return { id, channel: ch.id, scenario: scenario.id, decision, status, personId: personId || null,
    steps, raw: built?.raw ?? null, normalized: ev ?? null, mapping: map ?? null, identity: identity ?? null,
    crmResult: crmResult ?? null, outbound: outbound ?? null, providerResult: providerResult ?? null,
    signature: built?.signature || null, transport: built?.transport || null };
}

// ---------------------------------------------------------------- outbound --
export async function runOutbound(db, channelId, personId, text) {
  const ch = channel(channelId);
  if (!ch?.outbound?.supported) throw new Error('this channel has no outbound');
  const person = await db.prepare('SELECT * FROM people WHERE id = ?').get(personId);
  if (!person) throw new Error('person not found');
  const steps = [];
  const at = nowIso();
  const step = (n, d, ok = true) => steps.push({ step: n, detail: d, ok });
  const body = text || defaultOutbound(channelId, person);

  step('crm', `staff pressed ${ch.outbound.label} on ${person.name}`);
  let providerResult = {};
  let ok = true;

  if (channelId === 'whatsapp') {
    const last = await db.prepare("SELECT occurred_at FROM events WHERE person_id = ? AND channel = 'whatsapp' ORDER BY occurred_at DESC LIMIT 1").get(personId);
    const hours = last ? (Date.now() - Date.parse(last.occurred_at)) / 3600000 : 999;
    const inWindow = hours <= 24;
    step('24 hour window', inWindow
      ? `last inbound ${hours.toFixed(1)}h ago, so a free-form reply is allowed and is free`
      : `last inbound ${hours === 999 ? 'never' : hours.toFixed(1) + 'h'} ago, so a free-form reply is NOT allowed: an approved template is required and is charged`, inWindow);
    providerResult = inWindow
      ? { messages: [{ id: 'wamid.out.' + rid() }], status: 'accepted', billing: 'free (service window)' }
      : { error: { code: 131047, message: 'Message failed to send because more than 24 hours have passed since the customer last replied' }, status: 'rejected' };
    ok = inWindow;
  } else if (channelId === 'gmail') {
    providerResult = { id: 'gmail-out-' + rid(), threadId: 'thread-' + rid(), labelIds: ['SENT'], status: 'accepted' };
    step('provider', 'the simulated mailbox accepted the message and it appears in Sent');
  } else if (channelId === 'facebook' || channelId === 'instagram') {
    providerResult = { recipient_id: 'sim-user', message_id: 'm_out_' + rid(), status: 'accepted',
      note: 'In production this needs the messaging permission with Advanced Access, which is not approved.' };
    step('permission', 'SIMULATED: the messaging permission is not approved on a real app, so this would fail today', false);
  } else if (channelId === 'mailchimp') {
    providerResult = { tag: 'CRM: application started', status: 'applied', endpoint: 'POST /lists/{list_id}/members/{hash}/tags' };
    step('provider', 'a tag was written back to the simulated audience');
  } else if (channelId === 'website_form' || channelId === 'open_day' || channelId === 'agent') {
    providerResult = { delivered: true, to: person.email, status: 'accepted' };
    step('provider', 'the simulated recipient accepted the message');
  }

  if (ok) {
    await logEvent(db, { personId, kind: 'channel', channel: channelId, direction: 'out', at,
      subject: ch.outbound.label, body, actor: 'CRM (simulated)', origin: AUTOMATIC });
    step('timeline', 'the outbound message is recorded on the person');
  } else {
    step('timeline', 'nothing was recorded as sent, because the provider refused it', false);
  }

  return record(db, { ch, scenario: { id: 'outbound', label: ch.outbound.label, kind: 'outbound' }, at, steps,
    built: { transport: 'CRM to provider API (simulated)', raw: { to: person.email || person.phone, body } },
    decision: ok ? 'sent' : 'refused by provider', status: ok ? 'ok' : 'refused', personId,
    crmResult: { personId, note: ok ? 'Outbound recorded on the timeline.' : 'Not recorded as sent.' },
    outbound: { channel: channelId, to: person.email || person.phone, body }, providerResult });
}

// Demo wording only. What Novikontas actually writes to an applicant, and in
// which language, is a separate decision nobody has made - see docs/BACKLOG.md.
function defaultOutbound(channelId, person) {
  return {
    gmail: `Hello ${person.name},\n\nThank you for your application. We will be in touch in the next few days.\n\nNovikontas Maritime College`,
    whatsapp: `Hello ${person.name}! Thank you for your message. May we call you tomorrow?`,
    facebook: `Hello! Thank you for your message, we will reply shortly.`,
    instagram: `Hello! Thank you for your message, we will reply shortly.`,
    mailchimp: 'CRM: application started',
    website_form: `Thank you for your application, ${person.name}. We will be in touch in the next few days.`,
    open_day: `We confirm your visit. See you at Duntes iela 17A.`,
    agent: `Status update: ${person.name} is at stage ${person.status}.`,
  }[channelId] || 'Thank you!';
}

// ------------------------------------------------------------- full demo ----
export const DEMO_SEQUENCE = [
  ['website_form', 'new'], ['google_form', 'apps_script'], ['gmail', 'booking_push'], ['mailchimp', 'subscribe'],
  ['facebook', 'lead'], ['instagram', 'message'], ['whatsapp', 'inbound'], ['agent', 'lead'],
  ['open_day', 'book'], ['klatiene', 'walk_in'], ['phone', 'log'],
];

export async function runFullDemo(db) {
  const results = [];
  for (const [ch, sc] of DEMO_SEQUENCE) {
    try { results.push(await runScenario(db, ch, sc)); }
    catch (err) { results.push({ channel: ch, scenario: sc, status: 'error', decision: 'error', error: err.message, steps: [] }); }
  }
  // outbound where the channel supports it and we have a person
  const outbound = [];
  for (const [ch] of DEMO_SEQUENCE) {
    const c = channel(ch);
    if (!c?.outbound?.supported) continue;
    const last = results.find((r) => r.channel === ch && r.personId);
    if (!last) continue;
    try { outbound.push(await runOutbound(db, ch, last.personId)); } catch { /* skip */ }
  }
  const tally = {
    channelsTested: new Set(results.map((r) => r.channel)).size,
    inbound: results.length,
    created: results.filter((r) => r.decision === 'created').length,
    matched: results.filter((r) => String(r.decision).startsWith('matched')).length,
    duplicates: results.filter((r) => r.decision === 'duplicate-ignored').length,
    review: results.filter((r) => r.decision === 'review').length,
    rejected: results.filter((r) => ['rejected', 'error', 'not available', 'nothing arrived'].includes(r.decision)).length,
    outboundEvents: outbound.length,
    outboundRefused: outbound.filter((o) => o.status !== 'ok').length,
    productionSystemsTouched: 0,
  };
  return { results, outbound, tally };
}

// ---------------------------------------------------------------- readers ---
export async function listEvents(db, limit = 200) {
  return await db.prepare(`SELECT s.id, s.at, s.channel, s.provider, s.account, s.scenario, s.direction, s.transport,
    s.external_id, s.person_id, s.decision, s.status, p.name AS person_name
    FROM sim_events s LEFT JOIN people p ON p.id = s.person_id ORDER BY s.id DESC LIMIT ?`).all(limit);
}
export async function getEvent(db, id) {
  const r = await db.prepare('SELECT * FROM sim_events WHERE id = ?').get(id);
  if (!r) return null;
  for (const k of ['raw', 'normalized', 'mapping', 'identity', 'steps', 'crm_result', 'outbound', 'provider_result', 'audit']) {
    try { r[k] = JSON.parse(r[k]); } catch { /* leave as is */ }
  }
  if (r.person_id) r.person = await db.prepare('SELECT id,name,email,phone,status,source_channel,source_campaign,source_detail FROM people WHERE id = ?').get(r.person_id);
  return r;
}
export async function consentFor(db, personId) {
  return await db.prepare('SELECT * FROM consents WHERE person_id = ? ORDER BY id DESC').all(personId);
}
export async function consentSummary(db) {
  return await db.prepare(`SELECT purpose, state, COUNT(*) n FROM consents GROUP BY purpose, state ORDER BY purpose`).all();
}
