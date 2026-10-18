-- Language for what customers receive (printed bills and WhatsApp messages).
-- Run in Supabase -> SQL Editor after 0023. Each person chooses the app's language
-- on their own device; this is the workshop's choice for customers. English by default.

alter table public.shop_settings
  add column if not exists customer_language text not null default 'en'
    check (customer_language in ('en', 'ml', 'hi'));
