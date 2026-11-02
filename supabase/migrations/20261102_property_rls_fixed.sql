-- Property RLS — Corrected for Owner/Group Admin + employee assignment
-- Owner (OWNER/SUPER_ADMIN role or modules="*") gets company-wide access
-- Employees must have assigned business_unit_id in user_business_units
-- Uses auth.uid() and existing user_business_units table

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS properties_select_owner ON properties;
CREATE POLICY properties_select_owner ON properties FOR SELECT TO authenticated USING (
  (business_unit_id IN (SELECT business_unit_id FROM user_business_units WHERE user_id = auth.uid()))
  OR ((SELECT role_code FROM auth.users WHERE id = auth.uid()) IN ('OWNER','SUPER_ADMIN'))
  OR EXISTS (SELECT 1 FROM user_business_units ub WHERE ub.user_id = auth.uid() AND ub.business_unit_id = properties.business_unit_id)
);

DROP POLICY IF EXISTS properties_insert_owner ON properties;
CREATE POLICY properties_insert_owner ON properties FOR INSERT TO authenticated WITH CHECK (
  (business_unit_id IN (SELECT business_unit_id FROM user_business_units WHERE user_id = auth.uid()))
  OR ((SELECT role_code FROM auth.users WHERE id = auth.uid()) IN ('OWNER','SUPER_ADMIN'))
);
