-- property_units and the other property tables were created without privileges.
-- Postgres returns 42501 "permission denied for table" until service_role is granted access.
-- No row-level policies. Same access path properties already uses.

grant select, insert, update, delete on table
  public.property_units,
  public.tenants,
  public.rental_contracts,
  public.rent_invoices,
  public.rent_payments,
  public.hall_bookings,
  public.property_expenses
to service_role;

alter table public.property_units disable row level security;
alter table public.tenants disable row level security;
alter table public.rental_contracts disable row level security;
alter table public.rent_invoices disable row level security;
alter table public.rent_payments disable row level security;
alter table public.hall_bookings disable row level security;
alter table public.property_expenses disable row level security;

do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'property_units',
        'tenants',
        'rental_contracts',
        'rent_invoices',
        'rent_payments',
        'hall_bookings',
        'property_expenses'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;
