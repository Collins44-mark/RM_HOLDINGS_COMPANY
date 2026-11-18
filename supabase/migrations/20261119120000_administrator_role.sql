-- IT administrator. Operational access is granted in the app.
-- Owner-only controls stay behind is_owner() (settings, role templates, business-unit structure).

insert into public.roles (code, name, description, is_system)
values (
  'ADMINISTRATOR',
  'Administrator',
  'IT administrator. Signs in to the admin area and works across every module. Cannot change the Owner, system settings, or role templates.',
  true
)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description;
