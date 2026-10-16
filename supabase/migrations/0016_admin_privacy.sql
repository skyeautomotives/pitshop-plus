-- Admin privacy. Run after 0015.
--
-- A workshop's customers, bills and takings belong to the workshop, not to Skye
-- Automotives. Platform admins keep what is theirs to manage: the workshop, its
-- owner and logins, its subscription and payments, and how much it uses the app
-- (counts only). They can no longer read customer names, phone numbers,
-- vehicles, bill contents or amounts.
--
--   * admin_bills / admin_bill / admin_complaints / admin_complaint are removed.
--   * admin_shops no longer returns total_billed.
--   * admin_overview no longer returns amounts billed (counts only).

drop function if exists public.admin_bills(uuid, text, int, int);
drop function if exists public.admin_bill(uuid);
drop function if exists public.admin_complaints(uuid, text, text, int, int);
drop function if exists public.admin_complaint(uuid);

-- Same as 0014 without total_billed.
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
  last_activity timestamptz
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
    )
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

-- Same as 0014 with counts only (no amounts billed).
create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_first date := (date_trunc('month', current_date) - interval '11 months')::date;
  v_result jsonb;
begin
  perform public.require_platform_admin();

  with months as (
    select generate_series(v_first, date_trunc('month', current_date)::date, interval '1 month')::date as month
  ),
  active as (
    select shop_id from public.bills where updated_at >= now() - interval '30 days'
    union
    select shop_id from public.complaints where updated_at >= now() - interval '30 days'
  )
  select jsonb_build_object(
    'workshops', (select count(*) from public.shops),
    'suspended', (select count(*) from public.shops where suspended_at is not null),
    'active_30d', (select count(*) from active),
    'new_30d', (select count(*) from public.shops where created_at >= now() - interval '30 days'),
    'logins', (select count(*) from public.staff),
    'bills', (select count(*) from public.bills),
    'bills_30d', (select count(*) from public.bills where date_received >= current_date - 29),
    'complaints', (select count(*) from public.complaints),
    'by_month', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'month', to_char(m.month, 'YYYY-MM'),
        'signups', (select count(*) from public.shops s where date_trunc('month', s.created_at)::date = m.month),
        'bills', (select count(*) from public.bills b where date_trunc('month', b.date_received)::date = m.month)
      ) order by m.month), '[]'::jsonb)
      from months m
    )
  ) into v_result;

  return v_result;
end;
$$;
