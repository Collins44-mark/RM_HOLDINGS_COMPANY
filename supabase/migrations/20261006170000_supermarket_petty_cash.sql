-- Supermarket petty cash: fund control, not a second expense ledger.
-- Expense spend writes ONE sm_expenses row + PETTY_CASH payment.
-- Replenishment is a transfer (main cash or bank OUT, petty cash IN) and is not an expense.

insert into public.permissions (code, module, resource, action, name)
values
  ('supermarket.petty_cash.view', 'supermarket', 'petty_cash', 'view', 'View petty cash'),
  ('supermarket.petty_cash.create', 'supermarket', 'petty_cash', 'create', 'Prepare petty cash transactions'),
  ('supermarket.petty_cash.approve', 'supermarket', 'petty_cash', 'approve', 'Post, replenish, reverse or reconcile petty cash')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code = 'SUPERMARKET_MANAGER'
  and p.code like 'supermarket.petty_cash.%'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code = 'CASHIER'
  and p.code in (
    'supermarket.petty_cash.view',
    'supermarket.petty_cash.create'
  )
on conflict do nothing;

alter table public.sm_payments drop constraint if exists sm_payments_method_check;
alter table public.sm_payments
  add constraint sm_payments_method_check
  check (method in ('CASH', 'MOBILE_MONEY', 'CARD', 'BANK', 'PETTY_CASH'));

alter table public.sm_expenses
  add column if not exists status text not null default 'POSTED';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sm_expenses_status_check'
  ) then
    alter table public.sm_expenses
      add constraint sm_expenses_status_check
      check (status in ('POSTED', 'VOID'));
  end if;
end $$;

create table if not exists public.sm_petty_cash_funds (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  name text not null default 'Petty Cash',
  opening_balance numeric(14, 2) not null default 0 check (opening_balance >= 0),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists sm_petty_cash_funds_active_uidx
  on public.sm_petty_cash_funds (business_unit_id)
  where status = 'ACTIVE';

create table if not exists public.sm_petty_cash_transactions (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  fund_id uuid not null references public.sm_petty_cash_funds(id) on delete restrict,
  txn_type text not null check (txn_type in ('EXPENSE', 'REPLENISHMENT', 'REVERSAL', 'ADJUSTMENT')),
  direction text not null check (direction in ('IN', 'OUT')),
  amount numeric(14, 2) not null check (amount > 0),
  txn_date date not null,
  category text not null default '',
  description text not null default '',
  reference text not null default '',
  notes text not null default '',
  source text not null default 'NONE' check (source in ('NONE', 'MAIN_CASH', 'BANK')),
  bank_account_id uuid references public.sm_bank_accounts(id) on delete restrict,
  expense_id uuid references public.sm_expenses(id) on delete restrict,
  payment_id uuid references public.sm_payments(id) on delete restrict,
  source_payment_id uuid references public.sm_payments(id) on delete restrict,
  bank_transaction_id uuid references public.sm_bank_transactions(id) on delete restrict,
  posting_status text not null default 'DRAFT' check (posting_status in ('DRAFT', 'POSTED', 'REVERSED')),
  reversed_from_id uuid references public.sm_petty_cash_transactions(id) on delete restrict,
  created_by uuid references public.profiles(id) on delete set null,
  posted_by uuid references public.profiles(id) on delete set null,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sm_petty_cash_tx_bu_date_idx
  on public.sm_petty_cash_transactions (business_unit_id, txn_date desc);

create index if not exists sm_petty_cash_tx_fund_status_idx
  on public.sm_petty_cash_transactions (fund_id, posting_status, txn_date desc);

create unique index if not exists sm_petty_cash_tx_ref_uidx
  on public.sm_petty_cash_transactions (fund_id, txn_type, reference)
  where reference <> ''
    and posting_status in ('DRAFT', 'POSTED')
    and reversed_from_id is null;

create table if not exists public.sm_petty_cash_reconciliations (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  fund_id uuid not null references public.sm_petty_cash_funds(id) on delete restrict,
  reconciliation_date date not null,
  system_balance numeric(14, 2) not null default 0,
  actual_counted numeric(14, 2) not null default 0,
  variance numeric(14, 2) not null default 0,
  variance_reason text not null default '',
  notes text not null default '',
  status text not null default 'DRAFT' check (status in ('DRAFT', 'SUBMITTED', 'APPROVED')),
  prepared_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  prepared_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists sm_petty_cash_recon_date_uidx
  on public.sm_petty_cash_reconciliations (fund_id, reconciliation_date)
  where status <> 'DRAFT';

create index if not exists sm_petty_cash_recon_bu_idx
  on public.sm_petty_cash_reconciliations (business_unit_id, reconciliation_date desc);

alter table public.sm_petty_cash_funds enable row level security;
alter table public.sm_petty_cash_transactions enable row level security;
alter table public.sm_petty_cash_reconciliations enable row level security;

revoke all on table public.sm_petty_cash_funds from anon, public;
revoke all on table public.sm_petty_cash_transactions from anon, public;
revoke all on table public.sm_petty_cash_reconciliations from anon, public;

grant select, insert, update, delete on table
  public.sm_petty_cash_funds,
  public.sm_petty_cash_transactions,
  public.sm_petty_cash_reconciliations
to authenticated, service_role;

do $$
declare
  t text;
begin
  foreach t in array array[
    'sm_petty_cash_funds',
    'sm_petty_cash_transactions',
    'sm_petty_cash_reconciliations'
  ]
  loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format(
      'create policy %I_select on public.%I for select to authenticated using (public.has_business_unit_access(business_unit_id))',
      t, t
    );
    execute format('drop policy if exists %I_insert on public.%I', t, t);
    execute format(
      'create policy %I_insert on public.%I for insert to authenticated with check (public.has_business_unit_access(business_unit_id))',
      t, t
    );
    execute format('drop policy if exists %I_update on public.%I', t, t);
    execute format(
      'create policy %I_update on public.%I for update to authenticated using (public.has_business_unit_access(business_unit_id)) with check (public.has_business_unit_access(business_unit_id))',
      t, t
    );
    execute format('drop policy if exists %I_delete on public.%I', t, t);
    execute format(
      'create policy %I_delete on public.%I for delete to authenticated using (public.has_business_unit_access(business_unit_id))',
      t, t
    );
  end loop;
end $$;

create or replace function public.sm_petty_cash_balance(p_fund_id uuid, p_as_of date default null)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_bu uuid := public.supermarket_business_unit_id();
  v_opening numeric(14, 2);
  v_signed numeric(14, 2);
begin
  select opening_balance into v_opening
  from public.sm_petty_cash_funds
  where id = p_fund_id and business_unit_id = v_bu;
  if not found then
    return 0;
  end if;
  select coalesce(sum(case when direction = 'IN' then amount else -amount end), 0)
    into v_signed
  from public.sm_petty_cash_transactions
  where fund_id = p_fund_id
    and posting_status = 'POSTED'
    and (p_as_of is null or txn_date <= p_as_of);
  return v_opening + v_signed;
end;
$$;

create or replace function public.sm_save_petty_cash_expense(
  p_fund_id uuid,
  p_amount numeric,
  p_date date,
  p_category text,
  p_description text,
  p_reference text,
  p_notes text,
  p_post boolean,
  p_draft_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bu uuid := public.supermarket_business_unit_id();
  v_id uuid;
  v_status text;
  v_expense_id uuid;
  v_payment_id uuid;
  v_balance numeric(14, 2);
  v_ref text := coalesce(btrim(p_reference), '');
  v_cat text := coalesce(btrim(p_category), '');
  v_desc text := coalesce(btrim(p_description), '');
  v_notes text := coalesce(btrim(p_notes), '');
begin
  if not public.has_supermarket_access() then
    raise exception 'Not authorized';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be positive';
  end if;
  if v_cat = '' then
    raise exception 'Category is required';
  end if;
  perform 1 from public.sm_petty_cash_funds
  where id = p_fund_id and business_unit_id = v_bu and status = 'ACTIVE'
  for update;
  if not found then
    raise exception 'Petty cash fund not found';
  end if;

  if p_draft_id is not null then
    select id, posting_status into v_id, v_status
    from public.sm_petty_cash_transactions
    where id = p_draft_id and business_unit_id = v_bu
    for update;
    if not found or v_status <> 'DRAFT' then
      raise exception 'Only a draft can be updated or posted';
    end if;
    update public.sm_petty_cash_transactions
    set fund_id = p_fund_id, amount = round(p_amount, 2), txn_date = p_date,
        category = v_cat, description = v_desc, reference = v_ref, notes = v_notes
    where id = v_id;
  else
    insert into public.sm_petty_cash_transactions (
      business_unit_id, fund_id, txn_type, direction, amount, txn_date,
      category, description, reference, notes, source, posting_status, created_by
    ) values (
      v_bu, p_fund_id, 'EXPENSE', 'OUT', round(p_amount, 2), p_date,
      v_cat, v_desc, v_ref, v_notes, 'NONE', 'DRAFT', auth.uid()
    )
    returning id into v_id;
  end if;

  if not p_post then
    return v_id;
  end if;

  v_balance := public.sm_petty_cash_balance(p_fund_id, p_date);
  if v_balance < round(p_amount, 2) then
    raise exception 'Insufficient petty cash balance';
  end if;

  insert into public.sm_expenses (
    business_unit_id, category, description, amount, expense_date, payment_status, status, created_by
  ) values (
    v_bu, v_cat, v_desc, round(p_amount, 2), p_date, 'PAID', 'POSTED', auth.uid()
  )
  returning id into v_expense_id;

  insert into public.sm_payments (
    business_unit_id, direction, kind, method, amount, payment_date,
    reference, notes, expense_id, created_by
  ) values (
    v_bu, 'OUT', 'EXPENSE_PAYMENT', 'PETTY_CASH', round(p_amount, 2), p_date,
    v_ref, 'PETTY_CASH_EXPENSE:' || v_id, v_expense_id, auth.uid()
  )
  returning id into v_payment_id;

  update public.sm_petty_cash_transactions
  set posting_status = 'POSTED',
      expense_id = v_expense_id,
      payment_id = v_payment_id,
      posted_by = auth.uid(),
      posted_at = now(),
      updated_at = now()
  where id = v_id;

  return v_id;
end;
$$;

create or replace function public.sm_save_petty_cash_replenishment(
  p_fund_id uuid,
  p_amount numeric,
  p_date date,
  p_source text,
  p_bank_account_id uuid,
  p_reference text,
  p_description text,
  p_notes text,
  p_post boolean,
  p_draft_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bu uuid := public.supermarket_business_unit_id();
  v_id uuid;
  v_status text;
  v_pc_pay uuid;
  v_src_pay uuid;
  v_bank_id uuid;
  v_ref text := coalesce(btrim(p_reference), '');
  v_desc text := coalesce(btrim(p_description), '');
  v_notes text := coalesce(btrim(p_notes), '');
begin
  if not public.has_supermarket_access() then
    raise exception 'Not authorized';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be positive';
  end if;
  if p_source not in ('MAIN_CASH', 'BANK') then
    raise exception 'Replenishment source must be MAIN_CASH or BANK';
  end if;
  perform 1 from public.sm_petty_cash_funds
  where id = p_fund_id and business_unit_id = v_bu and status = 'ACTIVE'
  for update;
  if not found then
    raise exception 'Petty cash fund not found';
  end if;
  if p_source = 'BANK' then
    perform 1 from public.sm_bank_accounts
    where id = p_bank_account_id and business_unit_id = v_bu and is_active = true;
    if not found then
      raise exception 'Bank account not found';
    end if;
  end if;

  if p_draft_id is not null then
    select id, posting_status into v_id, v_status
    from public.sm_petty_cash_transactions
    where id = p_draft_id and business_unit_id = v_bu
    for update;
    if not found or v_status <> 'DRAFT' then
      raise exception 'Only a draft can be updated or posted';
    end if;
    update public.sm_petty_cash_transactions
    set amount = round(p_amount, 2), txn_date = p_date, source = p_source,
        bank_account_id = case when p_source = 'BANK' then p_bank_account_id else null end,
        reference = v_ref, description = v_desc, notes = v_notes
    where id = v_id;
  else
    insert into public.sm_petty_cash_transactions (
      business_unit_id, fund_id, txn_type, direction, amount, txn_date,
      description, reference, notes, source, bank_account_id, posting_status, created_by
    ) values (
      v_bu, p_fund_id, 'REPLENISHMENT', 'IN', round(p_amount, 2), p_date,
      v_desc, v_ref, v_notes, p_source,
      case when p_source = 'BANK' then p_bank_account_id else null end,
      'DRAFT', auth.uid()
    )
    returning id into v_id;
  end if;

  if not p_post then
    return v_id;
  end if;

  insert into public.sm_payments (
    business_unit_id, direction, kind, method, amount, payment_date, reference, notes, created_by
  ) values (
    v_bu, 'IN', 'OTHER', 'PETTY_CASH', round(p_amount, 2), p_date,
    v_ref, 'PETTY_CASH_REPLENISH:' || v_id, auth.uid()
  )
  returning id into v_pc_pay;

  if p_source = 'MAIN_CASH' then
    insert into public.sm_payments (
      business_unit_id, direction, kind, method, amount, payment_date, reference, notes, created_by
    ) values (
      v_bu, 'OUT', 'OTHER', 'CASH', round(p_amount, 2), p_date,
      v_ref, 'PETTY_CASH_REPLENISH:' || v_id, auth.uid()
    )
    returning id into v_src_pay;
  else
    insert into public.sm_bank_transactions (
      business_unit_id, bank_account_id, transaction_date, reference, description, notes,
      debit, credit, source, movement_type, posting_status, status, created_by, posted_by, posted_at
    ) values (
      v_bu, p_bank_account_id, p_date, v_ref, coalesce(nullif(v_desc, ''), 'Petty cash replenishment'),
      'PETTY_CASH_REPLENISH:' || v_id, round(p_amount, 2), 0, 'SYSTEM', 'WITHDRAWAL', 'POSTED', 'UNMATCHED',
      auth.uid(), auth.uid(), now()
    )
    returning id into v_bank_id;
  end if;

  update public.sm_petty_cash_transactions
  set posting_status = 'POSTED',
      payment_id = v_pc_pay,
      source_payment_id = v_src_pay,
      bank_transaction_id = v_bank_id,
      posted_by = auth.uid(),
      posted_at = now(),
      updated_at = now()
  where id = v_id;

  return v_id;
end;
$$;

create or replace function public.sm_reverse_petty_cash_transaction(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bu uuid := public.supermarket_business_unit_id();
  v_orig public.sm_petty_cash_transactions%rowtype;
  v_rev uuid;
  v_pay uuid;
  v_src uuid;
  v_bank uuid;
begin
  if not public.has_supermarket_access() then
    raise exception 'Not authorized';
  end if;
  select * into v_orig
  from public.sm_petty_cash_transactions
  where id = p_id and business_unit_id = v_bu
  for update;
  if not found then
    raise exception 'Transaction not found';
  end if;
  if v_orig.posting_status <> 'POSTED' then
    raise exception 'Only a posted transaction can be reversed';
  end if;
  if v_orig.reversed_from_id is not null then
    raise exception 'A reversal cannot be reversed again';
  end if;

  if v_orig.txn_type = 'EXPENSE' and v_orig.expense_id is not null then
    update public.sm_expenses set status = 'VOID', updated_at = now()
    where id = v_orig.expense_id and business_unit_id = v_bu;
  end if;

  insert into public.sm_payments (
    business_unit_id, direction, kind, method, amount, payment_date, reference, notes, created_by
  ) values (
    v_bu,
    case when v_orig.direction = 'OUT' then 'IN' else 'OUT' end,
    'OTHER', 'PETTY_CASH', v_orig.amount, v_orig.txn_date,
    case when v_orig.reference = '' then 'REV' else 'REV-' || v_orig.reference end,
    'PETTY_CASH_REVERSAL:' || v_orig.id, auth.uid()
  )
  returning id into v_pay;

  if v_orig.txn_type = 'REPLENISHMENT' and v_orig.source = 'MAIN_CASH' then
    insert into public.sm_payments (
      business_unit_id, direction, kind, method, amount, payment_date, reference, notes, created_by
    ) values (
      v_bu, 'IN', 'OTHER', 'CASH', v_orig.amount, v_orig.txn_date,
      case when v_orig.reference = '' then 'REV' else 'REV-' || v_orig.reference end,
      'PETTY_CASH_REVERSAL:' || v_orig.id, auth.uid()
    )
    returning id into v_src;
  elsif v_orig.txn_type = 'REPLENISHMENT' and v_orig.source = 'BANK' and v_orig.bank_account_id is not null then
    insert into public.sm_bank_transactions (
      business_unit_id, bank_account_id, transaction_date, reference, description, notes,
      debit, credit, source, movement_type, posting_status, status,
      reversed_from_id, created_by, posted_by, posted_at
    ) values (
      v_bu, v_orig.bank_account_id, v_orig.txn_date,
      case when v_orig.reference = '' then 'REV' else 'REV-' || v_orig.reference end,
      'Reversal of petty cash replenishment', 'PETTY_CASH_REVERSAL:' || v_orig.id,
      0, v_orig.amount, 'SYSTEM', 'DEPOSIT', 'POSTED', 'UNMATCHED',
      v_orig.bank_transaction_id, auth.uid(), auth.uid(), now()
    )
    returning id into v_bank;
  end if;

  insert into public.sm_petty_cash_transactions (
    business_unit_id, fund_id, txn_type, direction, amount, txn_date, category, description,
    reference, notes, source, bank_account_id, payment_id, source_payment_id, bank_transaction_id,
    posting_status, reversed_from_id, created_by, posted_by, posted_at
  ) values (
    v_bu, v_orig.fund_id, 'REVERSAL',
    case when v_orig.direction = 'OUT' then 'IN' else 'OUT' end,
    v_orig.amount, v_orig.txn_date, v_orig.category,
    'Reversal of ' || v_orig.txn_type,
    case when v_orig.reference = '' then 'REV' else 'REV-' || v_orig.reference end,
    v_orig.notes, v_orig.source, v_orig.bank_account_id, v_pay, v_src, v_bank,
    'POSTED', v_orig.id, auth.uid(), auth.uid(), now()
  )
  returning id into v_rev;

  update public.sm_petty_cash_transactions
  set posting_status = 'REVERSED', updated_at = now()
  where id = v_orig.id;

  return v_rev;
end;
$$;

grant execute on function public.sm_petty_cash_balance(uuid, date) to authenticated, service_role;
grant execute on function public.sm_save_petty_cash_expense(uuid, numeric, date, text, text, text, text, boolean, uuid)
  to authenticated, service_role;
grant execute on function public.sm_save_petty_cash_replenishment(uuid, numeric, date, text, uuid, text, text, text, boolean, uuid)
  to authenticated, service_role;
grant execute on function public.sm_reverse_petty_cash_transaction(uuid)
  to authenticated, service_role;
