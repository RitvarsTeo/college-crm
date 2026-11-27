// NEWSLETTERS (27.11.2026). The owner's pick 26.11.2026 "ok, inside Intake": our own sender for the client newsletters, like
// a free Mailchimp, with filters for N3 data. Its own tab at the top of the side menu, open ONLY to the people named in
// config "newsletterUsers" (checked on the server, every request). The look: his pick 27.11.2026 "i like this side".
//
// WHAT THIS FILE DOES TODAY: the audience builder on EXAMPLE rows, so the screens work before the N3 data is connected.
// The N3 connection replaces exampleRows() with real rows of the same shape; nothing else changes.
// WHAT IT NEVER DOES: send. There is no send route in Intake. The send is wired last, after the sender is chosen.

export const FILTERS = {
  who: { label: 'Who', options: [['b2b', 'Companies'], ['b2c', 'Private people']] },
  course: { label: 'Course they took', options: ['GWO BST', 'BOSIET', 'HUET', 'IRATA', 'ECDIS', 'GMDSS'].map((c) => [c, c]) },
  last: { label: 'Last course', options: [['this', 'This year'], ['1-2', '1-2 years ago'], ['3+', '3+ years ago']] },
  expires: { label: 'Certificate runs out', options: [['3', 'in 3 months'], ['6', 'in 6 months'], ['any', 'Any time']] },
  country: { label: 'Country', options: ['Latvia', 'Norway', 'Denmark', 'Lithuania', 'Estonia', 'Germany'].map((c) => [c, c]) },
  language: { label: 'Language', options: [['en', 'English'], ['lv', 'Latvian']] },
};

export const DEFAULT_PICK = { who: ['b2b'], course: ['GWO BST'], last: [], expires: ['3'], country: ['Norway', 'Denmark'], language: ['en'] };

/** May this person open the Newsletters tab? The name comes from the signed session (viewerOf), never the browser. */
export const mayOpenNewsletter = (who, list) => Boolean(who) && Array.isArray(list) && list.includes(String(who));

// EXAMPLE ROWS: made-up names only ("Example ...", "Sample ..."), the same every time, in the shape N3 rows will have.
const CO = ['Example Wind', 'Sample Offshore', 'Demo Marine', 'Nordic Example', 'Test Shipping', 'Example Crew', 'Sample Rig', 'Demo Tankers'];
const PP = ['Janis Example', 'Anna Sample', 'Peter Demo', 'Liga Example', 'Marta Sample', 'Oskars Demo'];
const SUFFIX = { Norway: 'AS', Denmark: 'ApS', Latvia: 'SIA', Lithuania: 'UAB', Estonia: 'OU', Germany: 'GmbH' };
// A fixed seed, so the example is the same on every load and in every test.
const seeded = (seed) => () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const weighted = (rnd, pairs) => { let x = rnd() * pairs.reduce((s, p) => s + p[1], 0); for (const [v, w] of pairs) { x -= w; if (x < 0) return v; } return pairs[0][0]; };
export function exampleRows(today = '2026-11-27') {
  const rnd = seeded(27112026);
  const year = Number(today.slice(0, 4));
  const rows = [];
  for (let i = 0; i < 2400; i++) {
    const b2b = rnd() < 0.67;
    const country = weighted(rnd, [['Latvia', 30], ['Norway', 20], ['Denmark', 15], ['Lithuania', 12], ['Estonia', 10], ['Germany', 13]]);
    const course = weighted(rnd, [['GWO BST', 40], ['BOSIET', 18], ['HUET', 15], ['IRATA', 10], ['ECDIS', 9], ['GMDSS', 8]]);
    const lastYear = year - Math.floor(rnd() * 5);
    const month = Math.floor(rnd() * 12) + 1;
    const runsOutMonths = Math.floor(rnd() * 18);   // months from today
    rows.push({
      id: 'ex' + i,
      kind: b2b ? 'b2b' : 'b2c',
      name: b2b ? `${CO[i % CO.length]} ${SUFFIX[country]}${i >= CO.length ? ' ' + (Math.floor(i / CO.length) + 1) : ''}` : `${PP[i % PP.length]}${i >= PP.length * 3 ? ' ' + (Math.floor(i / PP.length) + 1) : ''}`,
      country,
      course,
      lastCourse: `${lastYear}-${String(month).padStart(2, '0')}`,
      runsOutIn: runsOutMonths,
      language: country === 'Latvia' ? 'lv' : 'en',
      email: rnd() < 0.04 ? '' : `contact${i}@example.com`,
      unsubscribed: rnd() < 0.06,
    });
  }
  return rows;
}

const lastBucket = (r, year) => { const y = Number(r.lastCourse.slice(0, 4)); return y === year ? 'this' : year - y <= 2 ? '1-2' : '3+'; };
const pass = (r, pick, year) => {
  const has = (k, v) => !pick[k] || !pick[k].length || pick[k].includes(v);
  if (!has('who', r.kind) || !has('course', r.course) || !has('country', r.country) || !has('language', r.language)) return false;
  if (!has('last', lastBucket(r, year))) return false;
  const exp = (pick.expires || [])[0];
  if (exp === '3' && r.runsOutIn > 3) return false;
  if (exp === '6' && r.runsOutIn > 6) return false;
  return true;
};

/** Clean what the screen sent: only known filters and known options. */
export function cleanPick(raw) {
  const out = {};
  for (const [k, f] of Object.entries(FILTERS)) {
    const known = new Set(f.options.map((o) => o[0]));
    const v = Array.isArray(raw && raw[k]) ? raw[k].map(String).filter((x) => known.has(x)) : [];
    out[k] = k === 'expires' ? v.slice(0, 1) : [...new Set(v)];
  }
  return out;
}

/** The audience: who matches, who is taken out (unsubscribed, no email), counts per option, the first rows. */
export function audience(rawPick, { rows = exampleRows(), today = '2026-11-27', first = 5 } = {}) {
  const pick = cleanPick(rawPick || DEFAULT_PICK);
  const year = Number(today.slice(0, 4));
  const match = rows.filter((r) => pass(r, pick, year));
  const unsub = match.filter((r) => r.unsubscribed).length;
  const noEmail = match.filter((r) => !r.unsubscribed && !r.email).length;
  const gets = match.filter((r) => !r.unsubscribed && r.email);
  // a count beside each option: how many would match if that option alone were picked in its filter
  const counts = {};
  for (const [k, f] of Object.entries(FILTERS)) {
    counts[k] = {};
    for (const [v] of f.options) counts[k][v] = rows.filter((r) => pass(r, { ...pick, [k]: [v] }, year)).length;
  }
  return {
    example: true,
    pick,
    filters: FILTERS,
    counts,
    match: match.length,
    unsubscribed: unsub,
    noEmail,
    gets: gets.length,
    companies: new Set(gets.filter((r) => r.kind === 'b2b').map((r) => r.name)).size,
    rows: gets.slice(0, first).map(({ id, kind, name, country, course, lastCourse }) => ({ id, kind, name, country, course, lastCourse })),
  };
}
