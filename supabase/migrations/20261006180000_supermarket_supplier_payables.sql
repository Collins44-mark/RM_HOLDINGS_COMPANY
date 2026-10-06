-- Supermarket procurement completion: PO approval, supplier invoices, payment requests.
-- Reuses sm_purchase_orders, sm_goods_receipts, sm_stock_*, sm_payments.

insert into public.permissions (code, module, resource, action, name)
values
  ('supermarket.purchases.approve', 'supermarket', 'purchases', 'approve', 'Approve purchase orders'),
  ('supermarket.purchases.receive', 'supermarket', 'purchases', 'receive', 'Receive purchase goods'),
  ('supermarket.supplier_invoices.view', 'supermarket', 'supplier_invoices', 'view', 'View supplier invoices'),
  ('supermarket.supplier_invoices.create', 'supermarket', 'supplier_invoices', 'create', 'Create supplier invoices'),
  ('supermarket.supplier_invoices.verify', 'supermarket', 'supplier_invoices', 'verify', 'Verify supplier invoices'),
  ('supermarket.supplier_payments.view', 'supermarket', 'supplier_payments', 'view', 'View supplier payments'),
  ('supermarket.supplier_payments.create', 'supermarket', 'supplier_payments', 'create', 'Create supplier payment requests'),
  ('supermarket.supplier_payments.approve', 'supermarket', 'supplier_payments', 'approve', 'Approve supplier payments')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code = 'SUPERMARKET_MANAGER'
  and p.code in (
    'supermarket.purchases.approve',
    'supermarket.purchases.receive',
    'supermarket.supplier_invoices.view',
    'supermarket.supplier_invoices.create',
    'supermarket.supplier_invoices.verify',
    'supermarket.supplier_payments.view',
    'supermarket.supplier_payments.create',
    'supermarket.supplier_payments.approve'
  )
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select rp.role_id, 'supermarket.purchases.receive'
from public.role_permissions rp
where rp.permission_code = 'supermarket.purchases.create'
on conflict do nothing;


insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code in ('FINANCE_MANAGER', 'GROUP_ACCOUNTANT')
  and p.code in (
    'supermarket.purchases.view',
    'supermarket.purchases.approve',
    'supermarket.supplier_invoices.view',
    'supermarket.supplier_invoices.create',
    'supermarket.supplier_invoices.verify',
    'supermarket.supplier_payments.view',
    'supermarket.supplier_payments.create',
    'supermarket.supplier_payments.approve'
  )
on conflict do nothing;

alter table public.sm_purchase_orders drop constraint if exists sm_purchase_orders_status_check;
alter table public.sm_purchase_orders
  add constraint sm_purchase_orders_status_check
  check (status in (
    'DRAFT', 'SUBMITTED', 'APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'
  ));

alter table public.sm_purchase_orders
  add column if not exists submitted_by uuid references public.profiles(id) on delete set null,
  add column if not exists submitted_at timestamptz,
  add column if not exists approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists sent_at timestamptz;

create table if not exists public.sm_supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  invoice_number text not null,
  supplier_id uuid not null references public.sm_suppliers(id) on delete restrict,
  purchase_order_id uuid references public.sm_purchase_orders(id) on delete restrict,
  goods_receipt_id uuid references public.sm_goods_receipts(id) on delete set null,
  invoice_date date not null default (timezone('Africa/Dar_es_Salaam', now()))::date,
  due_date date,
  subtotal numeric(14, 2) not null default 0 check (subtotal >= 0),
  tax numeric(14, 2) not null default 0 check (tax >= 0),
  total numeric(14, 2) not null default 0 check (total >= 0),
  amount_paid numeric(14, 2) not null default 0 check (amount_paid >= 0),
  verification_status text not null default 'DRAFT'
    check (verification_status in ('DRAFT', 'SUBMITTED', 'VERIFIED', 'REJECTED')),
  payment_status text not null default 'UNPAID'
    check (payment_status in ('UNPAID', 'PARTIAL', 'PAID')),
  notes text not null default '',
  rejection_reason text not null default '',
  discrepancies jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  submitted_by uuid references public.profiles(id) on delete set null,
  verified_by uuid references public.profiles(id) on delete set null,
  submitted_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_unit_id, invoice_number)
);

create index if not exists sm_supplier_invoices_bu_supplier_idx
  on public.sm_supplier_invoices (business_unit_id, supplier_id, created_at desc);
create index if not exists sm_supplier_invoices_po_idx
  on public.sm_supplier_invoices (purchase_order_id);

create table if not exists public.sm_supplier_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.sm_supplier_invoices(id) on delete cascade,
  product_id uuid not null references public.sm_products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_cost numeric(14, 2) not null check (unit_cost >= 0),
  tax numeric(14, 2) not null default 0 check (tax >= 0),
  line_total numeric(14, 2) not null default 0 check (line_total >= 0)
);

create table if not exists public.sm_supplier_payment_requests (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  request_number text not null,
  supplier_id uuid not null references public.sm_suppliers(id) on delete restrict,
  invoice_id uuid not null references public.sm_supplier_invoices(id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  method text not null check (method in ('CASH', 'MOBILE_MONEY', 'CARD', 'BANK')),
  due_date date,
  reference text not null default '',
  notes text not null default '',
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'SUBMITTED', 'APPROVED', 'PAID', 'REJECTED')),
  prepared_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  posted_payment_id uuid references public.sm_payments(id) on delete set null,
  prepared_at timestamptz,
  approved_at timestamptz,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_unit_id, request_number),
  unique (posted_payment_id)
);

create index if not exists sm_supplier_payment_requests_invoice_idx
  on public.sm_supplier_payment_requests (invoice_id);

alter table public.sm_payments
  add column if not exists supplier_invoice_id uuid references public.sm_supplier_invoices(id) on delete set null,
  add column if not exists payment_request_id uuid references public.sm_supplier_payment_requests(id) on delete set null;

create unique index if not exists sm_payments_payment_request_uidx
  on public.sm_payments (payment_request_id)
  where payment_request_id is not null;

create index if not exists sm_payments_supplier_invoice_idx
  on public.sm_payments (supplier_invoice_id)
  where supplier_invoice_id is not null;

alter table public.sm_supplier_invoices enable row level security;
alter table public.sm_supplier_invoice_items enable row level security;
alter table public.sm_supplier_payment_requests enable row level security;

drop policy if exists sm_supplier_invoices_select on public.sm_supplier_invoices;
create policy sm_supplier_invoices_select on public.sm_supplier_invoices
  for select to authenticated using (public.has_business_unit_access(business_unit_id));
drop policy if exists sm_supplier_invoices_insert on public.sm_supplier_invoices;
create policy sm_supplier_invoices_insert on public.sm_supplier_invoices
  for insert to authenticated with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sm_supplier_invoices_update on public.sm_supplier_invoices;
create policy sm_supplier_invoices_update on public.sm_supplier_invoices
  for update to authenticated
  using (public.has_business_unit_access(business_unit_id))
  with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sm_supplier_invoices_delete on public.sm_supplier_invoices;
create policy sm_supplier_invoices_delete on public.sm_supplier_invoices
  for delete to authenticated using (public.has_business_unit_access(business_unit_id));

drop policy if exists sm_supplier_invoice_items_all on public.sm_supplier_invoice_items;
create policy sm_supplier_invoice_items_all on public.sm_supplier_invoice_items
  for all to authenticated
  using (
    exists (
      select 1 from public.sm_supplier_invoices inv
      where inv.id = invoice_id and public.has_business_unit_access(inv.business_unit_id)
    )
  )
  with check (
    exists (
      select 1 from public.sm_supplier_invoices inv
      where inv.id = invoice_id and public.has_business_unit_access(inv.business_unit_id)
    )
  );

drop policy if exists sm_supplier_payment_requests_select on public.sm_supplier_payment_requests;
create policy sm_supplier_payment_requests_select on public.sm_supplier_payment_requests
  for select to authenticated using (public.has_business_unit_access(business_unit_id));
drop policy if exists sm_supplier_payment_requests_insert on public.sm_supplier_payment_requests;
create policy sm_supplier_payment_requests_insert on public.sm_supplier_payment_requests
  for insert to authenticated with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sm_supplier_payment_requests_update on public.sm_supplier_payment_requests;
create policy sm_supplier_payment_requests_update on public.sm_supplier_payment_requests
  for update to authenticated
  using (public.has_business_unit_access(business_unit_id))
  with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sm_supplier_payment_requests_delete on public.sm_supplier_payment_requests;
create policy sm_supplier_payment_requests_delete on public.sm_supplier_payment_requests
  for delete to authenticated using (public.has_business_unit_access(business_unit_id));

revoke all on public.sm_supplier_invoices from anon, public;
revoke all on public.sm_supplier_invoice_items from anon, public;
revoke all on public.sm_supplier_payment_requests from anon, public;
grant select, insert, update, delete on public.sm_supplier_invoices to authenticated;
grant select, insert, update, delete on public.sm_supplier_invoice_items to authenticated;
grant select, insert, update, delete on public.sm_supplier_payment_requests to authenticated;

create or replace function public.sm_submit_purchase_order(p_purchase_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bu uuid := public.supermarket_business_unit_id();
  v_po public.sm_purchase_orders%rowtype;
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
  if v_po.status <> 'DRAFT' then
    raise exception 'Only draft purchase orders can be submitted';
  end if;

  update public.sm_purchase_orders
  set
    status = 'SUBMITTED',
    submitted_by = auth.uid(),
    submitted_at = now(),
    updated_at = now()
  where id = v_po.id;

  return v_po.id;
end;
$$;

create or replace function public.sm_approve_purchase_order(p_purchase_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bu uuid := public.supermarket_business_unit_id();
  v_po public.sm_purchase_orders%rowtype;
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
  if v_po.status <> 'SUBMITTED' then
    raise exception 'Only submitted purchase orders can be approved';
  end if;
  if coalesce(v_po.created_by, v_po.submitted_by) = auth.uid() and not public.is_owner() then
    raise exception 'Self-approval is not allowed';
  end if;

  update public.sm_purchase_orders
  set
    status = 'APPROVED',
    approved_by = auth.uid(),
    approved_at = now(),
    updated_at = now()
  where id = v_po.id;

  return v_po.id;
end;
$$;

create or replace function public.sm_send_purchase_order(p_purchase_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bu uuid := public.supermarket_business_unit_id();
  v_po public.sm_purchase_orders%rowtype;
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
  if v_po.status <> 'APPROVED' then
    raise exception 'Only approved purchase orders can be sent';
  end if;

  update public.sm_purchase_orders
  set
    status = 'SENT',
    sent_at = now(),
    updated_at = now()
  where id = v_po.id;

  return v_po.id;
end;
$$;

grant execute on function public.sm_submit_purchase_order(uuid) to authenticated;
grant execute on function public.sm_approve_purchase_order(uuid) to authenticated;
grant execute on function public.sm_send_purchase_order(uuid) to authenticated;

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
  if v_po.status not in ('SENT', 'PARTIALLY_RECEIVED') then
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

create or replace function public.sm_verify_supplier_invoice(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bu uuid := public.supermarket_business_unit_id();
  v_inv public.sm_supplier_invoices%rowtype;
  v_flags jsonb := '[]'::jsonb;
  v_item record;
  v_po_qty integer;
  v_po_cost numeric(14, 2);
  v_recv_qty integer;
begin
  if not public.has_supermarket_access() then
    raise exception 'Not authorized';
  end if;

  select * into v_inv
  from public.sm_supplier_invoices
  where id = p_invoice_id and business_unit_id = v_bu
  for update;

  if not found then
    raise exception 'Supplier invoice not found';
  end if;
  if v_inv.verification_status <> 'SUBMITTED' then
    raise exception 'Only submitted invoices can be verified';
  end if;
  if v_inv.created_by = auth.uid() and not public.is_owner() then
    raise exception 'Self-verification is not allowed';
  end if;

  for v_item in
    select product_id, quantity, unit_cost
    from public.sm_supplier_invoice_items
    where invoice_id = v_inv.id
  loop
    select quantity_ordered, unit_cost
      into v_po_qty, v_po_cost
    from public.sm_purchase_order_items
    where purchase_order_id = v_inv.purchase_order_id
      and product_id = v_item.product_id;

    select coalesce(sum(gri.quantity), 0)
      into v_recv_qty
    from public.sm_goods_receipt_items gri
    join public.sm_goods_receipts gr on gr.id = gri.goods_receipt_id
    where gr.purchase_order_id = v_inv.purchase_order_id
      and gri.product_id = v_item.product_id
      and gr.business_unit_id = v_bu;

    if v_po_qty is null then
      v_flags := v_flags || jsonb_build_array(jsonb_build_object(
        'type', 'UNKNOWN_PRODUCT',
        'productId', v_item.product_id,
        'message', 'Invoice product is not on the purchase order.'
      ));
    else
      if v_item.quantity > coalesce(v_recv_qty, 0) then
        v_flags := v_flags || jsonb_build_array(jsonb_build_object(
          'type', 'QTY_EXCEEDS_RECEIVED',
          'productId', v_item.product_id,
          'message', 'Invoice quantity exceeds received quantity.',
          'invoiceQty', v_item.quantity,
          'receivedQty', coalesce(v_recv_qty, 0),
          'poQty', v_po_qty
        ));
      end if;
      if v_item.quantity > v_po_qty then
        v_flags := v_flags || jsonb_build_array(jsonb_build_object(
          'type', 'QTY_EXCEEDS_PO',
          'productId', v_item.product_id,
          'message', 'Invoice quantity exceeds ordered quantity.',
          'invoiceQty', v_item.quantity,
          'poQty', v_po_qty
        ));
      end if;
      if v_item.unit_cost <> v_po_cost then
        v_flags := v_flags || jsonb_build_array(jsonb_build_object(
          'type', 'PRICE_VARIANCE',
          'productId', v_item.product_id,
          'message', 'Invoice price differs from purchase order price.',
          'invoicePrice', v_item.unit_cost,
          'poPrice', v_po_cost
        ));
      end if;
    end if;
  end loop;

  update public.sm_supplier_invoices
  set
    verification_status = 'VERIFIED',
    discrepancies = v_flags,
    verified_by = auth.uid(),
    verified_at = now(),
    updated_at = now()
  where id = v_inv.id;

  return v_inv.id;
end;
$$;

create or replace function public.sm_post_supplier_payment_request(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bu uuid := public.supermarket_business_unit_id();
  v_req public.sm_supplier_payment_requests%rowtype;
  v_inv public.sm_supplier_invoices%rowtype;
  v_payment_id uuid := gen_random_uuid();
  v_outstanding numeric(14, 2);
  v_paid numeric(14, 2);
  v_status text;
begin
  if not public.has_supermarket_access() then
    raise exception 'Not authorized';
  end if;

  select * into v_req
  from public.sm_supplier_payment_requests
  where id = p_request_id and business_unit_id = v_bu
  for update;

  if not found then
    raise exception 'Payment request not found';
  end if;
  if v_req.status <> 'APPROVED' then
    raise exception 'Only approved payment requests can be posted';
  end if;
  if v_req.posted_payment_id is not null then
    raise exception 'Payment request has already been posted';
  end if;

  select * into v_inv
  from public.sm_supplier_invoices
  where id = v_req.invoice_id and business_unit_id = v_bu
  for update;

  if v_inv.verification_status <> 'VERIFIED' then
    raise exception 'Invoice must be verified before payment';
  end if;

  v_outstanding := greatest(v_inv.total - v_inv.amount_paid, 0);
  if v_req.amount > v_outstanding then
    raise exception 'Requested amount exceeds invoice outstanding';
  end if;

  insert into public.sm_payments (
    id, business_unit_id, direction, kind, method, amount, payment_date,
    reference, notes, supplier_id, supplier_invoice_id, payment_request_id, created_by
  ) values (
    v_payment_id, v_bu, 'OUT', 'SUPPLIER_PAYMENT', v_req.method, v_req.amount,
    coalesce(v_req.due_date, (timezone('Africa/Dar_es_Salaam', now()))::date),
    coalesce(nullif(v_req.reference, ''), v_req.request_number),
    v_req.notes, v_req.supplier_id, v_inv.id, v_req.id, auth.uid()
  );

  v_paid := v_inv.amount_paid + v_req.amount;
  v_status := case
    when v_paid >= v_inv.total then 'PAID'
    when v_paid > 0 then 'PARTIAL'
    else 'UNPAID'
  end;

  update public.sm_supplier_invoices
  set
    amount_paid = v_paid,
    payment_status = v_status,
    updated_at = now()
  where id = v_inv.id;

  if v_inv.purchase_order_id is not null then
    update public.sm_goods_receipts
    set payment_status = v_status
    where purchase_order_id = v_inv.purchase_order_id
      and business_unit_id = v_bu;
  elsif v_inv.goods_receipt_id is not null then
    update public.sm_goods_receipts
    set payment_status = v_status
    where id = v_inv.goods_receipt_id;
  end if;

  update public.sm_supplier_payment_requests
  set
    status = 'PAID',
    posted_payment_id = v_payment_id,
    posted_at = now(),
    updated_at = now()
  where id = v_req.id;

  return v_payment_id;
end;
$$;

grant execute on function public.sm_verify_supplier_invoice(uuid) to authenticated;
grant execute on function public.sm_post_supplier_payment_request(uuid) to authenticated;
