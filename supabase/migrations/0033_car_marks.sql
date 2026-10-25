-- Scratches and dents marked on a car diagram when the car comes in. Run after 0032.
--
-- car_marks is a list of {x, y, k}: x and y are fractions (0-1) of the diagram,
-- k is 'scratch', 'dent' or 'broken'. Up to 60 marks. Older complaints have none.

alter table public.complaints
  add column if not exists car_marks jsonb not null default '[]'
    check (jsonb_typeof(car_marks) = 'array' and jsonb_array_length(car_marks) <= 60);

create or replace function public.complaints_check_car_marks()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from jsonb_array_elements(new.car_marks) m
    where jsonb_typeof(m->'x') is distinct from 'number'
       or jsonb_typeof(m->'y') is distinct from 'number'
       or (m->>'x')::numeric not between 0 and 1
       or (m->>'y')::numeric not between 0 and 1
       or coalesce(m->>'k', '') not in ('scratch', 'dent', 'broken')
  ) then
    raise exception 'A mark on the car diagram is not valid.' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists complaints_check_car_marks on public.complaints;
create trigger complaints_check_car_marks
  before insert or update on public.complaints
  for each row execute function public.complaints_check_car_marks();

-- restore_backup(): same as 0032, plus the marks on each restored complaint's car diagram.
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
    if v_id is not null and not (v_id = any(v_before_c)) and jsonb_typeof(e->'car_marks') = 'array' then
      begin
        update public.complaints set car_marks = e->'car_marks' where id = v_id and shop_id = v_shop;
      exception when others then
        null;
      end;
    end if;
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
