-- =====================================================================
-- Update: customers can join a business's points program WITHOUT a membership,
-- and staff can add a membership to an existing customer later.
-- Paste into Supabase > SQL Editor > New query > Run. Safe to run twice.
-- =====================================================================

-- p_tier_id can now be empty: then the customer gets a points-only account
-- (only allowed when the business has points turned on).
create or replace function public.join_business(p_slug text, p_tier_id uuid, p_name text, p_phone text)
returns uuid language plpgsql security definer set search_path = public as $$
declare b public.businesses; t public.tiers; new_member public.members; digits text;
begin
  select * into b from public.businesses where slug = lower(p_slug);
  if not found then raise exception 'negocio_no_existe'; end if;
  if p_tier_id is null then
    if not b.points_enabled then raise exception 'nivel_no_existe'; end if;
  else
    select * into t from public.tiers where id = p_tier_id and business_id = b.id and active;
    if not found then raise exception 'nivel_no_existe'; end if;
  end if;
  digits := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'nombre_invalido'; end if;
  -- Numbers are stored in full international form, digits only.
  -- Mexico = 52 + 10 digits (drop the old mobile "1" if someone sends 521 + 10).
  -- USA / Canada = 1 + 10 digits. Anything else: 8 to 15 digits.
  if digits ~ '^521[0-9]{10}$' then digits := '52' || right(digits, 10); end if;
  if digits ~ '^52' and char_length(digits) <> 12 then raise exception 'telefono_invalido'; end if;
  if digits ~ '^1' and char_length(digits) <> 11 then raise exception 'telefono_invalido'; end if;
  if digits !~ '^[0-9]{8,15}$' then raise exception 'telefono_invalido'; end if;

  insert into public.members (business_id, name, phone) values (b.id, trim(p_name), digits)
    returning * into new_member;
  if p_tier_id is not null then
    insert into public.memberships (member_id, business_id, tier_id) values (new_member.id, b.id, t.id);
  end if;
  return new_member.pass_token;
end;
$$;

-- Staff: sell a membership to a customer who has none (or whose last one was cancelled).
-- It starts as "pending" until staff confirm the payment.
create or replace function public.add_membership(p_member uuid, p_tier uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.members; t public.tiers;
begin
  select * into m from public.members where id = p_member;
  if not found then raise exception 'no_encontrada'; end if;
  if not public.is_staff_of(m.business_id) then raise exception 'sin_permiso'; end if;
  select * into t from public.tiers where id = p_tier and business_id = m.business_id and active;
  if not found then raise exception 'nivel_no_existe'; end if;
  if exists (select 1 from public.memberships ms
             where ms.member_id = m.id and ms.status in ('pending', 'active')) then
    raise exception 'membresia_existente';
  end if;
  insert into public.memberships (member_id, business_id, tier_id) values (m.id, m.business_id, t.id);
  return public._member_json(m.id);
end;
$$;

-- The join page also needs to know how the points work.
create or replace function public.get_public_business(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', b.name, 'brand_color', b.brand_color, 'unit_label', b.unit_label,
    'category', b.category, 'neighborhood', b.neighborhood, 'description', b.description,
    'points_enabled', b.points_enabled, 'points_mode', b.points_mode,
    'points_per_visit', b.points_per_visit, 'points_per_100', b.points_per_100,
    'tiers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'name', t.name, 'price_mxn', t.price_mxn, 'kind', t.kind,
               'credits_per_period', t.credits_per_period, 'period_days', t.period_days)
             order by t.price_mxn)
      from public.tiers t where t.business_id = b.id and t.active
    ), '[]'::jsonb)
  )
  from public.businesses b where b.slug = lower(p_slug);
$$;

-- Businesses with points but no memberships can be listed too.
create or replace function public.directory_list(p_query text default null, p_category text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x.j order by x.name), '[]'::jsonb)
  from (
    select b.name,
      jsonb_build_object(
        'slug', b.slug, 'name', b.name, 'category', b.category, 'neighborhood', b.neighborhood,
        'description', b.description, 'unit_label', b.unit_label, 'points_enabled', b.points_enabled,
        'from_price', (select min(t.price_mxn) from public.tiers t where t.business_id = b.id and t.active)
      ) as j
    from public.businesses b
    where b.listed
      and (b.points_enabled or exists (select 1 from public.tiers t where t.business_id = b.id and t.active))
      and (nullif(trim(p_category), '') is null or b.category = trim(p_category))
      and (nullif(trim(p_query), '') is null
           or b.name ilike '%' || trim(p_query) || '%'
           or coalesce(b.neighborhood, '') ilike '%' || trim(p_query) || '%'
           or coalesce(b.description, '') ilike '%' || trim(p_query) || '%')
    order by b.name
    limit 100
  ) x;
$$;

revoke all on function public.join_business(text, uuid, text, text) from public;
revoke all on function public.add_membership(uuid, uuid)            from public, anon;
revoke all on function public.get_public_business(text)             from public;
revoke all on function public.directory_list(text, text)            from public;
grant execute on function public.join_business(text, uuid, text, text) to anon, authenticated;
grant execute on function public.add_membership(uuid, uuid)            to authenticated;
grant execute on function public.get_public_business(text)             to anon, authenticated;
grant execute on function public.directory_list(text, text)            to anon, authenticated;
