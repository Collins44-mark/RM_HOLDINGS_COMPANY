-- Canonical school staff: optional employment type/position, monthly salary,
-- salary history, cost allocations, and cash salary payments posted to sch_expenses.
-- Additive. Does not drop staff, users, or existing expenses. Does not invent salary amounts.

insert into public.permissions (code, module, resource, action, name)
values
  ('school.payroll.view', 'school', 'payroll', 'view', 'View school salaries'),
  ('school.payroll.manage', 'school', 'payroll', 'manage', 'Manage school salaries'),
  ('school.payroll.pay', 'school', 'payroll', 'pay', 'Record school salary payments')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code in ('SCHOOL_ADMIN', 'SCHOOL_MANAGER')
  and p.code in ('school.payroll.view', 'school.payroll.manage', 'school.payroll.pay')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code = 'SCHOOL_ACCOUNTANT'
  and p.code in ('school.payroll.view', 'school.payroll.pay')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code = 'HEADMASTER'
  and p.code = 'school.payroll.view'
on conflict do nothing;

alter table public.sch_staff
  alter column staff_type_id drop not null,
  alter column position_id drop not null;

alter table public.sch_staff
  add column if not exists job_title text not null default '',
  add column if not exists monthly_salary numeric(14, 2),
  add column if not exists salary_effective_on date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sch_staff_job_title_len') then
    alter table public.sch_staff
      add constraint sch_staff_job_title_len check (char_length(job_title) <= 80);
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sch_staff_salary_nonneg') then
    alter table public.sch_staff
      add constraint sch_staff_salary_nonneg check (monthly_salary is null or monthly_salary >= 0);
  end if;
end
$$;

-- Ordinary workers should not be forced onto a Transport/DRIVER catalogue.
insert into public.sch_staff_types (business_unit_id, name, code, kind, is_active)
select bu.id, 'Support', 'SUPPORT', 'support', true
from public.business_units bu
where bu.code = 'school'
  and not exists (
    select 1
    from public.sch_staff_types t
    where t.business_unit_id = bu.id
      and lower(btrim(t.code)) = 'support'
  );

insert into public.sch_staff_positions (
  business_unit_id, staff_type_id, name, code, allows_academic_assignments, is_active
)
select t.business_unit_id, t.id, 'General', 'GENERAL', false, true
from public.sch_staff_types t
join public.business_units bu on bu.id = t.business_unit_id
where bu.code = 'school'
  and t.kind = 'support'
  and not exists (
    select 1
    from public.sch_staff_positions p
    where p.staff_type_id = t.id
      and lower(btrim(p.code)) = 'general'
  );

alter table public.sch_expenses drop constraint if exists sch_expenses_source;
alter table public.sch_expenses
  add constraint sch_expenses_source
  check (source_type in ('MANUAL', 'TRANSPORT_FUEL', 'TRANSPORT_MAINTENANCE', 'SALARY'));

create table if not exists public.sch_staff_salary_history (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  staff_id uuid not null,
  monthly_salary numeric(14, 2) not null,
  effective_on date not null,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint sch_staff_salary_history_amount check (monthly_salary >= 0),
  constraint sch_staff_salary_history_staff_fk foreign key (staff_id, business_unit_id)
    references public.sch_staff (id, business_unit_id) on delete restrict
);

create index if not exists sch_staff_salary_history_staff_idx
  on public.sch_staff_salary_history (business_unit_id, staff_id, effective_on desc, created_at desc);

alter table public.sch_staff_salary_history enable row level security;
revoke all on public.sch_staff_salary_history from anon, public;
grant select, insert on public.sch_staff_salary_history to authenticated, service_role;

drop policy if exists sch_staff_salary_history_select on public.sch_staff_salary_history;
create policy sch_staff_salary_history_select on public.sch_staff_salary_history
  for select to authenticated using (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_staff_salary_history_insert on public.sch_staff_salary_history;
create policy sch_staff_salary_history_insert on public.sch_staff_salary_history
  for insert to authenticated with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_staff_salary_history_update on public.sch_staff_salary_history;
create policy sch_staff_salary_history_update on public.sch_staff_salary_history
  for update to authenticated using (false);
drop policy if exists sch_staff_salary_history_delete on public.sch_staff_salary_history;
create policy sch_staff_salary_history_delete on public.sch_staff_salary_history
  for delete to authenticated using (false);

create table if not exists public.sch_staff_salary_allocations (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  staff_id uuid not null,
  cost_business_unit_id uuid not null references public.business_units(id) on delete restrict,
  amount numeric(14, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_staff_salary_alloc_amount check (amount >= 0),
  constraint sch_staff_salary_alloc_staff_fk foreign key (staff_id, business_unit_id)
    references public.sch_staff (id, business_unit_id) on delete restrict
);

create unique index if not exists sch_staff_salary_alloc_uidx
  on public.sch_staff_salary_allocations (staff_id, cost_business_unit_id);

create index if not exists sch_staff_salary_alloc_bu_idx
  on public.sch_staff_salary_allocations (business_unit_id, staff_id);

drop trigger if exists sch_staff_salary_allocations_touch on public.sch_staff_salary_allocations;
create trigger sch_staff_salary_allocations_touch before update on public.sch_staff_salary_allocations
  for each row execute function public.sch_touch_updated_at();

alter table public.sch_staff_salary_allocations enable row level security;
revoke all on public.sch_staff_salary_allocations from anon, public;
grant select, insert, update, delete on public.sch_staff_salary_allocations to authenticated, service_role;

drop policy if exists sch_staff_salary_alloc_select on public.sch_staff_salary_allocations;
create policy sch_staff_salary_alloc_select on public.sch_staff_salary_allocations
  for select to authenticated using (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_staff_salary_alloc_insert on public.sch_staff_salary_allocations;
create policy sch_staff_salary_alloc_insert on public.sch_staff_salary_allocations
  for insert to authenticated with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_staff_salary_alloc_update on public.sch_staff_salary_allocations;
create policy sch_staff_salary_alloc_update on public.sch_staff_salary_allocations
  for update to authenticated
  using (public.has_business_unit_access(business_unit_id))
  with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_staff_salary_alloc_delete on public.sch_staff_salary_allocations;
create policy sch_staff_salary_alloc_delete on public.sch_staff_salary_allocations
  for delete to authenticated using (public.has_business_unit_access(business_unit_id));

create table if not exists public.sch_staff_salary_payments (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  staff_id uuid not null,
  period_year integer not null,
  period_month integer not null,
  amount numeric(14, 2) not null,
  payment_date date not null,
  method text not null,
  reference text not null default '',
  notes text not null default '',
  expense_id uuid,
  request_id uuid not null,
  recorded_by uuid references public.profiles(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_staff_salary_pay_amount check (amount > 0),
  constraint sch_staff_salary_pay_month check (period_month between 1 and 12),
  constraint sch_staff_salary_pay_year check (period_year between 2000 and 2100),
  constraint sch_staff_salary_pay_method check (method in ('CASH', 'MOBILE_MONEY', 'BANK')),
  constraint sch_staff_salary_pay_staff_fk foreign key (staff_id, business_unit_id)
    references public.sch_staff (id, business_unit_id) on delete restrict,
  constraint sch_staff_salary_pay_expense_fk foreign key (expense_id, business_unit_id)
    references public.sch_expenses (id, business_unit_id) on delete restrict
);

create unique index if not exists sch_staff_salary_pay_request_uidx
  on public.sch_staff_salary_payments (business_unit_id, request_id);

create index if not exists sch_staff_salary_pay_staff_period_idx
  on public.sch_staff_salary_payments (business_unit_id, staff_id, period_year, period_month)
  where is_active;

drop trigger if exists sch_staff_salary_payments_touch on public.sch_staff_salary_payments;
create trigger sch_staff_salary_payments_touch before update on public.sch_staff_salary_payments
  for each row execute function public.sch_touch_updated_at();

alter table public.sch_staff_salary_payments enable row level security;
revoke all on public.sch_staff_salary_payments from anon, public;
grant select, insert, update on public.sch_staff_salary_payments to authenticated, service_role;

drop policy if exists sch_staff_salary_pay_select on public.sch_staff_salary_payments;
create policy sch_staff_salary_pay_select on public.sch_staff_salary_payments
  for select to authenticated using (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_staff_salary_pay_insert on public.sch_staff_salary_payments;
create policy sch_staff_salary_pay_insert on public.sch_staff_salary_payments
  for insert to authenticated with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_staff_salary_pay_update on public.sch_staff_salary_payments;
create policy sch_staff_salary_pay_update on public.sch_staff_salary_payments
  for update to authenticated
  using (public.has_business_unit_access(business_unit_id))
  with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_staff_salary_pay_delete on public.sch_staff_salary_payments;
create policy sch_staff_salary_pay_delete on public.sch_staff_salary_payments
  for delete to authenticated using (false);

create or replace function public.sch_write_staff_salary_history()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.monthly_salary is not null then
      insert into public.sch_staff_salary_history (
        business_unit_id, staff_id, monthly_salary, effective_on, recorded_by
      )
      values (
        new.business_unit_id,
        new.id,
        new.monthly_salary,
        coalesce(new.salary_effective_on, current_date),
        null
      );
    end if;
    return new;
  end if;

  if new.monthly_salary is distinct from old.monthly_salary
     or new.salary_effective_on is distinct from old.salary_effective_on then
    if new.monthly_salary is not null then
      insert into public.sch_staff_salary_history (
        business_unit_id, staff_id, monthly_salary, effective_on, recorded_by
      )
      values (
        new.business_unit_id,
        new.id,
        new.monthly_salary,
        coalesce(new.salary_effective_on, current_date),
        null
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sch_staff_salary_history_aiu on public.sch_staff;
create trigger sch_staff_salary_history_aiu
  after insert or update of monthly_salary, salary_effective_on on public.sch_staff
  for each row execute function public.sch_write_staff_salary_history();

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
  p_actor_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_bu uuid;
  v_status text;
  v_salary numeric;
  v_first text;
  v_middle text;
  v_last text;
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

  select business_unit_id, employment_status, monthly_salary, first_name, middle_name, last_name
    into v_bu, v_status, v_salary, v_first, v_middle, v_last
  from public.sch_staff
  where id = p_staff_id;
  if v_bu is null then
    raise exception 'Staff member was not found.';
  end if;
  if not public.has_business_unit_access(v_bu) then
    raise exception 'Not authorized for this school.';
  end if;

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

  select coalesce(sum(amount), 0) into v_paid
  from public.sch_staff_salary_payments
  where business_unit_id = v_bu
    and staff_id = p_staff_id
    and period_year = p_period_year
    and period_month = p_period_month
    and is_active;

  if v_salary is not null and (v_paid + v_amount) > (v_salary + 0.005) then
    raise exception 'This payment exceeds the remaining salary for the period.';
  end if;

  v_cat := public.sch_ensure_expense_category(v_bu, 'SALARY', 'Salaries');
  v_number := public.sch_next_document_number(v_bu, 'expense', 'EXP');
  v_payee := btrim(concat_ws(' ', v_first, nullif(v_middle, ''), v_last));

  insert into public.sch_staff_salary_payments (
    business_unit_id, staff_id, period_year, period_month, amount, payment_date,
    method, reference, notes, request_id, recorded_by, is_active
  )
  values (
    v_bu, p_staff_id, p_period_year, p_period_month, v_amount, p_payment_date,
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

create or replace function public.sch_reverse_manual_expense(
  p_expense_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_bu uuid;
  v_source text;
  v_active boolean;
  v_number text;
begin
  select business_unit_id, source_type, is_active, expense_number
    into v_bu, v_source, v_active, v_number
  from public.sch_expenses
  where id = p_expense_id;
  if v_bu is null then
    raise exception 'Expense was not found.';
  end if;
  if not public.has_business_unit_access(v_bu) then
    raise exception 'Not authorized for this school.';
  end if;
  if v_source in ('TRANSPORT_FUEL', 'TRANSPORT_MAINTENANCE') then
    raise exception 'Transport expenses must be reversed from Transport.';
  end if;
  if not v_active then
    return jsonb_build_object('id', p_expense_id, 'already_reversed', true);
  end if;

  update public.sch_expenses
    set is_active = false
  where id = p_expense_id
    and business_unit_id = v_bu
    and is_active;

  if v_source = 'SALARY' then
    update public.sch_staff_salary_payments
      set is_active = false
    where expense_id = p_expense_id
      and business_unit_id = v_bu
      and is_active;
  end if;

  return jsonb_build_object('id', p_expense_id, 'expense_number', v_number, 'already_reversed', false, 'actor_id', p_actor_id);
end;
$$;

revoke all on function public.sch_record_salary_payment(uuid, integer, integer, numeric, date, text, text, text, uuid, uuid) from public, anon;
grant execute on function public.sch_record_salary_payment(uuid, integer, integer, numeric, date, text, text, text, uuid, uuid) to authenticated, service_role;

revoke all on function public.sch_write_staff_salary_history() from public, anon;
grant execute on function public.sch_write_staff_salary_history() to authenticated, service_role;
