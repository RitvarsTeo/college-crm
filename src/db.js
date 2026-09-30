import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import path from 'node:path';

// Prototype schema. Deliberately small and readable: this is here to test the
// workflow visually, not to be a production database design.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  programme TEXT,
  study_form TEXT,
  education TEXT,
  status TEXT NOT NULL,
  owner TEXT,
  source_channel TEXT,
  source_campaign TEXT,
  source_detail TEXT,
  created_at TEXT,              -- first contact. NULL = NOT KNOWN, never a guessed date (27.09.2026)
  last_contact_at TEXT,
  contract_at TEXT,
  admitted_at TEXT,
  student_no TEXT,
  notes TEXT,
  closed_reason TEXT,          -- why we stopped, required on 'Not proceeding'
  closed_note TEXT,            -- the explanation, required when the reason is 'Other'
  qualification TEXT,          -- raw | warm | hot. Separate from status on purpose:
                               -- the stage vocabulary is provisional, this ladder is not.
  first_channel TEXT,          -- the channel the first contact arrived on, never rewritten
  sis_handoff_at TEXT,         -- when Admissions handed the person to the student system
  nationality TEXT             -- typed in by whoever is talking to them. Nobody derives it.
);

-- One history log. Everything that happens to a person lands here, whether a
-- machine did it or a person did it, and 'origin' says which. An edit also lands
-- here, and then field / old_value / new_value carry what actually changed.
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id TEXT NOT NULL,
  kind TEXT NOT NULL,          -- channel | note | status | call | task | edit | create
  channel TEXT,                -- website, google_form, email, whatsapp, ...
  direction TEXT,              -- in | out | note
  occurred_at TEXT NOT NULL,
  subject TEXT,
  body TEXT,
  actor TEXT,
  origin TEXT NOT NULL DEFAULT 'manual',   -- manual | automatic
  field TEXT,                  -- set on an edit: which field changed
  old_value TEXT,              -- set on an edit: what it was
  new_value TEXT               -- set on an edit: what it became
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id TEXT NOT NULL,
  label TEXT NOT NULL,
  due_at TEXT NOT NULL,
  owner TEXT,
  done_at TEXT,
  outcome TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id TEXT NOT NULL,
  name TEXT NOT NULL,
  state TEXT NOT NULL          -- missing | received | expired
);

CREATE TABLE IF NOT EXISTS open_days (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  held_on TEXT NOT NULL,
  place TEXT
);

CREATE TABLE IF NOT EXISTS registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  open_day_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  slot TEXT,
  attended INTEGER,            -- null = not yet marked, 1 = came, 0 = did not
  professions TEXT
);

CREATE TABLE IF NOT EXISTS sim_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  channel TEXT NOT NULL,
  provider TEXT,
  account TEXT,
  scenario TEXT,
  direction TEXT NOT NULL,       -- inbound | outbound | check
  transport TEXT,
  external_id TEXT,
  person_id TEXT,
  decision TEXT,
  status TEXT,                   -- ok | refused | error
  raw TEXT,
  normalized TEXT,
  mapping TEXT,
  identity TEXT,
  steps TEXT,
  crm_result TEXT,
  outbound TEXT,
  provider_result TEXT,
  audit TEXT
);

-- The intake queue. Everything that arrives lands here first and NOTHING becomes
-- a lead on its own. The body is deliberately temporary: it exists only while
-- somebody is qualifying the item, and is deleted the moment they decide.
CREATE TABLE IF NOT EXISTS inbound (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel TEXT NOT NULL,
  thread_key TEXT,               -- how a later message finds this conversation again
  external_id TEXT,              -- the provider's own id, for exact-repeat detection
  received_at TEXT NOT NULL,
  surface_at TEXT NOT NULL,      -- the next-day 09:00 ageing rule, computed once on arrival
  contact_name TEXT,
  contact_handle TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  body TEXT,                     -- TEMPORARY. Deleted on qualify or archive.
  body_deleted_at TEXT,
  suggested TEXT NOT NULL,       -- raw | warm | hot, the machine's SUGGESTION only
  suggestion_why TEXT,
  state TEXT NOT NULL,           -- new | qualified | archived
  qualification TEXT,            -- raw | warm | hot, set by a person
  person_id TEXT,
  archive_reason TEXT,
  archive_note TEXT,
  processed_by TEXT,
  processed_at TEXT,
  -- HOW this arrived. 'provider' means a real provider posted it to the real
  -- endpoint, and it is the ONLY value the admin Channels panel accepts as
  -- evidence that a channel is connected. The demo builder and the simulator
  -- write through this same table on purpose, so without this column every
  -- channel on the demo copy would read as CONNECTED.
  source TEXT,                   -- provider | simulated | demo | manual | null
  attribution TEXT,              -- JSON: which partner a lead came from (agent), or null
  consent TEXT                   -- JSON: what the form said, e.g. {"admissions":true}, or null
);

-- One row per field, with where the value came from. An 'extracted' value is a
-- suggestion nobody has confirmed and must never reach a count or a report.
CREATE TABLE IF NOT EXISTS field_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id TEXT,
  inbound_id INTEGER,
  field TEXT NOT NULL,
  value TEXT,
  provenance TEXT NOT NULL,      -- typed | provider | extracted | confirmed | operator
  recorded_at TEXT NOT NULL,
  recorded_by TEXT,
  confirmed_at TEXT,
  confirmed_by TEXT
);

CREATE TABLE IF NOT EXISTS consents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id TEXT NOT NULL,
  purpose TEXT NOT NULL,         -- admissions | marketing | analytics | advertising
  state TEXT NOT NULL,           -- given | withdrawn | not asked
  basis TEXT,
  source TEXT,
  recorded_at TEXT NOT NULL,
  note TEXT
);

-- Feedback sent from inside the app by whoever is using it. Kept apart from the
-- people data on purpose: this is about the software, not about a student.
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author TEXT,                 -- who was acting when they sent it
  kind TEXT NOT NULL,          -- BUG | IDEA | QUESTION
  body TEXT NOT NULL,
  path TEXT,                   -- the screen they were on. A hint from the client, display only.
  created_at TEXT NOT NULL,
  handled_at TEXT,             -- a time, not a flag, so the inbox can say WHEN it was handled
  handled_by TEXT
);

-- Separate table so the admin list never drags image bytes across the wire.
CREATE TABLE IF NOT EXISTS feedback_screenshots (
  feedback_id INTEGER PRIMARY KEY,   -- at most one per feedback
  mime_type TEXT NOT NULL,           -- the SNIFFED type, never the one the client declared
  size_bytes INTEGER NOT NULL,
  data BLOB NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (feedback_id) REFERENCES feedback(id) ON DELETE CASCADE,
  CHECK (size_bytes = length(data) AND size_bytes > 0),
  CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp'))
);

-- Lifecycle facts (src/lifecycle.js): dated things that happened to a person, from a system that
-- knows them - today "Application form started" and "Matriculated" from the SIS. NOT stages: they
-- never move anybody on the Journey. One row per person, fact and source record, so a sync that
-- sees the same record again writes nothing.
CREATE TABLE IF NOT EXISTS lifecycle_events (
  person_id TEXT NOT NULL,
  fact TEXT NOT NULL,                -- form_started | matriculated
  source TEXT NOT NULL,              -- sis
  source_ref TEXT NOT NULL,          -- the SIS reference:applicationId it came from
  occurred_at TEXT NOT NULL,         -- when it happened, as the source dates it
  recorded_at TEXT NOT NULL,
  PRIMARY KEY (person_id, fact, source, source_ref)
);

-- How often each Help center question has been opened (dev kit part 3). A count per question id
-- and nothing about who: the Help center puts the most opened first.
CREATE TABLE IF NOT EXISTS help_faq_opens (
  faq_id TEXT PRIMARY KEY,           -- the question's id in config/help.json
  opens INTEGER NOT NULL DEFAULT 0,
  last_at TEXT
);

CREATE TABLE IF NOT EXISTS channel_handshake (
  channel TEXT PRIMARY KEY,          -- one per channel: the latest answer wins
  verified_at TEXT NOT NULL,         -- when the provider last checked we were here
  how TEXT NOT NULL,                 -- which mechanism answered, never a secret
  remote TEXT                        -- what the provider said about itself
);

-- Sign-in accounts. Written only by scripts/manage_users.mjs. A plain password is
-- never stored, printed or logged. Mirrors hub_users in the Talent Acquisition
-- hub, minus the columns two roles do not need.
CREATE TABLE IF NOT EXISTS crm_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  password_hash TEXT,              -- null until a password is set
  role TEXT NOT NULL DEFAULT 'user',
  active INTEGER NOT NULL DEFAULT 1,
  session_version INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  CHECK (role IN ('admin', 'user'))
);

-- What a channel check actually found, so "last test" and "last error" on the
-- admin panel are a record of something that happened rather than a guess. One
-- row per check; the newest per channel is what the panel shows.
CREATE TABLE IF NOT EXISTS channel_check (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel TEXT NOT NULL,
  at TEXT NOT NULL,
  ok INTEGER NOT NULL,
  kind TEXT NOT NULL,              -- what was checked: config | handshake | reachable | simulated
  detail TEXT,                     -- never a secret VALUE, only what happened
  by TEXT
);

-- Every sign-in decision, so an administrator can tell refusals apart while the
-- person refused sees one sentence. The outcome is a BOUNDED CODE, never free
-- text, and no token, no Google profile field and no password ever reaches here.
CREATE TABLE IF NOT EXISTS crm_login_attempt (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  email TEXT,                      -- null when we never got as far as knowing one
  method TEXT NOT NULL,            -- password | google
  outcome TEXT NOT NULL
);

-- Whether a channel is switched ON, kept across restarts. Every existing reader
-- asks process.env.CHANNEL_MODE_<CHANNEL>, and that does not change: the rows here
-- are loaded INTO process.env at boot, so no adapter and no inbound route had to
-- be touched. Nothing here is a secret; it is the word off, test or live.
CREATE TABLE IF NOT EXISTS channel_mode (
  channel TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  changed_by TEXT,
  CHECK (mode IN ('off', 'test', 'live'))
);

-- Every incoming call to the three college queues, as the PBX reported it. Lives in
-- the CRM's own schema, not in a public REST table, so it moves to Supabase with
-- everything else and the service key never has to leave the database connection.
-- uniqueid is the PBX's id: the 15-minute poll windows overlap on purpose, and a
-- call already here is skipped rather than logged twice. Personal data (a number
-- identifies a person); retention is NOT decided, so nothing purges it yet.
CREATE TABLE IF NOT EXISTS pbx_calls (
  uniqueid TEXT PRIMARY KEY,
  called_at TEXT NOT NULL,       -- an absolute instant; the PBX's Riga wall-clock converted
  queue TEXT NOT NULL,
  caller_num TEXT,
  picked_up INTEGER NOT NULL,    -- 1 only when state was ANSWER
  operator_name TEXT,            -- null on a missed call
  person_id TEXT,                -- the person it was logged on, when the number was known
  inbound_id INTEGER,            -- the Inbox item it became, when it was not
  inserted_at TEXT NOT NULL
);

-- The SIS applicant feed, one row per application (a person can apply to more than
-- one programme; a person who has only registered has no application yet, stored
-- as ''). The SIS resends a record whenever it changes and the latest version wins.
CREATE TABLE IF NOT EXISTS sis_applicants (
  reference TEXT NOT NULL,       -- the SIS person. Never changes.
  application_id TEXT NOT NULL,  -- '' when they have only registered
  given_name TEXT,
  family_name TEXT,
  email TEXT,
  phone TEXT,
  programme_code TEXT,
  status TEXT NOT NULL,
  registered_at TEXT,
  submitted_at TEXT,
  changed_at TEXT NOT NULL,
  person_id TEXT,                -- the CRM person, once linked
  inbound_id INTEGER,            -- the Inbox item raised while nobody was linked
  synced_at TEXT NOT NULL,
  PRIMARY KEY (reference, application_id)
);

-- Where each poller got to, so the next run asks only for what changed.
-- The same provider event, twice, is one row. receive() checks first, but a check and
-- an insert are two steps and two deliveries of one message can arrive together; the
-- index is what actually holds. Partial, because a channel with no id of its own must
-- still be able to store rows: in SQLite and in Postgres, NULLs do not collide anyway,
-- and saying so keeps the intent on the page.
CREATE UNIQUE INDEX IF NOT EXISTS inbound_channel_external
  ON inbound (channel, external_id) WHERE external_id IS NOT NULL;

-- A Meta or LinkedIn lead whose answers are still to be fetched (C2 + C7, 30.09.2026).
CREATE TABLE IF NOT EXISTS lead_answers (
  channel TEXT NOT NULL,
  external_id TEXT NOT NULL,
  provider_ref TEXT NOT NULL,     -- the leadgen_id, or the LinkedIn response URN
  state TEXT NOT NULL,            -- pending | done
  tries INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,                -- a plain sentence, never a token
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (channel, external_id)
);

CREATE TABLE IF NOT EXISTS sync_state (
  name TEXT PRIMARY KEY,
  value TEXT,
  ran_at TEXT NOT NULL,
  detail TEXT                    -- what the last run did, never a secret
);
`;

// A test opens this in memory. The server opens a file, because a prototype that
// forgets everything the moment it restarts cannot be tested over several days:
// the page in the browser keeps showing rows the database no longer has.
// Columns added after a database file already existed. CREATE TABLE IF NOT EXISTS
// creates nothing for a table that is already there, so a new column has to be
// added explicitly or an existing file keeps the old shape and every query for
// that column fails. Adding a column is safe and keeps the rows.
const ADDED_COLUMNS = [
  ['people', 'nationality', 'TEXT'],
  ['inbound', 'source', 'TEXT'],
  ['inbound', 'attribution', 'TEXT'],
  ['inbound', 'consent', 'TEXT'],
];

// ---------------------------------------------------------- the async layer --
//
// WHY THIS EXISTS. `node:sqlite` is synchronous and every PostgreSQL client is
// not, so the barrier to Postgres was never the SQL - that is almost entirely
// portable - it was 364 call sites expecting a row back from a function call
// rather than from a promise.
//
// This layer makes the database asynchronous WHILE SQLITE IS STILL UNDERNEATH,
// so the test suite proves the conversion on its own, before anything about the
// storage changes. See docs/PHASE1_ASYNC.md.
//
// THE SHAPE IS CHOSEN FOR TWO THINGS AT ONCE: the smallest possible diff at each
// call site, and a clean mapping onto `pg` afterwards.
//
//   await db.prepare(SQL).get(a, b)    ->  pool.query(sql, params) -> rows[0]
//   await db.prepare(SQL).all(a)       ->  pool.query(sql, params) -> rows
//   await db.prepare(SQL).run(a)       ->  pool.query(sql, params) -> { changes }
//
// `prepare()` stays synchronous and only captures the SQL. Only get/all/run
// await, so a call site changes by exactly one word.

class Statement {
  constructor(raw, sql) {
    this.raw = raw;
    this.sql = sql;
    this.stmt = null;             // prepared once, on first use, then reused
  }

  compiled() {
    if (!this.stmt) this.stmt = this.raw.prepare(this.sql);
    return this.stmt;
  }

  // These are async because the interface must be, not because SQLite is. Under
  // SQLite the work is done by the time the promise is returned.
  async get(...params) { return this.compiled().get(...params); }
  async all(...params) { return this.compiled().all(...params); }
  async run(...params) { return this.compiled().run(...params); }
}

class Db {
  constructor(raw) { this.raw = raw; }

  /** Synchronous on purpose: it captures SQL and compiles nothing yet. */
  prepare(sql) { return new Statement(this.raw, sql); }

  async exec(sql) { return this.raw.exec(sql); }
  async close() { return this.raw.close(); }

  /**
   * Several writes that stand or fall together. Under SQLite this is exactly the
   * BEGIN/COMMIT the callers used to write by hand. It exists as a method because
   * under Postgres a transaction belongs to ONE connection, and a pool hands each
   * statement to whichever connection is free.
   */
  async transaction(fn) {
    await this.exec('BEGIN');
    try {
      const out = await fn(this);
      await this.exec('COMMIT');
      return out;
    } catch (err) {
      await this.exec('ROLLBACK');
      throw err;
    }
  }
}

async function migrate(db) {
  for (const [table, column, type] of ADDED_COLUMNS) {
    const row = await db.prepare(`SELECT COUNT(*) n FROM pragma_table_info(?) WHERE name = ?`)
      .get(table, column);
    if (!(row.n > 0)) await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

// ------------------------------------------------------------- PostgreSQL --
//
// DATABASE_URL set means Postgres; unset means SQLite, exactly as before. The
// call sites do not know which one they have: the SQL they write is translated
// here, once, into what Postgres expects.
//
// WHAT THE TRANSLATION COVERS, and each item is a real difference, not a style:
//   ?                      -> $1, $2 ...   (outside quotes and comments only)
//   camelCase alias        -> "camelCase"  Postgres folds an unquoted name to lower case,
//                                          so `withCampaign` would come back as withcampaign
//   LIKE                   -> ILIKE        SQLite's LIKE ignores ASCII case; Postgres's does not
//   pragma_table_info(t)   -> information_schema.columns
//   INSERT into a table with an identity id -> RETURNING id, so lastInsertRowid still exists
//
// AND IN THE SCHEMA: AUTOINCREMENT becomes an identity column, BLOB becomes BYTEA, and
// every TEXT column is COLLATE "C" - byte order, which is what SQLite compares and sorts
// by. Without it Postgres sorts by the server's locale and ORDER BY name changes.
//
// WHERE IT LIVES. The schema `crm`, never `public`: Supabase publishes `public` through
// its REST API with a key that ships in browsers, and a table there is readable by anyone
// holding that key unless a policy says otherwise. RLS is switched on for every table as
// well, with no policy, so the REST roles see nothing even if the schema were exposed.
// The server connects as the owner, which RLS does not restrict.
//
// A TEST opens ':memory:'. Here that becomes a fresh schema of its own, so every test
// still starts from nothing and no two tests can see each other's rows.

// Neon, through the Vercel Marketplace, supplies a pooled and a direct address, prefixed CRM_DB_
// on this project. The pooled one runs in transaction mode, which does not keep the search_path
// each connection sets, so the DIRECT one is used whenever it is present.
export function pgUrl() {
  return process.env.CRM_DB_DATABASE_URL_UNPOOLED || process.env.DATABASE_URL_UNPOOLED
    || process.env.DATABASE_URL || '';
}

// THE SCHEMA IS PART OF THE CONNECTION (29.09.2026). It used to be a `SET search_path` sent from the
// pool's 'connect' event - a second query started while the first was still on its way, which pg
// warns about ("Calling client.query() when the client is already executing a query is deprecated")
// and pg@9 will refuse. As a startup option there is no second query at all. Anything already in the
// URL's `options` is kept.
export function pgConnectionString(schema, url = pgUrl()) {
  if (!url) return url;
  const u = new URL(url);
  const opts = [u.searchParams.get('options'), `-c search_path=${schema}`].filter(Boolean).join(' ');
  u.searchParams.set('options', opts);
  return u.toString();
}

const SQLITE_ONLY = /^\s*PRAGMA\b/i;

function tableNames(schemaSql) {
  return [...schemaSql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((m) => m[1]);
}
const IDENTITY_TABLES = new Set(
  [...SCHEMA.matchAll(/CREATE TABLE IF NOT EXISTS (\w+) \(\s*id INTEGER PRIMARY KEY AUTOINCREMENT/g)].map((m) => m[1]));

export function pgSchemaSql(schemaSql = SCHEMA) {
  return schemaSql
    .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, 'BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY')
    .replace(/INTEGER PRIMARY KEY/g, 'BIGINT PRIMARY KEY')
    .replace(/\bBLOB\b/g, 'BYTEA')
    .replace(/length\(data\)/g, 'octet_length(data)')
    .replace(/\bTEXT\b/g, 'TEXT COLLATE "C"');
}

/** Rewrites one statement written for SQLite into the Postgres equivalent. */
export function toPg(sql) {
  let s = sql.replace(/pragma_table_info\(([^)]+)\)\s+WHERE\s+name\s*=/gi,
    'information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name =');
  // The pragma rewrite above left a literal "$1" marker where the table argument was.
  const pragma = sql.match(/pragma_table_info\(([^)]+)\)/i);
  let out = '';
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'" || c === '"') {                       // a string or a quoted name: copied untouched
      const end = s.indexOf(c, i + 1);
      const stop = end < 0 ? s.length : end + 1;
      out += s.slice(i, stop); i = stop - 1; continue;
    }
    if (c === '-' && s[i + 1] === '-') {                // a comment, to the end of its line
      const end = s.indexOf('\n', i);
      const stop = end < 0 ? s.length : end;
      out += s.slice(i, stop); i = stop - 1; continue;
    }
    if (c === '$' && s[i + 1] === '1' && pragma) { out += pragma[1] === '?' ? '$' + (++n) : pragma[1]; i += 1; continue; }
    if (c === '?') { out += '$' + (++n); continue; }
    if (/[A-Za-z_]/.test(c) && !/[\w.$]/.test(s[i - 1] || '')) {
      let j = i;
      while (j < s.length && /\w/.test(s[j])) j++;
      const word = s.slice(i, j);
      if (/^[a-z][a-z0-9]*[A-Z]\w*$/.test(word)) out += '"' + word + '"';
      else if (/^like$/i.test(word) && !/^\s*ilike/i.test(word)) out += 'ILIKE';
      else out += word;
      i = j - 1; continue;
    }
    out += c;
  }
  return out;
}

// SQLite hands back integers as numbers. Postgres hands back BIGINT and NUMERIC as
// strings, because they can exceed what a JS number holds exactly. Nothing in this
// CRM counts past 2^53, and `row.n + 1` on a string is "01", so they are numbers here.
let pgModule = null;
async function loadPg() {
  if (pgModule) return pgModule;
  pgModule = (await import('pg')).default;
  pgModule.types.setTypeParser(20, (v) => Number(v));     // int8: COUNT, SUM, identity ids
  pgModule.types.setTypeParser(1700, (v) => Number(v));   // numeric: SUM of a bigint, AVG
  return pgModule;
}

// What node:sqlite accepted and pg would send differently.
function pgParam(v) {
  if (typeof v === 'boolean') return v ? 1 : 0;           // SQLite has no boolean; columns are 0/1 integers
  if (v instanceof Uint8Array && !Buffer.isBuffer(v)) return Buffer.from(v);
  return v;
}

class PgStatement {
  constructor(db, sql) { this.db = db; this.sql = sql; this.text = null; }
  translated() {
    if (this.text === null) {
      let t = toPg(this.sql);
      const ins = this.sql.match(/^\s*INSERT\s+INTO\s+(\w+)\s*(\(([^)]*)\))?/i);
      this.insertTable = ins ? ins[1] : null;
      // An explicit id into an identity column does not move its sequence on, so
      // the next ordinary insert would collide. Noted here, repaired after the insert.
      this.explicitId = Boolean(ins && ins[3] && /(^|,)\s*id\s*(,|$)/.test(ins[3]));
      if (ins && IDENTITY_TABLES.has(ins[1]) && !/\bRETURNING\b/i.test(t)) t += ' RETURNING id';
      this.text = t;
    }
    return this.text;
  }
  async query(params) { return this.db.query(this.translated(), params.map(pgParam)); }
  async get(...params) { return (await this.query(params)).rows[0]; }
  async all(...params) { return (await this.query(params)).rows; }
  async run(...params) {
    const r = await this.query(params);
    if (this.explicitId && IDENTITY_TABLES.has(this.insertTable)) {
      await this.db.query(`SELECT setval(pg_get_serial_sequence('${this.insertTable}', 'id'),
        GREATEST((SELECT MAX(id) FROM ${this.insertTable}), 1))`);
    }
    const id = r.rows && r.rows[0] ? r.rows[0].id : undefined;
    return { changes: r.rowCount ?? 0, lastInsertRowid: id };
  }
}

class PgDb {
  constructor(runner, pool, schema) { this.runner = runner; this.pool = pool; this.schema = schema; this.kind = 'pg'; }
  prepare(sql) { return new PgStatement(this, sql); }
  async query(text, params = []) { return this.runner.query(text, params); }
  async exec(sql) {
    if (SQLITE_ONLY.test(sql)) return;
    // Transactions go through transaction(), which holds one connection for them.
    if (/^\s*(BEGIN|COMMIT|ROLLBACK)\b/i.test(sql) && this.runner === this.pool)
      throw new Error('use db.transaction(): a pooled BEGIN would not hold one connection');
    await this.runner.query(toPg(sql));
  }
  async transaction(fn) {
    const client = await this.pool.connect();
    const tx = new PgDb(client, this.pool, this.schema);
    try {
      await client.query('BEGIN');
      const out = await fn(tx);
      await client.query('COMMIT');
      return out;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }
  async close() { await this.pool.end(); }
}

let schemaCounter = 0;

async function openPg(file) {
  const pg = await loadPg();
  // WHICH SCHEMA. CRM_PG_SCHEMA names it outright, and every real deployment sets it.
  // Otherwise the SQLite file name decides, so everything that relies on "same file,
  // same data" - a restart that must keep what was there - still holds: ':memory:' is
  // a fresh schema every time, and a file path is always the same schema.
  //
  // ':memory:' is ALWAYS a throwaway schema, even with CRM_PG_SCHEMA set. Production sets
  // CRM_PG_SCHEMA=crm, and a test run that inherited it must never write into the real rows.
  const temporary = file === ':memory:';
  const schema = temporary
    ? `crm_t_${process.pid}_${Date.now().toString(36)}_${(++schemaCounter).toString(36)}`
    : (process.env.CRM_PG_SCHEMA
      || `crm_f_${createHash('sha256').update(path.resolve(file)).digest('hex').slice(0, 16)}`);
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error('CRM_PG_SCHEMA must be a plain lower-case name');
  const pool = new pg.Pool({
    connectionString: pgConnectionString(schema),   // every connection looks in this schema, and only there
    max: temporary ? 2 : Number(process.env.CRM_PG_POOL || 3),
    idleTimeoutMillis: temporary ? 500 : 10000,
    allowExitOnIdle: true,
    ssl: /sslmode=disable/.test(pgUrl()) ? false : { rejectUnauthorized: false },
  });
  pool.on('error', () => {});             // an idle connection dropped by the server is not fatal
  const db = new PgDb(pool, pool, schema);
  await db.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  // One round trip for the whole schema, and the same statements every boot.
  await db.query(pgSchemaSql());
  // Only where it is still off. ALTER TABLE takes an exclusive lock even when it changes
  // nothing, and on Vercel several instances boot at once while one of them is filling the
  // same tables - every boot re-locking every table tangled them past the function timeout.
  const { rows: off } = await db.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n
    ON n.oid = c.relnamespace WHERE n.nspname = $1 AND c.relkind = 'r' AND NOT c.relrowsecurity`, [schema]);
  const want = new Set(tableNames(SCHEMA));
  const rls = off.map((r) => r.relname).filter((t) => want.has(t))
    .map((t) => `ALTER TABLE ${schema}.${t} ENABLE ROW LEVEL SECURITY;`).join('\n');
  if (rls) await db.query(rls);
  await migrate(db);
  return db;
}

/**
 * ASYNC, because creating the schema is a query and under Postgres it cannot be
 * anything else. Every caller awaits it.
 */
export async function openDb(file = ':memory:') {
  if (pgUrl()) return openPg(file);
  const db = new Db(new DatabaseSync(file));
  await db.exec('PRAGMA foreign_keys = ON');
  await db.exec(SCHEMA);
  await migrate(db);
  return db;
}
