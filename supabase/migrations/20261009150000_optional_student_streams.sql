-- Student streams are optional. Placement is Level → Class → optional Stream.
-- Persist class_id on admissions and enrollments so a student stays linked to a class without a stream.

alter table public.sch_admissions
  add column if not exists class_id uuid;

update public.sch_admissions a
set class_id = s.class_id
from public.sch_class_streams s
where a.stream_id = s.id
  and a.class_id is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sch_admissions_class_bu_fk') then
    alter table public.sch_admissions
      add constraint sch_admissions_class_bu_fk foreign key (class_id, business_unit_id)
      references public.sch_classes (id, business_unit_id) on delete restrict;
  end if;
end
$$;

alter table public.sch_student_enrollments
  add column if not exists class_id uuid;

update public.sch_student_enrollments e
set class_id = s.class_id
from public.sch_class_streams s
where e.stream_id = s.id
  and e.class_id is null;

alter table public.sch_student_enrollments
  alter column stream_id drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sch_enrollments_class_bu_fk') then
    alter table public.sch_student_enrollments
      add constraint sch_enrollments_class_bu_fk foreign key (class_id, business_unit_id)
      references public.sch_classes (id, business_unit_id) on delete restrict;
  end if;
end
$$;

alter table public.sch_student_enrollments
  alter column class_id set not null;

create or replace function public.sch_enrollment_stream_matches_class()
returns trigger
language plpgsql
as $$
begin
  if new.class_id is null then
    raise exception 'Class is required.';
  end if;
  if new.stream_id is not null and not exists (
    select 1
    from public.sch_class_streams s
    where s.id = new.stream_id
      and s.class_id = new.class_id
      and s.business_unit_id = new.business_unit_id
  ) then
    raise exception 'The selected stream does not belong to that class.';
  end if;
  return new;
end;
$$;

drop trigger if exists sch_enrollments_stream_class on public.sch_student_enrollments;
create trigger sch_enrollments_stream_class
  before insert or update of class_id, stream_id, business_unit_id
  on public.sch_student_enrollments
  for each row execute function public.sch_enrollment_stream_matches_class();

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
  if v_adm.academic_year_id is null or v_adm.class_id is null then
    raise exception 'Academic year, level, and class are required.';
  end if;
  if char_length(btrim(v_adm.guardian_full_name)) < 1 or char_length(btrim(v_adm.guardian_relationship)) < 1 then
    raise exception 'Guardian name and relationship are required.';
  end if;
  if char_length(btrim(v_adm.guardian_phone)) < 1 then
    raise exception 'Guardian phone is required.';
  end if;

  select * into v_class
  from public.sch_classes
  where id = v_adm.class_id
    and business_unit_id = v_adm.business_unit_id;
  if not found or not v_class.is_active then
    raise exception 'Selected class is not valid for this school.';
  end if;

  if v_adm.stream_id is not null then
    select * into v_stream
    from public.sch_class_streams
    where id = v_adm.stream_id
      and business_unit_id = v_adm.business_unit_id;
    if not found or not v_stream.is_active then
      raise exception 'Selected stream is not valid for this school.';
    end if;
    if v_stream.class_id <> v_class.id then
      raise exception 'The selected stream does not belong to that class.';
    end if;
  end if;

  if not public.has_school_academic_scope(v_adm.business_unit_id, v_class.level_id, v_class.id, v_adm.stream_id) then
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
    class_id,
    stream_id,
    status,
    started_on
  )
  values (
    v_adm.business_unit_id,
    v_student_id,
    v_adm.academic_year_id,
    v_adm.term_id,
    v_adm.class_id,
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

create or replace view public.sch_v_fee_accounts
with (security_invoker = true) as
select
  e.id as enrollment_id,
  e.business_unit_id,
  e.student_id,
  e.academic_year_id,
  e.term_id as enrollment_term_id,
  e.stream_id,
  s.student_number,
  btrim(concat_ws(' ', s.first_name, nullif(btrim(s.middle_name), ''), s.last_name)) as student_name,
  s.first_name,
  s.middle_name,
  s.last_name,
  a.admission_number,
  st.name as stream_name,
  cl.id as class_id,
  cl.name as class_name,
  cl.level_id,
  lv.name as level_name,
  y.name as academic_year_name,
  fs.id as fee_structure_id,
  ch.id as charge_id,
  coalesce(ch.annual_amount, fs.annual_amount) as due_amount,
  coalesce(posted.paid, 0)::numeric(14, 2) as paid_amount,
  case
    when coalesce(ch.annual_amount, fs.annual_amount) is null then null
    else greatest(coalesce(ch.annual_amount, fs.annual_amount) - coalesce(posted.paid, 0), 0)
  end as outstanding_amount,
  case
    when fs.id is null and ch.id is null then 'no_structure'
    when coalesce(ch.annual_amount, fs.annual_amount) - coalesce(posted.paid, 0) <= 0 then 'paid'
    when coalesce(posted.paid, 0) > 0 then 'partial'
    else 'outstanding'
  end as fee_status
from public.sch_student_enrollments e
join public.sch_students s
  on s.id = e.student_id
 and s.business_unit_id = e.business_unit_id
left join public.sch_admissions a
  on a.student_id = s.id
 and a.business_unit_id = e.business_unit_id
left join public.sch_class_streams st
  on st.id = e.stream_id
 and st.business_unit_id = e.business_unit_id
join public.sch_classes cl
  on cl.id = e.class_id
 and cl.business_unit_id = e.business_unit_id
join public.sch_class_levels lv
  on lv.id = cl.level_id
 and lv.business_unit_id = e.business_unit_id
join public.sch_academic_years y
  on y.id = e.academic_year_id
 and y.business_unit_id = e.business_unit_id
left join public.sch_fee_structures fs
  on fs.business_unit_id = e.business_unit_id
 and fs.academic_year_id = e.academic_year_id
 and fs.class_id = cl.id
 and fs.is_active
left join public.sch_fee_charges ch
  on ch.enrollment_id = e.id
 and ch.is_active
left join lateral (
  select coalesce(sum(p.amount), 0) as paid
  from public.sch_fee_payments p
  where p.charge_id = ch.id
    and p.status = 'posted'
) posted on true
where e.status = 'active'
  and s.status = 'active';

grant select on public.sch_v_fee_accounts to authenticated, service_role;

create or replace function public.sch_record_fee_payment(
  p_enrollment_id uuid,
  p_amount numeric,
  p_method text,
  p_payment_date date,
  p_reference text,
  p_notes text,
  p_request_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bu uuid;
  v_student uuid;
  v_year uuid;
  v_stream uuid;
  v_class uuid;
  v_level uuid;
  v_structure uuid;
  v_annual numeric;
  v_charge uuid;
  v_posted numeric;
  v_pending numeric;
  v_available numeric;
  v_number text;
  v_payment uuid;
  v_existing uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter a valid payment amount.';
  end if;
  if p_method not in ('CASH', 'MOBILE_MONEY', 'BANK') then
    raise exception 'Choose a valid payment method.';
  end if;
  if p_method <> 'CASH' and char_length(btrim(coalesce(p_reference, ''))) < 1 then
    raise exception 'A payment reference is required for this method.';
  end if;
  if p_request_id is null then
    raise exception 'Payment request is invalid.';
  end if;

  select e.business_unit_id, e.student_id, e.academic_year_id, e.stream_id, e.class_id
    into v_bu, v_student, v_year, v_stream, v_class
  from public.sch_student_enrollments e
  join public.sch_students s on s.id = e.student_id and s.business_unit_id = e.business_unit_id
  where e.id = p_enrollment_id
    and e.status = 'active'
    and s.status = 'active';
  if v_bu is null then
    raise exception 'Enrollment was not found.';
  end if;
  if not public.has_business_unit_access(v_bu) then
    raise exception 'Not authorized for this school.';
  end if;

  select p.id into v_existing
  from public.sch_fee_payments p
  where p.business_unit_id = v_bu
    and p.request_id = p_request_id;
  if v_existing is not null then
    return jsonb_build_object('id', v_existing, 'duplicate', true);
  end if;

  perform pg_advisory_xact_lock(hashtext(p_enrollment_id::text)::bigint);

  if v_class is null and v_stream is not null then
    select st.class_id into v_class
    from public.sch_class_streams st
    where st.id = v_stream
      and st.business_unit_id = v_bu;
  end if;
  select cl.level_id into v_level
  from public.sch_classes cl
  where cl.id = v_class
    and cl.business_unit_id = v_bu;
  if v_class is null or v_level is null then
    raise exception 'Academic placement was not found.';
  end if;

  select fs.id, fs.annual_amount into v_structure, v_annual
  from public.sch_fee_structures fs
  where fs.business_unit_id = v_bu
    and fs.academic_year_id = v_year
    and fs.class_id = v_class
    and fs.is_active
  limit 1;
  if v_structure is null then
    raise exception 'Fee structure not configured for this class.';
  end if;

  select ch.id into v_charge
  from public.sch_fee_charges ch
  where ch.enrollment_id = p_enrollment_id
    and ch.is_active
  limit 1;

  if v_charge is null then
    insert into public.sch_fee_charges (
      business_unit_id, student_id, enrollment_id, fee_structure_id,
      academic_year_id, level_id, class_id, annual_amount, is_active
    )
    values (
      v_bu, v_student, p_enrollment_id, v_structure,
      v_year, v_level, v_class, v_annual, true
    )
    returning id into v_charge;
  else
    select ch.annual_amount into v_annual
    from public.sch_fee_charges ch
    where ch.id = v_charge;
  end if;

  select coalesce(sum(amount) filter (where status = 'posted'), 0),
         coalesce(sum(amount) filter (where status = 'pending'), 0)
    into v_posted, v_pending
  from public.sch_fee_payments
  where charge_id = v_charge;

  v_available := v_annual - v_posted - v_pending;
  if p_amount > v_available then
    raise exception 'Amount cannot exceed the outstanding balance.';
  end if;

  v_number := public.sch_next_document_number(v_bu, 'fee_payment', 'PAY');

  insert into public.sch_fee_payments (
    business_unit_id, charge_id, enrollment_id, student_id, payment_number,
    amount, method, payment_date, reference, notes, status, request_id, recorded_by
  )
  values (
    v_bu, v_charge, p_enrollment_id, v_student, v_number,
    p_amount, p_method, p_payment_date, btrim(coalesce(p_reference, '')), btrim(coalesce(p_notes, '')),
    'pending', p_request_id, p_actor_id
  )
  returning id into v_payment;

  return jsonb_build_object('id', v_payment, 'payment_number', v_number, 'duplicate', false);
end;
$$;

grant execute on function public.sch_record_fee_payment(uuid, numeric, text, date, text, text, uuid, uuid) to authenticated, service_role;
