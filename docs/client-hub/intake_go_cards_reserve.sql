-- RESERVE CARDS, AND A CARD HELD BY NAME IS NEVER FREE (16.11.2026, patch 153). For the Supabase database hxeuhlhzekxuoqscxvfj.
-- Needs intake_go_cards.sql (147) and intake_go_cards_door.sql (148).
--
-- Found 16.11: the Grand Opening session linked Jānis's Amsterdam companies straight into public.std_go_cards; 11 of them carry the
-- company NAME with company_key empty (the company is not in Intake under that key). The 147 function counted "company_key empty"
-- as free, so the next Invite in Intake would have taken one of those printed cards. From now on a card is FREE only when its
-- company_key, company and linked_by are all empty AND it is not reserved.
--
-- RESERVE (his words through Intake MASTER CONTROL): cards 15R, 15S, 15T, 15U, 15V, 16A, 16B, 16C, 16D, 16E are printed as
-- Jānis's reserve, free until he hands one over. One column on the card table, reserved (null = not reserved), one source of
-- truth. intake_go.card_link (the next free card) skips reserved cards; intake_go.card_link_code (link THIS card, at the door or
-- when Jānis hands one over) may link a reserved card, never a card held by a company key or by name.
-- No grant changes: the same intake_app EXECUTE on the same two functions; the view gains the reserved column at its end.
--
-- Undo: the two functions from intake_go_cards.sql / intake_go_cards_door.sql again; the view without the column (drop and
-- create); ALTER TABLE public.std_go_cards DROP COLUMN reserved.

begin;

alter table public.std_go_cards add column if not exists reserved text;
update public.std_go_cards set reserved = 'Jānis reserve 16.11'
 where place in ('15R', '15S', '15T', '15U', '15V', '16A', '16B', '16C', '16D', '16E')
   and company_key is null and company is null and linked_by is null and reserved is null;

create or replace view intake_go.cards with (security_barrier = true) as
select code, place, company_key, company, linked_at, linked_by, reserved
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
  perform pg_advisory_xact_lock(hashtext('intake_go.card_link'));
  select c.code, c.place into v_code, v_place from public.std_go_cards c where c.company_key = v_key limit 1;
  if v_code is not null then
    return query select v_code, v_place;
    return;
  end if;
  -- free = nobody holds it by key or by name, nobody linked it, and it is not reserved
  select c.code, c.place into v_code, v_place from public.std_go_cards c
   where c.company_key is null and c.company is null and c.linked_by is null and c.reserved is null
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
   where c.code = v_code and c.company_key is null and c.company is null and c.linked_by is null and c.reserved is null;
  return query select v_code, v_place;
end;
$$;
revoke all on function intake_go.card_link(text, text, text) from public, anon, authenticated;
grant execute on function intake_go.card_link(text, text, text) to intake_app;

create or replace function intake_go.card_link_code(p_code text, p_company_key text, p_company text, p_by text)
returns table (card_code text, card_place text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
#variable_conflict use_column
declare
  v_code text := lower(btrim(coalesce(p_code, '')));
  v_key text := btrim(coalesce(p_company_key, ''));
  v_place text;
  v_holder text;
  v_name text;
  v_by text;
begin
  if v_code !~ '^[a-hj-km-np-z2-9]{6}$' then
    raise exception 'card_link_code: not a card code';
  end if;
  if v_key !~ '^(id:[0-9]{1,12}|n:.{1,200})$' then
    raise exception 'card_link_code: not a company key';
  end if;
  perform pg_advisory_xact_lock(hashtext('intake_go.card_link'));
  select c.place, c.company_key, c.company, c.linked_by into v_place, v_holder, v_name, v_by from public.std_go_cards c where c.code = v_code for update;
  if v_place is null then
    raise exception 'card_link_code: no such card';
  end if;
  if v_holder = v_key then
    return query select v_code, v_place;
    return;
  end if;
  -- held by another company: by its key, or by name (linked without a key)
  if v_holder is not null or v_name is not null or v_by is not null then
    raise exception 'card_link_code: this card belongs to another company';
  end if;
  if exists (select 1 from public.std_go_cards c where c.company_key = v_key) then
    raise exception 'card_link_code: this company already has a card';
  end if;
  -- a reserved card may be linked here (Jānis hands it over, or the door links it); the reserve note stays as its history
  update public.std_go_cards c
     set company_key = v_key,
         company = left(btrim(coalesce(p_company, '')), 200),
         linked_at = now(),
         linked_by = left(btrim(coalesce(p_by, '')), 120)
   where c.code = v_code and c.company_key is null and c.company is null and c.linked_by is null;
  return query select v_code, v_place;
end;
$$;
revoke all on function intake_go.card_link_code(text, text, text, text) from public, anon, authenticated;
grant execute on function intake_go.card_link_code(text, text, text, text) to intake_app;

commit;
