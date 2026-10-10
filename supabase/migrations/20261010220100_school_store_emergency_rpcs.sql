-- Store receive / sale / issue and emergency fund posting RPCs.

create or replace function public.sch_store_receive(
  p_item_id uuid,
  p_quantity numeric,
  p_unit_cost numeric,
  p_occurred_on date,
  p_supplier text,
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
  v_existing uuid;
  v_qty numeric;
  v_cost numeric;
  v_on_hand numeric;
  v_avg numeric;
  v_new_avg numeric;
  v_movement uuid;
begin
  if p_request_id is null then raise exception 'Stock request is invalid.'; end if;
  if p_occurred_on is null then raise exception 'Enter a valid purchase date.'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantity must be greater than zero.'; end if;
  if p_unit_cost is null or p_unit_cost < 0 then raise exception 'Unit cost cannot be negative.'; end if;
  v_qty := round(p_quantity, 3);
  v_cost := round(p_unit_cost, 2);

  select id into v_existing from public.sch_store_movements where request_id = p_request_id limit 1;
  if v_existing is not null then
    return jsonb_build_object('id', v_existing, 'duplicate', true);
  end if;

  select business_unit_id, qty_on_hand, avg_unit_cost
    into v_bu, v_on_hand, v_avg
  from public.sch_store_items
  where id = p_item_id
  for update;
  if v_bu is null then raise exception 'Item was not found.'; end if;
  if not public.has_business_unit_access(v_bu) then raise exception 'Not authorized for this school.'; end if;

  if v_on_hand + v_qty = 0 then
    v_new_avg := v_cost;
  else
    v_new_avg := round(((v_on_hand * v_avg) + (v_qty * v_cost)) / (v_on_hand + v_qty), 2);
  end if;

  update public.sch_store_items
    set qty_on_hand = qty_on_hand + v_qty,
        avg_unit_cost = v_new_avg,
        purchase_cost = v_cost,
        updated_at = now()
  where id = p_item_id;

  insert into public.sch_store_movements (
    business_unit_id, item_id, movement_type, quantity, unit_cost, occurred_on,
    reference, notes, supplier, request_id, recorded_by, is_active
  ) values (
    v_bu, p_item_id, 'RECEIVE', v_qty, v_cost, p_occurred_on,
    btrim(coalesce(p_reference, '')), btrim(coalesce(p_notes, '')), btrim(coalesce(p_supplier, '')),
    p_request_id, p_actor_id, true
  ) returning id into v_movement;

  return jsonb_build_object('id', v_movement, 'duplicate', false);
end;
$$;

create or replace function public.sch_store_adjust(
  p_item_id uuid,
  p_quantity numeric,
  p_reason text,
  p_occurred_on date,
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
  v_on_hand numeric;
  v_avg numeric;
  v_delta numeric;
  v_movement uuid;
begin
  if p_request_id is null then raise exception 'Stock request is invalid.'; end if;
  if p_occurred_on is null then raise exception 'Enter a valid date.'; end if;
  if p_quantity is null then raise exception 'Enter an adjustment quantity.'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Enter a reason for this adjustment.'; end if;
  v_delta := round(p_quantity, 3);
  if v_delta = 0 then raise exception 'Adjustment quantity cannot be zero.'; end if;

  select id into v_existing from public.sch_store_movements where request_id = p_request_id limit 1;
  if v_existing is not null then
    return jsonb_build_object('id', v_existing, 'duplicate', true);
  end if;

  select business_unit_id, qty_on_hand, avg_unit_cost into v_bu, v_on_hand, v_avg
  from public.sch_store_items where id = p_item_id for update;
  if v_bu is null then raise exception 'Item was not found.'; end if;
  if not public.has_business_unit_access(v_bu) then raise exception 'Not authorized for this school.'; end if;
  if v_on_hand + v_delta < 0 then raise exception 'Stock on hand cannot be negative.'; end if;

  update public.sch_store_items
    set qty_on_hand = qty_on_hand + v_delta, updated_at = now()
  where id = p_item_id;

  insert into public.sch_store_movements (
    business_unit_id, item_id, movement_type, quantity, unit_cost, occurred_on,
    notes, request_id, recorded_by, is_active
  ) values (
    v_bu, p_item_id, 'ADJUST', abs(v_delta), v_avg, p_occurred_on,
    btrim(p_reason) || case when v_delta < 0 then ' (decrease)' else ' (increase)' end,
    p_request_id, p_actor_id, true
  ) returning id into v_movement;

  return jsonb_build_object('id', v_movement, 'duplicate', false);
end;
$$;

create or replace function public.sch_store_create_sale(
  p_student_id uuid,
  p_lines jsonb,
  p_sale_date date,
  p_paid_amount numeric,
  p_method text,
  p_reference text,
  p_admission_id uuid,
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
  v_enrollment uuid;
  v_year uuid;
  v_class uuid;
  v_level uuid;
  v_existing uuid;
  v_sale uuid;
  v_number text;
  v_charge uuid;
  v_line jsonb;
  v_item uuid;
  v_qty numeric;
  v_on_hand numeric;
  v_price numeric;
  v_cost numeric;
  v_active boolean;
  v_subtotal numeric := 0;
  v_cogs numeric := 0;
  v_paid numeric := round(coalesce(p_paid_amount, 0), 2);
  v_status text;
  v_method text := upper(btrim(coalesce(p_method, '')));
  v_payment uuid;
  v_pay_number text;
  v_cat uuid;
  v_expense uuid;
begin
  if p_request_id is null then raise exception 'Sale request is invalid.'; end if;
  if p_sale_date is null then raise exception 'Enter a valid sale date.'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 1 then
    raise exception 'Add at least one item to the sale.';
  end if;
  if v_paid < 0 then raise exception 'Paid amount cannot be negative.'; end if;

  select s.business_unit_id into v_bu
  from public.sch_students s
  where s.id = p_student_id and s.status = 'active';
  if v_bu is null then raise exception 'Student was not found.'; end if;
  if not public.has_business_unit_access(v_bu) then raise exception 'Not authorized for this school.'; end if;

  select id into v_existing from public.sch_store_sales where business_unit_id = v_bu and request_id = p_request_id limit 1;
  if v_existing is not null then
    return jsonb_build_object('id', v_existing, 'duplicate', true);
  end if;

  select e.id, e.academic_year_id, e.class_id
    into v_enrollment, v_year, v_class
  from public.sch_student_enrollments e
  where e.student_id = p_student_id
    and e.business_unit_id = v_bu
    and e.status = 'active'
  order by e.created_at desc
  limit 1;
  if v_enrollment is null then raise exception 'Student has no active enrollment.'; end if;
  select level_id into v_level from public.sch_classes where id = v_class and business_unit_id = v_bu;
  if v_class is null or v_level is null then raise exception 'Academic placement was not found.'; end if;

  v_number := public.sch_next_document_number(v_bu, 'store_sale', 'SAL');

  insert into public.sch_store_sales (
    business_unit_id, sale_number, student_id, enrollment_id, admission_id, sale_date,
    subtotal, paid_amount, cost_of_goods, status, request_id, recorded_by, is_active
  ) values (
    v_bu, v_number, p_student_id, v_enrollment, p_admission_id, p_sale_date,
    0, 0, 0, 'outstanding', p_request_id, p_actor_id, true
  ) returning id into v_sale;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_item := nullif(v_line->>'itemId', '')::uuid;
    v_qty := round(coalesce((v_line->>'qty')::numeric, 0), 3);
    if v_item is null or v_qty <= 0 then raise exception 'Each sale line needs an item and quantity.'; end if;

    select qty_on_hand, selling_price, avg_unit_cost, is_active
      into v_on_hand, v_price, v_cost, v_active
    from public.sch_store_items
    where id = v_item and business_unit_id = v_bu
    for update;
    if v_on_hand is null then raise exception 'An item on this sale was not found.'; end if;
    if not v_active then raise exception 'An item on this sale is inactive.'; end if;
    if v_on_hand < v_qty then raise exception 'Not enough stock on hand for one or more items.'; end if;
    if v_price <= 0 then raise exception 'Set a selling price before selling this item.'; end if;

    update public.sch_store_items
      set qty_on_hand = qty_on_hand - v_qty, updated_at = now()
    where id = v_item;

    insert into public.sch_store_sale_lines (
      business_unit_id, sale_id, item_id, quantity, unit_price, line_total, unit_cost, line_cost
    ) values (
      v_bu, v_sale, v_item, v_qty, v_price, round(v_qty * v_price, 2), v_cost, round(v_qty * v_cost, 2)
    );

    insert into public.sch_store_movements (
      business_unit_id, item_id, movement_type, quantity, unit_cost, occurred_on,
      sale_id, request_id, recorded_by, is_active
    ) values (
      v_bu, v_item, 'SALE', v_qty, v_cost, p_sale_date,
      v_sale, gen_random_uuid(), p_actor_id, true
    );

    v_subtotal := v_subtotal + round(v_qty * v_price, 2);
    v_cogs := v_cogs + round(v_qty * v_cost, 2);
  end loop;

  if v_paid > v_subtotal then raise exception 'Paid amount cannot exceed the sale total.'; end if;
  if v_paid > 0 then
    if v_method not in ('CASH', 'MOBILE_MONEY', 'BANK') then raise exception 'Choose a valid payment method.'; end if;
    if v_method <> 'CASH' and char_length(btrim(coalesce(p_reference, ''))) < 2 then
      raise exception 'Enter a payment reference.';
    end if;
  end if;

  v_status := case when v_paid <= 0 then 'outstanding' when v_paid < v_subtotal then 'partial' else 'paid' end;

  insert into public.sch_fee_charges (
    business_unit_id, student_id, enrollment_id, academic_year_id, class_id, level_id,
    annual_amount, is_active, charge_kind, store_sale_id
  ) values (
    v_bu, p_student_id, v_enrollment, v_year, v_class, v_level,
    v_subtotal, true, 'STORE', v_sale
  ) returning id into v_charge;

  if v_paid > 0 then
    v_pay_number := public.sch_next_document_number(v_bu, 'fee_payment', 'PAY');
    insert into public.sch_fee_payments (
      business_unit_id, charge_id, enrollment_id, student_id, payment_number,
      amount, method, payment_date, reference, notes, status, request_id, recorded_by
    ) values (
      v_bu, v_charge, v_enrollment, p_student_id, v_pay_number,
      v_paid, v_method, p_sale_date, btrim(coalesce(p_reference, '')), 'Store sale',
      'posted', gen_random_uuid(), p_actor_id
    ) returning id into v_payment;
  end if;

  if v_cogs > 0 then
    v_cat := public.sch_ensure_expense_category(v_bu, 'STORE_COGS', 'Store cost of sales');
    insert into public.sch_expenses (
      business_unit_id, category_id, expense_number, expense_date, amount, description, reference,
      method, source_type, source_id, request_id, recorded_by, is_active
    ) values (
      v_bu, v_cat, public.sch_next_document_number(v_bu, 'expense', 'EXP'), p_sale_date, v_cogs,
      'Cost of school store sale ' || v_number, v_number, '',
      'STORE_COGS', v_sale, gen_random_uuid(), p_actor_id, true
    ) returning id into v_expense;
  end if;

  update public.sch_store_sales
    set subtotal = v_subtotal,
        paid_amount = v_paid,
        cost_of_goods = v_cogs,
        status = v_status,
        charge_id = v_charge
  where id = v_sale;

  return jsonb_build_object(
    'id', v_sale,
    'sale_number', v_number,
    'charge_id', v_charge,
    'enrollment_id', v_enrollment,
    'subtotal', v_subtotal,
    'paid_amount', v_paid,
    'duplicate', false
  );
end;
$$;

create or replace function public.sch_store_issue(
  p_item_id uuid,
  p_quantity numeric,
  p_occurred_on date,
  p_recipient text,
  p_reason text,
  p_location text,
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
  v_qty numeric;
  v_on_hand numeric;
  v_avg numeric;
  v_durable boolean;
  v_type text;
  v_movement uuid;
  v_cat uuid;
  v_expense uuid;
  v_cost numeric;
begin
  if p_request_id is null then raise exception 'Issue request is invalid.'; end if;
  if p_occurred_on is null then raise exception 'Enter a valid issue date.'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantity must be greater than zero.'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Enter a reason for this issue.'; end if;
  v_qty := round(p_quantity, 3);

  select id into v_existing from public.sch_store_movements where request_id = p_request_id limit 1;
  if v_existing is not null then
    return jsonb_build_object('id', v_existing, 'duplicate', true);
  end if;

  select business_unit_id, qty_on_hand, avg_unit_cost, is_durable
    into v_bu, v_on_hand, v_avg, v_durable
  from public.sch_store_items where id = p_item_id for update;
  if v_bu is null then raise exception 'Item was not found.'; end if;
  if not public.has_business_unit_access(v_bu) then raise exception 'Not authorized for this school.'; end if;
  if v_on_hand < v_qty then raise exception 'Not enough stock on hand.'; end if;

  v_type := case when v_durable then 'CUSTODY' else 'ISSUE' end;
  v_cost := round(v_qty * v_avg, 2);

  if v_durable then
    update public.sch_store_items
      set qty_on_hand = qty_on_hand - v_qty,
          qty_in_custody = qty_in_custody + v_qty,
          updated_at = now()
    where id = p_item_id;
  else
    update public.sch_store_items
      set qty_on_hand = qty_on_hand - v_qty, updated_at = now()
    where id = p_item_id;
    v_cat := public.sch_ensure_expense_category(v_bu, 'STORE_ISSUE', 'School-use supplies');
    insert into public.sch_expenses (
      business_unit_id, category_id, expense_number, expense_date, amount, description, reference,
      method, payee, source_type, source_id, request_id, recorded_by, is_active
    ) values (
      v_bu, v_cat, public.sch_next_document_number(v_bu, 'expense', 'EXP'), p_occurred_on, v_cost,
      btrim(p_reason), '',
      '', btrim(coalesce(p_recipient, '')), 'STORE_ISSUE', p_item_id, gen_random_uuid(), p_actor_id, true
    ) returning id into v_expense;
  end if;

  insert into public.sch_store_movements (
    business_unit_id, item_id, movement_type, quantity, unit_cost, occurred_on,
    notes, recipient, location, expense_id, request_id, recorded_by, is_active
  ) values (
    v_bu, p_item_id, v_type, v_qty, v_avg, p_occurred_on,
    btrim(p_reason), btrim(coalesce(p_recipient, '')), btrim(coalesce(p_location, '')),
    v_expense, p_request_id, p_actor_id, true
  ) returning id into v_movement;

  return jsonb_build_object('id', v_movement, 'expense_id', v_expense, 'duplicate', false);
end;
$$;

create or replace function public.sch_sync_store_sale_payment()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sale uuid;
  v_total numeric;
  v_paid numeric;
begin
  if new.status not in ('pending', 'posted') then
    return new;
  end if;
  select store_sale_id into v_sale
  from public.sch_fee_charges
  where id = new.charge_id
    and charge_kind = 'STORE';
  if v_sale is null then
    return new;
  end if;
  select subtotal into v_total from public.sch_store_sales where id = v_sale;
  select coalesce(sum(amount), 0) into v_paid
  from public.sch_fee_payments
  where charge_id = new.charge_id
    and status in ('pending', 'posted');
  update public.sch_store_sales
    set paid_amount = v_paid,
        status = case when v_paid <= 0 then 'outstanding' when v_paid < v_total then 'partial' else 'paid' end
  where id = v_sale;
  return new;
end;
$$;

drop trigger if exists sch_fee_payments_sync_store_sale on public.sch_fee_payments;
create trigger sch_fee_payments_sync_store_sale
after insert or update of amount, status on public.sch_fee_payments
for each row execute function public.sch_sync_store_sale_payment();

create or replace function public.sch_emergency_fund_credit(
  p_kind text,
  p_amount numeric,
  p_occurred_on date,
  p_reference text,
  p_notes text,
  p_request_id uuid,
  p_actor_id uuid,
  p_business_unit_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_kind text := upper(btrim(coalesce(p_kind, '')));
  v_amount numeric;
  v_existing uuid;
  v_id uuid;
begin
  if p_request_id is null then raise exception 'Fund request is invalid.'; end if;
  if p_occurred_on is null then raise exception 'Enter a valid date.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be greater than zero.'; end if;
  if v_kind not in ('OPENING', 'REPLENISH') then raise exception 'Choose opening balance or replenishment.'; end if;
  if not public.has_business_unit_access(p_business_unit_id) then raise exception 'Not authorized for this school.'; end if;
  v_amount := round(p_amount, 2);

  select id into v_existing
  from public.sch_emergency_fund_entries
  where business_unit_id = p_business_unit_id and request_id = p_request_id
  limit 1;
  if v_existing is not null then
    return jsonb_build_object('id', v_existing, 'duplicate', true);
  end if;

  if v_kind = 'OPENING' and exists (
    select 1 from public.sch_emergency_fund_entries
    where business_unit_id = p_business_unit_id and entry_kind = 'OPENING' and is_active
  ) then
    raise exception 'An opening balance is already recorded for this emergency fund.';
  end if;

  insert into public.sch_emergency_fund_entries (
    business_unit_id, entry_kind, amount, occurred_on, reference, notes, request_id, recorded_by, is_active
  ) values (
    p_business_unit_id, v_kind, v_amount, p_occurred_on,
    btrim(coalesce(p_reference, '')), btrim(coalesce(p_notes, '')),
    p_request_id, p_actor_id, true
  ) returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'balance', public.sch_emergency_fund_balance(p_business_unit_id),
    'duplicate', false
  );
end;
$$;

create or replace function public.sch_record_funded_expense(
  p_category_id uuid,
  p_amount numeric,
  p_expense_date date,
  p_description text,
  p_method text,
  p_payee text,
  p_reference text,
  p_bus_id uuid,
  p_funding_source text,
  p_request_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_source text := upper(btrim(coalesce(p_funding_source, 'OPERATING')));
  v_result jsonb;
  v_bu uuid;
  v_balance numeric;
  v_expense uuid;
  v_number text;
  v_amount numeric;
begin
  if v_source not in ('OPERATING', 'EMERGENCY') then
    raise exception 'Choose a funding source.';
  end if;
  if v_source = 'OPERATING' then
    return public.sch_record_manual_expense(
      p_category_id, p_amount, p_expense_date, p_description, p_method, p_payee, p_reference, p_bus_id, p_request_id, p_actor_id
    );
  end if;

  select business_unit_id into v_bu from public.sch_expense_categories where id = p_category_id;
  if v_bu is null then raise exception 'Select an expense type.'; end if;
  if not public.has_business_unit_access(v_bu) then raise exception 'Not authorized for this school.'; end if;

  select id into v_expense from public.sch_expenses where business_unit_id = v_bu and request_id = p_request_id limit 1;
  if v_expense is not null then
    return jsonb_build_object('id', v_expense, 'duplicate', true);
  end if;

  v_amount := round(p_amount, 2);
  perform pg_advisory_xact_lock(hashtext(v_bu::text || ':emergency-fund')::bigint);
  v_balance := public.sch_emergency_fund_balance(v_bu);
  if v_amount > v_balance then
    raise exception 'Emergency fund balance is not enough for this expense.';
  end if;

  v_result := public.sch_record_manual_expense(
    p_category_id, p_amount, p_expense_date, p_description, p_method, p_payee, p_reference, p_bus_id, p_request_id, p_actor_id
  );
  v_expense := (v_result->>'id')::uuid;
  if coalesce((v_result->>'duplicate')::boolean, false) then
    return v_result;
  end if;

  update public.sch_expenses
    set source_type = 'EMERGENCY'
  where id = v_expense
    and business_unit_id = v_bu
    and is_active;

  insert into public.sch_emergency_fund_entries (
    business_unit_id, entry_kind, amount, occurred_on, reference, notes, expense_id, request_id, recorded_by, is_active
  ) values (
    v_bu, 'SPEND', v_amount, p_expense_date,
    btrim(coalesce(p_reference, '')), btrim(coalesce(p_description, '')),
    v_expense, gen_random_uuid(), p_actor_id, true
  );

  select expense_number into v_number from public.sch_expenses where id = v_expense;
  return jsonb_build_object(
    'id', v_expense,
    'expense_number', v_number,
    'amount', v_amount,
    'duplicate', false,
    'funding_source', 'EMERGENCY',
    'fund_balance', public.sch_emergency_fund_balance(v_bu)
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
  if v_bu is null then raise exception 'Expense was not found.'; end if;
  if not public.has_business_unit_access(v_bu) then raise exception 'Not authorized for this school.'; end if;
  if v_source not in ('MANUAL', 'EMERGENCY') then
    raise exception 'This expense must be reversed from its original workspace.';
  end if;
  if not v_active then
    return jsonb_build_object('id', p_expense_id, 'already_reversed', true);
  end if;

  update public.sch_expenses
    set is_active = false
  where id = p_expense_id
    and business_unit_id = v_bu
    and is_active;

  if v_source = 'EMERGENCY' then
    update public.sch_emergency_fund_entries
      set is_active = false
    where expense_id = p_expense_id
      and business_unit_id = v_bu
      and is_active;
  end if;

  return jsonb_build_object('id', p_expense_id, 'expense_number', v_number, 'already_reversed', false, 'actor_id', p_actor_id);
end;
$$;

revoke all on function public.sch_store_receive(uuid, numeric, numeric, date, text, text, text, uuid, uuid) from public, anon;
grant execute on function public.sch_store_receive(uuid, numeric, numeric, date, text, text, text, uuid, uuid) to authenticated, service_role;
grant execute on function public.sch_store_adjust(uuid, numeric, text, date, uuid, uuid) to authenticated, service_role;
grant execute on function public.sch_store_create_sale(uuid, jsonb, date, numeric, text, text, uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.sch_store_issue(uuid, numeric, date, text, text, text, uuid, uuid) to authenticated, service_role;
grant execute on function public.sch_emergency_fund_credit(text, numeric, date, text, text, uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.sch_record_funded_expense(uuid, numeric, date, text, text, text, text, uuid, text, uuid, uuid) to authenticated, service_role;
grant execute on function public.sch_reverse_manual_expense(uuid, uuid) to authenticated, service_role;
