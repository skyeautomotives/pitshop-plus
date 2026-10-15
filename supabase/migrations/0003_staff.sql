-- Staff logins and roles. Only people listed in `staff` can use the app.
-- Run in Supabase -> SQL Editor after 0002.
--
--   owner: everything, plus Settings and adding/removing logins
--   staff: create, edit, search and print bills
--
-- Logins are added and removed by the `manage-staff` Edge Function, which
-- holds the service-role key server-side.

create table public.staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '' check (length(full_name) <= 100),
  role text not null default 'staff' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now()
);

-- Everyone who already has a login becomes staff; the earliest one is the owner.
insert into public.staff (user_id, email, role)
select id, coalesce(email, ''),
       case when row_number() over (order by created_at) = 1 then 'owner' else 'staff' end
from auth.users;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff where user_id = auth.uid());
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff where user_id = auth.uid() and role = 'owner');
$$;

revoke all on function public.is_staff() from public, anon;
revoke all on function public.is_owner() from public, anon;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_owner() to authenticated;

-- Each person can see their own row; the owner can see everyone.
-- No insert/update/delete policies: changes only go through the Edge Function.
alter table public.staff enable row level security;
create policy "read own staff row, owner reads all" on public.staff
  for select to authenticated using (user_id = auth.uid() or public.is_owner());

-- Limit existing access from "any signed-in user" to listed staff.
drop policy "staff read bills" on public.bills;
create policy "staff read bills" on public.bills for select to authenticated using (public.is_staff());

drop policy "staff read bill items" on public.bill_items;
create policy "staff read bill items" on public.bill_items for select to authenticated using (public.is_staff());

drop policy "staff read settings" on public.shop_settings;
create policy "staff read settings" on public.shop_settings for select to authenticated using (public.is_staff());

drop policy "staff update settings" on public.shop_settings;
create policy "owner updates settings" on public.shop_settings
  for update to authenticated using (public.is_owner()) with check (public.is_owner());

-- save_bill() runs with elevated rights, so check staff membership on every bill write.
-- (Writes from the SQL editor have no signed-in user and are allowed.)
create or replace function public.require_staff()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_staff() then
    raise exception 'Your login is not set up as workshop staff. Ask the owner to add you.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger bills_require_staff
  before insert or update on public.bills
  for each row execute function public.require_staff();
