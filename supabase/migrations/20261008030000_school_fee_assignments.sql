-- Fee structures attach a fee category to a Class (Level is derived from the class).
-- Additive. No seeds. No physical deletes. Reuses sch_fee_categories, sch_classes, academic years/terms.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sch_fee_categories_id_bu_key') then
    alter table public.sch_fee_categories
      add constraint sch_fee_categories_id_bu_key unique (id, business_unit_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sch_academic_years_id_bu_key') then
    alter table public.sch_academic_years
      add constraint sch_academic_years_id_bu_key unique (id, business_unit_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sch_terms_id_bu_key') then
    alter table public.sch_terms
      add constraint sch_terms_id_bu_key unique (id, business_unit_id);
  end if;
end
$$;

create table if not exists public.sch_fee_assignments (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  fee_category_id uuid not null references public.sch_fee_categories(id) on delete restrict,
  class_id uuid not null references public.sch_classes(id) on delete restrict,
  academic_year_id uuid not null references public.sch_academic_years(id) on delete restrict,
  term_id uuid references public.sch_terms(id) on delete restrict,
  amount numeric(14, 2) not null,
  frequency text not null default 'TERM',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sch_fee_assignments_amount check (amount >= 0),
  constraint sch_fee_assignments_frequency check (frequency in ('TERM', 'YEAR', 'MONTH', 'ONCE', 'OTHER')),
  constraint sch_fee_assignments_category_bu_fk foreign key (fee_category_id, business_unit_id)
    references public.sch_fee_categories (id, business_unit_id) on delete restrict,
  constraint sch_fee_assignments_class_bu_fk foreign key (class_id, business_unit_id)
    references public.sch_classes (id, business_unit_id) on delete restrict,
  constraint sch_fee_assignments_year_bu_fk foreign key (academic_year_id, business_unit_id)
    references public.sch_academic_years (id, business_unit_id) on delete restrict,
  constraint sch_fee_assignments_term_bu_fk foreign key (term_id, business_unit_id)
    references public.sch_terms (id, business_unit_id) on delete restrict
);

create unique index if not exists sch_fee_assignments_active_uidx
  on public.sch_fee_assignments (
    business_unit_id,
    class_id,
    fee_category_id,
    academic_year_id,
    coalesce(term_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where is_active;

drop trigger if exists sch_fee_assignments_touch on public.sch_fee_assignments;
create trigger sch_fee_assignments_touch before update on public.sch_fee_assignments
  for each row execute function public.sch_touch_updated_at();

alter table public.sch_fee_assignments enable row level security;
revoke all on public.sch_fee_assignments from anon, public;
grant select, insert, update on public.sch_fee_assignments to authenticated, service_role;

drop policy if exists sch_fee_assignments_select on public.sch_fee_assignments;
create policy sch_fee_assignments_select on public.sch_fee_assignments
  for select to authenticated
  using (public.has_business_unit_access(business_unit_id));

drop policy if exists sch_fee_assignments_insert on public.sch_fee_assignments;
create policy sch_fee_assignments_insert on public.sch_fee_assignments
  for insert to authenticated
  with check (public.has_business_unit_access(business_unit_id));

drop policy if exists sch_fee_assignments_update on public.sch_fee_assignments;
create policy sch_fee_assignments_update on public.sch_fee_assignments
  for update to authenticated
  using (public.has_business_unit_access(business_unit_id))
  with check (public.has_business_unit_access(business_unit_id));

drop policy if exists sch_fee_assignments_delete on public.sch_fee_assignments;
create policy sch_fee_assignments_delete on public.sch_fee_assignments
  for delete to authenticated
  using (false);
