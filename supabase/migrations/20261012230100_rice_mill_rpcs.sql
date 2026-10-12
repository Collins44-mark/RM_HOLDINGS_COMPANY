-- Atomic posting for rice mill purchases, milling, sales, storage, fees, and expenses.

create or replace function public.rice_item_qty(p_item_id uuid)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum(qty_kg) filter (where is_active), 0)
  from public.rice_stock_movements
  where item_id = p_item_id;
$$;

grant execute on function public.rice_item_qty(uuid) to authenticated, service_role;

create or replace function public.rice_apply_stock(
  p_bu uuid,
  p_item_id uuid,
  p_qty numeric,
  p_source_type text,
  p_source_id uuid,
  p_occurred_on date,
  p_notes text,
  p_request_id uuid,
  p_actor_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_on_hand numeric;
begin
  perform 1 from public.rice_items where id = p_item_id and business_unit_id = p_bu for update;
  if not found then
    raise exception 'Stock item was not found.';
  end if;
  v_on_hand := public.rice_item_qty(p_item_id);
  if v_on_hand + p_qty < 0 then
    raise exception 'Insufficient stock for this operation.';
  end if;
  insert into public.rice_stock_movements (
    business_unit_id, item_id, source_type, source_id, qty_kg, occurred_on, notes, request_id, recorded_by, is_active
  ) values (
    p_bu, p_item_id, p_source_type, p_source_id, p_qty, p_occurred_on, btrim(coalesce(p_notes, '')), p_request_id, p_actor_id, true
  );
end;
$$;

create or replace function public.rice_ensure_party(
  p_bu uuid,
  p_party_id uuid,
  p_kind text,
  p_name text,
  p_phone text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_kind text;
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
begin
  if p_party_id is not null then
    select id, kind into v_id, v_kind
    from public.rice_parties
    where id = p_party_id and business_unit_id = p_bu
    for update;
    if v_id is null then raise exception 'Party was not found.'; end if;
    if v_kind <> p_kind and v_kind <> 'BOTH' then
      update public.rice_parties set kind = 'BOTH', updated_at = now() where id = v_id;
    end if;
    return v_id;
  end if;
  if char_length(v_name) < 2 then raise exception 'Enter a supplier or customer name.'; end if;
  insert into public.rice_parties (
    business_unit_id, party_number, kind, name, phone, is_active
  ) values (
    p_bu,
    public.rice_next_document_number(p_bu, 'PARTY', 'PTY'),
    p_kind,
    v_name,
    v_phone,
    true
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.rice_record_purchase(
  p_item_id uuid,
  p_party_id uuid,
  p_party_name text,
  p_party_phone text,
  p_occurred_on date,
  p_bags numeric,
  p_qty_kg numeric,
  p_unit_price numeric,
  p_amount_paid numeric,
  p_payment_method text,
  p_payment_reference text,
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
  v_kind text;
  v_existing uuid;
  v_party uuid;
  v_qty numeric;
  v_price numeric;
  v_total numeric;
  v_paid numeric;
  v_id uuid;
  v_number text;
begin
  if p_request_id is null then raise exception 'Purchase request is invalid.'; end if;
  if p_occurred_on is null then raise exception 'Enter a purchase date.'; end if;
  v_qty := round(coalesce(p_qty_kg, 0), 3);
  v_price := round(coalesce(p_unit_price, 0), 2);
  v_paid := round(coalesce(p_amount_paid, 0), 2);
  if v_qty <= 0 then raise exception 'Quantity must be greater than zero.'; end if;
  if v_price < 0 then raise exception 'Unit price cannot be negative.'; end if;
  v_total := round(v_qty * v_price, 2);
  if v_paid < 0 or v_paid > v_total then raise exception 'Amount paid must be between zero and the purchase total.'; end if;

  select id into v_existing from public.rice_purchases where request_id = p_request_id limit 1;
  if v_existing is not null then
    return jsonb_build_object('id', v_existing, 'duplicate', true);
  end if;

  select business_unit_id, kind into v_bu, v_kind from public.rice_items where id = p_item_id for update;
  if v_bu is null then raise exception 'Paddy item was not found.'; end if;
  if v_kind <> 'PADDY' then raise exception 'Company purchases must use unprocessed paddy.'; end if;
  if not public.has_business_unit_access(v_bu) then raise exception 'Not authorized for Rice Mill & Warehouse.'; end if;

  v_party := public.rice_ensure_party(v_bu, p_party_id, 'SUPPLIER', p_party_name, p_party_phone);
  v_number := public.rice_next_document_number(v_bu, 'PURCHASE', 'RCP');

  insert into public.rice_purchases (
    business_unit_id, item_id, party_id, purchase_number, occurred_on, bags, qty_kg, unit_price,
    total_amount, amount_paid, payment_method, payment_reference, notes, request_id, recorded_by, is_active
  ) values (
    v_bu, p_item_id, v_party, v_number, p_occurred_on, case when p_bags is null then null else round(p_bags, 3) end,
    v_qty, v_price, v_total, v_paid,
    nullif(upper(btrim(coalesce(p_payment_method, ''))), ''),
    nullif(btrim(coalesce(p_payment_reference, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_request_id, p_actor_id, true
  ) returning id into v_id;

  perform public.rice_apply_stock(v_bu, p_item_id, v_qty, 'PURCHASE', v_id, p_occurred_on, v_number, p_request_id, p_actor_id);

  return jsonb_build_object('id', v_id, 'number', v_number, 'duplicate', false);
end;
$$;

create or replace function public.rice_record_mill_batch(
  p_input_item_id uuid,
  p_produced_on date,
  p_machine text,
  p_shift text,
  p_input_qty_kg numeric,
  p_wastage_kg numeric,
  p_processing_cost numeric,
  p_outputs jsonb,
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
  v_kind text;
  v_existing uuid;
  v_input numeric;
  v_waste numeric;
  v_cost numeric;
  v_id uuid;
  v_number text;
  v_out_item uuid;
  v_out_qty numeric;
  v_out_kind text;
  v_out_bu uuid;
begin
  if p_request_id is null then raise exception 'Milling request is invalid.'; end if;
  if p_produced_on is null then raise exception 'Enter a production date.'; end if;
  v_input := round(coalesce(p_input_qty_kg, 0), 3);
  v_waste := round(coalesce(p_wastage_kg, 0), 3);
  v_cost := round(coalesce(p_processing_cost, 0), 2);
  if v_input <= 0 then raise exception 'Paddy input must be greater than zero.'; end if;
  if v_waste < 0 then raise exception 'Wastage cannot be negative.'; end if;
  if v_cost < 0 then raise exception 'Processing cost cannot be negative.'; end if;
  if p_outputs is null or jsonb_typeof(p_outputs) <> 'array' or jsonb_array_length(p_outputs) < 1 then
    raise exception 'Enter at least one milling output.';
  end if;

  select id into v_existing from public.rice_mill_batches where request_id = p_request_id limit 1;
  if v_existing is not null then
    return jsonb_build_object('id', v_existing, 'duplicate', true);
  end if;

  select business_unit_id, kind into v_bu, v_kind from public.rice_items where id = p_input_item_id for update;
  if v_bu is null then raise exception 'Paddy item was not found.'; end if;
  if v_kind <> 'PADDY' then raise exception 'Milling input must be company-owned paddy.'; end if;
  if not public.has_business_unit_access(v_bu) then raise exception 'Not authorized for Rice Mill & Warehouse.'; end if;

  v_number := public.rice_next_document_number(v_bu, 'BATCH', 'MIL');
  insert into public.rice_mill_batches (
    business_unit_id, input_item_id, batch_number, produced_on, machine, shift, input_qty_kg,
    wastage_kg, processing_cost, notes, request_id, recorded_by, is_active
  ) values (
    v_bu, p_input_item_id, v_number, p_produced_on,
    nullif(btrim(coalesce(p_machine, '')), ''),
    nullif(btrim(coalesce(p_shift, '')), ''),
    v_input, v_waste, v_cost,
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_request_id, p_actor_id, true
  ) returning id into v_id;

  perform public.rice_apply_stock(v_bu, p_input_item_id, -v_input, 'MILL_IN', v_id, p_produced_on, v_number, p_request_id, p_actor_id);

  for v_out_item, v_out_qty in
    select (elem ->> 'item_id')::uuid, round(sum(coalesce((elem ->> 'qty_kg')::numeric, 0)), 3)
    from jsonb_array_elements(p_outputs) as t(elem)
    group by 1
  loop
    if v_out_item is null or v_out_qty is null or v_out_qty <= 0 then
      raise exception 'Each milling output needs an item and a quantity greater than zero.';
    end if;
    select business_unit_id, kind into v_out_bu, v_out_kind from public.rice_items where id = v_out_item;
    if v_out_bu is null or v_out_bu <> v_bu then raise exception 'Output item was not found.'; end if;
    if v_out_kind = 'PADDY' then raise exception 'Milling output cannot be unprocessed paddy.'; end if;
    insert into public.rice_mill_outputs (business_unit_id, batch_id, item_id, qty_kg)
    values (v_bu, v_id, v_out_item, v_out_qty);
    perform public.rice_apply_stock(v_bu, v_out_item, v_out_qty, 'MILL_OUT', v_id, p_produced_on, v_number, p_request_id, p_actor_id);
  end loop;

  if v_cost > 0 then
    insert into public.rice_expenses (
      business_unit_id, expense_number, kind, occurred_on, amount, notes, mill_batch_id, request_id, recorded_by, is_active
    ) values (
      v_bu, public.rice_next_document_number(v_bu, 'EXPENSE', 'EXP'), 'MILLING', p_produced_on, v_cost,
      'Processing cost for ' || v_number, v_id, p_request_id, p_actor_id, true
    );
  end if;

  return jsonb_build_object('id', v_id, 'number', v_number, 'duplicate', false);
end;
$$;

create or replace function public.rice_record_sale(
  p_party_id uuid,
  p_party_name text,
  p_party_phone text,
  p_occurred_on date,
  p_dispatch_on date,
  p_lines jsonb,
  p_amount_paid numeric,
  p_payment_method text,
  p_payment_reference text,
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
  v_party uuid;
  v_id uuid;
  v_number text;
  v_row jsonb;
  v_item uuid;
  v_qty numeric;
  v_price numeric;
  v_line numeric;
  v_total numeric := 0;
  v_paid numeric;
  v_kind text;
  v_item_bu uuid;
  v_dispatch numeric := 0;
begin
  if p_request_id is null then raise exception 'Sale request is invalid.'; end if;
  if p_occurred_on is null then raise exception 'Enter a sale date.'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 1 then
    raise exception 'Add at least one sale line.';
  end if;
  v_paid := round(coalesce(p_amount_paid, 0), 2);

  select id into v_existing from public.rice_sales where request_id = p_request_id limit 1;
  if v_existing is not null then
    return jsonb_build_object('id', v_existing, 'duplicate', true);
  end if;

  for v_row in select value from jsonb_array_elements(p_lines)
  loop
    v_item := nullif(v_row ->> 'item_id', '')::uuid;
    select business_unit_id, kind into v_item_bu, v_kind from public.rice_items where id = v_item;
    if v_item_bu is null then raise exception 'Sale item was not found.'; end if;
    if v_bu is null then
      v_bu := v_item_bu;
      if not public.has_business_unit_access(v_bu) then raise exception 'Not authorized for Rice Mill & Warehouse.'; end if;
    elsif v_item_bu <> v_bu then
      raise exception 'Sale items must belong to Rice Mill & Warehouse.';
    end if;
    if v_kind = 'PADDY' then raise exception 'Company sales must use rice or by-products, not paddy.'; end if;
    v_qty := round(coalesce((v_row ->> 'qty_kg')::numeric, 0), 3);
    v_price := round(coalesce((v_row ->> 'unit_price')::numeric, 0), 2);
    if v_qty <= 0 then raise exception 'Sale quantity must be greater than zero.'; end if;
    if v_price < 0 then raise exception 'Selling price cannot be negative.'; end if;
    v_total := v_total + round(v_qty * v_price, 2);
    v_dispatch := v_dispatch + v_qty;
  end loop;
  v_total := round(v_total, 2);
  if v_paid < 0 or v_paid > v_total then raise exception 'Amount paid must be between zero and the sale total.'; end if;

  v_party := public.rice_ensure_party(v_bu, p_party_id, 'CUSTOMER', p_party_name, p_party_phone);
  v_number := public.rice_next_document_number(v_bu, 'SALE', 'RSL');

  insert into public.rice_sales (
    business_unit_id, party_id, sale_number, occurred_on, dispatch_on, dispatch_qty_kg,
    total_amount, amount_paid, payment_method, payment_reference, notes, request_id, recorded_by, is_active
  ) values (
    v_bu, v_party, v_number, p_occurred_on, p_dispatch_on, v_dispatch, v_total, v_paid,
    nullif(upper(btrim(coalesce(p_payment_method, ''))), ''),
    nullif(btrim(coalesce(p_payment_reference, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_request_id, p_actor_id, true
  ) returning id into v_id;

  for v_row in select value from jsonb_array_elements(p_lines)
  loop
    v_item := (v_row ->> 'item_id')::uuid;
    v_qty := round((v_row ->> 'qty_kg')::numeric, 3);
    v_price := round((v_row ->> 'unit_price')::numeric, 2);
    v_line := round(v_qty * v_price, 2);
    insert into public.rice_sale_lines (business_unit_id, sale_id, item_id, qty_kg, unit_price, line_total)
    values (v_bu, v_id, v_item, v_qty, v_price, v_line);
    perform public.rice_apply_stock(v_bu, v_item, -v_qty, 'SALE', v_id, p_occurred_on, v_number, p_request_id, p_actor_id);
  end loop;

  return jsonb_build_object('id', v_id, 'number', v_number, 'duplicate', false);
end;
$$;

create or replace function public.rice_record_storage_movement(
  p_account_id uuid,
  p_party_id uuid,
  p_party_name text,
  p_party_phone text,
  p_movement_type text,
  p_occurred_on date,
  p_bags numeric,
  p_qty_kg numeric,
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
  v_party uuid;
  v_account uuid;
  v_type text := upper(btrim(coalesce(p_movement_type, '')));
  v_qty numeric;
  v_balance numeric;
  v_id uuid;
  v_number text;
begin
  if p_request_id is null then raise exception 'Storage request is invalid.'; end if;
  if p_occurred_on is null then raise exception 'Enter a date.'; end if;
  if v_type not in ('DEPOSIT','RELEASE') then raise exception 'Storage movement must be a deposit or a release.'; end if;
  v_qty := round(coalesce(p_qty_kg, 0), 3);
  if v_qty <= 0 then raise exception 'Quantity must be greater than zero.'; end if;

  select id into v_existing from public.rice_storage_movements where request_id = p_request_id limit 1;
  if v_existing is not null then
    return jsonb_build_object('id', v_existing, 'duplicate', true);
  end if;

  if p_account_id is not null then
    select business_unit_id, id, party_id into v_bu, v_account, v_party
    from public.rice_storage_accounts
    where id = p_account_id
    for update;
    if v_account is null then raise exception 'Storage account was not found.'; end if;
  else
    select id into v_bu from public.business_units where code = 'rice' limit 1;
    if v_bu is null then raise exception 'Rice Mill business unit was not found.'; end if;
    v_party := public.rice_ensure_party(v_bu, p_party_id, 'CUSTOMER', p_party_name, p_party_phone);
    select id into v_account from public.rice_storage_accounts where business_unit_id = v_bu and party_id = v_party for update;
    if v_account is null then
      v_number := public.rice_next_document_number(v_bu, 'STORAGE', 'STO');
      insert into public.rice_storage_accounts (business_unit_id, party_id, account_number, is_active)
      values (v_bu, v_party, v_number, true)
      returning id into v_account;
    end if;
  end if;

  if not public.has_business_unit_access(v_bu) then raise exception 'Not authorized for Rice Mill & Warehouse.'; end if;

  if v_type = 'RELEASE' then
    select coalesce(sum(case when movement_type = 'DEPOSIT' then qty_kg else -qty_kg end), 0)
      into v_balance
    from public.rice_storage_movements
    where account_id = v_account and is_active;
    if v_balance - v_qty < 0 then raise exception 'Customer storage balance is insufficient for this release.'; end if;
  end if;

  insert into public.rice_storage_movements (
    business_unit_id, account_id, movement_type, occurred_on, bags, qty_kg, reference, notes, request_id, recorded_by, is_active
  ) values (
    v_bu, v_account, v_type, p_occurred_on,
    case when p_bags is null then null else round(p_bags, 3) end,
    v_qty,
    nullif(btrim(coalesce(p_reference, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_request_id, p_actor_id, true
  ) returning id into v_id;

  return jsonb_build_object('id', v_id, 'account_id', v_account, 'duplicate', false);
end;
$$;

create or replace function public.rice_record_service_income(
  p_account_id uuid,
  p_party_id uuid,
  p_kind text,
  p_occurred_on date,
  p_amount numeric,
  p_payment_method text,
  p_payment_reference text,
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
  v_account uuid;
  v_party uuid;
  v_kind text := upper(btrim(coalesce(p_kind, '')));
  v_amount numeric;
  v_id uuid;
  v_number text;
begin
  if p_request_id is null then raise exception 'Service request is invalid.'; end if;
  if p_occurred_on is null then raise exception 'Enter a date.'; end if;
  if v_kind not in ('STORAGE','MILLING','GRADING','HANDLING') then raise exception 'Service type is invalid.'; end if;
  v_amount := round(coalesce(p_amount, 0), 2);
  if v_amount <= 0 then raise exception 'Service amount must be greater than zero.'; end if;

  select id into v_existing from public.rice_service_income where request_id = p_request_id limit 1;
  if v_existing is not null then
    return jsonb_build_object('id', v_existing, 'duplicate', true);
  end if;

  if p_account_id is not null then
    select business_unit_id, id, party_id into v_bu, v_account, v_party
    from public.rice_storage_accounts where id = p_account_id;
    if v_account is null then raise exception 'Storage account was not found.'; end if;
  else
    select id into v_bu from public.business_units where code = 'rice' limit 1;
    v_party := p_party_id;
  end if;
  if v_bu is null then raise exception 'Rice Mill business unit was not found.'; end if;
  if not public.has_business_unit_access(v_bu) then raise exception 'Not authorized for Rice Mill & Warehouse.'; end if;
  if v_party is null and p_party_id is not null then v_party := p_party_id; end if;

  v_number := public.rice_next_document_number(v_bu, 'SERVICE', 'SRV');
  insert into public.rice_service_income (
    business_unit_id, account_id, party_id, income_number, kind, occurred_on, amount,
    payment_method, payment_reference, notes, request_id, recorded_by, is_active
  ) values (
    v_bu, v_account, v_party, v_number, v_kind, p_occurred_on, v_amount,
    nullif(upper(btrim(coalesce(p_payment_method, ''))), ''),
    nullif(btrim(coalesce(p_payment_reference, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_request_id, p_actor_id, true
  ) returning id into v_id;

  return jsonb_build_object('id', v_id, 'number', v_number, 'duplicate', false);
end;
$$;

create or replace function public.rice_record_expense(
  p_kind text,
  p_occurred_on date,
  p_amount numeric,
  p_payment_method text,
  p_payment_reference text,
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
  v_kind text := upper(btrim(coalesce(p_kind, '')));
  v_amount numeric;
  v_id uuid;
  v_number text;
begin
  if p_request_id is null then raise exception 'Expense request is invalid.'; end if;
  if p_occurred_on is null then raise exception 'Enter a date.'; end if;
  if v_kind not in ('MILLING','OPERATING','UTILITIES','LABOUR','OTHER') then raise exception 'Expense type is invalid.'; end if;
  v_amount := round(coalesce(p_amount, 0), 2);
  if v_amount <= 0 then raise exception 'Expense amount must be greater than zero.'; end if;

  select id into v_existing from public.rice_expenses where request_id = p_request_id limit 1;
  if v_existing is not null then
    return jsonb_build_object('id', v_existing, 'duplicate', true);
  end if;

  select id into v_bu from public.business_units where code = 'rice' limit 1;
  if v_bu is null then raise exception 'Rice Mill business unit was not found.'; end if;
  if not public.has_business_unit_access(v_bu) then raise exception 'Not authorized for Rice Mill & Warehouse.'; end if;

  v_number := public.rice_next_document_number(v_bu, 'EXPENSE', 'EXP');
  insert into public.rice_expenses (
    business_unit_id, expense_number, kind, occurred_on, amount, payment_method, payment_reference, notes, request_id, recorded_by, is_active
  ) values (
    v_bu, v_number, v_kind, p_occurred_on, v_amount,
    nullif(upper(btrim(coalesce(p_payment_method, ''))), ''),
    nullif(btrim(coalesce(p_payment_reference, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_request_id, p_actor_id, true
  ) returning id into v_id;

  return jsonb_build_object('id', v_id, 'number', v_number, 'duplicate', false);
end;
$$;

create or replace function public.rice_adjust_stock(
  p_item_id uuid,
  p_qty_kg numeric,
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
  v_qty numeric;
begin
  if p_request_id is null then raise exception 'Adjustment request is invalid.'; end if;
  if p_occurred_on is null then raise exception 'Enter a date.'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Enter a reason for this adjustment.'; end if;
  v_qty := round(coalesce(p_qty_kg, 0), 3);
  if v_qty = 0 then raise exception 'Adjustment quantity cannot be zero.'; end if;

  select id into v_existing from public.rice_stock_movements where request_id = p_request_id limit 1;
  if v_existing is not null then
    return jsonb_build_object('id', v_existing, 'duplicate', true);
  end if;

  select business_unit_id into v_bu from public.rice_items where id = p_item_id;
  if v_bu is null then raise exception 'Item was not found.'; end if;
  if not public.has_business_unit_access(v_bu) then raise exception 'Not authorized for Rice Mill & Warehouse.'; end if;

  perform public.rice_apply_stock(v_bu, p_item_id, v_qty, 'ADJUST', p_request_id, p_occurred_on, btrim(p_reason), p_request_id, p_actor_id);
  select id into v_existing from public.rice_stock_movements where request_id = p_request_id limit 1;
  return jsonb_build_object('id', v_existing, 'duplicate', false);
end;
$$;

create or replace function public.rice_record_purchase_payment(
  p_purchase_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_payment_reference text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_bu uuid;
  v_total numeric;
  v_paid numeric;
  v_amount numeric;
begin
  v_amount := round(coalesce(p_amount, 0), 2);
  if v_amount <= 0 then raise exception 'Payment amount must be greater than zero.'; end if;
  select business_unit_id, total_amount, amount_paid into v_bu, v_total, v_paid
  from public.rice_purchases where id = p_purchase_id and is_active for update;
  if v_bu is null then raise exception 'Purchase was not found.'; end if;
  if not public.has_business_unit_access(v_bu) then raise exception 'Not authorized for Rice Mill & Warehouse.'; end if;
  if v_paid + v_amount > v_total then raise exception 'Payment exceeds the remaining payable.'; end if;
  update public.rice_purchases
    set amount_paid = amount_paid + v_amount,
        payment_method = coalesce(nullif(upper(btrim(coalesce(p_payment_method, ''))), ''), payment_method),
        payment_reference = coalesce(nullif(btrim(coalesce(p_payment_reference, '')), ''), payment_reference),
        updated_at = now()
  where id = p_purchase_id;
  return jsonb_build_object('id', p_purchase_id, 'duplicate', false);
end;
$$;

create or replace function public.rice_record_sale_payment(
  p_sale_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_payment_reference text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_bu uuid;
  v_total numeric;
  v_paid numeric;
  v_amount numeric;
begin
  v_amount := round(coalesce(p_amount, 0), 2);
  if v_amount <= 0 then raise exception 'Payment amount must be greater than zero.'; end if;
  select business_unit_id, total_amount, amount_paid into v_bu, v_total, v_paid
  from public.rice_sales where id = p_sale_id and is_active for update;
  if v_bu is null then raise exception 'Sale was not found.'; end if;
  if not public.has_business_unit_access(v_bu) then raise exception 'Not authorized for Rice Mill & Warehouse.'; end if;
  if v_paid + v_amount > v_total then raise exception 'Payment exceeds the remaining receivable.'; end if;
  update public.rice_sales
    set amount_paid = amount_paid + v_amount,
        payment_method = coalesce(nullif(upper(btrim(coalesce(p_payment_method, ''))), ''), payment_method),
        payment_reference = coalesce(nullif(btrim(coalesce(p_payment_reference, '')), ''), payment_reference),
        updated_at = now()
  where id = p_sale_id;
  return jsonb_build_object('id', p_sale_id, 'duplicate', false);
end;
$$;

grant execute on function public.rice_apply_stock(uuid, uuid, numeric, text, uuid, date, text, uuid, uuid) to authenticated, service_role;
grant execute on function public.rice_ensure_party(uuid, uuid, text, text, text) to authenticated, service_role;
grant execute on function public.rice_record_purchase(uuid, uuid, text, text, date, numeric, numeric, numeric, numeric, text, text, text, uuid, uuid) to authenticated, service_role;
grant execute on function public.rice_record_mill_batch(uuid, date, text, text, numeric, numeric, numeric, jsonb, text, uuid, uuid) to authenticated, service_role;
grant execute on function public.rice_record_sale(uuid, text, text, date, date, jsonb, numeric, text, text, text, uuid, uuid) to authenticated, service_role;
grant execute on function public.rice_record_storage_movement(uuid, uuid, text, text, text, date, numeric, numeric, text, text, uuid, uuid) to authenticated, service_role;
grant execute on function public.rice_record_service_income(uuid, uuid, text, date, numeric, text, text, text, uuid, uuid) to authenticated, service_role;
grant execute on function public.rice_record_expense(text, date, numeric, text, text, text, uuid, uuid) to authenticated, service_role;
grant execute on function public.rice_adjust_stock(uuid, numeric, text, date, uuid, uuid) to authenticated, service_role;
grant execute on function public.rice_record_purchase_payment(uuid, numeric, text, text) to authenticated, service_role;
grant execute on function public.rice_record_sale_payment(uuid, numeric, text, text) to authenticated, service_role;
