-- Student fee charges and payments. Additive. Does not drop fee structures or assignments.

insert into public.permissions (code, module, resource, action, name)
values
  ('school.fees.record', 'school', 'fees', 'record', 'Record school fee payments'),
  ('school.fees.verify', 'school', 'fees', 'verify', 'Verify school fee payments'),
  ('school.fees.receipt', 'school', 'fees', 'receipt', 'View school fee receipts')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code in ('SCHOOL_ADMIN', 'SCHOOL_MANAGER', 'SCHOOL_ACCOUNTANT')
  and p.code in ('school.fees.record', 'school.fees.verify', 'school.fees.receipt')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code = 'HEADMASTER'
  and p.code = 'school.fees.receipt'
on conflict do nothing;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sch_student_enrollments_id_bu_key') then
    alter table public.sch_student_enrollments
      add constraint sch_student_enrollments_id_bu_key unique (id, business_unit_id);
  end if;
end
$$;

create table if not exists public.sch_fee_charges (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  student_id uuid not null,
  enrollment_id uuid not null,
  fee_structure_id uuid not null,
  academic_year_id uuid not null,
  level_id uuid not null,
  class_id uuid not null,
  annual_amount numeric(14, 2) not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_fee_charges_amount check (annual_amount >= 0),
  constraint sch_fee_charges_student_bu_fk foreign key (student_id, business_unit_id)
    references public.sch_students (id, business_unit_id) on delete restrict,
  constraint sch_fee_charges_enrollment_bu_fk foreign key (enrollment_id, business_unit_id)
    references public.sch_student_enrollments (id, business_unit_id) on delete restrict,
  constraint sch_fee_charges_structure_bu_fk foreign key (fee_structure_id, business_unit_id)
    references public.sch_fee_structures (id, business_unit_id) on delete restrict,
  constraint sch_fee_charges_year_bu_fk foreign key (academic_year_id, business_unit_id)
    references public.sch_academic_years (id, business_unit_id) on delete restrict,
  constraint sch_fee_charges_level_bu_fk foreign key (level_id, business_unit_id)
    references public.sch_class_levels (id, business_unit_id) on delete restrict,
  constraint sch_fee_charges_class_bu_fk foreign key (class_id, business_unit_id)
    references public.sch_classes (id, business_unit_id) on delete restrict
);

create unique index if not exists sch_fee_charges_enrollment_uidx
  on public.sch_fee_charges (enrollment_id)
  where is_active;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sch_fee_charges_id_bu_key') then
    alter table public.sch_fee_charges
      add constraint sch_fee_charges_id_bu_key unique (id, business_unit_id);
  end if;
end
$$;

drop trigger if exists sch_fee_charges_touch on public.sch_fee_charges;
create trigger sch_fee_charges_touch before update on public.sch_fee_charges
  for each row execute function public.sch_touch_updated_at();

create table if not exists public.sch_fee_payments (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  charge_id uuid not null,
  enrollment_id uuid not null,
  student_id uuid not null,
  payment_number text not null,
  amount numeric(14, 2) not null,
  method text not null,
  payment_date date not null,
  reference text not null default '',
  notes text not null default '',
  status text not null default 'pending',
  request_id uuid not null,
  recorded_by uuid references public.profiles(id) on delete set null,
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_fee_payments_amount check (amount > 0),
  constraint sch_fee_payments_method check (method in ('CASH', 'MOBILE_MONEY', 'BANK')),
  constraint sch_fee_payments_status check (status in ('pending', 'posted')),
  constraint sch_fee_payments_charge_bu_fk foreign key (charge_id, business_unit_id)
    references public.sch_fee_charges (id, business_unit_id) on delete restrict,
  constraint sch_fee_payments_enrollment_bu_fk foreign key (enrollment_id, business_unit_id)
    references public.sch_student_enrollments (id, business_unit_id) on delete restrict,
  constraint sch_fee_payments_student_bu_fk foreign key (student_id, business_unit_id)
    references public.sch_students (id, business_unit_id) on delete restrict
);

create unique index if not exists sch_fee_payments_number_uidx
  on public.sch_fee_payments (business_unit_id, payment_number);

create unique index if not exists sch_fee_payments_request_uidx
  on public.sch_fee_payments (business_unit_id, request_id);

create index if not exists sch_fee_payments_charge_idx
  on public.sch_fee_payments (charge_id, status);

drop trigger if exists sch_fee_payments_touch on public.sch_fee_payments;
create trigger sch_fee_payments_touch before update on public.sch_fee_payments
  for each row execute function public.sch_touch_updated_at();

alter table public.sch_fee_charges enable row level security;
alter table public.sch_fee_payments enable row level security;
revoke all on public.sch_fee_charges, public.sch_fee_payments from anon, public;
grant select, insert, update on public.sch_fee_charges, public.sch_fee_payments to authenticated, service_role;

drop policy if exists sch_fee_charges_select on public.sch_fee_charges;
create policy sch_fee_charges_select on public.sch_fee_charges
  for select to authenticated
  using (public.has_business_unit_access(business_unit_id));

drop policy if exists sch_fee_charges_insert on public.sch_fee_charges;
create policy sch_fee_charges_insert on public.sch_fee_charges
  for insert to authenticated
  with check (public.has_business_unit_access(business_unit_id));

drop policy if exists sch_fee_charges_update on public.sch_fee_charges;
create policy sch_fee_charges_update on public.sch_fee_charges
  for update to authenticated
  using (public.has_business_unit_access(business_unit_id))
  with check (public.has_business_unit_access(business_unit_id));

drop policy if exists sch_fee_charges_delete on public.sch_fee_charges;
create policy sch_fee_charges_delete on public.sch_fee_charges
  for delete to authenticated
  using (false);

drop policy if exists sch_fee_payments_select on public.sch_fee_payments;
create policy sch_fee_payments_select on public.sch_fee_payments
  for select to authenticated
  using (public.has_business_unit_access(business_unit_id));

drop policy if exists sch_fee_payments_insert on public.sch_fee_payments;
create policy sch_fee_payments_insert on public.sch_fee_payments
  for insert to authenticated
  with check (public.has_business_unit_access(business_unit_id));

drop policy if exists sch_fee_payments_update on public.sch_fee_payments;
create policy sch_fee_payments_update on public.sch_fee_payments
  for update to authenticated
  using (public.has_business_unit_access(business_unit_id))
  with check (public.has_business_unit_access(business_unit_id));

drop policy if exists sch_fee_payments_delete on public.sch_fee_payments;
create policy sch_fee_payments_delete on public.sch_fee_payments
  for delete to authenticated
  using (false);

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
join public.sch_class_streams st
  on st.id = e.stream_id
 and st.business_unit_id = e.business_unit_id
join public.sch_classes cl
  on cl.id = st.class_id
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
security invoker
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

  select e.business_unit_id, e.student_id, e.academic_year_id, e.stream_id
    into v_bu, v_student, v_year, v_stream
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

  select st.class_id, cl.level_id into v_class, v_level
  from public.sch_class_streams st
  join public.sch_classes cl on cl.id = st.class_id and cl.business_unit_id = st.business_unit_id
  where st.id = v_stream
    and st.business_unit_id = v_bu;
  if v_class is null then
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

create or replace function public.sch_verify_fee_payment(p_payment_id uuid, p_actor_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_bu uuid;
  v_status text;
  v_recorded uuid;
  v_number text;
begin
  select business_unit_id, status, recorded_by, payment_number
    into v_bu, v_status, v_recorded, v_number
  from public.sch_fee_payments
  where id = p_payment_id;
  if v_bu is null then
    raise exception 'Payment was not found.';
  end if;
  if not public.has_business_unit_access(v_bu) then
    raise exception 'Not authorized for this school.';
  end if;
  if v_status = 'posted' then
    return jsonb_build_object('id', p_payment_id, 'payment_number', v_number, 'already_posted', true);
  end if;
  if v_status <> 'pending' then
    raise exception 'Only a pending payment can be verified.';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_payment_id::text)::bigint);

  update public.sch_fee_payments
  set status = 'posted',
      verified_by = p_actor_id,
      verified_at = now()
  where id = p_payment_id
    and status = 'pending';

  return jsonb_build_object('id', p_payment_id, 'payment_number', v_number, 'already_posted', false);
end;
$$;

grant execute on function public.sch_record_fee_payment(uuid, numeric, text, date, text, text, uuid, uuid) to authenticated, service_role;
grant execute on function public.sch_verify_fee_payment(uuid, uuid) to authenticated, service_role;
