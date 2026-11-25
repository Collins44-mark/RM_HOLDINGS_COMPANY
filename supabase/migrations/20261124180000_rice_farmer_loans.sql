-- Farmer loans for the Rice Mill.
-- Additive. Does not read or write finance_ledger_imports, finance_ledger_lines,
-- rice_expenses, farm_expenses, or consolidated cash tables.
-- Not applied until this file is approved.

alter table public.rice_document_counters
  drop constraint if exists rice_document_counters_doc_type_chk;

alter table public.rice_document_counters
  add constraint rice_document_counters_doc_type_chk
  check (doc_type in (
    'PURCHASE','BATCH','SALE','STORAGE','SERVICE','EXPENSE','PARTY',
    'LOAN_APPLICATION','LOAN','LOAN_DISBURSEMENT','LOAN_RECEIPT'
  ));

create table if not exists public.rice_farmer_profiles (
  party_id uuid primary key references public.rice_parties(id) on delete restrict,
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  location text,
  farm_details text,
  request_id uuid,
  recorded_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rice_farmer_profiles_location_chk check (location is null or char_length(btrim(location)) <= 160),
  constraint rice_farmer_profiles_farm_chk check (farm_details is null or char_length(btrim(farm_details)) <= 500),
  unique (request_id)
);

create table if not exists public.rice_loan_applications (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  party_id uuid not null references public.rice_parties(id) on delete restrict,
  application_number text not null,
  requested_amount numeric(16,2) not null,
  application_date date not null,
  purpose text not null,
  status text not null,
  submitted_by uuid,
  submitted_at timestamptz,
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  decision_request_id uuid,
  request_id uuid not null,
  recorded_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rice_loan_applications_amount_chk check (requested_amount > 0),
  constraint rice_loan_applications_purpose_chk check (char_length(btrim(purpose)) between 3 and 500),
  constraint rice_loan_applications_status_chk check (status in ('SUBMITTED','APPROVED','REJECTED','CANCELLED')),
  constraint rice_loan_applications_decision_chk check (
    (status = 'SUBMITTED' and decided_by is null and decided_at is null)
    or (status in ('APPROVED','REJECTED','CANCELLED') and decided_by is not null and decided_at is not null)
  ),
  constraint rice_loan_applications_sod_chk check (decided_by is null or decided_by is distinct from submitted_by),
  unique (business_unit_id, application_number),
  unique (request_id),
  unique (decision_request_id)
);

create table if not exists public.rice_loan_documents (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  application_id uuid not null references public.rice_loan_applications(id) on delete restrict,
  file_name text not null,
  storage_path text not null,
  request_id uuid not null,
  recorded_by uuid,
  created_at timestamptz not null default now(),
  constraint rice_loan_documents_name_chk check (char_length(btrim(file_name)) between 1 and 180),
  constraint rice_loan_documents_path_chk check (char_length(btrim(storage_path)) between 1 and 400),
  unique (request_id)
);

create table if not exists public.rice_loans (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  application_id uuid not null references public.rice_loan_applications(id) on delete restrict,
  party_id uuid not null references public.rice_parties(id) on delete restrict,
  loan_number text not null,
  approved_amount numeric(16,2) not null,
  approved_on date not null,
  approved_by uuid not null,
  terms text not null,
  due_on date not null,
  status text not null,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rice_loans_amount_chk check (approved_amount > 0),
  constraint rice_loans_terms_chk check (char_length(btrim(terms)) between 3 and 500),
  constraint rice_loans_due_chk check (due_on >= approved_on),
  constraint rice_loans_status_chk check (status in ('APPROVED','ACTIVE','CLOSED')),
  unique (application_id),
  unique (business_unit_id, loan_number),
  unique (request_id)
);

create table if not exists public.rice_loan_disbursements (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  loan_id uuid not null references public.rice_loans(id) on delete restrict,
  party_id uuid not null references public.rice_parties(id) on delete restrict,
  disbursement_number text not null,
  amount numeric(16,2) not null,
  disbursed_on date not null,
  payment_method text not null,
  payment_reference text,
  request_id uuid not null,
  recorded_by uuid not null,
  created_at timestamptz not null default now(),
  constraint rice_loan_disbursements_amount_chk check (amount > 0),
  constraint rice_loan_disbursements_method_chk check (payment_method in ('CASH','MOBILE_MONEY','BANK')),
  unique (business_unit_id, disbursement_number),
  unique (request_id)
);

create table if not exists public.rice_loan_repayments (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  loan_id uuid not null references public.rice_loans(id) on delete restrict,
  party_id uuid not null references public.rice_parties(id) on delete restrict,
  receipt_number text not null,
  principal_amount numeric(16,2) not null default 0,
  interest_amount numeric(16,2) not null default 0,
  fee_amount numeric(16,2) not null default 0,
  paid_on date not null,
  payment_method text not null,
  payment_reference text,
  request_id uuid not null,
  recorded_by uuid not null,
  created_at timestamptz not null default now(),
  constraint rice_loan_repayments_principal_chk check (principal_amount >= 0),
  constraint rice_loan_repayments_interest_chk check (interest_amount >= 0),
  constraint rice_loan_repayments_fee_chk check (fee_amount >= 0),
  constraint rice_loan_repayments_total_chk check (principal_amount + interest_amount + fee_amount > 0),
  constraint rice_loan_repayments_method_chk check (payment_method in ('CASH','MOBILE_MONEY','BANK')),
  unique (business_unit_id, receipt_number),
  unique (request_id)
);

create index if not exists rice_loan_applications_party_idx on public.rice_loan_applications (business_unit_id, party_id, application_date desc);
create index if not exists rice_loans_party_idx on public.rice_loans (business_unit_id, party_id, status);
create index if not exists rice_loan_disbursements_loan_idx on public.rice_loan_disbursements (loan_id, disbursed_on);
create index if not exists rice_loan_repayments_loan_idx on public.rice_loan_repayments (loan_id, paid_on);
create index if not exists rice_loan_documents_application_idx on public.rice_loan_documents (application_id);

create or replace function public.rice_farmer_profile_party_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_bu uuid;
begin
  select business_unit_id into v_bu from public.rice_parties where id = new.party_id;
  if v_bu is null or v_bu is distinct from new.business_unit_id then
    raise exception 'Farmer profile must use the same business unit as the farmer.';
  end if;
  return new;
end;
$$;

drop trigger if exists rice_farmer_profiles_party_guard on public.rice_farmer_profiles;
create trigger rice_farmer_profiles_party_guard
before insert or update on public.rice_farmer_profiles
for each row execute function public.rice_farmer_profile_party_guard();

drop trigger if exists rice_farmer_profiles_touch on public.rice_farmer_profiles;
create trigger rice_farmer_profiles_touch before update on public.rice_farmer_profiles
for each row execute function public.rice_touch_updated_at();

drop trigger if exists rice_loan_applications_touch on public.rice_loan_applications;
create trigger rice_loan_applications_touch before update on public.rice_loan_applications
for each row execute function public.rice_touch_updated_at();

drop trigger if exists rice_loans_touch on public.rice_loans;
create trigger rice_loans_touch before update on public.rice_loans
for each row execute function public.rice_touch_updated_at();

create or replace function public.rice_loan_money_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Posted loan disbursements and repayments cannot be changed.';
end;
$$;

drop trigger if exists rice_loan_disbursements_immutable on public.rice_loan_disbursements;
create trigger rice_loan_disbursements_immutable
before update or delete on public.rice_loan_disbursements
for each row execute function public.rice_loan_money_immutable();

drop trigger if exists rice_loan_repayments_immutable on public.rice_loan_repayments;
create trigger rice_loan_repayments_immutable
before update or delete on public.rice_loan_repayments
for each row execute function public.rice_loan_money_immutable();

create or replace function public.rice_loan_disbursed(p_loan_id uuid)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum(amount), 0)
  from public.rice_loan_disbursements
  where loan_id = p_loan_id;
$$;

create or replace function public.rice_loan_principal_repaid(p_loan_id uuid)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum(principal_amount), 0)
  from public.rice_loan_repayments
  where loan_id = p_loan_id;
$$;

create or replace function public.rice_loan_outstanding(p_loan_id uuid)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select public.rice_loan_disbursed(p_loan_id) - public.rice_loan_principal_repaid(p_loan_id);
$$;

create or replace function public.rice_require_unit()
returns uuid
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_bu uuid;
begin
  select id into v_bu from public.business_units where code = 'rice';
  if v_bu is null then raise exception 'Rice Mill business unit was not found.'; end if;
  if not public.has_business_unit_access(v_bu) then raise exception 'Not authorized for Rice Mill & Warehouse.'; end if;
  return v_bu;
end;
$$;

create or replace function public.rice_register_farmer(
  p_name text,
  p_phone text,
  p_location text,
  p_farm_details text,
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
  v_existing uuid;
  v_party uuid;
begin
  if p_request_id is null then raise exception 'Farmer request is invalid.'; end if;
  select party_id into v_existing from public.rice_farmer_profiles where request_id = p_request_id;
  if v_existing is not null then
    return jsonb_build_object('partyId', v_existing, 'duplicate', true);
  end if;
  v_bu := public.rice_require_unit();
  v_party := public.rice_ensure_party(v_bu, null, 'SUPPLIER', p_name, p_phone);
  insert into public.rice_farmer_profiles (
    party_id, business_unit_id, location, farm_details, request_id, recorded_by
  ) values (
    v_party,
    v_bu,
    nullif(btrim(coalesce(p_location, '')), ''),
    nullif(btrim(coalesce(p_farm_details, '')), ''),
    p_request_id,
    p_actor_id
  );
  return jsonb_build_object('partyId', v_party, 'duplicate', false);
end;
$$;

create or replace function public.rice_save_farmer_profile(
  p_party_id uuid,
  p_location text,
  p_farm_details text,
  p_actor_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_bu uuid;
  v_party_bu uuid;
begin
  if p_party_id is null then raise exception 'Select a farmer.'; end if;
  v_bu := public.rice_require_unit();
  select business_unit_id into v_party_bu
  from public.rice_parties
  where id = p_party_id and is_active
  for update;
  if v_party_bu is null or v_party_bu is distinct from v_bu then
    raise exception 'Farmer was not found.';
  end if;
  insert into public.rice_farmer_profiles (
    party_id, business_unit_id, location, farm_details, recorded_by
  ) values (
    p_party_id,
    v_bu,
    nullif(btrim(coalesce(p_location, '')), ''),
    nullif(btrim(coalesce(p_farm_details, '')), ''),
    p_actor_id
  )
  on conflict (party_id) do update set
    location = excluded.location,
    farm_details = excluded.farm_details,
    recorded_by = excluded.recorded_by,
    updated_at = now();
  return p_party_id;
end;
$$;

create or replace function public.rice_submit_loan_application(
  p_party_id uuid,
  p_requested_amount numeric,
  p_application_date date,
  p_purpose text,
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
  v_existing uuid;
  v_amount numeric;
  v_id uuid;
  v_number text;
begin
  if p_request_id is null then raise exception 'Application request is invalid.'; end if;
  if p_actor_id is null then raise exception 'Applicant is required.'; end if;
  if p_application_date is null then raise exception 'Enter an application date.'; end if;
  select id into v_existing from public.rice_loan_applications where request_id = p_request_id;
  if v_existing is not null then
    return jsonb_build_object('id', v_existing, 'duplicate', true);
  end if;
  v_amount := round(coalesce(p_requested_amount, 0), 2);
  if v_amount <= 0 then raise exception 'Requested amount must be greater than zero.'; end if;
  if char_length(btrim(coalesce(p_purpose, ''))) < 3 then raise exception 'Enter the loan purpose.'; end if;
  v_bu := public.rice_require_unit();
  if not exists (
    select 1 from public.rice_parties
    where id = p_party_id and business_unit_id = v_bu and is_active
  ) then
    raise exception 'Select an existing farmer.';
  end if;
  v_number := public.rice_next_document_number(v_bu, 'LOAN_APPLICATION', 'APP');
  insert into public.rice_loan_applications (
    business_unit_id, party_id, application_number, requested_amount, application_date, purpose,
    status, submitted_by, submitted_at, request_id, recorded_by
  ) values (
    v_bu, p_party_id, v_number, v_amount, p_application_date, btrim(p_purpose),
    'SUBMITTED', p_actor_id, now(), p_request_id, p_actor_id
  ) returning id into v_id;
  return jsonb_build_object('id', v_id, 'number', v_number, 'duplicate', false);
end;
$$;

create or replace function public.rice_attach_loan_document(
  p_application_id uuid,
  p_file_name text,
  p_storage_path text,
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
  v_app_bu uuid;
  v_status text;
  v_existing uuid;
  v_id uuid;
begin
  if p_request_id is null then raise exception 'Document request is invalid.'; end if;
  select id into v_existing from public.rice_loan_documents where request_id = p_request_id;
  if v_existing is not null then
    return jsonb_build_object('id', v_existing, 'duplicate', true);
  end if;
  v_bu := public.rice_require_unit();
  select business_unit_id, status into v_app_bu, v_status
  from public.rice_loan_applications
  where id = p_application_id
  for update;
  if v_app_bu is null or v_app_bu is distinct from v_bu then raise exception 'Application was not found.'; end if;
  if v_status in ('REJECTED','CANCELLED') then raise exception 'Documents cannot be added to a closed application.'; end if;
  insert into public.rice_loan_documents (
    business_unit_id, application_id, file_name, storage_path, request_id, recorded_by
  ) values (
    v_bu, p_application_id, btrim(p_file_name), btrim(p_storage_path), p_request_id, p_actor_id
  ) returning id into v_id;
  return jsonb_build_object('id', v_id, 'duplicate', false);
end;
$$;

create or replace function public.rice_decide_loan_application(
  p_application_id uuid,
  p_decision text,
  p_approved_amount numeric,
  p_terms text,
  p_due_on date,
  p_decision_note text,
  p_request_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_app public.rice_loan_applications%rowtype;
  v_decision text := upper(btrim(coalesce(p_decision, '')));
  v_amount numeric;
  v_loan uuid;
  v_number text;
  v_existing uuid;
begin
  if p_request_id is null then raise exception 'Decision request is invalid.'; end if;
  if p_actor_id is null then raise exception 'Approving officer is required.'; end if;
  select id into v_existing from public.rice_loan_applications where decision_request_id = p_request_id;
  if v_existing is not null then
    return jsonb_build_object('applicationId', v_existing, 'duplicate', true);
  end if;
  if v_decision not in ('APPROVE','REJECT','CANCEL') then
    raise exception 'Decision must be approve, reject, or cancel.';
  end if;
  select * into v_app
  from public.rice_loan_applications
  where id = p_application_id
  for update;
  if v_app.id is null then raise exception 'Application was not found.'; end if;
  if not public.has_business_unit_access(v_app.business_unit_id) then
    raise exception 'Not authorized for Rice Mill & Warehouse.';
  end if;
  if v_app.status <> 'SUBMITTED' then raise exception 'Only a submitted application can be decided.'; end if;
  if v_app.submitted_by is not distinct from p_actor_id then
    raise exception 'The applicant cannot approve, reject, or cancel this application.';
  end if;

  if v_decision = 'CANCEL' then
    update public.rice_loan_applications set
      status = 'CANCELLED',
      decided_by = p_actor_id,
      decided_at = now(),
      decision_note = nullif(btrim(coalesce(p_decision_note, '')), ''),
      decision_request_id = p_request_id
    where id = v_app.id;
    return jsonb_build_object('applicationId', v_app.id, 'status', 'CANCELLED', 'duplicate', false);
  end if;

  if v_decision = 'REJECT' then
    if char_length(btrim(coalesce(p_decision_note, ''))) < 3 then
      raise exception 'Enter a reason for rejection.';
    end if;
    update public.rice_loan_applications set
      status = 'REJECTED',
      decided_by = p_actor_id,
      decided_at = now(),
      decision_note = btrim(p_decision_note),
      decision_request_id = p_request_id
    where id = v_app.id;
    return jsonb_build_object('applicationId', v_app.id, 'status', 'REJECTED', 'duplicate', false);
  end if;

  v_amount := round(coalesce(p_approved_amount, 0), 2);
  if v_amount <= 0 or v_amount > v_app.requested_amount then
    raise exception 'Approved amount must be greater than zero and no more than the requested amount.';
  end if;
  if p_due_on is null or p_due_on < v_app.application_date then
    raise exception 'Due date must be on or after the application date.';
  end if;
  if char_length(btrim(coalesce(p_terms, ''))) < 3 then raise exception 'Enter the loan terms.'; end if;

  v_number := public.rice_next_document_number(v_app.business_unit_id, 'LOAN', 'LN');
  insert into public.rice_loans (
    business_unit_id, application_id, party_id, loan_number, approved_amount, approved_on,
    approved_by, terms, due_on, status, request_id
  ) values (
    v_app.business_unit_id, v_app.id, v_app.party_id, v_number, v_amount, current_date,
    p_actor_id, btrim(p_terms), p_due_on, 'APPROVED', p_request_id
  ) returning id into v_loan;

  update public.rice_loan_applications set
    status = 'APPROVED',
    decided_by = p_actor_id,
    decided_at = now(),
    decision_note = nullif(btrim(coalesce(p_decision_note, '')), ''),
    decision_request_id = p_request_id
  where id = v_app.id;

  return jsonb_build_object('applicationId', v_app.id, 'loanId', v_loan, 'number', v_number, 'duplicate', false);
end;
$$;

create or replace function public.rice_disburse_loan(
  p_loan_id uuid,
  p_amount numeric,
  p_disbursed_on date,
  p_payment_method text,
  p_payment_reference text,
  p_request_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_loan public.rice_loans%rowtype;
  v_existing uuid;
  v_amount numeric;
  v_method text;
  v_disbursed numeric;
  v_id uuid;
  v_number text;
begin
  if p_request_id is null then raise exception 'Disbursement request is invalid.'; end if;
  if p_actor_id is null then raise exception 'Disbursing officer is required.'; end if;
  if p_disbursed_on is null then raise exception 'Enter a disbursement date.'; end if;
  select id into v_existing from public.rice_loan_disbursements where request_id = p_request_id;
  if v_existing is not null then
    return jsonb_build_object('id', v_existing, 'duplicate', true);
  end if;
  v_amount := round(coalesce(p_amount, 0), 2);
  if v_amount <= 0 then raise exception 'Disbursed amount must be greater than zero.'; end if;
  v_method := upper(btrim(coalesce(p_payment_method, '')));
  if v_method not in ('CASH','MOBILE_MONEY','BANK') then raise exception 'Select a payment method.'; end if;

  select * into v_loan from public.rice_loans where id = p_loan_id for update;
  if v_loan.id is null then raise exception 'Loan was not found.'; end if;
  if not public.has_business_unit_access(v_loan.business_unit_id) then
    raise exception 'Not authorized for Rice Mill & Warehouse.';
  end if;
  if v_loan.status = 'CLOSED' then raise exception 'This loan is fully repaid.'; end if;
  v_disbursed := public.rice_loan_disbursed(v_loan.id);
  if v_disbursed + v_amount > v_loan.approved_amount then
    raise exception 'Disbursement would exceed the approved amount.';
  end if;

  v_number := public.rice_next_document_number(v_loan.business_unit_id, 'LOAN_DISBURSEMENT', 'LD');
  insert into public.rice_loan_disbursements (
    business_unit_id, loan_id, party_id, disbursement_number, amount, disbursed_on,
    payment_method, payment_reference, request_id, recorded_by
  ) values (
    v_loan.business_unit_id, v_loan.id, v_loan.party_id, v_number, v_amount, p_disbursed_on,
    v_method, nullif(btrim(coalesce(p_payment_reference, '')), ''), p_request_id, p_actor_id
  ) returning id into v_id;

  update public.rice_loans set status = 'ACTIVE', updated_at = now() where id = v_loan.id;
  return jsonb_build_object('id', v_id, 'number', v_number, 'duplicate', false);
end;
$$;

create or replace function public.rice_repay_loan(
  p_loan_id uuid,
  p_principal numeric,
  p_interest numeric,
  p_fee numeric,
  p_paid_on date,
  p_payment_method text,
  p_payment_reference text,
  p_request_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_loan public.rice_loans%rowtype;
  v_existing uuid;
  v_principal numeric;
  v_interest numeric;
  v_fee numeric;
  v_method text;
  v_outstanding numeric;
  v_id uuid;
  v_number text;
begin
  if p_request_id is null then raise exception 'Repayment request is invalid.'; end if;
  if p_actor_id is null then raise exception 'Receiving officer is required.'; end if;
  if p_paid_on is null then raise exception 'Enter a payment date.'; end if;
  select id into v_existing from public.rice_loan_repayments where request_id = p_request_id;
  if v_existing is not null then
    return jsonb_build_object('id', v_existing, 'duplicate', true);
  end if;
  v_principal := round(coalesce(p_principal, 0), 2);
  v_interest := round(coalesce(p_interest, 0), 2);
  v_fee := round(coalesce(p_fee, 0), 2);
  if v_principal < 0 or v_interest < 0 or v_fee < 0 then raise exception 'Amounts cannot be negative.'; end if;
  if v_principal + v_interest + v_fee <= 0 then raise exception 'Enter a principal, interest, or fee amount.'; end if;
  v_method := upper(btrim(coalesce(p_payment_method, '')));
  if v_method not in ('CASH','MOBILE_MONEY','BANK') then raise exception 'Select a payment method.'; end if;

  select * into v_loan from public.rice_loans where id = p_loan_id for update;
  if v_loan.id is null then raise exception 'Loan was not found.'; end if;
  if not public.has_business_unit_access(v_loan.business_unit_id) then
    raise exception 'Not authorized for Rice Mill & Warehouse.';
  end if;
  if public.rice_loan_disbursed(v_loan.id) <= 0 then
    raise exception 'Repayment requires a posted disbursement.';
  end if;
  v_outstanding := public.rice_loan_outstanding(v_loan.id);
  if v_principal > v_outstanding then
    raise exception 'Principal repayment cannot exceed the outstanding principal.';
  end if;

  v_number := public.rice_next_document_number(v_loan.business_unit_id, 'LOAN_RECEIPT', 'LR');
  insert into public.rice_loan_repayments (
    business_unit_id, loan_id, party_id, receipt_number, principal_amount, interest_amount, fee_amount,
    paid_on, payment_method, payment_reference, request_id, recorded_by
  ) values (
    v_loan.business_unit_id, v_loan.id, v_loan.party_id, v_number, v_principal, v_interest, v_fee,
    p_paid_on, v_method, nullif(btrim(coalesce(p_payment_reference, '')), ''), p_request_id, p_actor_id
  ) returning id into v_id;

  update public.rice_loans set
    status = case when v_outstanding - v_principal = 0 then 'CLOSED' else 'ACTIVE' end,
    updated_at = now()
  where id = v_loan.id;

  return jsonb_build_object(
    'id', v_id,
    'number', v_number,
    'outstanding', v_outstanding - v_principal,
    'duplicate', false
  );
end;
$$;

create or replace view public.rice_v_loan_position
with (security_invoker = true) as
select
  l.business_unit_id,
  l.id as loan_id,
  l.loan_number,
  l.party_id,
  p.party_number,
  p.name as farmer_name,
  l.approved_amount,
  l.approved_on,
  l.due_on,
  l.status,
  coalesce(d.disbursed, 0)::numeric(16,2) as disbursed,
  coalesce(r.principal_repaid, 0)::numeric(16,2) as principal_repaid,
  coalesce(r.interest_received, 0)::numeric(16,2) as interest_received,
  coalesce(r.fees_received, 0)::numeric(16,2) as fees_received,
  (coalesce(d.disbursed, 0) - coalesce(r.principal_repaid, 0))::numeric(16,2) as outstanding_principal,
  (
    l.due_on < current_date
    and (coalesce(d.disbursed, 0) - coalesce(r.principal_repaid, 0)) > 0
  ) as overdue
from public.rice_loans l
join public.rice_parties p on p.id = l.party_id
left join (
  select loan_id, sum(amount) as disbursed
  from public.rice_loan_disbursements
  group by loan_id
) d on d.loan_id = l.id
left join (
  select
    loan_id,
    sum(principal_amount) as principal_repaid,
    sum(interest_amount) as interest_received,
    sum(fee_amount) as fees_received
  from public.rice_loan_repayments
  group by loan_id
) r on r.loan_id = l.id;

alter table public.rice_farmer_profiles enable row level security;
alter table public.rice_loan_applications enable row level security;
alter table public.rice_loan_documents enable row level security;
alter table public.rice_loans enable row level security;
alter table public.rice_loan_disbursements enable row level security;
alter table public.rice_loan_repayments enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'rice_farmer_profiles',
    'rice_loan_applications',
    'rice_loan_documents',
    'rice_loans'
  ]
  loop
    execute format(
      'drop policy if exists %I on public.%I; create policy %I on public.%I for all using (public.has_business_unit_access(business_unit_id)) with check (public.has_business_unit_access(business_unit_id));',
      t || '_all', t, t || '_all', t
    );
    execute format('grant select, insert, update on public.%I to authenticated;', t);
    execute format('grant all on public.%I to service_role;', t);
  end loop;

  foreach t in array array['rice_loan_disbursements', 'rice_loan_repayments']
  loop
    execute format(
      'drop policy if exists %I on public.%I; create policy %I on public.%I for select using (public.has_business_unit_access(business_unit_id));',
      t || '_select', t, t || '_select', t
    );
    execute format(
      'drop policy if exists %I on public.%I; create policy %I on public.%I for insert with check (public.has_business_unit_access(business_unit_id));',
      t || '_insert', t, t || '_insert', t
    );
    execute format('grant select, insert on public.%I to authenticated;', t);
    execute format('revoke update, delete on public.%I from authenticated, anon;', t);
    execute format('grant all on public.%I to service_role;', t);
  end loop;
end;
$$;

grant select on public.rice_v_loan_position to authenticated, service_role;
grant execute on function public.rice_loan_disbursed(uuid) to authenticated, service_role;
grant execute on function public.rice_loan_principal_repaid(uuid) to authenticated, service_role;
grant execute on function public.rice_loan_outstanding(uuid) to authenticated, service_role;
grant execute on function public.rice_require_unit() to authenticated, service_role;
grant execute on function public.rice_register_farmer(text, text, text, text, uuid, uuid) to authenticated, service_role;
grant execute on function public.rice_save_farmer_profile(uuid, text, text, uuid) to authenticated, service_role;
grant execute on function public.rice_submit_loan_application(uuid, numeric, date, text, uuid, uuid) to authenticated, service_role;
grant execute on function public.rice_attach_loan_document(uuid, text, text, uuid, uuid) to authenticated, service_role;
grant execute on function public.rice_decide_loan_application(uuid, text, numeric, text, date, text, uuid, uuid) to authenticated, service_role;
grant execute on function public.rice_disburse_loan(uuid, numeric, date, text, text, uuid, uuid) to authenticated, service_role;
grant execute on function public.rice_repay_loan(uuid, numeric, numeric, numeric, date, text, text, uuid, uuid) to authenticated, service_role;

insert into public.permissions (code, module, resource, action, name)
values
  ('rice.loans.view', 'rice', 'loans', 'view', 'View farmer loans'),
  ('rice.loans.apply', 'rice', 'loans', 'apply', 'Submit farmer loan applications'),
  ('rice.loans.approve', 'rice', 'loans', 'approve', 'Approve farmer loans'),
  ('rice.loans.disburse', 'rice', 'loans', 'disburse', 'Disburse farmer loans'),
  ('rice.loans.repay', 'rice', 'loans', 'repay', 'Record farmer loan repayments')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code in ('WAREHOUSE_MANAGER', 'ADMINISTRATOR', 'OWNER', 'SUPER_ADMIN')
  and p.code in (
    'rice.loans.view',
    'rice.loans.apply',
    'rice.loans.approve',
    'rice.loans.disburse',
    'rice.loans.repay'
  )
on conflict do nothing;
