-- INTAKE READS THE LANDING PAGE'S COUNTS (11.11.2026, the owner: "demo has to be like the real thing"; the Grand Opening
-- demo's "What we measure" chapter shows the real counts). Applied to CLIENT HUB's Supabase database (project
-- hxeuhlhzekxuoqscxvfj), once, with the owner's yes. Needs intake_rsvp_reader.sql applied first (it is, since 26.10.2026).
--
-- What it gives Intake, and nothing more: one view, intake_read.landing_counts, ONE ROW of whole-number totals. No name,
-- no email address, no company, no link code, no time of any single visit. Read by the existing read-only login
-- intake_rsvp_reader (CLIENT_HUB_RSVP_DATABASE_URL); no new login, no new secret.
--   gift_opens / gift_registered       novikontas.org/grand-opening?gift (the QR on every gift), source 'gift'
--   page_opens / page_registered       the same page reached any other way (typed address, shared link)
--   link_opens / link_calendar         the personal Stage 2 links (std_linkedin_events: open, ics)
--   link_registered                    personal links answered Yes (std_rsvp)
--
-- Undo: DROP VIEW intake_read.landing_counts;

begin;

create or replace view intake_read.landing_counts with (security_barrier = true) as
select
  (select count(*) from public.std_qr_events where event = 'open' and source = 'gift')                          as gift_opens,
  (select count(*) from public.std_qr_registrations where source = 'gift')                                       as gift_registered,
  (select count(*) from public.std_qr_events where event = 'open' and source is distinct from 'gift')            as page_opens,
  (select count(*) from public.std_qr_registrations where source is distinct from 'gift')                        as page_registered,
  (select count(*) from public.std_linkedin_events where event = 'open')                                         as link_opens,
  (select count(*) from public.std_linkedin_events where event = 'ics')                                          as link_calendar,
  (select count(*) from public.std_rsvp where answer = 'yes')                                                     as link_registered;

revoke all on intake_read.landing_counts from public, anon, authenticated;
grant select on intake_read.landing_counts to intake_rsvp_reader;

commit;
