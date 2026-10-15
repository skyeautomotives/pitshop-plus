-- Many workshops in one database. Run in Supabase -> SQL Editor after 0010.
--
-- Each workshop is a row in `shops`. Every login (staff row), bill, complaint
-- and the shop's settings belong to exactly one shop, and Row Level Security
-- only ever shows a login the rows of its own shop.
--
-- New shops are created by the `register-shop` Edge Function (the Register
-- page), which calls create_shop() below with the service-role key.
--
-- Bill and complaint numbers now count from 1 in each shop.
--
-- Existing data: if this database already has logins, bills or complaints
-- (a single-workshop install), they all become the first shop, keeping their
-- numbers and settings. A fresh database starts with no shops.

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  last_bill_number bigint not null default 0,
  last_complaint_number bigint not null default 0,
  created_at timestamptz not null default now()
);

alter table public.shops enable row level security;

alter table public.staff add column shop_id uuid references public.shops(id) on delete cascade;
alter table public.bills add column shop_id uuid references public.shops(id) on delete cascade;
alter table public.complaints add column shop_id uuid references public.shops(id) on delete cascade;

-- shop_settings: one row per shop instead of the single row with id = 1.
alter table public.shop_settings add column shop_id uuid references public.shops(id) on delete cascade;
alter table public.shop_settings alter column shop_name set default '';

-- Move existing data into the first shop.
do $$
declare
  v_shop uuid;
begin
  if exists (select 1 from public.staff)
     or exists (select 1 from public.bills)
     or exists (select 1 from public.complaints) then
    insert into public.shops (last_bill_number, last_complaint_number)
    values (
      coalesce((select max(bill_number) from public.bills), 0),
      coalesce((select max(complaint_number) from public.complaints), 0)
    )
    returning id into v_shop;
    update public.shop_settings set shop_id = v_shop where id = 1;
    update public.staff set shop_id = v_shop;
    update public.bills set shop_id = v_shop;
    update public.complaints set shop_id = v_shop;
  end if;
  -- The placeholder settings row of a fresh install has no shop.
  delete from public.shop_settings where shop_id is null;
end;
$$;

alter table public.staff alter column shop_id set not null;
alter table public.bills alter column shop_id set not null;
alter table public.complaints alter column shop_id set not null;

alter table public.shop_settings drop constraint shop_settings_pkey;
alter table public.shop_settings drop column id;
alter table public.shop_settings alter column shop_id set not null;
alter table public.shop_settings add primary key (shop_id);

create index on public.staff (shop_id);
create index on public.bills (shop_id, date_received desc, bill_number desc);
create index on public.complaints (shop_id, reported_on desc, complaint_number desc);

-- Numbers per shop: drop the database-wide counters, number on insert instead.
alter table public.bills alter column bill_number drop identity if exists;
alter table public.bills drop constraint if exists bills_bill_number_key;
alter table public.bills add constraint bills_shop_bill_number_key unique (shop_id, bill_number);

alter table public.complaints alter column complaint_number drop identity if exists;
alter table public.complaints drop constraint if exists complaints_complaint_number_key;
alter table public.complaints add constraint complaints_shop_complaint_number_key unique (shop_id, complaint_number);

-- ---------------------------------------------------------------------------
-- Who is signed in

-- The shop of the signed-in login (null if it isn't on any shop's staff list).
create or replace function public.my_shop_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select shop_id from public.staff where user_id = auth.uid();
$$;
revoke all on function public.my_shop_id() from public, anon;
grant execute on function public.my_shop_id() to authenticated;

-- is_staff() and is_owner() keep their meaning: "on a staff list" and
-- "owner of their own shop". Every policy below also checks the shop.

-- ---------------------------------------------------------------------------
-- Numbering

create or replace function public.bills_assign_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.shop_id := coalesce(new.shop_id, public.my_shop_id());
  if new.shop_id is null then
    raise exception 'Your login is not set up for a workshop.' using errcode = '42501';
  end if;
  -- The row lock on the shop keeps two bills from getting the same number.
  update public.shops set last_bill_number = last_bill_number + 1
  where id = new.shop_id
  returning last_bill_number into new.bill_number;
  return new;
end;
$$;

create trigger bills_assign_number
  before insert on public.bills
  for each row execute function public.bills_assign_number();

create or replace function public.complaints_assign_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.shop_id := coalesce(new.shop_id, public.my_shop_id());
  if new.shop_id is null then
    raise exception 'Your login is not set up for a workshop.' using errcode = '42501';
  end if;
  update public.shops set last_complaint_number = last_complaint_number + 1
  where id = new.shop_id
  returning last_complaint_number into new.complaint_number;
  return new;
end;
$$;

create trigger complaints_assign_number
  before insert on public.complaints
  for each row execute function public.complaints_assign_number();

-- A bill or complaint never changes shop or number after it is created.
create or replace function public.keep_shop_and_number()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.shop_id := old.shop_id;
  if tg_table_name = 'bills' then
    new.bill_number := old.bill_number;
  else
    new.complaint_number := old.complaint_number;
  end if;
  return new;
end;
$$;

create trigger bills_keep_shop_and_number
  before update on public.bills
  for each row execute function public.keep_shop_and_number();

create trigger complaints_keep_shop_and_number
  before update on public.complaints
  for each row execute function public.keep_shop_and_number();

-- ---------------------------------------------------------------------------
-- Access: each login sees only its own shop

create policy "staff read own shop" on public.shops
  for select to authenticated using (id = public.my_shop_id());

drop policy "read own staff row, owner reads all" on public.staff;
create policy "read own staff row, owner reads own shop" on public.staff
  for select to authenticated
  using (user_id = auth.uid() or (public.is_owner() and shop_id = public.my_shop_id()));

drop policy "staff read settings" on public.shop_settings;
create policy "staff read settings" on public.shop_settings
  for select to authenticated using (shop_id = public.my_shop_id());

drop policy "owner updates settings" on public.shop_settings;
create policy "owner updates settings" on public.shop_settings
  for update to authenticated
  using (public.is_owner() and shop_id = public.my_shop_id())
  with check (public.is_owner() and shop_id = public.my_shop_id());

drop policy "staff read bills" on public.bills;
create policy "staff read bills" on public.bills
  for select to authenticated using (shop_id = public.my_shop_id());

drop policy "staff read bill items" on public.bill_items;
create policy "staff read bill items" on public.bill_items
  for select to authenticated
  using (exists (select 1 from public.bills b where b.id = bill_id and b.shop_id = public.my_shop_id()));

drop policy "staff read complaints" on public.complaints;
create policy "staff read complaints" on public.complaints
  for select to authenticated using (shop_id = public.my_shop_id());

drop policy "staff add complaints" on public.complaints;
alter table public.complaints alter column shop_id set default public.my_shop_id();
create policy "staff add complaints" on public.complaints
  for insert to authenticated with check (shop_id = public.my_shop_id());

drop policy "staff update complaints" on public.complaints;
create policy "staff update complaints" on public.complaints
  for update to authenticated
  using (shop_id = public.my_shop_id())
  with check (shop_id = public.my_shop_id());

drop policy "staff read bill complaints" on public.bill_complaints;
create policy "staff read bill complaints" on public.bill_complaints
  for select to authenticated
  using (exists (select 1 from public.bills b where b.id = bill_id and b.shop_id = public.my_shop_id()));

-- ---------------------------------------------------------------------------
-- Functions that run with elevated rights must stay inside the caller's shop

create or replace function public.staff_names()
returns table (full_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.full_name from public.staff s
  where s.shop_id = public.my_shop_id() and s.full_name <> ''
  order by s.full_name;
$$;

create or replace function public.staff_display_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(btrim(s.full_name), ''), split_part(s.email, '@', 1))
  from public.staff s
  where s.user_id = p_user and s.shop_id = public.my_shop_id();
$$;

-- Owners can rename anyone in their shop; staff can rename themselves.
create or replace function public.set_staff_name(p_user uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_shop uuid := public.my_shop_id();
begin
  if not (p_user = auth.uid()
          or (public.is_owner() and exists (select 1 from public.staff where user_id = p_user and shop_id = v_shop))) then
    raise exception 'Only the owner can rename other staff.' using errcode = '42501';
  end if;
  if length(v_name) not between 1 and 100 then
    raise exception 'Enter a name (up to 100 characters).' using errcode = '22023';
  end if;
  update public.staff set full_name = v_name where user_id = p_user and shop_id = v_shop;
  if not found then
    raise exception 'Staff member not found.' using errcode = 'P0002';
  end if;
  perform set_config('app.renaming_staff', 'on', true);
  update public.complaints set attended_by = v_name where attended_by_user = p_user and shop_id = v_shop;
  perform set_config('app.renaming_staff', 'off', true);
end;
$$;

-- save_bill(): same as 0010, but every read and write is limited to the caller's shop.
create or replace function public.save_bill(
  p_bill jsonb,
  p_items jsonb,
  p_id uuid default null,
  p_complaint_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop uuid := public.my_shop_id();
  v_id uuid;
  v_labour numeric(12,2) := nullif(p_bill->>'labour_charge', '')::numeric;
  v_painting numeric(12,2) := nullif(p_bill->>'painting_charge', '')::numeric;
  v_washing numeric(12,2) := nullif(p_bill->>'washing_charge', '')::numeric;
  v_subtotal numeric(12,2);
  v_allow_zero boolean;
  v_reg_key text;
  v_ids uuid[] := coalesce(p_complaint_ids, '{}');
  v_old uuid[] := '{}';
  v_received date := (p_bill->>'date_received')::date;
  v_delivered date := coalesce(nullif(p_bill->>'delivered_on', '')::date, current_date);
  v_discount numeric(12,2) := coalesce(nullif(p_bill->>'discount', '')::numeric, 0);
  v_discount_pct numeric(5,2) := nullif(p_bill->>'discount_percent', '')::numeric;
  v_gross numeric(12,2);
begin
  if auth.uid() is null then
    raise exception 'Please sign in again.' using errcode = '42501';
  end if;
  if v_shop is null then
    raise exception 'Your login is not set up for a workshop.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Items must be a list.' using errcode = '22023';
  end if;

  if v_delivered < v_received then
    raise exception 'The delivery date can''t be before the date received.' using errcode = '22023';
  end if;

  select allow_zero_labour into v_allow_zero from public.shop_settings where shop_id = v_shop;
  if v_labour is null or v_labour < 0 or (v_labour = 0 and not coalesce(v_allow_zero, false)) then
    raise exception 'A valid labour charge is required.' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) as i
    where coalesce(nullif(i->>'quantity', '')::numeric, 1) <= 0
  ) then
    raise exception 'Each item needs a quantity above 0.' using errcode = '22023';
  end if;

  select coalesce(sum(round(coalesce(nullif(i->>'quantity', '')::numeric, 1) * (i->>'price')::numeric(12,2), 2)), 0)
  into v_subtotal
  from jsonb_array_elements(p_items) as i;

  v_gross := v_subtotal + v_labour + coalesce(v_painting, 0) + coalesce(v_washing, 0);
  if v_discount < 0 or v_discount > v_gross then
    raise exception 'The discount can''t be more than the bill total.' using errcode = '22023';
  end if;
  if v_discount = 0 then
    v_discount_pct := null;
  end if;

  if p_id is null then
    insert into public.bills (shop_id, customer_name, address, phone, vehicle_reg, date_received, expected_pickup, delivered_on,
                              labour_charge, painting_charge, washing_charge, items_subtotal,
                              discount, discount_percent, grand_total)
    values (v_shop, btrim(p_bill->>'customer_name'), nullif(btrim(p_bill->>'address'), ''), btrim(p_bill->>'phone'),
            upper(btrim(p_bill->>'vehicle_reg')), (p_bill->>'date_received')::date,
            nullif(p_bill->>'expected_pickup', '')::date, v_delivered,
            v_labour, v_painting, v_washing, v_subtotal,
            v_discount, v_discount_pct, v_gross - v_discount)
    returning id, vehicle_reg_key into v_id, v_reg_key;
  else
    update public.bills set
      customer_name = btrim(p_bill->>'customer_name'),
      address = nullif(btrim(p_bill->>'address'), ''),
      phone = btrim(p_bill->>'phone'),
      vehicle_reg = upper(btrim(p_bill->>'vehicle_reg')),
      date_received = (p_bill->>'date_received')::date,
      expected_pickup = nullif(p_bill->>'expected_pickup', '')::date,
      delivered_on = v_delivered,
      labour_charge = v_labour,
      painting_charge = v_painting,
      washing_charge = v_washing,
      items_subtotal = v_subtotal,
      discount = v_discount,
      discount_percent = v_discount_pct,
      grand_total = v_gross - v_discount,
      updated_at = now()
    where id = p_id and shop_id = v_shop
    returning id, vehicle_reg_key into v_id, v_reg_key;
    if v_id is null then
      raise exception 'Bill not found.' using errcode = 'P0002';
    end if;
    delete from public.bill_items where bill_id = v_id;
    select coalesce(array_agg(complaint_id), '{}') into v_old from public.bill_complaints where bill_id = v_id;
    delete from public.bill_complaints where bill_id = v_id;
  end if;

  insert into public.bill_items (bill_id, position, description, quantity, price, line_total)
  select v_id, t.ord - 1, btrim(t.i->>'description'),
         coalesce(nullif(t.i->>'quantity', '')::numeric, 1)::numeric(10,2),
         (t.i->>'price')::numeric(12,2),
         round(coalesce(nullif(t.i->>'quantity', '')::numeric, 1) * (t.i->>'price')::numeric(12,2), 2)
  from jsonb_array_elements(p_items) with ordinality as t(i, ord);

  if cardinality(v_ids) > 0 then
    -- Every linked complaint must exist in this shop and be for this bill's vehicle.
    if exists (
      select 1 from unnest(v_ids) as c(id)
      left join public.complaints k on k.id = c.id and k.shop_id = v_shop
      where k.id is null or k.vehicle_reg_key <> v_reg_key
    ) then
      raise exception 'A selected complaint is for a different vehicle. Check the vehicle number.' using errcode = '22023';
    end if;
    insert into public.bill_complaints (bill_id, complaint_id)
    select distinct v_id, c.id from unnest(v_ids) as c(id);

    update public.complaints
    set status = 'resolved', updated_at = now()
    where id = any(v_ids) and shop_id = v_shop and status <> 'resolved';
  end if;

  if cardinality(v_old) > 0 then
    update public.complaints k
    set status = 'open', updated_at = now()
    where k.id = any(v_old)
      and k.shop_id = v_shop
      and not (k.id = any(v_ids))
      and k.status = 'resolved'
      and not exists (select 1 from public.bill_complaints bc where bc.complaint_id = k.id);
  end if;

  return v_id;
end;
$$;

revoke all on function public.save_bill(jsonb, jsonb, uuid, uuid[]) from public, anon;
grant execute on function public.save_bill(jsonb, jsonb, uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Registering a new workshop

-- Creates a shop, its settings and its owner's staff row for an existing
-- login, in one transaction. Only the register-shop Edge Function (service
-- role) may call it; signed-in users and visitors cannot.
create or replace function public.create_shop(
  p_user uuid,
  p_username text,
  p_full_name text,
  p_shop_name text,
  p_phone text default null,
  p_address text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop uuid;
begin
  if length(btrim(coalesce(p_shop_name, ''))) not between 1 and 100 then
    raise exception 'Enter the workshop name (up to 100 characters).' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_full_name, ''))) not between 1 and 100 then
    raise exception 'Enter your name (up to 100 characters).' using errcode = '22023';
  end if;

  insert into public.shops default values returning id into v_shop;

  insert into public.shop_settings (shop_id, shop_name, phone, address)
  values (v_shop, btrim(p_shop_name), nullif(btrim(coalesce(p_phone, '')), ''), nullif(btrim(coalesce(p_address, '')), ''));

  insert into public.staff (user_id, shop_id, email, username, full_name, role)
  values (p_user, v_shop, p_username || '@pitstop.invalid', p_username, btrim(p_full_name), 'owner');

  return v_shop;
end;
$$;

revoke all on function public.create_shop(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_shop(uuid, text, text, text, text, text) to service_role;
