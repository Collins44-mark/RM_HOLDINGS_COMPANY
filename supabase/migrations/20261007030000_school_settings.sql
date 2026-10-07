-- School Settings foundation. Additive only. No seeds, no supermarket changes.

create extension if not exists btree_gist;

insert into public.permissions (code, module, resource, action, name)
values
  ('school.settings.view', 'school', 'settings', 'view', 'View school settings'),
  ('school.settings.manage', 'school', 'settings', 'manage', 'Manage school settings')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code in ('SCHOOL_ADMIN', 'SCHOOL_MANAGER')
  and p.code in ('school.settings.view', 'school.settings.manage')
on conflict do nothing;

create table if not exists public.sch_school_profiles (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null unique references public.business_units(id) on delete restrict,
  name text not null,
  short_name text not null default '',
  school_code text not null default '',
  address text not null default '',
  city text not null default '',
  phone text not null default '',
  email text not null default '',
  website text not null default '',
  principal_name text not null default '',
  logo_url text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_school_profiles_name_len check (char_length(btrim(name)) between 2 and 160),
  constraint sch_school_profiles_code_len check (char_length(school_code) <= 40),
  constraint sch_school_profiles_email_len check (char_length(email) <= 160)
);

create table if not exists public.sch_academic_years (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  name text not null,
  start_date date not null,
  end_date date not null,
  is_current boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_academic_years_dates check (start_date < end_date),
  constraint sch_academic_years_name_len check (char_length(btrim(name)) between 1 and 80)
);

create unique index if not exists sch_academic_years_bu_name_uidx
  on public.sch_academic_years (business_unit_id, lower(btrim(name)));
create unique index if not exists sch_academic_years_one_current_uidx
  on public.sch_academic_years (business_unit_id)
  where is_current;

create table if not exists public.sch_terms (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  academic_year_id uuid not null references public.sch_academic_years(id) on delete restrict,
  name text not null,
  sort_order integer not null default 1,
  start_date date not null,
  end_date date not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_terms_dates check (start_date < end_date),
  constraint sch_terms_name_len check (char_length(btrim(name)) between 1 and 80),
  constraint sch_terms_sort check (sort_order >= 1)
);

create unique index if not exists sch_terms_year_name_uidx
  on public.sch_terms (academic_year_id, lower(btrim(name)));
create unique index if not exists sch_terms_year_sort_uidx
  on public.sch_terms (academic_year_id, sort_order);

create table if not exists public.sch_class_levels (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  name text not null,
  code text not null,
  sort_order integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_class_levels_name_len check (char_length(btrim(name)) between 1 and 80),
  constraint sch_class_levels_code_len check (char_length(btrim(code)) between 1 and 40),
  constraint sch_class_levels_sort check (sort_order >= 1)
);

create unique index if not exists sch_class_levels_bu_code_uidx
  on public.sch_class_levels (business_unit_id, lower(btrim(code)));

create table if not exists public.sch_grading_scales (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  name text not null default 'Default',
  is_current boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_grading_scales_name_len check (char_length(btrim(name)) between 1 and 80)
);

create unique index if not exists sch_grading_scales_bu_name_uidx
  on public.sch_grading_scales (business_unit_id, lower(btrim(name)));
create unique index if not exists sch_grading_scales_one_current_uidx
  on public.sch_grading_scales (business_unit_id)
  where is_current;

create table if not exists public.sch_grading_bands (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  scale_id uuid not null references public.sch_grading_scales(id) on delete restrict,
  grade text not null,
  min_mark numeric(8, 2) not null,
  max_mark numeric(8, 2) not null,
  remark text not null default '',
  sort_order integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_grading_bands_range check (min_mark <= max_mark),
  constraint sch_grading_bands_grade_len check (char_length(btrim(grade)) between 1 and 20),
  constraint sch_grading_bands_sort check (sort_order >= 1)
);

alter table public.sch_grading_bands
  add constraint sch_grading_bands_no_overlap exclude using gist (
    scale_id with =,
    numrange(min_mark, max_mark, '[]') with &&
  ) where (is_active);

create unique index if not exists sch_grading_bands_scale_grade_uidx
  on public.sch_grading_bands (scale_id, lower(btrim(grade)));

create table if not exists public.sch_fee_categories (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  name text not null,
  code text not null,
  amount numeric(14, 2),
  frequency text not null default 'TERM',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_fee_categories_name_len check (char_length(btrim(name)) between 1 and 80),
  constraint sch_fee_categories_code_len check (char_length(btrim(code)) between 1 and 40),
  constraint sch_fee_categories_amount check (amount is null or amount >= 0),
  constraint sch_fee_categories_frequency check (frequency in ('TERM', 'YEAR', 'MONTH', 'ONCE', 'OTHER'))
);

create unique index if not exists sch_fee_categories_bu_code_uidx
  on public.sch_fee_categories (business_unit_id, lower(btrim(code)));

create table if not exists public.sch_attendance_settings (
  business_unit_id uuid primary key references public.business_units(id) on delete restrict,
  school_start time not null default '07:30',
  school_end time not null default '15:30',
  late_threshold_minutes integer not null default 15,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_attendance_settings_times check (school_start < school_end),
  constraint sch_attendance_settings_late check (late_threshold_minutes >= 0 and late_threshold_minutes <= 180)
);

create table if not exists public.sch_attendance_statuses (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  code text not null,
  name text not null,
  counts_as_present boolean not null default false,
  sort_order integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_attendance_statuses_code_len check (char_length(btrim(code)) between 1 and 40),
  constraint sch_attendance_statuses_name_len check (char_length(btrim(name)) between 1 and 80)
);

create unique index if not exists sch_attendance_statuses_bu_code_uidx
  on public.sch_attendance_statuses (business_unit_id, lower(btrim(code)));

create table if not exists public.sch_transport_settings (
  business_unit_id uuid primary key references public.business_units(id) on delete restrict,
  enabled boolean not null default false,
  pickup_dropoff_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.sch_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.sch_clear_other_current_years()
returns trigger
language plpgsql
as $$
begin
  if new.is_current then
    update public.sch_academic_years
    set is_current = false, updated_at = now()
    where business_unit_id = new.business_unit_id
      and id is distinct from new.id
      and is_current;
  end if;
  return new;
end;
$$;

drop trigger if exists sch_school_profiles_touch on public.sch_school_profiles;
create trigger sch_school_profiles_touch before update on public.sch_school_profiles
  for each row execute function public.sch_touch_updated_at();
drop trigger if exists sch_academic_years_touch on public.sch_academic_years;
create trigger sch_academic_years_touch before update on public.sch_academic_years
  for each row execute function public.sch_touch_updated_at();
drop trigger if exists sch_academic_years_one_current on public.sch_academic_years;
create trigger sch_academic_years_one_current before insert or update on public.sch_academic_years
  for each row execute function public.sch_clear_other_current_years();
drop trigger if exists sch_terms_touch on public.sch_terms;
create trigger sch_terms_touch before update on public.sch_terms
  for each row execute function public.sch_touch_updated_at();
drop trigger if exists sch_class_levels_touch on public.sch_class_levels;
create trigger sch_class_levels_touch before update on public.sch_class_levels
  for each row execute function public.sch_touch_updated_at();
drop trigger if exists sch_grading_scales_touch on public.sch_grading_scales;
create trigger sch_grading_scales_touch before update on public.sch_grading_scales
  for each row execute function public.sch_touch_updated_at();
drop trigger if exists sch_grading_bands_touch on public.sch_grading_bands;
create trigger sch_grading_bands_touch before update on public.sch_grading_bands
  for each row execute function public.sch_touch_updated_at();
drop trigger if exists sch_fee_categories_touch on public.sch_fee_categories;
create trigger sch_fee_categories_touch before update on public.sch_fee_categories
  for each row execute function public.sch_touch_updated_at();
drop trigger if exists sch_attendance_settings_touch on public.sch_attendance_settings;
create trigger sch_attendance_settings_touch before update on public.sch_attendance_settings
  for each row execute function public.sch_touch_updated_at();
drop trigger if exists sch_attendance_statuses_touch on public.sch_attendance_statuses;
create trigger sch_attendance_statuses_touch before update on public.sch_attendance_statuses
  for each row execute function public.sch_touch_updated_at();
drop trigger if exists sch_transport_settings_touch on public.sch_transport_settings;
create trigger sch_transport_settings_touch before update on public.sch_transport_settings
  for each row execute function public.sch_touch_updated_at();

do $$
declare
  t text;
begin
  foreach t in array array[
    'sch_school_profiles',
    'sch_academic_years',
    'sch_terms',
    'sch_class_levels',
    'sch_grading_scales',
    'sch_grading_bands',
    'sch_fee_categories',
    'sch_attendance_settings',
    'sch_attendance_statuses',
    'sch_transport_settings'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, public', t);
    execute format('grant select, insert, update on public.%I to authenticated, service_role', t);
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format(
      'create policy %I_select on public.%I for select to authenticated using (public.has_business_unit_access(business_unit_id))',
      t, t
    );
    execute format('drop policy if exists %I_insert on public.%I', t, t);
    execute format(
      'create policy %I_insert on public.%I for insert to authenticated with check (public.has_business_unit_access(business_unit_id))',
      t, t
    );
    execute format('drop policy if exists %I_update on public.%I', t, t);
    execute format(
      'create policy %I_update on public.%I for update to authenticated using (public.has_business_unit_access(business_unit_id)) with check (public.has_business_unit_access(business_unit_id))',
      t, t
    );
    execute format('drop policy if exists %I_delete on public.%I', t, t);
    execute format(
      'create policy %I_delete on public.%I for delete to authenticated using (false)',
      t, t
    );
  end loop;
end
$$;
