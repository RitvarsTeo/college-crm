// Provider-shaped payloads, one per channel.
//
// These are what each provider's event actually looks like, as far as it is
// known. They are used by BOTH the local simulator and the test suite, so a
// simulated event can never quietly diverge from the thing the tests verify.
//
// Where a provider's shape is NOT confirmed - LinkedIn and TikTok - the fixture
// is OUR contract rather than theirs, and config/channels.json marks the channel
// capability_unconfirmed so the two are never mistaken for each other.

export const FIXTURES = {
  website: { submission_id: 'web-1', submitted_at: '2026-09-24T10:00:00.000Z',
    name: 'Anna Website', email: 'anna@example.lv', phone: '+371 20 111 222',
    programme: 'NAV', study_form: 'Full time', consent_admissions: true, consent_marketing: false,
    utm_source: 'instagram', utm_medium: 'paid', utm_campaign: 'nav-2026-09' },

  google_form: { responseId: 'gf-1', timestamp: '2026-09-24T10:01:00.000Z', formId: 'form-abc',
    namedValues: { 'Vārds uzvārds': ['Elza Forma'], 'E-pasta adrese': ['elza@example.lv'],
      'Tālrunis': ['+371 29 155 244'], 'Programma': ['ENG'],
      'Piekrītu saņemt informāciju par studijām': ['Jā'] } },

  gmail: { id: 'gm-1', threadId: 'th-1', date: '2026-09-24T10:02:00.000Z',
    sender: '"Raivis Bresis" <raivis@example.lv>', subject: 'Jautajums par studijam',
    plaintextBody: 'Labdien, gribu uzzinat par NAV programmu.', attachments: [{ filename: 'cv.pdf', size: 1024 }] },

  facebook: { object: 'page', entry: [{ id: 'page-1', time: 1758708000000,
    messaging: [{ sender: { id: 'fb-user-1' }, recipient: { id: 'page-1' }, timestamp: 1758708000000,
      message: { mid: 'fb-msg-1', text: 'Hi, do you have a marine engineering course?' } }] }] },

  instagram: { object: 'instagram', entry: [{ id: 'ig-1', time: 1758708060000,
    messaging: [{ sender: { id: 'ig-user-1', username: 'darja.s' }, recipient: { id: 'ig-1' },
      timestamp: 1758708060000, message: { mid: 'ig-msg-1', text: 'hello' } }] }] },

  messenger: { object: 'page', entry: [{ id: 'page-1', time: 1758708030000,
    messaging: [{ sender: { id: 'msgr-user-1' }, recipient: { id: 'page-1' }, timestamp: 1758708030000,
      message: { mid: 'msgr-msg-1', text: 'Hello, is the navigation course still open?' } }] }] },

  whatsapp: { object: 'whatsapp_business_account', entry: [{ id: 'wa-1', changes: [{ field: 'messages',
    value: { messaging_product: 'whatsapp', contacts: [{ wa_id: '37120423829', profile: { name: 'Emils B' } }],
      messages: [{ id: 'wa-msg-1', from: '37120423829', timestamp: '1758708120',
        type: 'text', text: { body: 'I want the wind turbine programme' } }] } }] }] },

  mailchimp: { type: 'subscribe', fired_at: '2026-09-24 10:03:00',
    'data[email]': 'marta@example.lv', 'data[id]': 'mc-member-1',
    'data[merges][FNAME]': 'Marta', 'data[merges][LNAME]': 'Liepa' },

  open_day: { booking_ref: 'od-1', event_id: 'openday-2026-10', booked_at: '2026-09-24T10:04:00.000Z',
    name: 'Gatis Purmalis', email: 'gatis@example.lv', phone: '+37126551234',
    programme: 'NAV', slot: '14:00' },

  phone: { uniqueid: 'pbx-1', created_at: '2026-09-24 13:05:00', queue: '1001*Q-ADMISSION',
    caller_num: '+37129000111', picked_up: '1', operator_name: 'Ieva' },

  agent: { partner_id: 'india-partner-1', partner_name: 'India Partner', partner_ref: 'REF-77',
    submitted_at: '2026-09-24T10:06:00.000Z', name: 'Arun Kumar', email: 'arun@example.in',
    phone: '+911234567890', programme: 'NAV', notes: 'Referred by our Delhi office' },

  in_person: { entry_id: 'walk-1', at: '2026-09-24T10:07:00.000Z', name: 'Liene Kalnina',
    phone: '+37120999888', programme: 'NAV', what_they_said: 'Came to reception asking about NAV',
    by: 'Ieva' },

  linkedin: { entry_id: 'li-1', at: '2026-09-24T10:08:00.000Z', name: 'Anna Berzina',
    handle: 'in/anna-berzina', what_they_said: 'Asked which documents are needed', by: 'Tetiana' },

  tiktok: { entry_id: 'tt-1', at: '2026-09-24T10:09:00.000Z', handle: '@somebody',
    what_they_said: 'Do you have scholarships?', by: 'Tetiana' },
};

// A fresh id each time, so simulating twice is two events rather than a retry -
// unless the caller deliberately asks for the same one to test idempotency.
export function fixtureFor(channel, { sameId = false } = {}) {
  const base = FIXTURES[channel];
  if (!base) return null;
  const raw = JSON.parse(JSON.stringify(base));
  if (sameId) return raw;
  const uniq = '-' + Math.random().toString(36).slice(2, 8);
  const bump = (o, key) => { if (o && o[key]) o[key] = String(o[key]) + uniq; };
  bump(raw, 'submission_id'); bump(raw, 'responseId'); bump(raw, 'id');
  bump(raw, 'booking_ref'); bump(raw, 'uniqueid'); bump(raw, 'partner_ref'); bump(raw, 'entry_id');
  if (raw.fired_at) raw.fired_at = raw.fired_at;
  if (raw['data[email]']) raw['data[email]'] = uniq.slice(1) + '.' + raw['data[email]'];
  const m = raw.entry && raw.entry[0] && raw.entry[0].messaging && raw.entry[0].messaging[0];
  if (m && m.message) bump(m.message, 'mid');
  const w = raw.entry && raw.entry[0] && raw.entry[0].changes && raw.entry[0].changes[0];
  if (w && w.value && w.value.messages && w.value.messages[0]) bump(w.value.messages[0], 'id');
  return raw;
}

export const fixtureChannels = () => Object.keys(FIXTURES);
