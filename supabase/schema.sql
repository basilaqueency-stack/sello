-- =====================================================================
-- Sello database schema, v1
-- Paste this whole file into Supabase > SQL Editor > New query > Run.
-- It is safe to read top to bottom. Nothing here deletes existing data.
--
-- How access works:
--   * Customers are NOT logged in. Their pass is a private link containing
--     a random token (pass_token). They can only reach data through the
--     small functions at the bottom (join_business, get_pass).
--   * Staff and owners ARE logged in (Supabase Auth). Row-level security
--     lets them see only their own business's rows.
--   * No table can be read or written by the public (anon) role directly.
-- =====================================================================

-- ---------- Tables ----------

create table if not exists public.businesses (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  name        text not null check (char_length(name) between 2 and 80),
  brand_color text not null default '#D14C18' check (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  unit_label  text not null default 'cafés' check (char_length(unit_label) between 2 and 30),
  listed      boolean not null default false,   -- shows in the public directory (later)
  created_at  timestamptz not null default now()
);

create table if not exists public.business_staff (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('owner', 'staff')),
  primary key (business_id, user_id)
);

create table if not exists public.tiers (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null references public.businesses(id) on delete cascade,
  name               text not null check (char_length(name) between 2 and 60),
  price_mxn          integer not null check (price_mxn >= 0),
  kind               text not null check (kind in ('credits', 'unlimited')),
  credits_per_period integer check (credits_per_period is null or credits_per_period > 0),
  period_days        integer not null default 30 check (period_days > 0),
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  check (kind = 'unlimited' or credits_per_period is not null)
);

-- A "member" is one person at one business. Duplicates by phone are allowed
-- on purpose: returning an existing pass to anyone who types a phone number
-- would let strangers take over someone's pass.
create table if not exists public.members (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null check (char_length(name) between 2 and 80),
  phone       text not null check (phone ~ '^[0-9]{8,15}$'),
  pass_token  uuid not null unique default gen_random_uuid(),
  created_at  timestamptz not null default now()
);
create index if not exists members_business_phone_idx on public.members (business_id, phone);

-- Status is stored as pending/active/cancelled. "Expired" is worked out
-- from expires_at when read, so no scheduled job is needed.
create table if not exists public.memberships (
  id                uuid primary key default gen_random_uuid(),
  member_id         uuid not null references public.members(id) on delete cascade,
  business_id       uuid not null references public.businesses(id) on delete cascade,
  tier_id           uuid not null references public.tiers(id),
  status            text not null default 'pending' check (status in ('pending', 'active', 'cancelled')),
  starts_at         timestamptz,
  expires_at        timestamptz,
  credits_remaining integer check (credits_remaining is null or credits_remaining >= 0),
  payment_method    text not null default 'manual' check (payment_method in ('manual', 'auto')),
  created_at        timestamptz not null default now()
);
create index if not exists memberships_member_idx on public.memberships (member_id, created_at desc);

-- Every stamp is its own row (a ledger), never just an edited number.
-- client_id lets the staff app retry a stamp safely after a signal drop.
create table if not exists public.redemptions (
  id            uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships(id) on delete cascade,
  business_id   uuid not null references public.businesses(id) on delete cascade,
  staff_user_id uuid references auth.users(id) on delete set null,
  client_id     uuid unique,
  created_at    timestamptz not null default now()
);
create index if not exists redemptions_membership_idx on public.redemptions (membership_id, created_at desc);
create index if not exists redemptions_business_idx on public.redemptions (business_id, created_at desc);

-- ---------- Helper checks ----------

create or replace function public.is_staff_of(b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.business_staff where business_id = b and user_id = auth.uid());
$$;

create or replace function public.is_owner_of(b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.business_staff where business_id = b and user_id = auth.uid() and role = 'owner');
$$;

-- ---------- Row-level security ----------

alter table public.businesses     enable row level security;
alter table public.business_staff enable row level security;
alter table public.tiers          enable row level security;
alter table public.members        enable row level security;
alter table public.memberships    enable row level security;
alter table public.redemptions    enable row level security;

revoke all on all tables in schema public from anon;

drop policy if exists businesses_staff_read on public.businesses;
create policy businesses_staff_read on public.businesses
  for select to authenticated using (public.is_staff_of(id));

drop policy if exists businesses_owner_update on public.businesses;
create policy businesses_owner_update on public.businesses
  for update to authenticated using (public.is_owner_of(id)) with check (public.is_owner_of(id));

drop policy if exists staff_read_own on public.business_staff;
create policy staff_read_own on public.business_staff
  for select to authenticated using (user_id = auth.uid() or public.is_owner_of(business_id));

drop policy if exists tiers_staff_read on public.tiers;
create policy tiers_staff_read on public.tiers
  for select to authenticated using (public.is_staff_of(business_id));

drop policy if exists tiers_owner_insert on public.tiers;
create policy tiers_owner_insert on public.tiers
  for insert to authenticated with check (public.is_owner_of(business_id));

drop policy if exists tiers_owner_update on public.tiers;
create policy tiers_owner_update on public.tiers
  for update to authenticated using (public.is_owner_of(business_id)) with check (public.is_owner_of(business_id));

drop policy if exists members_staff_read on public.members;
create policy members_staff_read on public.members
  for select to authenticated using (public.is_staff_of(business_id));

drop policy if exists memberships_staff_read on public.memberships;
create policy memberships_staff_read on public.memberships
  for select to authenticated using (public.is_staff_of(business_id));

drop policy if exists redemptions_staff_read on public.redemptions;
create policy redemptions_staff_read on public.redemptions
  for select to authenticated using (public.is_staff_of(business_id));

-- Writes to members, memberships and redemptions happen ONLY through the
-- functions below, so the rules (no stamping an expired pass, etc.) can't be skipped.

-- ---------- Functions: staff and owners (logged in) ----------

-- First-time setup: creates a business and makes the caller its owner.
create or replace function public.create_business(p_name text, p_slug text, p_unit text default 'cafés')
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'no_sesion'; end if;
  insert into public.businesses (name, slug, unit_label)
    values (trim(p_name), lower(trim(p_slug)), coalesce(nullif(trim(p_unit), ''), 'cafés'))
    returning id into new_id;
  insert into public.business_staff (business_id, user_id, role) values (new_id, auth.uid(), 'owner');
  return new_id;
exception when unique_violation then
  raise exception 'slug_en_uso';
end;
$$;

-- Builds the JSON shape the staff app shows for one member.
create or replace function public._member_json(p_member uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'member_id',  m.id,
    'name',       m.name,
    'phone',      m.phone,
    'pass_token', m.pass_token,
    'membership', (
      select jsonb_build_object(
        'id',                ms.id,
        'status',            case
                               when ms.status = 'active' and ms.expires_at < now() then 'expired'
                               else ms.status end,
        'tier_name',         t.name,
        'kind',              t.kind,
        'price_mxn',         t.price_mxn,
        'period_days',       t.period_days,
        'credits_remaining', ms.credits_remaining,
        'credits_total',     t.credits_per_period,
        'expires_at',        ms.expires_at
      )
      from public.memberships ms
      join public.tiers t on t.id = ms.tier_id
      where ms.member_id = m.id
      order by ms.created_at desc
      limit 1
    )
  )
  from public.members m where m.id = p_member;
$$;
revoke all on function public._member_json(uuid) from public, anon, authenticated;

-- Search by name, phone digits, or a scanned pass token.
create or replace function public.lookup_members(p_business uuid, p_query text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  q text := trim(coalesce(p_query, ''));
  digits text := regexp_replace(q, '[^0-9]', '', 'g');
  result jsonb;
begin
  if not public.is_staff_of(p_business) then raise exception 'sin_permiso'; end if;
  if q = '' then return '[]'::jsonb; end if;

  if q ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select coalesce(jsonb_agg(public._member_json(m.id)), '[]'::jsonb) into result
      from public.members m where m.business_id = p_business and m.pass_token = q::uuid;
    return result;
  end if;

  select coalesce(jsonb_agg(public._member_json(x.id)), '[]'::jsonb) into result
  from (
    select m.id from public.members m
    where m.business_id = p_business
      and (m.name ilike '%' || q || '%' or (length(digits) >= 3 and m.phone like '%' || digits || '%'))
    order by m.created_at desc
    limit 20
  ) x;
  return result;
end;
$$;

-- Confirms a payment (cash or card at the counter) and starts / renews the membership.
create or replace function public.activate_membership(p_membership uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ms public.memberships; t public.tiers;
begin
  select * into ms from public.memberships where id = p_membership for update;
  if not found then raise exception 'no_encontrada'; end if;
  if not public.is_staff_of(ms.business_id) then raise exception 'sin_permiso'; end if;
  if ms.status = 'cancelled' then raise exception 'cancelada'; end if;
  select * into t from public.tiers where id = ms.tier_id;
  update public.memberships set
      status = 'active',
      starts_at = now(),
      expires_at = now() + make_interval(days => t.period_days),
      credits_remaining = t.credits_per_period
    where id = ms.id;
  return public._member_json(ms.member_id);
end;
$$;

-- Adds one stamp. Safe to retry: the same client_id never stamps twice.
create or replace function public.redeem_stamp(p_membership uuid, p_client_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ms public.memberships; t public.tiers;
begin
  select * into ms from public.memberships where id = p_membership for update;
  if not found then raise exception 'no_encontrada'; end if;
  if not public.is_staff_of(ms.business_id) then raise exception 'sin_permiso'; end if;

  if p_client_id is not null and exists (select 1 from public.redemptions where client_id = p_client_id) then
    return public._member_json(ms.member_id);  -- already recorded
  end if;

  if ms.status = 'pending' then raise exception 'pendiente'; end if;
  if ms.status = 'cancelled' then raise exception 'cancelada'; end if;
  if ms.expires_at is null or ms.expires_at < now() then raise exception 'vencida'; end if;
  select * into t from public.tiers where id = ms.tier_id;
  if t.kind = 'credits' then
    if coalesce(ms.credits_remaining, 0) <= 0 then raise exception 'sin_sellos'; end if;
    update public.memberships set credits_remaining = credits_remaining - 1 where id = ms.id;
  end if;
  insert into public.redemptions (membership_id, business_id, staff_user_id, client_id)
    values (ms.id, ms.business_id, auth.uid(), p_client_id);
  return public._member_json(ms.member_id);
end;
$$;

create or replace function public.recent_checkins(p_business uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff_of(p_business) then raise exception 'sin_permiso'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('name', x.name, 'at', x.created_at, 'credits_remaining', x.credits_remaining)
                     order by x.created_at desc)
    from (
      select m.name, r.created_at, ms.credits_remaining
      from public.redemptions r
      join public.memberships ms on ms.id = r.membership_id
      join public.members m on m.id = ms.member_id
      where r.business_id = p_business
      order by r.created_at desc
      limit 10
    ) x
  ), '[]'::jsonb);
end;
$$;

-- Owner-only numbers for the Panel.
create or replace function public.get_stats(p_business uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_owner_of(p_business) then raise exception 'sin_permiso'; end if;
  return (
    select jsonb_build_object(
      'active_members', count(*) filter (where ms.status = 'active' and ms.expires_at >= now()),
      'expiring_week',  count(*) filter (where ms.status = 'active' and ms.expires_at >= now() and ms.expires_at < now() + interval '7 days'),
      'monthly_mxn',    coalesce(sum(t.price_mxn * 30.0 / t.period_days)
                          filter (where ms.status = 'active' and ms.expires_at >= now()), 0)::integer
    )
    from public.memberships ms join public.tiers t on t.id = ms.tier_id
    where ms.business_id = p_business
  );
end;
$$;

-- ---------- Functions: customers (not logged in) ----------

create or replace function public.get_public_business(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', b.name, 'brand_color', b.brand_color, 'unit_label', b.unit_label,
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

-- Signs a customer up. The membership starts as "pending" until staff
-- confirm payment at the counter. Returns the private pass token.
create or replace function public.join_business(p_slug text, p_tier_id uuid, p_name text, p_phone text)
returns uuid language plpgsql security definer set search_path = public as $$
declare b public.businesses; t public.tiers; new_member public.members; digits text;
begin
  select * into b from public.businesses where slug = lower(p_slug);
  if not found then raise exception 'negocio_no_existe'; end if;
  select * into t from public.tiers where id = p_tier_id and business_id = b.id and active;
  if not found then raise exception 'nivel_no_existe'; end if;
  digits := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'nombre_invalido'; end if;
  if digits !~ '^[0-9]{8,15}$' then raise exception 'telefono_invalido'; end if;

  insert into public.members (business_id, name, phone) values (b.id, trim(p_name), digits)
    returning * into new_member;
  insert into public.memberships (member_id, business_id, tier_id) values (new_member.id, b.id, t.id);
  return new_member.pass_token;
end;
$$;

-- Everything the customer's pass page needs, looked up by private token.
create or replace function public.get_pass(p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', m.name,
    'business', jsonb_build_object('name', b.name, 'brand_color', b.brand_color, 'unit_label', b.unit_label),
    'membership', (
      select jsonb_build_object(
        'status',            case when ms.status = 'active' and ms.expires_at < now() then 'expired' else ms.status end,
        'tier_name',         t.name,
        'kind',              t.kind,
        'price_mxn',         t.price_mxn,
        'credits_remaining', ms.credits_remaining,
        'credits_total',     t.credits_per_period,
        'expires_at',        ms.expires_at
      )
      from public.memberships ms join public.tiers t on t.id = ms.tier_id
      where ms.member_id = m.id order by ms.created_at desc limit 1
    ),
    'history', coalesce((
      select jsonb_agg(r.created_at order by r.created_at desc)
      from (
        select rd.created_at from public.redemptions rd
        join public.memberships ms2 on ms2.id = rd.membership_id
        where ms2.member_id = m.id order by rd.created_at desc limit 10
      ) r
    ), '[]'::jsonb)
  )
  from public.members m join public.businesses b on b.id = m.business_id
  where m.pass_token = p_token;
$$;

-- ---------- Who may call which function ----------

revoke all on function public.create_business(text, text, text)     from public, anon;
revoke all on function public.lookup_members(uuid, text)            from public, anon;
revoke all on function public.activate_membership(uuid)             from public, anon;
revoke all on function public.redeem_stamp(uuid, uuid)              from public, anon;
revoke all on function public.recent_checkins(uuid)                 from public, anon;
revoke all on function public.get_stats(uuid)                       from public, anon;
revoke all on function public.get_public_business(text)             from public;
revoke all on function public.join_business(text, uuid, text, text) from public;
revoke all on function public.get_pass(uuid)                        from public;

grant execute on function public.create_business(text, text, text)     to authenticated;
grant execute on function public.lookup_members(uuid, text)            to authenticated;
grant execute on function public.activate_membership(uuid)             to authenticated;
grant execute on function public.redeem_stamp(uuid, uuid)              to authenticated;
grant execute on function public.recent_checkins(uuid)                 to authenticated;
grant execute on function public.get_stats(uuid)                       to authenticated;
grant execute on function public.get_public_business(text)             to anon, authenticated;
grant execute on function public.join_business(text, uuid, text, text) to anon, authenticated;
grant execute on function public.get_pass(uuid)                        to anon, authenticated;
