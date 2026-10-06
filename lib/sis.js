// The SIS applicant feed: the parts that talk to the SIS, and nothing else.
//
// Read-only. The CRM asks, the SIS answers, nothing is pushed. The contract is
// the SIS team's own document (Novikontas-CRM-API.md, 28.09.2026):
//   GET https://sis.novikontas.org/api/v1/crm/applicants
//   Authorization: Bearer <token>, ?since=<ISO>&cursor=<nextCursor>&limit=1..500
//   a wrong, revoked or missing token and a switched-off feed are all 404; 429 = wait
//
// THE TOKEN. Read from process.env.SIS_API_TOKEN, sent only in the Authorization
// header, never in a URL, and never returned, logged or thrown. The SIS asks for
// exactly that, and a test asserts it.

import { requiredEnv } from './pbx.js';

export const SIS_URL = 'https://sis.novikontas.org/api/v1/crm/applicants';
export const PAGE_LIMIT = 200;
// A run follows nextCursor at most this many pages. 50 x 200 = 10,000 records is
// far more than one five-minute window produces; hitting it means something is
// wrong, and the run stops and says so rather than spending the 60-a-minute limit.
export const MAX_PAGES = 50;

const TOKEN_ENV = 'SIS_API_TOKEN';

export const STATUSES = ['registered', 'started', 'submitted', 'admitted', 'rejected', 'withdrawn', 'matriculated'];

export function redactSis(text, token) {
  let out = String(text ?? '');
  if (token) out = out.split(token).join('[redacted]');
  return out.replace(/(Bearer\s+)\S+/gi, '$1[redacted]');
}

export function buildUrl({ since, cursor, limit = PAGE_LIMIT } = {}) {
  const url = new URL(SIS_URL);
  // cursor carries the position of a query already begun, so `since` goes only
  // on the first page and the SIS keeps its own place after that
  if (cursor) url.searchParams.set('cursor', cursor);
  else if (since) url.searchParams.set('since', since);
  url.searchParams.set('limit', String(limit));
  return url.toString();
}

// One page. Every refusal is a plain sentence with no token in it.
export async function fetchPage({ since, cursor, limit = PAGE_LIMIT, env = process.env, fetchImpl = fetch } = {}) {
  const token = requiredEnv(TOKEN_ENV, env);
  const url = buildUrl({ since, cursor, limit });
  let res;
  try {
    res = await fetchImpl(url, { method: 'GET',
      headers: { accept: 'application/json', authorization: `Bearer ${token}` } });
  } catch (err) {
    throw new Error(`SIS request failed: ${redactSis(err && err.message, token)}`);
  }
  if (res.status === 404) throw new SisError(404, 'SIS answered 404: the token is wrong or revoked, or the feed is switched off');
  if (res.status === 429) throw new SisError(429, 'SIS answered 429: too many calls, the next run tries again');
  if (res.status === 400) throw new SisError(400, 'SIS answered 400: since or limit was not accepted');
  if (!res.ok) throw new SisError(res.status, `SIS answered ${res.status}`);
  let data;
  try { data = await res.json(); } catch { throw new SisError(502, 'SIS returned a body that is not JSON'); }
  if (!data || !Array.isArray(data.applicants)) throw new SisError(502, 'SIS returned no applicants list');
  return { applicants: data.applicants, nextCursor: data.nextCursor || null };
}

export class SisError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Every page of one query, following nextCursor until it is null.
export async function fetchChanged({ since, env = process.env, fetchImpl = fetch, maxPages = MAX_PAGES } = {}) {
  const all = [];
  let cursor = null;
  for (let page = 0; page < maxPages; page++) {
    const r = await fetchPage({ since, cursor, env, fetchImpl });
    all.push(...r.applicants);
    if (!r.nextCursor) return { applicants: all, pages: page + 1, complete: true };
    cursor = r.nextCursor;
  }
  return { applicants: all, pages: maxPages, complete: false };
}

const isoOrNull = (v) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);

// The SIS record, checked and put in our words. A record without a reference, a
// known status or a changedAt cannot be placed, so it is counted and skipped.
export function toSisRow(a) {
  if (!a || !a.reference) throw new TypeError('an applicant needs a reference');
  if (!STATUSES.includes(a.status)) throw new TypeError(`unknown SIS status: ${a.status}`);
  if (!a.changedAt || Number.isNaN(Date.parse(a.changedAt))) throw new TypeError('an applicant needs a changedAt');
  const str = (v) => (v === null || v === undefined || v === '' ? null : String(v));
  return {
    reference: String(a.reference),
    application_id: a.applicationId ? String(a.applicationId) : '',
    given_name: str(a.givenName),
    family_name: str(a.familyName),
    email: str(a.email),
    phone: str(a.phone),
    programme_code: str(a.programmeCode),
    status: a.status,
    registered_at: str(a.registeredAt),
    submitted_at: str(a.submittedAt),
    changed_at: new Date(a.changedAt).toISOString(),
    // An admission or matriculation date of the SIS's own. The contract has none today (only
    // registeredAt, submittedAt, changedAt); if the SIS ever sends one it is kept and preferred as
    // the admission date (src/sisdates.js). A value that is not a date is dropped, never guessed.
    admitted_on: isoOrNull(a.matriculatedAt ?? a.admittedAt),
  };
}

// ------------------------------------------------------------- web stats --
// The SIS team's second endpoint (Novikontas-CRM-API.md, 01.10.2026): visits to apply.novikontas.org,
// counted from the web server's own log, built nightly at 03:30 Riga and ending with YESTERDAY.
// Counts only, nothing about a person. Same token, same header, same 60-a-minute limit.
export const WEB_STATS_URL = 'https://sis.novikontas.org/api/v1/crm/web-stats';
export const WEB_RANGES = ['1d', '7d', '30d', '90d', 'all'];

export async function fetchWebStats({ range = '30d', env = process.env, fetchImpl = fetch } = {}) {
  if (!WEB_RANGES.includes(range)) throw new SisError(400, `range must be one of ${WEB_RANGES.join(', ')}`);
  const token = requiredEnv(TOKEN_ENV, env);
  const url = new URL(WEB_STATS_URL);
  url.searchParams.set('range', range);
  let res;
  try {
    res = await fetchImpl(url.toString(), { method: 'GET',
      headers: { accept: 'application/json', authorization: `Bearer ${token}` } });
  } catch (err) {
    throw new Error(`SIS request failed: ${redactSis(err && err.message, token)}`);
  }
  if (res.status === 404) throw new SisError(404, 'SIS answered 404: the token is wrong or revoked, or the feed is switched off');
  if (res.status === 429) throw new SisError(429, 'SIS answered 429: too many calls, try again in a minute');
  if (res.status === 400) throw new SisError(400, 'SIS answered 400: the range was not accepted');
  if (!res.ok) throw new SisError(res.status, `SIS answered ${res.status}`);
  let data;
  try { data = await res.json(); } catch { throw new SisError(502, 'SIS returned a body that is not JSON'); }
  if (!data || typeof data !== 'object' || !data.totals) throw new SisError(502, 'SIS returned no web statistics');
  return webStatsFrom(data);
}

// Only the documented fields travel on, so nothing the SIS adds later reaches a screen unread.
export function webStatsFrom(d) {
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const top = (list, keys) => (Array.isArray(list) ? list : []).map((x) => {
    const o = { name: String(x && x.name != null ? x.name : '') };
    for (const k of keys) o[k] = k === 'detail' ? (x && x.detail != null ? String(x.detail) : null) : num(x && x[k]);
    return o;
  });
  const days = (list, keys) => (Array.isArray(list) ? list : []).map((x) => {
    const o = { day: String(x && x.day || '') };
    for (const k of keys) o[k] = num(x && x[k]);
    return o;
  });
  const t = d.totals || {};
  const s = d.search && typeof d.search === 'object' ? d.search : null;
  return {
    host: d.host ? String(d.host) : null, range: d.range ? String(d.range) : null,
    from: d.from ? String(d.from) : null, to: d.to ? String(d.to) : null,
    totals: { visits: num(t.visits), pageViews: num(t.pageViews), botRequests: num(t.botRequests),
      notFound: num(t.notFound), serverErrors: num(t.serverErrors) },
    previous: d.previous ? { visits: num(d.previous.visits), pageViews: num(d.previous.pageViews) } : null,
    daily: days(d.daily, ['visits', 'pageViews']),
    countries: top(d.countries, ['visitors', 'hits']), pages: top(d.pages, ['visitors', 'hits']),
    referrers: top(d.referrers, ['visitors', 'hits']), campaigns: top(d.campaigns, ['detail', 'visitors', 'hits']),
    browsers: top(d.browsers, ['visitors', 'hits']), devices: top(d.devices, ['visitors', 'hits']),
    hours: top(d.hours, ['visitors', 'hits']),
    search: s ? {
      from: s.from ? String(s.from) : null, to: s.to ? String(s.to) : null,
      totals: { clicks: num(s.totals && s.totals.clicks), impressions: num(s.totals && s.totals.impressions),
        ctr: num(s.totals && s.totals.ctr), position: num(s.totals && s.totals.position) },
      previous: s.previous ? { clicks: num(s.previous.clicks), impressions: num(s.previous.impressions) } : null,
      daily: days(s.daily, ['clicks', 'impressions']),
      queries: top(s.queries, ['clicks', 'impressions', 'position']),
      pages: top(s.pages, ['clicks', 'impressions', 'position']),
    } : null,
    lastLoadedAt: d.lastLoadedAt ? String(d.lastLoadedAt) : null,
  };
}
