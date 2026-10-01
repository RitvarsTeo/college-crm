// THE SIS LIVE CHECK (01.10.2026, "take the SIS channel to LIVE/DONE"). Admins only, run
// inside production because the token never leaves Vercel. Read-only against the SIS and the CRM:
// every call is a GET through lib/sis.js (the client the sync uses), and the database is only read.
//
// What it proves against the REAL API, in counts and yes/no only - never a name, email, phone,
// reference value or the token:
//   the token is accepted; every page is followed (limit=1, cursor to cursor) and gives the same set
//   as one big page; `since` returns only what changed after it; a wrong token is a 404; a wrong
//   parameter is a 400; web-stats answers and ends with yesterday at the latest.
// About 25 calls, inside the SIS limit of 60 a minute.
import { fetchPage, fetchWebStats, SisError, PAGE_LIMIT } from '../lib/sis.js';

const keyOf = (a) => `${a.reference}|${a.applicationId || ''}`;

async function outcome(fn) {
  try { return { ok: true, value: await fn() }; } catch (err) {
    return { ok: false, status: err instanceof SisError ? err.status : null, error: err instanceof SisError ? err.message : 'the call failed' };
  }
}

export function yesterdayInRiga(now = new Date()) {
  const riga = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Riga' }));
  riga.setDate(riga.getDate() - 1);
  return `${riga.getFullYear()}-${String(riga.getMonth() + 1).padStart(2, '0')}-${String(riga.getDate()).padStart(2, '0')}`;
}

export async function sisLiveCheck({ db, env = process.env, fetchImpl = fetch, now = new Date(), maxPages = 20 } = {}) {
  const out = { at: now.toISOString(), api: {}, database: {} };

  // 1. everybody, in big pages
  const all = [];
  let cursor = null, bigPages = 0;
  const first = await outcome(async () => {
    do {
      const r = await fetchPage({ cursor, limit: PAGE_LIMIT, env, fetchImpl });
      all.push(...r.applicants); cursor = r.nextCursor; bigPages++;
    } while (cursor && bigPages < 10);
  });
  out.api.authenticated = first.ok;
  if (!first.ok) { out.api.error = first; return out; }
  const keys = new Set(all.map(keyOf));
  out.api.records = all.length;
  out.api.people = new Set(all.map((a) => a.reference)).size;
  out.api.applications = all.filter((a) => a.applicationId).length;
  out.api.repeatsInReply = all.length - keys.size;
  out.api.status = all.reduce((m, a) => ({ ...m, [a.status]: (m[a.status] || 0) + 1 }), {});

  // 2. the same set one record at a time, cursor to cursor
  const small = new Set();
  let pages = 0; cursor = null;
  const paged = await outcome(async () => {
    do {
      const r = await fetchPage({ cursor, limit: 1, env, fetchImpl });
      for (const a of r.applicants) small.add(keyOf(a));
      cursor = r.nextCursor; pages++;
    } while (cursor && pages < maxPages);
  });
  out.api.pagination = { ok: paged.ok, pages, followedToTheEnd: paged.ok && !cursor,
    sameSetAsOnePage: paged.ok && !cursor && small.size === keys.size && [...small].every((k) => keys.has(k)),
    ...(paged.ok ? {} : { error: paged }) };

  // 3. since: from the newest change, only that instant can come back; from now, nothing
  const newest = all.map((a) => a.changedAt).filter(Boolean).sort().pop() || null;
  const fromNewest = newest ? await outcome(() => fetchPage({ since: newest, limit: PAGE_LIMIT, env, fetchImpl })) : null;
  const fromNow = await outcome(() => fetchPage({ since: now.toISOString(), limit: PAGE_LIMIT, env, fetchImpl }));
  out.api.since = {
    fromNewestChange: fromNewest && fromNewest.ok ? fromNewest.value.applicants.length : null,
    fromNewestOnlyThatInstant: Boolean(fromNewest && fromNewest.ok && fromNewest.value.applicants.every((a) => a.changedAt >= newest)),
    fromNow: fromNow.ok ? fromNow.value.applicants.length : null,
  };

  // 4. refusals: a token that is not ours, and a limit the SIS does not allow
  const wrong = await outcome(() => fetchPage({ limit: 1, env: { SIS_API_TOKEN: 'intake-live-check-not-a-token' }, fetchImpl }));
  out.api.wrongToken = { refused: !wrong.ok, status: wrong.ok ? 200 : wrong.status };
  const bad = await outcome(() => fetchPage({ limit: 0, env, fetchImpl }));
  out.api.badParameter = { refused: !bad.ok, status: bad.ok ? 200 : bad.status };

  // 5. web stats
  const ws = await outcome(() => fetchWebStats({ range: '30d', env, fetchImpl }));
  out.api.webStats = ws.ok ? { ok: true, host: ws.value.host, from: ws.value.from, to: ws.value.to,
    endsByYesterday: Boolean(ws.value.to && ws.value.to <= yesterdayInRiga(now)), days: ws.value.daily.length,
    visits: ws.value.totals.visits, pageViews: ws.value.totals.pageViews, searchConnected: Boolean(ws.value.search),
    lastLoadedAt: ws.value.lastLoadedAt } : { ok: false, ...ws };

  // 6. what Intake holds (read only)
  if (db) {
    const one = async (sql, ...p) => (await db.prepare(sql).get(...p)) || {};
    out.database.rows = Number((await one('SELECT COUNT(*) n FROM sis_applicants')).n || 0);
    out.database.people = Number((await one('SELECT COUNT(DISTINCT reference) n FROM sis_applicants')).n || 0);
    out.database.repeatedKeys = Number((await one(`SELECT COUNT(*) n FROM (SELECT reference, application_id FROM sis_applicants
      GROUP BY reference, application_id HAVING COUNT(*) > 1) x`)).n || 0);
    out.database.linkedToAPerson = Number((await one('SELECT COUNT(DISTINCT reference) n FROM sis_applicants WHERE person_id IS NOT NULL')).n || 0);
    out.database.referenceWithTwoPeople = Number((await one(`SELECT COUNT(*) n FROM (SELECT reference FROM sis_applicants
      WHERE person_id IS NOT NULL GROUP BY reference HAVING COUNT(DISTINCT person_id) > 1) x`)).n || 0);
    const held = new Set((await db.prepare('SELECT reference, application_id FROM sis_applicants').all())
      .map((r) => `${r.reference}|${r.application_id || ''}`));
    out.database.inTheSisNotHere = [...keys].filter((k) => !held.has(k)).length;
    const st = await one("SELECT value, ran_at, detail FROM sync_state WHERE name = 'sis'");
    out.database.bookmark = st.value || null;
    out.database.lastRun = st.ran_at || null;
    try { out.database.lastRunCounts = st.detail ? JSON.parse(st.detail) : null; } catch { out.database.lastRunCounts = null; }
  }
  return out;
}
