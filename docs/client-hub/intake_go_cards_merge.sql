-- SAME COMPANY, ONE CARD (23.11.2026, patch 163; his pick "Auto obvious, tick rest" and his 16.11 lock "one company = one board
-- place = one piece = one QR"). For the Supabase database hxeuhlhzekxuoqscxvfj. Needs intake_go_cards_reserve.sql (153).
--
-- When Intake merges two companies (src/tcsame.js), the company that stays keeps ONE card and any other card that either company
-- held goes back to the free pool. Which card stays is Intake's decision (the one a guest may already hold: a card of an
-- Amsterdam company, a card that was ever opened); this function only does it, and refuses what could hurt:
--   * a card with a registration on it (public.std_qr_registrations) is never freed
--   * a reserved card is never freed
--   * the card kept must belong to one of the two companies
-- One function, EXECUTE for intake_app only, as the other intake_go functions. The view and the table are unchanged.
--
-- Undo: drop function intake_go.card_merge(text, text, text, text, text).

begin;

create or replace function intake_go.card_merge(p_from_key text, p_to_key text, p_keep_code text, p_company text, p_by text)
returns table (kept_code text, kept_place text, freed_code text, freed_place text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
#variable_conflict use_column
declare
  v_from text := btrim(coalesce(p_from_key, ''));
  v_to text := btrim(coalesce(p_to_key, ''));
  v_keep text := lower(btrim(coalesce(p_keep_code, '')));
  r record;
begin
  if v_from !~ '^id:[0-9]{1,12}$' or v_to !~ '^id:[0-9]{1,12}$' or v_from = v_to then
    raise exception 'card_merge: two different company keys';
  end if;
  perform pg_advisory_xact_lock(hashtext('intake_go.card_link'));
  if v_keep = '' then
    -- no card named to keep: only allowed when neither company holds one (nothing is ever freed by default)
    if exists (select 1 from public.std_go_cards c where c.company_key in (v_from, v_to)) then
      raise exception 'card_merge: name the card to keep';
    end if;
    return;
  end if;
  if v_keep <> '' then
    if not exists (select 1 from public.std_go_cards c where c.code = v_keep and c.company_key in (v_from, v_to)) then
      raise exception 'card_merge: the card to keep is not one of these companies';
    end if;
    update public.std_go_cards c set company_key = v_to, company = left(btrim(coalesce(p_company, c.company)), 200)
     where c.code = v_keep;
    return query select c.code, c.place, null::text, null::text from public.std_go_cards c where c.code = v_keep;
  end if;
  for r in select c.code, c.place, c.reserved from public.std_go_cards c
            where c.company_key in (v_from, v_to) and c.code <> v_keep order by c.code for update loop
    if r.reserved is not null then raise exception 'card_merge: % is reserved', r.place; end if;
    if exists (select 1 from public.std_qr_registrations g where g.card = r.code) then
      raise exception 'card_merge: % has a registration', r.place;
    end if;
    update public.std_go_cards c set company_key = null, company = null, linked_at = null, linked_by = null where c.code = r.code;
    return query select null::text, null::text, r.code, r.place;
  end loop;
end;
$$;
revoke all on function intake_go.card_merge(text, text, text, text, text) from public, anon, authenticated;
grant execute on function intake_go.card_merge(text, text, text, text, text) to intake_app;

commit;
