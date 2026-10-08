-- School transport operations and canonical school expenses. Additive.

insert into public.permissions (code, module, resource, action, name)
values
  ('school.transport.view', 'school', 'transport', 'view', 'View school transport')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code in ('SCHOOL_ADMIN', 'SCHOOL_MANAGER', 'HEADMASTER', 'SCHOOL_ACCOUNTANT')
  and p.code = 'school.transport.view'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code in ('SCHOOL_ADMIN', 'SCHOOL_MANAGER')
  and p.code in (
    'school.buses.view', 'school.buses.create', 'school.buses.edit',
    'school.drivers.view', 'school.drivers.create', 'school.drivers.edit',
    'school.routes.view', 'school.routes.create', 'school.routes.edit',
    'school.fuel.view', 'school.fuel.create', 'school.fuel.edit',
    'school.maintenance.view', 'school.maintenance.create', 'school.maintenance.edit',
    'school.expenses.view', 'school.expenses.create', 'school.expenses.edit'
  )
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code = 'HEADMASTER'
  and p.code in (
    'school.buses.view', 'school.drivers.view', 'school.routes.view',
    'school.fuel.view', 'school.maintenance.view', 'school.expenses.view'
  )
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code = 'SCHOOL_ACCOUNTANT'
  and p.code in (
    'school.buses.view', 'school.fuel.view', 'school.fuel.create', 'school.fuel.edit',
    'school.maintenance.view', 'school.maintenance.create', 'school.maintenance.edit',
    'school.expenses.view', 'school.expenses.create', 'school.expenses.edit'
  )
on conflict do nothing;

create table if not exists public.sch_buses (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  registration_number text not null,
  name text not null default '',
  make_model text not null default '',
  capacity integer not null default 0,
  model_year integer,
  odometer numeric(12, 1) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_buses_reg_len check (char_length(btrim(registration_number)) between 2 and 24),
  constraint sch_buses_capacity check (capacity >= 0),
  constraint sch_buses_odometer check (odometer >= 0)
);

create unique index if not exists sch_buses_reg_uidx
  on public.sch_buses (business_unit_id, lower(btrim(registration_number)));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sch_buses_id_bu_key') then
    alter table public.sch_buses
      add constraint sch_buses_id_bu_key unique (id, business_unit_id);
  end if;
end
$$;

drop trigger if exists sch_buses_touch on public.sch_buses;
create trigger sch_buses_touch before update on public.sch_buses
  for each row execute function public.sch_touch_updated_at();

alter table public.sch_buses enable row level security;
revoke all on public.sch_buses from anon, public;
grant select, insert, update on public.sch_buses to authenticated, service_role;

drop policy if exists sch_buses_select on public.sch_buses;
create policy sch_buses_select on public.sch_buses
  for select to authenticated using (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_buses_insert on public.sch_buses;
create policy sch_buses_insert on public.sch_buses
  for insert to authenticated with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_buses_update on public.sch_buses;
create policy sch_buses_update on public.sch_buses
  for update to authenticated
  using (public.has_business_unit_access(business_unit_id))
  with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_buses_delete on public.sch_buses;
create policy sch_buses_delete on public.sch_buses
  for delete to authenticated using (false);

create table if not exists public.sch_driver_assignments (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  staff_id uuid not null,
  bus_id uuid not null,
  is_active boolean not null default true,
  started_on date not null default (timezone('utc', now()))::date,
  ended_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_driver_assignments_staff_bu_fk foreign key (staff_id, business_unit_id)
    references public.sch_staff (id, business_unit_id) on delete restrict,
  constraint sch_driver_assignments_bus_bu_fk foreign key (bus_id, business_unit_id)
    references public.sch_buses (id, business_unit_id) on delete restrict,
  constraint sch_driver_assignments_dates check (ended_on is null or ended_on >= started_on)
);

create unique index if not exists sch_driver_active_staff_uidx
  on public.sch_driver_assignments (business_unit_id, staff_id)
  where is_active;

create unique index if not exists sch_driver_active_bus_uidx
  on public.sch_driver_assignments (business_unit_id, bus_id)
  where is_active;

drop trigger if exists sch_driver_assignments_touch on public.sch_driver_assignments;
create trigger sch_driver_assignments_touch before update on public.sch_driver_assignments
  for each row execute function public.sch_touch_updated_at();

alter table public.sch_driver_assignments enable row level security;
revoke all on public.sch_driver_assignments from anon, public;
grant select, insert, update on public.sch_driver_assignments to authenticated, service_role;

drop policy if exists sch_driver_assignments_select on public.sch_driver_assignments;
create policy sch_driver_assignments_select on public.sch_driver_assignments
  for select to authenticated using (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_driver_assignments_insert on public.sch_driver_assignments;
create policy sch_driver_assignments_insert on public.sch_driver_assignments
  for insert to authenticated with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_driver_assignments_update on public.sch_driver_assignments;
create policy sch_driver_assignments_update on public.sch_driver_assignments
  for update to authenticated
  using (public.has_business_unit_access(business_unit_id))
  with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_driver_assignments_delete on public.sch_driver_assignments;
create policy sch_driver_assignments_delete on public.sch_driver_assignments
  for delete to authenticated using (false);

create table if not exists public.sch_transport_routes (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  name text not null,
  details text not null default '',
  price numeric(14, 2) not null default 0,
  bus_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_transport_routes_name_len check (char_length(btrim(name)) between 2 and 80),
  constraint sch_transport_routes_price check (price >= 0),
  constraint sch_transport_routes_bus_bu_fk foreign key (bus_id, business_unit_id)
    references public.sch_buses (id, business_unit_id) on delete restrict
);

create unique index if not exists sch_transport_routes_name_uidx
  on public.sch_transport_routes (business_unit_id, lower(btrim(name)));

drop trigger if exists sch_transport_routes_touch on public.sch_transport_routes;
create trigger sch_transport_routes_touch before update on public.sch_transport_routes
  for each row execute function public.sch_touch_updated_at();

alter table public.sch_transport_routes enable row level security;
revoke all on public.sch_transport_routes from anon, public;
grant select, insert, update on public.sch_transport_routes to authenticated, service_role;

drop policy if exists sch_transport_routes_select on public.sch_transport_routes;
create policy sch_transport_routes_select on public.sch_transport_routes
  for select to authenticated using (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_transport_routes_insert on public.sch_transport_routes;
create policy sch_transport_routes_insert on public.sch_transport_routes
  for insert to authenticated with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_transport_routes_update on public.sch_transport_routes;
create policy sch_transport_routes_update on public.sch_transport_routes
  for update to authenticated
  using (public.has_business_unit_access(business_unit_id))
  with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_transport_routes_delete on public.sch_transport_routes;
create policy sch_transport_routes_delete on public.sch_transport_routes
  for delete to authenticated using (false);

create table if not exists public.sch_expense_categories (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  code text not null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_expense_categories_code_len check (char_length(btrim(code)) between 2 and 40)
);

create unique index if not exists sch_expense_categories_code_uidx
  on public.sch_expense_categories (business_unit_id, upper(btrim(code)));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sch_expense_categories_id_bu_key') then
    alter table public.sch_expense_categories
      add constraint sch_expense_categories_id_bu_key unique (id, business_unit_id);
  end if;
end
$$;

drop trigger if exists sch_expense_categories_touch on public.sch_expense_categories;
create trigger sch_expense_categories_touch before update on public.sch_expense_categories
  for each row execute function public.sch_touch_updated_at();

alter table public.sch_expense_categories enable row level security;
revoke all on public.sch_expense_categories from anon, public;
grant select, insert, update on public.sch_expense_categories to authenticated, service_role;

drop policy if exists sch_expense_categories_select on public.sch_expense_categories;
create policy sch_expense_categories_select on public.sch_expense_categories
  for select to authenticated using (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_expense_categories_insert on public.sch_expense_categories;
create policy sch_expense_categories_insert on public.sch_expense_categories
  for insert to authenticated with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_expense_categories_update on public.sch_expense_categories;
create policy sch_expense_categories_update on public.sch_expense_categories
  for update to authenticated
  using (public.has_business_unit_access(business_unit_id))
  with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_expense_categories_delete on public.sch_expense_categories;
create policy sch_expense_categories_delete on public.sch_expense_categories
  for delete to authenticated using (false);

create table if not exists public.sch_expenses (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  category_id uuid not null,
  expense_number text not null,
  expense_date date not null,
  amount numeric(14, 2) not null,
  description text not null default '',
  reference text not null default '',
  source_type text not null default 'MANUAL',
  source_id uuid,
  request_id uuid not null,
  recorded_by uuid references public.profiles(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_expenses_amount check (amount > 0),
  constraint sch_expenses_source check (source_type in ('MANUAL', 'TRANSPORT_FUEL', 'TRANSPORT_MAINTENANCE')),
  constraint sch_expenses_category_bu_fk foreign key (category_id, business_unit_id)
    references public.sch_expense_categories (id, business_unit_id) on delete restrict
);

create unique index if not exists sch_expenses_number_uidx
  on public.sch_expenses (business_unit_id, expense_number);
create unique index if not exists sch_expenses_request_uidx
  on public.sch_expenses (business_unit_id, request_id);
create unique index if not exists sch_expenses_source_uidx
  on public.sch_expenses (business_unit_id, source_type, source_id)
  where source_id is not null and is_active;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sch_expenses_id_bu_key') then
    alter table public.sch_expenses
      add constraint sch_expenses_id_bu_key unique (id, business_unit_id);
  end if;
end
$$;

drop trigger if exists sch_expenses_touch on public.sch_expenses;
create trigger sch_expenses_touch before update on public.sch_expenses
  for each row execute function public.sch_touch_updated_at();

alter table public.sch_expenses enable row level security;
revoke all on public.sch_expenses from anon, public;
grant select, insert, update on public.sch_expenses to authenticated, service_role;

drop policy if exists sch_expenses_select on public.sch_expenses;
create policy sch_expenses_select on public.sch_expenses
  for select to authenticated using (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_expenses_insert on public.sch_expenses;
create policy sch_expenses_insert on public.sch_expenses
  for insert to authenticated with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_expenses_update on public.sch_expenses;
create policy sch_expenses_update on public.sch_expenses
  for update to authenticated
  using (public.has_business_unit_access(business_unit_id))
  with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_expenses_delete on public.sch_expenses;
create policy sch_expenses_delete on public.sch_expenses
  for delete to authenticated using (false);

create table if not exists public.sch_fuel_records (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  bus_id uuid not null,
  recorded_on date not null,
  litres numeric(12, 2) not null,
  unit_price numeric(14, 2) not null,
  total_amount numeric(14, 2) not null,
  odometer numeric(12, 1),
  station text not null default '',
  reference text not null default '',
  notes text not null default '',
  expense_id uuid,
  request_id uuid not null,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_fuel_litres check (litres > 0),
  constraint sch_fuel_unit_price check (unit_price > 0),
  constraint sch_fuel_total check (total_amount > 0),
  constraint sch_fuel_bus_bu_fk foreign key (bus_id, business_unit_id)
    references public.sch_buses (id, business_unit_id) on delete restrict,
  constraint sch_fuel_expense_bu_fk foreign key (expense_id, business_unit_id)
    references public.sch_expenses (id, business_unit_id) on delete restrict
);

create unique index if not exists sch_fuel_request_uidx
  on public.sch_fuel_records (business_unit_id, request_id);

drop trigger if exists sch_fuel_records_touch on public.sch_fuel_records;
create trigger sch_fuel_records_touch before update on public.sch_fuel_records
  for each row execute function public.sch_touch_updated_at();

alter table public.sch_fuel_records enable row level security;
revoke all on public.sch_fuel_records from anon, public;
grant select, insert, update on public.sch_fuel_records to authenticated, service_role;

drop policy if exists sch_fuel_records_select on public.sch_fuel_records;
create policy sch_fuel_records_select on public.sch_fuel_records
  for select to authenticated using (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_fuel_records_insert on public.sch_fuel_records;
create policy sch_fuel_records_insert on public.sch_fuel_records
  for insert to authenticated with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_fuel_records_update on public.sch_fuel_records;
create policy sch_fuel_records_update on public.sch_fuel_records
  for update to authenticated
  using (public.has_business_unit_access(business_unit_id))
  with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_fuel_records_delete on public.sch_fuel_records;
create policy sch_fuel_records_delete on public.sch_fuel_records
  for delete to authenticated using (false);

create table if not exists public.sch_maintenance_records (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  bus_id uuid not null,
  recorded_on date not null,
  odometer numeric(12, 1),
  provider text not null default '',
  work_performed text not null,
  parts text not null default '',
  cost numeric(14, 2) not null,
  reference text not null default '',
  notes text not null default '',
  expense_id uuid,
  request_id uuid not null,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_maint_cost check (cost > 0),
  constraint sch_maint_work_len check (char_length(btrim(work_performed)) between 2 and 400),
  constraint sch_maint_bus_bu_fk foreign key (bus_id, business_unit_id)
    references public.sch_buses (id, business_unit_id) on delete restrict,
  constraint sch_maint_expense_bu_fk foreign key (expense_id, business_unit_id)
    references public.sch_expenses (id, business_unit_id) on delete restrict
);

create unique index if not exists sch_maint_request_uidx
  on public.sch_maintenance_records (business_unit_id, request_id);

drop trigger if exists sch_maintenance_records_touch on public.sch_maintenance_records;
create trigger sch_maintenance_records_touch before update on public.sch_maintenance_records
  for each row execute function public.sch_touch_updated_at();

alter table public.sch_maintenance_records enable row level security;
revoke all on public.sch_maintenance_records from anon, public;
grant select, insert, update on public.sch_maintenance_records to authenticated, service_role;

drop policy if exists sch_maintenance_records_select on public.sch_maintenance_records;
create policy sch_maintenance_records_select on public.sch_maintenance_records
  for select to authenticated using (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_maintenance_records_insert on public.sch_maintenance_records;
create policy sch_maintenance_records_insert on public.sch_maintenance_records
  for insert to authenticated with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_maintenance_records_update on public.sch_maintenance_records;
create policy sch_maintenance_records_update on public.sch_maintenance_records
  for update to authenticated
  using (public.has_business_unit_access(business_unit_id))
  with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sch_maintenance_records_delete on public.sch_maintenance_records;
create policy sch_maintenance_records_delete on public.sch_maintenance_records
  for delete to authenticated using (false);

create or replace function public.sch_ensure_expense_category(
  p_bu uuid,
  p_code text,
  p_name text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id
  from public.sch_expense_categories
  where business_unit_id = p_bu
    and upper(btrim(code)) = upper(btrim(p_code))
  limit 1;
  if v_id is not null then
    return v_id;
  end if;
  insert into public.sch_expense_categories (business_unit_id, code, name, is_active)
  values (p_bu, upper(btrim(p_code)), btrim(p_name), true)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.sch_assign_driver(
  p_staff_id uuid,
  p_bus_id uuid,
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
  v_staff_active text;
  v_id uuid;
begin
  select business_unit_id, is_active into v_bu, v_active
  from public.sch_buses
  where id = p_bus_id;
  if v_bu is null then
    raise exception 'Bus was not found.';
  end if;
  if not public.has_business_unit_access(v_bu) then
    raise exception 'Not authorized for this school.';
  end if;
  if not v_active then
    raise exception 'Inactive buses cannot receive a new driver assignment.';
  end if;
  select employment_status into v_staff_active
  from public.sch_staff
  where id = p_staff_id
    and business_unit_id = v_bu;
  if v_staff_active is null then
    raise exception 'Staff record was not found.';
  end if;
  if v_staff_active <> 'active' then
    raise exception 'Only active staff can be assigned as drivers.';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_bu::text || ':driver')::bigint);

  update public.sch_driver_assignments
    set is_active = false,
        ended_on = (timezone('utc', now()))::date
  where business_unit_id = v_bu
    and is_active
    and (staff_id = p_staff_id or bus_id = p_bus_id);

  insert into public.sch_driver_assignments (business_unit_id, staff_id, bus_id, is_active, started_on)
  values (v_bu, p_staff_id, p_bus_id, true, (timezone('utc', now()))::date)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'actor_id', p_actor_id);
end;
$$;

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

  perform pg_advisory_xact_lock(hashtext(p_bus_id::text)::bigint);

  if p_odometer is not null then
    if p_odometer < v_odo then
      raise exception 'Odometer cannot be lower than the current bus reading.';
    end if;
    v_odo := p_odometer;
  end if;

  v_total := round(p_litres * p_unit_price, 2);
  v_cat := public.sch_ensure_expense_category(v_bu, 'TRANSPORT_FUEL', 'Transport - Fuel');
  v_number := public.sch_next_document_number(v_bu, 'expense', 'EXP');

  insert into public.sch_expenses (
    business_unit_id, category_id, expense_number, expense_date, amount, description, reference,
    source_type, source_id, request_id, recorded_by, is_active
  )
  values (
    v_bu, v_cat, v_number, p_recorded_on, v_total,
    'Transport fuel', btrim(coalesce(p_reference, '')),
    'TRANSPORT_FUEL', null, p_request_id, p_actor_id, true
  )
  returning id into v_expense;

  insert into public.sch_fuel_records (
    business_unit_id, bus_id, recorded_on, litres, unit_price, total_amount, odometer,
    station, reference, notes, expense_id, request_id, recorded_by
  )
  values (
    v_bu, p_bus_id, p_recorded_on, p_litres, p_unit_price, v_total, p_odometer,
    btrim(coalesce(p_station, '')), btrim(coalesce(p_reference, '')), btrim(coalesce(p_notes, '')),
    v_expense, p_request_id, p_actor_id
  )
  returning id into v_fuel;

  update public.sch_expenses
    set source_id = v_fuel
  where id = v_expense;

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
begin
  if p_request_id is null then
    raise exception 'Maintenance request is invalid.';
  end if;
  if p_cost is null or p_cost <= 0 then
    raise exception 'Enter a valid maintenance cost.';
  end if;
  if char_length(btrim(coalesce(p_work, ''))) < 2 then
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

  perform pg_advisory_xact_lock(hashtext(p_bus_id::text)::bigint);

  if p_odometer is not null then
    if p_odometer < v_odo then
      raise exception 'Odometer cannot be lower than the current bus reading.';
    end if;
    v_odo := p_odometer;
  end if;

  v_cat := public.sch_ensure_expense_category(v_bu, 'TRANSPORT_MAINTENANCE', 'Transport - Maintenance');
  v_number := public.sch_next_document_number(v_bu, 'expense', 'EXP');

  insert into public.sch_expenses (
    business_unit_id, category_id, expense_number, expense_date, amount, description, reference,
    source_type, source_id, request_id, recorded_by, is_active
  )
  values (
    v_bu, v_cat, v_number, p_recorded_on, p_cost,
    left(btrim(p_work), 160), btrim(coalesce(p_reference, '')),
    'TRANSPORT_MAINTENANCE', null, p_request_id, p_actor_id, true
  )
  returning id into v_expense;

  insert into public.sch_maintenance_records (
    business_unit_id, bus_id, recorded_on, odometer, provider, work_performed, parts, cost,
    reference, notes, expense_id, request_id, recorded_by
  )
  values (
    v_bu, p_bus_id, p_recorded_on, p_odometer, btrim(coalesce(p_provider, '')), btrim(p_work),
    btrim(coalesce(p_parts, '')), p_cost, btrim(coalesce(p_reference, '')), btrim(coalesce(p_notes, '')),
    v_expense, p_request_id, p_actor_id
  )
  returning id into v_rec;

  update public.sch_expenses set source_id = v_rec where id = v_expense;

  if p_odometer is not null then
    update public.sch_buses set odometer = v_odo where id = p_bus_id;
  end if;

  return jsonb_build_object('id', v_rec, 'expense_id', v_expense, 'amount', p_cost, 'duplicate', false);
end;
$$;

grant execute on function public.sch_ensure_expense_category(uuid, text, text) to authenticated, service_role;
grant execute on function public.sch_assign_driver(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.sch_record_fuel(uuid, date, numeric, numeric, numeric, text, text, text, uuid, uuid) to authenticated, service_role;
grant execute on function public.sch_record_maintenance(uuid, date, numeric, text, text, text, numeric, text, text, uuid, uuid) to authenticated, service_role;
