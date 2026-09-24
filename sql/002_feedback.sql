-- Feedback sent from inside the app, with an optional screenshot.
--
-- STATUS: NOT YET APPLIED. This is the Postgres shape of what the prototype
-- currently keeps in SQLite (src/db.js). It is written down now so the move to
-- Supabase is a migration and not a redesign. Applying it is a separate,
-- deliberate act - see docs/DEPLOYMENT.md.
--
-- Row Level Security is ON and there are NO policies, on purpose. Nothing may
-- reach these tables through the public API. Every read and write goes through
-- the server, which is the only place that knows who is an admin.

create table if not exists feedback (
  id            bigint generated always as identity primary key,
  author        text,                                   -- who was acting when they sent it
  kind          text not null check (kind in ('BUG', 'IDEA')),
  body          text not null check (char_length(body) between 4 and 2000),
  path          text check (char_length(path) <= 200),  -- the screen. A hint from the client, display only.
  created_at    timestamptz not null default now(),
  handled_at    timestamptz,                            -- a time, not a flag: the inbox says WHEN
  handled_by    text
);

create index if not exists feedback_open_first
  on feedback ((handled_at is not null), created_at desc);

-- Separate table so listing the inbox never drags image bytes across the wire.
create table if not exists feedback_screenshots (
  feedback_id   bigint primary key references feedback(id) on delete cascade,
  mime_type     text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  size_bytes    integer not null,
  data          bytea not null,
  created_at    timestamptz not null default now(),
  -- the size is not taken on trust; it must match what was actually stored
  constraint feedback_screenshot_size check (size_bytes = octet_length(data) and size_bytes > 0)
);

-- The declared content type is never stored. src/feedback.js reads the first
-- bytes and stores what they really are, which is what stops an HTML file
-- labelled image/png being served back to an admin as a document.

alter table feedback enable row level security;
alter table feedback_screenshots enable row level security;

revoke all on feedback from anon, authenticated;
revoke all on feedback_screenshots from anon, authenticated;

-- No policy is created. That is the point: with RLS on and no policy, anon and
-- authenticated can read nothing, and the service role reaches it as usual.
