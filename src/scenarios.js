// The Console's scenario catalogue.
//
// Each one produces a provider-shaped payload and sends it down the real path:
// adapter, filter, Inbox. Nothing here writes to a table directly, so what the
// Console demonstrates is the product and not a picture of the product.

import { FIXTURES } from './fixtures.js';

// Meta Business Suite is one operational connection. The originating channel is
// still recorded on every event, because Reports must tell Instagram from
// Messenger and there is no combined "Meta" number.
export const META_GROUP = ['facebook', 'instagram', 'messenger', 'whatsapp'];

export const CHANNEL_LABELS = {
  facebook: 'Facebook', instagram: 'Instagram', messenger: 'Messenger', whatsapp: 'WhatsApp',
  website: 'Website', google_form: 'Google Form', gmail: 'Gmail', mailchimp: 'Mailchimp',
  open_day: 'Open Day', phone: 'Phone', agent: 'Agent', linkedin: 'LinkedIn', tiktok: 'TikTok',
  in_person: 'In person',
};

const SPAM = 'Hello, we offer social media promotion services, 5000 followers guaranteed, best price';
const CLEAR = "Hi, I want to study Navigation. I finished secondary school. When does it start?";
const DOCS = 'Good afternoon, which documents do I need to submit for admission?';
const PROG = 'Do you have a marine engineering programme, and is it full time?';
const UNCLEAR = 'Hi';

// what the message says, per scenario
const BODIES = {
  study_enquiry: CLEAR,
  programme_question: PROG,
  documents_question: DOCS,
  unclear: UNCLEAR,
  spam: SPAM,
};

export const SCENARIOS = [
  { id: 'study_enquiry', label: 'Study enquiry',
    what: 'Somebody says plainly what they want to study.',
    expect: 'Lands in the Inbox with the programme already read out of the message.' },
  { id: 'programme_question', label: 'Programme question',
    what: 'Asks about a programme without committing.',
    expect: 'Lands in the Inbox. A person decides whether it is an admissions case.' },
  { id: 'documents_question', label: 'Documents question',
    what: 'Asks what documents admission needs.',
    expect: 'Lands in the Inbox. This IS admissions interest, not a marketing query.' },
  { id: 'unclear', label: 'Unclear "Hi"',
    what: 'A real person who has said nothing useful yet.',
    expect: 'Lands in the Inbox. It is NOT spam and must stay visible for a person to judge.' },
  { id: 'spam', label: 'Obvious spam',
    what: 'A commercial pitch.',
    expect: 'Filtered before the Inbox. Stored, findable, and out of the funnel.' },
  { id: 'existing_person', label: 'Somebody we already have',
    what: 'A contact whose phone or email already belongs to a person in the CRM.',
    expect: 'Lands in the Inbox. Qualifying it offers the existing person rather than making a twin.' },
  { id: 'duplicate_attempt', label: 'Duplicate attempt',
    what: 'The same human writing from a second channel.',
    expect: 'Qualifying is refused and the existing person is named.' },
  { id: 'retry', label: 'Provider retry',
    what: 'The same provider event delivered twice.',
    expect: 'Stored once. Providers retry; that must never make two rows.' },
];

// Phone is not a message, so it gets its own scenarios.
export const PHONE_SCENARIOS = [
  { id: 'phone_button_1', label: 'Button 1 - Admissions', channels: ['phone'],
    what: 'A caller presses 1 and reaches the Admissions queue.',
    expect: 'A call lands in the Inbox, routed to Admissions.' },
  { id: 'phone_button_2', label: 'Button 2 - Coordinators', channels: ['phone'],
    what: 'A caller presses 2 and reaches the Coordinators queue.',
    expect: 'A call lands in the Inbox, routed to the Student Coordinator.' },
  { id: 'phone_button_3', label: 'Button 3 - Other', channels: ['phone'],
    what: 'A caller presses 3. Tetiana and Arina answer these.',
    expect: 'A call lands in the Inbox, routed to Other.' },
  { id: 'phone_missed', label: 'Missed call', channels: ['phone'],
    what: 'Nobody picked up.',
    expect: 'Still recorded. A missed call is exactly the thing that gets forgotten.' },
];

const QUEUE = {
  phone_button_1: '1001*Q-ADMISSION',
  phone_button_2: '1001*Q-COORDINATORS',
  phone_button_3: '1001*Q-OTHER',
  phone_missed: '1001*Q-ADMISSION',
};

export function scenariosFor(channel) {
  const base = channel === 'phone' ? PHONE_SCENARIOS : SCENARIOS.filter((s) => !s.channels);
  return base;
}

export const allScenarios = () => [...SCENARIOS, ...PHONE_SCENARIOS];

const rid = () => Math.random().toString(36).slice(2, 10);

// Build the provider payload for a channel and scenario. It starts from the same
// fixture the tests use, so what the Console sends is the shape that is verified.
export function buildPayload(channel, scenario, { sameId = false, existing = null, at = null, message = null } = {}) {
  const base = JSON.parse(JSON.stringify(FIXTURES[channel] || {}));
  const uniq = sameId ? '' : '-' + rid();
  // a typed message wins over the scenario's stock wording
  const body = message || (BODIES[scenario] !== undefined ? BODIES[scenario] : CLEAR);
  const when = at || new Date().toISOString();

  // an existing-person scenario reuses that person's real contact details, which
  // is what makes the duplicate check fire for a genuine reason
  const who = existing || {};
  const name = who.name || null;
  const email = who.email || null;
  const phone = who.phone || null;

  const put = (o, k, v) => { if (v !== null && v !== undefined) o[k] = v; };
  const bump = (o, k) => { if (o && o[k] !== undefined) o[k] = String(o[k]) + uniq; };

  switch (channel) {
    case 'website':
      bump(base, 'submission_id');
      base.submitted_at = when;
      put(base, 'name', name); put(base, 'email', email); put(base, 'phone', phone);
      base.message = body;
      if (scenario === 'unclear') { delete base.programme; delete base.study_form; }
      return base;

    case 'google_form':
      bump(base, 'responseId');
      base.timestamp = when;
      if (name) base.namedValues['Vārds uzvārds'] = [name];
      if (email) base.namedValues['E-pasta adrese'] = [email];
      if (phone) base.namedValues['Tālrunis'] = [phone];
      return base;

    case 'gmail':
      bump(base, 'id');
      base.date = when;
      base.plaintextBody = body;
      if (name || email) base.sender = `"${name || 'Somebody'}" <${email || 'somebody@example.lv'}>`;
      return base;

    case 'facebook': case 'instagram': case 'messenger': {
      const m = base.entry[0].messaging[0];
      bump(m.message, 'mid');
      m.timestamp = Date.parse(when);
      m.message.text = body;
      if (name) { m.sender.name = name; m.sender.username = who.handle || m.sender.username; }
      return base;
    }

    case 'whatsapp': {
      const v = base.entry[0].changes[0].value;
      bump(v.messages[0], 'id');
      v.messages[0].timestamp = String(Math.floor(Date.parse(when) / 1000));
      v.messages[0].text.body = body;
      if (phone) { v.messages[0].from = phone.replace(/\D/g, ''); v.contacts[0].wa_id = phone.replace(/\D/g, ''); }
      if (name) v.contacts[0].profile.name = name;
      return base;
    }

    case 'mailchimp':
      base.fired_at = when.slice(0, 19).replace('T', ' ');
      if (!sameId) base['data[email]'] = rid() + '.' + base['data[email]'];
      if (email) base['data[email]'] = email;
      // the fixture carries a name of its own; a named person must replace it,
      // or two different demo people arrive under one name
      if (name) {
        const parts = String(name).split(' ');
        base['data[merges][FNAME]'] = parts[0];
        base['data[merges][LNAME]'] = parts.slice(1).join(' ') || '';
      }
      return base;

    case 'open_day':
      bump(base, 'booking_ref');
      base.booked_at = when;
      put(base, 'name', name); put(base, 'email', email); put(base, 'phone', phone);
      return base;

    case 'phone':
      bump(base, 'uniqueid');
      base.created_at = when.slice(0, 19).replace('T', ' ');
      base.queue = QUEUE[scenario] || '1001*Q-ADMISSION';
      base.picked_up = scenario === 'phone_missed' ? '0' : '1';
      base.operator_name = scenario === 'phone_missed' ? '' : base.operator_name;
      if (phone) base.caller_num = phone;
      return base;

    case 'agent':
      bump(base, 'partner_ref');
      base.submitted_at = when;
      put(base, 'name', name); put(base, 'email', email); put(base, 'phone', phone);
      base.notes = body;
      return base;

    default: // in_person, linkedin, tiktok
      bump(base, 'entry_id');
      base.at = when;
      base.what_they_said = body;
      put(base, 'name', name); put(base, 'email', email); put(base, 'phone', phone);
      return base;
  }
}
