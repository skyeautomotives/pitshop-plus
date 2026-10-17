-- Bike or car workshop. Run in Supabase -> SQL Editor after 0021.
-- Chosen when registering (null for workshops that registered before this) and
-- changeable in Settings. The admin workshop list shows it.

alter table public.shop_settings
  add column if not exists vehicle_type text check (vehicle_type is null or vehicle_type in ('bike', 'car'));

-- Same as 0012, plus the workshop type from the registration form.
create or replace function public.handle_new_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if coalesce(btrim(meta ->> 'shop_name'), '') = '' then
    return new; -- not a workshop signup (e.g. staff added by an owner)
  end if;
  if exists (select 1 from public.staff where user_id = new.id) then
    return new;
  end if;
  perform public.create_shop_for(
    new.id,
    new.email,
    public.unique_username(split_part(new.email, '@', 1)),
    meta ->> 'full_name',
    meta ->> 'shop_name',
    meta ->> 'phone',
    meta ->> 'address'
  );
  if meta ->> 'vehicle_type' in ('bike', 'car') then
    update public.shop_settings set vehicle_type = meta ->> 'vehicle_type'
    where shop_id = (select shop_id from public.staff where user_id = new.id);
  end if;
  return new;
end;
$$;

-- Same as 0016, plus the workshop type.
drop function if exists public.admin_shops(text, uuid);
create function public.admin_shops(p_search text default null, p_shop uuid default null)
returns table (
  id uuid,
  shop_name text,
  phone text,
  address text,
  owner_user_id uuid,
  owner_name text,
  owner_email text,
  owner_confirmed boolean,
  created_at timestamptz,
  suspended_at timestamptz,
  suspended_reason text,
  logins bigint,
  bills bigint,
  complaints bigint,
  last_activity timestamptz,
  vehicle_type text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_q text := nullif(lower(btrim(coalesce(p_search, ''))), '');
  v_digits text := nullif(regexp_replace(coalesce(p_search, ''), '\D', '', 'g'), '');
begin
  perform public.require_platform_admin();

  return query
  with owners as (
    select distinct on (s.shop_id) s.shop_id, s.user_id, s.full_name, s.email, u.email_confirmed_at
    from public.staff s
    left join auth.users u on u.id = s.user_id
    where s.role = 'owner'
    order by s.shop_id, s.created_at
  )
  select
    sh.id,
    coalesce(ss.shop_name, ''),
    ss.phone,
    ss.address,
    o.user_id,
    coalesce(o.full_name, ''),
    coalesce(o.email, ''),
    o.email_confirmed_at is not null,
    sh.created_at,
    sh.suspended_at,
    sh.suspended_reason,
    (select count(*) from public.staff st where st.shop_id = sh.id),
    (select count(*) from public.bills b where b.shop_id = sh.id),
    (select count(*) from public.complaints c where c.shop_id = sh.id),
    greatest(
      (select max(b.updated_at) from public.bills b where b.shop_id = sh.id),
      (select max(c.updated_at) from public.complaints c where c.shop_id = sh.id),
      (select max(u.last_sign_in_at) from public.staff st join auth.users u on u.id = st.user_id where st.shop_id = sh.id)
    ),
    ss.vehicle_type
  from public.shops sh
  left join public.shop_settings ss on ss.shop_id = sh.id
  left join owners o on o.shop_id = sh.id
  where (p_shop is null or sh.id = p_shop)
    and (
      v_q is null
      or lower(coalesce(ss.shop_name, '')) like '%' || v_q || '%'
      or lower(coalesce(o.full_name, '')) like '%' || v_q || '%'
      or lower(coalesce(o.email, '')) like '%' || v_q || '%'
      or (v_digits is not null and length(v_digits) >= 3
          and regexp_replace(coalesce(ss.phone, ''), '\D', '', 'g') like '%' || v_digits || '%')
    )
  order by sh.created_at desc;
end;
$$;
revoke all on function public.admin_shops(text, uuid) from public, anon;
grant execute on function public.admin_shops(text, uuid) to authenticated;
