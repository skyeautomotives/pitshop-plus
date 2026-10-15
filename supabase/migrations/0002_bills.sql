-- Repair bills: one row per bill in `bills`, one row per item in `bill_items`.
-- Run in Supabase -> SQL Editor after 0001 (or `supabase db push`).
--
-- Replaces the first-draft tables from 0001 (never used) with a simpler
-- structure that matches how the workshop writes bills.

drop table if exists public.invoice_items, public.invoices, public.vehicles, public.customers;
drop sequence if exists public.invoice_number_seq;

-- When true, a bill may be saved with a labour charge of 0.
alter table public.shop_settings add column if not exists allow_zero_labour boolean not null default false;

create extension if not exists pg_trgm with schema extensions;

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  bill_number bigint generated always as identity unique,
  customer_name text not null check (length(btrim(customer_name)) between 1 and 100),
  address text check (address is null or length(address) <= 300),
  phone text not null check (length(regexp_replace(phone, '\D', '', 'g')) between 10 and 13),
  vehicle_reg text not null check (length(btrim(vehicle_reg)) between 4 and 20),
  date_received date not null,
  expected_pickup date check (expected_pickup is null or expected_pickup >= date_received),
  labour_charge numeric(12,2) not null check (labour_charge >= 0),
  -- null = service not selected
  painting_charge numeric(12,2) check (painting_charge > 0),
  washing_charge numeric(12,2) check (washing_charge > 0),
  -- Always computed by save_bill(); never trusted from the browser.
  items_subtotal numeric(12,2) not null default 0,
  grand_total numeric(12,2) not null default 0,
  -- Normalised copies used for searching ("98765 43210" -> "9876543210", "ka-01 ab 1234" -> "KA01AB1234").
  phone_digits text generated always as (regexp_replace(phone, '\D', '', 'g')) stored,
  vehicle_reg_key text generated always as (upper(regexp_replace(vehicle_reg, '[^A-Za-z0-9]', '', 'g'))) stored,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bill_items (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.bills(id) on delete cascade,
  position int not null,
  description text not null check (length(btrim(description)) between 1 and 200),
  price numeric(12,2) not null check (price >= 0)
);

create index on public.bill_items (bill_id, position);
create index on public.bills (date_received desc, bill_number desc);
create index on public.bills using gin (customer_name extensions.gin_trgm_ops);
create index on public.bills using gin (phone_digits extensions.gin_trgm_ops);
create index on public.bills using gin (vehicle_reg_key extensions.gin_trgm_ops);

-- Signed-in staff can read bills. Writes only go through save_bill(), so the
-- stored totals always match the items and charges.
alter table public.bills enable row level security;
alter table public.bill_items enable row level security;
create policy "staff read bills" on public.bills for select to authenticated using (true);
create policy "staff read bill items" on public.bill_items for select to authenticated using (true);

-- Creates a bill (p_id null) or replaces an existing one, with all its items, in one transaction.
-- p_bill: { customer_name, address, phone, vehicle_reg, date_received, expected_pickup,
--           labour_charge, painting_charge, washing_charge }   (amounts as strings, e.g. "450.00")
-- p_items: [{ description, price }, ...] in display order.
create or replace function public.save_bill(p_bill jsonb, p_items jsonb, p_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_labour numeric(12,2) := nullif(p_bill->>'labour_charge', '')::numeric;
  v_painting numeric(12,2) := nullif(p_bill->>'painting_charge', '')::numeric;
  v_washing numeric(12,2) := nullif(p_bill->>'washing_charge', '')::numeric;
  v_subtotal numeric(12,2);
  v_allow_zero boolean;
begin
  if auth.uid() is null then
    raise exception 'Please sign in again.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Items must be a list.' using errcode = '22023';
  end if;

  select allow_zero_labour into v_allow_zero from public.shop_settings where id = 1;
  if v_labour is null or v_labour < 0 or (v_labour = 0 and not coalesce(v_allow_zero, false)) then
    raise exception 'A valid labour charge is required.' using errcode = '22023';
  end if;

  select coalesce(sum((i->>'price')::numeric(12,2)), 0) into v_subtotal
  from jsonb_array_elements(p_items) as i;

  if p_id is null then
    insert into public.bills (customer_name, address, phone, vehicle_reg, date_received, expected_pickup,
                              labour_charge, painting_charge, washing_charge, items_subtotal, grand_total)
    values (btrim(p_bill->>'customer_name'), nullif(btrim(p_bill->>'address'), ''), btrim(p_bill->>'phone'),
            upper(btrim(p_bill->>'vehicle_reg')), (p_bill->>'date_received')::date,
            nullif(p_bill->>'expected_pickup', '')::date,
            v_labour, v_painting, v_washing, v_subtotal,
            v_subtotal + v_labour + coalesce(v_painting, 0) + coalesce(v_washing, 0))
    returning id into v_id;
  else
    update public.bills set
      customer_name = btrim(p_bill->>'customer_name'),
      address = nullif(btrim(p_bill->>'address'), ''),
      phone = btrim(p_bill->>'phone'),
      vehicle_reg = upper(btrim(p_bill->>'vehicle_reg')),
      date_received = (p_bill->>'date_received')::date,
      expected_pickup = nullif(p_bill->>'expected_pickup', '')::date,
      labour_charge = v_labour,
      painting_charge = v_painting,
      washing_charge = v_washing,
      items_subtotal = v_subtotal,
      grand_total = v_subtotal + v_labour + coalesce(v_painting, 0) + coalesce(v_washing, 0),
      updated_at = now()
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Bill not found.' using errcode = 'P0002';
    end if;
    delete from public.bill_items where bill_id = v_id;
  end if;

  insert into public.bill_items (bill_id, position, description, price)
  select v_id, t.ord - 1, btrim(t.i->>'description'), (t.i->>'price')::numeric(12,2)
  from jsonb_array_elements(p_items) with ordinality as t(i, ord);

  return v_id;
end;
$$;

revoke all on function public.save_bill(jsonb, jsonb, uuid) from public, anon;
grant execute on function public.save_bill(jsonb, jsonb, uuid) to authenticated;

-- One search box: matches customer name, phone number or vehicle number.
-- An empty query returns the most recent bills.
create or replace function public.search_bills(q text)
returns setof public.bills
language sql
stable
set search_path = ''
as $$
  with term as (
    select
      replace(replace(replace(btrim(coalesce(q, '')), '\', '\\'), '%', '\%'), '_', '\_') as text_q,
      regexp_replace(coalesce(q, ''), '\D', '', 'g') as digits_q,
      upper(regexp_replace(coalesce(q, ''), '[^A-Za-z0-9]', '', 'g')) as reg_q
  )
  select b.*
  from public.bills b, term
  where term.text_q = ''
     or b.customer_name ilike '%' || term.text_q || '%'
     or (length(term.digits_q) >= 3 and b.phone_digits like '%' || term.digits_q || '%')
     or (term.reg_q <> '' and b.vehicle_reg_key like '%' || term.reg_q || '%')
  order by b.date_received desc, b.bill_number desc
  limit 100;
$$;

revoke all on function public.search_bills(text) from public, anon;
grant execute on function public.search_bills(text) to authenticated;
