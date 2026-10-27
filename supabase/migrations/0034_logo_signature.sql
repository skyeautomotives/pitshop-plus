-- Workshop logo and signature on bills and job cards. Run after 0033.
--
-- Both are small pictures stored as data URLs (the app shrinks them first).
-- Only the owner can change them: shop_settings updates are already owner-only.

alter table public.shop_settings
  add column if not exists logo text
    check (logo is null or (logo like 'data:image/%' and length(logo) <= 400000)),
  add column if not exists signature text
    check (signature is null or (signature like 'data:image/%' and length(signature) <= 400000));
