-- Clear saved supermarket tax rules and the old audit history.
-- Tables stay. Owner login, roles, and business settings stay.
-- Run once in the Supabase SQL Editor.

begin;

delete from public.sm_tax_applications;
delete from public.sm_tax_rules;
delete from public.audit_logs;

commit;

select
  (select count(*) from public.sm_tax_rules) as tax_rules,
  (select count(*) from public.sm_tax_applications) as tax_applications,
  (select count(*) from public.audit_logs) as audit_logs;
