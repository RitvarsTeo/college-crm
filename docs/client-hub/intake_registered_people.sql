-- INTAKE READS WHO REGISTERED (12.11.2026, his pick "Yes, read them": Intake reads the gift-QR / typed-address registrations
-- and the personal-link registrations READ-ONLY, so every registered person gets a ticket). For CLIENT HUB's Supabase
-- database (project hxeuhlhzekxuoqscxvfj, schema public). Needs intake_rsvp_reader.sql (applied 26.10). Applied only on
-- MASTER's go with the release that reads it.
--
-- What it gives Intake, and nothing more: one view, intake_read.registered_people, one row per registered person, with the
-- least fields a ticket needs: a registration key, how they came (link / gift / page), the invitee's Client Hub contact id
-- (personal links only, to find their list owner), first name, last name, email address, the company they wrote.
-- No times, no visit logs, no link codes beyond the key, no party or position numbers. Read by the existing read-only login
-- intake_rsvp_reader (CLIENT_HUB_RSVP_DATABASE_URL); no new login, no new secret.
--   personal link (std_rsvp_people of a link whose answer is Yes now; a later No takes the people out)
--   gift QR / typed address (std_qr_registrations; source 'gift' = the QR on every gift, anything else = 'page')
-- TEST AND STAFF ENTRIES ARE LEFT OUT (the owner's rule: no test or staff record in any figure), as in landing_counts: a
-- novikontas address, "test" in the address, company or name, an address of fewer than 3 characters before the @; a link
-- whose invitee's company is marked test. And (13.11.2026, his rule "test records never in any figure", the "aaaaa / aaa / aaaa"
-- registration) a first name, last name or company that is one letter repeated ("aaaa", "x").
--
-- Undo: DROP VIEW intake_read.registered_people;

begin;

create or replace view intake_read.registered_people with (security_barrier = true) as
select 'L:' || p.code || ':' || p.position::text as reg_key,
       'link'::text as source,
       l.contact_id,
       p.first_name, p.last_name, lower(trim(p.email)) as email,
       l.company
from public.std_rsvp_people p
join public.std_linkedin_links l on l.code = p.code
join public.std_rsvp r on r.code = p.code
where r.answer = 'yes'
  and coalesce(l.company, '') !~* '\mtest\M'
  and coalesce(p.email, '') !~* '@novikontas\.'
  and (coalesce(p.email, '') || ' ' || coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) !~* '\mtest'
  and length(split_part(coalesce(p.email, ''), '@', 1)) >= 3
  and lower(trim(coalesce(p.first_name, ''))) !~ '^(.)\1*$'
  and lower(trim(coalesce(p.last_name, ''))) !~ '^(.)\1*$'
  and lower(trim(coalesce(l.company, ''))) !~ '^(.)\1*$'
union all
select 'Q:' || q.id::text,
       case when q.source = 'gift' then 'gift' else 'page' end,
       null::text,
       q.first_name, q.last_name, lower(trim(q.email)),
       q.company
from public.std_qr_registrations q
where coalesce(q.email, '') !~* '@novikontas\.'
  and (coalesce(q.email, '') || ' ' || coalesce(q.company, '') || ' ' || coalesce(q.first_name, '') || ' ' || coalesce(q.last_name, '')) !~* '\mtest'
  and length(split_part(coalesce(q.email, ''), '@', 1)) >= 3
  and lower(trim(coalesce(q.first_name, ''))) !~ '^(.)\1*$'
  and lower(trim(coalesce(q.last_name, ''))) !~ '^(.)\1*$'
  and lower(trim(coalesce(q.company, ''))) !~ '^(.)\1*$';

revoke all on intake_read.registered_people from public, anon, authenticated;
grant select on intake_read.registered_people to intake_rsvp_reader;

commit;
