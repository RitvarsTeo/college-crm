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
  processed_at TEXT
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
];

function migrate(db) {
  for (const [table, column, type] of ADDED_COLUMNS) {
    const has = db.prepare(`SELECT COUNT(*) n FROM pragma_table_info(?) WHERE name = ?`)
      .get(table, column).n > 0;
    if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

export function openDb(file = ':memory:') {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}
