-- Billing schema for service / repair jobs.
-- Run in Supabase -> SQL Editor (or `supabase db push`).
-- Any signed-in staff user can read and write; anonymous visitors get nothing.

create table public.shop_settings (
  id int primary key default 1 check (id = 1),
  shop_name text not null default '',
  address text,
  phone text,
  gstin text,
  invoice_footer text,
  updated_at timestamptz not null default now()
);
insert into public.shop_settings (id) values (1);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  address text,
  created_at timestamptz not null default now()
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  reg_number text not null unique,
  make_model text,
  created_at timestamptz not null default now()
);

create sequence public.invoice_number_seq start 1;

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number bigint not null unique default nextval('public.invoice_number_seq'),
  customer_id uuid not null references public.customers(id) on delete restrict,
  vehicle_id uuid references public.vehicles(id) on delete restrict,
  odometer_km int,
  notes text,
  status text not null default 'unpaid' check (status in ('unpaid', 'paid', 'cancelled')),
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

-- One row per labour charge or part used. tax_percent is per line (0 = no tax),
-- so the tax rules can be decided later without a schema change.
create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  kind text not null check (kind in ('labour', 'part')),
  description text not null,
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  tax_percent numeric(5,2) not null default 0 check (tax_percent >= 0),
  position int not null default 0
);

create index on public.vehicles (customer_id);
create index on public.invoices (customer_id);
create index on public.invoices (created_at desc);
create index on public.invoice_items (invoice_id);

alter table public.shop_settings enable row level security;
alter table public.customers enable row level security;
alter table public.vehicles enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;

create policy "staff read settings" on public.shop_settings for select to authenticated using (true);
create policy "staff update settings" on public.shop_settings for update to authenticated using (true) with check (true);

create policy "staff all customers" on public.customers for all to authenticated using (true) with check (true);
create policy "staff all vehicles" on public.vehicles for all to authenticated using (true) with check (true);
create policy "staff all invoices" on public.invoices for all to authenticated using (true) with check (true);
create policy "staff all invoice_items" on public.invoice_items for all to authenticated using (true) with check (true);
