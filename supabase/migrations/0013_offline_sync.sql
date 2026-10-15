-- Offline mode support. Run in Supabase -> SQL Editor after 0012.
--
-- 1. save_bill() accepts p_new_id: the bill's id chosen on the device. If a bill
--    with that id already exists in the caller's workshop, it is updated instead
--    of created, so an upload that is retried (e.g. the connection dropped after
--    the server saved it) never makes a second copy.
-- 2. Any change to a bill or complaint bumps updated_at, so devices can download
--    just what changed since their last sync.

-- 2. Keep updated_at current on every change.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists bills_touch_updated_at on public.bills;
create trigger bills_touch_updated_at
  before update on public.bills
  for each row execute function public.touch_updated_at();

drop trigger if exists complaints_touch_updated_at on public.complaints;
create trigger complaints_touch_updated_at
  before update on public.complaints
  for each row execute function public.touch_updated_at();

create index if not exists bills_shop_updated_idx on public.bills (shop_id, updated_at);
create index if not exists complaints_shop_updated_idx on public.complaints (shop_id, updated_at);

-- 1. save_bill() with p_new_id. Same as 0011 otherwise.
drop function if exists public.save_bill(jsonb, jsonb, uuid, uuid[]);
drop function if exists public.save_bill(jsonb, jsonb, uuid, uuid[], uuid);

create function public.save_bill(
  p_bill jsonb,
  p_items jsonb,
  p_id uuid default null,
  p_complaint_ids uuid[] default '{}',
  p_new_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop uuid := public.my_shop_id();
  v_id uuid;
  v_target uuid := p_id;
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

  -- A device-chosen id that already exists in this workshop means "update it".
  if v_target is null and p_new_id is not null then
    if exists (select 1 from public.bills where id = p_new_id and shop_id = v_shop) then
      v_target := p_new_id;
    elsif exists (select 1 from public.bills where id = p_new_id) then
      raise exception 'Bill not found.' using errcode = 'P0002';
    end if;
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

  if v_target is null then
    insert into public.bills (id, shop_id, customer_name, address, phone, vehicle_reg, date_received, expected_pickup, delivered_on,
                              labour_charge, painting_charge, washing_charge, items_subtotal,
                              discount, discount_percent, grand_total)
    values (coalesce(p_new_id, gen_random_uuid()), v_shop, btrim(p_bill->>'customer_name'), nullif(btrim(p_bill->>'address'), ''), btrim(p_bill->>'phone'),
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
      grand_total = v_gross - v_discount
    where id = v_target and shop_id = v_shop
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
    set status = 'resolved'
    where id = any(v_ids) and shop_id = v_shop and status <> 'resolved';
  end if;

  if cardinality(v_old) > 0 then
    update public.complaints k
    set status = 'open'
    where k.id = any(v_old)
      and k.shop_id = v_shop
      and not (k.id = any(v_ids))
      and k.status = 'resolved'
      and not exists (select 1 from public.bill_complaints bc where bc.complaint_id = k.id);
  end if;

  -- Linking or unlinking a complaint changes what the bill shows; make sure devices pick it up.
  update public.complaints set updated_at = now()
  where shop_id = v_shop and id = any(v_ids || v_old);

  return v_id;
end;
$$;

revoke all on function public.save_bill(jsonb, jsonb, uuid, uuid[], uuid) from public, anon;
grant execute on function public.save_bill(jsonb, jsonb, uuid, uuid[], uuid) to authenticated;
