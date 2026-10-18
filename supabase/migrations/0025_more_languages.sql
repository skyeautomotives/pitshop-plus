-- More languages for printed bills and WhatsApp messages. Run in Supabase -> SQL Editor after 0024.

alter table public.shop_settings drop constraint if exists shop_settings_customer_language_check;
alter table public.shop_settings add constraint shop_settings_customer_language_check
  check (customer_language in ('en', 'ml', 'hi', 'bn', 'mr', 'te', 'ta', 'gu', 'kn', 'or', 'pa', 'ur'));
