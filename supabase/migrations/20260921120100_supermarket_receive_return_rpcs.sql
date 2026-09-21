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
