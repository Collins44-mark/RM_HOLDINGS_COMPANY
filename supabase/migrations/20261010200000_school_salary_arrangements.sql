-- Per-module salary arrangements (payday, active flag) and period remaining
-- enforced per staff + cost business unit. Additive. Does not rewrite posted payments.

alter table public.sch_staff_salary_allocations
  add column if not exists payday integer not null default 28,
  add column if not exists effective_on date,
  add column if not exists is_active boolean not null default true;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sch_staff_salary_alloc_payday') then
    alter table public.sch_staff_salary_allocations
      add constraint sch_staff_salary_alloc_payday check (payday between 1 and 31);
  end if;
end
$$;

alter table public.sch_staff_salary_payments
  add column if not exists cost_business_unit_id uuid references public.business_units(id) on delete restrict;

update public.sch_staff_salary_payments p
set cost_business_unit_id = p.business_unit_id
where p.cost_business_unit_id is null;

insert into public.sch_staff_salary_allocations (
  business_unit_id, staff_id, cost_business_unit_id, amount, payday, effective_on, is_active
)
select
  s.business_unit_id,
  s.id,
  s.business_unit_id,
  s.monthly_salary,
  28,
  coalesce(s.salary_effective_on, current_date),
  true
from public.sch_staff s
where s.monthly_salary is not null
  and not exists (
    select 1
    from public.sch_staff_salary_allocations a
    where a.staff_id = s.id
      and a.cost_business_unit_id = s.business_unit_id
  );

create index if not exists sch_staff_salary_pay_cost_period_idx
  on public.sch_staff_salary_payments (staff_id, cost_business_unit_id, period_year, period_month)
  where is_active;

drop function if exists public.sch_record_salary_payment(uuid, integer, integer, numeric, date, text, text, text, uuid, uuid);

create or replace function public.sch_record_salary_payment(
  p_staff_id uuid,
  p_period_year integer,
  p_period_month integer,
  p_amount numeric,
  p_payment_date date,
  p_method text,
  p_reference text,
  p_notes text,
  p_request_id uuid,
  p_actor_id uuid,
  p_cost_business_unit_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_bu uuid;
  v_cost uuid;
  v_status text;
  v_first text;
  v_middle text;
  v_last text;
  v_arrangement numeric;
  v_arrangement_active boolean;
  v_paid numeric;
  v_existing uuid;
  v_existing_expense uuid;
  v_payment uuid;
  v_expense uuid;
  v_number text;
  v_method text := upper(btrim(coalesce(p_method, '')));
  v_amount numeric;
  v_cat uuid;
  v_payee text;
begin
  if p_request_id is null then
    raise exception 'Salary payment request is invalid.';
  end if;
  if p_payment_date is null then
    raise exception 'Enter a valid payment date.';
  end if;
  if p_period_year is null or p_period_month is null or p_period_month < 1 or p_period_month > 12 then
    raise exception 'Choose a valid salary period.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero.';
  end if;
  v_amount := round(p_amount, 2);
  if v_method not in ('CASH', 'MOBILE_MONEY', 'BANK') then
    raise exception 'Choose a valid payment method.';
  end if;
  if v_method <> 'CASH' and char_length(btrim(coalesce(p_reference, ''))) < 2 then
    raise exception 'Enter a payment reference.';
  end if;

  select business_unit_id, employment_status, first_name, middle_name, last_name
    into v_bu, v_status, v_first, v_middle, v_last
  from public.sch_staff
  where id = p_staff_id
  for update;
  if v_bu is null then
    raise exception 'Staff member was not found.';
  end if;
  if not public.has_business_unit_access(v_bu) then
    raise exception 'Not authorized for this school.';
  end if;

  v_cost := coalesce(p_cost_business_unit_id, v_bu);
  perform pg_advisory_xact_lock(
    hashtext(p_staff_id::text),
    (p_period_year * 100 + p_period_month)
  );

  select id, expense_id into v_existing, v_existing_expense
  from public.sch_staff_salary_payments
  where business_unit_id = v_bu
    and request_id = p_request_id
  limit 1;
  if v_existing is not null then
    return jsonb_build_object(
      'id', v_existing,
      'expense_id', v_existing_expense,
      'duplicate', true
    );
  end if;

  select a.amount, a.is_active
    into v_arrangement, v_arrangement_active
  from public.sch_staff_salary_allocations a
  where a.staff_id = p_staff_id
    and a.cost_business_unit_id = v_cost
  for update;
  if v_arrangement is null or coalesce(v_arrangement_active, false) = false then
    raise exception 'This employee has no active salary arrangement for that module.';
  end if;
  if v_arrangement <= 0 then
    raise exception 'This employee has no configured salary for that module.';
  end if;

  select coalesce(sum(amount), 0) into v_paid
  from public.sch_staff_salary_payments
  where business_unit_id = v_bu
    and staff_id = p_staff_id
    and coalesce(cost_business_unit_id, business_unit_id) = v_cost
    and period_year = p_period_year
    and period_month = p_period_month
    and is_active;

  if (v_paid + v_amount) > (v_arrangement + 0.005) then
    raise exception 'This payment exceeds the remaining salary for the period.';
  end if;

  v_cat := public.sch_ensure_expense_category(v_bu, 'SALARY', 'Salaries');
  v_number := public.sch_next_document_number(v_bu, 'expense', 'EXP');
  v_payee := btrim(concat_ws(' ', v_first, nullif(v_middle, ''), v_last));

  insert into public.sch_staff_salary_payments (
    business_unit_id, staff_id, cost_business_unit_id, period_year, period_month, amount, payment_date,
    method, reference, notes, request_id, recorded_by, is_active
  )
  values (
    v_bu, p_staff_id, v_cost, p_period_year, p_period_month, v_amount, p_payment_date,
    v_method, btrim(coalesce(p_reference, '')), btrim(coalesce(p_notes, '')),
    p_request_id, p_actor_id, true
  )
  returning id into v_payment;

  insert into public.sch_expenses (
    business_unit_id, category_id, expense_number, expense_date, amount, description, reference,
    method, payee, bus_id, source_type, source_id, request_id, recorded_by, is_active
  )
  values (
    v_bu, v_cat, v_number, p_payment_date, v_amount,
    format('Salary · %s · %s-%s', v_payee, p_period_year, lpad(p_period_month::text, 2, '0')),
    btrim(coalesce(p_reference, '')),
    v_method, v_payee, null,
    'SALARY', v_payment, p_request_id, p_actor_id, true
  )
  returning id into v_expense;

  update public.sch_staff_salary_payments
    set expense_id = v_expense
  where id = v_payment
    and business_unit_id = v_bu;

  return jsonb_build_object(
    'id', v_payment,
    'expense_id', v_expense,
    'expense_number', v_number,
    'amount', v_amount,
    'duplicate', false
  );
end;
$$;

revoke all on function public.sch_record_salary_payment(uuid, integer, integer, numeric, date, text, text, text, uuid, uuid, uuid) from public, anon;
grant execute on function public.sch_record_salary_payment(uuid, integer, integer, numeric, date, text, text, text, uuid, uuid, uuid) to authenticated, service_role;
