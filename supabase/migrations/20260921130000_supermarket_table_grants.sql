-- Fix table privileges for supermarket module (genuine defect: RLS policies exist but roles lacked GRANT).
-- Required for authenticated app access and service-role admin clients.

grant select, insert, update, delete on table
  public.sm_categories,
  public.sm_suppliers,
  public.sm_products,
  public.sm_stock_batches,
  public.sm_stock_movements,
  public.sm_stock_adjustments,
  public.sm_purchase_orders,
  public.sm_purchase_order_items,
  public.sm_goods_receipts,
  public.sm_goods_receipt_items,
  public.sm_sales,
  public.sm_sale_items,
  public.sm_sale_payments,
  public.sm_sales_returns,
  public.sm_sales_return_items,
  public.sm_promotion_types,
  public.sm_promotions,
  public.sm_promotion_products,
  public.sm_promotion_categories,
  public.sm_promotion_tiers,
  public.sm_expenses,
  public.sm_payments,
  public.sm_document_counters
to authenticated, service_role;

grant usage, select on all sequences in schema public to authenticated, service_role;

grant execute on function public.has_business_unit_access(uuid) to authenticated, service_role;
grant execute on function public.supermarket_business_unit_id() to authenticated, service_role;
grant execute on function public.has_supermarket_access() to authenticated, service_role;
grant execute on function public.sm_next_document_number(text, text) to authenticated, service_role;
grant execute on function public.sm_product_stock(uuid) to authenticated, service_role;
grant execute on function public.sm_complete_sale(jsonb, jsonb, text, numeric, numeric, text) to authenticated, service_role;
grant execute on function public.sm_adjust_stock(uuid, text, integer, text, text, text, text) to authenticated, service_role;
grant execute on function public.sm_receive_purchase_order(uuid, jsonb, text) to authenticated, service_role;
grant execute on function public.sm_process_sales_return(uuid, jsonb, text, text) to authenticated, service_role;
