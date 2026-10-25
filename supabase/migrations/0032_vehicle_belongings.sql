-- Items left in the vehicle (cars). Run after 0031.
--
-- Car workshops record things left in the car, such as a cooling glass or an
-- umbrella: 'cooling_glass', 'umbrella', or text typed by staff (1-60 characters, up to 10).
-- Complaints saved by older versions of the app have none.

alter table public.complaints
  add column if not exists belongings text[] not null default '{}'
    check (cardinality(belongings) <= 10);

create or replace function public.complaints_check_belongings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from unnest(new.belongings) b where length(btrim(b)) not between 1 and 60) then
    raise exception 'Each item must be 1-60 characters.' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists complaints_check_belongings on public.complaints;
create trigger complaints_check_belongings
  before insert or update on public.complaints
  for each row execute function public.complaints_check_belongings();

-- restore_backup(): same as 0030, plus the items left in each restored complaint's vehicle.
create or replace function public.restore_backup(p_bills jsonb, p_complaints jsonb, p_settings jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop uuid := public.my_shop_id();
  v_before uuid[];
  v_before_c uuid[];
  v_result jsonb;
  e jsonb;
  v_id uuid;
begin
  select coalesce(array_agg(b.id), '{}') into v_before
  from public.bills b
  where b.shop_id = v_shop
    and b.id::text in (select x->>'id' from jsonb_array_elements(coalesce(p_bills, '[]')) x);

  select coalesce(array_agg(c.id), '{}') into v_before_c
  from public.complaints c
  where c.shop_id = v_shop
    and c.id::text in (select x->>'id' from jsonb_array_elements(coalesce(p_complaints, '[]')) x);

  v_result := public.restore_backup_core(p_bills, p_complaints, p_settings);

  -- Items left in the vehicle, on complaints added by this restore.
  for e in select * from jsonb_array_elements(coalesce(p_complaints, '[]')) loop
    v_id := nullif(e->>'id', '')::uuid;
    if v_id is not null and not (v_id = any(v_before_c)) and jsonb_typeof(e->'belongings') = 'array' then
      begin
        update public.complaints
        set belongings = array(select jsonb_array_elements_text(e->'belongings'))
        where id = v_id and shop_id = v_shop;
      exception when others then
        null;
      end;
    end if;
  end loop;

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
