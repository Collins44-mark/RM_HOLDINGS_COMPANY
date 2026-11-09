-- =============================================================================
-- RM Holdings production operational data wipe
-- Project: ctjlumwuxssdpxzbbdgz
--
-- Run once in the Supabase SQL Editor as postgres. Do not run through the API.
-- DELETE only. No DROP, TRUNCATE, or CASCADE. Grants, policies, schema,
-- functions, views, and auth users are not changed.
--
-- One transaction. Any error rolls every deletion back.
--
-- Classification matches the live public tables on project ctjlumwuxssdpxzbbdgz.
-- ls_egg_collections is not in that database. Egg collections are cleared
-- with the ls_houses rows. Views are not tables and are not deleted.
--
-- Every public base table is named below as either
--   OPERATIONAL_DATA        delete all rows
--   ESSENTIAL_CONFIGURATION keep every row
-- A public table that is not named stops the script. It is not deleted.
--
-- Among the 16 previously API-inaccessible tables:
--   Deleted as operational records:
--     sch_placement_events, sch_promotion_runs, sch_store_items,
--     sch_store_movements, sch_store_sales, sch_store_sale_lines,
--     sch_emergency_fund_entries, sm_supplier_invoices,
--     sm_supplier_invoice_items, sm_supplier_payment_requests,
--     sm_stock_loss_events, sm_tax_applications, offline_operation_receipts
--   Preserved as configuration:
--     sm_tax_rules, sm_sod_controls
--   Reset, row kept:
--     tractor_sequence (last_code = TRC-000)
--
-- Document-counter rows are kept and their next_value is set back to 1.
-- Views are left in place. They follow the emptied base tables.
-- There is no separate central-finance ledger. Finance reads the module
-- payment and expense tables cleared below.
-- =============================================================================

begin;

set local lock_timeout = '20s';
set local statement_timeout = '180s';

do $$
declare
  v_bypass boolean;
begin
  select r.rolsuper or r.rolbypassrls
    into v_bypass
  from pg_roles r
  where r.rolname = current_user;

  if coalesce(v_bypass, false) is not true then
    raise exception
      'Run this in the Supabase SQL Editor as postgres. Current role % cannot bypass row level security.',
      current_user;
  end if;
end $$;

create temp table wipe_class (
  table_name text primary key,
  class_name text not null check (class_name in ('OPERATIONAL_DATA', 'ESSENTIAL_CONFIGURATION')),
  module_name text not null
) on commit preserve rows;

create temp table wipe_deleted (
  module_name text not null,
  table_name text not null,
  deleted_rows bigint not null
) on commit preserve rows;

create temp table wipe_protected_before (
  table_name text primary key,
  row_count bigint not null
) on commit preserve rows;

insert into wipe_class (table_name, class_name, module_name)
values
  -- Foundation
  ('roles', 'ESSENTIAL_CONFIGURATION', 'foundation'),
  ('permissions', 'ESSENTIAL_CONFIGURATION', 'foundation'),
  ('role_permissions', 'ESSENTIAL_CONFIGURATION', 'foundation'),
  ('profiles', 'ESSENTIAL_CONFIGURATION', 'foundation'),
  ('user_business_units', 'ESSENTIAL_CONFIGURATION', 'foundation'),
  ('user_module_roles', 'ESSENTIAL_CONFIGURATION', 'foundation'),
  ('user_permission_overrides', 'ESSENTIAL_CONFIGURATION', 'foundation'),
  ('business_units', 'ESSENTIAL_CONFIGURATION', 'foundation'),
  ('organization_settings', 'ESSENTIAL_CONFIGURATION', 'foundation'),
  ('audit_logs', 'ESSENTIAL_CONFIGURATION', 'foundation'),

  -- Property: all rows are business records
  ('rent_payments', 'OPERATIONAL_DATA', 'property'),
  ('rent_invoices', 'OPERATIONAL_DATA', 'property'),
  ('hall_bookings', 'OPERATIONAL_DATA', 'property'),
  ('property_expenses', 'OPERATIONAL_DATA', 'property'),
  ('rental_contracts', 'OPERATIONAL_DATA', 'property'),
  ('property_units', 'OPERATIONAL_DATA', 'property'),
  ('tenants', 'OPERATIONAL_DATA', 'property'),
  ('properties', 'OPERATIONAL_DATA', 'property'),

  -- Livestock. Egg collections are stored on ls_houses, not a separate table.
  ('ls_sale_payments', 'OPERATIONAL_DATA', 'livestock'),
  ('ls_expense_payments', 'OPERATIONAL_DATA', 'livestock'),
  ('ls_rental_payments', 'OPERATIONAL_DATA', 'livestock'),
  ('ls_expenses', 'OPERATIONAL_DATA', 'livestock'),
  ('ls_rentals', 'OPERATIONAL_DATA', 'livestock'),
  ('ls_sales', 'OPERATIONAL_DATA', 'livestock'),
  ('ls_movements', 'OPERATIONAL_DATA', 'livestock'),
  ('ls_openings', 'OPERATIONAL_DATA', 'livestock'),
  ('ls_purchases', 'OPERATIONAL_DATA', 'livestock'),
  ('ls_births', 'OPERATIONAL_DATA', 'livestock'),
  ('ls_deaths', 'OPERATIONAL_DATA', 'livestock'),
  ('ls_pregnancies', 'OPERATIONAL_DATA', 'livestock'),
  ('ls_adjustments', 'OPERATIONAL_DATA', 'livestock'),
  ('ls_houses', 'OPERATIONAL_DATA', 'livestock'),
  ('ls_animal_types', 'OPERATIONAL_DATA', 'livestock'),

  -- Beekeeping
  ('bee_stock_allocations', 'OPERATIONAL_DATA', 'beekeeping'),
  ('bee_sale_payments', 'OPERATIONAL_DATA', 'beekeeping'),
  ('bee_expense_payments', 'OPERATIONAL_DATA', 'beekeeping'),
  ('bee_sales', 'OPERATIONAL_DATA', 'beekeeping'),
  ('bee_expenses', 'OPERATIONAL_DATA', 'beekeeping'),
  ('bee_harvests', 'OPERATIONAL_DATA', 'beekeeping'),
  ('bee_hives', 'OPERATIONAL_DATA', 'beekeeping'),

  -- Farm. Service catalogue and the number counters stay.
  ('farm_job_payments', 'OPERATIONAL_DATA', 'farm'),
  ('farm_fuel', 'OPERATIONAL_DATA', 'farm'),
  ('farm_maintenance', 'OPERATIONAL_DATA', 'farm'),
  ('farm_operations', 'OPERATIONAL_DATA', 'farm'),
  ('farm_harvests', 'OPERATIONAL_DATA', 'farm'),
  ('farm_expenses', 'OPERATIONAL_DATA', 'farm'),
  ('farm_jobs', 'OPERATIONAL_DATA', 'farm'),
  ('farm_tractors', 'OPERATIONAL_DATA', 'farm'),
  ('farm_seasons', 'OPERATIONAL_DATA', 'farm'),
  ('farm_plots', 'OPERATIONAL_DATA', 'farm'),
  ('farm_staff', 'OPERATIONAL_DATA', 'farm'),
  ('farm_parties', 'OPERATIONAL_DATA', 'farm'),
  ('farm_service_types', 'ESSENTIAL_CONFIGURATION', 'farm'),
  ('farm_document_counters', 'ESSENTIAL_CONFIGURATION', 'farm'),
  ('tractor_sequence', 'ESSENTIAL_CONFIGURATION', 'farm'),

  -- Rice. Grade catalogue stays. Stock and parties do not.
  ('rice_mill_outputs', 'OPERATIONAL_DATA', 'rice'),
  ('rice_stock_movements', 'OPERATIONAL_DATA', 'rice'),
  ('rice_sale_lines', 'OPERATIONAL_DATA', 'rice'),
  ('rice_storage_movements', 'OPERATIONAL_DATA', 'rice'),
  ('rice_service_income', 'OPERATIONAL_DATA', 'rice'),
  ('rice_expenses', 'OPERATIONAL_DATA', 'rice'),
  ('rice_sales', 'OPERATIONAL_DATA', 'rice'),
  ('rice_purchases', 'OPERATIONAL_DATA', 'rice'),
  ('rice_mill_batches', 'OPERATIONAL_DATA', 'rice'),
  ('rice_storage_accounts', 'OPERATIONAL_DATA', 'rice'),
  ('rice_parties', 'OPERATIONAL_DATA', 'rice'),
  ('rice_items', 'ESSENTIAL_CONFIGURATION', 'rice'),
  ('rice_document_counters', 'ESSENTIAL_CONFIGURATION', 'rice'),

  -- School records
  ('sch_exam_results', 'OPERATIONAL_DATA', 'school'),
  ('sch_exam_papers', 'OPERATIONAL_DATA', 'school'),
  ('sch_exams', 'OPERATIONAL_DATA', 'school'),
  ('sch_fee_payments', 'OPERATIONAL_DATA', 'school'),
  ('sch_fee_charges', 'OPERATIONAL_DATA', 'school'),
  ('sch_fee_assignments', 'OPERATIONAL_DATA', 'school'),
  ('sch_fee_structure_terms', 'OPERATIONAL_DATA', 'school'),
  ('sch_fee_structures', 'OPERATIONAL_DATA', 'school'),
  ('sch_store_sale_lines', 'OPERATIONAL_DATA', 'school'),
  ('sch_store_movements', 'OPERATIONAL_DATA', 'school'),
  ('sch_store_sales', 'OPERATIONAL_DATA', 'school'),
  ('sch_store_items', 'OPERATIONAL_DATA', 'school'),
  ('sch_emergency_fund_entries', 'OPERATIONAL_DATA', 'school'),
  ('sch_staff_salary_payments', 'OPERATIONAL_DATA', 'school'),
  ('sch_staff_salary_allocations', 'OPERATIONAL_DATA', 'school'),
  ('sch_staff_salary_history', 'OPERATIONAL_DATA', 'school'),
  ('sch_fuel_records', 'OPERATIONAL_DATA', 'school'),
  ('sch_maintenance_records', 'OPERATIONAL_DATA', 'school'),
  ('sch_expenses', 'OPERATIONAL_DATA', 'school'),
  ('sch_student_transport', 'OPERATIONAL_DATA', 'school'),
  ('sch_student_guardians', 'OPERATIONAL_DATA', 'school'),
  ('sch_placement_events', 'OPERATIONAL_DATA', 'school'),
  ('sch_promotion_runs', 'OPERATIONAL_DATA', 'school'),
  ('sch_admissions', 'OPERATIONAL_DATA', 'school'),
  ('sch_student_enrollments', 'OPERATIONAL_DATA', 'school'),
  ('sch_staff_assignments', 'OPERATIONAL_DATA', 'school'),
  ('sch_driver_assignments', 'OPERATIONAL_DATA', 'school'),
  ('sch_class_subjects', 'OPERATIONAL_DATA', 'school'),
  ('sch_academic_access', 'OPERATIONAL_DATA', 'school'),
  ('sch_students', 'OPERATIONAL_DATA', 'school'),
  ('sch_guardians', 'OPERATIONAL_DATA', 'school'),
  ('sch_staff', 'OPERATIONAL_DATA', 'school'),
  ('sch_class_streams', 'OPERATIONAL_DATA', 'school'),
  ('sch_classes', 'OPERATIONAL_DATA', 'school'),
  ('sch_transport_routes', 'OPERATIONAL_DATA', 'school'),
  ('sch_buses', 'OPERATIONAL_DATA', 'school'),

  -- School configuration and reference data
  ('sch_school_profiles', 'ESSENTIAL_CONFIGURATION', 'school'),
  ('sch_academic_years', 'ESSENTIAL_CONFIGURATION', 'school'),
  ('sch_terms', 'ESSENTIAL_CONFIGURATION', 'school'),
  ('sch_class_levels', 'ESSENTIAL_CONFIGURATION', 'school'),
  ('sch_subjects', 'ESSENTIAL_CONFIGURATION', 'school'),
  ('sch_departments', 'ESSENTIAL_CONFIGURATION', 'school'),
  ('sch_staff_types', 'ESSENTIAL_CONFIGURATION', 'school'),
  ('sch_staff_positions', 'ESSENTIAL_CONFIGURATION', 'school'),
  ('sch_fee_categories', 'ESSENTIAL_CONFIGURATION', 'school'),
  ('sch_expense_categories', 'ESSENTIAL_CONFIGURATION', 'school'),
  ('sch_grading_scales', 'ESSENTIAL_CONFIGURATION', 'school'),
  ('sch_grading_bands', 'ESSENTIAL_CONFIGURATION', 'school'),
  ('sch_attendance_settings', 'ESSENTIAL_CONFIGURATION', 'school'),
  ('sch_attendance_statuses', 'ESSENTIAL_CONFIGURATION', 'school'),
  ('sch_transport_settings', 'ESSENTIAL_CONFIGURATION', 'school'),
  ('sch_document_counters', 'ESSENTIAL_CONFIGURATION', 'school'),

  -- Supermarket transactions and stock
  ('sm_tax_applications', 'OPERATIONAL_DATA', 'supermarket'),
  ('sm_supplier_invoice_items', 'OPERATIONAL_DATA', 'supermarket'),
  ('sm_supplier_payment_requests', 'OPERATIONAL_DATA', 'supermarket'),
  ('sm_sales_return_items', 'OPERATIONAL_DATA', 'supermarket'),
  ('sm_sales_returns', 'OPERATIONAL_DATA', 'supermarket'),
  ('sm_sale_payments', 'OPERATIONAL_DATA', 'supermarket'),
  ('sm_sale_items', 'OPERATIONAL_DATA', 'supermarket'),
  ('sm_promotion_products', 'OPERATIONAL_DATA', 'supermarket'),
  ('sm_promotion_categories', 'OPERATIONAL_DATA', 'supermarket'),
  ('sm_promotion_tiers', 'OPERATIONAL_DATA', 'supermarket'),
  ('sm_stock_loss_events', 'OPERATIONAL_DATA', 'supermarket'),
  ('sm_stock_reconciliation_items', 'OPERATIONAL_DATA', 'supermarket'),
  ('sm_goods_receipt_items', 'OPERATIONAL_DATA', 'supermarket'),
  ('sm_stock_movements', 'OPERATIONAL_DATA', 'supermarket'),
  ('sm_bank_reconciliation_items', 'OPERATIONAL_DATA', 'supermarket'),
  ('sm_petty_cash_transactions', 'OPERATIONAL_DATA', 'supermarket'),
  ('sm_petty_cash_reconciliations', 'OPERATIONAL_DATA', 'supermarket'),
  ('sm_sales_reconciliations', 'OPERATIONAL_DATA', 'supermarket'),
  ('sm_cash_reconciliations', 'OPERATIONAL_DATA', 'supermarket'),
  ('sm_sales', 'OPERATIONAL_DATA', 'supermarket'),
  ('sm_stock_batches', 'OPERATIONAL_DATA', 'supermarket'),
  ('sm_stock_adjustments', 'OPERATIONAL_DATA', 'supermarket'),
  ('sm_stock_reconciliations', 'OPERATIONAL_DATA', 'supermarket'),
  ('sm_goods_receipts', 'OPERATIONAL_DATA', 'supermarket'),
  ('sm_supplier_invoices', 'OPERATIONAL_DATA', 'supermarket'),
  ('sm_purchase_order_items', 'OPERATIONAL_DATA', 'supermarket'),
  ('sm_purchase_orders', 'OPERATIONAL_DATA', 'supermarket'),
  ('sm_bank_transactions', 'OPERATIONAL_DATA', 'supermarket'),
  ('sm_bank_reconciliations', 'OPERATIONAL_DATA', 'supermarket'),
  ('sm_petty_cash_funds', 'OPERATIONAL_DATA', 'supermarket'),
  ('sm_payments', 'OPERATIONAL_DATA', 'supermarket'),
  ('sm_expenses', 'OPERATIONAL_DATA', 'supermarket'),
  ('sm_promotions', 'OPERATIONAL_DATA', 'supermarket'),
  ('sm_pos_customers', 'OPERATIONAL_DATA', 'supermarket'),
  ('sm_products', 'OPERATIONAL_DATA', 'supermarket'),
  ('sm_suppliers', 'OPERATIONAL_DATA', 'supermarket'),

  -- Supermarket configuration, payment setup, tax defaults, and catalogue
  ('sm_categories', 'ESSENTIAL_CONFIGURATION', 'supermarket'),
  ('sm_promotion_types', 'ESSENTIAL_CONFIGURATION', 'supermarket'),
  ('sm_payment_providers', 'ESSENTIAL_CONFIGURATION', 'supermarket'),
  ('sm_bank_accounts', 'ESSENTIAL_CONFIGURATION', 'supermarket'),
  ('sm_tax_rules', 'ESSENTIAL_CONFIGURATION', 'supermarket'),
  ('sm_sod_controls', 'ESSENTIAL_CONFIGURATION', 'supermarket'),
  ('sm_document_counters', 'ESSENTIAL_CONFIGURATION', 'supermarket'),

  -- Shared operational receipts
  ('offline_operation_receipts', 'OPERATIONAL_DATA', 'operations');

-- Refuse to continue when the live database has a public table this
-- classification does not name, or when a named table is absent.
do $$
declare
  v_unknown text;
  v_missing text;
begin
  select string_agg(c.relname, ', ' order by c.relname)
    into v_unknown
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not exists (
      select 1 from wipe_class w where w.table_name = c.relname
    );

  if v_unknown is not null then
    raise exception
      'Unclassified public tables. Add each one as OPERATIONAL_DATA or ESSENTIAL_CONFIGURATION before running the wipe: %',
      v_unknown;
  end if;

  select string_agg(w.table_name, ', ' order by w.table_name)
    into v_missing
  from wipe_class w
  where to_regclass('public.' || quote_ident(w.table_name)) is null;

  if v_missing is not null then
    raise exception
      'Classified tables are missing from this database, so the wipe cannot be certified: %',
      v_missing;
  end if;
end $$;

create or replace function pg_temp.row_count(p_table text)
returns bigint
language plpgsql
as $$
declare
  n bigint;
begin
  execute 'select count(*) from public.' || quote_ident(p_table) into n;
  return n;
end;
$$;

insert into wipe_protected_before (table_name, row_count)
select w.table_name, pg_temp.row_count(w.table_name)
from wipe_class w
where w.class_name = 'ESSENTIAL_CONFIGURATION';

insert into wipe_protected_before (table_name, row_count)
values ('auth.users', (select count(*) from auth.users));

create or replace function pg_temp.delete_all(p_module text, p_table text)
returns void
language plpgsql
as $$
declare
  n bigint;
  v_class text;
begin
  select class_name into v_class from wipe_class where table_name = p_table;
  if v_class is distinct from 'OPERATIONAL_DATA' then
    raise exception 'Refusing to delete % because it is not classified as OPERATIONAL_DATA.', p_table;
  end if;

  execute 'delete from public.' || quote_ident(p_table);
  get diagnostics n = row_count;
  insert into wipe_deleted (module_name, table_name, deleted_rows)
  values (p_module, p_table, n);
end;
$$;

-- Child rows first. Each call deletes only a classified operational table.
select pg_temp.delete_all('property', 'rent_payments');
select pg_temp.delete_all('property', 'rent_invoices');
select pg_temp.delete_all('property', 'hall_bookings');
select pg_temp.delete_all('property', 'property_expenses');
select pg_temp.delete_all('property', 'rental_contracts');
select pg_temp.delete_all('property', 'property_units');
select pg_temp.delete_all('property', 'tenants');
select pg_temp.delete_all('property', 'properties');

select pg_temp.delete_all('livestock', 'ls_sale_payments');
select pg_temp.delete_all('livestock', 'ls_expense_payments');
select pg_temp.delete_all('livestock', 'ls_rental_payments');
select pg_temp.delete_all('livestock', 'ls_expenses');
select pg_temp.delete_all('livestock', 'ls_rentals');
select pg_temp.delete_all('livestock', 'ls_sales');
select pg_temp.delete_all('livestock', 'ls_movements');
select pg_temp.delete_all('livestock', 'ls_openings');
select pg_temp.delete_all('livestock', 'ls_purchases');
select pg_temp.delete_all('livestock', 'ls_births');
select pg_temp.delete_all('livestock', 'ls_deaths');
select pg_temp.delete_all('livestock', 'ls_pregnancies');
select pg_temp.delete_all('livestock', 'ls_adjustments');
select pg_temp.delete_all('livestock', 'ls_houses');
select pg_temp.delete_all('livestock', 'ls_animal_types');

select pg_temp.delete_all('beekeeping', 'bee_stock_allocations');
select pg_temp.delete_all('beekeeping', 'bee_sale_payments');
select pg_temp.delete_all('beekeeping', 'bee_expense_payments');
select pg_temp.delete_all('beekeeping', 'bee_sales');
select pg_temp.delete_all('beekeeping', 'bee_expenses');
select pg_temp.delete_all('beekeeping', 'bee_harvests');
select pg_temp.delete_all('beekeeping', 'bee_hives');

select pg_temp.delete_all('farm', 'farm_job_payments');
select pg_temp.delete_all('farm', 'farm_fuel');
select pg_temp.delete_all('farm', 'farm_maintenance');
select pg_temp.delete_all('farm', 'farm_operations');
select pg_temp.delete_all('farm', 'farm_harvests');
select pg_temp.delete_all('farm', 'farm_expenses');
select pg_temp.delete_all('farm', 'farm_jobs');
select pg_temp.delete_all('farm', 'farm_tractors');
select pg_temp.delete_all('farm', 'farm_seasons');
select pg_temp.delete_all('farm', 'farm_plots');
select pg_temp.delete_all('farm', 'farm_staff');
select pg_temp.delete_all('farm', 'farm_parties');

select pg_temp.delete_all('rice', 'rice_mill_outputs');
select pg_temp.delete_all('rice', 'rice_stock_movements');
select pg_temp.delete_all('rice', 'rice_sale_lines');
select pg_temp.delete_all('rice', 'rice_storage_movements');
select pg_temp.delete_all('rice', 'rice_service_income');
select pg_temp.delete_all('rice', 'rice_expenses');
select pg_temp.delete_all('rice', 'rice_sales');
select pg_temp.delete_all('rice', 'rice_purchases');
select pg_temp.delete_all('rice', 'rice_mill_batches');
select pg_temp.delete_all('rice', 'rice_storage_accounts');
select pg_temp.delete_all('rice', 'rice_parties');

select pg_temp.delete_all('school', 'sch_exam_results');
select pg_temp.delete_all('school', 'sch_exam_papers');
select pg_temp.delete_all('school', 'sch_exams');
select pg_temp.delete_all('school', 'sch_fee_payments');
select pg_temp.delete_all('school', 'sch_fee_charges');
select pg_temp.delete_all('school', 'sch_fee_assignments');
select pg_temp.delete_all('school', 'sch_fee_structure_terms');
select pg_temp.delete_all('school', 'sch_fee_structures');
select pg_temp.delete_all('school', 'sch_store_sale_lines');
select pg_temp.delete_all('school', 'sch_store_movements');
select pg_temp.delete_all('school', 'sch_store_sales');
select pg_temp.delete_all('school', 'sch_store_items');
select pg_temp.delete_all('school', 'sch_emergency_fund_entries');
select pg_temp.delete_all('school', 'sch_staff_salary_payments');
select pg_temp.delete_all('school', 'sch_staff_salary_allocations');
select pg_temp.delete_all('school', 'sch_staff_salary_history');
select pg_temp.delete_all('school', 'sch_fuel_records');
select pg_temp.delete_all('school', 'sch_maintenance_records');
select pg_temp.delete_all('school', 'sch_expenses');
select pg_temp.delete_all('school', 'sch_student_transport');
select pg_temp.delete_all('school', 'sch_student_guardians');
select pg_temp.delete_all('school', 'sch_placement_events');
select pg_temp.delete_all('school', 'sch_promotion_runs');
select pg_temp.delete_all('school', 'sch_admissions');
select pg_temp.delete_all('school', 'sch_student_enrollments');
select pg_temp.delete_all('school', 'sch_staff_assignments');
select pg_temp.delete_all('school', 'sch_driver_assignments');
select pg_temp.delete_all('school', 'sch_class_subjects');
select pg_temp.delete_all('school', 'sch_academic_access');
select pg_temp.delete_all('school', 'sch_students');
select pg_temp.delete_all('school', 'sch_guardians');
select pg_temp.delete_all('school', 'sch_staff');
select pg_temp.delete_all('school', 'sch_class_streams');
select pg_temp.delete_all('school', 'sch_classes');
select pg_temp.delete_all('school', 'sch_transport_routes');
select pg_temp.delete_all('school', 'sch_buses');

select pg_temp.delete_all('supermarket', 'sm_tax_applications');
select pg_temp.delete_all('supermarket', 'sm_supplier_invoice_items');
select pg_temp.delete_all('supermarket', 'sm_supplier_payment_requests');
select pg_temp.delete_all('supermarket', 'sm_sales_return_items');
select pg_temp.delete_all('supermarket', 'sm_sales_returns');
select pg_temp.delete_all('supermarket', 'sm_sale_payments');
select pg_temp.delete_all('supermarket', 'sm_sale_items');
select pg_temp.delete_all('supermarket', 'sm_promotion_products');
select pg_temp.delete_all('supermarket', 'sm_promotion_categories');
select pg_temp.delete_all('supermarket', 'sm_promotion_tiers');
select pg_temp.delete_all('supermarket', 'sm_stock_loss_events');
select pg_temp.delete_all('supermarket', 'sm_stock_reconciliation_items');
select pg_temp.delete_all('supermarket', 'sm_goods_receipt_items');
select pg_temp.delete_all('supermarket', 'sm_stock_movements');
select pg_temp.delete_all('supermarket', 'sm_bank_reconciliation_items');
select pg_temp.delete_all('supermarket', 'sm_petty_cash_transactions');
select pg_temp.delete_all('supermarket', 'sm_petty_cash_reconciliations');
select pg_temp.delete_all('supermarket', 'sm_sales_reconciliations');
select pg_temp.delete_all('supermarket', 'sm_cash_reconciliations');
select pg_temp.delete_all('supermarket', 'sm_sales');
select pg_temp.delete_all('supermarket', 'sm_stock_batches');
select pg_temp.delete_all('supermarket', 'sm_stock_adjustments');
select pg_temp.delete_all('supermarket', 'sm_stock_reconciliations');
select pg_temp.delete_all('supermarket', 'sm_goods_receipts');
select pg_temp.delete_all('supermarket', 'sm_supplier_invoices');
select pg_temp.delete_all('supermarket', 'sm_purchase_order_items');
select pg_temp.delete_all('supermarket', 'sm_purchase_orders');
select pg_temp.delete_all('supermarket', 'sm_bank_transactions');
select pg_temp.delete_all('supermarket', 'sm_bank_reconciliations');
select pg_temp.delete_all('supermarket', 'sm_petty_cash_funds');
select pg_temp.delete_all('supermarket', 'sm_payments');
select pg_temp.delete_all('supermarket', 'sm_expenses');
select pg_temp.delete_all('supermarket', 'sm_promotions');
select pg_temp.delete_all('supermarket', 'sm_pos_customers');
select pg_temp.delete_all('supermarket', 'sm_products');
select pg_temp.delete_all('supermarket', 'sm_suppliers');

select pg_temp.delete_all('operations', 'offline_operation_receipts');

-- Required counter rows stay. The next document number starts again at 1.
update public.farm_document_counters set next_value = 1;
update public.rice_document_counters set next_value = 1;
update public.sch_document_counters set next_value = 1;
update public.sm_document_counters set next_value = 1;

update public.tractor_sequence
set last_code = 'TRC-000',
    updated_at = now()
where id = 1;

do $$
declare
  v_not_cleared text;
  v_not_attempted text;
  v_damaged text;
  v_owners bigint;
begin
  select string_agg(w.table_name, ', ' order by w.table_name)
    into v_not_attempted
  from wipe_class w
  where w.class_name = 'OPERATIONAL_DATA'
    and not exists (
      select 1 from wipe_deleted d where d.table_name = w.table_name
    );

  if v_not_attempted is not null then
    raise exception 'Operational tables were not deleted: %', v_not_attempted;
  end if;

  select string_agg(s.table_name || ' (' || s.n::text || ')', ', ' order by s.table_name)
    into v_not_cleared
  from (
    select w.table_name, pg_temp.row_count(w.table_name) as n
    from wipe_class w
    where w.class_name = 'OPERATIONAL_DATA'
  ) s
  where s.n <> 0;

  if v_not_cleared is not null then
    raise exception 'Operational tables still have rows: %', v_not_cleared;
  end if;

  select string_agg(
           b.table_name || ' before ' || b.row_count::text || ' now ' || a.n::text,
           ', ' order by b.table_name
         )
    into v_damaged
  from wipe_protected_before b
  join (
    select w.table_name, pg_temp.row_count(w.table_name) as n
    from wipe_class w
    where w.class_name = 'ESSENTIAL_CONFIGURATION'
  ) a on a.table_name = b.table_name
  where a.n <> b.row_count;

  if v_damaged is not null then
    raise exception 'Essential configuration changed: %', v_damaged;
  end if;

  if (select count(*) from auth.users)
     <> (select row_count from wipe_protected_before where table_name = 'auth.users') then
    raise exception 'auth.users changed. Transaction will roll back.';
  end if;

  if (select count(*) from public.tractor_sequence) <> 1
     or (select last_code from public.tractor_sequence where id = 1) is distinct from 'TRC-000' then
    raise exception 'tractor_sequence must remain one row reset to TRC-000.';
  end if;

  if exists (select 1 from public.farm_document_counters where next_value <> 1)
     or exists (select 1 from public.rice_document_counters where next_value <> 1)
     or exists (select 1 from public.sch_document_counters where next_value <> 1)
     or exists (select 1 from public.sm_document_counters where next_value <> 1) then
    raise exception 'A document counter was not reset to 1.';
  end if;

  select count(*)
    into v_owners
  from public.profiles p
  join public.roles r on r.id = p.role_id
  where r.code in ('OWNER', 'SUPER_ADMIN')
    and p.is_active;

  if v_owners < 1 then
    raise exception 'No active owner or super-admin profile remains.';
  end if;

  if (select count(*) from public.business_units) < 1
     or (select count(*) from public.organization_settings) < 1 then
    raise exception 'Business identity or organisation settings were removed.';
  end if;
end $$;

commit;

-- ---------------------------------------------------------------------------
-- Validation. These run only after the commit succeeds.
-- ---------------------------------------------------------------------------

-- 1. Operational tables that still have rows. Must return zero rows.
select w.module_name,
       w.table_name as operational_table_not_cleared,
       pg_temp.row_count(w.table_name) as remaining_rows
from wipe_class w
where w.class_name = 'OPERATIONAL_DATA'
  and pg_temp.row_count(w.table_name) > 0
order by 1, 2;

-- 2. Remaining count for every operational table. Every value must be 0.
select w.module_name,
       w.table_name as operational_table,
       pg_temp.row_count(w.table_name) as remaining_rows
from wipe_class w
where w.class_name = 'OPERATIONAL_DATA'
order by 1, 2;

-- 3. Records removed.
select module_name,
       count(*) as tables_cleared,
       sum(deleted_rows) as records_deleted
from wipe_deleted
group by module_name
order by module_name;

select module_name, table_name, deleted_rows
from wipe_deleted
order by module_name, table_name;

-- 4. Essential configuration. before_count and after_count must match.
select b.table_name,
       b.row_count as before_count,
       case
         when b.table_name = 'auth.users' then (select count(*) from auth.users)
         else pg_temp.row_count(b.table_name)
       end as after_count
from wipe_protected_before b
order by b.table_name;

-- 5. Owner login, permissions, and business identity.
select r.code as role_code,
       count(*) as active_profiles
from public.profiles p
join public.roles r on r.id = p.role_id
where r.code in ('OWNER', 'SUPER_ADMIN')
  and p.is_active
group by r.code
order by r.code;

select (select count(*) from public.roles) as roles,
       (select count(*) from public.permissions) as permissions,
       (select count(*) from public.role_permissions) as role_permissions,
       (select count(*) from public.user_business_units) as user_business_units,
       (select count(*) from public.business_units) as business_units,
       (select count(*) from public.organization_settings) as organization_settings,
       (select count(*) from auth.users) as auth_users;

select code, name, is_active
from public.business_units
order by sort_order, code;

-- 6. Counters reset, configuration rows kept.
select 'farm_document_counters' as counter_table, count(*) as rows_kept, min(next_value) as min_next, max(next_value) as max_next
from public.farm_document_counters
union all
select 'rice_document_counters', count(*), min(next_value), max(next_value)
from public.rice_document_counters
union all
select 'sch_document_counters', count(*), min(next_value), max(next_value)
from public.sch_document_counters
union all
select 'sm_document_counters', count(*), min(next_value), max(next_value)
from public.sm_document_counters;

select id, last_code
from public.tractor_sequence
order by id;
