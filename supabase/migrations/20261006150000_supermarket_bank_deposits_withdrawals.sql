-- Bank deposits & withdrawals: extend existing sm_bank_transactions.
-- Additive only. Does not wipe operational data.
-- Cash linkage uses sm_payments (CASH IN/OUT, kind OTHER) so cash recon
-- and finance cash-on-hand stay on one source of truth.
-- Does NOT insert method=BANK payments (those are customer bank collections
-- and would double-count if loaded into bank reconciliation).

insert into public.permissions (code, module, resource, action, name)
values
  ('supermarket.banking.view', 'supermarket', 'banking', 'view', 'View supermarket banking'),
  ('supermarket.banking.create', 'supermarket', 'banking', 'create', 'Prepare bank deposits and withdrawals'),
  ('supermarket.banking.approve', 'supermarket', 'banking', 'approve', 'Post or reverse bank deposits and withdrawals')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code = 'SUPERMARKET_MANAGER'
  and p.code like 'supermarket.banking.%'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code = 'CASHIER'
  and p.code in (
    'supermarket.banking.view',
    'supermarket.banking.create'
  )
on conflict do nothing;

alter table public.sm_bank_transactions
  add column if not exists movement_type text not null default 'OTHER',
  add column if not exists posting_status text not null default 'POSTED',
  add column if not exists reversed_from_id uuid references public.sm_bank_transactions(id) on delete restrict,
  add column if not exists cash_payment_id uuid references public.sm_payments(id) on delete restrict,
  add column if not exists notes text not null default '',
  add column if not exists posted_by uuid references public.profiles(id) on delete set null,
  add column if not exists posted_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sm_bank_transactions_movement_type_check'
  ) then
    alter table public.sm_bank_transactions
      add constraint sm_bank_transactions_movement_type_check
      check (movement_type in ('DEPOSIT', 'WITHDRAWAL', 'OTHER'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'sm_bank_transactions_posting_status_check'
  ) then
    alter table public.sm_bank_transactions
      add constraint sm_bank_transactions_posting_status_check
      check (posting_status in ('DRAFT', 'POSTED', 'REVERSED'));
  end if;
end $$;

create index if not exists sm_bank_transactions_movement_idx
  on public.sm_bank_transactions (business_unit_id, movement_type, transaction_date desc);

create index if not exists sm_bank_transactions_posting_idx
  on public.sm_bank_transactions (business_unit_id, posting_status, transaction_date desc);

create unique index if not exists sm_bank_movements_reference_uidx
  on public.sm_bank_transactions (business_unit_id, bank_account_id, movement_type, reference)
  where source = 'SYSTEM'
    and movement_type in ('DEPOSIT', 'WITHDRAWAL')
    and reference <> ''
    and posting_status in ('DRAFT', 'POSTED')
    and reversed_from_id is null;

create or replace function public.sm_save_bank_cash_movement(
  p_account_id uuid,
  p_movement_type text,
  p_amount numeric,
  p_date date,
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
  v_created_by uuid;
  v_payment_id uuid;
  v_debit numeric(14, 2) := 0;
  v_credit numeric(14, 2) := 0;
  v_ref text := coalesce(btrim(p_reference), '');
  v_desc text := coalesce(btrim(p_description), '');
  v_notes text := coalesce(btrim(p_notes), '');
  v_cash_dir text;
begin
  if not public.has_supermarket_access() then
    raise exception 'Not authorized';
  end if;
  if p_movement_type not in ('DEPOSIT', 'WITHDRAWAL') then
    raise exception 'Movement type must be DEPOSIT or WITHDRAWAL';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be positive';
  end if;
  if p_date is null then
    raise exception 'Date is required';
  end if;

  perform 1
  from public.sm_bank_accounts
  where id = p_account_id
    and business_unit_id = v_bu
    and is_active = true
  for update;
  if not found then
    raise exception 'Bank account not found';
  end if;

  if p_movement_type = 'DEPOSIT' then
    v_credit := round(p_amount, 2);
    v_cash_dir := 'OUT';
  else
    v_debit := round(p_amount, 2);
    v_cash_dir := 'IN';
  end if;

  if p_draft_id is not null then
    select id, posting_status, created_by
      into v_id, v_status, v_created_by
    from public.sm_bank_transactions
    where id = p_draft_id
      and business_unit_id = v_bu
    for update;
    if not found then
      raise exception 'Draft not found';
    end if;
    if v_status <> 'DRAFT' then
      raise exception 'Only a draft can be updated or posted';
    end if;
    update public.sm_bank_transactions
    set bank_account_id = p_account_id,
        transaction_date = p_date,
        reference = v_ref,
        description = v_desc,
        notes = v_notes,
        debit = v_debit,
        credit = v_credit,
        movement_type = p_movement_type
    where id = v_id;
  else
    insert into public.sm_bank_transactions (
      business_unit_id, bank_account_id, transaction_date, reference, description, notes,
      debit, credit, source, movement_type, posting_status, status, created_by
    ) values (
      v_bu, p_account_id, p_date, v_ref, v_desc, v_notes,
      v_debit, v_credit, 'SYSTEM', p_movement_type, 'DRAFT', 'UNMATCHED', auth.uid()
    )
    returning id into v_id;
  end if;

  if not p_post then
    return v_id;
  end if;

  insert into public.sm_payments (
    business_unit_id, direction, kind, method, amount, payment_date,
    reference, notes, created_by
  ) values (
    v_bu, v_cash_dir, 'OTHER', 'CASH', round(p_amount, 2), p_date,
    v_ref,
    case
      when p_movement_type = 'DEPOSIT' then 'BANK_DEPOSIT:' || v_id
      else 'BANK_WITHDRAWAL:' || v_id
    end,
    auth.uid()
  )
  returning id into v_payment_id;

  update public.sm_bank_transactions
  set posting_status = 'POSTED',
      cash_payment_id = v_payment_id,
      external_reference = v_payment_id::text,
      posted_by = auth.uid(),
      posted_at = now()
  where id = v_id;

  return v_id;
end;
$$;

create or replace function public.sm_reverse_bank_cash_movement(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bu uuid := public.supermarket_business_unit_id();
  v_orig public.sm_bank_transactions%rowtype;
  v_rev_id uuid;
  v_payment_id uuid;
  v_amount numeric(14, 2);
  v_cash_dir text;
  v_rev_type text;
begin
  if not public.has_supermarket_access() then
    raise exception 'Not authorized';
  end if;

  select * into v_orig
  from public.sm_bank_transactions
  where id = p_id and business_unit_id = v_bu
  for update;
  if not found then
    raise exception 'Transaction not found';
  end if;
  if v_orig.movement_type not in ('DEPOSIT', 'WITHDRAWAL') then
    raise exception 'Only deposits and withdrawals can be reversed';
  end if;
  if v_orig.posting_status <> 'POSTED' then
    raise exception 'Only a posted transaction can be reversed';
  end if;
  if v_orig.reversed_from_id is not null then
    raise exception 'A reversal cannot be reversed again';
  end if;

  v_amount := round(v_orig.credit + v_orig.debit, 2);
  if v_orig.movement_type = 'DEPOSIT' then
    v_rev_type := 'WITHDRAWAL';
    v_cash_dir := 'IN';
  else
    v_rev_type := 'DEPOSIT';
    v_cash_dir := 'OUT';
  end if;

  insert into public.sm_payments (
    business_unit_id, direction, kind, method, amount, payment_date,
    reference, notes, created_by
  ) values (
    v_bu, v_cash_dir, 'OTHER', 'CASH', v_amount, v_orig.transaction_date,
    case when v_orig.reference = '' then 'REV' else 'REV-' || v_orig.reference end,
    'BANK_REVERSAL:' || v_orig.id,
    auth.uid()
  )
  returning id into v_payment_id;

  insert into public.sm_bank_transactions (
    business_unit_id, bank_account_id, transaction_date, reference, description, notes,
    debit, credit, source, movement_type, posting_status, status,
    reversed_from_id, cash_payment_id, external_reference, created_by, posted_by, posted_at
  ) values (
    v_bu, v_orig.bank_account_id, v_orig.transaction_date,
    case when v_orig.reference = '' then 'REV' else 'REV-' || v_orig.reference end,
    'Reversal of ' || v_orig.movement_type,
    coalesce(v_orig.notes, ''),
    v_orig.credit, v_orig.debit, 'SYSTEM', v_rev_type, 'POSTED', 'UNMATCHED',
    v_orig.id, v_payment_id, v_payment_id::text, auth.uid(), auth.uid(), now()
  )
  returning id into v_rev_id;

  update public.sm_bank_transactions
  set posting_status = 'REVERSED'
  where id = v_orig.id;

  return v_rev_id;
end;
$$;

grant execute on function public.sm_save_bank_cash_movement(uuid, text, numeric, date, text, text, text, boolean, uuid)
  to authenticated, service_role;
grant execute on function public.sm_reverse_bank_cash_movement(uuid)
  to authenticated, service_role;
