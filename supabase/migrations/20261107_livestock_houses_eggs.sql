-- Optional. The app already stores house ownership and egg trays in house notes
-- until this is applied. Run it in the Supabase SQL editor when you want those
-- records in their own columns.

alter table public.ls_houses add column if not exists ownership varchar(20) not null default 'Rental';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ls_houses_ownership_check') then
    alter table public.ls_houses add constraint ls_houses_ownership_check check (ownership in ('Company', 'Rental'));
  end if;
end $$;

create table if not exists public.ls_egg_collections (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  house_id uuid not null references public.ls_houses(id) on delete restrict,
  collection_date date not null,
  trays numeric(10,2) not null check (trays > 0),
  notes text not null default '',
  created_by uuid,
  created_at timestamptz not null default now()
);

alter table public.ls_egg_collections enable row level security;
