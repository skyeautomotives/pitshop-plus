-- Who did what: complaints record the signed-in staff member automatically,
-- and staff names can be edited. Run in Supabase -> SQL Editor after 0006.
--
-- Bills already record their creator in bills.created_by (default auth.uid()).

alter table public.complaints
  add column if not exists attended_by_user uuid references auth.users(id) on delete set null;

create index if not exists complaints_attended_by_user_idx on public.complaints (attended_by_user);
create index if not exists bills_created_by_idx on public.bills (created_by);

-- Link earlier complaints whose typed name matches exactly one staff member.
update public.complaints k
set attended_by_user = s.user_id
from public.staff s
where k.attended_by_user is null
  and s.full_name <> ''
  and lower(btrim(k.attended_by)) = lower(btrim(s.full_name))
  and (select count(*) from public.staff s2 where lower(btrim(s2.full_name)) = lower(btrim(s.full_name))) = 1;

-- Name shown for a staff member: their name, or the part of their email before @.
create or replace function public.staff_display_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(btrim(s.full_name), ''), split_part(s.email, '@', 1))
  from public.staff s
  where s.user_id = p_user;
$$;
revoke all on function public.staff_display_name(uuid) from public, anon;
grant execute on function public.staff_display_name(uuid) to authenticated;

-- New complaints are attended by whoever is signed in; the browser can't choose.
create or replace function public.complaint_set_attended_by()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.attended_by_user := auth.uid();
    new.attended_by := coalesce(public.staff_display_name(auth.uid()), new.attended_by);
  end if;
  return new;
end;
$$;

drop trigger if exists complaints_set_attended_by on public.complaints;
create trigger complaints_set_attended_by
  before insert on public.complaints
  for each row execute function public.complaint_set_attended_by();

-- Editing a complaint never changes who attended it.
create or replace function public.complaint_keep_attended_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- set_staff_name() sets this flag while it renames past complaints.
  if current_setting('app.renaming_staff', true) = 'on' then
    return new;
  end if;
  if auth.uid() is not null then
    new.attended_by := old.attended_by;
    new.attended_by_user := old.attended_by_user;
  end if;
  return new;
end;
$$;

drop trigger if exists complaints_keep_attended_by on public.complaints;
create trigger complaints_keep_attended_by
  before update on public.complaints
  for each row execute function public.complaint_keep_attended_by();

-- Owners can rename anyone; staff can rename themselves. Past complaints follow the new name.
create or replace function public.set_staff_name(p_user uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
begin
  if not (public.is_owner() or p_user = auth.uid()) then
    raise exception 'Only the owner can rename other staff.' using errcode = '42501';
  end if;
  if length(v_name) not between 1 and 100 then
    raise exception 'Enter a name (up to 100 characters).' using errcode = '22023';
  end if;
  update public.staff set full_name = v_name where user_id = p_user;
  if not found then
    raise exception 'Staff member not found.' using errcode = 'P0002';
  end if;
  -- Let the keep-attended-by trigger through for this rename only (flag lasts until the transaction ends).
  perform set_config('app.renaming_staff', 'on', true);
  update public.complaints set attended_by = v_name where attended_by_user = p_user;
  perform set_config('app.renaming_staff', 'off', true);
end;
$$;
revoke all on function public.set_staff_name(uuid, text) from public, anon;
grant execute on function public.set_staff_name(uuid, text) to authenticated;
