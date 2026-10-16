-- Vehicle intake details on complaints. Run in Supabase -> SQL Editor after 0018.
--
-- When a vehicle comes in, the complaint can now record:
--   vehicle_name     e.g. "Honda Activa 6G" (free text)
--   odometer_km      km driven, as shown on the odometer
--   helmets          helmets left with the vehicle: 0, 1 or 2 (null on older complaints)
--   documents        papers left with the vehicle: 'rc' (registration certificate book),
--                    'pollution' (pollution certificate), 'licence'
--   other_documents  anything else left with the vehicle, typed by staff
--   advance_amount   advance payment received (rupees), and advance_method (how it was paid)
--
-- Bills that address the complaint show the advance and the balance still to pay;
-- the bill's own total is unchanged. All new columns are optional, so complaints
-- saved by older versions of the app keep working.
-- restore_backup() is updated so restoring a backup keeps these details.

alter table public.complaints
  add column if not exists vehicle_name text check (vehicle_name is null or length(btrim(vehicle_name)) between 1 and 100),
  add column if not exists odometer_km integer check (odometer_km is null or odometer_km between 0 and 9999999),
  add column if not exists helmets smallint check (helmets is null or helmets between 0 and 2),
  add column if not exists documents text[] not null default '{}'
    check (documents <@ array['rc', 'pollution', 'licence']::text[]),
  add column if not exists other_documents text[] not null default '{}'
    check (cardinality(other_documents) <= 10),
  add column if not exists advance_amount numeric(12,2) check (advance_amount is null or advance_amount > 0),
  add column if not exists advance_method text check (advance_method is null or advance_method in ('cash', 'upi', 'card', 'bank', 'other'));

-- Each other document is 1-60 characters, and an advance needs a payment method.
create or replace function public.complaints_check_intake()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from unnest(new.other_documents) d where length(btrim(d)) not between 1 and 60) then
    raise exception 'Each other document must be 1-60 characters.' using errcode = '22023';
  end if;
  if new.advance_amount is null then
    new.advance_method := null;
  elsif new.advance_method is null then
    raise exception 'Choose how the advance was paid.' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists complaints_check_intake on public.complaints;
create trigger complaints_check_intake
  before insert or update on public.complaints
  for each row execute function public.complaints_check_intake();

-- restore_backup(): same as 0017, plus the new complaint columns.
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
                                     created_by, created_at, updated_at,
                                     vehicle_name, odometer_km, helmets, documents, other_documents,
                                     advance_amount, advance_method)
      values (v_id, v_shop, v_num, btrim(e->>'customer_name'), nullif(btrim(e->>'address'), ''), btrim(e->>'phone'),
              upper(btrim(e->>'vehicle_reg')), btrim(e->>'description'), (e->>'reported_on')::date,
              coalesce(nullif(btrim(e->>'attended_by'), ''), 'Not recorded'),
              public.backup_known_user(e->>'attended_by_user'), nullif(btrim(e->>'notes'), ''),
              coalesce(e->>'status', 'open'), public.backup_known_user(e->>'created_by'),
              coalesce(nullif(e->>'created_at', '')::timestamptz, now()), now(),
              nullif(btrim(e->>'vehicle_name'), ''), nullif(e->>'odometer_km', '')::integer,
              nullif(e->>'helmets', '')::smallint,
              coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(e->'documents') = 'array' then e->'documents' end)), '{}'),
              coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(e->'other_documents') = 'array' then e->'other_documents' end)), '{}'),
              nullif(e->>'advance_amount', '')::numeric, nullif(e->>'advance_method', ''));
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
