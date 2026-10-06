-- Controlled loss / damage / expiry write-offs.
-- Drafts do not change stock. Posting reuses public.sm_adjust_stock (existing inventory engine).

insert into public.permissions (code, module, resource, action, name)
values
  ('supermarket.stock.approve', 'supermarket', 'stock', 'approve', 'Approve and post inventory loss, damage and expiry')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, 'supermarket.stock.approve'
from public.roles r
where r.code in ('SUPERMARKET_MANAGER', 'STOREKEEPER')
on conflict do nothing;

create table if not exists public.sm_stock_loss_events (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  event_number text not null,
  event_type text not null check (event_type in ('LOSS', 'DAMAGE', 'EXPIRED')),
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'SUBMITTED', 'APPROVED', 'POSTED')),
  product_id uuid not null references public.sm_products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  location text not null default 'Main Store' check (location in ('Main Store', 'Sales Floor')),
  event_date date not null default (timezone('Africa/Dar_es_Salaam', now()))::date,
  reason text not null,
  notes text not null default '',
  unit_cost numeric(14, 2) not null default 0 check (unit_cost >= 0),
  prepared_by uuid references public.profiles(id) on delete set null,
  submitted_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  posted_adjustment_id uuid references public.sm_stock_adjustments(id) on delete set null,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_unit_id, event_number),
  unique (posted_adjustment_id)
);

create index if not exists sm_stock_loss_events_bu_status_idx
  on public.sm_stock_loss_events (business_unit_id, status, created_at desc);
create index if not exists sm_stock_loss_events_product_idx
  on public.sm_stock_loss_events (product_id);

alter table public.sm_stock_loss_events enable row level security;

drop policy if exists sm_stock_loss_events_select on public.sm_stock_loss_events;
create policy sm_stock_loss_events_select on public.sm_stock_loss_events
  for select to authenticated using (public.has_business_unit_access(business_unit_id));
drop policy if exists sm_stock_loss_events_insert on public.sm_stock_loss_events;
create policy sm_stock_loss_events_insert on public.sm_stock_loss_events
  for insert to authenticated with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sm_stock_loss_events_update on public.sm_stock_loss_events;
create policy sm_stock_loss_events_update on public.sm_stock_loss_events
  for update to authenticated
  using (public.has_business_unit_access(business_unit_id))
  with check (public.has_business_unit_access(business_unit_id));
drop policy if exists sm_stock_loss_events_delete on public.sm_stock_loss_events;
create policy sm_stock_loss_events_delete on public.sm_stock_loss_events
  for delete to authenticated using (public.has_business_unit_access(business_unit_id));

revoke all on public.sm_stock_loss_events from anon, public;
grant select, insert, update, delete on public.sm_stock_loss_events to authenticated;

create or replace function public.sm_approve_stock_loss_event(p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bu uuid := public.supermarket_business_unit_id();
  v_row public.sm_stock_loss_events%rowtype;
begin
  if not public.has_supermarket_access() then
    raise exception 'Not authorized';
  end if;

  select * into v_row
  from public.sm_stock_loss_events
  where id = p_event_id and business_unit_id = v_bu
  for update;

  if not found then
    raise exception 'Inventory event not found';
  end if;
  if v_row.status <> 'SUBMITTED' then
    raise exception 'Only submitted events can be approved';
  end if;
  if v_row.prepared_by = auth.uid() and not public.is_owner() then
    raise exception 'Self-approval is not allowed';
  end if;

  update public.sm_stock_loss_events
  set
    status = 'APPROVED',
    approved_by = auth.uid(),
    approved_at = now(),
    updated_at = now()
  where id = v_row.id;

  return v_row.id;
end;
$$;

create or replace function public.sm_post_stock_loss_event(p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bu uuid := public.supermarket_business_unit_id();
  v_row public.sm_stock_loss_events%rowtype;
  v_kind text;
  v_adj uuid;
begin
  if not public.has_supermarket_access() then
    raise exception 'Not authorized';
  end if;

  select * into v_row
  from public.sm_stock_loss_events
  where id = p_event_id and business_unit_id = v_bu
  for update;

  if not found then
    raise exception 'Inventory event not found';
  end if;
  if v_row.status = 'POSTED' or v_row.posted_adjustment_id is not null then
    raise exception 'This inventory event has already been posted';
  end if;
  if v_row.status <> 'APPROVED' then
    raise exception 'Only approved events can be posted';
  end if;

  v_kind := case v_row.event_type
    when 'LOSS' then 'Lost'
    when 'DAMAGE' then 'Damage'
    when 'EXPIRED' then 'Expired'
  end;

  v_adj := public.sm_adjust_stock(
    v_row.product_id,
    v_kind,
    v_row.quantity,
    v_row.location,
    v_row.reason,
    v_row.notes,
    'decrease'
  );

  update public.sm_stock_loss_events
  set
    status = 'POSTED',
    posted_adjustment_id = v_adj,
    posted_at = now(),
    updated_at = now()
  where id = v_row.id;

  return v_adj;
end;
$$;

grant execute on function public.sm_approve_stock_loss_event(uuid) to authenticated;
grant execute on function public.sm_post_stock_loss_event(uuid) to authenticated;
