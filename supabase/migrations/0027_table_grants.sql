-- Supabase no longer gives new tables in "public" access to the app's roles automatically
-- (from 30 Oct 2026). These grants match what every table already has on the live database,
-- so building the database from these migrations on a fresh project still works.
-- Run in Supabase -> SQL Editor after 0026. Changes nothing on the live database.

grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
