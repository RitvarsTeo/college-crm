import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

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
  closed_tag TEXT,             -- Admissions, 30.09.2026: cold | reject, on 'Not proceeding' only.
                               -- A SECOND axis, not a second reason. closed_reason says why we
                               -- stopped; this says what now. Cold is dormant and expected back,
                               -- reject is declined and often only for now. Her words are in
                               -- docs/IEVA_AIGARS_FEEDBACK_VERBATIM.md.
  qualification TEXT,          -- raw | warm | hot. Separate from status on purpose:
                               -- the stage vocabulary is provisional, this ladder is not.
  first_channel TEXT,          -- the channel the first contact arrived on, never rewritten
  sis_handoff_at TEXT,         -- when Admissions handed the person to the student system
  nationality TEXT             -- typed in by whoever is talking to them. Nobody derives it.
);

-- "Not the same person" (Ieva, 21.10.2026; src/samepeople.js): two records that look alike and are two people. The pair
-- is written once (person_a < person_b) and the "Maybe the same person" line never shows for them again.
CREATE TABLE IF NOT EXISTS person_not_same (
  person_a TEXT NOT NULL,
  person_b TEXT NOT NULL,
  marked_at TEXT NOT NULL,
  marked_by TEXT,
  PRIMARY KEY (person_a, person_b)
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
  surface_at TEXT NOT NULL,      -- the late moment on arrival (Q50 working hours); readers recompute it from received_at
  contact_name TEXT,
  contact_handle TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  body TEXT,                     -- Deleted on qualify. Kept on set aside (07.10.2026, the owner: "Keep the text") and
                                 -- on filter, until the 13-month retention (purgeLineBodies) empties it.
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
  -- FIRST REPLY (07.10.2026, the owner: "First-reply time", replies are sent from edu@): the Date of the first message
  -- edu@ SENT in this email thread after the enquiry, and when the thread was last read for it (src/sync.js
  -- syncReplies). Only the time is kept: never the body, the subject or the recipients. A phone enquiry's first reply
  -- is its first answered call, read from pbx_calls.
  first_reply_at TEXT,
  reply_checked_at TEXT,
  -- HOW this arrived. 'provider' means a real provider posted it to the real
  -- endpoint, and it is the ONLY value the admin Channels panel accepts as
  -- evidence that a channel is connected. The demo builder and the simulator
  -- write through this same table on purpose, so without this column every
  -- channel on the demo copy would read as CONNECTED.
  source TEXT,                   -- provider | simulated | demo | manual | null
  attribution TEXT,              -- JSON: which partner a lead came from (agent), or null
  consent TEXT                   -- JSON: what the form said, e.g. {"admissions":true}, or null
);

-- ONE LINE PER ARRIVAL (locked 01.10.2026, Q9).
--
-- An inbound row is one THING TO LOOK AT. A line is one arrival on it: the first
-- call, the second call twenty minutes later, the message after that. One number is
-- one thing to ring back however many times it rings, so the row does not multiply -
-- but each arrival keeps its own time, its own provider id and its own body.
--
-- WHY A TABLE AND NOT A GROWING TEXT. Retention is 13 months PER LINE, counted from
-- that line's own received_at. A single body column has one timestamp for the whole
-- thread, so the oldest line would decide when the newest is deleted: somebody who
-- rang this morning would lose this morning's line because their first call was last
-- year. A row per line is the only shape that can carry a clock each.
--
-- inbound.body is KEPT IN SYNC and stays the whole conversation as one text, because
-- every screen and every export reads it. The lines are the record; the body is the
-- read.
CREATE TABLE IF NOT EXISTS inbound_line (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inbound_id INTEGER NOT NULL,
  seq INTEGER NOT NULL,          -- 1, 2, 3... the order they arrived on this row
  channel TEXT NOT NULL,
  external_id TEXT,              -- THIS arrival's provider id, not the row's
  received_at TEXT NOT NULL,     -- this line's own clock, for its own 13 months
  kind TEXT NOT NULL,            -- message | call | form | activity | reply (our own email, 19.10.2026)
  body TEXT,                     -- survives filtering; emptied only by retention
  body_deleted_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS inbound_line_seq ON inbound_line (inbound_id, seq);
-- What a person did to an Inbox message, oldest first (07.10.2026, "Set aside: a way back"). Set aside writes a
-- line here, and Bring back writes one that also carries what the set-aside had said, because bringing a message
-- back clears those fields on the row. Nothing is ever deleted from it.
CREATE TABLE IF NOT EXISTS inbound_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inbound_id INTEGER NOT NULL,
  action TEXT NOT NULL,          -- set_aside | brought_back | marked | unmarked (14.10.2026)
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  from_state TEXT,               -- brought_back: archived (a person set it aside) | filtered (a rule did)
  reason TEXT,
  note TEXT,
  earlier_actor TEXT,            -- brought_back: who or what had set it aside, and when
  earlier_at TEXT
);
CREATE INDEX IF NOT EXISTS inbound_history_item ON inbound_history (inbound_id, id);
-- The row-level unique index catches a repeat of the FIRST arrival. Without this one,
-- a repeat delivery of the second arrival is not caught at all: its external_id was
-- never written to inbound, only to its line.
CREATE UNIQUE INDEX IF NOT EXISTS inbound_line_external
  ON inbound_line (channel, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS inbound_line_inbound ON inbound_line (inbound_id);

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
  inserted_at TEXT NOT NULL,
  duration_sec INTEGER,          -- 14.10.2026: the whole call in seconds, ringing included (TeleGroup's duration); null = not known
  talk_sec INTEGER,              -- 14.10.2026: the talk time in seconds (TeleGroup's duration_talk); null = not known
  note TEXT,                     -- 14.10.2026: "What was it about?", one line typed after the call by whoever answered
  note_by TEXT,
  note_at TEXT
);

-- MARKS (14.10.2026, one rule on every card): Supplier or vendor, Internal or Spam on a phone number or an email
-- address, kept until somebody changes it. A marked number or address never pops up and never reaches the Inbox.
-- One row per number or address; mark NULL = the mark was removed (it also outranks a number set aside with one of
-- those reasons before 14.10.2026, which otherwise still counts as marked). Who and when are on the row; every
-- change is also a line in inbound_history (marked | unmarked) on the card it was made from.
CREATE TABLE IF NOT EXISTS contact_marks (
  contact_key TEXT PRIMARY KEY,  -- phone:<last 8 digits> | email:<address in lower case>
  mark TEXT,
  set_by TEXT NOT NULL,
  set_at TEXT NOT NULL,
  inbound_id INTEGER             -- the card it was set or removed on
);

-- CALL EVENTS the phone system pushes (Q6, 04.10.2026): ringing, answered, ended. One row per
-- call id + event, so a retry is stored once. The open app reads these, never TeleGroup, to pop
-- up the caller for whoever answered. The CALL itself still lands in pbx_calls, written by the
-- same storeCall the daily pull uses. Personal data (a number); the same 13-month retention.
CREATE TABLE IF NOT EXISTS call_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  call_id TEXT NOT NULL,
  event TEXT NOT NULL,           -- ringing | answered | ended
  at TEXT NOT NULL,              -- when it happened, as the phone system says
  queue TEXT,
  caller_num TEXT,
  operator TEXT,                 -- who answered, as the phone system names them
  extension TEXT,
  source TEXT NOT NULL,          -- provider | simulated
  received_at TEXT NOT NULL,
  UNIQUE (call_id, event)
);

-- WEB PUSH subscriptions (Q6, 04.10.2026): one row per colleague's browser that allowed Intake's
-- call notifications. The endpoint is the push service's address for that browser; nothing else
-- is kept, because the knock carries no payload. A gone endpoint (404/410) is deleted.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL UNIQUE,
  user_name TEXT NOT NULL,
  created_at TEXT NOT NULL
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
  admitted_on TEXT,              -- the SIS's own admission/matriculation date, if it ever sends one
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

-- The admissions sheet pull (Q89, src/sheetsync.js): what each sheet row said at the last pull, and who it is.
-- row_key is the row's email, else phone tail, else name: never the row number, which moves.
CREATE TABLE IF NOT EXISTS sheet_rows (
  tab TEXT NOT NULL,
  row_key TEXT NOT NULL,
  person_id TEXT,
  applied TEXT,                  -- the row as Intake read it last time (JSON)
  created_person INTEGER NOT NULL DEFAULT 0,  -- 1 = the sheet made this person (the pull or the 24.09 import)
  first_day TEXT,                -- the sheet's first-contact day, YYYY-MM-DD
  task_id INTEGER,               -- the Follow-up step this row made: the only step the pull ever moves
  seen_at TEXT NOT NULL,
  PRIMARY KEY (tab, row_key)
);

-- WHICH HALF OF INTAKE A PERSON MAY OPEN (19.10.2026, the owner: "Academy people who are academy team can open it,
-- people who are TC people can open that. We will have to give permissions."). One row per account and area
-- (academy | tc). Read on EVERY request with the role (src/server.js resolveUser), so taking an area away works on the
-- next click. The first boot after this table arrived gives every account that existed the academy area and the admins
-- both, ONCE (src/areas.js backfillAreas, marked in sync_state), so a later account is never granted by accident.
CREATE TABLE IF NOT EXISTS crm_user_areas (
  user_id TEXT NOT NULL REFERENCES crm_users(id),
  area TEXT NOT NULL,              -- academy | tc
  granted_at TEXT NOT NULL,
  granted_by TEXT,
  PRIMARY KEY (user_id, area)
);
-- Every change to an area, by whom and when (People and access). Nothing is deleted from it.
CREATE TABLE IF NOT EXISTS crm_user_area_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  area TEXT NOT NULL,
  action TEXT NOT NULL,            -- grant | revoke
  at TEXT NOT NULL,
  by TEXT NOT NULL
);

-- TRAINING CENTRE (19.10.2026, docs: _training-centre/BACKEND_PROPOSAL.md). Client companies, their people, their
-- courses per year, one log of every communication and change, and the next communication. Prefixed tc_ in the same
-- schema, so they get identity ids, COLLATE "C" and RLS like everything else. Nothing is ever hard deleted: a row is
-- archived (archived_at / archived_by). Statuses and areas are checked in code against config/tc.json.
CREATE TABLE IF NOT EXISTS tc_companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,          -- lower case, punctuation and spaces collapsed (src/tc.js nameKey)
  country TEXT,
  city TEXT,
  address TEXT,
  website TEXT,
  status TEXT NOT NULL,            -- config/tc.json statuses
  status_detail TEXT,              -- the meeting type when the status is met
  pic_name TEXT,                   -- the person in charge as the Excel names them
  pic_email TEXT,                  -- the person in charge's Intake account, once one is picked
  notes TEXT,
  info_to_send TEXT,               -- what still has to be sent to them; empty = nothing waiting
  last_contact_at TEXT,
  extra TEXT,                      -- JSON: what the Excel's side tabs said (exhibitions, calendars, other names)
  source TEXT,                     -- excel_2026_10 | manual
  source_key TEXT,                 -- the import's own company id
  source_row INTEGER,              -- the Excel row
  created_at TEXT NOT NULL,
  created_by TEXT,
  updated_at TEXT,
  archived_at TEXT,
  archived_by TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS tc_companies_name_country ON tc_companies (name_key, country) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS tc_companies_status ON tc_companies (status);
CREATE INDEX IF NOT EXISTS tc_companies_country ON tc_companies (country);
CREATE INDEX IF NOT EXISTS tc_companies_pic ON tc_companies (pic_name);

CREATE TABLE IF NOT EXISTS tc_company_areas (
  company_id BIGINT NOT NULL REFERENCES tc_companies(id),
  area TEXT NOT NULL,              -- TC | ENERGY | OPITO | PROJECTS
  PRIMARY KEY (company_id, area)
);
CREATE INDEX IF NOT EXISTS tc_company_areas_area ON tc_company_areas (area, company_id);

CREATE TABLE IF NOT EXISTS tc_company_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id BIGINT NOT NULL REFERENCES tc_companies(id),
  name TEXT,
  position TEXT,
  email TEXT,                      -- lower case
  phone TEXT,
  notes TEXT,
  ch_contact_id TEXT,              -- Client Hub contacts.contact_id, once matched
  source TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT,
  updated_at TEXT,
  archived_at TEXT,
  archived_by TEXT
);
CREATE INDEX IF NOT EXISTS tc_company_contacts_company ON tc_company_contacts (company_id);
CREATE INDEX IF NOT EXISTS tc_company_contacts_email ON tc_company_contacts (email);
CREATE UNIQUE INDEX IF NOT EXISTS tc_company_contacts_one_email ON tc_company_contacts (company_id, email)
  WHERE email IS NOT NULL AND archived_at IS NULL;

-- Courses attended, one line per company per year: the count covers every code in the line.
CREATE TABLE IF NOT EXISTS tc_company_courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id BIGINT NOT NULL REFERENCES tc_companies(id),
  year INTEGER NOT NULL,
  attendees INTEGER,               -- 0 is a real value
  course_codes TEXT,               -- upper case, ", " between
  raw TEXT,                        -- the Excel line as written
  as_of TEXT,                      -- the day the figure was true
  source TEXT,
  recorded_at TEXT NOT NULL,
  recorded_by TEXT,
  UNIQUE (company_id, year)
);

-- One log per company: communications AND history (as events is for a person).
CREATE TABLE IF NOT EXISTS tc_activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id BIGINT NOT NULL REFERENCES tc_companies(id),
  contact_id BIGINT,
  kind TEXT NOT NULL,              -- call | email | physical_meeting | digital_meeting | exhibition | contact | note | status | edit | create | import | task
  occurred_at TEXT NOT NULL,
  topics TEXT,
  body TEXT,
  actor TEXT,
  origin TEXT NOT NULL DEFAULT 'manual',   -- manual | automatic | import
  field TEXT,
  old_value TEXT,
  new_value TEXT
);
CREATE INDEX IF NOT EXISTS tc_activities_company ON tc_activities (company_id, occurred_at);

-- The next communication, the shape of Intake's tasks. One open per company.
CREATE TABLE IF NOT EXISTS tc_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id BIGINT NOT NULL REFERENCES tc_companies(id),
  contact_id BIGINT,
  label TEXT NOT NULL,
  due_at TEXT NOT NULL,            -- a Riga day, YYYY-MM-DD
  owner TEXT,                      -- the person in charge's name
  done_at TEXT,
  outcome TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT,
  kind TEXT,                       -- My week (20.10.2026): call | email | meeting | exhibition, the planned way to reach them
  result TEXT                      -- Log a contact, on the closed task: reached | no_answer | sent_info | meeting_booked | asked_offer
);
CREATE INDEX IF NOT EXISTS tc_tasks_open ON tc_tasks (due_at) WHERE done_at IS NULL;
CREATE INDEX IF NOT EXISTS tc_tasks_company ON tc_tasks (company_id);

-- SEASON (the owner's pick C, 20.10.2026; src/tcseason.js): exhibitions and the year-end calendars & gifts, and the
-- companies on each one's list with how far they got. Seeded ONCE from the Excel tabs held in tc_companies.extra (an
-- admin preview + apply with its hash). Nothing is deleted: an event is archived, a company taken off a list is stamped.
CREATE TABLE IF NOT EXISTS tc_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,              -- exhibition | calendars (config/tc_season.json)
  city TEXT,
  country TEXT,
  starts_on TEXT,                  -- YYYY-MM-DD; NULL = not known
  ends_on TEXT,
  date_confirmed INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  source TEXT,
  source_key TEXT,                 -- the seed's own key, so a second apply finds it
  created_at TEXT NOT NULL,
  created_by TEXT,
  updated_at TEXT,
  updated_by TEXT,
  archived_at TEXT,
  archived_by TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS tc_events_source_key ON tc_events (source_key) WHERE source_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS tc_events_starts ON tc_events (starts_on);

CREATE TABLE IF NOT EXISTS tc_event_companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id BIGINT NOT NULL REFERENCES tc_events(id),
  company_id BIGINT NOT NULL REFERENCES tc_companies(id),
  stage TEXT NOT NULL,             -- exhibition: on_list | met | follow_up | booked; calendars: on_list | sent
  note TEXT,
  source TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT,
  updated_at TEXT,
  updated_by TEXT,
  removed_at TEXT,
  removed_by TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS tc_event_companies_one ON tc_event_companies (event_id, company_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS tc_event_companies_company ON tc_event_companies (company_id);

-- What each import row became, so a second apply finds nothing and a company traces back to its Excel row.
CREATE TABLE IF NOT EXISTS tc_import_rows (
  batch TEXT NOT NULL,
  source_key TEXT NOT NULL,        -- the import file's own company id
  row_no INTEGER,                  -- the Excel row
  company_id BIGINT,
  outcome TEXT NOT NULL,           -- created | matched | rejected
  reason TEXT,
  applied_at TEXT NOT NULL,
  applied_by TEXT,
  PRIMARY KEY (batch, source_key)
);

-- THE CLIENT HUB REVIEW LIST (20.10.2026, src/tcreview.js): the contacts the Client Hub import could not place alone,
-- as the import read them, until a Training Centre person places one under a company or sets it aside. Never deleted:
-- status open | placed | duplicate | set_aside, with who and when.
CREATE TABLE IF NOT EXISTS tc_review_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch TEXT NOT NULL,             -- the import's batch (clienthub_2026_10)
  ch_contact_id TEXT NOT NULL,     -- Client Hub contacts.contact_id
  row_no INTEGER,                  -- the line in the import's file
  why TEXT NOT NULL,               -- tie | fuzzy | possible | domain_group | none | other
  ch_company TEXT,                 -- the company as Client Hub writes it; empty = none
  ch_company_key TEXT,
  country TEXT,
  name TEXT,
  position TEXT,
  email TEXT,                      -- lower case
  phone TEXT,
  notes TEXT,                      -- No mailing, as the import marks it
  candidates TEXT,                 -- JSON [{ id, kind, score }]: Intake companies the cross-check found, best first
  status TEXT NOT NULL DEFAULT 'open',
  company_id BIGINT,               -- where it was placed
  contact_id BIGINT,               -- the contact it became
  reason TEXT,                     -- why it was set aside
  done_at TEXT,
  done_by TEXT,
  loaded_at TEXT NOT NULL,
  loaded_by TEXT,
  UNIQUE (batch, ch_contact_id)
);
CREATE INDEX IF NOT EXISTS tc_review_contacts_open ON tc_review_contacts (status, why);

-- THE GRAND OPENING (21.10.2026, src/tcgo.js; the owner's pick G1): the guest list and the Save the Date results as
-- Client Hub holds them, brought in by an admin import (preview, then apply with the hash) from a read-only extract.
-- A guest is a Client Hub contact; who the guest is in Intake is read live (tc_company_contacts.ch_contact_id, the
-- review list, or the same email address), so nothing here copies a name. Nothing is deleted: a guest Client Hub no
-- longer has is marked gone.
CREATE TABLE IF NOT EXISTS tc_go_guests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ch_contact_id TEXT NOT NULL UNIQUE, -- Client Hub contacts.contact_id
  ch_company TEXT,                 -- the company as Client Hub writes it
  country TEXT,
  email_sha TEXT,                  -- sha256 of the lower-case address, first 32 characters: to find the person in Intake
  invitation TEXT NOT NULL,        -- Client Hub's own state: reached | bounced_hard | bounced_soft | decided | record_blocked | opted_out | refused_no_reason
  reason_code TEXT,
  opted_out INTEGER NOT NULL DEFAULT 0,   -- asked not to receive email (Mailchimp)
  gone INTEGER NOT NULL DEFAULT 0,        -- no longer in Client Hub's latest extract
  imported_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS tc_go_sends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  send_key TEXT NOT NULL UNIQUE,   -- go-s01.. in send order
  label TEXT NOT NULL,             -- Send 1-5, Retry 1-2, Final, One-off 1..
  first_sent_at TEXT,
  read_at TEXT,                    -- when Client Hub last read the send's results
  imported_at TEXT NOT NULL
);
-- What one send did for one guest: delivered or not, what came back (person | cant_tell | scanner | none), a click by
-- a person, Add to Calendar (interest, not an RSVP), an opt-out.
CREATE TABLE IF NOT EXISTS tc_go_deliveries (
  guest_id BIGINT NOT NULL REFERENCES tc_go_guests(id),
  send_id BIGINT NOT NULL REFERENCES tc_go_sends(id),
  delivery TEXT NOT NULL,          -- delivered | soft_bounce | hard_bounce
  came_back TEXT,
  clicked INTEGER NOT NULL DEFAULT 0,
  calendar INTEGER NOT NULL DEFAULT 0,
  opted_out INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guest_id, send_id)
);
-- Every applied import: when, by whom, the files' hash and what it changed.
CREATE TABLE IF NOT EXISTS tc_go_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hash TEXT NOT NULL,
  counts TEXT NOT NULL,            -- JSON
  applied_at TEXT NOT NULL,
  applied_by TEXT
);
-- THE STAGE 2 LISTS PER MANAGER (26.10.2026, the owner's pick A): who each of the six managers sends the RSVP email to,
-- loaded from the Save the Date session's sender split. One row per Client Hub contact; a row the newer split no longer
-- has is marked gone, never deleted. The answers are not stored here: they are read live (src/tcrsvp.js).
-- HOW OUR CLIENTS CHANGED (26.10.2026, src/tcmr.js): the yearly management review, per business client and year, how
-- many people they sent (6.5) and how they rated us (6.4). The review's own company names, each matched once to an
-- Intake company in tc_mr_names (or left a name with no link).
CREATE TABLE IF NOT EXISTS tc_mr (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_name TEXT NOT NULL,
  year INTEGER NOT NULL,
  trainees INTEGER,
  rating REAL,
  loaded_at TEXT NOT NULL,
  loaded_by TEXT,
  UNIQUE (review_name, year)
);
CREATE TABLE IF NOT EXISTS tc_mr_names (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_name TEXT NOT NULL UNIQUE,
  company_id BIGINT,
  matched_by TEXT                  -- auto | hand | NULL (no company)
);
-- FIX AN ADDRESS THAT BOUNCED (28.10.2026, src/tcgo.js; the owner's pick A, 26.10.2026): every new address typed in
-- Intake for a not reached guest. The newest row per guest counts; it waits for the next send until Client Hub's extract
-- carries that address. Intake writes nothing into Client Hub.
CREATE TABLE IF NOT EXISTS tc_go_fixes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guest_id BIGINT NOT NULL REFERENCES tc_go_guests(id),
  contact_id BIGINT REFERENCES tc_company_contacts(id),
  old_email TEXT,
  new_email TEXT NOT NULL,
  fixed_at TEXT NOT NULL,
  fixed_by TEXT
);
CREATE INDEX IF NOT EXISTS tc_go_fixes_guest ON tc_go_fixes (guest_id, id);
-- DO NOT INVITE / HOLD (28.10.2026, src/tcgo.js; the owner's rule: always for one event or campaign). A whole company
-- (contact_id NULL) or one person, for every send of the event or one of its sends. A hold is temporary: Release ends
-- it, Make final turns it into a do-not-invite. Nothing is deleted: Undo and Release end the mark and keep the row.
CREATE TABLE IF NOT EXISTS tc_invite_marks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event TEXT NOT NULL,             -- go = the Grand Opening
  send TEXT NOT NULL,              -- config grandOpening.invite.sends: all | stage2
  why TEXT NOT NULL,               -- config grandOpening.invite.why
  kind TEXT NOT NULL,              -- no | hold
  company_id BIGINT NOT NULL REFERENCES tc_companies(id),
  contact_id BIGINT REFERENCES tc_company_contacts(id),
  marked_at TEXT NOT NULL,
  marked_by TEXT,
  final_at TEXT,
  final_by TEXT,
  ended_at TEXT,
  ended_by TEXT
);
CREATE INDEX IF NOT EXISTS tc_invite_marks_company ON tc_invite_marks (company_id, ended_at);
-- COMPANY FAMILIES (28.10.2026, src/tcfam.js; the owner's pick B, suggest + confirm): one parent and its companies, one
-- level, a company in one family at most. The parent is a member too. Nothing merges and nothing is deleted: Unlink
-- ends a member, taking the parent out ends the family. A suggestion answered Not a family is not shown again.
CREATE TABLE IF NOT EXISTS tc_families (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id BIGINT NOT NULL REFERENCES tc_companies(id),
  suggestion TEXT,                 -- the suggestion it was confirmed from: web:<domain> | name:<word>
  created_at TEXT NOT NULL,
  created_by TEXT,
  ended_at TEXT,
  ended_by TEXT
);
CREATE TABLE IF NOT EXISTS tc_family_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id BIGINT NOT NULL REFERENCES tc_families(id),
  company_id BIGINT NOT NULL REFERENCES tc_companies(id),
  added_at TEXT NOT NULL,
  added_by TEXT,
  ended_at TEXT,
  ended_by TEXT
);
CREATE INDEX IF NOT EXISTS tc_family_members_company ON tc_family_members (company_id, ended_at);
CREATE TABLE IF NOT EXISTS tc_family_dismissed (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  suggestion TEXT NOT NULL UNIQUE,
  dismissed_at TEXT NOT NULL,
  dismissed_by TEXT
);
-- My week + Gmail (29.10.2026, src/tcgoogle.js): one row per person who connected their own Google account, read only.
-- token = the refresh token, encrypted (AES-256-GCM); nothing from the mailbox or the calendar is stored.
CREATE TABLE IF NOT EXISTS tc_google_links (
  user_email TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  connected_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tc_go_stage2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ch_contact_id TEXT NOT NULL UNIQUE, -- Client Hub contacts.contact_id
  sender TEXT NOT NULL,            -- config/tc.json grandOpening.stage2.senders[].code
  name TEXT,
  company TEXT,
  position TEXT,
  country TEXT,
  email TEXT,                      -- lower case
  gone INTEGER NOT NULL DEFAULT 0,
  loaded_at TEXT NOT NULL,
  loaded_by TEXT
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
  ['people', 'closed_tag', 'TEXT'],     // 02.10.2026, cold | reject: production's people table predates it
  ['sis_applicants', 'admitted_on', 'TEXT'],   // 06.10.2026, the SIS's own admission date (src/sisdates.js)
  ['inbound', 'first_reply_at', 'TEXT'],       // 07.10.2026, first-reply time: the first sent email in the thread
  ['inbound', 'reply_checked_at', 'TEXT'],     // 07.10.2026, when the thread was last read for it
  ['pbx_calls', 'duration_sec', 'INTEGER'],    // 14.10.2026, the call's length in seconds (lib/pbx.js toSeconds)
  ['pbx_calls', 'talk_sec', 'INTEGER'],        // 14.10.2026, the talk time in seconds
  ['pbx_calls', 'note', 'TEXT'],               // 14.10.2026, what the call was about (one line)
  ['pbx_calls', 'note_by', 'TEXT'],
  ['pbx_calls', 'note_at', 'TEXT'],
  ['tc_tasks', 'kind', 'TEXT'],       // 20.10.2026, My week: how the contact is planned
  ['tc_tasks', 'result', 'TEXT'],     // 20.10.2026, Log a contact: how it went, on the closed task
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
//
// INTAKE_DATABASE_URL comes first (29.10.2026, the move to Supabase): the CRM_DB_ names belong to the Vercel-Neon
// connection, which keeps its own values, so a hand edit there never reaches the app.
export function pgUrl() {
  return pgUrlTidy(process.env.INTAKE_DATABASE_URL || process.env.CRM_DB_DATABASE_URL_UNPOOLED || process.env.DATABASE_URL_UNPOOLED
    || process.env.DATABASE_URL || '');
}

// A PASTED ADDRESS IS READ AS MEANT (29.10.2026, the move to Supabase): spaces, quotes or a leading NAME= around it
// are dropped, and a password holding a character an address cannot carry (# / ? [ ] and the like) is encoded,
// so `new URL()` reads it. The value is never printed.
export function pgUrlTidy(raw) {
  let v = String(raw || '').trim().replace(/^[A-Z_][A-Z0-9_]*=/, '').trim().replace(/^(['"])(.*)\1$/, '$2').trim();
  if (!v) return '';
  try { new URL(v); return v; } catch {}
  const m = /^(postgres(?:ql)?:\/\/)([^:@/]+):(.*)@([^@]+)$/.exec(v);
  if (!m) return v;
  const [, scheme, user, pass, rest] = m;
  let plain = pass;
  try { plain = decodeURIComponent(pass); } catch {}
  return `${scheme}${user}:${encodeURIComponent(plain)}@${rest}`;
}

// THE SCHEMA IS PART OF THE CONNECTION (29.09.2026). It used to be a `SET search_path` sent from the
// pool's 'connect' event - a second query started while the first was still on its way, which pg
// warns about ("Calling client.query() when the client is already executing a query is deprecated")
// and pg@9 will refuse. As a startup option there is no second query at all. Anything already in the
// URL's `options` is kept.
export function pgConnectionString(schema, url = pgUrl()) {
  if (!url) return url;
  const u = new URL(url);
  // Supabase (29.10.2026): an sslmode in the address makes pg drop pgSsl()'s pinned certificate and the
  // connection fails on Supabase's own CA; TLS stays on and verified through pgSsl()
  if (/\.supabase\.(com|co)$/.test(u.hostname)) u.searchParams.delete('sslmode');
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

// AUDIT M6 (07.10.2026): the server's certificate is VERIFIED. It used to be
// rejectUnauthorized: false, which encrypts but accepts anybody who answers. Supabase signs its
// database and pooler certificates with its own root (config/supabase-root-2021-ca.crt, the file
// Supabase publishes, fingerprint checked against the chain the pooler presents on 07.10.2026);
// any other host is checked against the public authorities Node already trusts.
const SUPABASE_CA = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))),
  'config', 'supabase-root-2021-ca.crt');
export function pgSsl(url = pgUrl()) {
  if (/sslmode=disable/.test(url)) return false;
  let host = '';
  try { host = new URL(url).hostname; } catch {}
  if (/\.supabase\.(com|co)$/.test(host)) {
    return { ca: fs.readFileSync(SUPABASE_CA, 'utf8'), rejectUnauthorized: true };
  }
  return { rejectUnauthorized: true };
}

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
  // AUDIT M11: the web server used to fall back to a schema named after a file path while the
  // crons refused without CRM_PG_SCHEMA, so a missing setting split them across two schemas and
  // staff saw an empty CRM. Now both refuse.
  if (!temporary && !process.env.CRM_PG_SCHEMA) {
    throw new Error('Missing required environment variable CRM_PG_SCHEMA (the Postgres schema, normally crm)');
  }
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
    ssl: pgSsl(),
  });
  pool.on('error', () => {});             // an idle connection dropped by the server is not fatal
  const db = new PgDb(pool, pool, schema);
  // Supabase (29.10.2026): the login owns its schema but may not create schemas in the database, and Postgres
  // checks that right before it looks whether the schema exists, so ask first and create only when it is missing.
  const { rows: [have] } = await db.query('SELECT 1 AS y FROM pg_namespace WHERE nspname = $1', [schema]);
  if (!have) await db.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  // AUDIT H4 (07.10.2026): prove the schema took BEFORE creating anything. The schema rides on
  // the connection's startup options; a pooler that dropped them would leave search_path at
  // public, and every table below would be created where Supabase's Data API publishes it.
  const { rows: [where] } = await db.query('SELECT current_schema() AS s');
  if (!where || where.s !== schema) {
    await pool.end().catch(() => {});
    throw new Error(`REFUSING TO START: the connection is in schema "${where && where.s}", not "${schema}". `
      + 'The pooler did not apply the search_path option; nothing was created.');
  }
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
