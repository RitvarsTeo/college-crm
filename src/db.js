import { DatabaseSync } from 'node:sqlite';

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
  created_at TEXT NOT NULL,
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
  source TEXT                    -- provider | simulated | demo | manual | null
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
  kind TEXT NOT NULL,          -- BUG | IDEA
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
}

async function migrate(db) {
  for (const [table, column, type] of ADDED_COLUMNS) {
    const row = await db.prepare(`SELECT COUNT(*) n FROM pragma_table_info(?) WHERE name = ?`)
      .get(table, column);
    if (!(row.n > 0)) await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

/**
 * ASYNC, because creating the schema is a query and under Postgres it cannot be
 * anything else. Every caller awaits it.
 */
export async function openDb(file = ':memory:') {
  const db = new Db(new DatabaseSync(file));
  await db.exec('PRAGMA foreign_keys = ON');
  await db.exec(SCHEMA);
  await migrate(db);
  return db;
}
