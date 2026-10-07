-- School admissions, students, enrollments, guardians, and document numbering.
-- Additive. No seeds. No physical deletes. Completing an admission is atomic via RPC.

insert into public.permissions (code, module, resource, action, name)
values
  ('school.admissions.view', 'school', 'admissions', 'view', 'View school admissions'),
  ('school.admissions.manage', 'school', 'admissions', 'manage', 'Manage school admissions'),
  ('school.students.view', 'school', 'students', 'view', 'View school students'),
  ('school.students.manage', 'school', 'students', 'manage', 'Manage school students'),
  ('school.parents.view', 'school', 'parents', 'view', 'View school parents'),
  ('school.parents.manage', 'school', 'parents', 'manage', 'Manage school parents')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code in ('SCHOOL_ADMIN', 'SCHOOL_MANAGER')
  and p.code in (
    'school.admissions.view',
    'school.admissions.manage',
    'school.students.view',
    'school.students.manage',
    'school.parents.view',
    'school.parents.manage'
  )
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code = 'TEACHER'
  and p.code = 'school.students.view'
on conflict do nothing;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sch_class_streams_id_bu_key') then
    alter table public.sch_class_streams
      add constraint sch_class_streams_id_bu_key unique (id, business_unit_id);
  end if;
end
$$;

create table if not exists public.sch_document_counters (
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  doc_type text not null,
  prefix text not null,
  next_value integer not null default 1 check (next_value > 0),
  primary key (business_unit_id, doc_type)
);

alter table public.sch_document_counters enable row level security;
revoke all on public.sch_document_counters from anon, public;
grant select, insert, update on public.sch_document_counters to service_role;

create or replace function public.sch_next_document_number(
  p_business_unit_id uuid,
  p_doc_type text,
  p_prefix text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
  v_prefix text := upper(btrim(p_prefix));
begin
  if p_business_unit_id is null then
    raise exception 'School business unit is required.';
  end if;
  if v_prefix is null or char_length(v_prefix) < 1 or char_length(v_prefix) > 8 then
    raise exception 'Document prefix is invalid.';
  end if;
  if not public.has_business_unit_access(p_business_unit_id) then
    raise exception 'Not authorized for this school.';
  end if;

  insert into public.sch_document_counters (business_unit_id, doc_type, prefix, next_value)
  values (p_business_unit_id, p_doc_type, v_prefix, 2)
  on conflict (business_unit_id, doc_type)
  do update set next_value = public.sch_document_counters.next_value + 1
  returning next_value - 1 into v_next;

  return v_prefix || '-' || lpad(v_next::text, 6, '0');
end;
$$;

grant execute on function public.sch_next_document_number(uuid, text, text) to authenticated, service_role;

create table if not exists public.sch_students (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  student_number text not null,
  admission_number text,
  first_name text not null,
  middle_name text not null default '',
  last_name text not null,
  date_of_birth date,
  gender text,
  nationality text not null default '',
  address text not null default '',
  phone text not null default '',
  email text not null default '',
  photo_url text not null default '',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_students_first_name_len check (char_length(btrim(first_name)) between 1 and 80),
  constraint sch_students_last_name_len check (char_length(btrim(last_name)) between 1 and 80),
  constraint sch_students_status check (status in ('active', 'inactive')),
  constraint sch_students_gender check (gender is null or gender in ('female', 'male', 'other'))
);

create unique index if not exists sch_students_number_uidx
  on public.sch_students (business_unit_id, student_number);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sch_students_id_bu_key') then
    alter table public.sch_students
      add constraint sch_students_id_bu_key unique (id, business_unit_id);
  end if;
end
$$;

drop trigger if exists sch_students_touch on public.sch_students;
create trigger sch_students_touch before update on public.sch_students
  for each row execute function public.sch_touch_updated_at();

alter table public.sch_students enable row level security;
revoke all on public.sch_students from anon, public;
grant select, insert, update on public.sch_students to authenticated, service_role;

drop policy if exists sch_students_select on public.sch_students;
create policy sch_students_select on public.sch_students
  for select to authenticated
  using (public.has_business_unit_access(business_unit_id));

drop policy if exists sch_students_insert on public.sch_students;
create policy sch_students_insert on public.sch_students
  for insert to authenticated
  with check (public.has_business_unit_access(business_unit_id));

drop policy if exists sch_students_update on public.sch_students;
create policy sch_students_update on public.sch_students
  for update to authenticated
  using (public.has_business_unit_access(business_unit_id))
  with check (public.has_business_unit_access(business_unit_id));

drop policy if exists sch_students_delete on public.sch_students;
create policy sch_students_delete on public.sch_students
  for delete to authenticated
  using (false);

create table if not exists public.sch_admissions (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  admission_number text not null,
  status text not null default 'draft',
  admission_date date not null default (timezone('utc', now()))::date,
  academic_year_id uuid references public.sch_academic_years(id) on delete restrict,
  term_id uuid references public.sch_terms(id) on delete restrict,
  stream_id uuid references public.sch_class_streams(id) on delete restrict,
  first_name text not null default '',
  middle_name text not null default '',
  last_name text not null default '',
  date_of_birth date,
  gender text,
  nationality text not null default '',
  address text not null default '',
  phone text not null default '',
  email text not null default '',
  photo_url text not null default '',
  guardian_full_name text not null default '',
  guardian_relationship text not null default '',
  guardian_phone text not null default '',
  guardian_email text not null default '',
  guardian_address text not null default '',
  guardian_occupation text not null default '',
  student_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_admissions_status check (status in ('draft', 'completed', 'cancelled')),
  constraint sch_admissions_gender check (gender is null or gender in ('female', 'male', 'other')),
  constraint sch_admissions_year_bu_fk foreign key (academic_year_id, business_unit_id)
    references public.sch_academic_years (id, business_unit_id) on delete restrict,
  constraint sch_admissions_term_bu_fk foreign key (term_id, business_unit_id)
    references public.sch_terms (id, business_unit_id) on delete restrict,
  constraint sch_admissions_stream_bu_fk foreign key (stream_id, business_unit_id)
    references public.sch_class_streams (id, business_unit_id) on delete restrict,
  constraint sch_admissions_student_bu_fk foreign key (student_id, business_unit_id)
    references public.sch_students (id, business_unit_id) on delete restrict
);

create unique index if not exists sch_admissions_number_uidx
  on public.sch_admissions (business_unit_id, admission_number);

create unique index if not exists sch_admissions_student_uidx
  on public.sch_admissions (student_id)
  where student_id is not null;

drop trigger if exists sch_admissions_touch on public.sch_admissions;
create trigger sch_admissions_touch before update on public.sch_admissions
  for each row execute function public.sch_touch_updated_at();

alter table public.sch_admissions enable row level security;
revoke all on public.sch_admissions from anon, public;
grant select, insert, update on public.sch_admissions to authenticated, service_role;

drop policy if exists sch_admissions_select on public.sch_admissions;
create policy sch_admissions_select on public.sch_admissions
  for select to authenticated
  using (public.has_business_unit_access(business_unit_id));

drop policy if exists sch_admissions_insert on public.sch_admissions;
create policy sch_admissions_insert on public.sch_admissions
  for insert to authenticated
  with check (public.has_business_unit_access(business_unit_id));

drop policy if exists sch_admissions_update on public.sch_admissions;
create policy sch_admissions_update on public.sch_admissions
  for update to authenticated
  using (public.has_business_unit_access(business_unit_id))
  with check (public.has_business_unit_access(business_unit_id));

drop policy if exists sch_admissions_delete on public.sch_admissions;
create policy sch_admissions_delete on public.sch_admissions
  for delete to authenticated
  using (false);

create table if not exists public.sch_student_enrollments (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  student_id uuid not null,
  academic_year_id uuid not null,
  term_id uuid,
  stream_id uuid not null,
  status text not null default 'active',
  started_on date not null default (timezone('utc', now()))::date,
  ended_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_enrollments_status check (status in ('active', 'completed', 'transferred', 'withdrawn')),
  constraint sch_enrollments_student_bu_fk foreign key (student_id, business_unit_id)
    references public.sch_students (id, business_unit_id) on delete restrict,
  constraint sch_enrollments_year_bu_fk foreign key (academic_year_id, business_unit_id)
    references public.sch_academic_years (id, business_unit_id) on delete restrict,
  constraint sch_enrollments_term_bu_fk foreign key (term_id, business_unit_id)
    references public.sch_terms (id, business_unit_id) on delete restrict,
  constraint sch_enrollments_stream_bu_fk foreign key (stream_id, business_unit_id)
    references public.sch_class_streams (id, business_unit_id) on delete restrict
);

create unique index if not exists sch_enrollments_active_year_uidx
  on public.sch_student_enrollments (student_id, academic_year_id)
  where status = 'active';

drop trigger if exists sch_student_enrollments_touch on public.sch_student_enrollments;
create trigger sch_student_enrollments_touch before update on public.sch_student_enrollments
  for each row execute function public.sch_touch_updated_at();

alter table public.sch_student_enrollments enable row level security;
revoke all on public.sch_student_enrollments from anon, public;
grant select, insert, update on public.sch_student_enrollments to authenticated, service_role;

drop policy if exists sch_student_enrollments_select on public.sch_student_enrollments;
create policy sch_student_enrollments_select on public.sch_student_enrollments
  for select to authenticated
  using (public.has_business_unit_access(business_unit_id));

drop policy if exists sch_student_enrollments_insert on public.sch_student_enrollments;
create policy sch_student_enrollments_insert on public.sch_student_enrollments
  for insert to authenticated
  with check (public.has_business_unit_access(business_unit_id));

drop policy if exists sch_student_enrollments_update on public.sch_student_enrollments;
create policy sch_student_enrollments_update on public.sch_student_enrollments
  for update to authenticated
  using (public.has_business_unit_access(business_unit_id))
  with check (public.has_business_unit_access(business_unit_id));

drop policy if exists sch_student_enrollments_delete on public.sch_student_enrollments;
create policy sch_student_enrollments_delete on public.sch_student_enrollments
  for delete to authenticated
  using (false);

create table if not exists public.sch_guardians (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  full_name text not null,
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  occupation text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_guardians_name_len check (char_length(btrim(full_name)) between 1 and 160)
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sch_guardians_id_bu_key') then
    alter table public.sch_guardians
      add constraint sch_guardians_id_bu_key unique (id, business_unit_id);
  end if;
end
$$;

drop trigger if exists sch_guardians_touch on public.sch_guardians;
create trigger sch_guardians_touch before update on public.sch_guardians
  for each row execute function public.sch_touch_updated_at();

alter table public.sch_guardians enable row level security;
revoke all on public.sch_guardians from anon, public;
grant select, insert, update on public.sch_guardians to authenticated, service_role;

drop policy if exists sch_guardians_select on public.sch_guardians;
create policy sch_guardians_select on public.sch_guardians
  for select to authenticated
  using (public.has_business_unit_access(business_unit_id));

drop policy if exists sch_guardians_insert on public.sch_guardians;
create policy sch_guardians_insert on public.sch_guardians
  for insert to authenticated
  with check (public.has_business_unit_access(business_unit_id));

drop policy if exists sch_guardians_update on public.sch_guardians;
create policy sch_guardians_update on public.sch_guardians
  for update to authenticated
  using (public.has_business_unit_access(business_unit_id))
  with check (public.has_business_unit_access(business_unit_id));

drop policy if exists sch_guardians_delete on public.sch_guardians;
create policy sch_guardians_delete on public.sch_guardians
  for delete to authenticated
  using (false);

create table if not exists public.sch_student_guardians (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  student_id uuid not null,
  guardian_id uuid not null,
  relationship text not null,
  is_primary boolean not null default true,
  is_emergency boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_student_guardians_rel_len check (char_length(btrim(relationship)) between 1 and 40),
  constraint sch_student_guardians_student_bu_fk foreign key (student_id, business_unit_id)
    references public.sch_students (id, business_unit_id) on delete restrict,
  constraint sch_student_guardians_guardian_bu_fk foreign key (guardian_id, business_unit_id)
    references public.sch_guardians (id, business_unit_id) on delete restrict
);

create unique index if not exists sch_student_guardians_uidx
  on public.sch_student_guardians (student_id, guardian_id);

drop trigger if exists sch_student_guardians_touch on public.sch_student_guardians;
create trigger sch_student_guardians_touch before update on public.sch_student_guardians
  for each row execute function public.sch_touch_updated_at();

alter table public.sch_student_guardians enable row level security;
revoke all on public.sch_student_guardians from anon, public;
grant select, insert, update on public.sch_student_guardians to authenticated, service_role;

drop policy if exists sch_student_guardians_select on public.sch_student_guardians;
create policy sch_student_guardians_select on public.sch_student_guardians
  for select to authenticated
  using (public.has_business_unit_access(business_unit_id));

drop policy if exists sch_student_guardians_insert on public.sch_student_guardians;
create policy sch_student_guardians_insert on public.sch_student_guardians
  for insert to authenticated
  with check (public.has_business_unit_access(business_unit_id));

drop policy if exists sch_student_guardians_update on public.sch_student_guardians;
create policy sch_student_guardians_update on public.sch_student_guardians
  for update to authenticated
  using (public.has_business_unit_access(business_unit_id))
  with check (public.has_business_unit_access(business_unit_id));

drop policy if exists sch_student_guardians_delete on public.sch_student_guardians;
create policy sch_student_guardians_delete on public.sch_student_guardians
  for delete to authenticated
  using (false);

create or replace function public.sch_complete_admission(
  p_admission_id uuid,
  p_acknowledge_duplicate boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_adm public.sch_admissions%rowtype;
  v_stream public.sch_class_streams%rowtype;
  v_class public.sch_classes%rowtype;
  v_student_id uuid;
  v_student_number text;
  v_guardian_id uuid;
  v_enrollment_id uuid;
  v_match_id uuid;
  v_match_number text;
begin
  if p_admission_id is null then
    raise exception 'Admission is required.';
  end if;

  select * into v_adm
  from public.sch_admissions
  where id = p_admission_id
  for update;

  if not found then
    raise exception 'Admission was not found.';
  end if;
  if not public.has_business_unit_access(v_adm.business_unit_id) then
    raise exception 'Not authorized for this school.';
  end if;
  if v_adm.status = 'completed' then
    return jsonb_build_object(
      'admission_id', v_adm.id,
      'student_id', v_adm.student_id,
      'already_completed', true
    );
  end if;
  if v_adm.status <> 'draft' then
    raise exception 'Only a draft admission can be completed.';
  end if;
  if char_length(btrim(v_adm.first_name)) < 1 or char_length(btrim(v_adm.last_name)) < 1 then
    raise exception 'Student first and last name are required.';
  end if;
  if v_adm.academic_year_id is null or v_adm.stream_id is null then
    raise exception 'Academic year and stream are required.';
  end if;
  if char_length(btrim(v_adm.guardian_full_name)) < 1 or char_length(btrim(v_adm.guardian_relationship)) < 1 then
    raise exception 'Guardian name and relationship are required.';
  end if;
  if char_length(btrim(v_adm.guardian_phone)) < 1 then
    raise exception 'Guardian phone is required.';
  end if;

  select * into v_stream
  from public.sch_class_streams
  where id = v_adm.stream_id
    and business_unit_id = v_adm.business_unit_id;
  if not found or not v_stream.is_active then
    raise exception 'Selected stream is not valid for this school.';
  end if;

  select * into v_class
  from public.sch_classes
  where id = v_stream.class_id
    and business_unit_id = v_adm.business_unit_id;
  if not found then
    raise exception 'Selected class is not valid for this school.';
  end if;

  if not public.has_school_academic_scope(v_adm.business_unit_id, v_class.level_id, v_class.id, v_stream.id) then
    raise exception 'Not authorized for this academic placement.';
  end if;

  if v_adm.term_id is not null then
    if not exists (
      select 1
      from public.sch_terms t
      where t.id = v_adm.term_id
        and t.business_unit_id = v_adm.business_unit_id
        and t.academic_year_id = v_adm.academic_year_id
    ) then
      raise exception 'Selected term does not belong to the academic year.';
    end if;
  end if;

  select s.id, s.student_number
    into v_match_id, v_match_number
  from public.sch_students s
  where s.business_unit_id = v_adm.business_unit_id
    and s.status = 'active'
    and lower(btrim(s.first_name)) = lower(btrim(v_adm.first_name))
    and lower(btrim(s.last_name)) = lower(btrim(v_adm.last_name))
    and s.date_of_birth is not distinct from v_adm.date_of_birth
  limit 1;

  if v_match_id is not null and not coalesce(p_acknowledge_duplicate, false) then
    raise exception 'SCH_DUP:%:%', v_match_id, coalesce(v_match_number, '');
  end if;

  v_student_number := public.sch_next_document_number(v_adm.business_unit_id, 'student', 'STU');

  insert into public.sch_students (
    business_unit_id,
    student_number,
    admission_number,
    first_name,
    middle_name,
    last_name,
    date_of_birth,
    gender,
    nationality,
    address,
    phone,
    email,
    photo_url,
    status
  )
  values (
    v_adm.business_unit_id,
    v_student_number,
    v_adm.admission_number,
    btrim(v_adm.first_name),
    btrim(v_adm.middle_name),
    btrim(v_adm.last_name),
    v_adm.date_of_birth,
    v_adm.gender,
    btrim(v_adm.nationality),
    btrim(v_adm.address),
    btrim(v_adm.phone),
    btrim(v_adm.email),
    btrim(v_adm.photo_url),
    'active'
  )
  returning id into v_student_id;

  insert into public.sch_student_enrollments (
    business_unit_id,
    student_id,
    academic_year_id,
    term_id,
    stream_id,
    status,
    started_on
  )
  values (
    v_adm.business_unit_id,
    v_student_id,
    v_adm.academic_year_id,
    v_adm.term_id,
    v_adm.stream_id,
    'active',
    v_adm.admission_date
  )
  returning id into v_enrollment_id;

  select g.id
    into v_guardian_id
  from public.sch_guardians g
  where g.business_unit_id = v_adm.business_unit_id
    and lower(btrim(g.full_name)) = lower(btrim(v_adm.guardian_full_name))
    and regexp_replace(g.phone, '\D', '', 'g') = regexp_replace(v_adm.guardian_phone, '\D', '', 'g')
    and regexp_replace(v_adm.guardian_phone, '\D', '', 'g') <> ''
  order by g.created_at
  limit 1;

  if v_guardian_id is null then
    insert into public.sch_guardians (
      business_unit_id,
      full_name,
      phone,
      email,
      address,
      occupation
    )
    values (
      v_adm.business_unit_id,
      btrim(v_adm.guardian_full_name),
      btrim(v_adm.guardian_phone),
      btrim(v_adm.guardian_email),
      btrim(v_adm.guardian_address),
      btrim(v_adm.guardian_occupation)
    )
    returning id into v_guardian_id;
  else
    update public.sch_guardians
    set
      email = case when btrim(v_adm.guardian_email) = '' then email else btrim(v_adm.guardian_email) end,
      address = case when btrim(v_adm.guardian_address) = '' then address else btrim(v_adm.guardian_address) end,
      occupation = case when btrim(v_adm.guardian_occupation) = '' then occupation else btrim(v_adm.guardian_occupation) end
    where id = v_guardian_id;
  end if;

  insert into public.sch_student_guardians (
    business_unit_id,
    student_id,
    guardian_id,
    relationship,
    is_primary,
    is_emergency
  )
  values (
    v_adm.business_unit_id,
    v_student_id,
    v_guardian_id,
    btrim(v_adm.guardian_relationship),
    true,
    true
  )
  on conflict (student_id, guardian_id) do update
    set relationship = excluded.relationship,
        is_primary = true,
        is_emergency = true;

  update public.sch_admissions
  set
    student_id = v_student_id,
    status = 'completed',
    updated_at = now()
  where id = v_adm.id;

  return jsonb_build_object(
    'admission_id', v_adm.id,
    'admission_number', v_adm.admission_number,
    'student_id', v_student_id,
    'student_number', v_student_number,
    'enrollment_id', v_enrollment_id,
    'guardian_id', v_guardian_id,
    'already_completed', false
  );
end;
$$;

grant execute on function public.sch_complete_admission(uuid, boolean) to authenticated, service_role;
