-- GST bills (tax invoices) for GST-registered workshops. Workshops without GST keep plain bills.
-- Run in Supabase -> SQL Editor after 0025.

-- ---------- Workshop: GST registration ----------
alter table public.shop_settings
  add column if not exists gst_enabled boolean not null default false,
  add column if not exists gstin text,
  add column if not exists gst_inclusive boolean not null default false;

alter table public.shop_settings drop constraint if exists shop_settings_gstin_check;
alter table public.shop_settings add constraint shop_settings_gstin_check
  check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$');
alter table public.shop_settings drop constraint if exists shop_settings_gst_needs_gstin;
alter table public.shop_settings add constraint shop_settings_gst_needs_gstin
  check (not gst_enabled or gstin is not null);

-- ---------- Bills and their lines ----------
-- gst_mode: null = plain bill; 'exclusive' = prices typed before GST; 'inclusive' = prices include GST.
alter table public.bills
  add column if not exists gst_mode text check (gst_mode in ('exclusive', 'inclusive')),
  add column if not exists gstin text,
  add column if not exists customer_gstin text
    check (customer_gstin is null or customer_gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  add column if not exists service_gst_rate smallint check (service_gst_rate in (0, 5, 12, 18, 28, 40)),
  add column if not exists service_taxable numeric(12,2),
  add column if not exists service_gst numeric(12,2),
  add column if not exists taxable_total numeric(12,2),
  add column if not exists gst_total numeric(12,2);

alter table public.bill_items
  add column if not exists gst_rate smallint check (gst_rate in (0, 5, 12, 18, 28, 40)),
  add column if not exists hsn text check (hsn is null or hsn ~ '^[0-9]{4,8}$'),
  add column if not exists taxable_value numeric(12,2),
  add column if not exists gst_amount numeric(12,2);

-- ---------- The GST sums (the app works them out the same way) ----------
-- The discount is shared across the lines in proportion to their amounts (items in order, then
-- labour, painting and washing together as one service line, which takes what is left over).
-- Each line's GST is then worked out on what is left of it.
create or replace function public.apply_bill_gst(p_bill uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bills%rowtype;
  r record;
  v_services numeric(12,2);
  v_gross numeric(12,2);
  v_last uuid;
  v_shared numeric(12,2) := 0;
  v_share numeric(12,2);
  v_net numeric(12,2);
  v_taxable numeric(12,2);
  v_tax numeric(12,2);
  v_taxable_total numeric(12,2) := 0;
  v_gst_total numeric(12,2) := 0;
begin
  select * into b from public.bills where id = p_bill;
  if not found then
    return;
  end if;

  if b.gst_mode is null then
    update public.bill_items set taxable_value = null, gst_amount = null where bill_id = p_bill;
    update public.bills
    set service_gst_rate = null, service_taxable = null, service_gst = null, taxable_total = null, gst_total = null,
        grand_total = items_subtotal + labour_charge + coalesce(painting_charge, 0) + coalesce(washing_charge, 0) - discount
    where id = p_bill;
    return;
  end if;

  v_services := b.labour_charge + coalesce(b.painting_charge, 0) + coalesce(b.washing_charge, 0);
  v_gross := b.items_subtotal + v_services;
  if v_services = 0 then
    select id into v_last from public.bill_items where bill_id = p_bill order by position desc limit 1;
  end if;

  for r in
    select id, line_total, coalesce(gst_rate, 18) as rate
    from public.bill_items where bill_id = p_bill order by position
  loop
    if r.id = v_last then
      v_share := b.discount - v_shared;
    elsif v_gross > 0 then
      v_share := round(b.discount * r.line_total / v_gross, 2);
    else
      v_share := 0;
    end if;
    v_shared := v_shared + v_share;
    v_net := greatest(r.line_total - v_share, 0);
    if b.gst_mode = 'exclusive' then
      v_taxable := v_net;
      v_tax := round(v_net * r.rate / 100, 2);
    else
      v_taxable := round(v_net * 100 / (100 + r.rate), 2);
      v_tax := v_net - v_taxable;
    end if;
    update public.bill_items set taxable_value = v_taxable, gst_amount = v_tax where id = r.id;
    v_taxable_total := v_taxable_total + v_taxable;
    v_gst_total := v_gst_total + v_tax;
  end loop;

  if v_services > 0 then
    v_net := greatest(v_services - (b.discount - v_shared), 0);
    if b.gst_mode = 'exclusive' then
      v_taxable := v_net;
      v_tax := round(v_net * coalesce(b.service_gst_rate, 18) / 100, 2);
    else
      v_taxable := round(v_net * 100 / (100 + coalesce(b.service_gst_rate, 18)), 2);
      v_tax := v_net - v_taxable;
    end if;
  else
    v_taxable := 0;
    v_tax := 0;
  end if;

  update public.bills
  set service_gst_rate = coalesce(service_gst_rate, 18),
      service_taxable = v_taxable,
      service_gst = v_tax,
      taxable_total = v_taxable_total + v_taxable,
      gst_total = v_gst_total + v_tax,
      grand_total = v_taxable_total + v_taxable + v_gst_total + v_tax
  where id = p_bill;
end;
$$;

revoke all on function public.apply_bill_gst(uuid) from public, anon, authenticated;

-- Copies the GST choices sent with a bill onto the saved bill, then works out the sums.
create or replace function public.set_bill_gst(p_bill uuid, p_shop uuid, p_bill_json jsonb, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text := nullif(p_bill_json->>'gst_mode', '');
  v_customer_gstin text := nullif(upper(btrim(coalesce(p_bill_json->>'customer_gstin', ''))), '');
  v_rate smallint := coalesce(nullif(p_bill_json->>'service_gst_rate', '')::smallint, 18);
  v_shop_gstin text;
  v_enabled boolean;
begin
  if v_mode is not null then
    if v_mode not in ('exclusive', 'inclusive') then
      raise exception 'Unknown GST choice.' using errcode = '22023';
    end if;
    select gstin, gst_enabled into v_shop_gstin, v_enabled from public.shop_settings where shop_id = p_shop;
    if not coalesce(v_enabled, false) or v_shop_gstin is null then
      raise exception 'Turn on GST and add your GSTIN in Settings first.' using errcode = '22023';
    end if;
    if v_rate not in (0, 5, 12, 18, 28, 40) then
      raise exception 'Choose a GST rate of 0, 5, 12, 18, 28 or 40%%.' using errcode = '22023';
    end if;
    if v_customer_gstin is not null and v_customer_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' then
      raise exception 'The customer GSTIN is not valid.' using errcode = '22023';
    end if;
  end if;

  update public.bills
  set gst_mode = v_mode,
      gstin = case when v_mode is null then null else coalesce(gstin, v_shop_gstin) end,
      customer_gstin = case when v_mode is null then null else v_customer_gstin end,
      service_gst_rate = case when v_mode is null then null else v_rate end
  where id = p_bill;

  -- Item lines are saved in the order sent, so line n is position n - 1.
  update public.bill_items bi
  set gst_rate = case when v_mode is null then null else coalesce(nullif(t.i->>'gst_rate', '')::smallint, 18) end,
      hsn = nullif(btrim(coalesce(t.i->>'hsn', '')), '')
  from jsonb_array_elements(coalesce(p_items, '[]')) with ordinality as t(i, ord)
  where bi.bill_id = p_bill and bi.position = t.ord - 1;

  perform public.apply_bill_gst(p_bill);
end;
$$;

revoke all on function public.set_bill_gst(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;

-- ---------- Saving a bill: the old save, then the GST ----------
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'save_bill') and
     not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'save_bill_core') then
    alter function public.save_bill(jsonb, jsonb, uuid, uuid[], uuid) rename to save_bill_core;
  end if;
end;
$$;

revoke all on function public.save_bill_core(jsonb, jsonb, uuid, uuid[], uuid) from public, anon, authenticated;

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
  return v_id;
end;
$$;

revoke all on function public.save_bill(jsonb, jsonb, uuid, uuid[], uuid) from public, anon;
grant execute on function public.save_bill(jsonb, jsonb, uuid, uuid[], uuid) to authenticated;

-- ---------- Restoring a backup: the old restore, then the GST of the bills it brought back ----------
do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'restore_backup_core') then
    alter function public.restore_backup(jsonb, jsonb, jsonb) rename to restore_backup_core;
  end if;
end;
$$;

revoke all on function public.restore_backup_core(jsonb, jsonb, jsonb) from public, anon, authenticated;

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
