-- INTAKE READS THE LANDING PAGE'S COUNTS (11.11.2026, the owner: "then we measure ... what we actually will measure with
-- stage 2 send out"; the Grand Opening demo's "What we measure" shows the Stage 2 measures live). Applied to CLIENT HUB's
-- Supabase database (project hxeuhlhzekxuoqscxvfj) on MASTER's go 11.11.2026. Needs intake_rsvp_reader.sql (applied 26.10).
--
-- What it gives Intake, and nothing more: one view, intake_read.landing_counts, ONE ROW of whole-number totals. No name,
-- no email address, no company, no link code, no time of any single visit. Read by the existing read-only login
-- intake_rsvp_reader (CLIENT_HUB_RSVP_DATABASE_URL); no new login, no new secret.
--   gift_opens / gift_registered       novikontas.org/grand-opening?gift (the QR on every gift), source 'gift'
--   page_opens / page_registered       the same page reached any other way (typed address, shared link)
--   link_opens / link_registered       the personal Stage 2 email links (std_linkedin_events open; std_rsvp answered Yes)
--   link_calendar                      added to calendar from a personal link (std_linkedin_events ics)
-- TEST AND STAFF ENTRIES ARE LEFT OUT (the owner's rule: no test or staff record in any figure): a registration from a
-- novikontas address, one with "test" in its address, company or name, or an address of fewer than 3 characters before
-- the @ (typing tests); a Yes whose invitee's company is marked test. Single visits carry no name, so visits are as stored.
--
-- Undo: DROP VIEW intake_read.landing_counts;

begin;

create or replace view intake_read.landing_counts with (security_barrier = true) as
with reg as (
  select source from public.std_qr_registrations
  where coalesce(email, '') !~* '@novikontas\.'
    and (coalesce(email, '') || ' ' || coalesce(company, '') || ' ' || coalesce(first_name, '') || ' ' || coalesce(last_name, '')) !~* '\mtest'
    and length(split_part(coalesce(email, ''), '@', 1)) >= 3
)
select
  (select count(*) from public.std_qr_events where event = 'open' and source = 'gift')                    as gift_opens,
  (select count(*) from reg where source = 'gift')                                                         as gift_registered,
  (select count(*) from public.std_qr_events where event = 'open' and source is distinct from 'gift')      as page_opens,
  (select count(*) from reg where source is distinct from 'gift')                                          as page_registered,
  (select count(*) from public.std_linkedin_events where event = 'open')                                   as link_opens,
  (select count(*) from public.std_linkedin_events where event = 'ics')                                    as link_calendar,
  (select count(*) from public.std_rsvp r join public.std_linkedin_links l on l.code = r.code
    where r.answer = 'yes' and coalesce(l.company, '') !~* '\mtest\M')                                     as link_registered;

revoke all on intake_read.landing_counts from public, anon, authenticated;
grant select on intake_read.landing_counts to intake_rsvp_reader;

commit;
