-- Sign in with a username instead of an email.
-- Run in Supabase -> SQL Editor after 0007.
--
-- Supabase Auth signs in by email, so each login's email becomes
-- <username>@pitstop.invalid. The ".invalid" top-level domain is reserved
-- (RFC 2606) and can never receive mail, so these addresses can't be used to
-- take over an account. staff.email keeps the original contact email.

alter table public.staff add column if not exists username text;

-- Give existing logins a username from their email (before the @), made unique.
with base as (
  select user_id,
         regexp_replace(lower(split_part(email, '@', 1)), '[^a-z0-9._-]', '', 'g') as b,
         row_number() over (
           partition by regexp_replace(lower(split_part(email, '@', 1)), '[^a-z0-9._-]', '', 'g')
           order by created_at
         ) as n
  from public.staff
  where username is null
)
update public.staff s
set username = case when base.n = 1 then base.b else base.b || base.n end
from base
where s.user_id = base.user_id;

update public.staff set username = rpad(username, 3, '0') where length(username) < 3;
update public.staff set username = 'user' || substr(user_id::text, 1, 6) where username !~ '^[a-z0-9]';

alter table public.staff alter column username set not null;
alter table public.staff drop constraint if exists staff_username_format;
alter table public.staff add constraint staff_username_format check (username ~ '^[a-z0-9][a-z0-9._-]{2,29}$');
create unique index if not exists staff_username_key on public.staff (username);

-- Switch each login's sign-in email to its username address.
update auth.users u
set email = s.username || '@pitstop.invalid', updated_at = now()
from public.staff s
where s.user_id = u.id and u.email is distinct from s.username || '@pitstop.invalid';

update auth.identities i
set identity_data = jsonb_set(i.identity_data, '{email}', to_jsonb(s.username || '@pitstop.invalid')),
    updated_at = now()
from public.staff s
where i.user_id = s.user_id and i.provider = 'email';
