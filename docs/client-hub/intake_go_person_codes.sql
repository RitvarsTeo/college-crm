-- PERSONAL CODES AND THE LANDING PAGE PREFILL (16.11.2026, patch 146 reshaped; HIS PICK "Yes, build it (Rec.)"). The postcard
-- QR (?k=<card>) prefills the company on novikontas.org/grand-opening; the email invitation link (?k=<card>&c=<code>) prefills the
-- company, the person's name and email. Everything stays editable on the page. For the Supabase database hxeuhlhzekxuoqscxvfj.
-- Needs intake_go_cards.sql (patch 147). Applied only on MASTER's go with the release that uses it.
--
-- 1. intake_go.person_code_issue(contact_id, person_name, company) -> code. Every person on a Grand Opening list with an email gets
--    a 6-character personal code in the SAME place and format as the existing ones (public.std_linkedin_links, [a-z0-9]{6}), so
--    the landing page's personal link works for them as for everyone else. One code per contact id: asked again, it returns the
--    code that contact already has. It never changes or removes an existing code. EXECUTE: intake_app only.
-- 2. public.std_go_prefill(card, code) -> json, for the landing page (anon). Exact match only:
--      a card linked to a company           -> { company }
--      ... and a code of a person on a Grand Opening list under THAT card's company -> { company, first_name, last_name, email }
--      anything else                        -> null (a code of another company gives the company only, never the person)
--    No list, no search, no partial match. At most 600 lookups in any 10 minutes for the whole site (then null), counted in
--    public.std_go_prefill_hits (no grants: only this function writes or reads it). EXECUTE: anon and authenticated, as std_*.
--
-- Undo: DROP FUNCTION public.std_go_prefill(text, text); DROP TABLE public.std_go_prefill_hits;
--       DROP FUNCTION intake_go.person_code_issue(text, text, text);  (codes already issued stay: people may hold their links)

begin;

create or replace function intake_go.person_code_issue(p_contact_id text, p_person_name text, p_company text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id text := btrim(coalesce(p_contact_id, ''));
  v_name text := left(btrim(coalesce(p_person_name, '')), 160);
  v_code text;
  v_tries int := 0;
begin
  if v_id = '' or char_length(v_id) > 80 then
    raise exception 'person_code_issue: no contact id';
  end if;
  perform pg_advisory_xact_lock(hashtext('intake_go.person_code_issue'));
  select l.code into v_code from public.std_linkedin_links l where l.contact_id = v_id order by l.created_at limit 1;
  if v_code is not null then
    return v_code;
  end if;
  loop
    v_tries := v_tries + 1;
    if v_tries > 20 then raise exception 'person_code_issue: no free code'; end if;
    -- 6 random bytes from a version-4 uuid (core Postgres, no extension needed)
    v_code := (select string_agg(substr('abcdefghijklmnopqrstuvwxyz0123456789', 1 + (get_byte(b, i) % 36), 1), '' order by i)
                 from (select uuid_send(gen_random_uuid()) as b) x, generate_series(0, 5) as i);
    exit when not exists (select 1 from public.std_linkedin_links l where l.code = v_code);
  end loop;
  insert into public.std_linkedin_links (code, contact_id, person_name, company, created_at)
  values (v_code, v_id, case when v_name = '' then '-' else v_name end, nullif(left(btrim(coalesce(p_company, '')), 200), ''), now());
  return v_code;
end;
$$;
revoke all on function intake_go.person_code_issue(text, text, text) from public, anon, authenticated;
grant execute on function intake_go.person_code_issue(text, text, text) to intake_app;

create table if not exists public.std_go_prefill_hits (at timestamptz not null default now());
alter table public.std_go_prefill_hits enable row level security;
revoke all on public.std_go_prefill_hits from public, anon, authenticated;

create or replace function public.std_go_prefill(p_card text, p_code text)
returns json
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_card text := lower(btrim(coalesce(p_card, '')));
  v_code text := lower(btrim(coalesce(p_code, '')));
  v_key text;
  v_company text;
  v_name text;
  v_first text;
  v_email text;
begin
  if v_card !~ '^[a-hj-km-np-z2-9]{6}$' then return null; end if;
  if (select count(*) from public.std_go_prefill_hits where at > now() - interval '10 minutes') >= 600 then return null; end if;
  insert into public.std_go_prefill_hits default values;
  select c.company_key, c.company into v_key, v_company from public.std_go_cards c where c.code = v_card and c.company_key is not null;
  if v_key is null then return null; end if;
  if v_code ~ '^[a-z0-9]{6}$' then
    -- the person: on a list (not gone), this code, and placed under THIS card's company on that list
    select s.name, s.first_name, s.email into v_name, v_first, v_email
      from crm.tc_go_stage2 s
      left join crm.tc_go_assign a on a.stage2_id = s.id and a.sender = s.sender and a.company_key <> ''
      left join crm.tc_company_contacts k on k.ch_contact_id = s.ch_contact_id and k.archived_at is null
     where s.gone = 0 and s.link_code = v_code
       and coalesce(a.company_key, 'id:' || k.company_id::text) = v_key
     limit 1;
  end if;
  if v_name is null and v_email is null then
    return json_build_object('company', v_company);
  end if;
  v_name := btrim(coalesce(v_name, ''));
  v_first := btrim(coalesce(nullif(v_first, ''), split_part(v_name, ' ', 1)));
  return json_build_object('company', v_company, 'first_name', v_first,
    'last_name', btrim(case when position(' ' in v_name) > 0 and split_part(v_name, ' ', 1) = v_first then substr(v_name, position(' ' in v_name) + 1) else '' end),
    'email', coalesce(v_email, ''));
end;
$$;
revoke all on function public.std_go_prefill(text, text) from public;
grant execute on function public.std_go_prefill(text, text) to anon, authenticated;

commit;
