-- Kigamboni Farm livestock. Group quantities only. Service role, same path as beekeeping.
-- Current stock is the movement ledger. Pregnancy is not stock.

create table if not exists public.ls_animal_types (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  name varchar(80) not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_unit_id, name)
);

create table if not exists public.ls_movements (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  animal_type_id uuid not null references public.ls_animal_types(id) on delete restrict,
  movement_date date not null,
  movement_type varchar(40) not null,
  quantity_in integer not null default 0 check (quantity_in >= 0),
  quantity_out integer not null default 0 check (quantity_out >= 0),
  source_type varchar(40) not null,
  source_id uuid not null,
  notes text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (source_type, source_id),
  check ((quantity_in > 0 and quantity_out = 0) or (quantity_out > 0 and quantity_in = 0))
);

create table if not exists public.ls_openings (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  animal_type_id uuid not null references public.ls_animal_types(id) on delete restrict,
  opening_code varchar(40) not null,
  quantity integer not null check (quantity > 0),
  opening_date date not null,
  notes text not null default '',
  status varchar(30) not null default 'Valid',
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (business_unit_id, opening_code)
);

create table if not exists public.ls_purchases (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  animal_type_id uuid not null references public.ls_animal_types(id) on delete restrict,
  purchase_code varchar(40) not null,
  quantity integer not null check (quantity > 0),
  purchase_date date not null,
  unit_price numeric(14,2),
  total_cost numeric(14,2) not null check (total_cost >= 0),
  seller_name varchar(255) not null default '',
  notes text not null default '',
  status varchar(30) not null default 'Valid',
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (business_unit_id, purchase_code)
);

create table if not exists public.ls_pregnancies (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  animal_type_id uuid not null references public.ls_animal_types(id) on delete restrict,
  pregnancy_code varchar(40) not null,
  quantity integer not null check (quantity > 0),
  pregnancy_date date,
  expected_date date,
  notes text not null default '',
  status varchar(30) not null default 'Active',
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (business_unit_id, pregnancy_code)
);

create table if not exists public.ls_births (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  animal_type_id uuid not null references public.ls_animal_types(id) on delete restrict,
  birth_code varchar(40) not null,
  mothers integer not null check (mothers > 0),
  offspring integer not null check (offspring > 0),
  birth_date date not null,
  notes text not null default '',
  status varchar(30) not null default 'Valid',
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (business_unit_id, birth_code)
);

create table if not exists public.ls_deaths (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  animal_type_id uuid not null references public.ls_animal_types(id) on delete restrict,
  death_code varchar(40) not null,
  quantity integer not null check (quantity > 0),
  death_date date not null,
  reason text not null default '',
  notes text not null default '',
  status varchar(30) not null default 'Valid',
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (business_unit_id, death_code)
);

create table if not exists public.ls_adjustments (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  animal_type_id uuid not null references public.ls_animal_types(id) on delete restrict,
  adjustment_code varchar(40) not null,
  direction varchar(20) not null check (direction in ('Increase', 'Decrease')),
  quantity integer not null check (quantity > 0),
  adjustment_date date not null,
  reason text not null,
  notes text not null default '',
  status varchar(30) not null default 'Valid',
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (business_unit_id, adjustment_code)
);

create table if not exists public.ls_sales (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  animal_type_id uuid not null references public.ls_animal_types(id) on delete restrict,
  sale_code varchar(40) not null,
  quantity integer not null check (quantity > 0),
  sale_date date not null,
  unit_price numeric(14,2) not null check (unit_price >= 0),
  total_amount numeric(14,2) not null check (total_amount >= 0),
  buyer_name varchar(255) not null default '',
  notes text not null default '',
  status varchar(30) not null default 'Unpaid',
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (business_unit_id, sale_code)
);

create table if not exists public.ls_sale_payments (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  sale_id uuid not null references public.ls_sales(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  payment_date date not null,
  payment_method varchar(40) not null default 'Cash',
  request_key varchar(80) not null,
  status varchar(30) not null default 'Completed',
  notes text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (request_key)
);

create table if not exists public.ls_houses (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  house_name varchar(80) not null,
  location varchar(255) not null default '',
  capacity integer,
  status varchar(30) not null default 'Available',
  monthly_rent numeric(14,2) not null default 0 check (monthly_rent >= 0),
  notes text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_unit_id, house_name)
);

create table if not exists public.ls_rentals (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  house_id uuid not null references public.ls_houses(id) on delete restrict,
  rental_code varchar(40) not null,
  tenant_name varchar(255) not null,
  tenant_phone varchar(50) not null default '',
  start_date date not null,
  end_date date,
  monthly_rent numeric(14,2) not null check (monthly_rent >= 0),
  due_day integer not null default 1 check (due_day between 1 and 28),
  notes text not null default '',
  status varchar(30) not null default 'Active',
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (business_unit_id, rental_code)
);

create unique index if not exists ls_rentals_one_active on public.ls_rentals (house_id) where status = 'Active';

create table if not exists public.ls_rental_payments (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  rental_id uuid not null references public.ls_rentals(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  payment_date date not null,
  payment_method varchar(40) not null default 'Cash',
  request_key varchar(80) not null,
  status varchar(30) not null default 'Completed',
  notes text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (request_key)
);

create table if not exists public.ls_expenses (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  expense_code varchar(40) not null,
  expense_date date not null,
  category varchar(80) not null,
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  animal_type_id uuid references public.ls_animal_types(id) on delete set null,
  house_id uuid references public.ls_houses(id) on delete set null,
  purchase_id uuid references public.ls_purchases(id) on delete restrict,
  vendor_name varchar(255) not null default '',
  due_date date,
  notes text not null default '',
  status varchar(30) not null default 'Unpaid',
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (business_unit_id, expense_code)
);

create unique index if not exists ls_expenses_purchase_key on public.ls_expenses (purchase_id) where purchase_id is not null;

create table if not exists public.ls_expense_payments (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  expense_id uuid not null references public.ls_expenses(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  payment_date date not null,
  payment_method varchar(40) not null default 'Cash',
  request_key varchar(80) not null,
  status varchar(30) not null default 'Completed',
  notes text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (request_key)
);

create index if not exists ls_movements_type_idx on public.ls_movements (business_unit_id, animal_type_id, movement_date);
create index if not exists ls_sales_bu_idx on public.ls_sales (business_unit_id, status, sale_date);

alter table public.ls_animal_types enable row level security;
alter table public.ls_movements enable row level security;
alter table public.ls_openings enable row level security;
alter table public.ls_purchases enable row level security;
alter table public.ls_pregnancies enable row level security;
alter table public.ls_births enable row level security;
alter table public.ls_deaths enable row level security;
alter table public.ls_adjustments enable row level security;
alter table public.ls_sales enable row level security;
alter table public.ls_sale_payments enable row level security;
alter table public.ls_houses enable row level security;
alter table public.ls_rentals enable row level security;
alter table public.ls_rental_payments enable row level security;
alter table public.ls_expenses enable row level security;
alter table public.ls_expense_payments enable row level security;

revoke all on table
  public.ls_animal_types, public.ls_movements, public.ls_openings, public.ls_purchases,
  public.ls_pregnancies, public.ls_births, public.ls_deaths, public.ls_adjustments,
  public.ls_sales, public.ls_sale_payments, public.ls_houses, public.ls_rentals,
  public.ls_rental_payments, public.ls_expenses, public.ls_expense_payments
from anon, authenticated;
grant select, insert, update, delete on table
  public.ls_animal_types, public.ls_movements, public.ls_openings, public.ls_purchases,
  public.ls_pregnancies, public.ls_births, public.ls_deaths, public.ls_adjustments,
  public.ls_sales, public.ls_sale_payments, public.ls_houses, public.ls_rentals,
  public.ls_rental_payments, public.ls_expenses, public.ls_expense_payments
to service_role;

create or replace function public.ls_on_hand(p_bu uuid, p_type uuid)
returns integer language sql stable as $$
  select coalesce(sum(quantity_in - quantity_out), 0)::integer
  from public.ls_movements
  where business_unit_id = p_bu and animal_type_id = p_type;
$$;

create or replace function public.ls_pregnant_count(p_bu uuid, p_type uuid)
returns integer language sql stable as $$
  select (
    coalesce((select sum(quantity) from public.ls_pregnancies where business_unit_id = p_bu and animal_type_id = p_type and status = 'Active'), 0)
    - coalesce((select sum(mothers) from public.ls_births where business_unit_id = p_bu and animal_type_id = p_type and status = 'Valid'), 0)
  )::integer;
$$;

create or replace function public.ls_next_code(p_bu uuid, p_prefix text)
returns text language plpgsql as $$
declare n integer;
begin
  select coalesce(max((regexp_match(code, '^' || p_prefix || '-([0-9]+)$'))[1]::int), 0) + 1 into n
  from (
    select opening_code as code from public.ls_openings where business_unit_id = p_bu
    union all select purchase_code from public.ls_purchases where business_unit_id = p_bu
    union all select pregnancy_code from public.ls_pregnancies where business_unit_id = p_bu
    union all select birth_code from public.ls_births where business_unit_id = p_bu
    union all select death_code from public.ls_deaths where business_unit_id = p_bu
    union all select adjustment_code from public.ls_adjustments where business_unit_id = p_bu
    union all select sale_code from public.ls_sales where business_unit_id = p_bu
    union all select rental_code from public.ls_rentals where business_unit_id = p_bu
    union all select expense_code from public.ls_expenses where business_unit_id = p_bu
  ) codes
  where code ~ ('^' || p_prefix || '-[0-9]+$');
  return p_prefix || '-' || lpad(n::text, 3, '0');
end;
$$;

create or replace function public.ls_move(
  p_bu uuid, p_type uuid, p_date date, p_kind text, p_in integer, p_out integer, p_source_type text, p_source uuid, p_notes text, p_user uuid
) returns void language plpgsql as $$
declare stock integer;
declare pregnant integer;
begin
  insert into public.ls_movements (business_unit_id, animal_type_id, movement_date, movement_type, quantity_in, quantity_out, source_type, source_id, notes, created_by)
  values (p_bu, p_type, p_date, p_kind, p_in, p_out, p_source_type, p_source, coalesce(p_notes, ''), p_user);
  stock := public.ls_on_hand(p_bu, p_type);
  pregnant := public.ls_pregnant_count(p_bu, p_type);
  if stock < 0 then raise exception 'Not enough animals in stock'; end if;
  if pregnant > stock then raise exception 'This would leave more pregnant animals than animals in stock'; end if;
end;
$$;
