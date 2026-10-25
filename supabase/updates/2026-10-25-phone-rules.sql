-- =====================================================================
-- Update 2026-10-25: stricter, international WhatsApp number rules in join_business.
-- Run this once in Supabase > SQL Editor if you already ran schema.sql before.
-- It only replaces ONE function. It does not touch tables or data, and
-- existing permissions on the function are kept.
-- (A fresh install of schema.sql already includes this.)
-- =====================================================================

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
  -- Numbers are stored in full international form, digits only.
  -- Mexico = 52 + 10 digits (drop the old mobile "1" if someone sends 521 + 10).
  -- USA / Canada = 1 + 10 digits. Anything else: 8 to 15 digits.
  if digits ~ '^521[0-9]{10}$' then digits := '52' || right(digits, 10); end if;
  if digits ~ '^52' and char_length(digits) <> 12 then raise exception 'telefono_invalido'; end if;
  if digits ~ '^1' and char_length(digits) <> 11 then raise exception 'telefono_invalido'; end if;
  if digits !~ '^[0-9]{8,15}$' then raise exception 'telefono_invalido'; end if;

  insert into public.members (business_id, name, phone) values (b.id, trim(p_name), digits)
    returning * into new_member;
  insert into public.memberships (member_id, business_id, tier_id) values (new_member.id, b.id, t.id);
  return new_member.pass_token;
end;
$$;
