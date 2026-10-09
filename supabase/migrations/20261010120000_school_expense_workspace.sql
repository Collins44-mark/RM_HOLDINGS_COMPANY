-- School Expenses workspace: user-managed types, manual posting, optional bus/payee/method.
-- Additive only. Reuses canonical sch_expenses / sch_expense_categories.
-- Transport fuel and maintenance already insert into sch_expenses — do not duplicate those rows.

alter table public.sch_expense_categories
  add column if not exists description text not null default '';

create unique index if not exists sch_expense_categories_name_active_uidx
  on public.sch_expense_categories (business_unit_id, lower(btrim(name)))
  where is_active;

alter table public.sch_expenses
  add column if not exists method text not null default '',
  add column if not exists payee text not null default '',
  add column if not exists bus_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sch_expenses_method_check') then
    alter table public.sch_expenses
      add constraint sch_expenses_method_check
      check (method in ('', 'CASH', 'MOBILE_MONEY', 'BANK'));
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sch_expenses_bus_bu_fk') then
    alter table public.sch_expenses
      add constraint sch_expenses_bus_bu_fk
      foreign key (bus_id, business_unit_id)
      references public.sch_buses (id, business_unit_id)
      on delete restrict;
  end if;
end
$$;

create index if not exists sch_expenses_bu_date_idx
  on public.sch_expenses (business_unit_id, expense_date desc);

create index if not exists sch_expenses_bu_cat_date_idx
  on public.sch_expenses (business_unit_id, category_id, expense_date desc);

create or replace function public.sch_record_manual_expense(
  p_category_id uuid,
  p_amount numeric,
  p_expense_date date,
  p_description text,
  p_method text,
  p_payee text,
  p_reference text,
  p_bus_id uuid,
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
  v_cat_bu uuid;
  v_cat_active boolean;
  v_bus_bu uuid;
  v_existing uuid;
  v_expense uuid;
  v_number text;
  v_method text := upper(btrim(coalesce(p_method, '')));
  v_amount numeric;
begin
  if p_request_id is null then
    raise exception 'Expense request is invalid.';
  end if;
  if p_expense_date is null then
    raise exception 'Enter a valid expense date.';
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

  select business_unit_id, is_active into v_cat_bu, v_cat_active
  from public.sch_expense_categories
  where id = p_category_id;
  if v_cat_bu is null then
    raise exception 'Select an expense type.';
  end if;
  if not public.has_business_unit_access(v_cat_bu) then
    raise exception 'Not authorized for this school.';
  end if;
  if not v_cat_active then
    raise exception 'That expense type is archived.';
  end if;
  v_bu := v_cat_bu;

  if p_bus_id is not null then
    select business_unit_id into v_bus_bu
    from public.sch_buses
    where id = p_bus_id;
    if v_bus_bu is null or v_bus_bu <> v_bu then
      raise exception 'The selected bus was not found.';
    end if;
  end if;

  select id into v_existing
  from public.sch_expenses
  where business_unit_id = v_bu
    and request_id = p_request_id
  limit 1;
  if v_existing is not null then
    return jsonb_build_object('id', v_existing, 'duplicate', true);
  end if;

  v_number := public.sch_next_document_number(v_bu, 'expense', 'EXP');

  insert into public.sch_expenses (
    business_unit_id, category_id, expense_number, expense_date, amount, description, reference,
    method, payee, bus_id, source_type, source_id, request_id, recorded_by, is_active
  )
  values (
    v_bu, p_category_id, v_number, p_expense_date, v_amount,
    btrim(coalesce(p_description, '')), btrim(coalesce(p_reference, '')),
    v_method, btrim(coalesce(p_payee, '')), p_bus_id,
    'MANUAL', null, p_request_id, p_actor_id, true
  )
  returning id into v_expense;

  return jsonb_build_object('id', v_expense, 'expense_number', v_number, 'amount', v_amount, 'duplicate', false);
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
  if v_source <> 'MANUAL' then
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

  return jsonb_build_object('id', p_expense_id, 'expense_number', v_number, 'already_reversed', false, 'actor_id', p_actor_id);
end;
$$;

revoke all on function public.sch_record_manual_expense(uuid, numeric, date, text, text, text, text, uuid, uuid, uuid) from public, anon;
grant execute on function public.sch_record_manual_expense(uuid, numeric, date, text, text, text, text, uuid, uuid, uuid) to authenticated, service_role;

revoke all on function public.sch_reverse_manual_expense(uuid, uuid) from public, anon;
grant execute on function public.sch_reverse_manual_expense(uuid, uuid) to authenticated, service_role;
