-- Atomic stock-reconciliation posting through existing sm_adjust_stock.
-- Idempotent: a second call on an already-posted row does not adjust stock again.

create or replace function public.sm_post_stock_reconciliation(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bu uuid := public.supermarket_business_unit_id();
  v_row public.sm_stock_reconciliations%rowtype;
  v_item public.sm_stock_reconciliation_items%rowtype;
  v_adj uuid;
  v_qty integer;
begin
  if not public.has_supermarket_access() then
    raise exception 'Not authorized';
  end if;

  select * into v_row
  from public.sm_stock_reconciliations
  where id = p_id and business_unit_id = v_bu
  for update;

  if not found then
    raise exception 'Stock reconciliation not found';
  end if;
  if v_row.status = 'VOID' then
    raise exception 'This stocktake is void';
  end if;
  if v_row.status = 'POSTED' then
    return 'ALREADY_POSTED';
  end if;
  if v_row.status <> 'APPROVED' then
    raise exception 'Stock variances can be posted only after approval';
  end if;

  perform public.sm_assert_sod(v_row.prepared_by, 'reconciliation');

  for v_item in
    select *
    from public.sm_stock_reconciliation_items
    where reconciliation_id = v_row.id
    for update
  loop
    if v_item.posted_adjustment_id is not null then
      continue;
    end if;
    if coalesce(v_item.variance_qty, 0) = 0 then
      continue;
    end if;
    if v_item.physical_qty is null then
      raise exception 'Physical count is required before posting';
    end if;

    v_qty := abs(v_item.variance_qty);
    v_adj := public.sm_adjust_stock(
      v_item.product_id,
      'Correction',
      v_qty,
      'Main Store',
      coalesce(nullif(trim(v_item.reason), ''), 'Stock count variance'),
      'STOCKTAKE:' || v_row.id::text,
      case when v_item.variance_qty > 0 then 'increase' else 'decrease' end
    );

    update public.sm_stock_reconciliation_items
    set posted_adjustment_id = v_adj
    where id = v_item.id
      and posted_adjustment_id is null;
  end loop;

  update public.sm_stock_reconciliations
  set
    status = 'POSTED',
    posted_by = auth.uid(),
    posted_at = now(),
    updated_at = now()
  where id = v_row.id
    and status = 'APPROVED';

  if not found then
    return 'ALREADY_POSTED';
  end if;

  return 'POSTED';
end;
$$;

grant execute on function public.sm_post_stock_reconciliation(uuid) to authenticated, service_role;
