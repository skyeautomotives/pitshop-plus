-- Workshops sign up with their email (confirmed by a link Supabase emails them).
-- Run in Supabase -> SQL Editor after 0011.
--
-- The Register page calls Supabase Auth signUp() with the workshop details in
-- the user's metadata. When that login is created, the trigger below creates
-- the workshop, its settings and the owner's staff row in the same
-- transaction. Logins without a workshop name in their metadata (staff added
-- by the owner through manage-staff) are left alone.
--
-- Owners sign in with their email. Staff added by the owner keep signing in
-- with a username. Every staff row still has a username; an owner's is made
-- from their email.

-- A free username based on `base` (e.g. "ravi.motors", "ravi.motors2", ...).
create or replace function public.unique_username(base text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  b text := regexp_replace(lower(coalesce(base, '')), '[^a-z0-9._-]', '', 'g');
  candidate text;
  n int := 1;
begin
  b := regexp_replace(b, '^[^a-z0-9]+', '');
  if length(b) < 3 then
    b := rpad(coalesce(nullif(b, ''), 'shop'), 3, '0');
  end if;
  b := left(b, 25);
  candidate := b;
  while exists (select 1 from public.staff where username = candidate) loop
    n := n + 1;
    candidate := b || n;
  end loop;
  return candidate;
end;
$$;

-- Creates the workshop, its settings and the owner row. Shared by the signup
-- trigger and create_shop().
create or replace function public.create_shop_for(
  p_user uuid,
  p_email text,
  p_username text,
  p_full_name text,
  p_shop_name text,
  p_phone text default null,
  p_address text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop uuid;
begin
  if length(btrim(coalesce(p_shop_name, ''))) not between 1 and 100 then
    raise exception 'Enter the workshop name (up to 100 characters).' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_full_name, ''))) not between 1 and 100 then
    raise exception 'Enter your name (up to 100 characters).' using errcode = '22023';
  end if;

  insert into public.shops default values returning id into v_shop;

  insert into public.shop_settings (shop_id, shop_name, phone, address)
  values (v_shop, btrim(p_shop_name), nullif(btrim(coalesce(p_phone, '')), ''), nullif(btrim(coalesce(p_address, '')), ''));

  insert into public.staff (user_id, shop_id, email, username, full_name, role)
  values (p_user, v_shop, p_email, p_username, btrim(p_full_name), 'owner');

  return v_shop;
end;
$$;

revoke all on function public.create_shop_for(uuid, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.unique_username(text) from public, anon, authenticated;

-- create_shop() (used by the old register-shop function) now goes through create_shop_for().
create or replace function public.create_shop(
  p_user uuid,
  p_username text,
  p_full_name text,
  p_shop_name text,
  p_phone text default null,
  p_address text default null
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.create_shop_for(p_user, p_username || '@pitstop.invalid', p_username, p_full_name, p_shop_name, p_phone, p_address);
$$;

-- New login from the Register page -> new workshop.
create or replace function public.handle_new_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if coalesce(btrim(meta ->> 'shop_name'), '') = '' then
    return new; -- not a workshop signup (e.g. staff added by an owner)
  end if;
  if exists (select 1 from public.staff where user_id = new.id) then
    return new;
  end if;
  perform public.create_shop_for(
    new.id,
    new.email,
    public.unique_username(split_part(new.email, '@', 1)),
    meta ->> 'full_name',
    meta ->> 'shop_name',
    meta ->> 'phone',
    meta ->> 'address'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_shop on auth.users;
create trigger on_auth_user_created_shop
  after insert on auth.users
  for each row execute function public.handle_new_signup();
