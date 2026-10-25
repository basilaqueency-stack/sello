-- =====================================================================
-- Update: loyalty points, rewards, and the public directory.
-- Paste into Supabase > SQL Editor > New query > Run. Safe to run twice.
-- Nothing is deleted. Existing businesses start LISTED in the directory
-- (owners can switch that off) and start with points turned OFF.
-- =====================================================================

-- ---------- Businesses: directory info + points settings ----------
do $$ begin
  -- one time only: businesses that existed before this update become listed
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'businesses' and column_name = 'category') then
    update public.businesses set listed = true;
  end if;
end $$;

alter table public.businesses alter column listed set default true;
alter table public.businesses
  add column if not exists category text not null default 'other' check (category in ('cafe', 'beauty', 'restaurant', 'other')),
  add column if not exists neighborhood text check (neighborhood is null or char_length(neighborhood) <= 60),
  add column if not exists description text check (description is null or char_length(description) <= 240),
  add column if not exists points_enabled boolean not null default false,
  add column if not exists points_mode text not null default 'visit' check (points_mode in ('visit', 'spend')),
  add column if not exists points_per_visit integer not null default 10 check (points_per_visit between 1 and 10000),
  add column if not exists points_per_100 integer not null default 10 check (points_per_100 between 1 and 10000);

-- ---------- Rewards + points ledger ----------
create table if not exists public.rewards (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null check (char_length(name) between 2 and 60),
  cost_points integer not null check (cost_points between 1 and 1000000),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Every change to a customer's points is a row here; the balance is the sum.
create table if not exists public.points_ledger (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references public.members(id) on delete cascade,
  business_id   uuid not null references public.businesses(id) on delete cascade,
  delta         integer not null check (delta <> 0),
  reason        text not null check (reason in ('visit', 'spend', 'redeem', 'adjust')),
  amount_mxn    numeric,
  reward_id     uuid references public.rewards(id) on delete set null,
  reward_name   text,
  staff_user_id uuid references auth.users(id) on delete set null,
  client_id     uuid unique,
  created_at    timestamptz not null default now()
);
create index if not exists points_ledger_member_idx on public.points_ledger (member_id, created_at desc);

alter table public.rewards       enable row level security;
alter table public.points_ledger enable row level security;
revoke all on public.rewards, public.points_ledger from anon;
revoke all on public.points_ledger from authenticated;  -- only the functions below touch it

drop policy if exists rewards_staff_read on public.rewards;
create policy rewards_staff_read on public.rewards for select to authenticated using (public.is_staff_of(business_id));
drop policy if exists rewards_owner_insert on public.rewards;
create policy rewards_owner_insert on public.rewards for insert to authenticated with check (public.is_owner_of(business_id));
drop policy if exists rewards_owner_update on public.rewards;
create policy rewards_owner_update on public.rewards for update to authenticated
  using (public.is_owner_of(business_id)) with check (public.is_owner_of(business_id));
drop policy if exists rewards_owner_delete on public.rewards;
create policy rewards_owner_delete on public.rewards for delete to authenticated using (public.is_owner_of(business_id));

create or replace function public._points(p_member uuid)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(sum(delta), 0)::integer from public.points_ledger where member_id = p_member;
$$;
revoke all on function public._points(uuid) from public, anon, authenticated;

-- ---------- Member JSON now carries the points balance ----------
create or replace function public._member_json(p_member uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'member_id',  m.id,
    'name',       m.name,
    'phone',      m.phone,
    'pass_token', m.pass_token,
    'points',     public._points(m.id),
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

-- ---------- Staff actions ----------
-- Stamping a visit also gives the visit points, when the business gives points per visit.
create or replace function public.redeem_stamp(p_membership uuid, p_client_id uuid default null, p_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ms public.memberships; t public.tiers; b public.businesses; at_time timestamptz;
begin
  select * into ms from public.memberships where id = p_membership for update;
  if not found then raise exception 'no_encontrada'; end if;
  if not public.is_staff_of(ms.business_id) then raise exception 'sin_permiso'; end if;

  if p_client_id is not null and exists (select 1 from public.redemptions where client_id = p_client_id) then
    return public._member_json(ms.member_id);  -- already recorded (a safe retry)
  end if;

  at_time := case when p_at is not null and p_at <= now() and p_at > now() - interval '7 days' then p_at else now() end;

  if ms.status = 'pending' then raise exception 'pendiente'; end if;
  if ms.status = 'cancelled' then raise exception 'cancelada'; end if;
  if ms.expires_at is null or ms.expires_at < at_time then raise exception 'vencida'; end if;
  select * into t from public.tiers where id = ms.tier_id;
  if t.kind = 'credits' then
    if coalesce(ms.credits_remaining, 0) <= 0 then raise exception 'sin_sellos'; end if;
    update public.memberships set credits_remaining = credits_remaining - 1 where id = ms.id;
  end if;
  insert into public.redemptions (membership_id, business_id, staff_user_id, client_id, created_at)
    values (ms.id, ms.business_id, auth.uid(), p_client_id, at_time);

  select * into b from public.businesses where id = ms.business_id;
  if b.points_enabled and b.points_mode = 'visit' then
    insert into public.points_ledger (member_id, business_id, delta, reason, staff_user_id, client_id, created_at)
      values (ms.member_id, ms.business_id, b.points_per_visit, 'visit', auth.uid(), p_client_id, at_time)
      on conflict (client_id) do nothing;
  end if;
  return public._member_json(ms.member_id);
end;
$$;

-- Adds points for a visit (fixed amount) or for a bill (p_amount in pesos), depending on the business setting.
create or replace function public.award_points(p_member uuid, p_amount numeric default null, p_client_id uuid default null, p_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.members; b public.businesses; pts integer; why text; at_time timestamptz;
begin
  select * into m from public.members where id = p_member;
  if not found then raise exception 'no_encontrada'; end if;
  if not public.is_staff_of(m.business_id) then raise exception 'sin_permiso'; end if;
  select * into b from public.businesses where id = m.business_id;
  if not b.points_enabled then raise exception 'puntos_desactivados'; end if;

  if p_client_id is not null and exists (select 1 from public.points_ledger where client_id = p_client_id) then
    return public._member_json(m.id);  -- already recorded (a safe retry)
  end if;

  at_time := case when p_at is not null and p_at <= now() and p_at > now() - interval '7 days' then p_at else now() end;
  if b.points_mode = 'visit' then
    pts := b.points_per_visit; why := 'visit';
  else
    if p_amount is null or p_amount <= 0 or p_amount > 1000000 then raise exception 'monto_invalido'; end if;
    pts := floor(p_amount * b.points_per_100 / 100.0)::integer; why := 'spend';
    if pts < 1 then raise exception 'monto_invalido'; end if;
  end if;
  insert into public.points_ledger (member_id, business_id, delta, reason, amount_mxn, staff_user_id, client_id, created_at)
    values (m.id, m.business_id, pts, why, case when why = 'spend' then p_amount end, auth.uid(), p_client_id, at_time);
  return public._member_json(m.id);
end;
$$;

-- Spends points on a reward from the business's menu.
create or replace function public.redeem_reward(p_member uuid, p_reward uuid, p_client_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.members; r public.rewards;
begin
  select * into m from public.members where id = p_member for update;  -- one at a time per customer
  if not found then raise exception 'no_encontrada'; end if;
  if not public.is_staff_of(m.business_id) then raise exception 'sin_permiso'; end if;
  select * into r from public.rewards where id = p_reward and business_id = m.business_id and active;
  if not found then raise exception 'premio_no_existe'; end if;

  if p_client_id is not null and exists (select 1 from public.points_ledger where client_id = p_client_id) then
    return public._member_json(m.id);
  end if;
  if public._points(m.id) < r.cost_points then raise exception 'puntos_insuficientes'; end if;
  insert into public.points_ledger (member_id, business_id, delta, reason, reward_id, reward_name, staff_user_id, client_id)
    values (m.id, m.business_id, -r.cost_points, 'redeem', r.id, r.name, auth.uid(), p_client_id);
  return public._member_json(m.id);
end;
$$;

-- ---------- What customers see ----------
create or replace function public.get_public_business(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', b.name, 'brand_color', b.brand_color, 'unit_label', b.unit_label,
    'category', b.category, 'neighborhood', b.neighborhood, 'description', b.description,
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

create or replace function public.get_pass(p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', m.name,
    'business', jsonb_build_object('name', b.name, 'brand_color', b.brand_color, 'unit_label', b.unit_label,
                                   'points_enabled', b.points_enabled, 'points_mode', b.points_mode),
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
    ), '[]'::jsonb),
    'points', public._points(m.id),
    'rewards', case when b.points_enabled then coalesce((
      select jsonb_agg(jsonb_build_object('id', rw.id, 'name', rw.name, 'cost_points', rw.cost_points)
                       order by rw.cost_points)
      from public.rewards rw where rw.business_id = b.id and rw.active
    ), '[]'::jsonb) else '[]'::jsonb end,
    'points_history', coalesce((
      select jsonb_agg(jsonb_build_object('delta', l.delta, 'reason', l.reason, 'reward_name', l.reward_name, 'at', l.created_at)
                       order by l.created_at desc)
      from (select * from public.points_ledger where member_id = m.id order by created_at desc limit 10) l
    ), '[]'::jsonb)
  )
  from public.members m join public.businesses b on b.id = m.business_id
  where m.pass_token = p_token;
$$;

-- ---------- Directory ----------
-- Public list of businesses that are switched on and have at least one membership to join.
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
      and exists (select 1 from public.tiers t where t.business_id = b.id and t.active)
      and (nullif(trim(p_category), '') is null or b.category = trim(p_category))
      and (nullif(trim(p_query), '') is null
           or b.name ilike '%' || trim(p_query) || '%'
           or coalesce(b.neighborhood, '') ilike '%' || trim(p_query) || '%'
           or coalesce(b.description, '') ilike '%' || trim(p_query) || '%')
    order by b.name
    limit 100
  ) x;
$$;

revoke all on function public.award_points(uuid, numeric, uuid, timestamptz) from public, anon;
revoke all on function public.redeem_reward(uuid, uuid, uuid)               from public, anon;
revoke all on function public.directory_list(text, text)                    from public;
revoke all on function public.redeem_stamp(uuid, uuid, timestamptz)         from public, anon;
grant execute on function public.award_points(uuid, numeric, uuid, timestamptz) to authenticated;
grant execute on function public.redeem_reward(uuid, uuid, uuid)               to authenticated;
grant execute on function public.directory_list(text, text)                    to anon, authenticated;
grant execute on function public.redeem_stamp(uuid, uuid, timestamptz)         to authenticated;
grant execute on function public.get_public_business(text) to anon, authenticated;
grant execute on function public.get_pass(uuid)             to anon, authenticated;
