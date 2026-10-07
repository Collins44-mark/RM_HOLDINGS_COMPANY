-- School academic structure: Levels (existing sch_class_levels) → Classes (sch_classes).
-- Additive. No seeds. No physical deletes.

insert into public.permissions (code, module, resource, action, name)
values
  ('school.classes.view', 'school', 'classes', 'view', 'View school classes'),
  ('school.classes.manage', 'school', 'classes', 'manage', 'Manage school classes')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code in ('SCHOOL_ADMIN', 'SCHOOL_MANAGER')
  and p.code in ('school.classes.view', 'school.classes.manage')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code = 'TEACHER'
  and p.code = 'school.classes.view'
on conflict do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sch_class_levels_id_bu_key'
  ) then
    alter table public.sch_class_levels
      add constraint sch_class_levels_id_bu_key unique (id, business_unit_id);
  end if;
end
$$;

create table if not exists public.sch_classes (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  level_id uuid not null references public.sch_class_levels(id) on delete restrict,
  name text not null,
  code text not null,
  sort_order integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_classes_name_len check (char_length(btrim(name)) between 1 and 80),
  constraint sch_classes_code_len check (char_length(btrim(code)) between 1 and 40),
  constraint sch_classes_sort check (sort_order >= 1),
  constraint sch_classes_level_bu_fk foreign key (level_id, business_unit_id)
    references public.sch_class_levels (id, business_unit_id) on delete restrict
);

create unique index if not exists sch_classes_level_code_uidx
  on public.sch_classes (level_id, lower(btrim(code)));

drop trigger if exists sch_classes_touch on public.sch_classes;
create trigger sch_classes_touch before update on public.sch_classes
  for each row execute function public.sch_touch_updated_at();

alter table public.sch_classes enable row level security;
revoke all on public.sch_classes from anon, public;
grant select, insert, update on public.sch_classes to authenticated, service_role;

drop policy if exists sch_classes_select on public.sch_classes;
create policy sch_classes_select on public.sch_classes
  for select to authenticated
  using (public.has_business_unit_access(business_unit_id));

drop policy if exists sch_classes_insert on public.sch_classes;
create policy sch_classes_insert on public.sch_classes
  for insert to authenticated
  with check (public.has_business_unit_access(business_unit_id));

drop policy if exists sch_classes_update on public.sch_classes;
create policy sch_classes_update on public.sch_classes
  for update to authenticated
  using (public.has_business_unit_access(business_unit_id))
  with check (public.has_business_unit_access(business_unit_id));

drop policy if exists sch_classes_delete on public.sch_classes;
create policy sch_classes_delete on public.sch_classes
  for delete to authenticated
  using (false);
