-- School Store & Inventory + Emergency Fund.
-- Additive. Reuses sch_expenses, sch_fee_charges, sch_fee_payments. No supermarket tables.

insert into public.permissions (code, module, resource, action, name)
values
  ('school.store.view', 'school', 'store', 'view', 'View school store and inventory'),
  ('school.store.manage', 'school', 'store', 'manage', 'Manage school store items and stock'),
  ('school.store.sell', 'school', 'store', 'sell', 'Sell school store items to students'),
  ('school.store.issue', 'school', 'store', 'issue', 'Issue school store items for school use')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code in ('SCHOOL_ADMIN', 'SCHOOL_MANAGER')
  and p.code in ('school.store.view', 'school.store.manage', 'school.store.sell', 'school.store.issue')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code = 'SCHOOL_ACCOUNTANT'
  and p.code in ('school.store.view', 'school.store.sell', 'school.store.issue')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code = 'HEADMASTER'
  and p.code = 'school.store.view'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code = 'ADMISSIONS_OFFICER'
  and p.code in ('school.store.view', 'school.store.sell')
on conflict do nothing;

alter table public.sch_expenses drop constraint if exists sch_expenses_source;
alter table public.sch_expenses
  add constraint sch_expenses_source
  check (source_type in (
    'MANUAL', 'TRANSPORT_FUEL', 'TRANSPORT_MAINTENANCE', 'SALARY',
    'STORE_ISSUE', 'STORE_COGS', 'EMERGENCY'
  ));

create table if not exists public.sch_store_items (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  sku text not null,
  name text not null,
  category text not null,
  unit text not null default 'pcs',
  variant text not null default '',
  purchase_cost numeric(14, 2) not null default 0,
  selling_price numeric(14, 2) not null default 0,
  avg_unit_cost numeric(14, 2) not null default 0,
  qty_on_hand numeric(14, 3) not null default 0,
  qty_in_custody numeric(14, 3) not null default 0,
  low_stock numeric(14, 3) not null default 0,
  is_durable boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_store_items_category_chk check (category in ('UNIFORM', 'STATIONERY', 'EQUIPMENT')),
  constraint sch_store_items_sku_len check (char_length(btrim(sku)) between 1 and 40),
  constraint sch_store_items_name_len check (char_length(btrim(name)) between 2 and 120),
  constraint sch_store_items_unit_len check (char_length(btrim(unit)) between 1 and 24),
  constraint sch_store_items_qty_chk check (qty_on_hand >= 0 and qty_in_custody >= 0 and low_stock >= 0),
  constraint sch_store_items_price_chk check (purchase_cost >= 0 and selling_price >= 0 and avg_unit_cost >= 0)
);

create unique index if not exists sch_store_items_sku_uidx
  on public.sch_store_items (business_unit_id, lower(btrim(sku)));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sch_store_items_id_bu_key') then
    alter table public.sch_store_items
      add constraint sch_store_items_id_bu_key unique (id, business_unit_id);
  end if;
end
$$;

create table if not exists public.sch_store_sales (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  sale_number text not null,
  student_id uuid not null,
  enrollment_id uuid not null,
  admission_id uuid,
  charge_id uuid,
  sale_date date not null,
  subtotal numeric(14, 2) not null,
  paid_amount numeric(14, 2) not null default 0,
  cost_of_goods numeric(14, 2) not null default 0,
  status text not null default 'outstanding',
  request_id uuid not null,
  recorded_by uuid references public.profiles(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint sch_store_sales_status_chk check (status in ('outstanding', 'partial', 'paid')),
  constraint sch_store_sales_amounts_chk check (subtotal >= 0 and paid_amount >= 0 and cost_of_goods >= 0),
  constraint sch_store_sales_student_fk foreign key (student_id, business_unit_id)
    references public.sch_students (id, business_unit_id) on delete restrict,
  constraint sch_store_sales_enrollment_fk foreign key (enrollment_id, business_unit_id)
    references public.sch_student_enrollments (id, business_unit_id) on delete restrict
);

create unique index if not exists sch_store_sales_request_uidx
  on public.sch_store_sales (business_unit_id, request_id);

create unique index if not exists sch_store_sales_number_uidx
  on public.sch_store_sales (business_unit_id, sale_number);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sch_store_sales_id_bu_key') then
    alter table public.sch_store_sales
      add constraint sch_store_sales_id_bu_key unique (id, business_unit_id);
  end if;
end
$$;

create table if not exists public.sch_store_sale_lines (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  sale_id uuid not null,
  item_id uuid not null,
  quantity numeric(14, 3) not null,
  unit_price numeric(14, 2) not null,
  line_total numeric(14, 2) not null,
  unit_cost numeric(14, 2) not null,
  line_cost numeric(14, 2) not null,
  constraint sch_store_sale_lines_qty_chk check (quantity > 0),
  constraint sch_store_sale_lines_sale_fk foreign key (sale_id, business_unit_id)
    references public.sch_store_sales (id, business_unit_id) on delete cascade,
  constraint sch_store_sale_lines_item_fk foreign key (item_id, business_unit_id)
    references public.sch_store_items (id, business_unit_id) on delete restrict
);

create table if not exists public.sch_store_movements (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  item_id uuid not null,
  movement_type text not null,
  quantity numeric(14, 3) not null,
  unit_cost numeric(14, 2) not null default 0,
  occurred_on date not null,
  reference text not null default '',
  notes text not null default '',
  supplier text not null default '',
  recipient text not null default '',
  location text not null default '',
  sale_id uuid,
  expense_id uuid,
  request_id uuid not null,
  recorded_by uuid references public.profiles(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint sch_store_movements_type_chk check (movement_type in ('RECEIVE', 'SALE', 'ISSUE', 'CUSTODY', 'ADJUST', 'REVERSE')),
  constraint sch_store_movements_qty_chk check (quantity > 0),
  constraint sch_store_movements_item_fk foreign key (item_id, business_unit_id)
    references public.sch_store_items (id, business_unit_id) on delete restrict,
  constraint sch_store_movements_sale_fk foreign key (sale_id, business_unit_id)
    references public.sch_store_sales (id, business_unit_id) on delete restrict
);

create unique index if not exists sch_store_movements_request_uidx
  on public.sch_store_movements (business_unit_id, request_id);

create index if not exists sch_store_movements_bu_date_idx
  on public.sch_store_movements (business_unit_id, occurred_on desc, created_at desc);

create table if not exists public.sch_emergency_fund_entries (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  entry_kind text not null,
  amount numeric(14, 2) not null,
  occurred_on date not null,
  reference text not null default '',
  notes text not null default '',
  expense_id uuid,
  request_id uuid not null,
  recorded_by uuid references public.profiles(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint sch_emergency_fund_kind_chk check (entry_kind in ('OPENING', 'REPLENISH', 'SPEND')),
  constraint sch_emergency_fund_amount_chk check (amount > 0),
  constraint sch_emergency_fund_expense_fk foreign key (expense_id)
    references public.sch_expenses (id) on delete restrict
);

create unique index if not exists sch_emergency_fund_request_uidx
  on public.sch_emergency_fund_entries (business_unit_id, request_id);

create unique index if not exists sch_emergency_fund_opening_uidx
  on public.sch_emergency_fund_entries (business_unit_id)
  where entry_kind = 'OPENING' and is_active;

create index if not exists sch_emergency_fund_bu_date_idx
  on public.sch_emergency_fund_entries (business_unit_id, occurred_on desc, created_at desc);

alter table public.sch_fee_charges
  add column if not exists store_sale_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sch_fee_charges_store_sale_fk') then
    alter table public.sch_fee_charges
      add constraint sch_fee_charges_store_sale_fk
      foreign key (store_sale_id, business_unit_id)
      references public.sch_store_sales (id, business_unit_id) on delete restrict;
  end if;
end
$$;

alter table public.sch_fee_charges drop constraint if exists sch_fee_charges_kind_chk;
alter table public.sch_fee_charges
  add constraint sch_fee_charges_kind_chk
  check (charge_kind in ('TUITION', 'TRANSPORT', 'STORE'));

alter table public.sch_fee_charges drop constraint if exists sch_fee_charges_kind_shape_chk;
alter table public.sch_fee_charges
  add constraint sch_fee_charges_kind_shape_chk
  check (
    (charge_kind = 'TUITION' and fee_structure_id is not null and route_id is null and store_sale_id is null)
    or
    (charge_kind = 'TRANSPORT' and fee_structure_id is null and route_id is not null and billing_period is not null and store_sale_id is null)
    or
    (charge_kind = 'STORE' and fee_structure_id is null and route_id is null and store_sale_id is not null)
  );

create unique index if not exists sch_fee_charges_store_sale_uidx
  on public.sch_fee_charges (store_sale_id)
  where is_active and charge_kind = 'STORE';

create or replace view public.sch_v_fee_accounts
with (security_invoker = true) as
select
  e.id as enrollment_id,
  e.business_unit_id,
  e.student_id,
  e.academic_year_id,
  e.term_id as enrollment_term_id,
  e.stream_id,
  s.student_number,
  btrim(concat_ws(' ', s.first_name, nullif(btrim(s.middle_name), ''), s.last_name)) as student_name,
  s.first_name,
  s.middle_name,
  s.last_name,
  a.admission_number,
  st.name as stream_name,
  cl.id as class_id,
  cl.name as class_name,
  cl.level_id,
  lv.name as level_name,
  y.name as academic_year_name,
  fs.id as fee_structure_id,
  tuition.charge_id,
  (
    case
      when tuition.billed_amount is null
        and coalesce(transport.due_amount, 0::numeric(14, 2)) = 0::numeric(14, 2)
        and coalesce(store.due_amount, 0::numeric(14, 2)) = 0::numeric(14, 2)
        and fs.annual_amount is null then null
      else coalesce(tuition.billed_amount, fs.annual_amount, 0::numeric(14, 2))
        + coalesce(transport.due_amount, 0::numeric(14, 2))
        + coalesce(store.due_amount, 0::numeric(14, 2))
    end
  )::numeric(14, 2) as due_amount,
  (
    coalesce(tuition.paid_amount, 0::numeric(14, 2))
    + coalesce(transport.paid_amount, 0::numeric(14, 2))
    + coalesce(store.paid_amount, 0::numeric(14, 2))
  )::numeric(14, 2) as paid_amount,
  (
    case
      when tuition.billed_amount is null
        and coalesce(transport.due_amount, 0) = 0
        and coalesce(store.due_amount, 0) = 0
        and fs.annual_amount is null then null
      else greatest(
        coalesce(tuition.billed_amount, fs.annual_amount, 0)
        + coalesce(transport.due_amount, 0)
        + coalesce(store.due_amount, 0)
        - coalesce(tuition.paid_amount, 0)
        - coalesce(transport.paid_amount, 0)
        - coalesce(store.paid_amount, 0),
        0
      )
    end
  )::numeric as outstanding_amount,
  case
    when fs.id is null and tuition.charge_id is null
      and coalesce(transport.due_amount, 0) = 0
      and coalesce(store.due_amount, 0) = 0 then 'no_structure'
    when (
      coalesce(tuition.billed_amount, fs.annual_amount, 0)
      + coalesce(transport.due_amount, 0)
      + coalesce(store.due_amount, 0)
      - coalesce(tuition.paid_amount, 0)
      - coalesce(transport.paid_amount, 0)
      - coalesce(store.paid_amount, 0)
    ) <= 0 then 'paid'
    when coalesce(tuition.paid_amount, 0) + coalesce(transport.paid_amount, 0) + coalesce(store.paid_amount, 0) > 0 then 'partial'
    else 'outstanding'
  end as fee_status,
  cl.code as class_code,
  s.status as student_status,
  tuition.billed_amount as tuition_due_amount,
  tuition.paid_amount as tuition_paid_amount,
  transport.due_amount as transport_due_amount,
  transport.paid_amount as transport_paid_amount
from public.sch_student_enrollments e
join public.sch_students s
  on s.id = e.student_id
 and s.business_unit_id = e.business_unit_id
left join public.sch_admissions a
  on a.student_id = s.id
 and a.business_unit_id = e.business_unit_id
left join public.sch_class_streams st
  on st.id = e.stream_id
 and st.business_unit_id = e.business_unit_id
join public.sch_classes cl
  on cl.id = e.class_id
 and cl.business_unit_id = e.business_unit_id
join public.sch_class_levels lv
  on lv.id = cl.level_id
 and lv.business_unit_id = e.business_unit_id
join public.sch_academic_years y
  on y.id = e.academic_year_id
 and y.business_unit_id = e.business_unit_id
left join public.sch_fee_structures fs
  on fs.business_unit_id = e.business_unit_id
 and fs.academic_year_id = e.academic_year_id
 and fs.class_id = cl.id
 and fs.is_active
left join public.sch_v_fee_charge_balances tuition
  on tuition.enrollment_id = e.id
 and tuition.is_active
 and tuition.charge_kind = 'TUITION'
left join lateral (
  select
    coalesce(sum(b.billed_amount), 0)::numeric(14, 2) as due_amount,
    coalesce(sum(b.paid_amount), 0)::numeric(14, 2) as paid_amount
  from public.sch_v_fee_charge_balances b
  where b.enrollment_id = e.id
    and b.is_active
    and b.charge_kind = 'TRANSPORT'
) transport on true
left join lateral (
  select
    coalesce(sum(b.billed_amount), 0)::numeric(14, 2) as due_amount,
    coalesce(sum(b.paid_amount), 0)::numeric(14, 2) as paid_amount
  from public.sch_v_fee_charge_balances b
  where b.enrollment_id = e.id
    and b.is_active
    and b.charge_kind = 'STORE'
) store on true
where e.status = 'active'
  and s.status = 'active';

grant select on public.sch_v_fee_accounts to authenticated, service_role;

alter table public.sch_store_items enable row level security;
alter table public.sch_store_sales enable row level security;
alter table public.sch_store_sale_lines enable row level security;
alter table public.sch_store_movements enable row level security;
alter table public.sch_emergency_fund_entries enable row level security;

revoke all on public.sch_store_items from anon, public;
revoke all on public.sch_store_sales from anon, public;
revoke all on public.sch_store_sale_lines from anon, public;
revoke all on public.sch_store_movements from anon, public;
revoke all on public.sch_emergency_fund_entries from anon, public;

grant select, insert, update on public.sch_store_items to authenticated;
grant select, insert, update on public.sch_store_sales to authenticated;
grant select, insert, update on public.sch_store_sale_lines to authenticated;
grant select, insert, update on public.sch_store_movements to authenticated;
grant select, insert, update on public.sch_emergency_fund_entries to authenticated;

create policy sch_store_items_select on public.sch_store_items for select to authenticated using (public.has_business_unit_access(business_unit_id));
create policy sch_store_items_insert on public.sch_store_items for insert to authenticated with check (public.has_business_unit_access(business_unit_id));
create policy sch_store_items_update on public.sch_store_items for update to authenticated using (public.has_business_unit_access(business_unit_id)) with check (public.has_business_unit_access(business_unit_id));
create policy sch_store_items_delete on public.sch_store_items for delete to authenticated using (false);

create policy sch_store_sales_select on public.sch_store_sales for select to authenticated using (public.has_business_unit_access(business_unit_id));
create policy sch_store_sales_insert on public.sch_store_sales for insert to authenticated with check (public.has_business_unit_access(business_unit_id));
create policy sch_store_sales_update on public.sch_store_sales for update to authenticated using (public.has_business_unit_access(business_unit_id)) with check (public.has_business_unit_access(business_unit_id));
create policy sch_store_sales_delete on public.sch_store_sales for delete to authenticated using (false);

create policy sch_store_sale_lines_select on public.sch_store_sale_lines for select to authenticated using (public.has_business_unit_access(business_unit_id));
create policy sch_store_sale_lines_insert on public.sch_store_sale_lines for insert to authenticated with check (public.has_business_unit_access(business_unit_id));
create policy sch_store_sale_lines_update on public.sch_store_sale_lines for update to authenticated using (public.has_business_unit_access(business_unit_id)) with check (public.has_business_unit_access(business_unit_id));
create policy sch_store_sale_lines_delete on public.sch_store_sale_lines for delete to authenticated using (false);

create policy sch_store_movements_select on public.sch_store_movements for select to authenticated using (public.has_business_unit_access(business_unit_id));
create policy sch_store_movements_insert on public.sch_store_movements for insert to authenticated with check (public.has_business_unit_access(business_unit_id));
create policy sch_store_movements_update on public.sch_store_movements for update to authenticated using (public.has_business_unit_access(business_unit_id)) with check (public.has_business_unit_access(business_unit_id));
create policy sch_store_movements_delete on public.sch_store_movements for delete to authenticated using (false);

create policy sch_emergency_fund_select on public.sch_emergency_fund_entries for select to authenticated using (public.has_business_unit_access(business_unit_id));
create policy sch_emergency_fund_insert on public.sch_emergency_fund_entries for insert to authenticated with check (public.has_business_unit_access(business_unit_id));
create policy sch_emergency_fund_update on public.sch_emergency_fund_entries for update to authenticated using (public.has_business_unit_access(business_unit_id)) with check (public.has_business_unit_access(business_unit_id));
create policy sch_emergency_fund_delete on public.sch_emergency_fund_entries for delete to authenticated using (false);

create or replace function public.sch_emergency_fund_balance(p_bu uuid)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum(
    case
      when entry_kind in ('OPENING', 'REPLENISH') then amount
      else -amount
    end
  ), 0)::numeric(14, 2)
  from public.sch_emergency_fund_entries
  where business_unit_id = p_bu
    and is_active;
$$;

grant execute on function public.sch_emergency_fund_balance(uuid) to authenticated, service_role;
