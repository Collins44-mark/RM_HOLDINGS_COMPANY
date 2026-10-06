-- Additive catalog coverage for implemented Promotions and Stock Reconciliation.
-- Does not truncate roles, assignments, or operational supermarket data.

insert into public.permissions (code, module, resource, action, name)
values
  ('supermarket.promotions.view', 'supermarket', 'promotions', 'view', 'View promotions'),
  ('supermarket.promotions.create', 'supermarket', 'promotions', 'create', 'Create promotions'),
  ('supermarket.promotions.edit', 'supermarket', 'promotions', 'edit', 'Edit promotions'),
  ('supermarket.promotions.delete', 'supermarket', 'promotions', 'delete', 'Delete promotions'),
  ('supermarket.stock_reconciliation.view', 'supermarket', 'stock_reconciliation', 'view', 'View stock reconciliation'),
  ('supermarket.stock_reconciliation.create', 'supermarket', 'stock_reconciliation', 'create', 'Prepare stock reconciliation'),
  ('supermarket.stock_reconciliation.approve', 'supermarket', 'stock_reconciliation', 'approve', 'Approve stock reconciliation'),
  ('supermarket.stock_reconciliation.post', 'supermarket', 'stock_reconciliation', 'post', 'Post stock reconciliation')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code = 'SUPERMARKET_MANAGER'
  and (
    p.code like 'supermarket.promotions.%'
    or p.code like 'supermarket.stock_reconciliation.%'
  )
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code = 'STOREKEEPER'
  and p.code in (
    'supermarket.stock_reconciliation.view',
    'supermarket.stock_reconciliation.create'
  )
on conflict do nothing;
