-- Subscriptions and payments for Skye Automotives (platform billing). Run after 0014.
--
--   plans          what Skye Automotives sells (name, price, per month or per year)
--   subscriptions  one per workshop: plan, trial end, paid-until date, agreed price
--   payments       a ledger of payments received from each workshop
--
-- Every new workshop starts a free trial (30 days). Recording a payment extends
-- "paid until". Nothing here blocks a workshop automatically: admins see who is
-- overdue and can suspend a workshop by hand (0014). Workshop owners see a
-- reminder in their app when the trial is ending or a payment is overdue.
--
-- Only platform admins read or change these tables, through the admin_* functions
-- below (each checks is_platform_admin() and writes to admin_audit_log). A
-- workshop can read its own subscription through my_subscription().

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 60),
  price numeric(12,2) not null check (price >= 0),
  period text not null default 'month' check (period in ('month', 'year')),
  description text check (description is null or length(description) <= 300),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete set null,
  status text not null default 'trial' check (status in ('trial', 'active', 'cancelled')),
  trial_ends_at date,
  paid_until date,
  -- Agreed price for this workshop; null means the plan's price.
  price numeric(12,2) check (price is null or price >= 0),
  notes text check (notes is null or length(notes) <= 500),
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  paid_on date not null default current_date,
  method text not null default 'upi' check (method in ('upi', 'cash', 'bank', 'card', 'other')),
  reference text check (reference is null or length(reference) <= 100),
  -- The date this payment pays the workshop up to (extends subscriptions.paid_until).
  covers_until date,
  notes text check (notes is null or length(notes) <= 300),
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_by_email text not null default '',
  created_at timestamptz not null default now()
);

create index on public.payments (shop_id, paid_on desc);
create index on public.payments (paid_on desc);

-- No policies: only the functions below read or write these tables.
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;

-- Every workshop gets a subscription row, starting with a 30-day free trial.
create or replace function public.start_trial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.subscriptions (shop_id, status, trial_ends_at)
  values (new.id, 'trial', (new.created_at at time zone 'Asia/Kolkata')::date + 30)
  on conflict (shop_id) do nothing;
  return new;
end;
$$;

create trigger shops_start_trial
  after insert on public.shops
  for each row execute function public.start_trial();

-- Workshops that already exist start their trial now.
insert into public.subscriptions (shop_id, status, trial_ends_at)
select id, 'trial', greatest((created_at at time zone 'Asia/Kolkata')::date + 30, current_date + 14)
from public.shops
on conflict (shop_id) do nothing;

-- Where a subscription stands today:
--   trial, trial_ended, active, overdue, cancelled
create or replace function public.subscription_state(p_status text, p_trial_ends date, p_paid_until date)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_status = 'cancelled' then 'cancelled'
    when p_status = 'trial' then case when p_trial_ends is null or p_trial_ends >= current_date then 'trial' else 'trial_ended' end
    when p_paid_until is null or p_paid_until < current_date then 'overdue'
    else 'active'
  end;
$$;

-- Admin actions on billing are logged with the rest (admin_audit_log from 0014).
create or replace function public.log_admin_action(p_action text, p_shop uuid, p_label text, p_details jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.admin_audit_log (admin_id, admin_email, action, shop_id, target_label, details)
  values (
    auth.uid(),
    coalesce((select email from public.platform_admins where user_id = auth.uid()), ''),
    p_action, p_shop, coalesce(p_label, ''), coalesce(p_details, '{}'::jsonb)
  );
$$;
revoke all on function public.log_admin_action(text, uuid, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Plans

create or replace function public.admin_plans()
returns table (
  id uuid,
  name text,
  price numeric,
  period text,
  description text,
  active boolean,
  created_at timestamptz,
  workshops bigint
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
  select p.id, p.name, p.price, p.period, p.description, p.active, p.created_at,
         (select count(*) from public.subscriptions s where s.plan_id = p.id and s.status <> 'cancelled')
  from public.plans p
  order by p.active desc, p.price, p.name;
end;
$$;
revoke all on function public.admin_plans() from public, anon;
grant execute on function public.admin_plans() to authenticated;

-- Creates (p_id null) or updates a plan.
create or replace function public.admin_save_plan(
  p_id uuid,
  p_name text,
  p_price numeric,
  p_period text,
  p_description text default null,
  p_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.require_platform_admin();
  if length(btrim(coalesce(p_name, ''))) not between 1 and 60 then
    raise exception 'Enter a plan name (up to 60 characters).' using errcode = '22023';
  end if;
  if p_price is null or p_price < 0 then
    raise exception 'Enter a price of 0 or more.' using errcode = '22023';
  end if;
  if p_period not in ('month', 'year') then
    raise exception 'Choose per month or per year.' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.plans (name, price, period, description, active)
    values (btrim(p_name), p_price, p_period, nullif(btrim(coalesce(p_description, '')), ''), coalesce(p_active, true))
    returning id into v_id;
  else
    update public.plans set
      name = btrim(p_name), price = p_price, period = p_period,
      description = nullif(btrim(coalesce(p_description, '')), ''), active = coalesce(p_active, true)
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Plan not found.' using errcode = 'P0002';
    end if;
  end if;
  perform public.log_admin_action('save_plan', null, btrim(p_name),
    jsonb_build_object('price', p_price, 'period', p_period, 'active', coalesce(p_active, true)));
  return v_id;
end;
$$;
revoke all on function public.admin_save_plan(uuid, text, numeric, text, text, boolean) from public, anon;
grant execute on function public.admin_save_plan(uuid, text, numeric, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Subscriptions

-- Every workshop's subscription (or one, with p_shop), with plan, state and payments.
create or replace function public.admin_subscriptions(p_shop uuid default null)
returns table (
  shop_id uuid,
  shop_name text,
  owner_email text,
  shop_created_at timestamptz,
  suspended boolean,
  plan_id uuid,
  plan_name text,
  plan_period text,
  plan_price numeric,
  price numeric,
  status text,
  state text,
  trial_ends_at date,
  paid_until date,
  notes text,
  last_payment_on date,
  total_paid numeric
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
  select
    sh.id,
    coalesce(ss.shop_name, ''),
    coalesce((select st.email from public.staff st where st.shop_id = sh.id and st.role = 'owner' order by st.created_at limit 1), ''),
    sh.created_at,
    sh.suspended_at is not null,
    p.id,
    p.name,
    p.period,
    p.price,
    coalesce(su.price, p.price),
    coalesce(su.status, 'trial'),
    public.subscription_state(coalesce(su.status, 'trial'), su.trial_ends_at, su.paid_until),
    su.trial_ends_at,
    su.paid_until,
    su.notes,
    (select max(pa.paid_on) from public.payments pa where pa.shop_id = sh.id),
    (select coalesce(sum(pa.amount), 0) from public.payments pa where pa.shop_id = sh.id)
  from public.shops sh
  left join public.shop_settings ss on ss.shop_id = sh.id
  left join public.subscriptions su on su.shop_id = sh.id
  left join public.plans p on p.id = su.plan_id
  where p_shop is null or sh.id = p_shop
  order by sh.created_at desc;
end;
$$;
revoke all on function public.admin_subscriptions(uuid) from public, anon;
grant execute on function public.admin_subscriptions(uuid) to authenticated;

create or replace function public.admin_update_subscription(
  p_shop uuid,
  p_plan uuid,
  p_status text,
  p_trial_ends_at date,
  p_paid_until date,
  p_price numeric default null,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_platform_admin();
  if p_status not in ('trial', 'active', 'cancelled') then
    raise exception 'Choose trial, active or cancelled.' using errcode = '22023';
  end if;
  if p_price is not null and p_price < 0 then
    raise exception 'The price can''t be below 0.' using errcode = '22023';
  end if;
  if p_plan is not null and not exists (select 1 from public.plans where id = p_plan) then
    raise exception 'Plan not found.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.shops where id = p_shop) then
    raise exception 'Workshop not found.' using errcode = 'P0002';
  end if;
  insert into public.subscriptions (shop_id, plan_id, status, trial_ends_at, paid_until, price, notes, updated_at)
  values (p_shop, p_plan, p_status, p_trial_ends_at, p_paid_until, p_price, nullif(btrim(coalesce(p_notes, '')), ''), now())
  on conflict (shop_id) do update set
    plan_id = excluded.plan_id, status = excluded.status, trial_ends_at = excluded.trial_ends_at,
    paid_until = excluded.paid_until, price = excluded.price, notes = excluded.notes, updated_at = now();
  perform public.log_admin_action('update_subscription', p_shop,
    (select shop_name from public.shop_settings where shop_id = p_shop),
    jsonb_build_object('plan', (select name from public.plans where id = p_plan), 'status', p_status,
                       'trial_ends_at', p_trial_ends_at, 'paid_until', p_paid_until, 'price', p_price));
end;
$$;
revoke all on function public.admin_update_subscription(uuid, uuid, text, date, date, numeric, text) from public, anon;
grant execute on function public.admin_update_subscription(uuid, uuid, text, date, date, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Payments

-- Records a payment. If it covers a period, "paid until" moves forward and the
-- subscription becomes active.
create or replace function public.admin_record_payment(
  p_shop uuid,
  p_amount numeric,
  p_paid_on date,
  p_method text,
  p_reference text default null,
  p_covers_until date default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.require_platform_admin();
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter the amount received.' using errcode = '22023';
  end if;
  if p_method not in ('upi', 'cash', 'bank', 'card', 'other') then
    raise exception 'Choose how it was paid.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.shops where id = p_shop) then
    raise exception 'Workshop not found.' using errcode = 'P0002';
  end if;
  insert into public.payments (shop_id, amount, paid_on, method, reference, covers_until, notes, recorded_by, recorded_by_email)
  values (p_shop, p_amount, coalesce(p_paid_on, current_date), p_method, nullif(btrim(coalesce(p_reference, '')), ''),
          p_covers_until, nullif(btrim(coalesce(p_notes, '')), ''), auth.uid(),
          coalesce((select email from public.platform_admins where user_id = auth.uid()), ''))
  returning id into v_id;
  if p_covers_until is not null then
    insert into public.subscriptions (shop_id, status, paid_until)
    values (p_shop, 'active', p_covers_until)
    on conflict (shop_id) do update set
      status = 'active',
      paid_until = greatest(coalesce(public.subscriptions.paid_until, p_covers_until), p_covers_until),
      updated_at = now();
  end if;
  perform public.log_admin_action('record_payment', p_shop,
    (select shop_name from public.shop_settings where shop_id = p_shop),
    jsonb_build_object('amount', p_amount, 'method', p_method, 'reference', p_reference, 'covers_until', p_covers_until));
  return v_id;
end;
$$;
revoke all on function public.admin_record_payment(uuid, numeric, date, text, text, date, text) from public, anon;
grant execute on function public.admin_record_payment(uuid, numeric, date, text, text, date, text) to authenticated;

-- Removes a payment entered by mistake. "Paid until" is not changed back
-- automatically; edit the subscription if it should be.
create or replace function public.admin_delete_payment(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.payments;
begin
  perform public.require_platform_admin();
  delete from public.payments where id = p_id returning * into v_row;
  if v_row.id is null then
    raise exception 'Payment not found.' using errcode = 'P0002';
  end if;
  perform public.log_admin_action('delete_payment', v_row.shop_id,
    (select shop_name from public.shop_settings where shop_id = v_row.shop_id),
    jsonb_build_object('amount', v_row.amount, 'paid_on', v_row.paid_on, 'method', v_row.method, 'reference', v_row.reference));
end;
$$;
revoke all on function public.admin_delete_payment(uuid) from public, anon;
grant execute on function public.admin_delete_payment(uuid) to authenticated;

-- Payments, newest first: one workshop's (p_shop) or everyone's.
create or replace function public.admin_payments(p_shop uuid default null, p_limit int default 25, p_offset int default 0)
returns table (
  id uuid,
  shop_id uuid,
  shop_name text,
  amount numeric,
  paid_on date,
  method text,
  reference text,
  covers_until date,
  notes text,
  recorded_by_email text,
  created_at timestamptz,
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
  select pa.id, pa.shop_id, coalesce(ss.shop_name, ''), pa.amount, pa.paid_on, pa.method, pa.reference,
         pa.covers_until, pa.notes, pa.recorded_by_email, pa.created_at, count(*) over ()
  from public.payments pa
  left join public.shop_settings ss on ss.shop_id = pa.shop_id
  where p_shop is null or pa.shop_id = p_shop
  order by pa.paid_on desc, pa.created_at desc
  limit least(greatest(coalesce(p_limit, 25), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
revoke all on function public.admin_payments(uuid, int, int) from public, anon;
grant execute on function public.admin_payments(uuid, int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Billing overview

-- Monthly recurring revenue, counts by state, money collected, and the last 12 months.
create or replace function public.admin_billing_overview()
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
  with subs as (
    select su.*, public.subscription_state(su.status, su.trial_ends_at, su.paid_until) as state,
           coalesce(su.price, p.price) as eff_price, p.period
    from public.subscriptions su
    left join public.plans p on p.id = su.plan_id
  ),
  months as (
    select generate_series(v_first, date_trunc('month', current_date)::date, interval '1 month')::date as month
  )
  select jsonb_build_object(
    'mrr', (select coalesce(sum(case when period = 'year' then eff_price / 12 else eff_price end), 0)
            from subs where state in ('active', 'overdue') and eff_price is not null),
    'paying', (select count(*) from subs where state = 'active'),
    'trials', (select count(*) from subs where state = 'trial'),
    'trials_ending_7d', (select count(*) from subs where state = 'trial' and trial_ends_at <= current_date + 7),
    'trial_ended', (select count(*) from subs where state = 'trial_ended'),
    'overdue', (select count(*) from subs where state = 'overdue'),
    'cancelled', (select count(*) from subs where state = 'cancelled'),
    'renewing_7d', (select count(*) from subs where state = 'active' and paid_until <= current_date + 7),
    'collected_month', (select coalesce(sum(amount), 0) from public.payments where paid_on >= date_trunc('month', current_date)),
    'collected_30d', (select coalesce(sum(amount), 0) from public.payments where paid_on >= current_date - 29),
    'collected_total', (select coalesce(sum(amount), 0) from public.payments),
    'by_month', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'month', to_char(m.month, 'YYYY-MM'),
        'collected', (select coalesce(sum(pa.amount), 0) from public.payments pa where date_trunc('month', pa.paid_on)::date = m.month),
        'payments', (select count(*) from public.payments pa where date_trunc('month', pa.paid_on)::date = m.month)
      ) order by m.month), '[]'::jsonb)
      from months m
    )
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.admin_billing_overview() from public, anon;
grant execute on function public.admin_billing_overview() to authenticated;

-- ---------------------------------------------------------------------------
-- For the workshop app: its own subscription (owners see a reminder near the end).

create or replace function public.my_subscription()
returns table (plan_name text, status text, state text, trial_ends_at date, paid_until date)
language sql
stable
security definer
set search_path = ''
as $$
  select p.name, su.status, public.subscription_state(su.status, su.trial_ends_at, su.paid_until),
         su.trial_ends_at, su.paid_until
  from public.subscriptions su
  left join public.plans p on p.id = su.plan_id
  where su.shop_id = public.my_shop_id();
$$;
revoke all on function public.my_subscription() from public, anon;
grant execute on function public.my_subscription() to authenticated;
