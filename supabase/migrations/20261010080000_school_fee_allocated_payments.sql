-- Count recorded fee payments (pending and posted) as allocated collections.
-- New recordings are posted immediately so balances and group revenue stay in sync.
-- Existing pending rows are not rewritten.

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
  coalesce(allocated.paid, 0)::numeric(14, 2) as paid_amount,
  case
    when coalesce(ch.annual_amount, fs.annual_amount) is null then null
    else greatest(coalesce(ch.annual_amount, fs.annual_amount) - coalesce(allocated.paid, 0), 0)
  end as outstanding_amount,
  case
    when fs.id is null and ch.id is null then 'no_structure'
    when coalesce(ch.annual_amount, fs.annual_amount) - coalesce(allocated.paid, 0) <= 0 then 'paid'
    when coalesce(allocated.paid, 0) > 0 then 'partial'
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
    and p.status in ('pending', 'posted')
) allocated on true
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

  select coalesce(sum(amount) filter (where status in ('posted', 'pending')), 0), 0
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
    'posted', p_request_id, p_actor_id
  )
  returning id into v_payment;

  return jsonb_build_object('id', v_payment, 'payment_number', v_number, 'duplicate', false);
end;
$$;

grant execute on function public.sch_record_fee_payment(uuid, numeric, text, date, text, text, uuid, uuid) to authenticated, service_role;
