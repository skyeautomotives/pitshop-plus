-- Delivery date and discount on bills.
-- Run in Supabase -> SQL Editor after 0008.
--
-- Delivery date: new bills default to the bill date (today); it can be
-- changed but not set before the date received. Existing bills get the date
-- they were made.
--
-- Discount: an optional amount taken off the bill. discount_percent is kept
-- only to show "Discount (10%)"; the amount is what counts. The grand total
-- is items + labour + painting + washing - discount, and is still always
-- calculated here, never trusted from the browser.

alter table public.bills add column if not exists delivered_on date;

update public.bills
set delivered_on = greatest((created_at at time zone 'Asia/Kolkata')::date, date_received)
where delivered_on is null;

alter table public.bills alter column delivered_on set default current_date;
alter table public.bills alter column delivered_on set not null;
alter table public.bills drop constraint if exists bills_delivered_after_received;
alter table public.bills add constraint bills_delivered_after_received check (delivered_on >= date_received);

alter table public.bills add column if not exists discount numeric(12,2) not null default 0;
alter table public.bills add column if not exists discount_percent numeric(5,2);
alter table public.bills drop constraint if exists bills_discount_valid;
alter table public.bills add constraint bills_discount_valid
  check (discount >= 0 and (discount_percent is null or (discount_percent > 0 and discount_percent <= 100)));

-- save_bill(): same as 0006, plus delivered_on (default today) and the discount.
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
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Items must be a list.' using errcode = '22023';
  end if;

  if v_delivered < v_received then
    raise exception 'The delivery date can''t be before the date received.' using errcode = '22023';
  end if;

  select allow_zero_labour into v_allow_zero from public.shop_settings where id = 1;
  if v_labour is null or v_labour < 0 or (v_labour = 0 and not coalesce(v_allow_zero, false)) then
    raise exception 'A valid labour charge is required.' using errcode = '22023';
  end if;

  select coalesce(sum((i->>'price')::numeric(12,2)), 0) into v_subtotal
  from jsonb_array_elements(p_items) as i;

  v_gross := v_subtotal + v_labour + coalesce(v_painting, 0) + coalesce(v_washing, 0);
  if v_discount < 0 or v_discount > v_gross then
    raise exception 'The discount can''t be more than the bill total.' using errcode = '22023';
  end if;
  if v_discount = 0 then
    v_discount_pct := null;
  end if;

  if p_id is null then
    insert into public.bills (customer_name, address, phone, vehicle_reg, date_received, expected_pickup, delivered_on,
                              labour_charge, painting_charge, washing_charge, items_subtotal,
                              discount, discount_percent, grand_total)
    values (btrim(p_bill->>'customer_name'), nullif(btrim(p_bill->>'address'), ''), btrim(p_bill->>'phone'),
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
    where id = p_id
    returning id, vehicle_reg_key into v_id, v_reg_key;
    if v_id is null then
      raise exception 'Bill not found.' using errcode = 'P0002';
    end if;
    delete from public.bill_items where bill_id = v_id;
    select coalesce(array_agg(complaint_id), '{}') into v_old from public.bill_complaints where bill_id = v_id;
    delete from public.bill_complaints where bill_id = v_id;
  end if;

  insert into public.bill_items (bill_id, position, description, price)
  select v_id, t.ord - 1, btrim(t.i->>'description'), (t.i->>'price')::numeric(12,2)
  from jsonb_array_elements(p_items) with ordinality as t(i, ord);

  if cardinality(v_ids) > 0 then
    -- Every linked complaint must exist and be for this bill's vehicle.
    if exists (
      select 1 from unnest(v_ids) as c(id)
      left join public.complaints k on k.id = c.id
      where k.id is null or k.vehicle_reg_key <> v_reg_key
    ) then
      raise exception 'A selected complaint is for a different vehicle. Check the vehicle number.' using errcode = '22023';
    end if;
    insert into public.bill_complaints (bill_id, complaint_id)
    select distinct v_id, c.id from unnest(v_ids) as c(id);

    -- A bill for a complaint means the complaint has been dealt with.
    update public.complaints
    set status = 'resolved', updated_at = now()
    where id = any(v_ids) and status <> 'resolved';
  end if;

  -- Complaints this bill no longer addresses go back to Open if no other bill covers them.
  if cardinality(v_old) > 0 then
    update public.complaints k
    set status = 'open', updated_at = now()
    where k.id = any(v_old)
      and not (k.id = any(v_ids))
      and k.status = 'resolved'
      and not exists (select 1 from public.bill_complaints bc where bc.complaint_id = k.id);
  end if;

  return v_id;
end;
$$;

revoke all on function public.save_bill(jsonb, jsonb, uuid, uuid[]) from public, anon;
grant execute on function public.save_bill(jsonb, jsonb, uuid, uuid[]) to authenticated;
