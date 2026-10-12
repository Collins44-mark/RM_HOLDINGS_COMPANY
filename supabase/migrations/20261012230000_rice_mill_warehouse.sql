-- Rice Mill & Warehouse ledgers: company stock, milling, customer storage, sales, finance.
-- Additive only. Isolated to the rice business unit.

create or replace function public.rice_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.rice_document_counters (
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  doc_type text not null,
  prefix text not null,
  next_value integer not null default 1,
  primary key (business_unit_id, doc_type),
  constraint rice_document_counters_doc_type_chk check (doc_type in ('PURCHASE','BATCH','SALE','STORAGE','SERVICE','EXPENSE','PARTY')),
  constraint rice_document_counters_prefix_chk check (char_length(btrim(prefix)) between 1 and 8),
  constraint rice_document_counters_next_chk check (next_value >= 1)
);

create or replace function public.rice_next_document_number(
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
    raise exception 'Rice mill business unit is required.';
  end if;
  if v_prefix is null or char_length(v_prefix) < 1 or char_length(v_prefix) > 8 then
    raise exception 'Document prefix is invalid.';
  end if;
  if not public.has_business_unit_access(p_business_unit_id) then
    raise exception 'Not authorized for Rice Mill & Warehouse.';
  end if;

  insert into public.rice_document_counters (business_unit_id, doc_type, prefix, next_value)
  values (p_business_unit_id, p_doc_type, v_prefix, 2)
  on conflict (business_unit_id, doc_type)
  do update set next_value = public.rice_document_counters.next_value + 1
  returning next_value - 1 into v_next;

  return v_prefix || '-' || lpad(v_next::text, 4, '0');
end;
$$;

grant execute on function public.rice_next_document_number(uuid, text, text) to authenticated, service_role;

create table if not exists public.rice_items (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  code text not null,
  name text not null,
  kind text not null,
  unit text not null default 'kg',
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rice_items_kind_chk check (kind in ('PADDY','RICE','BROKEN','BYPRODUCT')),
  constraint rice_items_unit_chk check (unit = 'kg'),
  constraint rice_items_code_chk check (char_length(btrim(code)) between 1 and 32),
  constraint rice_items_name_chk check (char_length(btrim(name)) between 1 and 80),
  unique (business_unit_id, code)
);

create table if not exists public.rice_parties (
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
  constraint rice_parties_kind_chk check (kind in ('SUPPLIER','CUSTOMER','BOTH')),
  constraint rice_parties_name_chk check (char_length(btrim(name)) between 1 and 120),
  unique (business_unit_id, party_number)
);

create table if not exists public.rice_purchases (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  item_id uuid not null references public.rice_items(id) on delete restrict,
  party_id uuid not null references public.rice_parties(id) on delete restrict,
  purchase_number text not null,
  occurred_on date not null,
  bags numeric(14,3),
  qty_kg numeric(14,3) not null,
  unit_price numeric(14,2) not null,
  total_amount numeric(14,2) not null,
  amount_paid numeric(14,2) not null default 0,
  payment_method text,
  payment_reference text,
  notes text,
  request_id uuid not null,
  recorded_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rice_purchases_qty_chk check (qty_kg > 0),
  constraint rice_purchases_price_chk check (unit_price >= 0),
  constraint rice_purchases_total_chk check (total_amount >= 0),
  constraint rice_purchases_paid_chk check (amount_paid >= 0 and amount_paid <= total_amount),
  constraint rice_purchases_method_chk check (
    payment_method is null or payment_method in ('CASH','MOBILE_MONEY','BANK','CREDIT')
  ),
  unique (business_unit_id, purchase_number),
  unique (request_id)
);

create table if not exists public.rice_mill_batches (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  input_item_id uuid not null references public.rice_items(id) on delete restrict,
  batch_number text not null,
  produced_on date not null,
  machine text,
  shift text,
  input_qty_kg numeric(14,3) not null,
  wastage_kg numeric(14,3) not null default 0,
  processing_cost numeric(14,2) not null default 0,
  notes text,
  request_id uuid not null,
  recorded_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rice_mill_input_chk check (input_qty_kg > 0),
  constraint rice_mill_wastage_chk check (wastage_kg >= 0),
  constraint rice_mill_cost_chk check (processing_cost >= 0),
  unique (business_unit_id, batch_number),
  unique (request_id)
);

create table if not exists public.rice_mill_outputs (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  batch_id uuid not null references public.rice_mill_batches(id) on delete cascade,
  item_id uuid not null references public.rice_items(id) on delete restrict,
  qty_kg numeric(14,3) not null,
  created_at timestamptz not null default now(),
  constraint rice_mill_output_qty_chk check (qty_kg > 0),
  unique (batch_id, item_id)
);

create table if not exists public.rice_stock_movements (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  item_id uuid not null references public.rice_items(id) on delete restrict,
  source_type text not null,
  source_id uuid not null,
  qty_kg numeric(14,3) not null,
  occurred_on date not null,
  notes text,
  request_id uuid,
  recorded_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint rice_stock_source_chk check (
    source_type in ('PURCHASE','MILL_IN','MILL_OUT','SALE','ADJUST')
  ),
  constraint rice_stock_qty_nonzero_chk check (qty_kg <> 0),
  unique (source_type, source_id, item_id)
);

create table if not exists public.rice_sales (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  party_id uuid not null references public.rice_parties(id) on delete restrict,
  sale_number text not null,
  occurred_on date not null,
  dispatch_on date,
  dispatch_qty_kg numeric(14,3),
  total_amount numeric(14,2) not null,
  amount_paid numeric(14,2) not null default 0,
  payment_method text,
  payment_reference text,
  notes text,
  request_id uuid not null,
  recorded_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rice_sales_total_chk check (total_amount >= 0),
  constraint rice_sales_paid_chk check (amount_paid >= 0 and amount_paid <= total_amount),
  constraint rice_sales_method_chk check (
    payment_method is null or payment_method in ('CASH','MOBILE_MONEY','BANK','CREDIT')
  ),
  unique (business_unit_id, sale_number),
  unique (request_id)
);

create table if not exists public.rice_sale_lines (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  sale_id uuid not null references public.rice_sales(id) on delete cascade,
  item_id uuid not null references public.rice_items(id) on delete restrict,
  qty_kg numeric(14,3) not null,
  unit_price numeric(14,2) not null,
  line_total numeric(14,2) not null,
  created_at timestamptz not null default now(),
  constraint rice_sale_line_qty_chk check (qty_kg > 0),
  constraint rice_sale_line_price_chk check (unit_price >= 0),
  unique (sale_id, item_id)
);

create table if not exists public.rice_storage_accounts (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  party_id uuid not null references public.rice_parties(id) on delete restrict,
  account_number text not null,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_unit_id, party_id),
  unique (business_unit_id, account_number)
);

create table if not exists public.rice_storage_movements (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  account_id uuid not null references public.rice_storage_accounts(id) on delete restrict,
  movement_type text not null,
  occurred_on date not null,
  bags numeric(14,3),
  qty_kg numeric(14,3) not null,
  reference text,
  notes text,
  request_id uuid not null,
  recorded_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint rice_storage_type_chk check (movement_type in ('DEPOSIT','RELEASE')),
  constraint rice_storage_qty_chk check (qty_kg > 0),
  unique (request_id)
);

create table if not exists public.rice_service_income (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  account_id uuid references public.rice_storage_accounts(id) on delete restrict,
  party_id uuid references public.rice_parties(id) on delete restrict,
  income_number text not null,
  kind text not null,
  occurred_on date not null,
  amount numeric(14,2) not null,
  payment_method text,
  payment_reference text,
  notes text,
  request_id uuid not null,
  recorded_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint rice_service_kind_chk check (kind in ('STORAGE','MILLING','GRADING','HANDLING')),
  constraint rice_service_amount_chk check (amount > 0),
  constraint rice_service_method_chk check (
    payment_method is null or payment_method in ('CASH','MOBILE_MONEY','BANK','CREDIT')
  ),
  unique (business_unit_id, income_number),
  unique (request_id)
);

create table if not exists public.rice_expenses (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  expense_number text not null,
  kind text not null,
  occurred_on date not null,
  amount numeric(14,2) not null,
  payment_method text,
  payment_reference text,
  notes text,
  mill_batch_id uuid references public.rice_mill_batches(id) on delete restrict,
  request_id uuid not null,
  recorded_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint rice_expense_kind_chk check (kind in ('MILLING','OPERATING','UTILITIES','LABOUR','OTHER')),
  constraint rice_expense_amount_chk check (amount > 0),
  constraint rice_expense_method_chk check (
    payment_method is null or payment_method in ('CASH','MOBILE_MONEY','BANK')
  ),
  unique (business_unit_id, expense_number),
  unique (request_id)
);

create index if not exists rice_items_bu_idx on public.rice_items (business_unit_id, kind, sort_order);
create index if not exists rice_parties_bu_idx on public.rice_parties (business_unit_id, kind, name);
create index if not exists rice_purchases_bu_date_idx on public.rice_purchases (business_unit_id, occurred_on desc);
create index if not exists rice_stock_bu_item_idx on public.rice_stock_movements (business_unit_id, item_id, occurred_on);
create index if not exists rice_mill_bu_date_idx on public.rice_mill_batches (business_unit_id, produced_on desc);
create index if not exists rice_sales_bu_date_idx on public.rice_sales (business_unit_id, occurred_on desc);
create index if not exists rice_storage_move_idx on public.rice_storage_movements (business_unit_id, account_id, occurred_on);
create index if not exists rice_service_bu_date_idx on public.rice_service_income (business_unit_id, occurred_on desc);
create index if not exists rice_expenses_bu_date_idx on public.rice_expenses (business_unit_id, occurred_on desc);

drop trigger if exists rice_items_touch on public.rice_items;
create trigger rice_items_touch before update on public.rice_items
for each row execute function public.rice_touch_updated_at();

drop trigger if exists rice_parties_touch on public.rice_parties;
create trigger rice_parties_touch before update on public.rice_parties
for each row execute function public.rice_touch_updated_at();

drop trigger if exists rice_purchases_touch on public.rice_purchases;
create trigger rice_purchases_touch before update on public.rice_purchases
for each row execute function public.rice_touch_updated_at();

drop trigger if exists rice_mill_touch on public.rice_mill_batches;
create trigger rice_mill_touch before update on public.rice_mill_batches
for each row execute function public.rice_touch_updated_at();

drop trigger if exists rice_sales_touch on public.rice_sales;
create trigger rice_sales_touch before update on public.rice_sales
for each row execute function public.rice_touch_updated_at();

drop trigger if exists rice_storage_touch on public.rice_storage_accounts;
create trigger rice_storage_touch before update on public.rice_storage_accounts
for each row execute function public.rice_touch_updated_at();

create or replace view public.rice_v_stock
with (security_invoker = true) as
select
  m.business_unit_id,
  m.item_id,
  i.code,
  i.name,
  i.kind,
  i.sort_order,
  coalesce(sum(m.qty_kg) filter (where m.is_active), 0)::numeric(14,3) as qty_kg
from public.rice_stock_movements m
join public.rice_items i on i.id = m.item_id
group by m.business_unit_id, m.item_id, i.code, i.name, i.kind, i.sort_order;

create or replace view public.rice_v_storage_balances
with (security_invoker = true) as
select
  a.business_unit_id,
  a.id as account_id,
  a.account_number,
  a.party_id,
  p.name as party_name,
  p.phone,
  coalesce(sum(
    case
      when m.movement_type = 'DEPOSIT' and m.is_active then m.qty_kg
      when m.movement_type = 'RELEASE' and m.is_active then -m.qty_kg
      else 0
    end
  ), 0)::numeric(14,3) as qty_kg
from public.rice_storage_accounts a
join public.rice_parties p on p.id = a.party_id
left join public.rice_storage_movements m on m.account_id = a.id
group by a.business_unit_id, a.id, a.account_number, a.party_id, p.name, p.phone;

-- Catalog only (quantities remain zero until posted movements exist).
insert into public.rice_items (business_unit_id, code, name, kind, sort_order)
select bu.id, v.code, v.name, v.kind, v.sort_order
from public.business_units bu
cross join (
  values
    ('PADDY', 'Unprocessed paddy', 'PADDY', 10),
    ('GRADE_1', 'Grade 1 rice', 'RICE', 20),
    ('GRADE_2', 'Grade 2 rice', 'RICE', 30),
    ('BROKEN', 'Broken rice', 'BROKEN', 40),
    ('HUSK', 'Husks', 'BYPRODUCT', 50)
) as v(code, name, kind, sort_order)
where bu.code = 'rice'
on conflict (business_unit_id, code) do nothing;

alter table public.rice_document_counters enable row level security;
alter table public.rice_items enable row level security;
alter table public.rice_parties enable row level security;
alter table public.rice_purchases enable row level security;
alter table public.rice_mill_batches enable row level security;
alter table public.rice_mill_outputs enable row level security;
alter table public.rice_stock_movements enable row level security;
alter table public.rice_sales enable row level security;
alter table public.rice_sale_lines enable row level security;
alter table public.rice_storage_accounts enable row level security;
alter table public.rice_storage_movements enable row level security;
alter table public.rice_service_income enable row level security;
alter table public.rice_expenses enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'rice_document_counters',
    'rice_items',
    'rice_parties',
    'rice_purchases',
    'rice_mill_batches',
    'rice_mill_outputs',
    'rice_stock_movements',
    'rice_sales',
    'rice_sale_lines',
    'rice_storage_accounts',
    'rice_storage_movements',
    'rice_service_income',
    'rice_expenses'
  ]
  loop
    execute format(
      'drop policy if exists %I on public.%I; create policy %I on public.%I for all using (public.has_business_unit_access(business_unit_id)) with check (public.has_business_unit_access(business_unit_id));',
      t || '_all', t, t || '_all', t
    );
    execute format('grant select, insert, update on public.%I to authenticated;', t);
    execute format('grant all on public.%I to service_role;', t);
  end loop;
end;
$$;

grant select on public.rice_v_stock to authenticated, service_role;
grant select on public.rice_v_storage_balances to authenticated, service_role;
