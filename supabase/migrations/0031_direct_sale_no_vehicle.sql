-- Direct sale bills without a vehicle number. Run after 0030.
--
-- Parts sold over the counter have no vehicle. A bill may now have an empty
-- vehicle number, but only when it is a direct sale.

do $$
declare
  c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.bills'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%vehicle_reg%'
  loop
    execute format('alter table public.bills drop constraint %I', c);
  end loop;
end;
$$;

alter table public.bills add constraint bills_vehicle_reg_check
  check (btrim(vehicle_reg) = '' or length(btrim(vehicle_reg)) between 4 and 20);

-- save_bill(): same as 0030, plus the vehicle number check.
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
  -- Only a direct sale may leave out the vehicle number.
  if btrim(coalesce(p_bill->>'vehicle_reg', '')) = ''
     and not coalesce((p_bill->>'direct_sale')::boolean, false)
     and not exists (select 1 from public.bills
                     where id = coalesce(p_id, p_new_id) and shop_id = public.my_shop_id() and direct_sale) then
    raise exception 'Enter the vehicle number.' using errcode = '22023';
  end if;

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
