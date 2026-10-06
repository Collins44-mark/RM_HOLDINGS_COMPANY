-- Atomic PO create (header + lines, optional submit) with request-id idempotency.
-- Status transitions remain UPDATEs on this same row.

alter table public.sm_purchase_orders
  add column if not exists create_request_id uuid;

create unique index if not exists sm_purchase_orders_create_request_uidx
  on public.sm_purchase_orders (business_unit_id, create_request_id)
  where create_request_id is not null;

create unique index if not exists sm_purchase_orders_po_number_uidx
  on public.sm_purchase_orders (business_unit_id, po_number);

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

  select coalesce(sum(tax_amount), 0) into v_tax
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
