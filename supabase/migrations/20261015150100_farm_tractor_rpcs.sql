-- Atomic Farm & Tractor posting. Idempotent on request_id.

create or replace function public.farm_bu()
returns uuid
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.business_units where code = 'farm' limit 1;
  if v_id is null then raise exception 'Farm business unit was not found.'; end if;
  if not public.has_business_unit_access(v_id) then
    raise exception 'Not authorized for Farm & Tractor Services.';
  end if;
  return v_id;
end;
$$;

grant execute on function public.farm_bu() to authenticated, service_role;

create or replace function public.farm_apply_hours(p_tractor_id uuid, p_hours numeric)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_current numeric;
begin
  if p_hours is null then return; end if;
  if p_hours < 0 then raise exception 'Engine hours cannot be negative.'; end if;
  select hour_meter into v_current from public.farm_tractors where id = p_tractor_id for update;
  if v_current is null then raise exception 'Tractor was not found.'; end if;
  if p_hours < v_current then raise exception 'Engine hours cannot decrease.'; end if;
  update public.farm_tractors set hour_meter = p_hours, updated_at = now() where id = p_tractor_id;
end;
$$;

create or replace function public.farm_ensure_party(
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
    from public.farm_parties
    where id = p_party_id and business_unit_id = p_bu
    for update;
    if v_id is null then raise exception 'Customer or supplier was not found.'; end if;
    if v_kind <> p_kind and v_kind <> 'BOTH' then
      update public.farm_parties set kind = 'BOTH', updated_at = now() where id = v_id;
    end if;
    return v_id;
  end if;
  if char_length(v_name) < 2 then raise exception 'Enter a customer or supplier name.'; end if;
  insert into public.farm_parties (business_unit_id, party_number, kind, name, phone, is_active)
  values (p_bu, public.farm_next_document_number(p_bu, 'PARTY', 'FPR'), p_kind, v_name, v_phone, true)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.farm_ensure_party(uuid, uuid, text, text, text) to authenticated, service_role;

create or replace function public.farm_post_expense(
  p_bu uuid,
  p_kind text,
  p_occurred_on date,
  p_amount numeric,
  p_payment_method text,
  p_payment_reference text,
  p_notes text,
  p_source_type text,
  p_source_id uuid,
  p_request_id uuid,
  p_actor_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_amount numeric := round(coalesce(p_amount, 0), 2);
begin
  if v_amount <= 0 then return null; end if;
  select id into v_id from public.farm_expenses where request_id = p_request_id limit 1;
  if v_id is not null then return v_id; end if;
  insert into public.farm_expenses (
    business_unit_id, expense_number, kind, occurred_on, amount, payment_method, payment_reference,
    notes, source_type, source_id, request_id, recorded_by, is_active
  ) values (
    p_bu,
    public.farm_next_document_number(p_bu, 'EXPENSE', 'FEX'),
    p_kind,
    p_occurred_on,
    v_amount,
    nullif(upper(btrim(coalesce(p_payment_method, ''))), ''),
    nullif(btrim(coalesce(p_payment_reference, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_source_type,
    p_source_id,
    p_request_id,
    p_actor_id,
    true
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.farm_save_tractor(
  p_id uuid,
  p_code text,
  p_name text,
  p_registration_number text,
  p_manufacturer text,
  p_model text,
  p_acquired_on date,
  p_acquisition_cost numeric,
  p_status text,
  p_hour_meter numeric,
  p_notes text,
  p_is_active boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_bu uuid := public.farm_bu();
  v_id uuid := p_id;
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_status text := upper(btrim(coalesce(p_status, 'AVAILABLE')));
  v_hours numeric := round(coalesce(p_hour_meter, 0), 1);
  v_current numeric;
begin
  if char_length(v_code) < 1 then raise exception 'Enter a tractor identifier.'; end if;
  if char_length(v_name) < 2 then raise exception 'Enter a tractor name.'; end if;
  if v_status not in ('AVAILABLE','IN_USE','UNDER_SERVICE','INACTIVE') then
    raise exception 'Tractor status is invalid.';
  end if;
  if v_hours < 0 then raise exception 'Engine hours cannot be negative.'; end if;

  if v_id is not null then
    select hour_meter into v_current from public.farm_tractors where id = v_id and business_unit_id = v_bu for update;
    if v_current is null then raise exception 'Tractor was not found.'; end if;
    if v_hours < v_current then raise exception 'Engine hours cannot decrease.'; end if;
    update public.farm_tractors set
      code = v_code,
      name = v_name,
      registration_number = nullif(btrim(coalesce(p_registration_number, '')), ''),
      manufacturer = nullif(btrim(coalesce(p_manufacturer, '')), ''),
      model = nullif(btrim(coalesce(p_model, '')), ''),
      acquired_on = p_acquired_on,
      acquisition_cost = case when p_acquisition_cost is null then null else round(p_acquisition_cost, 2) end,
      status = v_status,
      hour_meter = v_hours,
      notes = nullif(btrim(coalesce(p_notes, '')), ''),
      is_active = coalesce(p_is_active, true),
      updated_at = now()
    where id = v_id;
  else
    -- Atomic sequential code generation
    IF p_code IS NULL OR trim(btrim(p_code)) = '' THEN
      SELECT last_code INTO v_code FROM public.tractor_sequence WHERE id = 1 FOR UPDATE;
      SELECT CASE WHEN v_code ~ '^TRC-([0-9]+)$' THEN 'TRC-' || LPAD(((substring(v_code from '^TRC-([0-9]+)$'))::int + 1)::text, 3, '0') ELSE 'TRC-001' END INTO v_code FROM public.tractor_sequence WHERE id = 1;
      UPDATE public.tractor_sequence SET last_code = v_code, updated_at = now() WHERE id = 1;
    ELSE
      v_code := upper(btrim(coalesce(p_code, '')));
    END IF;
    insert into public.farm_tractors (
      business_unit_id, code, name, registration_number, manufacturer, model, acquired_on,
      acquisition_cost, status, hour_meter, notes, is_active
    ) values (
      v_bu, v_code, v_name,
      nullif(btrim(coalesce(p_registration_number, '')), ''),
      nullif(btrim(coalesce(p_manufacturer, '')), ''),
      nullif(btrim(coalesce(p_model, '')), ''),
      p_acquired_on,
      case when p_acquisition_cost is null then null else round(p_acquisition_cost, 2) end,
      v_status, v_hours, nullif(btrim(coalesce(p_notes, '')), ''), coalesce(p_is_active, true)
    )
    returning id into v_id;
  end if;
  return jsonb_build_object('id', v_id, 'code', v_code);
end;
$$;

grant execute on function public.farm_save_tractor(uuid, text, text, text, text, text, date, numeric, text, numeric, text, boolean) to authenticated, service_role;

create or replace function public.farm_record_job(
  p_party_id uuid,
  p_party_name text,
  p_party_phone text,
  p_service_type_id uuid,
  p_tractor_id uuid,
  p_operator_id uuid,
  p_location text,
  p_area_ha numeric,
  p_occurred_on date,
  p_agreed_price numeric,
  p_amount_paid numeric,
  p_payment_method text,
  p_status text,
  p_hour_meter numeric,
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
  v_bu uuid := public.farm_bu();
  v_existing uuid;
  v_party uuid;
  v_id uuid;
  v_number text;
  v_status text := upper(btrim(coalesce(p_status, 'PENDING')));
  v_price numeric := round(coalesce(p_agreed_price, 0), 2);
  v_paid numeric := round(coalesce(p_amount_paid, 0), 2);
begin
  if p_request_id is null then raise exception 'Job request is invalid.'; end if;
  if p_occurred_on is null then raise exception 'Enter a job date.'; end if;
  if v_status not in ('PENDING','IN_PROGRESS','COMPLETED','CANCELLED') then raise exception 'Job status is invalid.'; end if;
  if v_price < 0 then raise exception 'Agreed price cannot be negative.'; end if;
  if v_paid < 0 or v_paid > v_price then raise exception 'Amount paid must be between zero and the agreed price.'; end if;

  select id into v_existing from public.farm_jobs where request_id = p_request_id limit 1;
  if v_existing is not null then
    return jsonb_build_object('id', v_existing, 'duplicate', true);
  end if;

  perform 1 from public.farm_service_types where id = p_service_type_id and business_unit_id = v_bu and is_active;
  if not found then raise exception 'Service type was not found.'; end if;

  if p_tractor_id is not null then
    perform 1 from public.farm_tractors where id = p_tractor_id and business_unit_id = v_bu;
    if not found then raise exception 'Tractor was not found.'; end if;
  end if;

  v_party := public.farm_ensure_party(v_bu, p_party_id, 'CUSTOMER', p_party_name, p_party_phone);
  v_number := public.farm_next_document_number(v_bu, 'JOB', 'FJB');

  insert into public.farm_jobs (
    business_unit_id, job_number, party_id, service_type_id, tractor_id, operator_id, location, area_ha,
    occurred_on, completed_on, agreed_price, amount_paid, status, hour_meter, notes, request_id, recorded_by, is_active
  ) values (
    v_bu, v_number, v_party, p_service_type_id, p_tractor_id, p_operator_id,
    nullif(btrim(coalesce(p_location, '')), ''),
    case when p_area_ha is null then null else round(p_area_ha, 3) end,
    p_occurred_on,
    case when v_status = 'COMPLETED' then p_occurred_on else null end,
    v_price, v_paid, v_status, p_hour_meter,
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_request_id, p_actor_id, true
  )
  returning id into v_id;

  if v_paid > 0 then
    insert into public.farm_job_payments (
      business_unit_id, job_id, occurred_on, amount, payment_method, request_id, recorded_by, is_active
    ) values (
      v_bu, v_id, p_occurred_on, v_paid, nullif(upper(btrim(coalesce(p_payment_method, ''))), ''), p_request_id, p_actor_id, true
    );
  end if;

  if p_tractor_id is not null then
    perform public.farm_apply_hours(p_tractor_id, p_hour_meter);
    if v_status = 'IN_PROGRESS' then
      update public.farm_tractors set status = 'IN_USE', updated_at = now()
      where id = p_tractor_id and status = 'AVAILABLE';
    elsif v_status = 'COMPLETED' then
      update public.farm_tractors set status = 'AVAILABLE', updated_at = now()
      where id = p_tractor_id and status = 'IN_USE';
    end if;
  end if;

  return jsonb_build_object('id', v_id, 'number', v_number, 'duplicate', false);
end;
$$;

grant execute on function public.farm_record_job(uuid, text, text, uuid, uuid, uuid, text, numeric, date, numeric, numeric, text, text, numeric, text, uuid, uuid) to authenticated, service_role;

create or replace function public.farm_record_job_payment(
  p_job_id uuid,
  p_amount numeric,
  p_occurred_on date,
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
  v_bu uuid := public.farm_bu();
  v_existing uuid;
  v_price numeric;
  v_paid numeric;
  v_amount numeric := round(coalesce(p_amount, 0), 2);
  v_id uuid;
begin
  if p_request_id is null then raise exception 'Payment request is invalid.'; end if;
  if v_amount <= 0 then raise exception 'Payment amount must be greater than zero.'; end if;
  select id into v_existing from public.farm_job_payments where request_id = p_request_id limit 1;
  if v_existing is not null then
    return jsonb_build_object('id', v_existing, 'duplicate', true);
  end if;

  select agreed_price, amount_paid into v_price, v_paid
  from public.farm_jobs
  where id = p_job_id and business_unit_id = v_bu and is_active
  for update;
  if v_price is null then raise exception 'Job was not found.'; end if;
  if v_paid + v_amount > v_price then raise exception 'Payment cannot exceed the outstanding balance.'; end if;

  insert into public.farm_job_payments (
    business_unit_id, job_id, occurred_on, amount, payment_method, payment_reference, request_id, recorded_by, is_active
  ) values (
    v_bu, p_job_id, coalesce(p_occurred_on, current_date), v_amount,
    nullif(upper(btrim(coalesce(p_payment_method, ''))), ''),
    nullif(btrim(coalesce(p_payment_reference, '')), ''),
    p_request_id, p_actor_id, true
  )
  returning id into v_id;

  update public.farm_jobs set amount_paid = v_paid + v_amount, updated_at = now() where id = p_job_id;
  return jsonb_build_object('id', v_id, 'duplicate', false);
end;
$$;

grant execute on function public.farm_record_job_payment(uuid, numeric, date, text, text, uuid, uuid) to authenticated, service_role;

create or replace function public.farm_record_fuel(
  p_tractor_id uuid,
  p_supplier_id uuid,
  p_supplier_name text,
  p_occurred_on date,
  p_litres numeric,
  p_unit_price numeric,
  p_hour_meter numeric,
  p_station_name text,
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
  v_bu uuid := public.farm_bu();
  v_existing uuid;
  v_id uuid;
  v_number text;
  v_litres numeric := round(coalesce(p_litres, 0), 3);
  v_price numeric := round(coalesce(p_unit_price, 0), 2);
  v_total numeric;
  v_supplier uuid;
begin
  if p_request_id is null then raise exception 'Fuel request is invalid.'; end if;
  if p_occurred_on is null then raise exception 'Enter a fuel date.'; end if;
  if v_litres <= 0 then raise exception 'Fuel quantity must be greater than zero.'; end if;
  if v_price < 0 then raise exception 'Unit price cannot be negative.'; end if;
  v_total := round(v_litres * v_price, 2);

  select id into v_existing from public.farm_fuel where request_id = p_request_id limit 1;
  if v_existing is not null then
    return jsonb_build_object('id', v_existing, 'duplicate', true);
  end if;

  perform 1 from public.farm_tractors where id = p_tractor_id and business_unit_id = v_bu for update;
  if not found then raise exception 'Tractor was not found.'; end if;

  if p_supplier_id is not null or btrim(coalesce(p_supplier_name, '')) <> '' then
    v_supplier := public.farm_ensure_party(v_bu, p_supplier_id, 'SUPPLIER', p_supplier_name, null);
  end if;

  v_number := public.farm_next_document_number(v_bu, 'FUEL', 'FFL');
  insert into public.farm_fuel (
    business_unit_id, fuel_number, tractor_id, supplier_id, occurred_on, litres, unit_price, total_cost,
    hour_meter, station_name, payment_method, payment_reference, notes, request_id, recorded_by, is_active
  ) values (
    v_bu, v_number, p_tractor_id, v_supplier, p_occurred_on, v_litres, v_price, v_total, p_hour_meter,
    nullif(btrim(coalesce(p_station_name, '')), ''),
    nullif(upper(btrim(coalesce(p_payment_method, ''))), ''),
    nullif(btrim(coalesce(p_payment_reference, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_request_id, p_actor_id, true
  )
  returning id into v_id;

  perform public.farm_apply_hours(p_tractor_id, p_hour_meter);
  perform public.farm_post_expense(
    v_bu, 'FUEL', p_occurred_on, v_total, p_payment_method, p_payment_reference,
    coalesce(nullif(btrim(coalesce(p_notes, '')), ''), v_number),
    'FUEL', v_id, p_request_id, p_actor_id
  );

  return jsonb_build_object('id', v_id, 'number', v_number, 'duplicate', false);
end;
$$;

grant execute on function public.farm_record_fuel(uuid, uuid, text, date, numeric, numeric, numeric, text, text, text, text, uuid, uuid) to authenticated, service_role;

create or replace function public.farm_record_maintenance(
  p_tractor_id uuid,
  p_supplier_id uuid,
  p_supplier_name text,
  p_occurred_on date,
  p_category text,
  p_description text,
  p_parts_cost numeric,
  p_labour_cost numeric,
  p_hour_meter numeric,
  p_next_service_on date,
  p_next_service_hours numeric,
  p_mark_under_service boolean,
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
  v_bu uuid := public.farm_bu();
  v_existing uuid;
  v_id uuid;
  v_number text;
  v_cat text := upper(btrim(coalesce(p_category, 'SERVICE')));
  v_parts numeric := round(coalesce(p_parts_cost, 0), 2);
  v_labour numeric := round(coalesce(p_labour_cost, 0), 2);
  v_total numeric;
  v_supplier uuid;
begin
  if p_request_id is null then raise exception 'Maintenance request is invalid.'; end if;
  if p_occurred_on is null then raise exception 'Enter a maintenance date.'; end if;
  if v_cat not in ('SERVICE','PARTS','REPAIR','OTHER') then raise exception 'Maintenance category is invalid.'; end if;
  if char_length(btrim(coalesce(p_description, ''))) < 2 then raise exception 'Enter a maintenance description.'; end if;
  if v_parts < 0 or v_labour < 0 then raise exception 'Costs cannot be negative.'; end if;
  v_total := round(v_parts + v_labour, 2);
  if v_total <= 0 then raise exception 'Maintenance cost must be greater than zero.'; end if;

  select id into v_existing from public.farm_maintenance where request_id = p_request_id limit 1;
  if v_existing is not null then
    return jsonb_build_object('id', v_existing, 'duplicate', true);
  end if;

  perform 1 from public.farm_tractors where id = p_tractor_id and business_unit_id = v_bu for update;
  if not found then raise exception 'Tractor was not found.'; end if;

  if p_supplier_id is not null or btrim(coalesce(p_supplier_name, '')) <> '' then
    v_supplier := public.farm_ensure_party(v_bu, p_supplier_id, 'SUPPLIER', p_supplier_name, null);
  end if;

  v_number := public.farm_next_document_number(v_bu, 'MAINT', 'FMT');
  insert into public.farm_maintenance (
    business_unit_id, maintenance_number, tractor_id, supplier_id, occurred_on, category, description,
    parts_cost, labour_cost, total_cost, hour_meter, next_service_on, next_service_hours,
    payment_method, payment_reference, notes, request_id, recorded_by, is_active
  ) values (
    v_bu, v_number, p_tractor_id, v_supplier, p_occurred_on, v_cat, btrim(p_description),
    v_parts, v_labour, v_total, p_hour_meter, p_next_service_on, p_next_service_hours,
    nullif(upper(btrim(coalesce(p_payment_method, ''))), ''),
    nullif(btrim(coalesce(p_payment_reference, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_request_id, p_actor_id, true
  )
  returning id into v_id;

  perform public.farm_apply_hours(p_tractor_id, p_hour_meter);
  if coalesce(p_mark_under_service, false) then
    update public.farm_tractors set status = 'UNDER_SERVICE', updated_at = now() where id = p_tractor_id;
  end if;
  perform public.farm_post_expense(
    v_bu, 'MAINTENANCE', p_occurred_on, v_total, p_payment_method, p_payment_reference,
    btrim(p_description), 'MAINTENANCE', v_id, p_request_id, p_actor_id
  );

  return jsonb_build_object('id', v_id, 'number', v_number, 'duplicate', false);
end;
$$;

grant execute on function public.farm_record_maintenance(uuid, uuid, text, date, text, text, numeric, numeric, numeric, date, numeric, boolean, text, text, text, uuid, uuid) to authenticated, service_role;

create or replace function public.farm_record_operation(
  p_plot_id uuid,
  p_season_id uuid,
  p_tractor_id uuid,
  p_activity text,
  p_occurred_on date,
  p_area_ha numeric,
  p_cost numeric,
  p_payment_method text,
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
  v_bu uuid := public.farm_bu();
  v_existing uuid;
  v_id uuid;
  v_number text;
  v_cost numeric := round(coalesce(p_cost, 0), 2);
begin
  if p_request_id is null then raise exception 'Operation request is invalid.'; end if;
  if p_occurred_on is null then raise exception 'Enter an operation date.'; end if;
  if char_length(btrim(coalesce(p_activity, ''))) < 2 then raise exception 'Enter an activity.'; end if;
  if v_cost < 0 then raise exception 'Operating cost cannot be negative.'; end if;

  select id into v_existing from public.farm_operations where request_id = p_request_id limit 1;
  if v_existing is not null then
    return jsonb_build_object('id', v_existing, 'duplicate', true);
  end if;

  v_number := public.farm_next_document_number(v_bu, 'OP', 'FOP');
  insert into public.farm_operations (
    business_unit_id, operation_number, plot_id, season_id, tractor_id, activity, occurred_on, area_ha, cost,
    notes, request_id, recorded_by, is_active
  ) values (
    v_bu, v_number, p_plot_id, p_season_id, p_tractor_id, btrim(p_activity), p_occurred_on,
    case when p_area_ha is null then null else round(p_area_ha, 3) end,
    v_cost, nullif(btrim(coalesce(p_notes, '')), ''), p_request_id, p_actor_id, true
  )
  returning id into v_id;

  if v_cost > 0 then
    perform public.farm_post_expense(
      v_bu, 'OPERATING', p_occurred_on, v_cost, p_payment_method, null,
      btrim(p_activity), 'OPERATION', v_id, p_request_id, p_actor_id
    );
  end if;

  return jsonb_build_object('id', v_id, 'number', v_number, 'duplicate', false);
end;
$$;

grant execute on function public.farm_record_operation(uuid, uuid, uuid, text, date, numeric, numeric, text, text, uuid, uuid) to authenticated, service_role;

create or replace function public.farm_record_expense(
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
  v_bu uuid := public.farm_bu();
  v_existing uuid;
  v_id uuid;
  v_kind text := upper(btrim(coalesce(p_kind, 'OPERATING')));
begin
  if p_request_id is null then raise exception 'Expense request is invalid.'; end if;
  select id into v_existing from public.farm_expenses where request_id = p_request_id limit 1;
  if v_existing is not null then
    return jsonb_build_object('id', v_existing, 'duplicate', true);
  end if;
  if v_kind not in ('FUEL','MAINTENANCE','LABOUR','OPERATING','OTHER') then
    raise exception 'Expense type is invalid.';
  end if;
  v_id := public.farm_post_expense(
    v_bu, v_kind, p_occurred_on, p_amount, p_payment_method, p_payment_reference, p_notes,
    'MANUAL', null, p_request_id, p_actor_id
  );
  return jsonb_build_object('id', v_id, 'duplicate', false);
end;
$$;

grant execute on function public.farm_record_expense(text, date, numeric, text, text, text, uuid, uuid) to authenticated, service_role;

create or replace function public.farm_save_party(
  p_id uuid,
  p_kind text,
  p_name text,
  p_phone text,
  p_notes text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_bu uuid := public.farm_bu();
  v_id uuid := p_id;
  v_kind text := upper(btrim(coalesce(p_kind, 'CUSTOMER')));
  v_name text := btrim(coalesce(p_name, ''));
begin
  if v_kind not in ('CUSTOMER','SUPPLIER','BOTH') then raise exception 'Party type is invalid.'; end if;
  if char_length(v_name) < 2 then raise exception 'Enter a name.'; end if;
  if v_id is not null then
    update public.farm_parties set
      kind = v_kind,
      name = v_name,
      phone = nullif(btrim(coalesce(p_phone, '')), ''),
      notes = nullif(btrim(coalesce(p_notes, '')), ''),
      updated_at = now()
    where id = v_id and business_unit_id = v_bu;
    if not found then raise exception 'Record was not found.'; end if;
  else
    insert into public.farm_parties (business_unit_id, party_number, kind, name, phone, notes, is_active)
    values (
      v_bu, public.farm_next_document_number(v_bu, 'PARTY', 'FPR'), v_kind, v_name,
      nullif(btrim(coalesce(p_phone, '')), ''), nullif(btrim(coalesce(p_notes, '')), ''), true
    )
    returning id into v_id;
  end if;
  return jsonb_build_object('id', v_id);
end;
$$;

grant execute on function public.farm_save_party(uuid, text, text, text, text) to authenticated, service_role;

create or replace function public.farm_save_staff(
  p_id uuid,
  p_name text,
  p_phone text,
  p_role text,
  p_notes text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_bu uuid := public.farm_bu();
  v_id uuid := p_id;
  v_name text := btrim(coalesce(p_name, ''));
  v_role text := upper(btrim(coalesce(p_role, 'OPERATOR')));
begin
  if char_length(v_name) < 2 then raise exception 'Enter a staff name.'; end if;
  if v_role not in ('OPERATOR','MECHANIC','OTHER') then raise exception 'Staff role is invalid.'; end if;
  if v_id is not null then
    update public.farm_staff set
      name = v_name,
      phone = nullif(btrim(coalesce(p_phone, '')), ''),
      role = v_role,
      notes = nullif(btrim(coalesce(p_notes, '')), ''),
      updated_at = now()
    where id = v_id and business_unit_id = v_bu;
    if not found then raise exception 'Staff record was not found.'; end if;
  else
    insert into public.farm_staff (business_unit_id, staff_number, name, phone, role, notes, is_active)
    values (
      v_bu, public.farm_next_document_number(v_bu, 'STAFF', 'FST'), v_name,
      nullif(btrim(coalesce(p_phone, '')), ''), v_role, nullif(btrim(coalesce(p_notes, '')), ''), true
    )
    returning id into v_id;
  end if;
  return jsonb_build_object('id', v_id);
end;
$$;

grant execute on function public.farm_save_staff(uuid, text, text, text, text) to authenticated, service_role;

create or replace function public.farm_save_plot(
  p_id uuid,
  p_name text,
  p_hectares numeric,
  p_crop text,
  p_notes text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_bu uuid := public.farm_bu();
  v_id uuid := p_id;
  v_name text := btrim(coalesce(p_name, ''));
begin
  if char_length(v_name) < 2 then raise exception 'Enter a plot name.'; end if;
  if v_id is not null then
    update public.farm_plots set
      name = v_name,
      hectares = case when p_hectares is null then null else round(p_hectares, 3) end,
      crop = nullif(btrim(coalesce(p_crop, '')), ''),
      notes = nullif(btrim(coalesce(p_notes, '')), ''),
      updated_at = now()
    where id = v_id and business_unit_id = v_bu;
    if not found then raise exception 'Plot was not found.'; end if;
  else
    insert into public.farm_plots (business_unit_id, plot_number, name, hectares, crop, notes, is_active)
    values (
      v_bu, public.farm_next_document_number(v_bu, 'PLOT', 'FPL'), v_name,
      case when p_hectares is null then null else round(p_hectares, 3) end,
      nullif(btrim(coalesce(p_crop, '')), ''), nullif(btrim(coalesce(p_notes, '')), ''), true
    )
    returning id into v_id;
  end if;
  return jsonb_build_object('id', v_id);
end;
$$;

grant execute on function public.farm_save_plot(uuid, text, numeric, text, text) to authenticated, service_role;

create or replace function public.farm_save_season(
  p_id uuid,
  p_plot_id uuid,
  p_name text,
  p_year integer,
  p_crop text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_bu uuid := public.farm_bu();
  v_id uuid := p_id;
  v_name text := btrim(coalesce(p_name, ''));
begin
  if char_length(v_name) < 2 then raise exception 'Enter a season name.'; end if;
  if p_year is null or p_year < 2000 then raise exception 'Enter a valid season year.'; end if;
  perform 1 from public.farm_plots where id = p_plot_id and business_unit_id = v_bu;
  if not found then raise exception 'Plot was not found.'; end if;
  if v_id is not null then
    update public.farm_seasons set
      plot_id = p_plot_id, name = v_name, year = p_year, crop = nullif(btrim(coalesce(p_crop, '')), ''), updated_at = now()
    where id = v_id and business_unit_id = v_bu;
    if not found then raise exception 'Season was not found.'; end if;
  else
    insert into public.farm_seasons (business_unit_id, plot_id, season_number, name, year, crop, is_active)
    values (v_bu, p_plot_id, public.farm_next_document_number(v_bu, 'SEASON', 'FSN'), v_name, p_year, nullif(btrim(coalesce(p_crop, '')), ''), true)
    returning id into v_id;
  end if;
  return jsonb_build_object('id', v_id);
end;
$$;

grant execute on function public.farm_save_season(uuid, uuid, text, integer, text) to authenticated, service_role;

create or replace function public.farm_record_harvest(
  p_season_id uuid,
  p_quantity numeric,
  p_unit text,
  p_harvested_on date,
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
  v_bu uuid := public.farm_bu();
  v_existing uuid;
  v_id uuid;
  v_qty numeric := round(coalesce(p_quantity, 0), 3);
begin
  if p_request_id is null then raise exception 'Harvest request is invalid.'; end if;
  if v_qty <= 0 then raise exception 'Harvest quantity must be greater than zero.'; end if;
  select id into v_existing from public.farm_harvests where request_id = p_request_id limit 1;
  if v_existing is not null then
    return jsonb_build_object('id', v_existing, 'duplicate', true);
  end if;
  perform 1 from public.farm_seasons where id = p_season_id and business_unit_id = v_bu;
  if not found then raise exception 'Season was not found.'; end if;
  insert into public.farm_harvests (
    business_unit_id, harvest_number, season_id, quantity, unit, harvested_on, notes, request_id, recorded_by, is_active
  ) values (
    v_bu, public.farm_next_document_number(v_bu, 'HARVEST', 'FHV'), p_season_id, v_qty,
    coalesce(nullif(btrim(coalesce(p_unit, '')), ''), 'kg'),
    coalesce(p_harvested_on, current_date),
    nullif(btrim(coalesce(p_notes, '')), ''), p_request_id, p_actor_id, true
  )
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'duplicate', false);
end;
$$;

grant execute on function public.farm_record_harvest(uuid, numeric, text, date, text, uuid, uuid) to authenticated, service_role;
