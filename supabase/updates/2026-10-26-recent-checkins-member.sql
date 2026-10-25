-- Update: each recent check-in now carries the customer's full profile, so staff can tap it to open them.
-- Paste into Supabase > SQL Editor > New query > Run. Safe to run twice.
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
      where r.business_id = p_business
      order by r.created_at desc
      limit 10
    ) x
  ), '[]'::jsonb);
end;
$$;
