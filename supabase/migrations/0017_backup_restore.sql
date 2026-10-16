-- Backups kept by the workshop owner, and restoring them.
-- Run in Supabase -> SQL Editor after 0016.
--
-- The app saves a backup file (bills, complaints, shop details) that the owner
-- keeps on their computer, phone or Google Drive. Restoring a file only adds what
-- is missing: records already in the workshop are never changed, and nothing is
-- deleted. Bills and complaints keep their ids and numbers; if a number has since
-- been given to another record, the restored one gets the next number after
-- the highest in use.

alter table public.shops add column if not exists last_backup_at timestamptz;

-- ---------------------------------------------------------------------------
-- Numbering: a restore may keep the record's original number.

create or replace function public.bills_assign_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.shop_id := coalesce(new.shop_id, public.my_shop_id());
  if new.shop_id is null then
    raise exception 'Your login is not set up for a workshop.' using errcode = '42501';
  end if;
  if new.bill_number is not null and current_setting('pitstop.restoring', true) = 'on' then
    update public.shops set last_bill_number = greatest(last_bill_number, new.bill_number)
    where id = new.shop_id;
  else
    -- The row lock on the shop keeps two bills from getting the same number.
    update public.shops set last_bill_number = last_bill_number + 1
    where id = new.shop_id
    returning last_bill_number into new.bill_number;
  end if;
  return new;
end;
$$;

create or replace function public.complaints_assign_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.shop_id := coalesce(new.shop_id, public.my_shop_id());
  if new.shop_id is null then
    raise exception 'Your login is not set up for a workshop.' using errcode = '42501';
  end if;
  if new.complaint_number is not null and current_setting('pitstop.restoring', true) = 'on' then
    update public.shops set last_complaint_number = greatest(last_complaint_number, new.complaint_number)
    where id = new.shop_id;
  else
    update public.shops set last_complaint_number = last_complaint_number + 1
    where id = new.shop_id
    returning last_complaint_number into new.complaint_number;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Backup status

-- When the owner last saved a backup, and whether there is anything to back up.
create or replace function public.backup_status()
returns table (last_backup_at timestamptz, shop_created_at timestamptz, bills bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select s.last_backup_at, s.created_at,
         (select count(*) from public.bills b where b.shop_id = s.id)
  from public.shops s
  where s.id = public.my_shop_id();
$$;
revoke all on function public.backup_status() from public, anon;
grant execute on function public.backup_status() to authenticated;

create or replace function public.record_backup()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop uuid := public.my_shop_id();
  v_at timestamptz;
begin
  if v_shop is null or not public.is_owner() then
    raise exception 'Only the workshop owner can make backups.' using errcode = '42501';
  end if;
  update public.shops set last_backup_at = now() where id = v_shop returning last_backup_at into v_at;
  return v_at;
end;
$$;
revoke all on function public.record_backup() from public, anon;
grant execute on function public.record_backup() to authenticated;

-- ---------------------------------------------------------------------------
-- Restore

-- A login id from a backup, if that login still exists (otherwise null).
create or replace function public.backup_known_user(p text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id from auth.users u where u.id::text = p;
$$;
revoke all on function public.backup_known_user(text) from public, anon, authenticated;

create or replace function public.restore_require_owner()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_shop uuid := public.my_shop_id();
begin
  if auth.uid() is null then
    raise exception 'Please sign in again.' using errcode = '42501';
  end if;
  if v_shop is null or not public.is_owner() then
    raise exception 'Only the workshop owner can restore a backup.' using errcode = '42501';
  end if;
  return v_shop;
end;
$$;
revoke all on function public.restore_require_owner() from public, anon, authenticated;

-- What a restore would do, without changing anything.
-- p_bills / p_complaints: [{ "id": uuid, "number": bigint|null }, ...]
create or replace function public.restore_backup_check(p_bills jsonb, p_complaints jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_shop uuid := public.restore_require_owner();
  v_bills jsonb;
  v_complaints jsonb;
begin
  if jsonb_typeof(coalesce(p_bills, '[]')) <> 'array' or jsonb_typeof(coalesce(p_complaints, '[]')) <> 'array' then
    raise exception 'This backup file is damaged.' using errcode = '22023';
  end if;

  with r as (
    select (e->>'id')::uuid as id, nullif(e->>'number', '')::bigint as num
    from jsonb_array_elements(coalesce(p_bills, '[]')) e
  ), c as (
    select r.*, b.shop_id as found_shop from r left join public.bills b on b.id = r.id
  )
  select jsonb_build_object(
    'total', count(*),
    'missing', count(*) filter (where found_shop is null),
    'present', count(*) filter (where found_shop = v_shop),
    'other', count(*) filter (where found_shop is not null and found_shop <> v_shop),
    'renumbered', count(*) filter (where found_shop is null and num is not null
      and exists (select 1 from public.bills x where x.shop_id = v_shop and x.bill_number = c.num)))
  into v_bills from c;

  with r as (
    select (e->>'id')::uuid as id, nullif(e->>'number', '')::bigint as num
    from jsonb_array_elements(coalesce(p_complaints, '[]')) e
  ), c as (
    select r.*, x.shop_id as found_shop from r left join public.complaints x on x.id = r.id
  )
  select jsonb_build_object(
    'total', count(*),
    'missing', count(*) filter (where found_shop is null),
    'present', count(*) filter (where found_shop = v_shop),
    'other', count(*) filter (where found_shop is not null and found_shop <> v_shop),
    'renumbered', count(*) filter (where found_shop is null and num is not null
      and exists (select 1 from public.complaints x where x.shop_id = v_shop and x.complaint_number = c.num)))
  into v_complaints from c;

  return jsonb_build_object('bills', v_bills, 'complaints', v_complaints);
end;
$$;
revoke all on function public.restore_backup_check(jsonb, jsonb) from public, anon;
grant execute on function public.restore_backup_check(jsonb, jsonb) to authenticated;

-- Adds the bills and complaints from a backup that are missing from the caller's
-- workshop. Never changes or deletes existing records. Shop details are only
-- filled in where they are blank. The app sends large backups in parts
-- (complaints first, so bills can link to them).
create or replace function public.restore_backup(p_bills jsonb, p_complaints jsonb, p_settings jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop uuid := public.restore_require_owner();
  e jsonb;
  i jsonb;
  v_id uuid;
  v_num bigint;
  v_renumbered boolean;
  v_subtotal numeric(12,2);
  v_gross numeric(12,2);
  v_discount numeric(12,2);
  v_settings boolean := false;
  b_added int := 0; b_present int := 0; b_other int := 0; b_renum int := 0; b_failed int := 0;
  c_added int := 0; c_present int := 0; c_other int := 0; c_renum int := 0; c_failed int := 0;
  v_links int := 0;
  v_n int;
  v_error text;
begin
  if jsonb_typeof(coalesce(p_bills, '[]')) <> 'array' or jsonb_typeof(coalesce(p_complaints, '[]')) <> 'array' then
    raise exception 'This backup file is damaged.' using errcode = '22023';
  end if;
  perform set_config('pitstop.restoring', 'on', true);

  -- Complaints first, so bills can link to them.
  for e in
    select x from jsonb_array_elements(coalesce(p_complaints, '[]')) x
    order by nullif(x->>'complaint_number', '')::bigint nulls last
  loop
    begin
      v_id := (e->>'id')::uuid;
      if exists (select 1 from public.complaints where id = v_id) then
        if exists (select 1 from public.complaints where id = v_id and shop_id = v_shop) then
          c_present := c_present + 1;
        else
          c_other := c_other + 1;
        end if;
        continue;
      end if;
      v_num := nullif(e->>'complaint_number', '')::bigint;
      v_renumbered := v_num is not null
        and exists (select 1 from public.complaints where shop_id = v_shop and complaint_number = v_num);
      if v_renumbered then
        select greatest(s.last_complaint_number, coalesce(max(x.complaint_number), 0)) + 1 into v_num
        from public.shops s left join public.complaints x on x.shop_id = s.id
        where s.id = v_shop group by s.last_complaint_number;
      end if;
      insert into public.complaints (id, shop_id, complaint_number, customer_name, address, phone, vehicle_reg,
                                     description, reported_on, attended_by, attended_by_user, notes, status,
                                     created_by, created_at, updated_at)
      values (v_id, v_shop, v_num, btrim(e->>'customer_name'), nullif(btrim(e->>'address'), ''), btrim(e->>'phone'),
              upper(btrim(e->>'vehicle_reg')), btrim(e->>'description'), (e->>'reported_on')::date,
              coalesce(nullif(btrim(e->>'attended_by'), ''), 'Not recorded'),
              public.backup_known_user(e->>'attended_by_user'), nullif(btrim(e->>'notes'), ''),
              coalesce(e->>'status', 'open'), public.backup_known_user(e->>'created_by'),
              coalesce(nullif(e->>'created_at', '')::timestamptz, now()), now());
      c_added := c_added + 1;
      if v_renumbered then
        c_renum := c_renum + 1;
      end if;
    exception when others then
      c_failed := c_failed + 1;
      v_error := coalesce(v_error, sqlerrm);
    end;
  end loop;

  -- Bills, oldest number first, with their items and complaint links.
  for e in
    select x from jsonb_array_elements(coalesce(p_bills, '[]')) x
    order by nullif(x->>'bill_number', '')::bigint nulls last
  loop
    begin
      v_id := (e->>'id')::uuid;
      if exists (select 1 from public.bills where id = v_id) then
        if exists (select 1 from public.bills where id = v_id and shop_id = v_shop) then
          b_present := b_present + 1;
        else
          b_other := b_other + 1;
        end if;
        continue;
      end if;
      if jsonb_typeof(coalesce(e->'bill_items', '[]')) <> 'array' then
        raise exception 'Bill items must be a list.';
      end if;
      v_num := nullif(e->>'bill_number', '')::bigint;
      v_renumbered := v_num is not null
        and exists (select 1 from public.bills where shop_id = v_shop and bill_number = v_num);
      if v_renumbered then
        select greatest(s.last_bill_number, coalesce(max(x.bill_number), 0)) + 1 into v_num
        from public.shops s left join public.bills x on x.shop_id = s.id
        where s.id = v_shop group by s.last_bill_number;
      end if;

      -- Totals are worked out again from the items, as save_bill() does.
      select coalesce(sum(round(coalesce(nullif(x->>'quantity', '')::numeric, 1) * (x->>'price')::numeric(12,2), 2)), 0)
      into v_subtotal
      from jsonb_array_elements(coalesce(e->'bill_items', '[]')) x;
      v_gross := v_subtotal + (e->>'labour_charge')::numeric(12,2)
        + coalesce(nullif(e->>'painting_charge', '')::numeric(12,2), 0)
        + coalesce(nullif(e->>'washing_charge', '')::numeric(12,2), 0);
      v_discount := least(coalesce(nullif(e->>'discount', '')::numeric(12,2), 0), v_gross);

      insert into public.bills (id, shop_id, bill_number, customer_name, address, phone, vehicle_reg,
                                date_received, expected_pickup, delivered_on, labour_charge, painting_charge,
                                washing_charge, items_subtotal, discount, discount_percent, grand_total,
                                created_by, created_at, updated_at)
      values (v_id, v_shop, v_num, btrim(e->>'customer_name'), nullif(btrim(e->>'address'), ''), btrim(e->>'phone'),
              upper(btrim(e->>'vehicle_reg')), (e->>'date_received')::date,
              nullif(e->>'expected_pickup', '')::date,
              coalesce(nullif(e->>'delivered_on', '')::date, (e->>'date_received')::date),
              (e->>'labour_charge')::numeric(12,2), nullif(e->>'painting_charge', '')::numeric(12,2),
              nullif(e->>'washing_charge', '')::numeric(12,2), v_subtotal, v_discount,
              case when v_discount > 0 then nullif(e->>'discount_percent', '')::numeric(5,2) end,
              v_gross - v_discount, public.backup_known_user(e->>'created_by'),
              coalesce(nullif(e->>'created_at', '')::timestamptz, now()), now());

      insert into public.bill_items (bill_id, position, description, quantity, price, line_total)
      select v_id, coalesce(nullif(x->>'position', '')::int, (o - 1)::int), btrim(x->>'description'),
             coalesce(nullif(x->>'quantity', '')::numeric, 1), (x->>'price')::numeric(12,2),
             round(coalesce(nullif(x->>'quantity', '')::numeric, 1) * (x->>'price')::numeric(12,2), 2)
      from jsonb_array_elements(coalesce(e->'bill_items', '[]')) with ordinality as t(x, o);

      insert into public.bill_complaints (bill_id, complaint_id)
      select v_id, c.id
      from jsonb_array_elements_text(coalesce(e->'complaint_ids', '[]')) as l(cid)
      join public.complaints c on c.id::text = l.cid and c.shop_id = v_shop
      on conflict do nothing;
      get diagnostics v_n = row_count;
      v_links := v_links + v_n;

      b_added := b_added + 1;
      if v_renumbered then
        b_renum := b_renum + 1;
      end if;
    exception when others then
      b_failed := b_failed + 1;
      v_error := coalesce(v_error, sqlerrm);
    end;
  end loop;

  -- Shop details: only fill in what is blank.
  if jsonb_typeof(p_settings) = 'object' then
    update public.shop_settings set
      shop_name = case when btrim(shop_name) = '' then coalesce(nullif(btrim(p_settings->>'shop_name'), ''), shop_name) else shop_name end,
      address = coalesce(nullif(btrim(address), ''), nullif(btrim(p_settings->>'address'), '')),
      phone = coalesce(nullif(btrim(phone), ''), nullif(btrim(p_settings->>'phone'), ''))
    where shop_id = v_shop
      and ((btrim(shop_name) = '' and nullif(btrim(p_settings->>'shop_name'), '') is not null)
        or (nullif(btrim(address), '') is null and nullif(btrim(p_settings->>'address'), '') is not null)
        or (nullif(btrim(phone), '') is null and nullif(btrim(p_settings->>'phone'), '') is not null));
    v_settings := found;
  end if;

  return jsonb_build_object(
    'bills', jsonb_build_object('added', b_added, 'present', b_present, 'other', b_other, 'renumbered', b_renum, 'failed', b_failed),
    'complaints', jsonb_build_object('added', c_added, 'present', c_present, 'other', c_other, 'renumbered', c_renum, 'failed', c_failed),
    'links', v_links,
    'settings', v_settings,
    'error', v_error);
end;
$$;
revoke all on function public.restore_backup(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.restore_backup(jsonb, jsonb, jsonb) to authenticated;
