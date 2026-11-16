-- THE DOOR KNOWS THE CARD (16.11.2026, patch 148, the door scanner). The same read-only view intake_read.registered_people
-- (intake_registered_people.sql, applied 12.11) with ONE more column at the end: card, the 6-character Grand Opening card code
-- a person registered through (novikontas.org/grand-opening?k=<code>; public.std_qr_registrations.card), null for a personal
-- link. The door lists who registered through the scanned card. Same filters, same login (intake_rsvp_reader), nothing else.
-- Applied only on MASTER's go with the release that reads it.
--
-- Undo: apply intake_registered_people.sql again (the view without the card column; drop the view first, as a column cannot
-- be removed by create or replace).

begin;

create or replace view intake_read.registered_people with (security_barrier = true) as
select 'L:' || p.code || ':' || p.position::text as reg_key,
       'link'::text as source,
       l.contact_id,
       p.first_name, p.last_name, lower(trim(p.email)) as email,
       l.company,
       null::text as card
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
       q.company,
       q.card
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
