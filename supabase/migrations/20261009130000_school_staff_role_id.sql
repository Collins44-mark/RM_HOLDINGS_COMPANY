-- Link School Staff to the centralized RBAC role without duplicating a role catalog.

alter table public.sch_staff
  add column if not exists role_id uuid references public.roles(id) on delete restrict;

alter table public.sch_staff
  alter column position_id drop not null;

create index if not exists sch_staff_role_idx
  on public.sch_staff (business_unit_id, role_id)
  where role_id is not null;
