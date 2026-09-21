-- Fix sm_complete_sale: insert sale header BEFORE sale items.
-- Previous order inserted sm_sale_items first, which violates
-- sm_sale_items.sale_id → sm_sales(id) and aborted the whole RPC.
--
-- Non-destructive: CREATE OR REPLACE FUNCTION only. No data deletes.

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

  -- Create the sale header first so child rows can satisfy FKs.
  -- Totals are updated after line processing.
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

grant execute on function public.sm_complete_sale(jsonb, jsonb, text, numeric, numeric, text) to authenticated, service_role;
