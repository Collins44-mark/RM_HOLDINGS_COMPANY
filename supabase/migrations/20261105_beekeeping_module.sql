-- Beekeeping module. Service role only, same access path as property.
-- Stock is derived: valid harvests minus active sale allocations.

create table if not exists public.bee_hives (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  hive_code varchar(50) not null,
  hive_name varchar(255) not null default '',
  location varchar(255) not null default '',
  hive_type varchar(50) not null default 'Langstroth',
  installation_date date not null,
  status varchar(50) not null default 'Empty',
  notes text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_unit_id, hive_code)
);

create table if not exists public.bee_harvests (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  hive_id uuid not null references public.bee_hives(id) on delete restrict,
  harvest_code varchar(50) not null,
  harvest_date date not null,
  quantity_kg numeric(12,3) not null check (quantity_kg > 0),
  quality varchar(50) not null default 'Not Graded',
  status varchar(50) not null default 'Valid',
  notes text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_unit_id, harvest_code)
);

create table if not exists public.bee_sales (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  sale_code varchar(50) not null,
  sale_date date not null,
  customer_name varchar(255) not null default '',
  phone varchar(50) not null default '',
  quantity_kg numeric(12,3) not null check (quantity_kg > 0),
  price_per_kg numeric(14,2) not null check (price_per_kg >= 0),
  total_amount numeric(14,2) not null check (total_amount >= 0),
  status varchar(50) not null default 'Unpaid',
  notes text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_unit_id, sale_code)
);

create table if not exists public.bee_stock_allocations (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  sale_id uuid not null references public.bee_sales(id) on delete cascade,
  harvest_id uuid not null references public.bee_harvests(id) on delete restrict,
  quantity_kg numeric(12,3) not null check (quantity_kg > 0),
  allocation_date date not null,
  status varchar(50) not null default 'Active',
  created_at timestamptz not null default now()
);

create table if not exists public.bee_sale_payments (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  sale_id uuid not null references public.bee_sales(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  payment_date date not null,
  payment_method varchar(50) not null default 'Cash',
  transaction_reference varchar(120) not null default '',
  request_key varchar(80) not null,
  status varchar(50) not null default 'Completed',
  notes text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (request_key)
);

create table if not exists public.bee_expenses (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  hive_id uuid references public.bee_hives(id) on delete set null,
  expense_code varchar(50) not null,
  expense_date date not null,
  due_date date,
  category varchar(80) not null,
  description text not null,
  location varchar(255) not null default '',
  vendor_name varchar(255) not null default '',
  amount numeric(14,2) not null check (amount > 0),
  status varchar(50) not null default 'Unpaid',
  notes text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_unit_id, expense_code)
);

create table if not exists public.bee_expense_payments (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  expense_id uuid not null references public.bee_expenses(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  payment_date date not null,
  payment_method varchar(50) not null default 'Cash',
  transaction_reference varchar(120) not null default '',
  request_key varchar(80) not null,
  status varchar(50) not null default 'Completed',
  notes text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (request_key)
);

create index if not exists bee_hives_bu_idx on public.bee_hives (business_unit_id, status);
create index if not exists bee_harvests_bu_idx on public.bee_harvests (business_unit_id, status, harvest_date);
create index if not exists bee_harvests_hive_idx on public.bee_harvests (hive_id);
create index if not exists bee_sales_bu_idx on public.bee_sales (business_unit_id, status, sale_date);
create index if not exists bee_alloc_sale_idx on public.bee_stock_allocations (sale_id, status);
create index if not exists bee_alloc_harvest_idx on public.bee_stock_allocations (harvest_id, status);
create index if not exists bee_sale_pay_idx on public.bee_sale_payments (sale_id, status);
create index if not exists bee_expenses_bu_idx on public.bee_expenses (business_unit_id, status);
create index if not exists bee_exp_pay_idx on public.bee_expense_payments (expense_id, status);

alter table public.bee_hives enable row level security;
alter table public.bee_harvests enable row level security;
alter table public.bee_sales enable row level security;
alter table public.bee_stock_allocations enable row level security;
alter table public.bee_sale_payments enable row level security;
alter table public.bee_expenses enable row level security;
alter table public.bee_expense_payments enable row level security;

revoke all on table public.bee_hives, public.bee_harvests, public.bee_sales, public.bee_stock_allocations, public.bee_sale_payments, public.bee_expenses, public.bee_expense_payments from anon, authenticated;
grant select, insert, update, delete on table public.bee_hives, public.bee_harvests, public.bee_sales, public.bee_stock_allocations, public.bee_sale_payments, public.bee_expenses, public.bee_expense_payments to service_role;

-- FIFO sale. Locks the business stock for the transaction so two sales cannot share the same kilograms.
create or replace function public.bee_create_sale(
  p_business_unit_id uuid,
  p_created_by uuid,
  p_sale_code text,
  p_sale_date date,
  p_quantity_kg numeric,
  p_price_per_kg numeric,
  p_customer_name text,
  p_phone text,
  p_notes text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  available numeric;
  sale_id uuid;
  need numeric;
  take numeric;
  row_harvest record;
begin
  if p_quantity_kg is null or p_quantity_kg <= 0 then
    raise exception 'Honey quantity must be greater than zero';
  end if;
  if p_price_per_kg is null or p_price_per_kg < 0 then
    raise exception 'Price per kg must be a valid amount';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_business_unit_id::text || ':bee-stock'));

  loop
    exit when not exists (
      select 1 from bee_sales
      where business_unit_id = p_business_unit_id and sale_code = p_sale_code
    );
    select 'SALE-' || lpad((coalesce(max((regexp_match(sale_code, '^SALE-([0-9]+)$'))[1]::int), 0) + 1)::text, 3, '0')
      into p_sale_code
    from bee_sales
    where business_unit_id = p_business_unit_id;
  end loop;

  select coalesce(sum(h.quantity_kg - coalesce(a.allocated, 0)), 0)
    into available
  from bee_harvests h
  left join (
    select harvest_id, sum(quantity_kg) as allocated
    from bee_stock_allocations
    where business_unit_id = p_business_unit_id and status = 'Active'
    group by harvest_id
  ) a on a.harvest_id = h.id
  where h.business_unit_id = p_business_unit_id and h.status = 'Valid';

  if p_quantity_kg > available then
    raise exception 'Not enough honey stock';
  end if;

  insert into bee_sales (
    business_unit_id, sale_code, sale_date, customer_name, phone, quantity_kg, price_per_kg, total_amount, status, notes, created_by
  ) values (
    p_business_unit_id, p_sale_code, p_sale_date, coalesce(p_customer_name, ''), coalesce(p_phone, ''),
    p_quantity_kg, p_price_per_kg, round(p_quantity_kg * p_price_per_kg, 2), 'Unpaid', coalesce(p_notes, ''), p_created_by
  ) returning id into sale_id;

  need := p_quantity_kg;
  for row_harvest in
    select h.id, h.quantity_kg - coalesce(a.allocated, 0) as remaining
    from bee_harvests h
    left join (
      select harvest_id, sum(quantity_kg) as allocated
      from bee_stock_allocations
      where business_unit_id = p_business_unit_id and status = 'Active'
      group by harvest_id
    ) a on a.harvest_id = h.id
    where h.business_unit_id = p_business_unit_id
      and h.status = 'Valid'
      and h.quantity_kg - coalesce(a.allocated, 0) > 0
    order by h.harvest_date, h.created_at
    for update of h
  loop
    exit when need <= 0;
    take := least(need, row_harvest.remaining);
    insert into bee_stock_allocations (business_unit_id, sale_id, harvest_id, quantity_kg, allocation_date, status)
    values (p_business_unit_id, sale_id, row_harvest.id, take, p_sale_date, 'Active');
    need := need - take;
  end loop;

  if need > 0.0001 then
    raise exception 'Not enough honey stock';
  end if;

  return jsonb_build_object('id', sale_id);
end;
$$;

create or replace function public.bee_cancel_sale(p_business_unit_id uuid, p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status text;
begin
  perform pg_advisory_xact_lock(hashtext(p_business_unit_id::text || ':bee-stock'));
  select status into current_status from bee_sales where id = p_sale_id and business_unit_id = p_business_unit_id for update;
  if current_status is null then
    raise exception 'Sale not found';
  end if;
  if current_status = 'Cancelled' then
    raise exception 'This sale is already cancelled';
  end if;
  update bee_stock_allocations set status = 'Reversed' where sale_id = p_sale_id and business_unit_id = p_business_unit_id and status = 'Active';
  update bee_sale_payments set status = 'Reversed' where sale_id = p_sale_id and business_unit_id = p_business_unit_id and status = 'Completed';
  update bee_sales set status = 'Cancelled', updated_at = now() where id = p_sale_id and business_unit_id = p_business_unit_id;
end;
$$;

revoke all on function public.bee_create_sale(uuid, uuid, text, date, numeric, numeric, text, text, text) from public, anon, authenticated;
revoke all on function public.bee_cancel_sale(uuid, uuid) from public, anon, authenticated;
grant execute on function public.bee_create_sale(uuid, uuid, text, date, numeric, numeric, text, text, text) to service_role;
grant execute on function public.bee_cancel_sale(uuid, uuid) to service_role;
