-- Remove development/demo supermarket catalogue data seeded by
-- 20260921120200_supermarket_seed_catalogue.sql (and the equivalent block
-- previously embedded in supabase/seed/apply_supermarket_module.sql).
--
-- Scope is deterministic and narrow:
--   supplier name: 'Bakhresa Food Products'
--   product SKUs:  SKU-RICE-5, SKU-FLOUR-2, SKU-COKE-500,
--                  SKU-MILK-1, SKU-OIL-2, SKU-OMO-1
--
-- Does NOT delete:
--   business_units, profiles, roles, permissions, auth data,
--   sm_categories (reference), sm_promotion_types (reference),
--   RLS policies, grants, schema objects, or unrelated supermarket rows.
--
-- Owner confirms there are no real supermarket business transactions yet.
-- Dependent child rows for these demo products are cleared only when they
-- reference the demo product IDs (FK-safe order).

do $$
declare
  v_bu uuid;
  v_demo_skus text[] := array[
    'SKU-RICE-5',
    'SKU-FLOUR-2',
    'SKU-COKE-500',
    'SKU-MILK-1',
    'SKU-OIL-2',
    'SKU-OMO-1'
  ];
  v_product_ids uuid[];
  v_supplier_id uuid;
begin
  select id into v_bu
  from public.business_units
  where code = 'supermarket'
  limit 1;

  if v_bu is null then
    raise notice 'supermarket_cleanup_demo_catalogue: supermarket BU missing — nothing to do';
    return;
  end if;

  select coalesce(array_agg(p.id), '{}'::uuid[])
  into v_product_ids
  from public.sm_products p
  where p.business_unit_id = v_bu
    and p.sku = any (v_demo_skus);

  select s.id into v_supplier_id
  from public.sm_suppliers s
  where s.business_unit_id = v_bu
    and s.name = 'Bakhresa Food Products'
  limit 1;

  if cardinality(v_product_ids) = 0 and v_supplier_id is null then
    raise notice 'supermarket_cleanup_demo_catalogue: no demo catalogue rows found';
    return;
  end if;

  -- Children that can reference demo products (restrict FKs).
  if cardinality(v_product_ids) > 0 then
    delete from public.sm_promotion_products
    where product_id = any (v_product_ids);

    delete from public.sm_sales_return_items
    where product_id = any (v_product_ids);

    delete from public.sm_sale_items
    where product_id = any (v_product_ids);

    delete from public.sm_goods_receipt_items
    where product_id = any (v_product_ids);

    delete from public.sm_purchase_order_items
    where product_id = any (v_product_ids);

    delete from public.sm_stock_adjustments
    where product_id = any (v_product_ids);

    delete from public.sm_stock_movements
    where product_id = any (v_product_ids);

    delete from public.sm_stock_batches
    where product_id = any (v_product_ids)
       or (business_unit_id = v_bu and batch_number = 'OPENING' and product_id = any (v_product_ids));

    delete from public.sm_products
    where business_unit_id = v_bu
      and id = any (v_product_ids);
  end if;

  -- Demo supplier only when it has no remaining product references.
  if v_supplier_id is not null then
    if not exists (
      select 1 from public.sm_products p where p.supplier_id = v_supplier_id
    ) and not exists (
      select 1 from public.sm_purchase_orders po where po.supplier_id = v_supplier_id
    ) and not exists (
      select 1 from public.sm_goods_receipts gr where gr.supplier_id = v_supplier_id
    ) then
      delete from public.sm_suppliers
      where id = v_supplier_id
        and business_unit_id = v_bu
        and name = 'Bakhresa Food Products';
    else
      raise notice 'supermarket_cleanup_demo_catalogue: demo supplier retained (still referenced)';
    end if;
  end if;

  raise notice 'supermarket_cleanup_demo_catalogue: removed demo products=% supplier_attempted=%',
    cardinality(v_product_ids),
    (v_supplier_id is not null);
end $$;
