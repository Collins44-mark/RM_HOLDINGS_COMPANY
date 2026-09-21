-- DEVELOPMENT ONLY — demo supermarket catalogue.
--
-- Do NOT run against production.
-- Do NOT include this file in production bootstrap / apply paths.
--
-- Historical source: supabase/migrations/20260921120200_supermarket_seed_catalogue.sql
-- Production cleanup: supabase/migrations/20260921150000_supermarket_cleanup_demo_catalogue.sql
--
-- Creates the known demo supplier + 6 SKUs + OPENING stock batches used during
-- early supermarket development. Inventory value at seed time ≈ TZS 1,379,000.

do $$
declare
  v_bu uuid;
  v_cat_rice uuid;
  v_cat_bev uuid;
  v_cat_dairy uuid;
  v_cat_oil uuid;
  v_cat_hh uuid;
  v_sup uuid;
begin
  select id into v_bu from public.business_units where code = 'supermarket' limit 1;
  if v_bu is null then
    raise notice 'Supermarket business unit missing — skip seed';
    return;
  end if;

  select id into v_cat_rice from public.sm_categories where business_unit_id = v_bu and name = 'Rice & Grains';
  select id into v_cat_bev from public.sm_categories where business_unit_id = v_bu and name = 'Beverages';
  select id into v_cat_dairy from public.sm_categories where business_unit_id = v_bu and name = 'Dairy';
  select id into v_cat_oil from public.sm_categories where business_unit_id = v_bu and name = 'Cooking Oil';
  select id into v_cat_hh from public.sm_categories where business_unit_id = v_bu and name = 'Household';

  insert into public.sm_suppliers (business_unit_id, name, contact_person, phone, status)
  values (v_bu, 'Bakhresa Food Products', 'Amina Juma', '+255712000001', 'ACTIVE')
  on conflict (business_unit_id, name) do nothing;

  select id into v_sup from public.sm_suppliers where business_unit_id = v_bu and name = 'Bakhresa Food Products';

  insert into public.sm_products (
    business_unit_id, category_id, supplier_id, name, sku, barcode, unit,
    buying_price, selling_price, reorder_level, track_expiry, is_active
  )
  values
    (v_bu, v_cat_rice, v_sup, 'Bakhresa Rice 5kg', 'SKU-RICE-5', '6001001001001', 'Bag', 12000, 15000, 20, false, true),
    (v_bu, v_cat_rice, v_sup, 'Azam Flour 2kg', 'SKU-FLOUR-2', '6001001001002', 'Bag', 3500, 4500, 30, false, true),
    (v_bu, v_cat_bev, v_sup, 'Coca-Cola 500ml', 'SKU-COKE-500', '6001001001003', 'Bottle', 800, 1200, 48, false, true),
    (v_bu, v_cat_dairy, v_sup, 'Tanga Fresh Milk 1L', 'SKU-MILK-1', '6001001001004', 'Bottle', 2200, 2800, 24, true, true),
    (v_bu, v_cat_oil, v_sup, 'Sunflower Oil 2L', 'SKU-OIL-2', '6001001001005', 'Bottle', 7500, 9500, 15, false, true),
    (v_bu, v_cat_hh, v_sup, 'Omo Detergent 1kg', 'SKU-OMO-1', '6001001001006', 'Pack', 4500, 5800, 20, false, true)
  on conflict (business_unit_id, sku) do nothing;

  insert into public.sm_stock_batches (
    business_unit_id, product_id, batch_number, quantity, location, buying_price, supplier_id
  )
  select
    v_bu,
    p.id,
    'OPENING',
    case
      when p.sku = 'SKU-COKE-500' then 120
      when p.sku = 'SKU-MILK-1' then 40
      when p.sku = 'SKU-RICE-5' then 35
      else 50
    end,
    'Main Store',
    p.buying_price,
    v_sup
  from public.sm_products p
  where p.business_unit_id = v_bu
    and p.sku in ('SKU-RICE-5','SKU-FLOUR-2','SKU-COKE-500','SKU-MILK-1','SKU-OIL-2','SKU-OMO-1')
    and not exists (
      select 1 from public.sm_stock_batches b where b.product_id = p.id and b.quantity > 0
    );
end $$;
