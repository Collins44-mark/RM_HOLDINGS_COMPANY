-- Historical Tally ledgers. NOT APPLIED.
-- Reviewed against public.business_units (uuid id, unique code) and the cash
-- tables read by src/lib/data/finance.ts. Those queries name sm_sales,
-- sm_expenses, sch_fee_payments, sch_expenses, farm_jobs, farm_expenses,
-- rent_payments, hall_bookings, property_expenses, bee_sale_payments,
-- bee_expense_payments, ls_sale_payments, ls_rental_payments, and
-- ls_expense_payments. This migration does not alter any of them.
--
-- No table or index named finance_ledger_imports or finance_ledger_lines exists.
-- business_unit_id is left null by the import. A later mapping may fill it.
-- Filling it still does not make these rows sales, income, expenses, or payments.
--
-- Backup before apply:
--   select to_regclass('public.finance_ledger_imports');  -- expect null
--   select to_regclass('public.finance_ledger_lines');    -- expect null
--   select 'sm_sales' as t, count(*) from public.sm_sales
--   union all select 'sm_expenses', count(*) from public.sm_expenses
--   union all select 'farm_expenses', count(*) from public.farm_expenses
--   union all select 'sch_expenses', count(*) from public.sch_expenses
--   union all select 'rice_expenses', count(*) from public.rice_expenses
--   union all select 'property_expenses', count(*) from public.property_expenses;
-- After import, those counts must be unchanged.
-- Rollback: data-import/templates/rollback-finance-historical-ledgers.sql

create extension if not exists "pgcrypto";

create table if not exists public.finance_ledger_imports (
  id uuid primary key default gen_random_uuid(),
  source_filename text not null,
  source_sha256 text not null,
  content_fingerprint text not null,
  account_name text not null,
  period_from date,
  period_to date,
  suggested_unit text,
  status text not null default 'imported' check (status in ('imported')),
  line_count integer not null check (line_count >= 0),
  imported_at timestamptz not null default now(),
  constraint finance_ledger_imports_source_sha256_key unique (source_sha256),
  constraint finance_ledger_imports_content_fingerprint_key unique (content_fingerprint)
);

create table if not exists public.finance_ledger_lines (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.finance_ledger_imports(id) on delete restrict,
  business_unit_id uuid references public.business_units(id) on delete restrict,
  account_name text not null,
  line_kind text not null check (line_kind in ('transaction', 'opening_balance')),
  entry_date date not null,
  particulars text not null default '',
  side text not null check (side in ('debit', 'credit')),
  debit numeric(16, 2) not null default 0 check (debit >= 0),
  credit numeric(16, 2) not null default 0 check (credit >= 0),
  voucher_type text not null default '',
  voucher_number text not null default '',
  source_filename text not null,
  source_sha256 text not null,
  source_page integer not null check (source_page > 0),
  source_line integer not null check (source_line > 0),
  raw_text text not null,
  created_at timestamptz not null default now(),
  constraint finance_ledger_lines_one_side check (
    (side = 'debit' and debit > 0 and credit = 0)
    or (side = 'credit' and credit > 0 and debit = 0)
  ),
  constraint finance_ledger_lines_source_key unique (source_sha256, source_page, source_line),
  constraint finance_ledger_lines_natural_key unique (
    account_name,
    line_kind,
    entry_date,
    side,
    debit,
    credit,
    voucher_type,
    voucher_number,
    particulars
  )
);

create index if not exists finance_ledger_lines_account_idx
  on public.finance_ledger_lines (account_name, entry_date);

create index if not exists finance_ledger_lines_import_idx
  on public.finance_ledger_lines (import_id);

alter table public.finance_ledger_imports enable row level security;
alter table public.finance_ledger_lines enable row level security;

revoke all on table public.finance_ledger_imports from public, anon, authenticated;
revoke all on table public.finance_ledger_lines from public, anon, authenticated;
grant select, insert on table public.finance_ledger_imports to service_role;
grant select, insert on table public.finance_ledger_lines to service_role;

comment on table public.finance_ledger_imports is
  'One historical Tally PDF. Identical content cannot be imported twice.';
comment on table public.finance_ledger_lines is
  'Historical debit and credit lines. Not a source for consolidated cash, sales, income, expenses, or payments.';

create or replace function public.import_historical_ledger(p_batch jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_import uuid;
  v_sha text := p_batch->>'source_sha256';
  v_fingerprint text := p_batch->>'content_fingerprint';
  v_inserted integer := 0;
  v_skipped integer := 0;
  v_wrote integer := 0;
  v_line jsonb;
begin
  if exists (
    select 1 from public.finance_ledger_imports
    where content_fingerprint = v_fingerprint
      and source_sha256 <> v_sha
  ) then
    return jsonb_build_object('status', 'duplicate_content', 'inserted', 0);
  end if;

  insert into public.finance_ledger_imports (
    source_filename, source_sha256, content_fingerprint, account_name,
    period_from, period_to, suggested_unit, line_count
  ) values (
    p_batch->>'source_filename',
    v_sha,
    v_fingerprint,
    p_batch->>'account_name',
    nullif(p_batch->>'period_from', '')::date,
    nullif(p_batch->>'period_to', '')::date,
    nullif(p_batch->>'suggested_unit', ''),
    jsonb_array_length(p_batch->'lines')
  )
  on conflict (source_sha256) do nothing
  returning id into v_import;

  if v_import is null then
    select id into v_import
    from public.finance_ledger_imports
    where source_sha256 = v_sha;
  end if;

  for v_line in select value from jsonb_array_elements(p_batch->'lines')
  loop
    insert into public.finance_ledger_lines (
      import_id, account_name, line_kind, entry_date, particulars, side,
      debit, credit, voucher_type, voucher_number, source_filename,
      source_sha256, source_page, source_line, raw_text
    ) values (
      v_import,
      v_line->>'account_name',
      v_line->>'line_kind',
      (v_line->>'entry_date')::date,
      coalesce(v_line->>'particulars', ''),
      v_line->>'side',
      coalesce((v_line->>'debit')::numeric, 0),
      coalesce((v_line->>'credit')::numeric, 0),
      coalesce(v_line->>'voucher_type', ''),
      coalesce(v_line->>'voucher_number', ''),
      v_line->>'source_filename',
      v_sha,
      (v_line->>'source_page')::integer,
      (v_line->>'source_line')::integer,
      v_line->>'raw_text'
    )
    on conflict (source_sha256, source_page, source_line) do nothing;
    get diagnostics v_wrote = row_count;

    if v_wrote = 1 then
      v_inserted := v_inserted + 1;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'status', 'ok',
    'import_id', v_import,
    'inserted', v_inserted,
    'already_present', v_skipped
  );
end;
$$;

revoke all on function public.import_historical_ledger(jsonb) from public, anon, authenticated;
grant execute on function public.import_historical_ledger(jsonb) to service_role;
