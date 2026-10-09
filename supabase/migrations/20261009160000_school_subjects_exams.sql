-- Class-subject assignments, exams, results. Reuses sch_subjects. Additive.

insert into public.permissions (code, module, resource, action, name)
values
  ('school.subjects.view', 'school', 'subjects', 'view', 'View school subjects'),
  ('school.subjects.manage', 'school', 'subjects', 'manage', 'Manage school subjects'),
  ('school.exams.view', 'school', 'exams', 'view', 'View school exams'),
  ('school.exams.manage', 'school', 'exams', 'manage', 'Manage school exams'),
  ('school.results.enter', 'school', 'results', 'enter', 'Enter school exam results'),
  ('school.results.publish', 'school', 'results', 'publish', 'Publish school exam results')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code in ('SCHOOL_ADMIN', 'SCHOOL_MANAGER')
  and p.code in (
    'school.subjects.view',
    'school.subjects.manage',
    'school.exams.view',
    'school.exams.manage',
    'school.results.enter',
    'school.results.publish'
  )
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code = 'HEADMASTER'
  and p.code in ('school.subjects.view', 'school.exams.view', 'school.results.publish')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code = 'TEACHER'
  and p.code in ('school.subjects.view', 'school.exams.view', 'school.results.enter')
on conflict do nothing;

do $$
begin
  if not exists (
    select 1
    from public.sch_subjects
    group by business_unit_id, lower(btrim(name))
    having count(*) > 1
  ) then
    create unique index if not exists sch_subjects_name_uidx
      on public.sch_subjects (business_unit_id, lower(btrim(name)));
  end if;
end
$$;

create table if not exists public.sch_class_subjects (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  class_id uuid not null,
  subject_id uuid not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_class_subjects_class_bu_fk foreign key (class_id, business_unit_id)
    references public.sch_classes (id, business_unit_id) on delete restrict,
  constraint sch_class_subjects_subject_bu_fk foreign key (subject_id, business_unit_id)
    references public.sch_subjects (id, business_unit_id) on delete restrict,
  constraint sch_class_subjects_class_subject_key unique (class_id, subject_id)
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sch_class_subjects_id_bu_key') then
    alter table public.sch_class_subjects
      add constraint sch_class_subjects_id_bu_key unique (id, business_unit_id);
  end if;
end
$$;

create index if not exists sch_class_subjects_class_idx
  on public.sch_class_subjects (business_unit_id, class_id)
  where is_active;

drop trigger if exists sch_class_subjects_touch on public.sch_class_subjects;
create trigger sch_class_subjects_touch before update on public.sch_class_subjects
  for each row execute function public.sch_touch_updated_at();

create table if not exists public.sch_exams (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  academic_year_id uuid not null,
  term_id uuid,
  class_id uuid not null,
  name text not null,
  exam_type text not null,
  exam_date date not null,
  max_marks numeric(8, 2) not null default 100,
  status text not null default 'draft',
  created_by uuid references public.profiles(id) on delete set null,
  published_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_exams_name_len check (char_length(btrim(name)) between 1 and 80),
  constraint sch_exams_type check (exam_type in ('midterm', 'final', 'test', 'assessment', 'other')),
  constraint sch_exams_status check (status in ('draft', 'published')),
  constraint sch_exams_marks check (max_marks > 0),
  constraint sch_exams_year_bu_fk foreign key (academic_year_id, business_unit_id)
    references public.sch_academic_years (id, business_unit_id) on delete restrict,
  constraint sch_exams_term_bu_fk foreign key (term_id, business_unit_id)
    references public.sch_terms (id, business_unit_id) on delete restrict,
  constraint sch_exams_class_bu_fk foreign key (class_id, business_unit_id)
    references public.sch_classes (id, business_unit_id) on delete restrict
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sch_exams_id_bu_key') then
    alter table public.sch_exams
      add constraint sch_exams_id_bu_key unique (id, business_unit_id);
  end if;
end
$$;

create index if not exists sch_exams_class_idx
  on public.sch_exams (business_unit_id, class_id, exam_date desc);

drop trigger if exists sch_exams_touch on public.sch_exams;
create trigger sch_exams_touch before update on public.sch_exams
  for each row execute function public.sch_touch_updated_at();

create table if not exists public.sch_exam_papers (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  exam_id uuid not null,
  subject_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_exam_papers_exam_bu_fk foreign key (exam_id, business_unit_id)
    references public.sch_exams (id, business_unit_id) on delete restrict,
  constraint sch_exam_papers_subject_bu_fk foreign key (subject_id, business_unit_id)
    references public.sch_subjects (id, business_unit_id) on delete restrict,
  constraint sch_exam_papers_exam_subject_key unique (exam_id, subject_id)
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sch_exam_papers_id_bu_key') then
    alter table public.sch_exam_papers
      add constraint sch_exam_papers_id_bu_key unique (id, business_unit_id);
  end if;
end
$$;

create index if not exists sch_exam_papers_exam_idx
  on public.sch_exam_papers (exam_id);

drop trigger if exists sch_exam_papers_touch on public.sch_exam_papers;
create trigger sch_exam_papers_touch before update on public.sch_exam_papers
  for each row execute function public.sch_touch_updated_at();

create table if not exists public.sch_exam_results (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  exam_id uuid not null,
  paper_id uuid not null,
  subject_id uuid not null,
  student_id uuid not null,
  enrollment_id uuid not null,
  marks numeric(8, 2) not null,
  grade text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_exam_results_marks check (marks >= 0),
  constraint sch_exam_results_exam_bu_fk foreign key (exam_id, business_unit_id)
    references public.sch_exams (id, business_unit_id) on delete restrict,
  constraint sch_exam_results_paper_bu_fk foreign key (paper_id, business_unit_id)
    references public.sch_exam_papers (id, business_unit_id) on delete restrict,
  constraint sch_exam_results_subject_bu_fk foreign key (subject_id, business_unit_id)
    references public.sch_subjects (id, business_unit_id) on delete restrict,
  constraint sch_exam_results_student_bu_fk foreign key (student_id, business_unit_id)
    references public.sch_students (id, business_unit_id) on delete restrict,
  constraint sch_exam_results_enrollment_bu_fk foreign key (enrollment_id, business_unit_id)
    references public.sch_student_enrollments (id, business_unit_id) on delete restrict,
  constraint sch_exam_results_exam_subject_student_key unique (exam_id, subject_id, student_id)
);

create index if not exists sch_exam_results_exam_idx
  on public.sch_exam_results (exam_id, student_id);

drop trigger if exists sch_exam_results_touch on public.sch_exam_results;
create trigger sch_exam_results_touch before update on public.sch_exam_results
  for each row execute function public.sch_touch_updated_at();

alter table public.sch_class_subjects enable row level security;
alter table public.sch_exams enable row level security;
alter table public.sch_exam_papers enable row level security;
alter table public.sch_exam_results enable row level security;

revoke all on public.sch_class_subjects, public.sch_exams, public.sch_exam_papers, public.sch_exam_results
  from anon, public;
grant select, insert, update on public.sch_class_subjects, public.sch_exams, public.sch_exam_papers, public.sch_exam_results
  to authenticated, service_role;

drop policy if exists sch_class_subjects_select on public.sch_class_subjects;
create policy sch_class_subjects_select on public.sch_class_subjects
  for select to authenticated using (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_class_subjects_insert on public.sch_class_subjects;
create policy sch_class_subjects_insert on public.sch_class_subjects
  for insert to authenticated with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_class_subjects_update on public.sch_class_subjects;
create policy sch_class_subjects_update on public.sch_class_subjects
  for update to authenticated
  using (public.has_business_unit_access(business_unit_id))
  with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_class_subjects_delete on public.sch_class_subjects;
create policy sch_class_subjects_delete on public.sch_class_subjects
  for delete to authenticated using (false);

drop policy if exists sch_exams_select on public.sch_exams;
create policy sch_exams_select on public.sch_exams
  for select to authenticated using (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_exams_insert on public.sch_exams;
create policy sch_exams_insert on public.sch_exams
  for insert to authenticated with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_exams_update on public.sch_exams;
create policy sch_exams_update on public.sch_exams
  for update to authenticated
  using (public.has_business_unit_access(business_unit_id))
  with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_exams_delete on public.sch_exams;
create policy sch_exams_delete on public.sch_exams
  for delete to authenticated using (false);

drop policy if exists sch_exam_papers_select on public.sch_exam_papers;
create policy sch_exam_papers_select on public.sch_exam_papers
  for select to authenticated using (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_exam_papers_insert on public.sch_exam_papers;
create policy sch_exam_papers_insert on public.sch_exam_papers
  for insert to authenticated with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_exam_papers_update on public.sch_exam_papers;
create policy sch_exam_papers_update on public.sch_exam_papers
  for update to authenticated
  using (public.has_business_unit_access(business_unit_id))
  with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_exam_papers_delete on public.sch_exam_papers;
create policy sch_exam_papers_delete on public.sch_exam_papers
  for delete to authenticated using (false);

drop policy if exists sch_exam_results_select on public.sch_exam_results;
create policy sch_exam_results_select on public.sch_exam_results
  for select to authenticated using (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_exam_results_insert on public.sch_exam_results;
create policy sch_exam_results_insert on public.sch_exam_results
  for insert to authenticated with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_exam_results_update on public.sch_exam_results;
create policy sch_exam_results_update on public.sch_exam_results
  for update to authenticated
  using (public.has_business_unit_access(business_unit_id))
  with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_exam_results_delete on public.sch_exam_results;
create policy sch_exam_results_delete on public.sch_exam_results
  for delete to authenticated using (false);

create or replace function public.sch_assign_class_subjects(p_class_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bu uuid;
  v_item jsonb;
  v_name text;
  v_id uuid;
  v_code text;
  v_n int := 0;
  v_ids uuid[] := '{}';
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select business_unit_id into v_bu
  from public.sch_classes
  where id = p_class_id and is_active
  limit 1;
  if v_bu is null then
    raise exception 'Class was not found.' using errcode = 'P0002';
  end if;
  if not public.has_business_unit_access(v_bu) then
    raise exception 'This action isn’t available.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'Add at least one subject.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 40 then
    raise exception 'Too many subjects in one save.' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_id := nullif(btrim(coalesce(v_item->>'id', '')), '')::uuid;
    v_name := btrim(coalesce(v_item->>'name', ''));

    if v_id is not null then
      select id into v_id
      from public.sch_subjects
      where id = v_id and business_unit_id = v_bu
      limit 1;
      if v_id is null then
        raise exception 'A selected subject was not found.' using errcode = 'P0002';
      end if;
    else
      if char_length(v_name) not between 1 and 80 then
        raise exception 'Each subject needs a name.' using errcode = '22023';
      end if;
      select id into v_id
      from public.sch_subjects
      where business_unit_id = v_bu and lower(btrim(name)) = lower(v_name)
      order by created_at
      limit 1;
      if v_id is null then
        v_code := upper(regexp_replace(regexp_replace(v_name, '[^A-Za-z0-9]+', '-', 'g'), '^-|-$', '', 'g'));
        v_code := left(v_code, 40);
        if v_code = '' then
          raise exception 'A code could not be generated.' using errcode = '22023';
        end if;
        while exists (
          select 1 from public.sch_subjects
          where business_unit_id = v_bu and lower(btrim(code)) = lower(v_code)
        ) loop
          v_code := left(v_code, 32) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
        end loop;
        insert into public.sch_subjects (business_unit_id, name, code, is_active)
        values (v_bu, v_name, v_code, true)
        returning id into v_id;
      else
        update public.sch_subjects set is_active = true where id = v_id and not is_active;
      end if;
    end if;

    insert into public.sch_class_subjects (business_unit_id, class_id, subject_id, is_active)
    values (v_bu, p_class_id, v_id, true)
    on conflict (class_id, subject_id) do update
      set is_active = true, updated_at = now();

    v_n := v_n + 1;
    v_ids := array_append(v_ids, v_id);
  end loop;

  return jsonb_build_object('assigned', v_n, 'subjectIds', to_jsonb(v_ids));
end;
$$;

create or replace function public.sch_create_exam(
  p_name text,
  p_exam_type text,
  p_academic_year_id uuid,
  p_term_id uuid,
  p_exam_date date,
  p_class_id uuid,
  p_max_marks numeric,
  p_subject_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bu uuid;
  v_exam uuid;
  v_subject uuid;
  v_level uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select c.business_unit_id, c.level_id into v_bu, v_level
  from public.sch_classes c
  where c.id = p_class_id and c.is_active
  limit 1;
  if v_bu is null then
    raise exception 'Class was not found.' using errcode = 'P0002';
  end if;
  if not public.has_business_unit_access(v_bu) then
    raise exception 'This action isn’t available.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 80 then
    raise exception 'Enter an exam name.' using errcode = '22023';
  end if;
  if p_exam_type not in ('midterm', 'final', 'test', 'assessment', 'other') then
    raise exception 'Choose a valid exam type.' using errcode = '22023';
  end if;
  if p_max_marks is null or p_max_marks <= 0 then
    raise exception 'Maximum marks must be greater than zero.' using errcode = '22023';
  end if;
  if p_subject_ids is null or array_length(p_subject_ids, 1) is null then
    raise exception 'Select at least one subject assigned to this class.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.sch_academic_years
    where id = p_academic_year_id and business_unit_id = v_bu and is_active
  ) then
    raise exception 'Academic year was not found.' using errcode = 'P0002';
  end if;
  if p_term_id is not null and not exists (
    select 1 from public.sch_terms
    where id = p_term_id and business_unit_id = v_bu and academic_year_id = p_academic_year_id and is_active
  ) then
    raise exception 'Term does not belong to the selected academic year.' using errcode = '22023';
  end if;

  foreach v_subject in array p_subject_ids
  loop
    if not exists (
      select 1 from public.sch_class_subjects
      where class_id = p_class_id and subject_id = v_subject and is_active
    ) then
      raise exception 'Only subjects assigned to this class can be added to an exam.' using errcode = '22023';
    end if;
  end loop;

  insert into public.sch_exams (
    business_unit_id, academic_year_id, term_id, class_id, name, exam_type, exam_date, max_marks, status, created_by
  )
  values (
    v_bu, p_academic_year_id, p_term_id, p_class_id, btrim(p_name), p_exam_type, p_exam_date, p_max_marks, 'draft', auth.uid()
  )
  returning id into v_exam;

  insert into public.sch_exam_papers (business_unit_id, exam_id, subject_id)
  select v_bu, v_exam, distinct_id
  from (select distinct unnest(p_subject_ids) as distinct_id) d;

  return v_exam;
end;
$$;

create or replace function public.sch_upsert_exam_results(p_exam_id uuid, p_marks jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exam public.sch_exams%rowtype;
  v_item jsonb;
  v_student uuid;
  v_subject uuid;
  v_enrollment uuid;
  v_paper uuid;
  v_marks numeric;
  v_enroll_student uuid;
  v_enroll_class uuid;
  v_pct numeric;
  v_grade text;
  v_n int := 0;
  v_scale uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_exam from public.sch_exams where id = p_exam_id;
  if v_exam.id is null then
    raise exception 'Exam was not found.' using errcode = 'P0002';
  end if;
  if not public.has_business_unit_access(v_exam.business_unit_id) then
    raise exception 'This action isn’t available.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_marks) is distinct from 'array' or jsonb_array_length(p_marks) < 1 then
    raise exception 'Enter at least one mark.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_marks) > 2000 then
    raise exception 'Too many marks in one save.' using errcode = '22023';
  end if;

  select id into v_scale
  from public.sch_grading_scales
  where business_unit_id = v_exam.business_unit_id and is_current
  limit 1;

  for v_item in select value from jsonb_array_elements(p_marks)
  loop
    v_student := nullif(btrim(coalesce(v_item->>'studentId', '')), '')::uuid;
    v_subject := nullif(btrim(coalesce(v_item->>'subjectId', '')), '')::uuid;
    v_enrollment := nullif(btrim(coalesce(v_item->>'enrollmentId', '')), '')::uuid;
    v_marks := nullif(btrim(coalesce(v_item->>'marks', '')), '')::numeric;
    if v_student is null or v_subject is null or v_enrollment is null or v_marks is null then
      raise exception 'Each result needs a student, subject, enrollment, and mark.' using errcode = '22023';
    end if;
    if v_marks < 0 or v_marks > v_exam.max_marks then
      raise exception 'Marks must be between 0 and the exam maximum.' using errcode = '22023';
    end if;

    select id into v_paper
    from public.sch_exam_papers
    where exam_id = v_exam.id and subject_id = v_subject
    limit 1;
    if v_paper is null then
      raise exception 'That subject is not part of this exam.' using errcode = '22023';
    end if;

    select student_id, class_id into v_enroll_student, v_enroll_class
    from public.sch_student_enrollments
    where id = v_enrollment and business_unit_id = v_exam.business_unit_id
    limit 1;
    if v_enroll_student is null or v_enroll_student is distinct from v_student then
      raise exception 'Enrollment does not match the student.' using errcode = '22023';
    end if;
    if v_enroll_class is distinct from v_exam.class_id then
      raise exception 'Student is not enrolled in this exam’s class.' using errcode = '22023';
    end if;

    v_grade := null;
    if v_scale is not null then
      v_pct := round((v_marks / v_exam.max_marks) * 100, 2);
      select btrim(grade) into v_grade
      from public.sch_grading_bands
      where scale_id = v_scale and v_pct >= min_mark and v_pct <= max_mark
      order by sort_order
      limit 1;
    end if;

    insert into public.sch_exam_results (
      business_unit_id, exam_id, paper_id, subject_id, student_id, enrollment_id, marks, grade
    )
    values (
      v_exam.business_unit_id, v_exam.id, v_paper, v_subject, v_student, v_enrollment, v_marks, v_grade
    )
    on conflict (exam_id, subject_id, student_id) do update
      set marks = excluded.marks,
          grade = excluded.grade,
          enrollment_id = excluded.enrollment_id,
          paper_id = excluded.paper_id,
          updated_at = now();

    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

revoke all on function public.sch_assign_class_subjects(uuid, jsonb) from public;
revoke all on function public.sch_create_exam(text, text, uuid, uuid, date, uuid, numeric, uuid[]) from public;
revoke all on function public.sch_upsert_exam_results(uuid, jsonb) from public;
grant execute on function public.sch_assign_class_subjects(uuid, jsonb) to authenticated, service_role;
grant execute on function public.sch_create_exam(text, text, uuid, uuid, date, uuid, numeric, uuid[]) to authenticated, service_role;
grant execute on function public.sch_upsert_exam_results(uuid, jsonb) to authenticated, service_role;
