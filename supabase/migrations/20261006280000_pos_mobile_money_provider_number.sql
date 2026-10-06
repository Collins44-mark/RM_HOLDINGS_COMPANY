-- POS customer tenders are Cash, Mobile Money and Card.
-- Add payment_number to existing sm_payment_providers. No seed data.

alter table public.sm_payment_providers
  add column if not exists payment_number text not null default '';

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
  v_tax numeric(14, 2) := 0;
  v_tax_add numeric(14, 2) := 0;
  v_tax_base numeric(14, 2) := 0;
  v_sale_date date := (timezone('Africa/Dar_es_Salaam', now()))::date;
  v_tax_line record;
  v_paid numeric(14, 2) := 0;
  v_method text;
  v_amount numeric(14, 2);
  v_provider text;
  v_reference text;
  v_provider_id uuid;
  v_provider_name text;
  v_payment_number text;
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

  insert into public.sm_sales (
    id, business_unit_id, invoice_number, cashier_id, customer_name,
    subtotal, discount, tax, total, cogs, status, notes
  ) values (
    v_sale_id, v_bu, v_invoice, auth.uid(), coalesce(nullif(p_customer_name, ''), 'Walk-in Customer'),
    0, coalesce(p_discount, 0), 0, 0, 0, 'COMPLETED', coalesce(p_notes, '')
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
      0,
      v_line_total,
      nullif(v_item->>'promotion_id', '')::uuid
    );
  end loop;

  v_tax_base := greatest(0, v_subtotal - coalesce(p_discount, 0));
  v_tax := 0;
  v_tax_add := 0;
  for v_tax_line in
    select * from public.sm_tax_lines_for_scope(v_bu, 'SALES', v_sale_date, v_tax_base)
  loop
    insert into public.sm_tax_applications (
      business_unit_id, tax_rule_id, source_type, source_id, source_number, source_date,
      tax_name, tax_code, tax_rate, tax_base, tax_amount, pricing_mode
    ) values (
      v_bu, v_tax_line.tax_rule_id, 'SALE', v_sale_id, v_invoice, v_sale_date,
      v_tax_line.tax_name, v_tax_line.tax_code, v_tax_line.tax_rate, v_tax_line.tax_base, v_tax_line.tax_amount,
      coalesce(v_tax_line.pricing_mode, 'EXCLUSIVE')
    );
    v_tax := v_tax + v_tax_line.tax_amount;
    if coalesce(v_tax_line.pricing_mode, 'EXCLUSIVE') = 'EXCLUSIVE' then
      v_tax_add := v_tax_add + v_tax_line.tax_amount;
    end if;
  end loop;

  v_total := greatest(0, v_tax_base + v_tax_add);

  update public.sm_sales
  set subtotal = v_subtotal,
      tax = v_tax,
      total = v_total,
      cogs = v_cogs
  where id = v_sale_id;

  for v_payment in select * from jsonb_array_elements(p_payments)
  loop
    v_method := upper(trim(coalesce(v_payment->>'method', '')));
    v_amount := round(coalesce((v_payment->>'amount')::numeric, 0), 2);
    v_provider := trim(coalesce(v_payment->>'provider', ''));
    v_reference := trim(coalesce(v_payment->>'reference', ''));
    v_provider_id := null;
    v_provider_name := null;
    v_payment_number := null;

    if v_method = 'BANK' then
      raise exception 'Bank is not a POS customer payment method';
    end if;
    if v_method not in ('CASH', 'MOBILE_MONEY', 'CARD') then
      raise exception 'Invalid payment method';
    end if;
    if v_amount <= 0 then
      raise exception 'Each payment must have a positive amount';
    end if;
    if v_method = 'MOBILE_MONEY' then
      begin
        v_provider_id := nullif(trim(coalesce(v_payment->>'provider_id', '')), '')::uuid;
      exception when invalid_text_representation then
        v_provider_id := null;
      end;
      select trim(p.name), trim(coalesce(p.payment_number, ''))
        into v_provider_name, v_payment_number
      from public.sm_payment_providers p
      where p.id = v_provider_id
        and p.business_unit_id = v_bu
        and p.method = 'MOBILE_MONEY'
        and p.is_active = true;
      if not found then
        raise exception 'Select a configured Mobile Money provider';
      end if;
      v_provider := v_provider_name;
      if v_payment_number <> '' then
        v_provider := v_provider_name || ' — ' || v_payment_number;
      end if;
    end if;

    v_paid := v_paid + v_amount;

    insert into public.sm_sale_payments (sale_id, method, amount, provider, reference)
    values (v_sale_id, v_method, v_amount, v_provider, v_reference);

    insert into public.sm_payments (
      business_unit_id, direction, kind, method, amount, reference, notes, sale_id, created_by
    ) values (
      v_bu, 'IN', 'CUSTOMER_PAYMENT', v_method,
      v_amount,
      coalesce(nullif(v_reference, ''), v_invoice),
      v_provider,
      v_sale_id, auth.uid()
    );
  end loop;

  if v_paid <> v_total then
    raise exception 'Payment total must equal the amount due';
  end if;

  return v_sale_id;
end;
$$;

grant execute on function public.sm_complete_sale(jsonb, jsonb, text, numeric, numeric, text) to authenticated, service_role;
