-- RM Holdings — Supabase Auth + RLS
-- Apply in the Supabase SQL editor after enabling Auth.
-- Profiles and authorization map to the existing Prisma User/Role/Permission
-- /BusinessUnit tables. When the app is fully on Postgres, these tables become
-- the source of truth and Prisma models should point at the same schema.

create extension if not exists "pgcrypto";

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text
);

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  phone text,
  avatar_url text,
  role_id uuid references public.roles(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_units (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.user_business_units (
  user_id uuid not null references public.profiles(id) on delete cascade,
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  primary key (user_id, business_unit_id)
);

create table if not exists public.user_permissions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (user_id, permission_id)
);

alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.business_units enable row level security;
alter table public.user_business_units enable row level security;
alter table public.user_permissions enable row level security;

create or replace function public.is_owner()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.id = auth.uid()
      and p.is_active = true
      and r.name in ('SUPER_ADMIN', 'OWNER', 'Super Admin', 'Owner')
  );
$$;

create or replace function public.has_business_unit(unit_slug text)
returns boolean
language sql
stable
as $$
  select public.is_owner()
    or exists (
      select 1
      from public.user_business_units uba
      join public.business_units bu on bu.id = uba.business_unit_id
      where uba.user_id = auth.uid()
        and bu.slug = unit_slug
        and bu.is_active = true
    );
$$;

create policy "profiles_self_or_owner"
  on public.profiles for select
  using (id = auth.uid() or public.is_owner());

create policy "roles_authenticated_read"
  on public.roles for select
  to authenticated
  using (true);

create policy "permissions_authenticated_read"
  on public.permissions for select
  to authenticated
  using (true);

create policy "role_permissions_authenticated_read"
  on public.role_permissions for select
  to authenticated
  using (true);

create policy "business_units_assigned_or_owner"
  on public.business_units for select
  using (public.is_owner() or public.has_business_unit(slug));

create policy "user_business_units_self_or_owner"
  on public.user_business_units for select
  using (user_id = auth.uid() or public.is_owner());

create policy "user_permissions_self_or_owner"
  on public.user_permissions for select
  using (user_id = auth.uid() or public.is_owner());
