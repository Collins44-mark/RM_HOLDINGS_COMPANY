-- Owner-managed display location for each existing business unit.
-- Additive only: no ID/code/assignment changes.

alter table public.business_units
  add column if not exists location text;

comment on column public.business_units.location is
  'Owner-managed display location. Empty/null is shown as Location not set in the UI.';

-- Initial values for existing units. Owner can change these from System Settings.
update public.business_units set location = 'Katinduka, Morogoro' where code = 'rice' and location is null;
update public.business_units set location = 'Chita, Morogoro' where code = 'farm' and location is null;
update public.business_units set location = 'Dar es Salaam' where code = 'supermarket' and location is null;
update public.business_units set location = 'Offices & Hall - Dar es Salaam' where code = 'property' and location is null;
update public.business_units set location = 'Kigamboni, Dar es Salaam' where code = 'livestock' and location is null;
update public.business_units set location = 'Dodoma' where code = 'school' and location is null;
update public.business_units set location = 'Musoma' where code = 'beekeeping' and location is null;

grant select on table public.business_units to authenticated, service_role;
grant update (location) on table public.business_units to authenticated, service_role;

drop policy if exists business_units_owner_update on public.business_units;
create policy business_units_owner_update
  on public.business_units for update
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());
