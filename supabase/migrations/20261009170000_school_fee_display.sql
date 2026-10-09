-- Compact student numbers going forward (STU-001). Class code on the fee accounts view.
-- Does not rewrite stored student_number values.

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
  v_pad integer := case when p_doc_type = 'student' then 3 else 6 end;
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

  return v_prefix || '-' || lpad(v_next::text, v_pad, '0');
end;
$$;

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
  end as fee_status,
  cl.code as class_code,
  s.status as student_status
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

create index if not exists sch_fee_payments_charge_status_idx
  on public.sch_fee_payments (business_unit_id, charge_id, status);

create index if not exists sch_fee_charges_enrollment_idx
  on public.sch_fee_charges (business_unit_id, enrollment_id)
  where is_active;

create index if not exists sch_student_enrollments_student_idx
  on public.sch_student_enrollments (business_unit_id, student_id)
  where status = 'active';
