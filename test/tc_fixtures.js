// SYNTHETIC Training Centre files in TC-DATA's shape (companies.csv, contacts.csv, courses.csv), for the tests and the
// local screenshots. Every name, address and email here is invented (example.com); the real files never enter git, a
// test or a screenshot. Not a test file itself: the suite runs test/*.test.js.

const ADJ = ['Example', 'Sample', 'Demo', 'Placeholder', 'Test', 'Mock', 'Model', 'Specimen', 'Pilot', 'Draft', 'Dummy', 'Fictive'];
const NOUN = ['Tankers', 'Offshore', 'Shipmanagement', 'Wind', 'Marine', 'Crewing', 'Energy', 'Shipping', 'Drilling', 'Logistics',
  'Subsea', 'Ferries', 'Towage', 'Dredging', 'Bulk'];
const PLACES = [['Norway', 'Bergen', 'AS'], ['Germany', 'Hamburg', 'GmbH'], ['Cyprus', 'Limassol', 'Ltd'], ['Netherlands', 'Rotterdam', 'BV'],
  ['Poland', 'Gdynia', 'Sp. z o.o.'], ['Latvia', 'Riga', 'SIA'], ['Lithuania', 'Klaipeda', 'UAB'], ['Denmark', 'Esbjerg', 'ApS'],
  ['United Kingdom', 'Aberdeen', 'Ltd'], ['Estonia', 'Tallinn', 'OU'], ['Sweden', 'Gothenburg', 'AB'], ['', '', '']];
const PICS = ['Sales Example', 'TC Manager Example', ''];
const STATUSES = ['not_contacted', 'not_set', 'contacted', 'contacted', 'to_contact', 'met', 'focus'];
const CODES = ['GWO BST', 'BOSIET', 'HUET', 'FOET', 'MEWP', 'IRATA LV', 'EFA', 'SSO', 'BRM'];

// a small seeded generator: the same files every run
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const q = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const csv = (cols, rows) => '\uFEFF' + [cols.join(','), ...rows.map((r) => cols.map((c) => q(r[c])).join(','))].join('\r\n') + '\r\n';
const addDays = (ymd, n) => { const d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export const COMPANY_COLS = ['company_id', 'name', 'name_key', 'conservative_key', 'other_names', 'country', 'name_tag_country', 'all_countries',
  'city', 'address', 'website', 'web_domain', 'area_tc', 'area_energy', 'area_opito', 'area_projects', 'area_other', 'area_raw', 'status',
  'status_channel', 'activity_raw', 'person_in_charge', 'last_communication', 'next_communication', 'topics', 'comments', 'info_to_send',
  'extra_note', 'has_email_draft', 'year_column', 'main_rows', 'n_main_rows', 'email_domains', 'client_status', 'courses_total',
  'last_course_year', 'course_codes', 'courses_by_year', 'exhibitions', 'calendar_gift', 'vendor_registration', 'country_tab_notes',
  'legacy_lists', 'side_tabs', 'filled_from_side_tabs', 'clienthub_match'];
export const CONTACT_COLS = ['contact_id', 'company_id', 'name', 'role', 'email', 'email_domain', 'phone', 'kind', 'parse_quality', 'source_tabs',
  'source_row', 'raw_text'];
export const COURSE_COLS = ['company_id', 'source_tab', 'source_row', 'is_primary', 'year', 'count', 'course_codes', 'note', 'raw_line', 'parsed'];

/** n companies around `today`; returns { files, facts } where facts are what a test can expect. */
export function synthFiles({ n = 40, today = '2026-10-19', seed = 7 } = {}) {
  const r = rng(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const companies = [], contacts = [], courses = [];
  const used = new Set();
  for (let i = 1; i <= n; i++) {
    const [country, city, legal] = PLACES[i % PLACES.length];
    let name = `${ADJ[i % ADJ.length]} ${NOUN[(i * 7) % NOUN.length]}${legal ? ' ' + legal : ''}`;
    while (used.has(name + country)) name += ' Group';
    used.add(name + country);
    const key = name.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
    const id = 'tc_' + String(i).padStart(8, '0');
    const nextOffset = [-9, -3, 0, 2, 5, 12, 30, null][i % 8];
    const lastOffset = [-40, -15, -400, null][i % 4];
    companies.push({
      company_id: id, name, name_key: key, country, city, address: city ? `${i} Example Street, ${city}` : '',
      website: `www.${key.replace(/ /g, '')}.example.com`, area_tc: i % 2 ? '1' : '0', area_energy: i % 3 === 0 ? '1' : '0',
      area_opito: i % 7 === 0 ? '1' : '0', area_projects: i % 11 === 0 ? '1' : '0', area_other: '',
      status: STATUSES[i % STATUSES.length], status_channel: STATUSES[i % STATUSES.length] === 'met' ? pick(['physical_meeting', 'digital_meeting', 'exhibition']) : '',
      person_in_charge: PICS[i % PICS.length],
      last_communication: i === 5 ? '1990-01-13' : lastOffset === null ? '' : addDays(today, lastOffset),
      next_communication: i === 6 ? '1990-02-03' : nextOffset === null ? '' : addDays(today, nextOffset),
      topics: i % 4 === 1 ? 'Course dates, prices' : '', comments: i % 5 === 0 ? 'Prefers "short" offers, by email; English.' : '',
      info_to_send: i % 6 === 0 ? 'Price list 2027' : '', main_rows: String(i + 1), calendar_gift: i % 9 === 0 ? 'Foreign calendars=1 done=False' : '',
    });
    const people = 1 + (i % 3);
    for (let k = 1; k <= people; k++) {
      contacts.push({ contact_id: `${id}_c${k}`, company_id: id, name: k === 3 ? '' : `Person ${i}-${k} Example`, role: k === 1 ? 'Crewing manager' : '',
        email: k === 2 && i % 4 === 0 ? '' : `person${i}.${k}@example.com`, phone: k === 1 ? `+371 2000 ${String(1000 + i)}` : '',
        kind: 'person', parse_quality: 'parsed', source_tabs: 'LIST OF COMPANIES', source_row: String(i + 1), raw_text: '' });
    }
    if (i % 4 !== 3) {   // three companies in four have course lines; some years are zero
      for (const year of [2022, 2023, 2024, 2025]) {
        const count = (i + year) % 5 === 0 ? 0 : Math.floor(r() * 12);
        const codes = [pick(CODES), pick(CODES)].filter((v, x, a) => a.indexOf(v) === x);
        courses.push({ company_id: id, source_tab: 'LIST OF COMPANIES', source_row: String(i + 1), is_primary: '1', year: String(year),
          count: String(count), course_codes: codes.join(' ; '), note: '', raw_line: `${year} - ${count} (${codes.join(', ')})`, parsed: '1' });
      }
      courses.push({ company_id: id, source_tab: 'Clients and Companies in German', source_row: '3', is_primary: '0', year: '2021',
        count: '4', course_codes: 'GWO BST', note: '', raw_line: '2021 - 4 (GWO BST)', parsed: '1' });
    }
  }
  return {
    files: { 'companies.csv': csv(COMPANY_COLS, companies), 'contacts.csv': csv(CONTACT_COLS, contacts), 'courses.csv': csv(COURSE_COLS, courses) },
    facts: { companies, contacts, courses },
  };
}
