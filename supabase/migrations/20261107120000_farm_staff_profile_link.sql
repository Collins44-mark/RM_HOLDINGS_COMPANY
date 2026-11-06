alter table public.farm_staff
  add column if not exists profile_id uuid references public.profiles(id) on delete set null;

create index if not exists farm_staff_profile_id_idx on public.farm_staff (profile_id);
