-- Credit on bills. Run after 0027.
--
-- When a customer doesn't pay in full, the workshop can give credit: the
-- balance is due by a date, with an optional note. The dashboard lists credit
-- that is due so staff can send a reminder; credit_reminded_on is the last time.
-- Written only through set_bill_credit(), for the caller's own workshop.

alter table public.bills
  add column if not exists credit_due_on date,
  add column if not exists credit_note text check (credit_note is null or length(credit_note) <= 200),
  add column if not exists credit_reminded_on date;

-- p_credit keys (each optional; a key that is present is set, null clears it):
--   due_on, note, reminded_on
create or replace function public.set_bill_credit(p_bill uuid, p_credit jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop uuid := public.my_shop_id();
  v_due date;
  v_reminded date;
  v_note text;
begin
  if v_shop is null then
    raise exception 'Your login is not set up for a workshop.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_credit) is distinct from 'object' then
    raise exception 'This credit is not valid.' using errcode = '22023';
  end if;
  begin
    v_due := nullif(p_credit->>'due_on', '')::date;
    v_reminded := nullif(p_credit->>'reminded_on', '')::date;
  exception when others then
    raise exception 'Choose a valid date.' using errcode = '22023';
  end;
  v_note := nullif(btrim(coalesce(p_credit->>'note', '')), '');
  if length(coalesce(v_note, '')) > 200 then
    raise exception 'Keep the note under 200 characters.' using errcode = '22023';
  end if;
  if v_reminded is not null and v_reminded > current_date + 1 then
    raise exception 'The reminder date can''t be in the future.' using errcode = '22023';
  end if;

  update public.bills set
    credit_due_on = case when p_credit ? 'due_on' then v_due else credit_due_on end,
    credit_note = case when p_credit ? 'due_on' and v_due is null then null
                       when p_credit ? 'note' then v_note else credit_note end,
    credit_reminded_on = case when p_credit ? 'due_on' and v_due is null then null
                              when p_credit ? 'reminded_on' then v_reminded else credit_reminded_on end
  where id = p_bill and shop_id = v_shop;
  if not found then
    raise exception 'Bill not found.' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.set_bill_credit(uuid, jsonb) from public, anon;
grant execute on function public.set_bill_credit(uuid, jsonb) to authenticated;

-- restore_backup(): same as 0026, plus each restored bill's credit.
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
