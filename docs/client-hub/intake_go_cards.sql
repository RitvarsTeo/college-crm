-- THE GRAND OPENING CARDS IN INTAKE (16.11.2026, patch 147). His picks: "Automatic (Recommended)" - Intake links a free card
-- the moment a company is saved as Invite; Decision 1 "A: card table (Rec.)" - the link lives in public.std_go_cards, where the
-- cards and the landing page already are, one source of truth; Decision 2 "Yes (Recommended)" - a card stays its company's for
-- good (No = out of the export, Invite again = the same card, a card never goes to a second company).
-- For the Supabase database hxeuhlhzekxuoqscxvfj. Applied only on MASTER's go with the release that uses it.
--
-- What Intake's own login (intake_app) gets, and nothing more:
--   1. SELECT on one view, intake_go.cards: code, place, company_key, company, linked_at, linked_by.
--   2. EXECUTE on one function, intake_go.card_link(company_key, company, by): the card this company already has, or the next
--      free card in board order (1A..1V, 2A..35V), linked to it. It never re-links a card another company holds, never clears
--      a link, never creates or removes a card.
-- Both live in their own schema intake_go, which the Data API does not publish; anon and authenticated get nothing.
--
-- Undo: DROP FUNCTION intake_go.card_link(text, text, text); DROP VIEW intake_go.cards; DROP SCHEMA intake_go;
-- (links already written stay on public.std_go_cards; they are the record of which card went to which company.)

begin;

create schema if not exists intake_go;
revoke all on schema intake_go from public;
grant usage on schema intake_go to intake_app;

create or replace view intake_go.cards with (security_barrier = true) as
select code, place, company_key, company, linked_at, linked_by
from public.std_go_cards;
revoke all on intake_go.cards from public, anon, authenticated;
grant select on intake_go.cards to intake_app;

create or replace function intake_go.card_link(p_company_key text, p_company text, p_by text)
returns table (card_code text, card_place text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
#variable_conflict use_column
declare
  v_key text := btrim(coalesce(p_company_key, ''));
  v_code text;
  v_place text;
begin
  if v_key !~ '^(id:[0-9]{1,12}|n:.{1,200})$' then
    raise exception 'card_link: not a company key';
  end if;
  -- one link at a time, so two saves never take the same free card
  perform pg_advisory_xact_lock(hashtext('intake_go.card_link'));
  select c.code, c.place into v_code, v_place from public.std_go_cards c where c.company_key = v_key limit 1;
  if v_code is not null then
    return query select v_code, v_place;
    return;
  end if;
  select c.code, c.place into v_code, v_place from public.std_go_cards c
   where c.company_key is null
   order by (substring(c.place from '^[0-9]+'))::int, substring(c.place from '[A-Z]+$')
   limit 1
   for update;
  if v_code is null then
    raise exception 'card_link: no free card';
  end if;
  update public.std_go_cards c
     set company_key = v_key,
         company = left(btrim(coalesce(p_company, '')), 200),
         linked_at = now(),
         linked_by = left(btrim(coalesce(p_by, '')), 120)
   where c.code = v_code and c.company_key is null;
  return query select v_code, v_place;
end;
$$;
revoke all on function intake_go.card_link(text, text, text) from public, anon, authenticated;
grant execute on function intake_go.card_link(text, text, text) to intake_app;

commit;
