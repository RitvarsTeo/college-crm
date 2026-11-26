// WHOLE-TABLE READS, REUSED (patch 188, 26.11.2026, his "Yes, hand them over": the database's monthly transfer ran over). The company
// list, the company websites and the course rows were read whole on every call (the company list alone 1,882 times). Now each read is
// kept for up to 60 s and reused while one small check row says its table has not changed (counts and latest times; the same idea
// as src/tc.js companyRows). A write anywhere changes the check, so the next read is fresh. Each caller gets its own copies.
const TTL_MS = 60000;
const CACHE = new Map();   // key -> { db, stamp, at, rows }
export const STAMPS = Object.freeze({
  companies: `SELECT (SELECT COUNT(*) FROM tc_companies) AS c1, (SELECT MAX(COALESCE(updated_at, created_at)) FROM tc_companies) AS c2,
    (SELECT MAX(archived_at) FROM tc_companies) AS c3, (SELECT COUNT(archived_at) FROM tc_companies) AS c4`,
  courses: `SELECT (SELECT COUNT(*) FROM tc_company_courses) AS k1, (SELECT SUM(attendees) FROM tc_company_courses) AS k2,
    (SELECT MAX(recorded_at) FROM tc_company_courses) AS k3`,
});

/** db.prepare(sql).all(...params), reused while STAMPS[kind] is unchanged and the copy is under 60 s old. */
export async function cachedAll(db, kind, sql, ...params) {
  if (!STAMPS[kind]) throw new Error('unknown cache kind ' + kind);
  const stamp = JSON.stringify(await db.prepare(STAMPS[kind]).get());
  const key = kind + '\n' + sql + '\n' + JSON.stringify(params);
  const c = CACHE.get(key);
  if (!(c && c.db === db && c.stamp === stamp && Date.now() - c.at < TTL_MS)) {
    CACHE.set(key, { db, stamp, at: Date.now(), rows: await db.prepare(sql).all(...params) });
  }
  return CACHE.get(key).rows.map((r) => ({ ...r }));
}
export const _clear = () => CACHE.clear();
