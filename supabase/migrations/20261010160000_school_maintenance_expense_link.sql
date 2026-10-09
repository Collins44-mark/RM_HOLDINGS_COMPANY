-- Link transport fuel/maintenance records to sch_expenses with bus_id and payee.
-- Idempotent: request_id uniqueness + source unique index prevent duplicate expenses.
-- Backfill existing unlinked maintenance without inventing payment methods.
-- Attendance tables are left in place; no operational attendance records are deleted.

create unique index if not exists sch_maint_expense_uidx
  on public.sch_maintenance_records (business_unit_id, expense_id)
  where expense_id is not null;

create unique index if not exists sch_fuel_expense_uidx
  on public.sch_fuel_records (business_unit_id, expense_id)
  where expense_id is not null;

create or replace function public.sch_record_fuel(
  p_bus_id uuid,
  p_recorded_on date,
  p_litres numeric,
  p_unit_price numeric,
  p_odometer numeric,
  p_station text,
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
  v_active boolean;
  v_odo numeric;
  v_total numeric;
  v_fuel uuid;
  v_expense uuid;
  v_cat uuid;
  v_number text;
  v_existing uuid;
  v_source text;
  v_station text := btrim(coalesce(p_station, ''));
  v_reference text := btrim(coalesce(p_reference, ''));
begin
  if p_request_id is null then
    raise exception 'Fuel request is invalid.';
  end if;
  if p_litres is null or p_litres <= 0 or p_unit_price is null or p_unit_price <= 0 then
    raise exception 'Enter valid litres and price per litre.';
  end if;

  select business_unit_id, is_active, odometer into v_bu, v_active, v_odo
  from public.sch_buses
  where id = p_bus_id;
  if v_bu is null then
    raise exception 'Bus was not found.';
  end if;
  if not public.has_business_unit_access(v_bu) then
    raise exception 'Not authorized for this school.';
  end if;
  if not v_active then
    raise exception 'Fuel can only be recorded against an active bus.';
  end if;

  select id into v_existing
  from public.sch_fuel_records
  where business_unit_id = v_bu
    and request_id = p_request_id;
  if v_existing is not null then
    return jsonb_build_object('id', v_existing, 'duplicate', true);
  end if;

  select id, source_type into v_expense, v_source
  from public.sch_expenses
  where business_unit_id = v_bu
    and request_id = p_request_id;
  if v_expense is not null and v_source is distinct from 'TRANSPORT_FUEL' then
    raise exception 'This request is already used by another expense.';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_bus_id::text)::bigint);

  if p_odometer is not null then
    if p_odometer < v_odo then
      raise exception 'Odometer cannot be lower than the current bus reading.';
    end if;
    v_odo := p_odometer;
  end if;

  v_total := round(p_litres * p_unit_price, 2);

  if v_expense is null then
    v_cat := public.sch_ensure_expense_category(v_bu, 'TRANSPORT_FUEL', 'Transport - Fuel');
    v_number := public.sch_next_document_number(v_bu, 'expense', 'EXP');

    insert into public.sch_expenses (
      business_unit_id, category_id, expense_number, expense_date, amount, description, reference,
      source_type, source_id, request_id, recorded_by, is_active, bus_id, payee, method
    )
    values (
      v_bu, v_cat, v_number, p_recorded_on, v_total,
      'Transport fuel', v_reference,
      'TRANSPORT_FUEL', null, p_request_id, p_actor_id, true, p_bus_id, v_station, ''
    )
    returning id into v_expense;
  else
    update public.sch_expenses
      set bus_id = coalesce(bus_id, p_bus_id),
          payee = case when btrim(payee) = '' then v_station else payee end
    where id = v_expense
      and business_unit_id = v_bu;
  end if;

  insert into public.sch_fuel_records (
    business_unit_id, bus_id, recorded_on, litres, unit_price, total_amount, odometer,
    station, reference, notes, expense_id, request_id, recorded_by
  )
  values (
    v_bu, p_bus_id, p_recorded_on, p_litres, p_unit_price, v_total, p_odometer,
    v_station, v_reference, btrim(coalesce(p_notes, '')),
    v_expense, p_request_id, p_actor_id
  )
  returning id into v_fuel;

  update public.sch_expenses
    set source_id = coalesce(source_id, v_fuel),
        source_type = 'TRANSPORT_FUEL'
  where id = v_expense
    and business_unit_id = v_bu
    and (source_id is null or source_type = 'TRANSPORT_FUEL');

  if p_odometer is not null then
    update public.sch_buses set odometer = v_odo where id = p_bus_id;
  end if;

  return jsonb_build_object('id', v_fuel, 'expense_id', v_expense, 'amount', v_total, 'duplicate', false);
end;
$$;

create or replace function public.sch_record_maintenance(
  p_bus_id uuid,
  p_recorded_on date,
  p_odometer numeric,
  p_provider text,
  p_work text,
  p_parts text,
  p_cost numeric,
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
  v_active boolean;
  v_odo numeric;
  v_rec uuid;
  v_expense uuid;
  v_cat uuid;
  v_number text;
  v_existing uuid;
  v_source text;
  v_provider text := btrim(coalesce(p_provider, ''));
  v_work text := btrim(coalesce(p_work, ''));
  v_reference text := btrim(coalesce(p_reference, ''));
  v_description text;
begin
  if p_request_id is null then
    raise exception 'Maintenance request is invalid.';
  end if;
  if p_cost is null or p_cost <= 0 then
    raise exception 'Enter a valid maintenance cost.';
  end if;
  if char_length(v_work) < 2 then
    raise exception 'Describe the work performed.';
  end if;

  select business_unit_id, is_active, odometer into v_bu, v_active, v_odo
  from public.sch_buses
  where id = p_bus_id;
  if v_bu is null then
    raise exception 'Bus was not found.';
  end if;
  if not public.has_business_unit_access(v_bu) then
    raise exception 'Not authorized for this school.';
  end if;
  if not v_active then
    raise exception 'Maintenance can only be recorded against an active bus.';
  end if;

  select id into v_existing
  from public.sch_maintenance_records
  where business_unit_id = v_bu
    and request_id = p_request_id;
  if v_existing is not null then
    return jsonb_build_object('id', v_existing, 'duplicate', true);
  end if;

  select id, source_type into v_expense, v_source
  from public.sch_expenses
  where business_unit_id = v_bu
    and request_id = p_request_id;
  if v_expense is not null and v_source is distinct from 'TRANSPORT_MAINTENANCE' then
    raise exception 'This request is already used by another expense.';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_bus_id::text)::bigint);

  if p_odometer is not null then
    if p_odometer < v_odo then
      raise exception 'Odometer cannot be lower than the current bus reading.';
    end if;
    v_odo := p_odometer;
  end if;

  v_description := left(concat_ws(' · ', 'Vehicle maintenance', v_work), 240);

  if v_expense is null then
    v_cat := public.sch_ensure_expense_category(v_bu, 'TRANSPORT_MAINTENANCE', 'Transport - Maintenance');
    v_number := public.sch_next_document_number(v_bu, 'expense', 'EXP');

    insert into public.sch_expenses (
      business_unit_id, category_id, expense_number, expense_date, amount, description, reference,
      source_type, source_id, request_id, recorded_by, is_active, bus_id, payee, method
    )
    values (
      v_bu, v_cat, v_number, p_recorded_on, p_cost,
      v_description, v_reference,
      'TRANSPORT_MAINTENANCE', null, p_request_id, p_actor_id, true, p_bus_id, v_provider, ''
    )
    returning id into v_expense;
  else
    update public.sch_expenses
      set bus_id = coalesce(bus_id, p_bus_id),
          payee = case when btrim(payee) = '' then v_provider else payee end
    where id = v_expense
      and business_unit_id = v_bu;
  end if;

  insert into public.sch_maintenance_records (
    business_unit_id, bus_id, recorded_on, odometer, provider, work_performed, parts, cost,
    reference, notes, expense_id, request_id, recorded_by
  )
  values (
    v_bu, p_bus_id, p_recorded_on, p_odometer, v_provider, v_work,
    btrim(coalesce(p_parts, '')), p_cost, v_reference, btrim(coalesce(p_notes, '')),
    v_expense, p_request_id, p_actor_id
  )
  returning id into v_rec;

  update public.sch_expenses
    set source_id = coalesce(source_id, v_rec),
        source_type = 'TRANSPORT_MAINTENANCE'
  where id = v_expense
    and business_unit_id = v_bu
    and (source_id is null or source_type = 'TRANSPORT_MAINTENANCE');

  if p_odometer is not null then
    update public.sch_buses set odometer = v_odo where id = p_bus_id;
  end if;

  return jsonb_build_object('id', v_rec, 'expense_id', v_expense, 'amount', p_cost, 'duplicate', false);
end;
$$;

-- Attach maintenance rows that already have a matching expense by request_id (same BU, maintenance source).
update public.sch_maintenance_records m
set expense_id = e.id
from public.sch_expenses e
where m.expense_id is null
  and e.business_unit_id = m.business_unit_id
  and e.request_id = m.request_id
  and e.source_type = 'TRANSPORT_MAINTENANCE'
  and not exists (
    select 1
    from public.sch_maintenance_records other
    where other.expense_id = e.id
      and other.id <> m.id
  );

-- Attach by source_id when the expense already points at the maintenance row.
update public.sch_maintenance_records m
set expense_id = e.id
from public.sch_expenses e
where m.expense_id is null
  and e.business_unit_id = m.business_unit_id
  and e.source_type = 'TRANSPORT_MAINTENANCE'
  and e.source_id = m.id
  and not exists (
    select 1
    from public.sch_maintenance_records other
    where other.expense_id = e.id
      and other.id <> m.id
  );

-- Fill bus / payee / source on already-linked maintenance expenses. Do not overwrite recorded payment methods.
update public.sch_expenses e
set bus_id = coalesce(e.bus_id, m.bus_id),
    payee = case when btrim(e.payee) = '' then m.provider else e.payee end,
    source_id = case
      when e.source_type = 'TRANSPORT_MAINTENANCE' then coalesce(e.source_id, m.id)
      else e.source_id
    end
from public.sch_maintenance_records m
where m.expense_id = e.id
  and m.business_unit_id = e.business_unit_id;

update public.sch_expenses e
set bus_id = coalesce(e.bus_id, f.bus_id),
    payee = case when btrim(e.payee) = '' then f.station else e.payee end,
    source_id = case
      when e.source_type = 'TRANSPORT_FUEL' then coalesce(e.source_id, f.id)
      else e.source_id
    end
from public.sch_fuel_records f
where f.expense_id = e.id
  and f.business_unit_id = e.business_unit_id;

-- Create expenses for remaining unlinked maintenance records that have a trustworthy identity.
do $$
declare
  r record;
  v_cat uuid;
  v_expense uuid;
  v_number text;
  v_description text;
  v_review integer := 0;
begin
  for r in
    select m.*
    from public.sch_maintenance_records m
    where m.expense_id is null
      and not exists (
        select 1
        from public.sch_expenses e
        where e.business_unit_id = m.business_unit_id
          and e.request_id = m.request_id
      )
      and not exists (
        select 1
        from public.sch_expenses e
        where e.business_unit_id = m.business_unit_id
          and e.source_type = 'TRANSPORT_MAINTENANCE'
          and e.source_id = m.id
          and e.is_active
      )
  loop
    v_cat := public.sch_ensure_expense_category(r.business_unit_id, 'TRANSPORT_MAINTENANCE', 'Transport - Maintenance');
    v_number := public.sch_next_document_number(r.business_unit_id, 'expense', 'EXP');
    v_description := left(concat_ws(' · ', 'Vehicle maintenance', btrim(r.work_performed)), 240);

    insert into public.sch_expenses (
      business_unit_id, category_id, expense_number, expense_date, amount, description, reference,
      source_type, source_id, request_id, recorded_by, is_active, bus_id, payee, method
    )
    values (
      r.business_unit_id, v_cat, v_number, r.recorded_on, r.cost,
      v_description, btrim(coalesce(r.reference, '')),
      'TRANSPORT_MAINTENANCE', r.id, r.request_id, r.recorded_by, true, r.bus_id, btrim(coalesce(r.provider, '')), ''
    )
    returning id into v_expense;

    update public.sch_maintenance_records
      set expense_id = v_expense
    where id = r.id;
  end loop;

  select count(*) into v_review
  from public.sch_maintenance_records m
  where m.expense_id is null;

  if v_review > 0 then
    raise notice 'school_maintenance_expense_review: % maintenance record(s) remain unlinked and need manual review', v_review;
  end if;
end
$$;

-- Attendance permissions no longer map to an active School feature.
delete from public.role_permissions
where permission_code in ('school.attendance.view', 'school.attendance.create', 'school.attendance.edit');

delete from public.user_permission_overrides
where permission_code in ('school.attendance.view', 'school.attendance.create', 'school.attendance.edit');

delete from public.permissions
where code in ('school.attendance.view', 'school.attendance.create', 'school.attendance.edit');
