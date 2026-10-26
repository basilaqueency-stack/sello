-- =====================================================================
-- Update: points are only for customers WITHOUT an active membership.
--  * A stamp (which needs an active membership) no longer gives points.
--  * award_points refuses members who have an active membership.
--  * The offline member list now includes everyone, so points can also be
--    given with no signal to customers who don't have a membership.
-- Paste into Supabase > SQL Editor > New query > Run. Safe to run twice.
-- =====================================================================

create or replace function public.redeem_stamp(p_membership uuid, p_client_id uuid default null, p_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ms public.memberships; t public.tiers; at_time timestamptz;
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
  return public._member_json(ms.member_id);
end;
$$;

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

  -- Members already benefit from their membership, so points are for everyone else.
  if exists (select 1 from public.memberships ms
             where ms.member_id = m.id and ms.status = 'active' and ms.expires_at > now()) then
    raise exception 'tiene_membresia';
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

-- Everyone who has joined (most recent first), saved on the phone for use with no signal.
create or replace function public.staff_roster(p_business uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff_of(p_business) then raise exception 'sin_permiso'; end if;
  return coalesce((
    select jsonb_agg(public._member_json(x.id))
    from (select id from public.members where business_id = p_business order by created_at desc limit 3000) x
  ), '[]'::jsonb);
end;
$$;
