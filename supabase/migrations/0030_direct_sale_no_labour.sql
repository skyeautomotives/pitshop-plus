-- Direct sale bills without a labour charge. Run after 0029.
--
-- A bill can be marked as a direct sale (parts sold over the counter). A direct
-- sale may be saved with no labour charge, whatever the workshop's labour setting.
-- Bills show "Direct sale" and leave out the labour line when it is zero.

alter table public.bills add column if not exists direct_sale boolean not null default false;

-- The core save (0013, renamed in 0026): same as before, except the labour check.
create or replace function public.save_bill_core(
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
  -- A direct sale (sold over the counter) may have no labour charge.
  if v_labour is null or v_labour < 0 or (v_labour = 0 and not coalesce(v_allow_zero, false)
      and not coalesce((p_bill->>'direct_sale')::boolean, false)
      and not exists (select 1 from public.bills where id = coalesce(p_id, p_new_id) and shop_id = v_shop and direct_sale)) then
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

revoke all on function public.save_bill_core(jsonb, jsonb, uuid, uuid[], uuid) from public, anon, authenticated;

-- save_bill(): same as 0026, plus the direct sale mark when the app sends it.
create or replace function public.save_bill(
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
  v_id uuid;
begin
  v_id := public.save_bill_core(p_bill, p_items, p_id, p_complaint_ids, p_new_id);
  perform public.set_bill_gst(v_id, public.my_shop_id(), p_bill, p_items);
  if p_bill ? 'direct_sale' then
    update public.bills set direct_sale = coalesce((p_bill->>'direct_sale')::boolean, false)
    where id = v_id and shop_id = public.my_shop_id();
  end if;
  return v_id;
end;
$$;

revoke all on function public.save_bill(jsonb, jsonb, uuid, uuid[], uuid) from public, anon;
grant execute on function public.save_bill(jsonb, jsonb, uuid, uuid[], uuid) to authenticated;

-- restore_backup(): same as 0028, plus each restored bill's direct sale mark.
create or replace function public.restore_backup(p_bills jsonb, p_complaints jsonb, p_settings jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop uuid := public.my_shop_id();
  v_before uuid[];
  v_result jsonb;
  e jsonb;
  v_id uuid;
begin
  select coalesce(array_agg(b.id), '{}') into v_before
  from public.bills b
  where b.shop_id = v_shop
    and b.id::text in (select x->>'id' from jsonb_array_elements(coalesce(p_bills, '[]')) x);

  v_result := public.restore_backup_core(p_bills, p_complaints, p_settings);

  for e in select * from jsonb_array_elements(coalesce(p_bills, '[]')) loop
    v_id := nullif(e->>'id', '')::uuid;
    -- Direct sale bills added by this restore.
    if v_id is not null and not (v_id = any(v_before)) and coalesce((e->>'direct_sale')::boolean, false) then
      update public.bills set direct_sale = true where id = v_id and shop_id = v_shop;
    end if;
    -- Credit due date on bills added by this restore.
    if v_id is not null and not (v_id = any(v_before)) and nullif(e->>'credit_due_on', '') is not null then
      begin
        update public.bills
        set credit_due_on = (e->>'credit_due_on')::date,
            credit_note = left(nullif(btrim(e->>'credit_note'), ''), 200),
            credit_reminded_on = nullif(e->>'credit_reminded_on', '')::date
        where id = v_id and shop_id = v_shop;
      exception when others then
        null;
      end;
    end if;
    if v_id is not null and not (v_id = any(v_before))
       and nullif(e->>'gst_mode', '') is not null
       and exists (select 1 from public.bills where id = v_id and shop_id = v_shop) then
      begin
        update public.bills
        set gst_mode = e->>'gst_mode',
            gstin = nullif(e->>'gstin', ''),
            customer_gstin = nullif(e->>'customer_gstin', ''),
            service_gst_rate = coalesce(nullif(e->>'service_gst_rate', '')::smallint, 18)
        where id = v_id;
        update public.bill_items bi
        set gst_rate = coalesce(nullif(x->>'gst_rate', '')::smallint, 18),
            hsn = nullif(x->>'hsn', '')
        from jsonb_array_elements(coalesce(e->'bill_items', '[]')) with ordinality as t(x, o)
        where bi.bill_id = v_id and bi.position = coalesce(nullif(x->>'position', '')::int, (o - 1)::int);
        perform public.apply_bill_gst(v_id);
      exception when others then
        -- Damaged GST details: the bill is kept as a plain bill.
        null;
      end;
    end if;
  end loop;

  return v_result;
end;
$$;

revoke all on function public.restore_backup(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.restore_backup(jsonb, jsonb, jsonb) to authenticated;
