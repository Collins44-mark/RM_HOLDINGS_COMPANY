-- Final clean Properties access rebuild (idempotent, safe, no invented schema)
-- Removes all broken/stacked property-specific policies from previous attempts
-- Establishes one verified employee authorization path; Owner uses admin server pattern

DROP POLICY IF EXISTS properties_select_owner ON properties;
DROP POLICY IF EXISTS properties_insert_owner ON properties;
DROP POLICY IF EXISTS properties_select_company ON properties;
DROP POLICY IF EXISTS properties_insert_company ON properties;
DROP POLICY IF EXISTS properties_select_employee ON properties;
DROP POLICY IF EXISTS properties_insert_employee ON properties;

CREATE POLICY IF NOT EXISTS properties_select_employee ON properties FOR SELECT TO authenticated USING (
  business_unit_id IN (SELECT business_unit_id FROM user_business_units WHERE user_id = auth.uid())
);
CREATE POLICY IF NOT EXISTS properties_insert_employee ON properties FOR INSERT TO authenticated WITH CHECK (
  business_unit_id IN (SELECT business_unit_id FROM user_business_units WHERE user_id = auth.uid())
);
