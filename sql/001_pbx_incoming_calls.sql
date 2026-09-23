-- 001_pbx_incoming_calls.sql
--
-- NOT YET APPLIED. See "HOW TO APPLY" at the foot of this file. The file is
-- written first and deliberately: a migration applied without its file is a
-- migration the next person cannot replay, and a file that pretends it is live
-- is worse than one that says it is not. Replace this paragraph with the
-- applied-migration name and date the moment it goes in.
--
-- WHAT THIS HOLDS. One row per incoming call to the three college queues:
-- when it came, which queue, the caller's number, whether anybody picked up,
-- and who talked. Nothing else. No recording link, no transcript, no duration,
-- no routing history - none of which this logger asks the PBX for.
--
-- THIS IS PERSONAL DATA. A caller number identifies a person, and the pairing
-- of number, time and operator says who rang the college about studying and
-- whether they were answered. RLS is on and there is no read policy for
-- anonymous or authenticated roles: today the only thing that may touch this
-- table is the service role the cron job runs as. A dashboard that needs to
-- read it gets its own policy, written then, for the seats that need it.
--
-- RETENTION IS NOT DECIDED. There is no purge job in this migration because
-- nobody has said how long a call record may be kept. That is an owner and
-- privacy decision, not a technical default, and inventing 90 days here would
-- be inventing a policy. Until it is decided the table grows.

create table if not exists public.pbx_incoming_calls (
  -- the PBX's own id for the call. Primary key, because the 15-minute polling
  -- windows overlap on purpose and the upsert leans on exactly this.
  uniqueid       text primary key,

  -- the moment the call happened, as an absolute instant. The PBX reports
  -- Riga wall-clock; lib/riga.js converts it explicitly before it is written,
  -- so a call at 03:30 on a clocks-change Sunday lands where it really was.
  created_at     timestamptz not null,

  queue          text not null,
  caller_num     text,

  -- state == 'ANSWER' and nothing else. A missed call is false, never null.
  picked_up      boolean not null,

  -- null on a missed call, because nobody talked.
  operator_name  text,

  inserted_at    timestamptz not null default now()
);

-- The queries this table exists to answer are "what came in on this day" and
-- "what did this queue do", so both are indexed. Nothing else is, because
-- nothing else is being asked yet.
create index if not exists pbx_incoming_calls_created_at_idx
  on public.pbx_incoming_calls (created_at desc);
create index if not exists pbx_incoming_calls_queue_created_idx
  on public.pbx_incoming_calls (queue, created_at desc);

comment on table public.pbx_incoming_calls is
  'Incoming calls to the three college phone queues, collected every 5 minutes from the tg.lv PBX. Personal data: RLS on, service role only until a dashboard policy is written. Retention undecided.';

-- ---------------------------------------------------------------- security --
-- RLS on, and deliberately no permissive policy. In Postgres, RLS enabled with
-- no policy denies every row to every role that is subject to RLS. The service
-- role bypasses RLS, which is how the cron job writes, and is also why the
-- service key must never leave the server.
alter table public.pbx_incoming_calls enable row level security;

-- Belt and braces: even if a policy is added later by mistake, the anon and
-- authenticated roles hold no table grants here to begin with.
revoke all on public.pbx_incoming_calls from anon, authenticated;

-- A read policy for a dashboard goes HERE when a dashboard exists and somebody
-- has decided which seats may see caller numbers. Written as a comment rather
-- than commented-out SQL, so nobody can uncomment their way past that decision.

-- ------------------------------------------------------------ HOW TO APPLY --
-- 1. Read this file. It grants nothing to anon or authenticated on purpose.
-- 2. Apply it to the College CRM Supabase project (SQL editor, or the Supabase
--    MCP apply_migration with the name `001_pbx_incoming_calls`).
-- 3. Confirm: select relrowsecurity from pg_class where relname = 'pbx_incoming_calls';
--    It must come back true.
-- 4. Confirm no policies exist yet:
--    select count(*) from pg_policies where tablename = 'pbx_incoming_calls';
--    It must come back 0.
-- 5. Replace the NOT YET APPLIED paragraph at the top with the date it went in.
-- 6. Run the security audit before the cron is switched on.
