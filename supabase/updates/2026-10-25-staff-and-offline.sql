-- =====================================================================
-- Update: employee logins (invites) + support for stamping with no signal.
-- Paste into Supabase > SQL Editor > New query > Run. Safe to run twice.
-- (It replaces the old redeem_stamp with one that accepts the time the
--  stamp was really made, so stamps taken offline keep their true time.)
-- =====================================================================

-- ---------- Invitations ----------
create table if not exists public.staff_invites (
  business_id uuid not null references public.businesses(id) on delete cascade,
  email       text not null,
  created_at  timestamptz not null default now(),
  primary key (business_id, email)
);
alter table public.staff_invites enable row level security;
revoke all on public.staff_invites from anon, authenticated;  -- only the functions below touch it

-- Owner invites an employee by email. If that person already has an account
-- they are added right away; otherwise the invite waits until they sign up.
create or replace function public.invite_staff(p_business uuid, p_email text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare e text := lower(trim(coalesce(p_email, ''))); uid uuid;
begin
  if not public.is_owner_of(p_business) then raise exception 'sin_permiso'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'correo_invalido'; end if;
  select id into uid from auth.users where lower(email) = e and email_confirmed_at is not null limit 1;
  if uid is not null then
    insert into public.business_staff (business_id, user_id, role) values (p_business, uid, 'staff')
      on conflict do nothing;
    return jsonb_build_object('added', true);
  end if;
  insert into public.staff_invites (business_id, email) values (p_business, e) on conflict do nothing;
  return jsonb_build_object('added', false);
end;
$$;

-- Called every time someone signs in: turns waiting invites into access.
-- Only works for a CONFIRMED email, so nobody can claim an invite for an address they don't own.
create or replace function public.claim_invites()
returns integer language plpgsql security definer set search_path = public, auth as $$
declare e text; n integer := 0;
begin
  if auth.uid() is null then return 0; end if;
  select lower(email) into e from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if e is null then return 0; end if;
  insert into public.business_staff (business_id, user_id, role)
    select business_id, auth.uid(), 'staff' from public.staff_invites where email = e
    on conflict do nothing;
  get diagnostics n = row_count;
  delete from public.staff_invites where email = e;
  return n;
end;
$$;

create or replace function public.list_staff(p_business uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_owner_of(p_business) then raise exception 'sin_permiso'; end if;
  return jsonb_build_object(
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', s.user_id, 'email', u.email, 'role', s.role)
                       order by (s.role = 'owner') desc, u.email)
      from public.business_staff s join auth.users u on u.id = s.user_id
      where s.business_id = p_business), '[]'::jsonb),
    'invites', coalesce((
      select jsonb_agg(i.email order by i.email) from public.staff_invites i where i.business_id = p_business), '[]'::jsonb)
  );
end;
$$;

create or replace function public.remove_staff(p_business uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner_of(p_business) then raise exception 'sin_permiso'; end if;
  delete from public.business_staff where business_id = p_business and user_id = p_user and role = 'staff';
end;
$$;

create or replace function public.cancel_invite(p_business uuid, p_email text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner_of(p_business) then raise exception 'sin_permiso'; end if;
  delete from public.staff_invites where business_id = p_business and email = lower(trim(p_email));
end;
$$;

-- ---------- Stamping with no signal ----------
-- The list of members with a live membership, downloaded to the phone while it
-- has signal, so the counter can keep working when it doesn't.
create or replace function public.staff_roster(p_business uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff_of(p_business) then raise exception 'sin_permiso'; end if;
  return coalesce((
    select jsonb_agg(public._member_json(m.id))
    from public.members m
    where m.business_id = p_business
      and exists (select 1 from public.memberships ms
                  where ms.member_id = m.id and ms.status = 'active' and ms.expires_at > now())
  ), '[]'::jsonb);
end;
$$;

-- Same as before, plus p_at: when the stamp was really made (for stamps queued offline).
-- A claimed time is only accepted if it is in the past and no older than 7 days.
drop function if exists public.redeem_stamp(uuid, uuid);
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

revoke all on function public.invite_staff(uuid, text)               from public, anon;
revoke all on function public.claim_invites()                        from public, anon;
revoke all on function public.list_staff(uuid)                       from public, anon;
revoke all on function public.remove_staff(uuid, uuid)               from public, anon;
revoke all on function public.cancel_invite(uuid, text)              from public, anon;
revoke all on function public.staff_roster(uuid)                     from public, anon;
revoke all on function public.redeem_stamp(uuid, uuid, timestamptz)  from public, anon;
grant execute on function public.invite_staff(uuid, text)               to authenticated;
grant execute on function public.claim_invites()                        to authenticated;
grant execute on function public.list_staff(uuid)                       to authenticated;
grant execute on function public.remove_staff(uuid, uuid)               to authenticated;
grant execute on function public.cancel_invite(uuid, text)              to authenticated;
grant execute on function public.staff_roster(uuid)                     to authenticated;
grant execute on function public.redeem_stamp(uuid, uuid, timestamptz)  to authenticated;
