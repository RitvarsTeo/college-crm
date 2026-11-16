// THE COMPANIES NO LIST HAS YET (16.11.2026, patch 149). His rules, all his own words through Intake MASTER CONTROL:
//   "divide them for directiors and c levels with our established rules!!"; "C: recent clients only"; "Similar companies go
//   together under managers that have very similar companies as those not on the list and on the list."; "A: spread evenly";
//   "CEO's are invited by our CEO Dmitrijs, or COO Aleksejs B." (13.11); real offshore -> Alma (13.11); Jānis's list untouched.
// For a contact whose company (with its whole family) is on no list yet - since 16.11.2026 evening:
//   1. only with business in the last 3 years: trainees in tc_company_courses for RECENT or later, anywhere in the family.
//      Else off: "Last course <year>" / "No business since 2023"
//   2. a CEO / MD / owner (the 13.11 title rule, word for word below) -> Dmitrijs Semjonovs (CEO)
//   3. offshore / renewables (the name, or an ENERGY / OPITO area) -> Aleksejs Maļinovskis
//   4. anyone else -> Mārcis Žabovs, Director of the Training Centre
// Each person keeps the reason (`why`), shown in the History line.
export const RECENT = 2023;
const SPLIT = ['DS', 'AB', 'Marcis', 'MC', 'Alma'];
const BAND = 30;   // "spread evenly": a list more than this many people above the lightest takes no company by similarity
const C_LEVEL = ['DS', 'AB'];

// --- the title rule (13.11.2026, Backups/ceo_to_ds_ab_dryrun_2026_11_13.mjs, word for word) ---
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const NOT_THE_HEAD = /\b(assistant|asistent|secretary|sekretar|deputy|vice|vietnie|aizstaj|office of|to the (ceo|president|managing|md|chair|owner)|adviser|advisor|padomniek|executive assistant|ea to|pa to|personal assistant|former|ex-)\b|\bvp\b|\bsvp\b|\bevp\b/;
const CEO = [
  /\bceo\b/, /chief executive/, /managing director/, /(?<!dept\. )(?<!department )\bmd\b/, /\bgeneral manager and ceo\b/,
  /^(?!.*commissioner).*\bpresident\b/, /\bowner\b/, /\bco-?owner\b/, /\bfounder\b/, /\bco-?founder\b/,
  /\bchairman\b|\bchairmen\b|\bchairwoman\b|\bchairperson\b|\bchair of the board\b/,
  /valdes priekssedetaj/, /izpilddirektor/, /geschaftsfuhrer|geschaeftsfuehrer/, /general director|director general|generaldirektor|generalny dyrektor|generalinis direktorius|generaldirektor/,
  /administrerende direktor/, /verkstallande direktor|\bvd\b/, /toimitusjohtaja/, /tegevjuht/, /juhatuse esimees/, /prezes zarzadu|\bprezes\b/, /direktur utama/,
  /genera?ln(yi|iy|ij) direktor/, /\bdirecteur general\b|\bdirectrice generale\b|\bpdg\b/, /\bdirettore generale\b|\bamministratore delegato\b/, /\bdirector general\b|\bdirector gerente\b/,
  /\bmanaging partner\b/, /\bproprietor\b/, /\bpatron\b/, /\bnamenhaber\b|\binhaber\b/, /\bvaldes loceklis un izpilddirektor/,
];
/** A CEO / MD / owner (C level), by the 13.11 rule: an assistant, deputy, vice or adviser of one is not. */
export function isCLevel(position) {
  const p = norm(position);
  if (!p || NOT_THE_HEAD.test(p)) return false;
  return CEO.some((r) => r.test(p));
}

// --- what kind of company: the same words for the companies on the lists and the new ones ---
const KINDS = [
  ['offshore / wind', /offshore|wind|turbine|subsea|drilling|\brig\b|\boil\b|\bgas\b|petro|energy|energi|renewable|vind|orsted|ørsted|equinor|vestas|gamesa|rope access|opito|\bgwo\b/i],
  ['crewing / manning', /crew|manning|personnel|staffing|recruit|marine services|maritime services|agency|aģentūra/i],
  ['ship owner / manager', /ship ?management|shipmanagement|shipping|tankers?\b|\bbulk|carriers?\b|\blines?\b|navigation|maritime|marine|\bship|kuģ|reederei|rederi|fleet|ferr(y|ies)|cruise|vessel/i],
  ['port / logistics', /\bport\b|harbou?r|terminal|stevedor|logistic|freight|cargo|transport|\bostas?\b|towage|\btugs?\b/i],
  ['school / training', /school|academy|akadēmija|college|universit|institut|training|education|skola|koledž/i],
  ['state / armed forces', /navy|naval|armed forces|bruņot|ministry|ministrij|coast ?guard|krasta|border|robežsardz|police|policija|army|military|\bnbs\b|aizsardz/i],
  ['industry / engineering', /engineering|industr|technic|construct|steel|weld|metal|repair|shipyard|\byard\b|\bdock|būv|elektro|electric/i],
];
export function kindOf(name, areas) {
  if (/ENERGY|OPITO/.test(areas || '')) return 'offshore / wind';
  for (const [k, re] of KINDS) if (re.test(String(name || ''))) return k;
  return 'other';
}
const FREE_MAIL = /^(gmail|googlemail|inbox|outlook|hotmail|yahoo|mail|icloud|live|me|apollo|one|tvnet|e-pasts|delfi)\./;
export const domainOf = (e) => { const d = String(e || '').toLowerCase().split('@')[1] || ''; return FREE_MAIL.test(d) ? '' : d; };

/**
 * Who gets the contacts at companies no list has: { place: [{ ...row, code, why }], left: [{ ...row, reason, label }] }.
 * rows = placement's "nobody" rows ({ contactId, companyId, company, name, email, position }); placed = what this run already
 * puts on lists ({ code, companyId, email }); owners = the list codes; mom = companyId -> mother.
 */
export async function splitNew(db, rows, placed, { owners, mom, picOwner, mailboxOnly = 'Only a company mailbox' }) {
  const top = (id) => mom.get(id) || id;
  const cos = new Map((await db.prepare(`SELECT c.id, c.name, c.country, LOWER(COALESCE(c.pic_email, '')) AS pic,
    (SELECT string_agg(a.area, '+') FROM tc_company_areas a WHERE a.company_id = c.id) AS areas FROM tc_companies c WHERE c.archived_at IS NULL`).all())
    .map((c) => [Number(c.id), c]));
  const last = new Map();
  for (const r of await db.prepare('SELECT company_id, MAX(year) AS y FROM tc_company_courses WHERE COALESCE(attendees, 0) > 0 GROUP BY company_id').all()) {
    const m = top(Number(r.company_id)); last.set(m, Math.max(last.get(m) || 0, Number(r.y)));
  }
  // each list as it stands (+ this run): people, mother companies, email domains, kinds, countries
  const prof = Object.fromEntries(owners.map((o) => [o, { people: 0, mothers: new Set(), domains: new Map(), kinds: {}, countries: {} }]));
  const add = (o, companyId, email) => {
    const p = prof[o]; if (!p) return;
    p.people += 1;
    const d = domainOf(email); if (d) p.domains.set(d, (p.domains.get(d) || 0) + 1);
    if (!companyId) return;
    const m = top(companyId); if (p.mothers.has(m)) return;
    p.mothers.add(m);
    const c = cos.get(m) || cos.get(companyId); if (!c) return;
    const k = kindOf(c.name, c.areas); p.kinds[k] = (p.kinds[k] || 0) + 1;
    if (c.country) p.countries[c.country] = (p.countries[c.country] || 0) + 1;
  };
  for (const r of await db.prepare(`SELECT s.sender, s.email, MIN(k.company_id) AS company_id FROM tc_go_stage2 s
    LEFT JOIN tc_company_contacts k ON k.ch_contact_id = s.ch_contact_id AND k.archived_at IS NULL WHERE s.gone = 0 GROUP BY s.id, s.sender, s.email`).all())
    add(r.sender, r.company_id ? Number(r.company_id) : null, r.email);
  for (const r of placed) add(r.code, r.companyId, r.email);

  // the families, recent ones first in size order (the biggest is placed while every list still has room)
  const out = { place: [], left: [] };
  // a company whose only contact is a company mailbox (his pick 16.11.2026): on only with a course since RECENT; then to the list
  // that has its family when one does, else divided like the rest
  const fams = new Map();
  for (const r of rows) {
    if (r.mailboxOnly) {
      const y = last.get(top(r.companyId)) || 0;
      if (y < RECENT) { out.left.push({ ...r, reason: 'mailbox_only', label: mailboxOnly }); continue; }
      if (r.holder && owners.includes(r.holder)) { add(r.holder, r.companyId, r.email); out.place.push({ ...r, code: r.holder, why: 'The company mailbox of a recent client, on the list that has the company' }); continue; }
    }
    const m = top(r.companyId); if (!fams.has(m)) fams.set(m, []); fams.get(m).push(r);
  }
  const size = (o) => prof[o].people;
  const room = () => Math.ceil((SPLIT.reduce((a, o) => a + size(o), 0) + [...fams.values()].reduce((a, f) => a + f.length, 0)) / SPLIT.length * 1.04);
  const cap = room();
  const lighter = (list) => list.slice().sort((a, b) => size(a) - size(b) || SPLIT.indexOf(a) - SPLIT.indexOf(b))[0];
  const families = [...fams.entries()].sort((a, b) => b[1].length - a[1].length || String(a[1][0].company).localeCompare(String(b[1][0].company)));
  // THE TRAINING CENTRE ONLY COMPANIES (16.11.2026 evening, the owner: "insert only companies that are of high importance and have
  // had business with us in the last 3 years. if they are TC only, then give them to Alm (offshore/renewables, to Marcis Dir of TC
  // and to Dmitrijs CEO (only C level to Dmitrijs)"; importance = "Any business": trainees in 2023, 2024 or 2025)
  for (const [m, ps] of families) {
    const y = last.get(m) || 0;
    if (y < RECENT) { for (const r of ps) out.left.push({ ...r, reason: 'not_recent', label: y ? `Last course ${y}` : 'No business since 2023' }); continue; }
    const c = cos.get(m) || cos.get(ps[0].companyId) || {};
    const offshore = kindOf(c.name, c.areas) === 'offshore / wind';
    for (const r of ps) {
      const [code, why] = isCLevel(r.position) && owners.includes('DS') ? ['DS', 'Training Centre client, C level: our CEO']
        : offshore && owners.includes('Alma') ? ['Alma', 'Training Centre client, offshore / renewables']
        : ['Marcis', 'Training Centre client: the Director of the Training Centre'];
      add(code, r.companyId, r.email);
      out.place.push({ ...r, code, why });
    }
  }
  return out;
}
