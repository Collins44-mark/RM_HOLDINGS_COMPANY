-- One system purchase document (PUR-xxxxx) per purchase order, assigned on first goods receipt.
-- Reuses sm_document_counters via sm_next_document_number. Does not create a second PO row.

alter table public.sm_purchase_orders
  add column if not exists purchase_document_number text;

create unique index if not exists sm_purchase_orders_purchase_document_uidx
  on public.sm_purchase_orders (business_unit_id, purchase_document_number)
  where purchase_document_number is not null;

comment on column public.sm_purchase_orders.purchase_document_number is
  'RM Holdings system purchase receipt/invoice number (PUR-xxxxx). Assigned once on first goods receipt.';

-- Backfill existing received POs using the same counter table (not MAX+1).
do $$
declare
  rec record;
  v_next integer;
begin
  for rec in
    select po.id, po.business_unit_id
    from public.sm_purchase_orders po
    where po.purchase_document_number is null
      and exists (
        select 1
        from public.sm_goods_receipts gr
        where gr.purchase_order_id = po.id
      )
    order by po.created_at, po.id
  loop
    insert into public.sm_document_counters (business_unit_id, doc_type, next_value)
    values (rec.business_unit_id, 'PURCHASE', 2)
    on conflict (business_unit_id, doc_type)
    do update set next_value = public.sm_document_counters.next_value + 1
    returning next_value - 1 into v_next;

    update public.sm_purchase_orders
    set purchase_document_number = 'PUR-' || lpad(v_next::text, 5, '0')
    where id = rec.id;
  end loop;
end $$;

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
  v_purchase_document_number text;
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
  v_purchase_document_number := v_po.purchase_document_number;
  if v_purchase_document_number is null then
    v_purchase_document_number := public.sm_next_document_number('PURCHASE', 'PUR-');
  end if;

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
    purchase_document_number = v_purchase_document_number,
    updated_at = now()
  where id = v_po.id;

  return v_receipt_id;
end;
$$;

grant execute on function public.sm_receive_purchase_order(uuid, jsonb, text) to authenticated;
