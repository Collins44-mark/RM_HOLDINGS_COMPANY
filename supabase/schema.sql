-- RM Holdings — focused user-management schema
-- Additive only: CREATE IF NOT EXISTS, no DROP TABLE.
-- Inspected production 2026-09-14: public.profiles / roles / business_units
-- do not exist yet. This creates the minimum tables for Owner user management.

create extension if not exists "pgcrypto";

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  description text,
  is_system boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.business_units (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  slug text not null unique,
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text unique,
  phone text unique,
  avatar_url text,
  role_id uuid not null references public.roles(id),
  is_active boolean not null default true,
  must_change_password boolean not null default false,
  failed_login_attempts integer not null default 0,
  locked_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_or_phone check (email is not null or phone is not null)
);

create table if not exists public.user_business_units (
  user_id uuid not null references public.profiles(id) on delete cascade,
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  primary key (user_id, business_unit_id)
);

alter table public.roles enable row level security;
alter table public.business_units enable row level security;
alter table public.profiles enable row level security;
alter table public.user_business_units enable row level security;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.id = auth.uid()
      and p.is_active = true
      and p.locked_at is null
      and r.code in ('SUPER_ADMIN', 'OWNER')
  );
$$;

create or replace function public.clear_password_change_required()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set
    must_change_password = false,
    failed_login_attempts = 0,
    locked_at = null,
    updated_at = now()
  where id = auth.uid();
end;
$$;

grant execute on function public.is_owner() to authenticated;
grant execute on function public.clear_password_change_required() to authenticated;

drop policy if exists roles_authenticated_read on public.roles;
create policy roles_authenticated_read
  on public.roles for select
  to authenticated
  using (true);

drop policy if exists business_units_authenticated_read on public.business_units;
create policy business_units_authenticated_read
  on public.business_units for select
  to authenticated
  using (true);

drop policy if exists profiles_self_or_owner on public.profiles;
create policy profiles_self_or_owner
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_owner());

drop policy if exists profiles_owner_insert on public.profiles;
create policy profiles_owner_insert
  on public.profiles for insert
  to authenticated
  with check (public.is_owner());

drop policy if exists profiles_owner_update on public.profiles;
create policy profiles_owner_update
  on public.profiles for update
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

drop policy if exists user_business_units_self_or_owner on public.user_business_units;
create policy user_business_units_self_or_owner
  on public.user_business_units for select
  to authenticated
  using (user_id = auth.uid() or public.is_owner());

drop policy if exists user_business_units_owner_write on public.user_business_units;
create policy user_business_units_owner_write
  on public.user_business_units for all
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

insert into public.roles (code, name, description) values
  ('SUPER_ADMIN', 'Super Admin', 'Full access to the RM Holdings platform and every business unit.'),
  ('OWNER', 'Owner', 'Group owner with the same platform authority as Super Admin.'),
  ('GROUP_ACCOUNTANT', 'Group Accountant', 'Consolidated finance, reports and revenue across business units.'),
  ('FINANCE_MANAGER', 'Finance Manager', 'Group finance workspace without operational module access.'),
  ('BUSINESS_MANAGER', 'Business Manager', 'Operational manager assigned to one or more business units.'),
  ('SCHOOL_ADMIN', 'School Admin', 'Full administration of the School Management module.'),
  ('SCHOOL_MANAGER', 'School Manager', 'School Management operations, academics, fees and transport.'),
  ('TEACHER', 'Teacher', 'Academic access to students, attendance and examinations.'),
  ('CASHIER', 'Cashier', 'Point-of-sale and payment collection.'),
  ('STOREKEEPER', 'Storekeeper', 'Inventory and warehouse stock control.'),
  ('FARM_MANAGER', 'Farm Manager', 'Farm operations and tractor services at Chita.'),
  ('SUPERMARKET_MANAGER', 'Supermarket Manager', 'Supermarket retail, inventory and sales operations.'),
  ('PROPERTY_MANAGER', 'Property Manager', 'Offices, rentals and hall bookings.'),
  ('LIVESTOCK_MANAGER', 'Livestock Manager', 'Livestock farm operations at Kigamboni.'),
  ('WAREHOUSE_MANAGER', 'Warehouse Manager', 'Rice mill and warehouse operations at Katindiuka.'),
  ('BEEKEEPING_MANAGER', 'Beekeeping Manager', 'Apiaries, harvests and honey sales.'),
  ('STAFF', 'Staff', 'Limited access granted through explicit assignments.')
on conflict (code) do nothing;

insert into public.business_units (code, slug, name, sort_order) values
  ('rice', 'rice', 'Rice Mill & Warehouse', 1),
  ('farm', 'farm', 'Farm & Tractor Services', 2),
  ('supermarket', 'supermarket', 'Supermarket', 3),
  ('property', 'property', 'Properties & Rentals', 4),
  ('livestock', 'livestock', 'Livestock Farm', 5),
  ('school', 'school', 'School Management', 6),
  ('beekeeping', 'beekeeping', 'Beekeeping', 7)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Supermarket module (see migrations):
--   20260921120000_supermarket_module.sql
--   20260921120100_supermarket_receive_return_rpcs.sql
--   20260921120200_supermarket_seed_catalogue.sql
-- Tables: sm_categories, sm_suppliers, sm_products, sm_stock_batches,
-- sm_stock_movements, sm_stock_adjustments, sm_purchase_orders,
-- sm_purchase_order_items, sm_goods_receipts, sm_goods_receipt_items,
-- sm_sales, sm_sale_items, sm_sale_payments, sm_sales_returns,
-- sm_sales_return_items, sm_promotion_types, sm_promotions,
-- sm_promotion_products, sm_promotion_categories, sm_promotion_tiers,
-- sm_expenses, sm_payments, sm_document_counters
-- RPCs: sm_complete_sale, sm_adjust_stock, sm_receive_purchase_order,
-- sm_process_sales_return, sm_next_document_number, sm_product_stock
-- Access helpers: has_business_unit_access, supermarket_business_unit_id,
-- has_supermarket_access
-- ---------------------------------------------------------------------------
