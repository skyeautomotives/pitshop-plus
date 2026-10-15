-- Customer/vehicle complaints, and which bills address which complaints.
-- Run in Supabase -> SQL Editor after 0003.
--
-- Complaints and bills belong to the same vehicle when their normalised
-- registration numbers (vehicle_reg_key) match. Existing bills are unchanged
-- and simply have no complaints linked.

create table public.complaints (
  id uuid primary key default gen_random_uuid(),
  complaint_number bigint generated always as identity unique,
  customer_name text not null check (length(btrim(customer_name)) between 1 and 100),
  address text check (address is null or length(address) <= 300),
  phone text not null check (length(regexp_replace(phone, '\D', '', 'g')) between 10 and 13),
  vehicle_reg text not null check (length(btrim(vehicle_reg)) between 4 and 20),
  description text not null check (length(btrim(description)) between 1 and 1000),
  reported_on date not null default current_date,
  -- Representative who attended the customer (free text; optional).
  attended_by text check (attended_by is null or length(attended_by) <= 100),
  notes text check (notes is null or length(notes) <= 1000),
  status text not null default 'open' check (status in ('open', 'resolved')),
  phone_digits text generated always as (regexp_replace(phone, '\D', '', 'g')) stored,
  vehicle_reg_key text generated always as (upper(regexp_replace(vehicle_reg, '[^A-Za-z0-9]', '', 'g'))) stored,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Many-to-many: a bill can address several complaints, and a complaint can need several bills.
create table public.bill_complaints (
  bill_id uuid not null references public.bills(id) on delete cascade,
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  primary key (bill_id, complaint_id)
);

create index on public.bill_complaints (complaint_id);
create index on public.complaints (vehicle_reg_key, reported_on desc);
create index on public.complaints (reported_on desc, complaint_number desc);
create index on public.complaints using gin (customer_name extensions.gin_trgm_ops);
create index on public.complaints using gin (phone_digits extensions.gin_trgm_ops);
create index on public.complaints using gin (vehicle_reg_key extensions.gin_trgm_ops);
create index on public.bills (vehicle_reg_key);

-- Same access rule as bills: listed staff only.
alter table public.complaints enable row level security;
alter table public.bill_complaints enable row level security;
create policy "staff read complaints" on public.complaints for select to authenticated using (public.is_staff());
create policy "staff add complaints" on public.complaints for insert to authenticated with check (public.is_staff());
create policy "staff update complaints" on public.complaints
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
-- Links are only written by save_bill().
create policy "staff read bill complaints" on public.bill_complaints for select to authenticated using (public.is_staff());

-- Names for the "Attended by" suggestions (any staff member may see colleagues' names).
create or replace function public.staff_names()
returns table (full_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.full_name from public.staff s
  where public.is_staff() and s.full_name <> ''
  order by s.full_name;
$$;
revoke all on function public.staff_names() from public, anon;
grant execute on function public.staff_names() to authenticated;

-- save_bill() gains p_complaint_ids. The old 3-argument version is replaced so
-- calls aren't ambiguous.
drop function public.save_bill(jsonb, jsonb, uuid);

create function public.save_bill(
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
  v_id uuid;
  v_labour numeric(12,2) := nullif(p_bill->>'labour_charge', '')::numeric;
  v_painting numeric(12,2) := nullif(p_bill->>'painting_charge', '')::numeric;
  v_washing numeric(12,2) := nullif(p_bill->>'washing_charge', '')::numeric;
  v_subtotal numeric(12,2);
  v_allow_zero boolean;
  v_reg_key text;
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
    returning id, vehicle_reg_key into v_id, v_reg_key;
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
    returning id, vehicle_reg_key into v_id, v_reg_key;
    if v_id is null then
      raise exception 'Bill not found.' using errcode = 'P0002';
    end if;
    delete from public.bill_items where bill_id = v_id;
    delete from public.bill_complaints where bill_id = v_id;
  end if;

  insert into public.bill_items (bill_id, position, description, price)
  select v_id, t.ord - 1, btrim(t.i->>'description'), (t.i->>'price')::numeric(12,2)
  from jsonb_array_elements(p_items) with ordinality as t(i, ord);

  if cardinality(coalesce(p_complaint_ids, '{}')) > 0 then
    -- Every linked complaint must exist and be for this bill's vehicle.
    if exists (
      select 1 from unnest(p_complaint_ids) as c(id)
      left join public.complaints k on k.id = c.id
      where k.id is null or k.vehicle_reg_key <> v_reg_key
    ) then
      raise exception 'A selected complaint is for a different vehicle. Check the vehicle number.' using errcode = '22023';
    end if;
    insert into public.bill_complaints (bill_id, complaint_id)
    select distinct v_id, c.id from unnest(p_complaint_ids) as c(id);
  end if;

  return v_id;
end;
$$;

revoke all on function public.save_bill(jsonb, jsonb, uuid, uuid[]) from public, anon;
grant execute on function public.save_bill(jsonb, jsonb, uuid, uuid[]) to authenticated;

-- Complaint search: same matching rules as search_bills().
create or replace function public.search_complaints(q text)
returns setof public.complaints
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
  select c.*
  from public.complaints c, term
  where term.text_q = ''
     or c.customer_name ilike '%' || term.text_q || '%'
     or (length(term.digits_q) >= 3 and c.phone_digits like '%' || term.digits_q || '%')
     or (term.reg_q <> '' and c.vehicle_reg_key like '%' || term.reg_q || '%')
  order by c.reported_on desc, c.complaint_number desc
  limit 100;
$$;

revoke all on function public.search_complaints(text) from public, anon;
grant execute on function public.search_complaints(text) to authenticated;
