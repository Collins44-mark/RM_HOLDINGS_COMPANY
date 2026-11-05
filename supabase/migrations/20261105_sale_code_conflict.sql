-- Resolve a honey sale code inside the stock lock.
-- Two sales submitted together keep one row each and never share a code.

create or replace function public.bee_create_sale(
  p_business_unit_id uuid,
  p_created_by uuid,
  p_sale_code text,
  p_sale_date date,
  p_quantity_kg numeric,
  p_price_per_kg numeric,
  p_customer_name text,
  p_phone text,
  p_notes text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  available numeric;
  sale_id uuid;
  need numeric;
  take numeric;
  row_harvest record;
begin
  if p_quantity_kg is null or p_quantity_kg <= 0 then
    raise exception 'Honey quantity must be greater than zero';
  end if;
  if p_price_per_kg is null or p_price_per_kg < 0 then
    raise exception 'Price per kg must be a valid amount';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_business_unit_id::text || ':bee-stock'));

  loop
    exit when not exists (
      select 1 from bee_sales
      where business_unit_id = p_business_unit_id and sale_code = p_sale_code
    );
    select 'SALE-' || lpad((coalesce(max((regexp_match(sale_code, '^SALE-([0-9]+)$'))[1]::int), 0) + 1)::text, 3, '0')
      into p_sale_code
    from bee_sales
    where business_unit_id = p_business_unit_id;
  end loop;

  select coalesce(sum(h.quantity_kg - coalesce(a.allocated, 0)), 0)
    into available
  from bee_harvests h
  left join (
    select harvest_id, sum(quantity_kg) as allocated
    from bee_stock_allocations
    where business_unit_id = p_business_unit_id and status = 'Active'
    group by harvest_id
  ) a on a.harvest_id = h.id
  where h.business_unit_id = p_business_unit_id and h.status = 'Valid';

  if p_quantity_kg > available then
    raise exception 'Not enough honey stock';
  end if;

  insert into bee_sales (
    business_unit_id, sale_code, sale_date, customer_name, phone, quantity_kg, price_per_kg, total_amount, status, notes, created_by
  ) values (
    p_business_unit_id, p_sale_code, p_sale_date, coalesce(p_customer_name, ''), coalesce(p_phone, ''),
    p_quantity_kg, p_price_per_kg, round(p_quantity_kg * p_price_per_kg, 2), 'Unpaid', coalesce(p_notes, ''), p_created_by
  ) returning id into sale_id;

  need := p_quantity_kg;
  for row_harvest in
    select h.id, h.quantity_kg - coalesce(a.allocated, 0) as remaining
    from bee_harvests h
    left join (
      select harvest_id, sum(quantity_kg) as allocated
      from bee_stock_allocations
      where business_unit_id = p_business_unit_id and status = 'Active'
      group by harvest_id
    ) a on a.harvest_id = h.id
    where h.business_unit_id = p_business_unit_id
      and h.status = 'Valid'
      and h.quantity_kg - coalesce(a.allocated, 0) > 0
    order by h.harvest_date, h.created_at
    for update of h
  loop
    exit when need <= 0;
    take := least(need, row_harvest.remaining);
    insert into bee_stock_allocations (business_unit_id, sale_id, harvest_id, quantity_kg, allocation_date, status)
    values (p_business_unit_id, sale_id, row_harvest.id, take, p_sale_date, 'Active');
    need := need - take;
  end loop;

  if need > 0.0001 then
    raise exception 'Not enough honey stock';
  end if;

  return jsonb_build_object('id', sale_id);
end;
$$;
