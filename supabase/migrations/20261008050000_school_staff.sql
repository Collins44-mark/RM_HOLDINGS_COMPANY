-- School staff: one person record, configurable types/positions, academic assignments.
-- Additive. No seeds. No physical deletes. Does not create auth users.

insert into public.permissions (code, module, resource, action, name)
values
  ('school.staff.view', 'school', 'staff', 'view', 'View school staff'),
  ('school.staff.manage', 'school', 'staff', 'manage', 'Manage school staff')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code in ('SCHOOL_ADMIN', 'SCHOOL_MANAGER')
  and p.code in ('school.staff.view', 'school.staff.manage')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code = 'TEACHER'
  and p.code = 'school.staff.view'
on conflict do nothing;

create table if not exists public.sch_staff_types (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  name text not null,
  code text not null,
  kind text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_staff_types_name_len check (char_length(btrim(name)) between 1 and 80),
  constraint sch_staff_types_code_len check (char_length(btrim(code)) between 1 and 40),
  constraint sch_staff_types_kind check (kind in ('academic', 'administrative', 'support', 'transport'))
);

create unique index if not exists sch_staff_types_code_uidx
  on public.sch_staff_types (business_unit_id, lower(btrim(code)));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sch_staff_types_id_bu_key') then
    alter table public.sch_staff_types
      add constraint sch_staff_types_id_bu_key unique (id, business_unit_id);
  end if;
end
$$;

drop trigger if exists sch_staff_types_touch on public.sch_staff_types;
create trigger sch_staff_types_touch before update on public.sch_staff_types
  for each row execute function public.sch_touch_updated_at();

alter table public.sch_staff_types enable row level security;
revoke all on public.sch_staff_types from anon, public;
grant select, insert, update on public.sch_staff_types to authenticated, service_role;

drop policy if exists sch_staff_types_select on public.sch_staff_types;
create policy sch_staff_types_select on public.sch_staff_types
  for select to authenticated using (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_staff_types_insert on public.sch_staff_types;
create policy sch_staff_types_insert on public.sch_staff_types
  for insert to authenticated with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_staff_types_update on public.sch_staff_types;
create policy sch_staff_types_update on public.sch_staff_types
  for update to authenticated
  using (public.has_business_unit_access(business_unit_id))
  with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_staff_types_delete on public.sch_staff_types;
create policy sch_staff_types_delete on public.sch_staff_types
  for delete to authenticated using (false);

create table if not exists public.sch_staff_positions (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  staff_type_id uuid not null,
  name text not null,
  code text not null,
  allows_academic_assignments boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_staff_positions_name_len check (char_length(btrim(name)) between 1 and 80),
  constraint sch_staff_positions_code_len check (char_length(btrim(code)) between 1 and 40),
  constraint sch_staff_positions_type_bu_fk foreign key (staff_type_id, business_unit_id)
    references public.sch_staff_types (id, business_unit_id) on delete restrict
);

create unique index if not exists sch_staff_positions_code_uidx
  on public.sch_staff_positions (staff_type_id, lower(btrim(code)));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sch_staff_positions_id_bu_key') then
    alter table public.sch_staff_positions
      add constraint sch_staff_positions_id_bu_key unique (id, business_unit_id);
  end if;
end
$$;

drop trigger if exists sch_staff_positions_touch on public.sch_staff_positions;
create trigger sch_staff_positions_touch before update on public.sch_staff_positions
  for each row execute function public.sch_touch_updated_at();

alter table public.sch_staff_positions enable row level security;
revoke all on public.sch_staff_positions from anon, public;
grant select, insert, update on public.sch_staff_positions to authenticated, service_role;

drop policy if exists sch_staff_positions_select on public.sch_staff_positions;
create policy sch_staff_positions_select on public.sch_staff_positions
  for select to authenticated using (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_staff_positions_insert on public.sch_staff_positions;
create policy sch_staff_positions_insert on public.sch_staff_positions
  for insert to authenticated with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_staff_positions_update on public.sch_staff_positions;
create policy sch_staff_positions_update on public.sch_staff_positions
  for update to authenticated
  using (public.has_business_unit_access(business_unit_id))
  with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_staff_positions_delete on public.sch_staff_positions;
create policy sch_staff_positions_delete on public.sch_staff_positions
  for delete to authenticated using (false);

create table if not exists public.sch_departments (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  name text not null,
  code text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_departments_name_len check (char_length(btrim(name)) between 1 and 80),
  constraint sch_departments_code_len check (char_length(btrim(code)) between 1 and 40)
);

create unique index if not exists sch_departments_code_uidx
  on public.sch_departments (business_unit_id, lower(btrim(code)));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sch_departments_id_bu_key') then
    alter table public.sch_departments
      add constraint sch_departments_id_bu_key unique (id, business_unit_id);
  end if;
end
$$;

drop trigger if exists sch_departments_touch on public.sch_departments;
create trigger sch_departments_touch before update on public.sch_departments
  for each row execute function public.sch_touch_updated_at();

alter table public.sch_departments enable row level security;
revoke all on public.sch_departments from anon, public;
grant select, insert, update on public.sch_departments to authenticated, service_role;

drop policy if exists sch_departments_select on public.sch_departments;
create policy sch_departments_select on public.sch_departments
  for select to authenticated using (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_departments_insert on public.sch_departments;
create policy sch_departments_insert on public.sch_departments
  for insert to authenticated with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_departments_update on public.sch_departments;
create policy sch_departments_update on public.sch_departments
  for update to authenticated
  using (public.has_business_unit_access(business_unit_id))
  with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_departments_delete on public.sch_departments;
create policy sch_departments_delete on public.sch_departments
  for delete to authenticated using (false);

create table if not exists public.sch_subjects (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  department_id uuid,
  name text not null,
  code text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_subjects_name_len check (char_length(btrim(name)) between 1 and 80),
  constraint sch_subjects_code_len check (char_length(btrim(code)) between 1 and 40),
  constraint sch_subjects_department_bu_fk foreign key (department_id, business_unit_id)
    references public.sch_departments (id, business_unit_id) on delete restrict
);

create unique index if not exists sch_subjects_code_uidx
  on public.sch_subjects (business_unit_id, lower(btrim(code)));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sch_subjects_id_bu_key') then
    alter table public.sch_subjects
      add constraint sch_subjects_id_bu_key unique (id, business_unit_id);
  end if;
end
$$;

drop trigger if exists sch_subjects_touch on public.sch_subjects;
create trigger sch_subjects_touch before update on public.sch_subjects
  for each row execute function public.sch_touch_updated_at();

alter table public.sch_subjects enable row level security;
revoke all on public.sch_subjects from anon, public;
grant select, insert, update on public.sch_subjects to authenticated, service_role;

drop policy if exists sch_subjects_select on public.sch_subjects;
create policy sch_subjects_select on public.sch_subjects
  for select to authenticated using (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_subjects_insert on public.sch_subjects;
create policy sch_subjects_insert on public.sch_subjects
  for insert to authenticated with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_subjects_update on public.sch_subjects;
create policy sch_subjects_update on public.sch_subjects
  for update to authenticated
  using (public.has_business_unit_access(business_unit_id))
  with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_subjects_delete on public.sch_subjects;
create policy sch_subjects_delete on public.sch_subjects
  for delete to authenticated using (false);

create table if not exists public.sch_staff (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  staff_number text not null,
  first_name text not null,
  middle_name text not null default '',
  last_name text not null,
  gender text,
  date_of_birth date,
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  photo_url text not null default '',
  staff_type_id uuid not null,
  position_id uuid not null,
  employment_status text not null default 'active',
  employment_date date,
  user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_staff_first_name_len check (char_length(btrim(first_name)) between 1 and 80),
  constraint sch_staff_last_name_len check (char_length(btrim(last_name)) between 1 and 80),
  constraint sch_staff_gender check (gender is null or gender in ('female', 'male', 'other')),
  constraint sch_staff_status check (employment_status in ('active', 'inactive')),
  constraint sch_staff_type_bu_fk foreign key (staff_type_id, business_unit_id)
    references public.sch_staff_types (id, business_unit_id) on delete restrict,
  constraint sch_staff_position_bu_fk foreign key (position_id, business_unit_id)
    references public.sch_staff_positions (id, business_unit_id) on delete restrict
);

create unique index if not exists sch_staff_number_uidx
  on public.sch_staff (business_unit_id, staff_number);

create unique index if not exists sch_staff_user_uidx
  on public.sch_staff (business_unit_id, user_id)
  where user_id is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sch_staff_id_bu_key') then
    alter table public.sch_staff
      add constraint sch_staff_id_bu_key unique (id, business_unit_id);
  end if;
end
$$;

drop trigger if exists sch_staff_touch on public.sch_staff;
create trigger sch_staff_touch before update on public.sch_staff
  for each row execute function public.sch_touch_updated_at();

alter table public.sch_staff enable row level security;
revoke all on public.sch_staff from anon, public;
grant select, insert, update on public.sch_staff to authenticated, service_role;

drop policy if exists sch_staff_select on public.sch_staff;
create policy sch_staff_select on public.sch_staff
  for select to authenticated using (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_staff_insert on public.sch_staff;
create policy sch_staff_insert on public.sch_staff
  for insert to authenticated with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_staff_update on public.sch_staff;
create policy sch_staff_update on public.sch_staff
  for update to authenticated
  using (public.has_business_unit_access(business_unit_id))
  with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_staff_delete on public.sch_staff;
create policy sch_staff_delete on public.sch_staff
  for delete to authenticated using (false);

create table if not exists public.sch_staff_assignments (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  staff_id uuid not null,
  assignment_type text not null,
  academic_year_id uuid,
  term_id uuid,
  level_id uuid,
  class_id uuid,
  stream_id uuid,
  subject_id uuid,
  department_id uuid,
  is_primary boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_staff_assignments_type check (
    assignment_type in ('CLASS_TEACHER', 'SUBJECT_TEACHER', 'LEVEL_HEAD', 'DEPARTMENT_HEAD')
  ),
  constraint sch_staff_assignments_shape check (
    (assignment_type = 'CLASS_TEACHER' and stream_id is not null)
    or (assignment_type = 'SUBJECT_TEACHER' and subject_id is not null)
    or (assignment_type = 'LEVEL_HEAD' and level_id is not null)
    or (assignment_type = 'DEPARTMENT_HEAD' and department_id is not null)
  ),
  constraint sch_staff_assignments_staff_bu_fk foreign key (staff_id, business_unit_id)
    references public.sch_staff (id, business_unit_id) on delete restrict,
  constraint sch_staff_assignments_year_bu_fk foreign key (academic_year_id, business_unit_id)
    references public.sch_academic_years (id, business_unit_id) on delete restrict,
  constraint sch_staff_assignments_term_bu_fk foreign key (term_id, business_unit_id)
    references public.sch_terms (id, business_unit_id) on delete restrict,
  constraint sch_staff_assignments_level_bu_fk foreign key (level_id, business_unit_id)
    references public.sch_class_levels (id, business_unit_id) on delete restrict,
  constraint sch_staff_assignments_class_bu_fk foreign key (class_id, business_unit_id)
    references public.sch_classes (id, business_unit_id) on delete restrict,
  constraint sch_staff_assignments_stream_bu_fk foreign key (stream_id, business_unit_id)
    references public.sch_class_streams (id, business_unit_id) on delete restrict,
  constraint sch_staff_assignments_subject_bu_fk foreign key (subject_id, business_unit_id)
    references public.sch_subjects (id, business_unit_id) on delete restrict,
  constraint sch_staff_assignments_department_bu_fk foreign key (department_id, business_unit_id)
    references public.sch_departments (id, business_unit_id) on delete restrict
);

create unique index if not exists sch_assign_class_teacher_uidx
  on public.sch_staff_assignments (
    business_unit_id,
    stream_id,
    coalesce(academic_year_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where assignment_type = 'CLASS_TEACHER' and is_active and is_primary and stream_id is not null;

create unique index if not exists sch_assign_level_head_uidx
  on public.sch_staff_assignments (
    business_unit_id,
    level_id,
    coalesce(academic_year_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where assignment_type = 'LEVEL_HEAD' and is_active and level_id is not null;

create unique index if not exists sch_assign_department_head_uidx
  on public.sch_staff_assignments (
    business_unit_id,
    department_id,
    coalesce(academic_year_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where assignment_type = 'DEPARTMENT_HEAD' and is_active and department_id is not null;

drop trigger if exists sch_staff_assignments_touch on public.sch_staff_assignments;
create trigger sch_staff_assignments_touch before update on public.sch_staff_assignments
  for each row execute function public.sch_touch_updated_at();

alter table public.sch_staff_assignments enable row level security;
revoke all on public.sch_staff_assignments from anon, public;
grant select, insert, update on public.sch_staff_assignments to authenticated, service_role;

drop policy if exists sch_staff_assignments_select on public.sch_staff_assignments;
create policy sch_staff_assignments_select on public.sch_staff_assignments
  for select to authenticated using (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_staff_assignments_insert on public.sch_staff_assignments;
create policy sch_staff_assignments_insert on public.sch_staff_assignments
  for insert to authenticated with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_staff_assignments_update on public.sch_staff_assignments;
create policy sch_staff_assignments_update on public.sch_staff_assignments
  for update to authenticated
  using (public.has_business_unit_access(business_unit_id))
  with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_staff_assignments_delete on public.sch_staff_assignments;
create policy sch_staff_assignments_delete on public.sch_staff_assignments
  for delete to authenticated using (false);
