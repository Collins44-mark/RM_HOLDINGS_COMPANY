-- Property RLS — Owner/Group Admin company access + employee assignment restriction
-- Allows Owner/SUPER_ADMIN (auth role) OR assigned user_business_units assignment
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS properties_select_owner ON properties;
CREATE POLICY properties_select_owner ON properties FOR SELECT TO authenticated USING (
  (business_unit_id IN (SELECT business_unit_id FROM user_business_units WHERE user_id = auth.uid()))
  OR (SELECT role_code FROM auth.users WHERE id = auth.uid()) IN ('OWNER', 'SUPER_ADMIN')
);

DROP POLICY IF EXISTS properties_insert_owner ON properties;
CREATE POLICY properties_insert_owner ON properties FOR INSERT TO authenticated WITH CHECK (
  (business_unit_id IN (SELECT business_unit_id FROM user_business_units WHERE user_id = auth.uid()))
  OR (SELECT role_code FROM auth.users WHERE id = auth.uid()) IN ('OWNER', 'SUPER_ADMIN')
);
