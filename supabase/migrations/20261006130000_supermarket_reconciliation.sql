-- Supermarket reconciliation (sales, cash, stocktake, bank).
-- Additive only: does not alter or wipe operational supermarket tables.

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

insert into public.permissions (code, module, resource, action, name)
values
  ('supermarket.reconciliation.view', 'supermarket', 'reconciliation', 'view', 'View supermarket reconciliation'),
  ('supermarket.reconciliation.create', 'supermarket', 'reconciliation', 'create', 'Prepare supermarket reconciliation'),
  ('supermarket.reconciliation.approve', 'supermarket', 'reconciliation', 'approve', 'Approve supermarket reconciliation'),
  ('supermarket.reconciliation.post', 'supermarket', 'reconciliation', 'post', 'Post supermarket stock reconciliation')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code = 'SUPERMARKET_MANAGER'
  and p.code like 'supermarket.reconciliation.%'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code = 'CASHIER'
  and p.code in (
    'supermarket.reconciliation.view',
    'supermarket.reconciliation.create'
  )
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code = 'STOREKEEPER'
  and p.code in (
    'supermarket.reconciliation.view',
    'supermarket.reconciliation.create'
  )
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Sales reconciliation
-- ---------------------------------------------------------------------------

create table if not exists public.sm_sales_reconciliations (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  reconciliation_date date not null default (timezone('Africa/Dar_es_Salaam', now()))::date,
  period_start date not null,
  period_end date not null,
  expected_cash numeric(14, 2) not null default 0,
  expected_card numeric(14, 2) not null default 0,
  expected_mobile numeric(14, 2) not null default 0,
  expected_other numeric(14, 2) not null default 0,
  expected_total numeric(14, 2) not null default 0,
  expected_sales numeric(14, 2) not null default 0,
  unpaid_credit numeric(14, 2) not null default 0,
  actual_cash numeric(14, 2) not null default 0,
  actual_card numeric(14, 2) not null default 0,
  actual_mobile numeric(14, 2) not null default 0,
  actual_other numeric(14, 2) not null default 0,
  actual_total numeric(14, 2) not null default 0,
  variance numeric(14, 2) not null default 0,
  variance_reason text not null default '',
  notes text not null default '',
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'SUBMITTED', 'APPROVED', 'VOID')),
  prepared_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  prepared_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create unique index if not exists sm_sales_reconciliations_period_uidx
  on public.sm_sales_reconciliations (business_unit_id, period_start, period_end)
  where status <> 'VOID';

create index if not exists sm_sales_reconciliations_bu_date_idx
  on public.sm_sales_reconciliations (business_unit_id, reconciliation_date desc);

create index if not exists sm_sales_reconciliations_status_idx
  on public.sm_sales_reconciliations (business_unit_id, status);

-- ---------------------------------------------------------------------------
-- Cash reconciliation
-- ---------------------------------------------------------------------------

create table if not exists public.sm_cash_reconciliations (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  reconciliation_date date not null,
  period_start date not null,
  period_end date not null,
  opening_balance numeric(14, 2) not null default 0,
  cash_in numeric(14, 2) not null default 0,
  cash_out numeric(14, 2) not null default 0,
  expected_closing numeric(14, 2) not null default 0,
  actual_counted numeric(14, 2) not null default 0,
  variance numeric(14, 2) not null default 0,
  variance_reason text not null default '',
  notes text not null default '',
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'SUBMITTED', 'APPROVED', 'VOID')),
  prepared_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  prepared_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create unique index if not exists sm_cash_reconciliations_period_uidx
  on public.sm_cash_reconciliations (business_unit_id, period_start, period_end)
  where status <> 'VOID';

create index if not exists sm_cash_reconciliations_bu_date_idx
  on public.sm_cash_reconciliations (business_unit_id, reconciliation_date desc);

create index if not exists sm_cash_reconciliations_status_idx
  on public.sm_cash_reconciliations (business_unit_id, status);

-- ---------------------------------------------------------------------------
-- Stocktake
-- ---------------------------------------------------------------------------

create table if not exists public.sm_stock_reconciliations (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  stocktake_date date not null,
  category_id uuid references public.sm_categories(id) on delete set null,
  notes text not null default '',
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'SUBMITTED', 'APPROVED', 'POSTED', 'VOID')),
  variance_count integer not null default 0,
  variance_value numeric(14, 2) not null default 0,
  prepared_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  posted_by uuid references public.profiles(id) on delete set null,
  prepared_at timestamptz,
  approved_at timestamptz,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists sm_stock_reconciliations_date_uidx
  on public.sm_stock_reconciliations (business_unit_id, stocktake_date)
  where status <> 'VOID';

create index if not exists sm_stock_reconciliations_bu_date_idx
  on public.sm_stock_reconciliations (business_unit_id, stocktake_date desc);

create index if not exists sm_stock_reconciliations_status_idx
  on public.sm_stock_reconciliations (business_unit_id, status);

create table if not exists public.sm_stock_reconciliation_items (
  id uuid primary key default gen_random_uuid(),
  reconciliation_id uuid not null references public.sm_stock_reconciliations(id) on delete cascade,
  product_id uuid not null references public.sm_products(id) on delete restrict,
  system_qty integer not null default 0,
  physical_qty integer,
  variance_qty integer not null default 0,
  unit_cost numeric(14, 2) not null default 0,
  variance_value numeric(14, 2) not null default 0,
  reason text not null default '',
  notes text not null default '',
  posted_adjustment_id uuid references public.sm_stock_adjustments(id) on delete set null,
  unique (reconciliation_id, product_id)
);

create index if not exists sm_stock_reconciliation_items_recon_idx
  on public.sm_stock_reconciliation_items (reconciliation_id);

create index if not exists sm_stock_reconciliation_items_product_idx
  on public.sm_stock_reconciliation_items (product_id);

-- ---------------------------------------------------------------------------
-- Bank
-- ---------------------------------------------------------------------------

create table if not exists public.sm_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  bank_name text not null,
  account_name text not null,
  account_reference text not null default '',
  opening_balance numeric(14, 2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sm_bank_accounts_bu_idx
  on public.sm_bank_accounts (business_unit_id, is_active);

create table if not exists public.sm_bank_transactions (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  bank_account_id uuid not null references public.sm_bank_accounts(id) on delete restrict,
  transaction_date date not null,
  reference text not null default '',
  description text not null default '',
  debit numeric(14, 2) not null default 0 check (debit >= 0),
  credit numeric(14, 2) not null default 0 check (credit >= 0),
  amount numeric(14, 2) generated always as (credit - debit) stored,
  source text not null check (source in ('STATEMENT', 'SYSTEM')),
  external_reference text not null default '',
  status text not null default 'UNMATCHED'
    check (status in ('UNMATCHED', 'MATCHED', 'MANUALLY_MATCHED', 'EXCLUDED')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (not (debit = 0 and credit = 0))
);

create index if not exists sm_bank_transactions_account_date_idx
  on public.sm_bank_transactions (bank_account_id, transaction_date desc);

create index if not exists sm_bank_transactions_bu_date_idx
  on public.sm_bank_transactions (business_unit_id, transaction_date desc);

create index if not exists sm_bank_transactions_status_idx
  on public.sm_bank_transactions (bank_account_id, status);

create unique index if not exists sm_bank_transactions_system_ext_uidx
  on public.sm_bank_transactions (business_unit_id, bank_account_id, source, external_reference)
  where source = 'SYSTEM' and external_reference <> '';

create table if not exists public.sm_bank_reconciliations (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  bank_account_id uuid not null references public.sm_bank_accounts(id) on delete restrict,
  statement_start date not null,
  statement_end date not null,
  statement_opening_balance numeric(14, 2) not null default 0,
  statement_closing_balance numeric(14, 2) not null default 0,
  system_closing_balance numeric(14, 2) not null default 0,
  difference numeric(14, 2) not null default 0,
  unmatched_count integer not null default 0,
  notes text not null default '',
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'SUBMITTED', 'APPROVED', 'VOID')),
  prepared_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  prepared_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (statement_end >= statement_start)
);

create unique index if not exists sm_bank_reconciliations_period_uidx
  on public.sm_bank_reconciliations (bank_account_id, statement_start, statement_end)
  where status <> 'VOID';

create index if not exists sm_bank_reconciliations_bu_idx
  on public.sm_bank_reconciliations (business_unit_id, statement_end desc);

create table if not exists public.sm_bank_reconciliation_items (
  id uuid primary key default gen_random_uuid(),
  reconciliation_id uuid not null references public.sm_bank_reconciliations(id) on delete cascade,
  bank_transaction_id uuid not null references public.sm_bank_transactions(id) on delete restrict,
  matched_transaction_id uuid references public.sm_bank_transactions(id) on delete set null,
  match_status text not null default 'UNMATCHED'
    check (match_status in ('UNMATCHED', 'MATCHED', 'MANUALLY_MATCHED', 'EXCLUDED')),
  notes text not null default '',
  unique (reconciliation_id, bank_transaction_id)
);

create index if not exists sm_bank_reconciliation_items_recon_idx
  on public.sm_bank_reconciliation_items (reconciliation_id);

create index if not exists sm_bank_reconciliation_items_txn_idx
  on public.sm_bank_reconciliation_items (bank_transaction_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.sm_sales_reconciliations enable row level security;
alter table public.sm_cash_reconciliations enable row level security;
alter table public.sm_stock_reconciliations enable row level security;
alter table public.sm_stock_reconciliation_items enable row level security;
alter table public.sm_bank_accounts enable row level security;
alter table public.sm_bank_transactions enable row level security;
alter table public.sm_bank_reconciliations enable row level security;
alter table public.sm_bank_reconciliation_items enable row level security;

revoke all on table public.sm_sales_reconciliations from anon, public;
revoke all on table public.sm_cash_reconciliations from anon, public;
revoke all on table public.sm_stock_reconciliations from anon, public;
revoke all on table public.sm_stock_reconciliation_items from anon, public;
revoke all on table public.sm_bank_accounts from anon, public;
revoke all on table public.sm_bank_transactions from anon, public;
revoke all on table public.sm_bank_reconciliations from anon, public;
revoke all on table public.sm_bank_reconciliation_items from anon, public;

grant select, insert, update, delete on table
  public.sm_sales_reconciliations,
  public.sm_cash_reconciliations,
  public.sm_stock_reconciliations,
  public.sm_stock_reconciliation_items,
  public.sm_bank_accounts,
  public.sm_bank_transactions,
  public.sm_bank_reconciliations,
  public.sm_bank_reconciliation_items
to authenticated, service_role;

do $$
declare
  t text;
begin
  foreach t in array array[
    'sm_sales_reconciliations',
    'sm_cash_reconciliations',
    'sm_stock_reconciliations',
    'sm_bank_accounts',
    'sm_bank_transactions',
    'sm_bank_reconciliations'
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

drop policy if exists sm_stock_reconciliation_items_all on public.sm_stock_reconciliation_items;
create policy sm_stock_reconciliation_items_all on public.sm_stock_reconciliation_items
  for all to authenticated
  using (
    exists (
      select 1 from public.sm_stock_reconciliations r
      where r.id = reconciliation_id and public.has_business_unit_access(r.business_unit_id)
    )
  )
  with check (
    exists (
      select 1 from public.sm_stock_reconciliations r
      where r.id = reconciliation_id and public.has_business_unit_access(r.business_unit_id)
    )
  );

drop policy if exists sm_bank_reconciliation_items_all on public.sm_bank_reconciliation_items;
create policy sm_bank_reconciliation_items_all on public.sm_bank_reconciliation_items
  for all to authenticated
  using (
    exists (
      select 1 from public.sm_bank_reconciliations r
      where r.id = reconciliation_id and public.has_business_unit_access(r.business_unit_id)
    )
  )
  with check (
    exists (
      select 1 from public.sm_bank_reconciliations r
      where r.id = reconciliation_id and public.has_business_unit_access(r.business_unit_id)
    )
  );
