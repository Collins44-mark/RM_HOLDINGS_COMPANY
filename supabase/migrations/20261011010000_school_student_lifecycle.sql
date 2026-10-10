-- Student cancellation, withdrawal, class transfer and academic-year progression.
-- Additive. Reuses sch_admissions, sch_students, sch_student_enrollments, sch_fee_charges.

insert into public.permissions (code, module, resource, action, name)
values
  ('school.admissions.cancel', 'school', 'admissions', 'cancel', 'Cancel a school admission'),
  ('school.students.withdraw', 'school', 'students', 'withdraw', 'Withdraw an enrolled student'),
  ('school.students.transfer', 'school', 'students', 'transfer', 'Change a student class'),
  ('school.promotions.view', 'school', 'promotions', 'view', 'View academic-year progression'),
  ('school.promotions.manage', 'school', 'promotions', 'manage', 'Manage academic-year progression')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code in ('SCHOOL_ADMIN', 'SCHOOL_MANAGER')
  and p.code in (
    'school.admissions.cancel', 'school.students.withdraw', 'school.students.transfer',
    'school.promotions.view', 'school.promotions.manage'
  )
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code = 'HEADMASTER'
  and p.code in ('school.admissions.cancel', 'school.students.withdraw', 'school.students.transfer', 'school.promotions.view', 'school.promotions.manage')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code = 'ADMISSIONS_OFFICER'
  and p.code = 'school.admissions.cancel'
on conflict do nothing;

alter table public.sch_admissions
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_reason text not null default '',
  add column if not exists cancelled_by uuid references public.profiles(id) on delete set null;

alter table public.sch_students drop constraint if exists sch_students_status;
alter table public.sch_students
  add constraint sch_students_status check (status in ('active', 'inactive', 'withdrawn'));

alter table public.sch_students
  add column if not exists withdrawn_on date,
  add column if not exists withdrawn_reason text not null default '',
  add column if not exists withdrawn_by uuid references public.profiles(id) on delete set null;

create table if not exists public.sch_placement_events (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  student_id uuid not null,
  event_kind text not null,
  from_enrollment_id uuid,
  to_enrollment_id uuid,
  from_year_id uuid,
  to_year_id uuid,
  from_level_id uuid,
  to_level_id uuid,
  from_class_id uuid,
  to_class_id uuid,
  from_stream_id uuid,
  to_stream_id uuid,
  effective_on date not null,
  reason text not null default '',
  run_id uuid,
  request_id uuid not null,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint sch_placement_events_kind_chk check (event_kind in ('TRANSFER', 'PROMOTE', 'RETAIN', 'GRADUATE', 'WITHDRAW')),
  constraint sch_placement_events_student_fk foreign key (student_id, business_unit_id)
    references public.sch_students (id, business_unit_id) on delete restrict
);

create unique index if not exists sch_placement_events_request_uidx
  on public.sch_placement_events (business_unit_id, request_id);

create index if not exists sch_placement_events_student_idx
  on public.sch_placement_events (business_unit_id, student_id, created_at desc);

create table if not exists public.sch_promotion_runs (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  from_year_id uuid not null,
  to_year_id uuid not null,
  status text not null default 'confirmed',
  promoted_count integer not null default 0,
  retained_count integer not null default 0,
  transferred_count integer not null default 0,
  graduated_count integer not null default 0,
  excluded_count integer not null default 0,
  failed_count integer not null default 0,
  request_id uuid not null,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint sch_promotion_runs_status_chk check (status in ('confirmed')),
  constraint sch_promotion_runs_years_chk check (from_year_id <> to_year_id)
);

create unique index if not exists sch_promotion_runs_request_uidx
  on public.sch_promotion_runs (business_unit_id, request_id);

alter table public.sch_placement_events enable row level security;
alter table public.sch_promotion_runs enable row level security;
revoke all on public.sch_placement_events from anon, public;
revoke all on public.sch_promotion_runs from anon, public;
grant select, insert, update on public.sch_placement_events to authenticated;
grant select, insert, update on public.sch_promotion_runs to authenticated;

drop policy if exists sch_placement_events_select on public.sch_placement_events;
create policy sch_placement_events_select on public.sch_placement_events for select to authenticated using (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_placement_events_insert on public.sch_placement_events;
create policy sch_placement_events_insert on public.sch_placement_events for insert to authenticated with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_placement_events_update on public.sch_placement_events;
create policy sch_placement_events_update on public.sch_placement_events for update to authenticated using (public.has_business_unit_access(business_unit_id)) with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_placement_events_delete on public.sch_placement_events;
create policy sch_placement_events_delete on public.sch_placement_events for delete to authenticated using (false);

drop policy if exists sch_promotion_runs_select on public.sch_promotion_runs;
create policy sch_promotion_runs_select on public.sch_promotion_runs for select to authenticated using (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_promotion_runs_insert on public.sch_promotion_runs;
create policy sch_promotion_runs_insert on public.sch_promotion_runs for insert to authenticated with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_promotion_runs_update on public.sch_promotion_runs;
create policy sch_promotion_runs_update on public.sch_promotion_runs for update to authenticated using (public.has_business_unit_access(business_unit_id)) with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_promotion_runs_delete on public.sch_promotion_runs;
create policy sch_promotion_runs_delete on public.sch_promotion_runs for delete to authenticated using (false);
