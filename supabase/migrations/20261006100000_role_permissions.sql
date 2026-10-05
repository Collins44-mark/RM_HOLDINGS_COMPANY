-- Additive RBAC: catalog, role grants, per-module user roles, user overrides.
-- Does not drop or reseed users, roles, business units, or supermarket data.

create table if not exists public.permissions (
  code text primary key,
  module text not null,
  resource text not null,
  action text not null,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_code text not null references public.permissions(code) on delete cascade,
  primary key (role_id, permission_code)
);

create table if not exists public.user_module_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (user_id, business_unit_id)
);

create table if not exists public.user_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  permission_code text not null references public.permissions(code) on delete cascade,
  effect text not null check (effect in ('allow', 'deny')),
  created_at timestamptz not null default now(),
  unique (user_id, business_unit_id, permission_code)
);

alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_module_roles enable row level security;
alter table public.user_permission_overrides enable row level security;

drop policy if exists permissions_authenticated_read on public.permissions;
create policy permissions_authenticated_read
  on public.permissions for select
  to authenticated
  using (true);

drop policy if exists permissions_owner_write on public.permissions;
create policy permissions_owner_write
  on public.permissions for all
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

drop policy if exists role_permissions_authenticated_read on public.role_permissions;
create policy role_permissions_authenticated_read
  on public.role_permissions for select
  to authenticated
  using (true);

drop policy if exists role_permissions_owner_write on public.role_permissions;
create policy role_permissions_owner_write
  on public.role_permissions for all
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

drop policy if exists user_module_roles_self_or_owner on public.user_module_roles;
create policy user_module_roles_self_or_owner
  on public.user_module_roles for select
  to authenticated
  using (user_id = auth.uid() or public.is_owner());

drop policy if exists user_module_roles_owner_write on public.user_module_roles;
create policy user_module_roles_owner_write
  on public.user_module_roles for all
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

drop policy if exists user_permission_overrides_self_or_owner on public.user_permission_overrides;
create policy user_permission_overrides_self_or_owner
  on public.user_permission_overrides for select
  to authenticated
  using (user_id = auth.uid() or public.is_owner());

drop policy if exists user_permission_overrides_owner_write on public.user_permission_overrides;
create policy user_permission_overrides_owner_write
  on public.user_permission_overrides for all
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

grant select on public.permissions, public.role_permissions, public.user_module_roles, public.user_permission_overrides
  to authenticated;
grant all on public.permissions, public.role_permissions, public.user_module_roles, public.user_permission_overrides
  to service_role;

insert into public.permissions (code, module, resource, action, name) values
  ('platform.dashboard.view', 'platform', 'dashboard', 'view', 'Dashboard View'),
  ('platform.users.view', 'platform', 'users', 'view', 'Users View'),
  ('platform.users.manage', 'platform', 'users', 'manage', 'Users Manage'),
  ('platform.roles.manage', 'platform', 'roles', 'manage', 'Roles Manage'),
  ('platform.permissions.manage', 'platform', 'permissions', 'manage', 'Permissions Manage'),
  ('platform.audit.view', 'platform', 'audit', 'view', 'Audit View'),
  ('platform.settings.manage', 'platform', 'settings', 'manage', 'Settings Manage'),
  ('platform.finance.view', 'platform', 'finance', 'view', 'Finance View'),
  ('platform.finance.manage', 'platform', 'finance', 'manage', 'Finance Manage'),
  ('platform.reports.view', 'platform', 'reports', 'view', 'Reports View'),
  ('platform.business_units.view', 'platform', 'business_units', 'view', 'Business Units View'),
  ('platform.business_units.manage', 'platform', 'business_units', 'manage', 'Business Units Manage'),
  ('supermarket.products.view', 'supermarket', 'products', 'view', 'Products View'),
  ('supermarket.products.create', 'supermarket', 'products', 'create', 'Products Create'),
  ('supermarket.products.edit', 'supermarket', 'products', 'edit', 'Products Edit'),
  ('supermarket.products.delete', 'supermarket', 'products', 'delete', 'Products Delete'),
  ('supermarket.categories.view', 'supermarket', 'categories', 'view', 'Categories View'),
  ('supermarket.categories.create', 'supermarket', 'categories', 'create', 'Categories Create'),
  ('supermarket.categories.edit', 'supermarket', 'categories', 'edit', 'Categories Edit'),
  ('supermarket.categories.delete', 'supermarket', 'categories', 'delete', 'Categories Delete'),
  ('supermarket.suppliers.view', 'supermarket', 'suppliers', 'view', 'Suppliers View'),
  ('supermarket.suppliers.create', 'supermarket', 'suppliers', 'create', 'Suppliers Create'),
  ('supermarket.suppliers.edit', 'supermarket', 'suppliers', 'edit', 'Suppliers Edit'),
  ('supermarket.suppliers.delete', 'supermarket', 'suppliers', 'delete', 'Suppliers Delete'),
  ('supermarket.purchases.view', 'supermarket', 'purchases', 'view', 'Purchases View'),
  ('supermarket.purchases.create', 'supermarket', 'purchases', 'create', 'Purchases Create'),
  ('supermarket.sales.view', 'supermarket', 'sales', 'view', 'Sales View'),
  ('supermarket.sales.create', 'supermarket', 'sales', 'create', 'Sales Create'),
  ('supermarket.stock.view', 'supermarket', 'stock', 'view', 'Inventory View'),
  ('supermarket.stock.edit', 'supermarket', 'stock', 'edit', 'Inventory Edit')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code in ('GROUP_ACCOUNTANT', 'FINANCE_MANAGER')
  and p.code in (
    'platform.dashboard.view',
    'platform.finance.view',
    'platform.finance.manage',
    'platform.reports.view',
    'platform.business_units.view',
    'platform.audit.view'
  )
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code = 'SUPERMARKET_MANAGER'
  and p.module = 'supermarket'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code = 'CASHIER'
  and p.code in (
    'supermarket.sales.view',
    'supermarket.sales.create',
    'supermarket.products.view'
  )
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code = 'STOREKEEPER'
  and p.module = 'supermarket'
  and p.resource in ('stock', 'products')
on conflict do nothing;

-- Existing assignments keep the profile role as the module role.
insert into public.user_module_roles (user_id, business_unit_id, role_id)
select ubu.user_id, ubu.business_unit_id, p.role_id
from public.user_business_units ubu
join public.profiles p on p.id = ubu.user_id
on conflict (user_id, business_unit_id) do nothing;
