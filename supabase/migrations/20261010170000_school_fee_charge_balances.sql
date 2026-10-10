-- Per-charge billed / allocated / outstanding. Enrollment view rolls these up
-- without using a tuition charge id as a stand-in for transport payments.
-- Does not rewrite historical payments.

create or replace view public.sch_v_fee_charge_balances
with (security_invoker = true) as
select
  c.id as charge_id,
  c.business_unit_id,
  c.enrollment_id,
  c.student_id,
  c.academic_year_id,
  c.fee_structure_id,
  c.charge_kind,
  c.route_id,
  c.assignment_id,
  c.billing_frequency,
  c.billing_period,
  c.annual_amount as billed_amount,
  c.is_active,
  coalesce(paid.paid, 0)::numeric(14, 2) as paid_amount,
  greatest(c.annual_amount - coalesce(paid.paid, 0), 0)::numeric as outstanding_amount
from public.sch_fee_charges c
left join lateral (
  select coalesce(sum(p.amount), 0) as paid
  from public.sch_fee_payments p
  where p.charge_id = c.id
    and p.status in ('pending', 'posted')
) paid on true;

grant select on public.sch_v_fee_charge_balances to authenticated, service_role;

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
  tuition.charge_id,
  (
    case
      when tuition.billed_amount is null
        and coalesce(transport.due_amount, 0::numeric(14, 2)) = 0::numeric(14, 2)
        and fs.annual_amount is null then null
      else coalesce(tuition.billed_amount, fs.annual_amount, 0::numeric(14, 2))
        + coalesce(transport.due_amount, 0::numeric(14, 2))
    end
  )::numeric(14, 2) as due_amount,
  (
    coalesce(tuition.paid_amount, 0::numeric(14, 2))
    + coalesce(transport.paid_amount, 0::numeric(14, 2))
  )::numeric(14, 2) as paid_amount,
  (
    case
      when tuition.billed_amount is null
        and coalesce(transport.due_amount, 0) = 0
        and fs.annual_amount is null then null
      else greatest(
        coalesce(tuition.billed_amount, fs.annual_amount, 0)
        + coalesce(transport.due_amount, 0)
        - coalesce(tuition.paid_amount, 0)
        - coalesce(transport.paid_amount, 0),
        0
      )
    end
  )::numeric as outstanding_amount,
  case
    when fs.id is null and tuition.charge_id is null and coalesce(transport.due_amount, 0) = 0 then 'no_structure'
    when (
      coalesce(tuition.billed_amount, fs.annual_amount, 0) + coalesce(transport.due_amount, 0)
      - coalesce(tuition.paid_amount, 0) - coalesce(transport.paid_amount, 0)
    ) <= 0 then 'paid'
    when coalesce(tuition.paid_amount, 0) + coalesce(transport.paid_amount, 0) > 0 then 'partial'
    else 'outstanding'
  end as fee_status,
  cl.code as class_code,
  s.status as student_status,
  tuition.billed_amount as tuition_due_amount,
  tuition.paid_amount as tuition_paid_amount,
  transport.due_amount as transport_due_amount,
  transport.paid_amount as transport_paid_amount
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
left join public.sch_v_fee_charge_balances tuition
  on tuition.enrollment_id = e.id
 and tuition.is_active
 and tuition.charge_kind = 'TUITION'
left join lateral (
  select
    coalesce(sum(b.billed_amount), 0)::numeric(14, 2) as due_amount,
    coalesce(sum(b.paid_amount), 0)::numeric(14, 2) as paid_amount
  from public.sch_v_fee_charge_balances b
  where b.enrollment_id = e.id
    and b.is_active
    and b.charge_kind = 'TRANSPORT'
) transport on true
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
  p_actor_id uuid,
  p_charge_id uuid default null
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
  v_kind text;
  v_posted numeric;
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

  if p_charge_id is not null then
    select ch.id, ch.annual_amount, ch.charge_kind
      into v_charge, v_annual, v_kind
    from public.sch_fee_charges ch
    where ch.id = p_charge_id
      and ch.enrollment_id = p_enrollment_id
      and ch.business_unit_id = v_bu
      and ch.is_active;
    if v_charge is null then
      raise exception 'Fee charge was not found.';
    end if;
  else
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
      and ch.charge_kind = 'TUITION'
    limit 1;

    if v_charge is null then
      insert into public.sch_fee_charges (
        business_unit_id, student_id, enrollment_id, fee_structure_id,
        academic_year_id, level_id, class_id, annual_amount, is_active, charge_kind
      )
      values (
        v_bu, v_student, p_enrollment_id, v_structure,
        v_year, v_level, v_class, v_annual, true, 'TUITION'
      )
      returning id into v_charge;
    else
      select ch.annual_amount into v_annual
      from public.sch_fee_charges ch
      where ch.id = v_charge;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext(v_charge::text)::bigint);

  select coalesce(sum(amount), 0)
    into v_posted
  from public.sch_fee_payments
  where charge_id = v_charge
    and status in ('posted', 'pending');

  v_available := v_annual - v_posted;
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

  return jsonb_build_object(
    'id', v_payment,
    'payment_number', v_number,
    'charge_id', v_charge,
    'outstanding', v_available - p_amount,
    'duplicate', false
  );
end;
$$;

grant execute on function public.sch_record_fee_payment(uuid, numeric, text, date, text, text, uuid, uuid, uuid) to authenticated, service_role;
