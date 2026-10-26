-- INTAKE READS THE RSVP ANSWERS (26.10.2026, the owner's pick: Intake's Grand Opening page shows the answers LIVE).
-- Applied to CLIENT HUB's Supabase database (project hxeuhlhzekxuoqscxvfj), once, with the owner's yes.
--
-- What it gives Intake, and nothing more:
--   * one view, intake_read.rsvp_answers: per answered invitation link, the Client Hub contact id, the invitee's name and
--     company, the answer (yes / maybe / no), how many people, when. No email address, no named guests, no link code.
--   * one login, intake_rsvp_reader, that can SELECT that view and nothing else: no table, no other schema, no function.
--     Read-only at the role, 5 s statement limit, at most 3 connections.
-- The schema is not one the Data API serves (only public is), so the view is reachable only through this login.
--
-- The PASSWORD is not in this file. The owner sets it himself, after this file, in the Supabase SQL editor:
--   ALTER ROLE intake_rsvp_reader PASSWORD '<from Bitwarden>';
-- and pastes the connection string (Session pooler, port 5432, user intake_rsvp_reader.hxeuhlhzekxuoqscxvfj) into
-- Intake's .env.local, Bitwarden and Vercel as CLIENT_HUB_RSVP_DATABASE_URL.
--
-- Undo: DROP VIEW intake_read.rsvp_answers; DROP SCHEMA intake_read; DROP ROLE intake_rsvp_reader;

begin;

create schema if not exists intake_read;
revoke all on schema intake_read from public;

create or replace view intake_read.rsvp_answers with (security_barrier = true) as
select l.contact_id,
       l.person_name,
       l.company,
       r.answer,
       r.guests,
       r.first_at,
       r.updated_at
from public.std_rsvp r
join public.std_linkedin_links l on l.code = r.code;

revoke all on intake_read.rsvp_answers from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'intake_rsvp_reader') then
    create role intake_rsvp_reader login noinherit nocreatedb nocreaterole noreplication connection limit 3;
  end if;
end $$;

alter role intake_rsvp_reader set default_transaction_read_only = on;
alter role intake_rsvp_reader set statement_timeout = '5s';
alter role intake_rsvp_reader set search_path = intake_read;

grant usage on schema intake_read to intake_rsvp_reader;
grant select on intake_read.rsvp_answers to intake_rsvp_reader;

commit;
