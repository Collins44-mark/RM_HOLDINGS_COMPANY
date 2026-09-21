-- Supermarket production stability:
-- 1) Re-assert table GRANTs (42501 "permission denied for table" is privileges, not empty data).
-- 2) Align RLS helper with app auth: Owner/Super Admin via is_owner() OR JWT role_code,
--    supermarket staff via user_business_units OR JWT modules for the supermarket BU.
-- Does NOT disable RLS. Does NOT grant public/anon access.

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Access helpers (keep security definer; do not broaden beyond app model)
-- ---------------------------------------------------------------------------

create or replace function public.jwt_has_supermarket_module()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from jsonb_array_elements_text(
      case
        when jsonb_typeof(coalesce(auth.jwt() -> 'app_metadata' -> 'modules', '[]'::jsonb)) = 'array'
          then coalesce(auth.jwt() -> 'app_metadata' -> 'modules', '[]'::jsonb)
        else '[]'::jsonb
      end
    ) as module(code)
    where module.code in ('*', 'supermarket')
  );
$$;

create or replace function public.jwt_is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role_code', '') in ('SUPER_ADMIN', 'OWNER');
$$;

create or replace function public.has_business_unit_access(p_business_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when p_business_unit_id is null then false
      -- Platform owners (DB profile and/or JWT claims used by the app)
      when public.is_owner() then true
      when public.jwt_is_platform_owner() then true
      -- Explicit business-unit membership
      when exists (
        select 1
        from public.user_business_units ubu
        where ubu.user_id = auth.uid()
          and ubu.business_unit_id = p_business_unit_id
      ) then true
      -- Supermarket module grant in JWT for the supermarket BU only
      when p_business_unit_id = public.supermarket_business_unit_id()
        and public.jwt_has_supermarket_module() then true
      else false
    end;
$$;

create or replace function public.has_supermarket_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_owner()
    or public.jwt_is_platform_owner()
    or public.jwt_has_supermarket_module()
    or public.has_business_unit_access(public.supermarket_business_unit_id());
$$;

grant execute on function public.jwt_has_supermarket_module() to authenticated, service_role;
grant execute on function public.jwt_is_platform_owner() to authenticated, service_role;
grant execute on function public.has_business_unit_access(uuid) to authenticated, service_role;
grant execute on function public.supermarket_business_unit_id() to authenticated, service_role;
grant execute on function public.has_supermarket_access() to authenticated, service_role;
grant execute on function public.sm_next_document_number(text, text) to authenticated, service_role;
grant execute on function public.sm_product_stock(uuid) to authenticated, service_role;
grant execute on function public.sm_complete_sale(jsonb, jsonb, text, numeric, numeric, text) to authenticated, service_role;
grant execute on function public.sm_adjust_stock(uuid, text, integer, text, text, text, text) to authenticated, service_role;
grant execute on function public.sm_receive_purchase_order(uuid, jsonb, text) to authenticated, service_role;
grant execute on function public.sm_process_sales_return(uuid, jsonb, text, text) to authenticated, service_role;
