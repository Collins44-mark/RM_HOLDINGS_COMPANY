-- Owner-configured tax / VAT rules with transaction snapshots.
-- Sales tax is computed inside sm_complete_sale (NUMERIC). Client p_tax is ignored.

insert into public.permissions (code, module, resource, action, name)
values
  ('supermarket.tax.view', 'supermarket', 'tax', 'view', 'View tax configuration and tax reports'),
  ('supermarket.tax.manage', 'supermarket', 'tax', 'manage', 'Manage tax configuration')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, 'supermarket.tax.view'
from public.roles r
where r.code in ('SUPERMARKET_MANAGER')
on conflict do nothing;

create table if not exists public.sm_tax_rules (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  family_id uuid not null,
  tax_code text not null,
  name text not null,
  rate numeric(8, 4) not null check (rate >= 0 and rate <= 100),
  applies_to_sales boolean not null default false,
  applies_to_supplier_invoices boolean not null default false,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  effective_from date not null default (timezone('Africa/Dar_es_Salaam', now()))::date,
  effective_to date,
  notes text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  check (applies_to_sales or applies_to_supplier_invoices),
  unique (business_unit_id, tax_code, effective_from, created_at)
);

create index if not exists sm_tax_rules_bu_status_idx
  on public.sm_tax_rules (business_unit_id, status, effective_from desc);
create index if not exists sm_tax_rules_family_idx
  on public.sm_tax_rules (business_unit_id, family_id, effective_from desc);

create table if not exists public.sm_tax_applications (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  tax_rule_id uuid references public.sm_tax_rules(id) on delete restrict,
  source_type text not null check (source_type in ('SALE', 'SUPPLIER_INVOICE')),
  source_id uuid not null,
  source_number text not null default '',
  source_date date not null,
  tax_name text not null,
  tax_code text not null,
  tax_rate numeric(8, 4) not null,
  tax_base numeric(14, 2) not null default 0,
  tax_amount numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  unique (source_type, source_id, tax_rule_id)
);

create index if not exists sm_tax_applications_bu_date_idx
  on public.sm_tax_applications (business_unit_id, source_date desc, source_type);
create index if not exists sm_tax_applications_source_idx
  on public.sm_tax_applications (source_type, source_id);

alter table public.sm_tax_rules enable row level security;
alter table public.sm_tax_applications enable row level security;

drop policy if exists sm_tax_rules_select on public.sm_tax_rules;
create policy sm_tax_rules_select on public.sm_tax_rules
  for select to authenticated using (public.has_business_unit_access(business_unit_id));
drop policy if exists sm_tax_rules_insert on public.sm_tax_rules;
create policy sm_tax_rules_insert on public.sm_tax_rules
  for insert to authenticated with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sm_tax_rules_update on public.sm_tax_rules;
create policy sm_tax_rules_update on public.sm_tax_rules
  for update to authenticated
  using (public.has_business_unit_access(business_unit_id))
  with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sm_tax_rules_delete on public.sm_tax_rules;
create policy sm_tax_rules_delete on public.sm_tax_rules
  for delete to authenticated using (false);

drop policy if exists sm_tax_applications_select on public.sm_tax_applications;
create policy sm_tax_applications_select on public.sm_tax_applications
  for select to authenticated using (public.has_business_unit_access(business_unit_id));
drop policy if exists sm_tax_applications_insert on public.sm_tax_applications;
create policy sm_tax_applications_insert on public.sm_tax_applications
  for insert to authenticated with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sm_tax_applications_update on public.sm_tax_applications;
create policy sm_tax_applications_update on public.sm_tax_applications
  for update to authenticated
  using (public.has_business_unit_access(business_unit_id))
  with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sm_tax_applications_delete on public.sm_tax_applications;
create policy sm_tax_applications_delete on public.sm_tax_applications
  for delete to authenticated using (public.has_business_unit_access(business_unit_id));

revoke all on public.sm_tax_rules from anon, public;
revoke all on public.sm_tax_applications from anon, public;
grant select, insert, update on public.sm_tax_rules to authenticated;
grant select, insert, update, delete on public.sm_tax_applications to authenticated;

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
  tax_amount numeric
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
    round(coalesce(p_tax_base, 0), 2),
    round(round(coalesce(p_tax_base, 0), 2) * picked.rate / 100, 2)
  from (
    select distinct on (r.family_id)
      r.id,
      r.name,
      r.tax_code,
      r.rate
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
  for v_tax_line in
    select * from public.sm_tax_lines_for_scope(v_bu, 'SALES', v_sale_date, v_tax_base)
  loop
    insert into public.sm_tax_applications (
      business_unit_id, tax_rule_id, source_type, source_id, source_number, source_date,
      tax_name, tax_code, tax_rate, tax_base, tax_amount
    ) values (
      v_bu, v_tax_line.tax_rule_id, 'SALE', v_sale_id, v_invoice, v_sale_date,
      v_tax_line.tax_name, v_tax_line.tax_code, v_tax_line.tax_rate, v_tax_line.tax_base, v_tax_line.tax_amount
    );
    v_tax := v_tax + v_tax_line.tax_amount;
  end loop;

  v_total := greatest(0, v_subtotal - coalesce(p_discount, 0) + v_tax);

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
