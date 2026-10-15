-- Farm & Tractor Services ledgers at Chita. Isolated to the farm business unit.
-- Additive only. Does not share rice mill inventory or rice ledgers.

create or replace function public.farm_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.farm_document_counters (
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  doc_type text not null,
  prefix text not null,
  next_value integer not null default 1,
  primary key (business_unit_id, doc_type),
  constraint farm_document_counters_doc_type_chk check (
    doc_type in ('PARTY','STAFF','TRACTOR','JOB','FUEL','MAINT','EXPENSE','PLOT','SEASON','OP','HARVEST')
  ),
  constraint farm_document_counters_prefix_chk check (char_length(btrim(prefix)) between 1 and 8),
  constraint farm_document_counters_next_chk check (next_value >= 1)
);

create or replace function public.farm_next_document_number(
  p_business_unit_id uuid,
  p_doc_type text,
  p_prefix text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
  v_prefix text := upper(btrim(p_prefix));
begin
  if p_business_unit_id is null then
    raise exception 'Farm business unit is required.';
  end if;
  if v_prefix is null or char_length(v_prefix) < 1 or char_length(v_prefix) > 8 then
    raise exception 'Document prefix is invalid.';
  end if;
  if not public.has_business_unit_access(p_business_unit_id) then
    raise exception 'Not authorized for Farm & Tractor Services.';
  end if;

  insert into public.farm_document_counters (business_unit_id, doc_type, prefix, next_value)
  values (p_business_unit_id, p_doc_type, v_prefix, 2)
  on conflict (business_unit_id, doc_type)
  do update set next_value = public.farm_document_counters.next_value + 1
  returning next_value - 1 into v_next;

  return v_prefix || '-' || lpad(v_next::text, 4, '0');
end;
$$;

grant execute on function public.farm_next_document_number(uuid, text, text) to authenticated, service_role;

create table if not exists public.farm_service_types (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  code text not null,
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint farm_service_types_code_chk check (char_length(btrim(code)) between 1 and 32),
  constraint farm_service_types_name_chk check (char_length(btrim(name)) between 1 and 80),
  unique (business_unit_id, code)
);

create table if not exists public.farm_parties (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  party_number text not null,
  kind text not null,
  name text not null,
  phone text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint farm_parties_kind_chk check (kind in ('CUSTOMER','SUPPLIER','BOTH')),
  constraint farm_parties_name_chk check (char_length(btrim(name)) between 1 and 120),
  unique (business_unit_id, party_number)
);

create table if not exists public.farm_staff (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  staff_number text not null,
  name text not null,
  phone text,
  role text not null default 'OPERATOR',
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint farm_staff_role_chk check (role in ('OPERATOR','MECHANIC','OTHER')),
  constraint farm_staff_name_chk check (char_length(btrim(name)) between 1 and 120),
  unique (business_unit_id, staff_number)
);

create table if not exists public.farm_tractors (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  code text not null,
  name text not null,
  registration_number text,
  manufacturer text,
  model text,
  acquired_on date,
  acquisition_cost numeric(14,2),
  status text not null default 'AVAILABLE',
  hour_meter numeric(14,1) not null default 0,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint farm_tractors_status_chk check (status in ('AVAILABLE','IN_USE','UNDER_SERVICE','INACTIVE')),
  constraint farm_tractors_code_chk check (char_length(btrim(code)) between 1 and 32),
  constraint farm_tractors_name_chk check (char_length(btrim(name)) between 1 and 80),
  constraint farm_tractors_hours_chk check (hour_meter >= 0),
  constraint farm_tractors_cost_chk check (acquisition_cost is null or acquisition_cost >= 0),
  unique (business_unit_id, code)
);

create unique index if not exists farm_tractors_reg_uidx
  on public.farm_tractors (business_unit_id, registration_number)
  where registration_number is not null and btrim(registration_number) <> '';

create table if not exists public.farm_plots (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  plot_number text not null,
  name text not null,
  hectares numeric(14,3),
  crop text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_unit_id, plot_number)
);

create table if not exists public.farm_seasons (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  plot_id uuid not null references public.farm_plots(id) on delete restrict,
  season_number text not null,
  name text not null,
  year integer not null,
  crop text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_unit_id, season_number)
);

create table if not exists public.farm_jobs (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  job_number text not null,
  party_id uuid not null references public.farm_parties(id) on delete restrict,
  service_type_id uuid not null references public.farm_service_types(id) on delete restrict,
  tractor_id uuid references public.farm_tractors(id) on delete restrict,
  operator_id uuid references public.farm_staff(id) on delete restrict,
  location text,
  area_ha numeric(14,3),
  occurred_on date not null,
  completed_on date,
  agreed_price numeric(14,2) not null default 0,
  amount_paid numeric(14,2) not null default 0,
  status text not null default 'PENDING',
  hour_meter numeric(14,1),
  notes text,
  request_id uuid not null,
  recorded_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint farm_jobs_status_chk check (status in ('PENDING','IN_PROGRESS','COMPLETED','CANCELLED')),
  constraint farm_jobs_price_chk check (agreed_price >= 0),
  constraint farm_jobs_paid_chk check (amount_paid >= 0 and amount_paid <= agreed_price),
  constraint farm_jobs_area_chk check (area_ha is null or area_ha >= 0),
  unique (business_unit_id, job_number),
  unique (request_id)
);

create table if not exists public.farm_job_payments (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  job_id uuid not null references public.farm_jobs(id) on delete restrict,
  occurred_on date not null,
  amount numeric(14,2) not null,
  payment_method text,
  payment_reference text,
  notes text,
  request_id uuid not null,
  recorded_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint farm_job_pay_amount_chk check (amount > 0),
  constraint farm_job_pay_method_chk check (
    payment_method is null or payment_method in ('CASH','MOBILE_MONEY','BANK')
  ),
  unique (request_id)
);

create table if not exists public.farm_fuel (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  fuel_number text not null,
  tractor_id uuid not null references public.farm_tractors(id) on delete restrict,
  supplier_id uuid references public.farm_parties(id) on delete restrict,
  occurred_on date not null,
  litres numeric(14,3) not null,
  unit_price numeric(14,2) not null,
  total_cost numeric(14,2) not null,
  hour_meter numeric(14,1),
  station_name text,
  payment_method text,
  payment_reference text,
  notes text,
  request_id uuid not null,
  recorded_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint farm_fuel_litres_chk check (litres > 0),
  constraint farm_fuel_price_chk check (unit_price >= 0),
  constraint farm_fuel_total_chk check (total_cost >= 0),
  constraint farm_fuel_method_chk check (
    payment_method is null or payment_method in ('CASH','MOBILE_MONEY','BANK')
  ),
  unique (business_unit_id, fuel_number),
  unique (request_id)
);

create table if not exists public.farm_maintenance (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  maintenance_number text not null,
  tractor_id uuid not null references public.farm_tractors(id) on delete restrict,
  supplier_id uuid references public.farm_parties(id) on delete restrict,
  occurred_on date not null,
  category text not null,
  description text not null,
  parts_cost numeric(14,2) not null default 0,
  labour_cost numeric(14,2) not null default 0,
  total_cost numeric(14,2) not null,
  hour_meter numeric(14,1),
  next_service_on date,
  next_service_hours numeric(14,1),
  payment_method text,
  payment_reference text,
  notes text,
  request_id uuid not null,
  recorded_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint farm_maint_cat_chk check (category in ('SERVICE','PARTS','REPAIR','OTHER')),
  constraint farm_maint_desc_chk check (char_length(btrim(description)) between 1 and 240),
  constraint farm_maint_parts_chk check (parts_cost >= 0),
  constraint farm_maint_labour_chk check (labour_cost >= 0),
  constraint farm_maint_total_chk check (total_cost >= 0),
  constraint farm_maint_method_chk check (
    payment_method is null or payment_method in ('CASH','MOBILE_MONEY','BANK')
  ),
  unique (business_unit_id, maintenance_number),
  unique (request_id)
);

create table if not exists public.farm_operations (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  operation_number text not null,
  plot_id uuid references public.farm_plots(id) on delete restrict,
  season_id uuid references public.farm_seasons(id) on delete restrict,
  tractor_id uuid references public.farm_tractors(id) on delete restrict,
  activity text not null,
  occurred_on date not null,
  area_ha numeric(14,3),
  cost numeric(14,2) not null default 0,
  notes text,
  request_id uuid not null,
  recorded_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint farm_ops_activity_chk check (char_length(btrim(activity)) between 1 and 80),
  constraint farm_ops_cost_chk check (cost >= 0),
  unique (business_unit_id, operation_number),
  unique (request_id)
);

create table if not exists public.farm_harvests (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  harvest_number text not null,
  season_id uuid not null references public.farm_seasons(id) on delete restrict,
  quantity numeric(14,3) not null,
  unit text not null default 'kg',
  harvested_on date not null,
  notes text,
  request_id uuid not null,
  recorded_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint farm_harvest_qty_chk check (quantity > 0),
  unique (business_unit_id, harvest_number),
  unique (request_id)
);

create table if not exists public.farm_expenses (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  expense_number text not null,
  kind text not null,
  occurred_on date not null,
  amount numeric(14,2) not null,
  payment_method text,
  payment_reference text,
  notes text,
  source_type text not null default 'MANUAL',
  source_id uuid,
  request_id uuid not null,
  recorded_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint farm_expense_kind_chk check (kind in ('FUEL','MAINTENANCE','LABOUR','OPERATING','OTHER')),
  constraint farm_expense_amount_chk check (amount > 0),
  constraint farm_expense_source_chk check (source_type in ('MANUAL','FUEL','MAINTENANCE','OPERATION')),
  constraint farm_expense_method_chk check (
    payment_method is null or payment_method in ('CASH','MOBILE_MONEY','BANK')
  ),
  unique (business_unit_id, expense_number),
  unique (request_id)
);

create unique index if not exists farm_expenses_source_uidx
  on public.farm_expenses (business_unit_id, source_type, source_id)
  where source_id is not null and is_active;

create index if not exists farm_tractors_bu_idx on public.farm_tractors (business_unit_id, status, name);
create index if not exists farm_jobs_bu_date_idx on public.farm_jobs (business_unit_id, occurred_on desc);
create index if not exists farm_fuel_bu_date_idx on public.farm_fuel (business_unit_id, occurred_on desc);
create index if not exists farm_maint_bu_date_idx on public.farm_maintenance (business_unit_id, occurred_on desc);
create index if not exists farm_expenses_bu_date_idx on public.farm_expenses (business_unit_id, occurred_on desc);
create index if not exists farm_parties_bu_idx on public.farm_parties (business_unit_id, kind, name);

drop trigger if exists farm_service_types_touch on public.farm_service_types;
create trigger farm_service_types_touch before update on public.farm_service_types
for each row execute function public.farm_touch_updated_at();
drop trigger if exists farm_parties_touch on public.farm_parties;
create trigger farm_parties_touch before update on public.farm_parties
for each row execute function public.farm_touch_updated_at();
drop trigger if exists farm_staff_touch on public.farm_staff;
create trigger farm_staff_touch before update on public.farm_staff
for each row execute function public.farm_touch_updated_at();
drop trigger if exists farm_tractors_touch on public.farm_tractors;
create trigger farm_tractors_touch before update on public.farm_tractors
for each row execute function public.farm_touch_updated_at();
drop trigger if exists farm_plots_touch on public.farm_plots;
create trigger farm_plots_touch before update on public.farm_plots
for each row execute function public.farm_touch_updated_at();
drop trigger if exists farm_seasons_touch on public.farm_seasons;
create trigger farm_seasons_touch before update on public.farm_seasons
for each row execute function public.farm_touch_updated_at();
drop trigger if exists farm_jobs_touch on public.farm_jobs;
create trigger farm_jobs_touch before update on public.farm_jobs
for each row execute function public.farm_touch_updated_at();

create or replace view public.farm_v_tractor_fuel
with (security_invoker = true) as
select
  f.business_unit_id,
  f.tractor_id,
  coalesce(sum(f.litres) filter (where f.is_active), 0)::numeric(14,3) as litres
from public.farm_fuel f
group by f.business_unit_id, f.tractor_id;

insert into public.farm_service_types (business_unit_id, code, name, sort_order)
select bu.id, v.code, v.name, v.sort_order
from public.business_units bu
cross join (
  values
    ('PLOUGHING', 'Ploughing', 10),
    ('LAND_PREP', 'Land preparation', 20),
    ('PLANTING', 'Planting', 30),
    ('WEEDING', 'Weeding', 40),
    ('HAULING', 'Hauling', 50)
) as v(code, name, sort_order)
where bu.code = 'farm'
on conflict (business_unit_id, code) do nothing;

do $$
declare
  t text;
begin
  foreach t in array array[
    'farm_document_counters',
    'farm_service_types',
    'farm_parties',
    'farm_staff',
    'farm_tractors',
    'farm_plots',
    'farm_seasons',
    'farm_jobs',
    'farm_job_payments',
    'farm_fuel',
    'farm_maintenance',
    'farm_operations',
    'farm_harvests',
    'farm_expenses'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'drop policy if exists %I on public.%I; create policy %I on public.%I for all using (public.has_business_unit_access(business_unit_id)) with check (public.has_business_unit_access(business_unit_id));',
      t || '_all', t, t || '_all', t
    );
    execute format('grant select, insert, update on public.%I to authenticated;', t);
    execute format('grant all on public.%I to service_role;', t);
  end loop;
end;
$$;

grant select on public.farm_v_tractor_fuel to authenticated, service_role;
