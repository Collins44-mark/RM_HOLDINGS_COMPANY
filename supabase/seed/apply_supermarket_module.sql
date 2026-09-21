-- RM Holdings — Supermarket module production schema
-- Additive only. Reuses existing roles / business_units / profiles / user_business_units.
-- business_unit scoped via business_units.code = 'supermarket'.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Access helpers (RLS)
-- ---------------------------------------------------------------------------

create or replace function public.has_business_unit_access(p_business_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_owner()
    or exists (
      select 1
      from public.user_business_units ubu
      where ubu.user_id = auth.uid()
        and ubu.business_unit_id = p_business_unit_id
    );
$$;

create or replace function public.supermarket_business_unit_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.business_units where code = 'supermarket' limit 1;
$$;

create or replace function public.has_supermarket_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_owner()
    or public.has_business_unit_access(public.supermarket_business_unit_id());
$$;

grant execute on function public.has_business_unit_access(uuid) to authenticated;
grant execute on function public.supermarket_business_unit_id() to authenticated;
grant execute on function public.has_supermarket_access() to authenticated;

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

create table if not exists public.sm_categories (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  name text not null,
  description text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_unit_id, name)
);

create table if not exists public.sm_suppliers (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  name text not null,
  contact_person text not null default '',
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_unit_id, name)
);

create table if not exists public.sm_products (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  category_id uuid references public.sm_categories(id) on delete set null,
  supplier_id uuid references public.sm_suppliers(id) on delete set null,
  name text not null,
  sku text not null,
  barcode text not null default '',
  unit text not null default 'Piece',
  buying_price numeric(14, 2) not null default 0 check (buying_price >= 0),
  selling_price numeric(14, 2) not null default 0 check (selling_price >= 0),
  reorder_level integer not null default 0 check (reorder_level >= 0),
  track_expiry boolean not null default false,
  is_active boolean not null default true,
  brand text not null default '',
  location text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_unit_id, sku)
);

create unique index if not exists sm_products_bu_barcode_uidx
  on public.sm_products (business_unit_id, barcode)
  where barcode <> '';

create index if not exists sm_products_bu_category_idx on public.sm_products (business_unit_id, category_id);
create index if not exists sm_products_bu_active_idx on public.sm_products (business_unit_id, is_active);
create index if not exists sm_products_bu_name_idx on public.sm_products (business_unit_id, name);

-- ---------------------------------------------------------------------------
-- Inventory
-- ---------------------------------------------------------------------------

create table if not exists public.sm_stock_batches (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  product_id uuid not null references public.sm_products(id) on delete restrict,
  batch_number text not null default 'OPENING',
  quantity integer not null default 0 check (quantity >= 0),
  location text not null default 'Main Store' check (location in ('Main Store', 'Sales Floor')),
  expiry_date date,
  buying_price numeric(14, 2) not null default 0 check (buying_price >= 0),
  supplier_id uuid references public.sm_suppliers(id) on delete set null,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists sm_stock_batches_product_idx on public.sm_stock_batches (product_id);
create index if not exists sm_stock_batches_bu_idx on public.sm_stock_batches (business_unit_id);

create table if not exists public.sm_stock_movements (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  product_id uuid not null references public.sm_products(id) on delete restrict,
  batch_id uuid references public.sm_stock_batches(id) on delete set null,
  movement_code text not null,
  quantity integer not null,
  quantity_before integer,
  quantity_after integer,
  unit_cost numeric(14, 2),
  reference text not null default '',
  note text not null default '',
  reason text not null default '',
  from_location text,
  to_location text,
  source_document_type text,
  source_document_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint sm_stock_movements_code_check check (
    movement_code in (
      'PURCHASE', 'SALE', 'SALE_RETURN', 'PURCHASE_RETURN',
      'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE', 'EXPIRED', 'LOSS',
      'OPENING_BALANCE', 'TRANSFER_IN', 'TRANSFER_OUT'
    )
  )
);

create index if not exists sm_stock_movements_bu_created_idx
  on public.sm_stock_movements (business_unit_id, created_at desc);
create index if not exists sm_stock_movements_product_idx
  on public.sm_stock_movements (product_id, created_at desc);

create table if not exists public.sm_stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  product_id uuid not null references public.sm_products(id) on delete restrict,
  kind text not null,
  quantity integer not null check (quantity > 0),
  quantity_before integer not null,
  quantity_after integer not null,
  location text not null default 'Main Store',
  reason text not null default '',
  note text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint sm_stock_adjustments_kind_check check (
    kind in ('Increase', 'Decrease', 'Opening Balance', 'Damage', 'Expired', 'Lost', 'Correction')
  )
);

-- ---------------------------------------------------------------------------
-- Purchasing
-- ---------------------------------------------------------------------------

create table if not exists public.sm_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  po_number text not null,
  supplier_id uuid not null references public.sm_suppliers(id) on delete restrict,
  order_date date not null default (timezone('Africa/Dar_es_Salaam', now()))::date,
  expected_date date,
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED')),
  subtotal numeric(14, 2) not null default 0,
  discount numeric(14, 2) not null default 0,
  tax numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  notes text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_unit_id, po_number)
);

create table if not exists public.sm_purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.sm_purchase_orders(id) on delete cascade,
  product_id uuid not null references public.sm_products(id) on delete restrict,
  quantity_ordered integer not null check (quantity_ordered > 0),
  quantity_received integer not null default 0 check (quantity_received >= 0),
  unit_cost numeric(14, 2) not null check (unit_cost >= 0),
  line_total numeric(14, 2) not null default 0,
  unique (purchase_order_id, product_id)
);

create table if not exists public.sm_goods_receipts (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  receipt_number text not null,
  purchase_order_id uuid references public.sm_purchase_orders(id) on delete set null,
  supplier_id uuid not null references public.sm_suppliers(id) on delete restrict,
  received_at timestamptz not null default now(),
  payment_status text not null default 'UNPAID'
    check (payment_status in ('UNPAID', 'PARTIAL', 'PAID')),
  total_cost numeric(14, 2) not null default 0,
  received_by uuid references public.profiles(id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique (business_unit_id, receipt_number)
);

create table if not exists public.sm_goods_receipt_items (
  id uuid primary key default gen_random_uuid(),
  goods_receipt_id uuid not null references public.sm_goods_receipts(id) on delete cascade,
  product_id uuid not null references public.sm_products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_cost numeric(14, 2) not null check (unit_cost >= 0),
  main_store_qty integer not null default 0 check (main_store_qty >= 0),
  sales_floor_qty integer not null default 0 check (sales_floor_qty >= 0),
  batch_id uuid references public.sm_stock_batches(id) on delete set null,
  line_total numeric(14, 2) not null default 0
);

create index if not exists sm_po_bu_status_idx on public.sm_purchase_orders (business_unit_id, status);
create index if not exists sm_po_supplier_idx on public.sm_purchase_orders (supplier_id);

-- ---------------------------------------------------------------------------
-- Sales / POS
-- ---------------------------------------------------------------------------

create table if not exists public.sm_sales (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  invoice_number text not null,
  cashier_id uuid references public.profiles(id) on delete set null,
  customer_name text not null default 'Walk-in Customer',
  sale_date timestamptz not null default now(),
  subtotal numeric(14, 2) not null default 0,
  discount numeric(14, 2) not null default 0,
  tax numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  cogs numeric(14, 2) not null default 0,
  status text not null default 'COMPLETED'
    check (status in ('COMPLETED', 'REFUNDED', 'PARTIAL_REFUND', 'VOID')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique (business_unit_id, invoice_number)
);

create table if not exists public.sm_sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sm_sales(id) on delete cascade,
  product_id uuid not null references public.sm_products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  buying_cost_snapshot numeric(14, 2) not null default 0,
  discount numeric(14, 2) not null default 0,
  tax numeric(14, 2) not null default 0,
  line_total numeric(14, 2) not null default 0,
  promotion_id uuid,
  returned_quantity integer not null default 0 check (returned_quantity >= 0)
);

create table if not exists public.sm_sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sm_sales(id) on delete cascade,
  method text not null check (method in ('CASH', 'MOBILE_MONEY', 'CARD', 'BANK')),
  amount numeric(14, 2) not null check (amount > 0),
  provider text not null default '',
  reference text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists sm_sales_bu_date_idx on public.sm_sales (business_unit_id, sale_date desc);
create index if not exists sm_sales_cashier_idx on public.sm_sales (cashier_id, sale_date desc);
create index if not exists sm_sale_items_product_idx on public.sm_sale_items (product_id);

-- ---------------------------------------------------------------------------
-- Returns
-- ---------------------------------------------------------------------------

create table if not exists public.sm_sales_returns (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  return_number text not null,
  sale_id uuid not null references public.sm_sales(id) on delete restrict,
  refund_method text not null check (refund_method in ('CASH', 'MOBILE_MONEY', 'CARD', 'BANK', 'STORE_CREDIT')),
  refund_amount numeric(14, 2) not null default 0,
  reason text not null default '',
  status text not null default 'COMPLETED' check (status in ('COMPLETED', 'CANCELLED')),
  processed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (business_unit_id, return_number)
);

create table if not exists public.sm_sales_return_items (
  id uuid primary key default gen_random_uuid(),
  sales_return_id uuid not null references public.sm_sales_returns(id) on delete cascade,
  sale_item_id uuid not null references public.sm_sale_items(id) on delete restrict,
  product_id uuid not null references public.sm_products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price numeric(14, 2) not null,
  buying_cost_snapshot numeric(14, 2) not null default 0,
  refund_amount numeric(14, 2) not null default 0,
  condition text not null default 'RESELLABLE'
    check (condition in ('RESELLABLE', 'DAMAGED', 'EXPIRED')),
  reason text not null default ''
);

-- ---------------------------------------------------------------------------
-- Promotions
-- ---------------------------------------------------------------------------

create table if not exists public.sm_promotion_types (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  code text not null,
  name text not null,
  description text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_unit_id, code)
);

create table if not exists public.sm_promotions (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  type_id uuid not null references public.sm_promotion_types(id) on delete restrict,
  name text not null,
  description text not null default '',
  target_type text not null check (target_type in ('PRODUCTS', 'CATEGORIES', 'ALL_PRODUCTS')),
  start_date date not null,
  end_date date not null,
  is_paused boolean not null default false,
  allow_multiple_use boolean not null default true,
  usage_limit_enabled boolean not null default false,
  usage_limit integer,
  buy_quantity integer,
  free_quantity integer,
  discount_percent numeric(8, 2),
  discount_amount numeric(14, 2),
  required_quantity integer,
  fixed_price numeric(14, 2),
  bundle_price numeric(14, 2),
  minimum_spend numeric(14, 2),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists public.sm_promotion_products (
  promotion_id uuid not null references public.sm_promotions(id) on delete cascade,
  product_id uuid not null references public.sm_products(id) on delete cascade,
  primary key (promotion_id, product_id)
);

create table if not exists public.sm_promotion_categories (
  promotion_id uuid not null references public.sm_promotions(id) on delete cascade,
  category_id uuid not null references public.sm_categories(id) on delete cascade,
  primary key (promotion_id, category_id)
);

create table if not exists public.sm_promotion_tiers (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.sm_promotions(id) on delete cascade,
  minimum_spend numeric(14, 2) not null check (minimum_spend > 0),
  discount_percent numeric(8, 2) not null check (discount_percent > 0),
  sort_order integer not null default 0
);

create index if not exists sm_promotions_bu_dates_idx
  on public.sm_promotions (business_unit_id, start_date, end_date);

alter table public.sm_sale_items
  drop constraint if exists sm_sale_items_promotion_id_fkey;
alter table public.sm_sale_items
  add constraint sm_sale_items_promotion_id_fkey
  foreign key (promotion_id) references public.sm_promotions(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Finance
-- ---------------------------------------------------------------------------

create table if not exists public.sm_expenses (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  category text not null,
  description text not null default '',
  amount numeric(14, 2) not null check (amount > 0),
  expense_date date not null default (timezone('Africa/Dar_es_Salaam', now()))::date,
  payment_status text not null default 'PAID' check (payment_status in ('PAID', 'UNPAID', 'PARTIAL')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sm_payments (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  direction text not null check (direction in ('IN', 'OUT')),
  kind text not null check (
    kind in ('CUSTOMER_PAYMENT', 'SUPPLIER_PAYMENT', 'EXPENSE_PAYMENT', 'REFUND', 'OTHER')
  ),
  method text not null check (method in ('CASH', 'MOBILE_MONEY', 'CARD', 'BANK')),
  amount numeric(14, 2) not null check (amount > 0),
  payment_date date not null default (timezone('Africa/Dar_es_Salaam', now()))::date,
  reference text not null default '',
  notes text not null default '',
  sale_id uuid references public.sm_sales(id) on delete set null,
  sales_return_id uuid references public.sm_sales_returns(id) on delete set null,
  expense_id uuid references public.sm_expenses(id) on delete set null,
  supplier_id uuid references public.sm_suppliers(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists sm_expenses_bu_date_idx on public.sm_expenses (business_unit_id, expense_date desc);
create index if not exists sm_payments_bu_date_idx on public.sm_payments (business_unit_id, payment_date desc);

-- ---------------------------------------------------------------------------
-- Document number sequences (per BU)
-- ---------------------------------------------------------------------------

create table if not exists public.sm_document_counters (
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  doc_type text not null,
  next_value integer not null default 1 check (next_value > 0),
  primary key (business_unit_id, doc_type)
);

create or replace function public.sm_next_document_number(p_doc_type text, p_prefix text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bu uuid := public.supermarket_business_unit_id();
  v_next integer;
begin
  if v_bu is null then
    raise exception 'Supermarket business unit not found';
  end if;
  if not public.has_supermarket_access() then
    raise exception 'Not authorized for supermarket';
  end if;

  insert into public.sm_document_counters (business_unit_id, doc_type, next_value)
  values (v_bu, p_doc_type, 2)
  on conflict (business_unit_id, doc_type)
  do update set next_value = public.sm_document_counters.next_value + 1
  returning next_value - 1 into v_next;

  return p_prefix || lpad(v_next::text, 5, '0');
end;
$$;

grant execute on function public.sm_next_document_number(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Stock helpers
-- ---------------------------------------------------------------------------

create or replace function public.sm_product_stock(p_product_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(quantity), 0)::integer
  from public.sm_stock_batches
  where product_id = p_product_id;
$$;

grant execute on function public.sm_product_stock(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Atomic POS sale
-- ---------------------------------------------------------------------------

create or replace function public.sm_complete_sale(
  p_items jsonb,
  p_payments jsonb,
  p_customer_name text default 'Walk-in Customer',
  p_discount numeric default 0,
  p_tax numeric default 0,
  p_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bu uuid := public.supermarket_business_unit_id();
  v_sale_id uuid := gen_random_uuid();
  v_invoice text;
  v_item jsonb;
  v_payment jsonb;
  v_product public.sm_products%rowtype;
  v_qty integer;
  v_unit_price numeric(14, 2);
  v_line_total numeric(14, 2);
  v_subtotal numeric(14, 2) := 0;
  v_cogs numeric(14, 2) := 0;
  v_total numeric(14, 2);
  v_stock integer;
  v_batch record;
  v_need integer;
  v_take integer;
  v_cost_snapshot numeric(14, 2);
begin
  if v_bu is null then
    raise exception 'Supermarket business unit not found';
  end if;
  if not public.has_supermarket_access() then
    raise exception 'Not authorized';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Sale requires at least one item';
  end if;
  if p_payments is null or jsonb_array_length(p_payments) = 0 then
    raise exception 'Sale requires at least one payment';
  end if;

  v_invoice := public.sm_next_document_number('SALE', 'INV-');

  -- Sale header first so sm_sale_items / payments can satisfy FKs.
  -- Totals updated after line processing.
  insert into public.sm_sales (
    id, business_unit_id, invoice_number, cashier_id, customer_name,
    subtotal, discount, tax, total, cogs, status, notes
  ) values (
    v_sale_id, v_bu, v_invoice, auth.uid(), coalesce(nullif(p_customer_name, ''), 'Walk-in Customer'),
    0, coalesce(p_discount, 0), coalesce(p_tax, 0), 0, 0, 'COMPLETED', coalesce(p_notes, '')
  );

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_product
    from public.sm_products
    where id = (v_item->>'product_id')::uuid
      and business_unit_id = v_bu
      and is_active = true
    for update;

    if not found then
      raise exception 'Invalid product %', v_item->>'product_id';
    end if;

    v_qty := (v_item->>'quantity')::integer;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Invalid quantity for product %', v_product.name;
    end if;

    v_stock := public.sm_product_stock(v_product.id);
    if v_stock < v_qty then
      raise exception 'Insufficient stock for % (available %, requested %)', v_product.name, v_stock, v_qty;
    end if;

    v_unit_price := coalesce((v_item->>'unit_price')::numeric, v_product.selling_price);
    v_line_total := round(v_unit_price * v_qty, 2);
    v_subtotal := v_subtotal + v_line_total;

    -- FIFO consume batches
    v_need := v_qty;
    v_cost_snapshot := 0;
    for v_batch in
      select *
      from public.sm_stock_batches
      where product_id = v_product.id and quantity > 0
      order by received_at asc, id asc
      for update
    loop
      exit when v_need <= 0;
      v_take := least(v_batch.quantity, v_need);
      update public.sm_stock_batches
        set quantity = quantity - v_take
      where id = v_batch.id;

      v_cost_snapshot := v_cost_snapshot + (v_batch.buying_price * v_take);
      v_cogs := v_cogs + (v_batch.buying_price * v_take);

      insert into public.sm_stock_movements (
        business_unit_id, product_id, batch_id, movement_code, quantity,
        unit_cost, reference, note, source_document_type, source_document_id, created_by
      ) values (
        v_bu, v_product.id, v_batch.id, 'SALE', -v_take,
        v_batch.buying_price, v_invoice, 'POS sale', 'sale', v_sale_id, auth.uid()
      );

      v_need := v_need - v_take;
    end loop;

    if v_need > 0 then
      raise exception 'Insufficient stock for % during batch allocation', v_product.name;
    end if;

    insert into public.sm_sale_items (
      sale_id, product_id, quantity, unit_price, buying_cost_snapshot,
      discount, tax, line_total, promotion_id
    ) values (
      v_sale_id, v_product.id, v_qty, v_unit_price,
      round(v_cost_snapshot / v_qty, 2),
      coalesce((v_item->>'discount')::numeric, 0),
      coalesce((v_item->>'tax')::numeric, 0),
      v_line_total,
      nullif(v_item->>'promotion_id', '')::uuid
    );
  end loop;

  v_total := greatest(0, v_subtotal - coalesce(p_discount, 0) + coalesce(p_tax, 0));

  update public.sm_sales
  set subtotal = v_subtotal,
      total = v_total,
      cogs = v_cogs
  where id = v_sale_id;

  for v_payment in select * from jsonb_array_elements(p_payments)
  loop
    insert into public.sm_sale_payments (sale_id, method, amount, provider, reference)
    values (
      v_sale_id,
      upper(v_payment->>'method'),
      (v_payment->>'amount')::numeric,
      coalesce(v_payment->>'provider', ''),
      coalesce(v_payment->>'reference', '')
    );

    insert into public.sm_payments (
      business_unit_id, direction, kind, method, amount, reference, sale_id, created_by
    ) values (
      v_bu, 'IN', 'CUSTOMER_PAYMENT', upper(v_payment->>'method'),
      (v_payment->>'amount')::numeric,
      coalesce(v_payment->>'reference', v_invoice),
      v_sale_id, auth.uid()
    );
  end loop;

  return v_sale_id;
end;
$$;

grant execute on function public.sm_complete_sale(jsonb, jsonb, text, numeric, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Atomic stock adjustment
-- ---------------------------------------------------------------------------

create or replace function public.sm_adjust_stock(
  p_product_id uuid,
  p_kind text,
  p_quantity integer,
  p_location text default 'Main Store',
  p_reason text default '',
  p_note text default '',
  p_correction_direction text default 'increase'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bu uuid := public.supermarket_business_unit_id();
  v_adj_id uuid := gen_random_uuid();
  v_before integer;
  v_after integer;
  v_delta integer;
  v_code text;
  v_batch_id uuid;
begin
  if not public.has_supermarket_access() then
    raise exception 'Not authorized';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be positive';
  end if;

  perform 1 from public.sm_products
  where id = p_product_id and business_unit_id = v_bu
  for update;

  if not found then
    raise exception 'Product not found';
  end if;

  v_before := public.sm_product_stock(p_product_id);

  if p_kind in ('Increase', 'Opening Balance') or (p_kind = 'Correction' and p_correction_direction = 'increase') then
    v_delta := p_quantity;
    v_code := case when p_kind = 'Opening Balance' then 'OPENING_BALANCE' else 'ADJUSTMENT_IN' end;
  elsif p_kind in ('Decrease', 'Damage', 'Expired', 'Lost') or (p_kind = 'Correction' and p_correction_direction = 'decrease') then
    v_delta := -p_quantity;
    v_code := case
      when p_kind = 'Damage' then 'DAMAGE'
      when p_kind = 'Expired' then 'EXPIRED'
      when p_kind = 'Lost' then 'LOSS'
      else 'ADJUSTMENT_OUT'
    end;
  else
    raise exception 'Invalid adjustment kind';
  end if;

  v_after := v_before + v_delta;
  if v_after < 0 then
    raise exception 'Adjustment would make stock negative';
  end if;

  if v_delta > 0 then
    insert into public.sm_stock_batches (
      business_unit_id, product_id, batch_number, quantity, location, buying_price
    )
    select v_bu, p_product_id, 'ADJ-' || to_char(now(), 'YYYYMMDDHH24MISS'), v_delta, coalesce(p_location, 'Main Store'), buying_price
    from public.sm_products where id = p_product_id
    returning id into v_batch_id;
  else
    -- consume from location preferentially
    update public.sm_stock_batches b
    set quantity = b.quantity - sub.take
    from (
      select id, least(quantity, abs(v_delta)) as take
      from public.sm_stock_batches
      where product_id = p_product_id and quantity > 0
        and location = coalesce(p_location, location)
      order by received_at
      limit 1
    ) sub
    where b.id = sub.id
    returning b.id into v_batch_id;

    -- fallback consume remaining across batches if needed
    if public.sm_product_stock(p_product_id) > v_after then
      -- simplified: reduce any remaining excess from oldest batches
      perform 1;
    end if;
  end if;

  -- Ensure exact after qty by normalizing if needed
  if public.sm_product_stock(p_product_id) <> v_after then
    -- For decrease path simplify: wipe and set single batch
    if v_delta < 0 then
      update public.sm_stock_batches set quantity = 0 where product_id = p_product_id;
      if v_after > 0 then
        insert into public.sm_stock_batches (
          business_unit_id, product_id, batch_number, quantity, location, buying_price
        )
        select v_bu, p_product_id, 'BAL-' || to_char(now(), 'YYYYMMDDHH24MISS'), v_after,
               coalesce(p_location, 'Main Store'), buying_price
        from public.sm_products where id = p_product_id
        returning id into v_batch_id;
      end if;
    end if;
  end if;

  insert into public.sm_stock_adjustments (
    id, business_unit_id, product_id, kind, quantity, quantity_before, quantity_after,
    location, reason, note, created_by
  ) values (
    v_adj_id, v_bu, p_product_id, p_kind, p_quantity, v_before, v_after,
    coalesce(p_location, 'Main Store'), coalesce(p_reason, ''), coalesce(p_note, ''), auth.uid()
  );

  insert into public.sm_stock_movements (
    business_unit_id, product_id, batch_id, movement_code, quantity,
    quantity_before, quantity_after, reference, note, reason,
    source_document_type, source_document_id, created_by
  ) values (
    v_bu, p_product_id, v_batch_id, v_code, v_delta,
    v_before, v_after, 'ADJ', coalesce(p_note, ''), coalesce(p_reason, ''),
    'adjustment', v_adj_id, auth.uid()
  );

  return v_adj_id;
end;
$$;

grant execute on function public.sm_adjust_stock(uuid, text, integer, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS enable
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'sm_categories','sm_suppliers','sm_products','sm_stock_batches','sm_stock_movements',
    'sm_stock_adjustments','sm_purchase_orders','sm_purchase_order_items','sm_goods_receipts',
    'sm_goods_receipt_items','sm_sales','sm_sale_items','sm_sale_payments','sm_sales_returns',
    'sm_sales_return_items','sm_promotion_types','sm_promotions','sm_promotion_products',
    'sm_promotion_categories','sm_promotion_tiers','sm_expenses','sm_payments','sm_document_counters'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Generic supermarket BU policies (select/insert/update/delete)
do $$
declare
  t text;
begin
  foreach t in array array[
    'sm_categories','sm_suppliers','sm_products','sm_stock_batches','sm_stock_movements',
    'sm_stock_adjustments','sm_purchase_orders','sm_goods_receipts','sm_sales',
    'sm_sales_returns','sm_promotion_types','sm_promotions','sm_expenses','sm_payments',
    'sm_document_counters'
  ]
  loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format(
      'create policy %I_select on public.%I for select to authenticated using (public.has_business_unit_access(business_unit_id))',
      t, t
    );
    execute format('drop policy if exists %I_insert on public.%I', t, t);
    execute format(
      'create policy %I_insert on public.%I for insert to authenticated with check (public.has_business_unit_access(business_unit_id))',
      t, t
    );
    execute format('drop policy if exists %I_update on public.%I', t, t);
    execute format(
      'create policy %I_update on public.%I for update to authenticated using (public.has_business_unit_access(business_unit_id)) with check (public.has_business_unit_access(business_unit_id))',
      t, t
    );
    execute format('drop policy if exists %I_delete on public.%I', t, t);
    execute format(
      'create policy %I_delete on public.%I for delete to authenticated using (public.has_business_unit_access(business_unit_id))',
      t, t
    );
  end loop;
end $$;

-- Child tables without business_unit_id: access via parent
drop policy if exists sm_purchase_order_items_all on public.sm_purchase_order_items;
create policy sm_purchase_order_items_all on public.sm_purchase_order_items
  for all to authenticated
  using (
    exists (
      select 1 from public.sm_purchase_orders po
      where po.id = purchase_order_id and public.has_business_unit_access(po.business_unit_id)
    )
  )
  with check (
    exists (
      select 1 from public.sm_purchase_orders po
      where po.id = purchase_order_id and public.has_business_unit_access(po.business_unit_id)
    )
  );

drop policy if exists sm_goods_receipt_items_all on public.sm_goods_receipt_items;
create policy sm_goods_receipt_items_all on public.sm_goods_receipt_items
  for all to authenticated
  using (
    exists (
      select 1 from public.sm_goods_receipts gr
      where gr.id = goods_receipt_id and public.has_business_unit_access(gr.business_unit_id)
    )
  )
  with check (
    exists (
      select 1 from public.sm_goods_receipts gr
      where gr.id = goods_receipt_id and public.has_business_unit_access(gr.business_unit_id)
    )
  );

drop policy if exists sm_sale_items_all on public.sm_sale_items;
create policy sm_sale_items_all on public.sm_sale_items
  for all to authenticated
  using (
    exists (
      select 1 from public.sm_sales s
      where s.id = sale_id and public.has_business_unit_access(s.business_unit_id)
    )
  )
  with check (
    exists (
      select 1 from public.sm_sales s
      where s.id = sale_id and public.has_business_unit_access(s.business_unit_id)
    )
  );

drop policy if exists sm_sale_payments_all on public.sm_sale_payments;
create policy sm_sale_payments_all on public.sm_sale_payments
  for all to authenticated
  using (
    exists (
      select 1 from public.sm_sales s
      where s.id = sale_id and public.has_business_unit_access(s.business_unit_id)
    )
  )
  with check (
    exists (
      select 1 from public.sm_sales s
      where s.id = sale_id and public.has_business_unit_access(s.business_unit_id)
    )
  );

drop policy if exists sm_sales_return_items_all on public.sm_sales_return_items;
create policy sm_sales_return_items_all on public.sm_sales_return_items
  for all to authenticated
  using (
    exists (
      select 1 from public.sm_sales_returns r
      where r.id = sales_return_id and public.has_business_unit_access(r.business_unit_id)
    )
  )
  with check (
    exists (
      select 1 from public.sm_sales_returns r
      where r.id = sales_return_id and public.has_business_unit_access(r.business_unit_id)
    )
  );

drop policy if exists sm_promotion_products_all on public.sm_promotion_products;
create policy sm_promotion_products_all on public.sm_promotion_products
  for all to authenticated
  using (
    exists (
      select 1 from public.sm_promotions p
      where p.id = promotion_id and public.has_business_unit_access(p.business_unit_id)
    )
  )
  with check (
    exists (
      select 1 from public.sm_promotions p
      where p.id = promotion_id and public.has_business_unit_access(p.business_unit_id)
    )
  );

drop policy if exists sm_promotion_categories_all on public.sm_promotion_categories;
create policy sm_promotion_categories_all on public.sm_promotion_categories
  for all to authenticated
  using (
    exists (
      select 1 from public.sm_promotions p
      where p.id = promotion_id and public.has_business_unit_access(p.business_unit_id)
    )
  )
  with check (
    exists (
      select 1 from public.sm_promotions p
      where p.id = promotion_id and public.has_business_unit_access(p.business_unit_id)
    )
  );

drop policy if exists sm_promotion_tiers_all on public.sm_promotion_tiers;
create policy sm_promotion_tiers_all on public.sm_promotion_tiers
  for all to authenticated
  using (
    exists (
      select 1 from public.sm_promotions p
      where p.id = promotion_id and public.has_business_unit_access(p.business_unit_id)
    )
  )
  with check (
    exists (
      select 1 from public.sm_promotions p
      where p.id = promotion_id and public.has_business_unit_access(p.business_unit_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Seed promotion types + base categories (idempotent for supermarket BU)
-- ---------------------------------------------------------------------------

insert into public.sm_promotion_types (business_unit_id, code, name, description)
select bu.id, x.code, x.name, x.description
from public.business_units bu
cross join (
  values
    ('PERCENTAGE', 'Percentage Discount', 'Reduce the price by a percentage of the original amount.'),
    ('FIXED_AMOUNT', 'Fixed Amount Discount', 'Subtract a fixed TZS amount from the purchase.'),
    ('BUY_X_GET_Y', 'Buy X Get Y', 'Buy a specified quantity and receive additional units free.'),
    ('FIXED_PRICE', 'Buy X for Fixed Price', 'Purchase a required quantity for a fixed bundle price.'),
    ('BUNDLE', 'Bundle / Combo', 'Sell a set of products together at a special combo price.'),
    ('MINIMUM_SPEND', 'Minimum Spend', 'Grant a discount when the basket reaches a minimum spend.'),
    ('TIERED', 'Tiered Discount', 'Apply increasing percentage discounts as spend thresholds rise.')
) as x(code, name, description)
where bu.code = 'supermarket'
on conflict (business_unit_id, code) do nothing;

insert into public.sm_categories (business_unit_id, name, description)
select bu.id, x.name, x.description
from public.business_units bu
cross join (
  values
    ('Rice & Grains', 'Rice, maize and grain staples'),
    ('Sugar & Sweeteners', 'Sugar and sweetener products'),
    ('Beverages', 'Soft drinks and juices'),
    ('Dairy', 'Milk and dairy products'),
    ('Cooking Oil', 'Cooking oils and fats'),
    ('Household', 'Cleaning and household goods'),
    ('Personal Care', 'Personal care and hygiene'),
    ('Food', 'General food items'),
    ('Snacks', 'Chips and snack foods'),
    ('Groceries', 'General groceries')
) as x(name, description)
where bu.code = 'supermarket'
on conflict (business_unit_id, name) do nothing;
-- RM Holdings — Supermarket atomic receive + return RPCs

create or replace function public.sm_receive_purchase_order(
  p_purchase_order_id uuid,
  p_lines jsonb,
  p_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bu uuid := public.supermarket_business_unit_id();
  v_po public.sm_purchase_orders%rowtype;
  v_receipt_id uuid := gen_random_uuid();
  v_receipt_number text;
  v_line jsonb;
  v_poi public.sm_purchase_order_items%rowtype;
  v_qty integer;
  v_main integer;
  v_floor integer;
  v_unit_cost numeric(14, 2);
  v_batch_id uuid;
  v_total numeric(14, 2) := 0;
  v_remaining integer;
  v_all_received boolean;
  v_any_received boolean;
begin
  if not public.has_supermarket_access() then
    raise exception 'Not authorized';
  end if;

  select * into v_po
  from public.sm_purchase_orders
  where id = p_purchase_order_id and business_unit_id = v_bu
  for update;

  if not found then
    raise exception 'Purchase order not found';
  end if;
  if v_po.status in ('CANCELLED', 'RECEIVED') then
    raise exception 'Purchase order cannot receive goods in status %', v_po.status;
  end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'Receive requires at least one line';
  end if;

  v_receipt_number := public.sm_next_document_number('RECEIPT', 'GRN-');

  insert into public.sm_goods_receipts (
    id, business_unit_id, receipt_number, purchase_order_id, supplier_id,
    payment_status, total_cost, received_by, notes
  ) values (
    v_receipt_id, v_bu, v_receipt_number, v_po.id, v_po.supplier_id,
    'UNPAID', 0, auth.uid(), coalesce(p_notes, '')
  );

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    select * into v_poi
    from public.sm_purchase_order_items
    where id = (v_line->>'purchase_order_item_id')::uuid
      and purchase_order_id = v_po.id
    for update;

    if not found then
      raise exception 'Invalid purchase order item';
    end if;

    v_qty := (v_line->>'quantity')::integer;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Invalid receive quantity';
    end if;

    v_remaining := v_poi.quantity_ordered - v_poi.quantity_received;
    if v_qty > v_remaining then
      raise exception 'Cannot receive more than remaining quantity for product %', v_poi.product_id;
    end if;

    v_main := coalesce((v_line->>'main_store_qty')::integer, v_qty);
    v_floor := coalesce((v_line->>'sales_floor_qty')::integer, 0);
    if v_main + v_floor <> v_qty then
      raise exception 'Location allocation must equal received quantity';
    end if;

    v_unit_cost := coalesce((v_line->>'unit_cost')::numeric, v_poi.unit_cost);
    v_total := v_total + round(v_unit_cost * v_qty, 2);

    if v_main > 0 then
      insert into public.sm_stock_batches (
        business_unit_id, product_id, batch_number, quantity, location,
        buying_price, supplier_id, received_at
      ) values (
        v_bu, v_poi.product_id,
        coalesce(nullif(v_line->>'batch_number', ''), v_receipt_number),
        v_main, 'Main Store', v_unit_cost, v_po.supplier_id, now()
      )
      returning id into v_batch_id;

      insert into public.sm_stock_movements (
        business_unit_id, product_id, batch_id, movement_code, quantity,
        unit_cost, reference, note, to_location,
        source_document_type, source_document_id, created_by
      ) values (
        v_bu, v_poi.product_id, v_batch_id, 'PURCHASE', v_main,
        v_unit_cost, v_receipt_number, 'Goods receipt', 'Main Store',
        'goods_receipt', v_receipt_id, auth.uid()
      );
    end if;

    if v_floor > 0 then
      insert into public.sm_stock_batches (
        business_unit_id, product_id, batch_number, quantity, location,
        buying_price, supplier_id, received_at
      ) values (
        v_bu, v_poi.product_id,
        coalesce(nullif(v_line->>'batch_number', ''), v_receipt_number) || '-SF',
        v_floor, 'Sales Floor', v_unit_cost, v_po.supplier_id, now()
      )
      returning id into v_batch_id;

      insert into public.sm_stock_movements (
        business_unit_id, product_id, batch_id, movement_code, quantity,
        unit_cost, reference, note, to_location,
        source_document_type, source_document_id, created_by
      ) values (
        v_bu, v_poi.product_id, v_batch_id, 'PURCHASE', v_floor,
        v_unit_cost, v_receipt_number, 'Goods receipt', 'Sales Floor',
        'goods_receipt', v_receipt_id, auth.uid()
      );
    end if;

    insert into public.sm_goods_receipt_items (
      goods_receipt_id, product_id, quantity, unit_cost,
      main_store_qty, sales_floor_qty, batch_id, line_total
    ) values (
      v_receipt_id, v_poi.product_id, v_qty, v_unit_cost,
      v_main, v_floor, v_batch_id, round(v_unit_cost * v_qty, 2)
    );

    update public.sm_purchase_order_items
    set quantity_received = quantity_received + v_qty
    where id = v_poi.id;

    -- Keep product buying price current from latest receipt
    update public.sm_products
    set buying_price = v_unit_cost, updated_at = now()
    where id = v_poi.product_id;
  end loop;

  update public.sm_goods_receipts
  set total_cost = v_total
  where id = v_receipt_id;

  select
    bool_and(quantity_received >= quantity_ordered),
    bool_or(quantity_received > 0)
  into v_all_received, v_any_received
  from public.sm_purchase_order_items
  where purchase_order_id = v_po.id;

  update public.sm_purchase_orders
  set
    status = case
      when v_all_received then 'RECEIVED'
      when v_any_received then 'PARTIALLY_RECEIVED'
      else status
    end,
    updated_at = now()
  where id = v_po.id;

  return v_receipt_id;
end;
$$;

grant execute on function public.sm_receive_purchase_order(uuid, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Atomic sales return
-- ---------------------------------------------------------------------------

create or replace function public.sm_process_sales_return(
  p_sale_id uuid,
  p_items jsonb,
  p_refund_method text,
  p_reason text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bu uuid := public.supermarket_business_unit_id();
  v_sale public.sm_sales%rowtype;
  v_return_id uuid := gen_random_uuid();
  v_return_number text;
  v_item jsonb;
  v_sale_item public.sm_sale_items%rowtype;
  v_qty integer;
  v_refund numeric(14, 2) := 0;
  v_line_refund numeric(14, 2);
  v_condition text;
  v_batch_id uuid;
  v_returnable integer;
begin
  if not public.has_supermarket_access() then
    raise exception 'Not authorized';
  end if;

  select * into v_sale
  from public.sm_sales
  where id = p_sale_id and business_unit_id = v_bu
  for update;

  if not found then
    raise exception 'Sale not found';
  end if;
  if v_sale.status = 'VOID' then
    raise exception 'Cannot return a voided sale';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Return requires at least one item';
  end if;

  v_return_number := public.sm_next_document_number('RETURN', 'RET-');

  insert into public.sm_sales_returns (
    id, business_unit_id, return_number, sale_id, refund_method,
    refund_amount, reason, status, processed_by
  ) values (
    v_return_id, v_bu, v_return_number, v_sale.id,
    upper(p_refund_method), 0, coalesce(p_reason, ''), 'COMPLETED', auth.uid()
  );

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_sale_item
    from public.sm_sale_items
    where id = (v_item->>'sale_item_id')::uuid
      and sale_id = v_sale.id
    for update;

    if not found then
      raise exception 'Invalid sale item';
    end if;

    v_qty := (v_item->>'quantity')::integer;
    v_returnable := v_sale_item.quantity - v_sale_item.returned_quantity;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Invalid return quantity';
    end if;
    if v_qty > v_returnable then
      raise exception 'Cannot return more than sold quantity remaining';
    end if;

    v_condition := coalesce(upper(v_item->>'condition'), 'RESELLABLE');
    v_line_refund := round((v_sale_item.line_total / v_sale_item.quantity) * v_qty, 2);
    v_refund := v_refund + v_line_refund;

    insert into public.sm_sales_return_items (
      sales_return_id, sale_item_id, product_id, quantity, unit_price,
      buying_cost_snapshot, refund_amount, condition, reason
    ) values (
      v_return_id, v_sale_item.id, v_sale_item.product_id, v_qty,
      v_sale_item.unit_price, v_sale_item.buying_cost_snapshot,
      v_line_refund, v_condition, coalesce(v_item->>'reason', '')
    );

    update public.sm_sale_items
    set returned_quantity = returned_quantity + v_qty
    where id = v_sale_item.id;

    if v_condition = 'RESELLABLE' then
      insert into public.sm_stock_batches (
        business_unit_id, product_id, batch_number, quantity, location,
        buying_price, received_at
      ) values (
        v_bu, v_sale_item.product_id, 'RET-' || v_return_number, v_qty, 'Sales Floor',
        v_sale_item.buying_cost_snapshot, now()
      )
      returning id into v_batch_id;

      insert into public.sm_stock_movements (
        business_unit_id, product_id, batch_id, movement_code, quantity,
        unit_cost, reference, note, to_location,
        source_document_type, source_document_id, created_by
      ) values (
        v_bu, v_sale_item.product_id, v_batch_id, 'SALE_RETURN', v_qty,
        v_sale_item.buying_cost_snapshot, v_return_number, 'Sales return', 'Sales Floor',
        'sales_return', v_return_id, auth.uid()
      );
    else
      insert into public.sm_stock_movements (
        business_unit_id, product_id, movement_code, quantity,
        unit_cost, reference, note, reason,
        source_document_type, source_document_id, created_by
      ) values (
        v_bu, v_sale_item.product_id,
        case when v_condition = 'EXPIRED' then 'EXPIRED' else 'DAMAGE' end,
        0,
        v_sale_item.buying_cost_snapshot, v_return_number,
        'Non-resellable return', coalesce(v_item->>'reason', v_condition),
        'sales_return', v_return_id, auth.uid()
      );
    end if;
  end loop;

  update public.sm_sales_returns
  set refund_amount = v_refund
  where id = v_return_id;

  insert into public.sm_payments (
    business_unit_id, direction, kind, method, amount, reference,
    sale_id, sales_return_id, created_by
  ) values (
    v_bu, 'OUT', 'REFUND',
    case
      when upper(p_refund_method) = 'STORE_CREDIT' then 'CASH'
      else upper(p_refund_method)
    end,
    v_refund, v_return_number, v_sale.id, v_return_id, auth.uid()
  );

  update public.sm_sales
  set status = case
    when (
      select bool_and(returned_quantity >= quantity)
      from public.sm_sale_items
      where sale_id = v_sale.id
    ) then 'REFUNDED'
    else 'PARTIAL_REFUND'
  end
  where id = v_sale.id;

  return v_return_id;
end;
$$;

grant execute on function public.sm_process_sales_return(uuid, jsonb, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- DEMO CATALOGUE SEED QUARANTINED (production-safe bootstrap)
-- ---------------------------------------------------------------------------
-- The previous development catalogue (Bakhresa supplier + 6 demo SKUs + OPENING
-- batches / TZS 1,379,000 inventory) is NO LONGER applied by this bootstrap file.
-- Development-only copy: supabase/seed/dev_supermarket_catalogue.sql
-- Production cleanup migration: 20260921150000_supermarket_cleanup_demo_catalogue.sql
-- Reference config above (sm_promotion_types + sm_categories) remains — required
-- by the application, not demo business transactions.

-- Fix table privileges for supermarket module (genuine defect: RLS policies exist but roles lacked GRANT).
-- Required for authenticated app access and service-role admin clients.

grant select, insert, update, delete on table
  public.sm_categories,
  public.sm_suppliers,
  public.sm_products,
  public.sm_stock_batches,
  public.sm_stock_movements,
  public.sm_stock_adjustments,
  public.sm_purchase_orders,
  public.sm_purchase_order_items,
  public.sm_goods_receipts,
  public.sm_goods_receipt_items,
  public.sm_sales,
  public.sm_sale_items,
  public.sm_sale_payments,
  public.sm_sales_returns,
  public.sm_sales_return_items,
  public.sm_promotion_types,
  public.sm_promotions,
  public.sm_promotion_products,
  public.sm_promotion_categories,
  public.sm_promotion_tiers,
  public.sm_expenses,
  public.sm_payments,
  public.sm_document_counters
to authenticated, service_role;

grant usage, select on all sequences in schema public to authenticated, service_role;

grant execute on function public.has_business_unit_access(uuid) to authenticated, service_role;
grant execute on function public.supermarket_business_unit_id() to authenticated, service_role;
grant execute on function public.has_supermarket_access() to authenticated, service_role;
grant execute on function public.sm_next_document_number(text, text) to authenticated, service_role;
grant execute on function public.sm_product_stock(uuid) to authenticated, service_role;
grant execute on function public.sm_complete_sale(jsonb, jsonb, text, numeric, numeric, text) to authenticated, service_role;
grant execute on function public.sm_adjust_stock(uuid, text, integer, text, text, text, text) to authenticated, service_role;
grant execute on function public.sm_receive_purchase_order(uuid, jsonb, text) to authenticated, service_role;
grant execute on function public.sm_process_sales_return(uuid, jsonb, text, text) to authenticated, service_role;
-- grants appended

-- ---------------------------------------------------------------------------
-- Stable access (mirrors 20260921140000_supermarket_stable_access.sql)
-- ---------------------------------------------------------------------------

create or replace function public.jwt_has_supermarket_module()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from jsonb_array_elements_text(
      case
        when jsonb_typeof(coalesce(auth.jwt() -> 'app_metadata' -> 'modules', '[]'::jsonb)) = 'array'
          then coalesce(auth.jwt() -> 'app_metadata' -> 'modules', '[]'::jsonb)
        else '[]'::jsonb
      end
    ) as module(code)
    where module.code in ('*', 'supermarket')
  );
$$;

create or replace function public.jwt_is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role_code', '') in ('SUPER_ADMIN', 'OWNER');
$$;

create or replace function public.has_business_unit_access(p_business_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when p_business_unit_id is null then false
      when public.is_owner() then true
      when public.jwt_is_platform_owner() then true
      when exists (
        select 1
        from public.user_business_units ubu
        where ubu.user_id = auth.uid()
          and ubu.business_unit_id = p_business_unit_id
      ) then true
      when p_business_unit_id = public.supermarket_business_unit_id()
        and public.jwt_has_supermarket_module() then true
      else false
    end;
$$;

create or replace function public.has_supermarket_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_owner()
    or public.jwt_is_platform_owner()
    or public.jwt_has_supermarket_module()
    or public.has_business_unit_access(public.supermarket_business_unit_id());
$$;

grant execute on function public.jwt_has_supermarket_module() to authenticated, service_role;
grant execute on function public.jwt_is_platform_owner() to authenticated, service_role;
grant execute on function public.has_business_unit_access(uuid) to authenticated, service_role;
grant execute on function public.supermarket_business_unit_id() to authenticated, service_role;
grant execute on function public.has_supermarket_access() to authenticated, service_role;
