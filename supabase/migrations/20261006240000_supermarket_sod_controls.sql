-- System-default supermarket segregation of duties. Defaults are enabled.
-- Owner may customize flags; this is not a second permission catalog.

create table if not exists public.sm_sod_controls (
  business_unit_id uuid primary key references public.business_units(id) on delete restrict,
  block_self_approval boolean not null default true,
  reconciliation boolean not null default true,
  purchase_order boolean not null default true,
  supplier_invoice boolean not null default true,
  supplier_payment boolean not null default true,
  stock_adjustment boolean not null default true,
  petty_cash boolean not null default true,
  banking boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into public.sm_sod_controls (business_unit_id)
select id from public.business_units where code = 'supermarket'
on conflict (business_unit_id) do nothing;

alter table public.sm_sod_controls enable row level security;

drop policy if exists sm_sod_controls_select on public.sm_sod_controls;
create policy sm_sod_controls_select on public.sm_sod_controls
  for select to authenticated using (public.has_business_unit_access(business_unit_id) or public.is_owner());

drop policy if exists sm_sod_controls_insert on public.sm_sod_controls;
create policy sm_sod_controls_insert on public.sm_sod_controls
  for insert to authenticated with check (public.is_owner());

drop policy if exists sm_sod_controls_update on public.sm_sod_controls;
create policy sm_sod_controls_update on public.sm_sod_controls
  for update to authenticated
  using (public.is_owner())
  with check (public.is_owner());

drop policy if exists sm_sod_controls_delete on public.sm_sod_controls;
create policy sm_sod_controls_delete on public.sm_sod_controls
  for delete to authenticated using (false);

revoke all on public.sm_sod_controls from anon, public;
grant select, insert, update on public.sm_sod_controls to authenticated;

create or replace function public.sm_sod_control_enabled(p_control text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case p_control
      when 'reconciliation' then c.block_self_approval and c.reconciliation
      when 'purchase_order' then c.block_self_approval and c.purchase_order
      when 'supplier_invoice' then c.block_self_approval and c.supplier_invoice
      when 'supplier_payment' then c.block_self_approval and c.supplier_payment
      when 'stock_adjustment' then c.block_self_approval and c.stock_adjustment
      when 'petty_cash' then c.block_self_approval and c.petty_cash
      when 'banking' then c.block_self_approval and c.banking
      else c.block_self_approval
    end
    from public.sm_sod_controls c
    join public.business_units bu on bu.id = c.business_unit_id
    where bu.code = 'supermarket'
    limit 1
  ), true);
$$;

create or replace function public.sm_assert_sod(p_preparer uuid, p_control text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.is_owner() then
    return;
  end if;
  if p_preparer is null or p_preparer is distinct from auth.uid() then
    return;
  end if;
  if public.sm_sod_control_enabled(p_control) then
    raise exception 'You cannot approve this transaction because you prepared it. Another authorized user must approve it.';
  end if;
end;
$$;

grant execute on function public.sm_sod_control_enabled(text) to authenticated, service_role;
grant execute on function public.sm_assert_sod(uuid, text) to authenticated, service_role;

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
  perform public.sm_assert_sod(coalesce(v_po.created_by, v_po.submitted_by), 'purchase_order');

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

grant execute on function public.sm_approve_purchase_order(uuid) to authenticated;

create or replace function public.sm_approve_stock_loss_event(p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bu uuid := public.supermarket_business_unit_id();
  v_row public.sm_stock_loss_events%rowtype;
begin
  if not public.has_supermarket_access() then
    raise exception 'Not authorized';
  end if;

  select * into v_row
  from public.sm_stock_loss_events
  where id = p_event_id and business_unit_id = v_bu
  for update;

  if not found then
    raise exception 'Inventory event not found';
  end if;
  if v_row.status <> 'SUBMITTED' then
    raise exception 'Only submitted events can be approved';
  end if;
  perform public.sm_assert_sod(v_row.prepared_by, 'stock_adjustment');

  update public.sm_stock_loss_events
  set
    status = 'APPROVED',
    approved_by = auth.uid(),
    approved_at = now(),
    updated_at = now()
  where id = v_row.id;

  return v_row.id;
end;
$$;

create or replace function public.sm_post_stock_loss_event(p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bu uuid := public.supermarket_business_unit_id();
  v_row public.sm_stock_loss_events%rowtype;
  v_kind text;
  v_adj uuid;
begin
  if not public.has_supermarket_access() then
    raise exception 'Not authorized';
  end if;

  select * into v_row
  from public.sm_stock_loss_events
  where id = p_event_id and business_unit_id = v_bu
  for update;

  if not found then
    raise exception 'Inventory event not found';
  end if;
  if v_row.status = 'POSTED' or v_row.posted_adjustment_id is not null then
    raise exception 'This inventory event has already been posted';
  end if;
  if v_row.status <> 'APPROVED' then
    raise exception 'Only approved events can be posted';
  end if;
  perform public.sm_assert_sod(v_row.prepared_by, 'stock_adjustment');

  v_kind := case v_row.event_type
    when 'LOSS' then 'Lost'
    when 'DAMAGE' then 'Damage'
    when 'EXPIRED' then 'Expired'
  end;

  v_adj := public.sm_adjust_stock(
    v_row.product_id,
    v_kind,
    v_row.quantity,
    v_row.location,
    v_row.reason,
    v_row.notes,
    'decrease'
  );

  update public.sm_stock_loss_events
  set
    status = 'POSTED',
    posted_adjustment_id = v_adj,
    posted_at = now(),
    updated_at = now()
  where id = v_row.id;

  return v_adj;
end;
$$;

grant execute on function public.sm_approve_stock_loss_event(uuid) to authenticated;
grant execute on function public.sm_post_stock_loss_event(uuid) to authenticated;

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
  perform public.sm_assert_sod(v_inv.created_by, 'supplier_invoice');

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

grant execute on function public.sm_verify_supplier_invoice(uuid) to authenticated;
