-- =====================================================================
-- Update: remove a stamp added by accident. Staff ask; the OWNER approves.
-- (When the owner removes one, it is applied right away.)
-- The stamp is never deleted: it is marked as removed, so there is always a record.
-- Paste into Supabase > SQL Editor > New query > Run. Safe to run twice.
-- =====================================================================

alter table public.redemptions
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users(id) on delete set null;

create table if not exists public.stamp_void_requests (
  id            uuid primary key default gen_random_uuid(),
  redemption_id uuid not null references public.redemptions(id) on delete cascade,
  business_id   uuid not null references public.businesses(id) on delete cascade,
  requested_by  uuid references auth.users(id) on delete set null,
  reason        text check (reason is null or char_length(reason) <= 200),
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by    uuid references auth.users(id) on delete set null,
  decided_at    timestamptz,
  created_at    timestamptz not null default now()
);
create unique index if not exists stamp_void_one_pending on public.stamp_void_requests (redemption_id) where status = 'pending';
alter table public.stamp_void_requests enable row level security;
revoke all on public.stamp_void_requests from anon, authenticated;  -- only the functions below touch it

-- Internal: marks the stamp as removed and gives the stamp back to the customer.
create or replace function public._void_redemption(p_redemption uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.redemptions; t public.tiers; ms public.memberships;
begin
  select * into r from public.redemptions where id = p_redemption for update;
  if not found then raise exception 'no_encontrada'; end if;
  if r.voided_at is not null then raise exception 'sello_anulado'; end if;
  update public.redemptions set voided_at = now(), voided_by = auth.uid() where id = r.id;
  select * into ms from public.memberships where id = r.membership_id;
  select * into t from public.tiers where id = ms.tier_id;
  if t.kind = 'credits' then
    update public.memberships set credits_remaining = least(coalesce(credits_remaining, 0) + 1, t.credits_per_period)
      where id = ms.id;
  end if;
  return ms.member_id;
end;
$$;
revoke all on function public._void_redemption(uuid) from public, anon, authenticated;

-- A customer's latest stamps (not removed), so staff can pick the one made by mistake.
create or replace function public.member_stamps(p_member uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare b uuid;
begin
  select business_id into b from public.members where id = p_member;
  if b is null then raise exception 'no_encontrada'; end if;
  if not public.is_staff_of(b) then raise exception 'sin_permiso'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'at', x.created_at,
             'pending', exists (select 1 from public.stamp_void_requests q where q.redemption_id = x.id and q.status = 'pending'))
           order by x.created_at desc)
    from (
      select r.id, r.created_at from public.redemptions r
      join public.memberships ms on ms.id = r.membership_id
      where ms.member_id = p_member and r.voided_at is null
      order by r.created_at desc limit 5
    ) x
  ), '[]'::jsonb);
end;
$$;

-- Staff ask to remove a stamp. If the owner asks, it happens right away.
create or replace function public.request_stamp_void(p_redemption uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.redemptions; mid uuid; why text := nullif(trim(coalesce(p_reason, '')), '');
begin
  select * into r from public.redemptions where id = p_redemption;
  if not found then raise exception 'no_encontrada'; end if;
  if not public.is_staff_of(r.business_id) then raise exception 'sin_permiso'; end if;
  if r.voided_at is not null then raise exception 'sello_anulado'; end if;
  if exists (select 1 from public.stamp_void_requests where redemption_id = r.id and status = 'pending') then
    raise exception 'solicitud_existente';
  end if;
  if public.is_owner_of(r.business_id) then
    mid := public._void_redemption(r.id);
    insert into public.stamp_void_requests (redemption_id, business_id, requested_by, reason, status, decided_by, decided_at)
      values (r.id, r.business_id, auth.uid(), why, 'approved', auth.uid(), now());
    return jsonb_build_object('applied', true, 'member', public._member_json(mid));
  end if;
  insert into public.stamp_void_requests (redemption_id, business_id, requested_by, reason)
    values (r.id, r.business_id, auth.uid(), why);
  return jsonb_build_object('applied', false);
end;
$$;

-- Owner: the requests waiting for a decision.
create or replace function public.list_void_requests(p_business uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_owner_of(p_business) then raise exception 'sin_permiso'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', q.id, 'member', m.name, 'stamp_at', r.created_at, 'requested_at', q.created_at,
             'by', u.email, 'reason', q.reason) order by q.created_at)
    from public.stamp_void_requests q
    join public.redemptions r on r.id = q.redemption_id
    join public.memberships ms on ms.id = r.membership_id
    join public.members m on m.id = ms.member_id
    left join auth.users u on u.id = q.requested_by
    where q.business_id = p_business and q.status = 'pending'
  ), '[]'::jsonb);
end;
$$;

-- Owner: approve (the stamp is removed and given back) or reject.
create or replace function public.decide_void(p_request uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare q public.stamp_void_requests;
begin
  select * into q from public.stamp_void_requests where id = p_request for update;
  if not found or q.status <> 'pending' then raise exception 'solicitud_no_existe'; end if;
  if not public.is_owner_of(q.business_id) then raise exception 'sin_permiso'; end if;
  if p_approve then perform public._void_redemption(q.redemption_id); end if;
  update public.stamp_void_requests
    set status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now()
    where id = q.id;
end;
$$;

-- Removed stamps no longer show in the customer's history or in recent check-ins.
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
        where ms2.member_id = m.id and rd.voided_at is null order by rd.created_at desc limit 10
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

create or replace function public.recent_checkins(p_business uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff_of(p_business) then raise exception 'sin_permiso'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('name', x.name, 'at', x.created_at, 'credits_remaining', x.credits_remaining,
                                        'member', public._member_json(x.member_id))
                     order by x.created_at desc)
    from (
      select m.id as member_id, m.name, r.created_at, ms.credits_remaining
      from public.redemptions r
      join public.memberships ms on ms.id = r.membership_id
      join public.members m on m.id = ms.member_id
      where r.business_id = p_business and r.voided_at is null
      order by r.created_at desc
      limit 10
    ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.member_stamps(uuid)               from public, anon;
revoke all on function public.request_stamp_void(uuid, text)    from public, anon;
revoke all on function public.list_void_requests(uuid)          from public, anon;
revoke all on function public.decide_void(uuid, boolean)        from public, anon;
grant execute on function public.member_stamps(uuid)            to authenticated;
grant execute on function public.request_stamp_void(uuid, text) to authenticated;
grant execute on function public.list_void_requests(uuid)       to authenticated;
grant execute on function public.decide_void(uuid, boolean)     to authenticated;
grant execute on function public.get_pass(uuid)                 to anon, authenticated;
grant execute on function public.recent_checkins(uuid)          to authenticated;
