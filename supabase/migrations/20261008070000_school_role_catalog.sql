-- School module role catalog in the global RBAC tables.
-- Idempotent. Does not create a second authorization system.

alter table public.roles
  add column if not exists module text;

comment on column public.roles.module is
  'Owning business-unit / module code. Null for platform-wide roles.';

create index if not exists roles_module_idx on public.roles (module);

update public.roles
set module = 'school'
where code in (
  'SCHOOL_ADMIN',
  'SCHOOL_MANAGER',
  'HEADMASTER',
  'SCHOOL_ACCOUNTANT',
  'TEACHER',
  'ADMISSIONS_OFFICER'
)
  and coalesce(module, '') is distinct from 'school';

update public.roles
set module = 'supermarket'
where code in ('SUPERMARKET_MANAGER', 'CASHIER', 'BUSINESS_MANAGER')
  and module is null;

insert into public.roles (code, name, description, is_system, module)
values
  (
    'SCHOOL_MANAGER',
    'School Manager',
    'Manages school operations and configuration.',
    true,
    'school'
  ),
  (
    'HEADMASTER',
    'Headmaster',
    'Provides senior academic and operational oversight.',
    true,
    'school'
  ),
  (
    'SCHOOL_ACCOUNTANT',
    'School Accountant',
    'Manages authorized school financial operations.',
    true,
    'school'
  ),
  (
    'TEACHER',
    'Teacher',
    'Manages assigned academic responsibilities.',
    true,
    'school'
  ),
  (
    'ADMISSIONS_OFFICER',
    'Admissions Officer',
    'Manages student admissions.',
    true,
    'school'
  )
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  module = excluded.module,
  is_system = true;

update public.roles
set module = 'school'
where code = 'SCHOOL_ADMIN';

insert into public.permissions (code, module, resource, action, name)
values
  ('school.settings.view', 'school', 'settings', 'view', 'View school settings'),
  ('school.settings.manage', 'school', 'settings', 'manage', 'Manage school settings'),
  ('school.classes.view', 'school', 'classes', 'view', 'View classes'),
  ('school.classes.manage', 'school', 'classes', 'manage', 'Manage classes'),
  ('school.admissions.view', 'school', 'admissions', 'view', 'View admissions'),
  ('school.admissions.manage', 'school', 'admissions', 'manage', 'Manage admissions'),
  ('school.students.view', 'school', 'students', 'view', 'View students'),
  ('school.students.manage', 'school', 'students', 'manage', 'Manage students'),
  ('school.parents.view', 'school', 'parents', 'view', 'View parents'),
  ('school.parents.manage', 'school', 'parents', 'manage', 'Manage parents'),
  ('school.staff.view', 'school', 'staff', 'view', 'View school staff'),
  ('school.staff.manage', 'school', 'staff', 'manage', 'Manage school staff')
on conflict (code) do nothing;

-- School Manager: implemented school operations.
insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code = 'SCHOOL_MANAGER'
  and p.code in (
    'school.settings.view',
    'school.settings.manage',
    'school.classes.view',
    'school.classes.manage',
    'school.admissions.view',
    'school.admissions.manage',
    'school.students.view',
    'school.students.manage',
    'school.parents.view',
    'school.parents.manage',
    'school.staff.view',
    'school.staff.manage'
  )
on conflict do nothing;

-- Headmaster: view only.
insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code = 'HEADMASTER'
  and p.code in (
    'school.settings.view',
    'school.classes.view',
    'school.admissions.view',
    'school.students.view',
    'school.parents.view',
    'school.staff.view'
  )
on conflict do nothing;

-- School Accountant: implemented academic structure only until finance exists.
insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code = 'SCHOOL_ACCOUNTANT'
  and p.code in ('school.classes.view', 'school.students.view')
on conflict do nothing;

-- Teacher: academic view. Staff administration is not a default.
insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code = 'TEACHER'
  and p.code in ('school.classes.view', 'school.students.view')
on conflict do nothing;

delete from public.role_permissions rp
using public.roles r
where rp.role_id = r.id
  and r.code = 'TEACHER'
  and rp.permission_code = 'school.staff.view';

-- Admissions Officer.
insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.code = 'ADMISSIONS_OFFICER'
  and p.code in (
    'school.admissions.view',
    'school.admissions.manage',
    'school.classes.view',
    'school.students.view',
    'school.parents.view',
    'school.parents.manage'
  )
on conflict do nothing;
