-- Tax pricing mode on existing sm_tax_rules / snapshots. Backfill EXCLUSIVE
-- to match current POS: tax is added on the taxable subtotal.

alter table public.sm_tax_rules
  add column if not exists pricing_mode text not null default 'EXCLUSIVE';

alter table public.sm_tax_rules
  drop constraint if exists sm_tax_rules_pricing_mode_check;
alter table public.sm_tax_rules
  add constraint sm_tax_rules_pricing_mode_check
  check (pricing_mode in ('EXCLUSIVE', 'INCLUSIVE'));

alter table public.sm_tax_applications
  add column if not exists pricing_mode text not null default 'EXCLUSIVE';

alter table public.sm_tax_applications
  drop constraint if exists sm_tax_applications_pricing_mode_check;
alter table public.sm_tax_applications
  add constraint sm_tax_applications_pricing_mode_check
  check (pricing_mode in ('EXCLUSIVE', 'INCLUSIVE'));

update public.sm_tax_rules
set pricing_mode = 'EXCLUSIVE'
where pricing_mode is null or pricing_mode not in ('EXCLUSIVE', 'INCLUSIVE');

drop function if exists public.sm_tax_lines_for_scope(uuid, text, date, numeric);

create or replace function public.sm_tax_lines_for_scope(
  p_bu uuid,
  p_scope text,
  p_on_date date,
  p_tax_base numeric
)
returns table (
  tax_rule_id uuid,
  tax_name text,
  tax_code text,
  tax_rate numeric,
  tax_base numeric,
  tax_amount numeric,
  pricing_mode text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    picked.id,
    picked.name,
    picked.tax_code,
    picked.rate,
    case
      when picked.pricing_mode = 'INCLUSIVE' and picked.rate > 0 then
        round(coalesce(p_tax_base, 0), 2)
        - round(round(coalesce(p_tax_base, 0), 2) * picked.rate / (100 + picked.rate), 2)
      else
        round(coalesce(p_tax_base, 0), 2)
    end,
    case
      when picked.pricing_mode = 'INCLUSIVE' and picked.rate > 0 then
        round(round(coalesce(p_tax_base, 0), 2) * picked.rate / (100 + picked.rate), 2)
      else
        round(round(coalesce(p_tax_base, 0), 2) * picked.rate / 100, 2)
    end,
    picked.pricing_mode
  from (
    select distinct on (r.family_id)
      r.id,
      r.name,
      r.tax_code,
      r.rate,
      r.pricing_mode
    from public.sm_tax_rules r
    where r.business_unit_id = p_bu
      and r.status = 'ACTIVE'
      and r.effective_from <= p_on_date
      and (r.effective_to is null or r.effective_to >= p_on_date)
      and (
        (p_scope = 'SALES' and r.applies_to_sales)
        or (p_scope = 'SUPPLIER_INVOICES' and r.applies_to_supplier_invoices)
      )
    order by r.family_id, r.effective_from desc, r.created_at desc
  ) picked
  order by picked.tax_code;
$$;

grant execute on function public.sm_tax_lines_for_scope(uuid, text, date, numeric) to authenticated, service_role;

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

-- Exclusive tax is added to PO/invoice totals; inclusive tax is extracted only.
create or replace function public.sm_tax_exclusive_add(
  p_bu uuid,
  p_scope text,
  p_on_date date,
  p_tax_base numeric
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(tax_amount), 0)
  from public.sm_tax_lines_for_scope(p_bu, p_scope, p_on_date, p_tax_base) as lines
  where lines.pricing_mode = 'EXCLUSIVE';
$$;

grant execute on function public.sm_tax_exclusive_add(uuid, text, date, numeric) to authenticated, service_role;



create or replace function public.sm_create_purchase_order(
  p_supplier_id uuid,
  p_order_date date,
  p_expected_date date,
  p_discount numeric,
  p_notes text,
  p_lines jsonb,
  p_submit boolean default false,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bu uuid := public.supermarket_business_unit_id();
  v_po public.sm_purchase_orders%rowtype;
  v_po_number text;
  v_subtotal numeric(14, 2) := 0;
  v_discount numeric(14, 2) := greatest(coalesce(p_discount, 0), 0);
  v_tax numeric(14, 2) := 0;
  v_total numeric(14, 2) := 0;
  v_status text := 'DRAFT';
  v_line jsonb;
  v_product_id uuid;
  v_qty integer;
  v_cost numeric(14, 2);
  v_items jsonb := '[]'::jsonb;
  v_item record;
begin
  if not public.has_supermarket_access() then
    raise exception 'Not authorized';
  end if;
  if p_supplier_id is null then
    raise exception 'Select a supplier';
  end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one line';
  end if;

  if p_request_id is not null then
    select * into v_po
    from public.sm_purchase_orders
    where business_unit_id = v_bu and create_request_id = p_request_id;
    if found then
      if p_submit and v_po.status = 'DRAFT' then
        perform public.sm_submit_purchase_order(v_po.id);
        select * into v_po from public.sm_purchase_orders where id = v_po.id;
      end if;
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id,
        'product_id', i.product_id,
        'quantity_ordered', i.quantity_ordered,
        'unit_cost', i.unit_cost
      ) order by i.id), '[]'::jsonb)
      into v_items
      from public.sm_purchase_order_items i
      where i.purchase_order_id = v_po.id;
      return jsonb_build_object(
        'id', v_po.id,
        'po_number', v_po.po_number,
        'status', v_po.status,
        'discount', v_po.discount,
        'tax', v_po.tax,
        'subtotal', v_po.subtotal,
        'total', v_po.total,
        'created_at', v_po.created_at,
        'created_by', v_po.created_by,
        'items', v_items,
        'replayed', true
      );
    end if;
  end if;

  if not exists (
    select 1 from public.sm_suppliers s
    where s.id = p_supplier_id and s.business_unit_id = v_bu
  ) then
    raise exception 'Supplier not found';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_product_id := (v_line->>'product_id')::uuid;
    v_qty := (v_line->>'quantity_ordered')::integer;
    v_cost := (v_line->>'buying_price')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Invalid ordered quantity';
    end if;
    if v_cost is null or v_cost < 0 then
      raise exception 'Invalid buying price';
    end if;
    if not exists (
      select 1 from public.sm_products p
      where p.id = v_product_id and p.business_unit_id = v_bu
    ) then
      raise exception 'Product not found';
    end if;
    v_subtotal := v_subtotal + round(v_cost * v_qty, 2);
  end loop;

  select coalesce(sum(case when pricing_mode = 'EXCLUSIVE' then tax_amount else 0 end), 0)
    into v_tax
  from public.sm_tax_lines_for_scope(v_bu, 'SUPPLIER_INVOICES', p_order_date, greatest(v_subtotal - v_discount, 0));

  v_total := greatest(v_subtotal - v_discount + v_tax, 0);
  v_po_number := public.sm_next_document_number('PO', 'PO-');
  if p_submit then
    v_status := 'SUBMITTED';
  end if;

  insert into public.sm_purchase_orders (
    business_unit_id, po_number, supplier_id, order_date, expected_date,
    status, subtotal, discount, tax, total, notes, created_by, create_request_id,
    submitted_by, submitted_at
  ) values (
    v_bu, v_po_number, p_supplier_id, p_order_date, p_expected_date,
    v_status, v_subtotal, v_discount, v_tax, v_total, coalesce(p_notes, ''), auth.uid(), p_request_id,
    case when p_submit then auth.uid() else null end,
    case when p_submit then now() else null end
  )
  returning * into v_po;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    insert into public.sm_purchase_order_items (
      purchase_order_id, product_id, quantity_ordered, quantity_received, unit_cost, line_total
    ) values (
      v_po.id,
      (v_line->>'product_id')::uuid,
      (v_line->>'quantity_ordered')::integer,
      0,
      (v_line->>'buying_price')::numeric,
      round((v_line->>'buying_price')::numeric * (v_line->>'quantity_ordered')::integer, 2)
    )
    returning id, product_id, quantity_ordered, unit_cost into v_item;

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'id', v_item.id,
      'product_id', v_item.product_id,
      'quantity_ordered', v_item.quantity_ordered,
      'unit_cost', v_item.unit_cost
    ));
  end loop;

  return jsonb_build_object(
    'id', v_po.id,
    'po_number', v_po.po_number,
    'status', v_po.status,
    'discount', v_po.discount,
    'tax', v_po.tax,
    'subtotal', v_po.subtotal,
    'total', v_po.total,
    'created_at', v_po.created_at,
    'created_by', v_po.created_by,
    'items', v_items,
    'replayed', false
  );
exception
  when unique_violation then
    if p_request_id is null then
      raise;
    end if;
    select * into v_po
    from public.sm_purchase_orders
    where business_unit_id = v_bu and create_request_id = p_request_id;
    if not found then
      raise;
    end if;
    if p_submit and v_po.status = 'DRAFT' then
      perform public.sm_submit_purchase_order(v_po.id);
      select * into v_po from public.sm_purchase_orders where id = v_po.id;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', i.id,
      'product_id', i.product_id,
      'quantity_ordered', i.quantity_ordered,
      'unit_cost', i.unit_cost
    ) order by i.id), '[]'::jsonb)
    into v_items
    from public.sm_purchase_order_items i
    where i.purchase_order_id = v_po.id;
    return jsonb_build_object(
      'id', v_po.id,
      'po_number', v_po.po_number,
      'status', v_po.status,
      'discount', v_po.discount,
      'tax', v_po.tax,
      'subtotal', v_po.subtotal,
      'total', v_po.total,
      'created_at', v_po.created_at,
      'created_by', v_po.created_by,
      'items', v_items,
      'replayed', true
    );
end;
$$;

grant execute on function public.sm_create_purchase_order(uuid, date, date, numeric, text, jsonb, boolean, uuid) to authenticated;
