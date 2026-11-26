// WHOLE-TABLE READS, REUSED (patch 188, 26.11.2026): the company list, websites and course rows are read once and reused while a
// small check row is unchanged; any write changes it. Invented names.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { cachedAll, _clear } from '../src/tcreadcache.js';

test('reused while nothing changed; fresh after a write; callers get their own copies', async () => {
  _clear();
  const db = await openDb();
  await db.prepare(`INSERT INTO tc_companies (id, name, name_key, status, created_at) VALUES (1, 'Example A', 'example a', 'to_contact', '2026-11-01T00:00:00Z')`).run();
  let reads = 0;
  const prepare = db.prepare.bind(db);
  db.prepare = (sql) => { const st = prepare(sql); if (/^SELECT id, name FROM tc_companies/.test(sql)) { const all = st.all.bind(st); st.all = (...p) => { reads++; return all(...p); }; } return st; };
  const SQL = 'SELECT id, name FROM tc_companies WHERE archived_at IS NULL ORDER BY id';
  const a = await cachedAll(db, 'companies', SQL);
  a[0].name = 'changed by a caller';
  const b = await cachedAll(db, 'companies', SQL);
  assert.equal(reads, 1, 'the second call reuses the first read');
  assert.equal(b[0].name, 'Example A', 'a caller cannot change what others get');
  await db.prepare(`INSERT INTO tc_companies (id, name, name_key, status, created_at) VALUES (2, 'Example B', 'example b', 'to_contact', '2026-11-02T00:00:00Z')`).run();
  assert.equal((await cachedAll(db, 'companies', SQL)).length, 2);
  await db.prepare(`UPDATE tc_companies SET archived_at = '2026-11-03T00:00:00Z' WHERE id = 1`).run();
  assert.deepEqual((await cachedAll(db, 'companies', SQL)).map((r) => r.name), ['Example B'], 'archived: gone at once');
  await db.prepare(`UPDATE tc_companies SET name = 'Example B2', updated_at = '2026-11-04T00:00:00Z' WHERE id = 2`).run();
  assert.equal((await cachedAll(db, 'companies', SQL))[0].name, 'Example B2', 'a rename: fresh at once');
  assert.equal(reads, 4);
  await assert.rejects(cachedAll(db, 'nope', SQL), /unknown cache kind/);
});
