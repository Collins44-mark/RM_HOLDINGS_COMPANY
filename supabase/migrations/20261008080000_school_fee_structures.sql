-- Canonical school fee structures: Academic Year + Level + Class + annual fee + optional term fees.
-- Additive. Does not drop sch_fee_categories or sch_fee_assignments.

insert into public.permissions (code, module, resource, action, name)
values
  ('school.fees.view', 'school', 'fees', 'view', 'View school fees'),
  ('school.fees.manage', 'school', 'fees', 'manage', 'Manage school fees')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code in ('SCHOOL_ADMIN', 'SCHOOL_MANAGER')
  and p.code in ('school.fees.view', 'school.fees.manage')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code = 'SCHOOL_ACCOUNTANT'
  and p.code in ('school.fees.view', 'school.fees.manage')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code in ('HEADMASTER', 'ADMISSIONS_OFFICER')
  and p.code = 'school.fees.view'
on conflict do nothing;

create table if not exists public.sch_fee_structures (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  academic_year_id uuid not null,
  level_id uuid not null,
  class_id uuid not null,
  annual_amount numeric(14, 2) not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_fee_structures_amount check (annual_amount >= 0),
  constraint sch_fee_structures_year_bu_fk foreign key (academic_year_id, business_unit_id)
    references public.sch_academic_years (id, business_unit_id) on delete restrict,
  constraint sch_fee_structures_level_bu_fk foreign key (level_id, business_unit_id)
    references public.sch_class_levels (id, business_unit_id) on delete restrict,
  constraint sch_fee_structures_class_bu_fk foreign key (class_id, business_unit_id)
    references public.sch_classes (id, business_unit_id) on delete restrict
);

create unique index if not exists sch_fee_structures_active_uidx
  on public.sch_fee_structures (business_unit_id, academic_year_id, class_id)
  where is_active;

create index if not exists sch_fee_structures_bu_year_idx
  on public.sch_fee_structures (business_unit_id, academic_year_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sch_fee_structures_id_bu_key') then
    alter table public.sch_fee_structures
      add constraint sch_fee_structures_id_bu_key unique (id, business_unit_id);
  end if;
end
$$;

drop trigger if exists sch_fee_structures_touch on public.sch_fee_structures;
create trigger sch_fee_structures_touch before update on public.sch_fee_structures
  for each row execute function public.sch_touch_updated_at();

create table if not exists public.sch_fee_structure_terms (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  fee_structure_id uuid not null references public.sch_fee_structures(id) on delete cascade,
  term_id uuid not null,
  amount numeric(14, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_fee_structure_terms_amount check (amount >= 0),
  constraint sch_fee_structure_terms_structure_bu_fk foreign key (fee_structure_id, business_unit_id)
    references public.sch_fee_structures (id, business_unit_id) on delete cascade,
  constraint sch_fee_structure_terms_term_bu_fk foreign key (term_id, business_unit_id)
    references public.sch_terms (id, business_unit_id) on delete restrict
);

create unique index if not exists sch_fee_structure_terms_uidx
  on public.sch_fee_structure_terms (fee_structure_id, term_id);

drop trigger if exists sch_fee_structure_terms_touch on public.sch_fee_structure_terms;
create trigger sch_fee_structure_terms_touch before update on public.sch_fee_structure_terms
  for each row execute function public.sch_touch_updated_at();

alter table public.sch_fee_structures enable row level security;
alter table public.sch_fee_structure_terms enable row level security;
revoke all on public.sch_fee_structures, public.sch_fee_structure_terms from anon, public;
grant select, insert, update on public.sch_fee_structures, public.sch_fee_structure_terms to authenticated, service_role;

drop policy if exists sch_fee_structures_select on public.sch_fee_structures;
create policy sch_fee_structures_select on public.sch_fee_structures
  for select to authenticated
  using (public.has_business_unit_access(business_unit_id));

drop policy if exists sch_fee_structures_insert on public.sch_fee_structures;
create policy sch_fee_structures_insert on public.sch_fee_structures
  for insert to authenticated
  with check (public.has_business_unit_access(business_unit_id));

drop policy if exists sch_fee_structures_update on public.sch_fee_structures;
create policy sch_fee_structures_update on public.sch_fee_structures
  for update to authenticated
  using (public.has_business_unit_access(business_unit_id))
  with check (public.has_business_unit_access(business_unit_id));

drop policy if exists sch_fee_structures_delete on public.sch_fee_structures;
create policy sch_fee_structures_delete on public.sch_fee_structures
  for delete to authenticated
  using (false);

drop policy if exists sch_fee_structure_terms_select on public.sch_fee_structure_terms;
create policy sch_fee_structure_terms_select on public.sch_fee_structure_terms
  for select to authenticated
  using (public.has_business_unit_access(business_unit_id));

drop policy if exists sch_fee_structure_terms_insert on public.sch_fee_structure_terms;
create policy sch_fee_structure_terms_insert on public.sch_fee_structure_terms
  for insert to authenticated
  with check (public.has_business_unit_access(business_unit_id));

drop policy if exists sch_fee_structure_terms_update on public.sch_fee_structure_terms;
create policy sch_fee_structure_terms_update on public.sch_fee_structure_terms
  for update to authenticated
  using (public.has_business_unit_access(business_unit_id))
  with check (public.has_business_unit_access(business_unit_id));

drop policy if exists sch_fee_structure_terms_delete on public.sch_fee_structure_terms;
create policy sch_fee_structure_terms_delete on public.sch_fee_structure_terms
  for delete to authenticated
  using (public.has_business_unit_access(business_unit_id));
