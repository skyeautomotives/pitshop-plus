-- Platform admin panel (/admin) for Skye Automotives. Run in Supabase -> SQL Editor after 0013.
--
-- Platform admins see every workshop: their details, logins, bills, complaints
-- and usage. They can suspend or reactivate a workshop; password resets and
-- disabling/removing logins go through the `admin-logins` Edge Function.
--
-- Nothing here changes what workshop logins can see. Admins read through the
-- admin_* functions below, which check is_platform_admin() on every call; the
-- tables' Row Level Security policies are untouched, so the workshop app and
-- its offline sync behave as before.
--
-- After running this file, make yourself an admin (sign up / sign in once first
-- so the login exists, then run with your email):
--
--   insert into public.platform_admins (user_id, email)
--   select id, email from auth.users where email = 'you@example.com';
--
-- An admin login should not also be a workshop login: use a separate email.

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

-- No policies: only the functions below (and the SQL editor) read it.
alter table public.platform_admins enable row level security;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;
revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

-- Raises "not allowed" unless the caller is a platform admin.
create or replace function public.require_platform_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only Pitstop Plus admins can do this.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.require_platform_admin() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Audit log: every admin action

create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  admin_id uuid references auth.users(id) on delete set null,
  admin_email text not null default '',
  -- suspend_shop, reactivate_shop, reset_password, disable_login, enable_login, remove_login
  action text not null,
  shop_id uuid references public.shops(id) on delete set null,
  target_user uuid,
  -- Who or what was acted on, kept as text so it survives the login being removed.
  target_label text not null default '',
  details jsonb not null default '{}'::jsonb
);

create index on public.admin_audit_log (created_at desc);
create index on public.admin_audit_log (shop_id, created_at desc);
alter table public.admin_audit_log enable row level security;

-- ---------------------------------------------------------------------------
-- Suspending a workshop
--
-- A suspended workshop keeps all its data, but its logins can't see or change
-- anything: my_shop_id() returns null for them, and every policy and function
-- of the workshop app is keyed on it. They can still read their own staff row
-- and my_shop_status(), so the app can tell them why.

alter table public.shops
  add column suspended_at timestamptz,
  add column suspended_reason text check (suspended_reason is null or length(suspended_reason) <= 300);

create or replace function public.my_shop_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.shop_id
  from public.staff s
  join public.shops sh on sh.id = s.shop_id
  where s.user_id = auth.uid() and sh.suspended_at is null;
$$;

create or replace function public.my_shop_status()
returns table (suspended_at timestamptz, suspended_reason text)
language sql
stable
security definer
set search_path = ''
as $$
  select sh.suspended_at, sh.suspended_reason
  from public.staff s
  join public.shops sh on sh.id = s.shop_id
  where s.user_id = auth.uid();
$$;
revoke all on function public.my_shop_status() from public, anon;
grant execute on function public.my_shop_status() to authenticated;

create or replace function public.admin_set_shop_suspended(p_shop uuid, p_suspend boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_name text;
begin
  perform public.require_platform_admin();
  if p_suspend and v_reason is null then
    raise exception 'Enter a reason for suspending the workshop.' using errcode = '22023';
  end if;
  if length(coalesce(v_reason, '')) > 300 then
    raise exception 'Keep the reason under 300 characters.' using errcode = '22023';
  end if;

  update public.shops set
    suspended_at = case when p_suspend then coalesce(suspended_at, now()) else null end,
    suspended_reason = case when p_suspend then v_reason else null end
  where id = p_shop;
  if not found then
    raise exception 'Workshop not found.' using errcode = 'P0002';
  end if;

  select shop_name into v_name from public.shop_settings where shop_id = p_shop;
  insert into public.admin_audit_log (admin_id, admin_email, action, shop_id, target_label, details)
  values (
    auth.uid(),
    coalesce((select email from public.platform_admins where user_id = auth.uid()), ''),
    case when p_suspend then 'suspend_shop' else 'reactivate_shop' end,
    p_shop,
    coalesce(v_name, ''),
    case when p_suspend then jsonb_build_object('reason', v_reason) else '{}'::jsonb end
  );
end;
$$;
revoke all on function public.admin_set_shop_suspended(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_shop_suspended(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Reading: platform overview

-- Totals and the last 12 months of signups and bills, as one JSON object.
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
    'complaints', (select count(*) from public.complaints),
    'open_complaints', (select count(*) from public.complaints where status = 'open'),
    'total_billed', (select coalesce(sum(grand_total), 0) from public.bills),
    'billed_30d', (select coalesce(sum(grand_total), 0) from public.bills where date_received >= current_date - 29),
    'by_month', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'month', to_char(m.month, 'YYYY-MM'),
        'signups', (select count(*) from public.shops s where date_trunc('month', s.created_at)::date = m.month),
        'bills', (select count(*) from public.bills b where date_trunc('month', b.date_received)::date = m.month),
        'billed', (select coalesce(sum(b.grand_total), 0) from public.bills b where date_trunc('month', b.date_received)::date = m.month)
      ) order by m.month), '[]'::jsonb)
      from months m
    )
  ) into v_result;

  return v_result;
end;
$$;
revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;

-- ---------------------------------------------------------------------------
-- Reading: workshops

-- All workshops (or one, with p_shop), newest first. p_search matches the
-- workshop name, owner name, owner email or phone.
create or replace function public.admin_shops(p_search text default null, p_shop uuid default null)
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
  total_billed numeric,
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
    (select coalesce(sum(b.grand_total), 0) from public.bills b where b.shop_id = sh.id),
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

-- A workshop's logins with their sign-in details.
create or replace function public.admin_shop_logins(p_shop uuid)
returns table (
  user_id uuid,
  username text,
  email text,
  full_name text,
  role text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  banned_until timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.require_platform_admin();
  return query
  select s.user_id, coalesce(s.username, ''), s.email, s.full_name, s.role, s.created_at,
         u.last_sign_in_at, u.email_confirmed_at, u.banned_until
  from public.staff s
  left join auth.users u on u.id = s.user_id
  where s.shop_id = p_shop
  order by (s.role = 'owner') desc, s.created_at;
end;
$$;
revoke all on function public.admin_shop_logins(uuid) from public, anon;
grant execute on function public.admin_shop_logins(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Reading: bills and complaints (read-only, any workshop)

-- A page of a workshop's bills, newest first. p_search matches customer name,
-- phone digits or vehicle number. total_count is the number of matches.
create or replace function public.admin_bills(
  p_shop uuid,
  p_search text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid,
  bill_number bigint,
  customer_name text,
  phone text,
  vehicle_reg text,
  date_received date,
  delivered_on date,
  grand_total numeric,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_q text := nullif(lower(btrim(coalesce(p_search, ''))), '');
  v_key text := nullif(upper(regexp_replace(coalesce(p_search, ''), '[^A-Za-z0-9]', '', 'g')), '');
  v_digits text := nullif(regexp_replace(coalesce(p_search, ''), '\D', '', 'g'), '');
begin
  perform public.require_platform_admin();
  return query
  select b.id, b.bill_number, b.customer_name, b.phone, b.vehicle_reg, b.date_received, b.delivered_on,
         b.grand_total, b.created_at, count(*) over ()
  from public.bills b
  where b.shop_id = p_shop
    and (
      v_q is null
      or lower(b.customer_name) like '%' || v_q || '%'
      or b.vehicle_reg_key like '%' || v_key || '%'
      or (v_digits is not null and length(v_digits) >= 3 and b.phone_digits like '%' || v_digits || '%')
    )
  order by b.date_received desc, b.bill_number desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
revoke all on function public.admin_bills(uuid, text, int, int) from public, anon;
grant execute on function public.admin_bills(uuid, text, int, int) to authenticated;

-- One bill with its items, linked complaints and workshop, as JSON (null if not found).
create or replace function public.admin_bill(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform public.require_platform_admin();
  select to_jsonb(b) - 'phone_digits'
    || jsonb_build_object(
      'shop_name', coalesce(ss.shop_name, ''),
      'created_by_name', coalesce(nullif(btrim(st.full_name), ''), st.username),
      'bill_items', coalesce((
        select jsonb_agg(to_jsonb(i) order by i.position) from public.bill_items i where i.bill_id = b.id
      ), '[]'::jsonb),
      'complaints', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', c.id, 'complaint_number', c.complaint_number, 'description', c.description,
          'status', c.status, 'attended_by', c.attended_by, 'reported_on', c.reported_on
        ) order by c.complaint_number)
        from public.bill_complaints bc join public.complaints c on c.id = bc.complaint_id
        where bc.bill_id = b.id
      ), '[]'::jsonb)
    )
  into v_result
  from public.bills b
  left join public.shop_settings ss on ss.shop_id = b.shop_id
  left join public.staff st on st.user_id = b.created_by
  where b.id = p_id;
  return v_result;
end;
$$;
revoke all on function public.admin_bill(uuid) from public, anon;
grant execute on function public.admin_bill(uuid) to authenticated;

-- A page of a workshop's complaints, newest first; p_status 'open' / 'resolved' / null.
create or replace function public.admin_complaints(
  p_shop uuid,
  p_search text default null,
  p_status text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid,
  complaint_number bigint,
  customer_name text,
  phone text,
  vehicle_reg text,
  description text,
  reported_on date,
  attended_by text,
  status text,
  bills bigint,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_q text := nullif(lower(btrim(coalesce(p_search, ''))), '');
  v_key text := nullif(upper(regexp_replace(coalesce(p_search, ''), '[^A-Za-z0-9]', '', 'g')), '');
  v_digits text := nullif(regexp_replace(coalesce(p_search, ''), '\D', '', 'g'), '');
begin
  perform public.require_platform_admin();
  return query
  select c.id, c.complaint_number, c.customer_name, c.phone, c.vehicle_reg, c.description, c.reported_on,
         c.attended_by, c.status,
         (select count(*) from public.bill_complaints bc where bc.complaint_id = c.id),
         count(*) over ()
  from public.complaints c
  where c.shop_id = p_shop
    and (p_status is null or c.status = p_status)
    and (
      v_q is null
      or lower(c.customer_name) like '%' || v_q || '%'
      or c.vehicle_reg_key like '%' || v_key || '%'
      or (v_digits is not null and length(v_digits) >= 3 and c.phone_digits like '%' || v_digits || '%')
    )
  order by c.reported_on desc, c.complaint_number desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
revoke all on function public.admin_complaints(uuid, text, text, int, int) from public, anon;
grant execute on function public.admin_complaints(uuid, text, text, int, int) to authenticated;

-- One complaint with the bills that address it and its workshop, as JSON (null if not found).
create or replace function public.admin_complaint(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform public.require_platform_admin();
  select to_jsonb(c) - 'phone_digits'
    || jsonb_build_object(
      'shop_name', coalesce(ss.shop_name, ''),
      'bills', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', b.id, 'bill_number', b.bill_number, 'date_received', b.date_received, 'grand_total', b.grand_total
        ) order by b.bill_number)
        from public.bill_complaints bc join public.bills b on b.id = bc.bill_id
        where bc.complaint_id = c.id
      ), '[]'::jsonb)
    )
  into v_result
  from public.complaints c
  left join public.shop_settings ss on ss.shop_id = c.shop_id
  where c.id = p_id;
  return v_result;
end;
$$;
revoke all on function public.admin_complaint(uuid) from public, anon;
grant execute on function public.admin_complaint(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Reading: audit log

create or replace function public.admin_audit(p_shop uuid default null, p_limit int default 100, p_offset int default 0)
returns table (
  id bigint,
  created_at timestamptz,
  admin_email text,
  action text,
  shop_id uuid,
  shop_name text,
  target_label text,
  details jsonb,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.require_platform_admin();
  return query
  select l.id, l.created_at, l.admin_email, l.action, l.shop_id, coalesce(ss.shop_name, ''), l.target_label, l.details,
         count(*) over ()
  from public.admin_audit_log l
  left join public.shop_settings ss on ss.shop_id = l.shop_id
  where p_shop is null or l.shop_id = p_shop
  order by l.created_at desc, l.id desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
revoke all on function public.admin_audit(uuid, int, int) from public, anon;
grant execute on function public.admin_audit(uuid, int, int) to authenticated;
