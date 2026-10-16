-- The product is now called Pitshop Plus. Run in Supabase -> SQL Editor after 0017.

create or replace function public.require_platform_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only Pitshop Plus admins can do this.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.require_platform_admin() from public, anon, authenticated;
