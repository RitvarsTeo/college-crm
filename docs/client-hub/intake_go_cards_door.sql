-- LINK THIS CARD AT THE DOOR (16.11.2026, patch 148, the door scanner, screen 4 "Card not linked yet"). A card Jānis handed
-- out at a meeting, or one printed spare, comes to the door before Intake linked it. Staff pick the guest's company and link
-- THAT card on the spot. Needs intake_go_cards.sql (patch 147).
--
-- What intake_app gets, and nothing more: EXECUTE on intake_go.card_link_code(code, company_key, company, by). It links this
-- card only when the card exists, is free, and the company has no card yet; otherwise it refuses and says why. It never
-- re-links a card another company holds, never clears a link, never creates or removes a card.
--
-- Undo: DROP FUNCTION intake_go.card_link_code(text, text, text, text);

begin;

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
begin
  if v_code !~ '^[a-hj-km-np-z2-9]{6}$' then
    raise exception 'card_link_code: not a card code';
  end if;
  if v_key !~ '^(id:[0-9]{1,12}|n:.{1,200})$' then
    raise exception 'card_link_code: not a company key';
  end if;
  perform pg_advisory_xact_lock(hashtext('intake_go.card_link'));
  select c.place, c.company_key into v_place, v_holder from public.std_go_cards c where c.code = v_code for update;
  if v_place is null then
    raise exception 'card_link_code: no such card';
  end if;
  if v_holder = v_key then
    return query select v_code, v_place;
    return;
  end if;
  if v_holder is not null then
    raise exception 'card_link_code: this card belongs to another company';
  end if;
  if exists (select 1 from public.std_go_cards c where c.company_key = v_key) then
    raise exception 'card_link_code: this company already has a card';
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
revoke all on function intake_go.card_link_code(text, text, text, text) from public, anon, authenticated;
grant execute on function intake_go.card_link_code(text, text, text, text) to intake_app;

commit;
