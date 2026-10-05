-- Repair display names after 23505 on roles_name_key.
-- OWNER already occupies unique name 'Owner'. SUPER_ADMIN cannot share that name.
-- Codes, user role_id values, assignments, and permissions are not changed.

-- 1) Move the legacy owner-level row off the unique 'Owner' label first.
update public.roles
set
  name = 'Owner Legacy',
  description = 'Legacy owner-level role retained for JWT and RLS compatibility.'
where code = 'SUPER_ADMIN'
  and name is distinct from 'Owner Legacy';

-- 2) Canonical user-facing Owner row.
update public.roles
set
  name = 'Owner',
  description = 'Full system access across RM Holdings.'
where code = 'OWNER'
  and (
    name is distinct from 'Owner'
    or description is distinct from 'Full system access across RM Holdings.'
  );
