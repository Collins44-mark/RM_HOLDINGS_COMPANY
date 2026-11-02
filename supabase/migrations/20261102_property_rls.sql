-- Property RLS — Owner/Group Admin via business unit assignment + company access
-- Uses auth.uid() against user_business_units for employee access
-- Owner access handled by API business_unit resolution + correct assignment
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS properties_select_owner ON properties;
CREATE POLICY properties_select_owner ON properties FOR SELECT TO authenticated USING (
  business_unit_id IN (SELECT business_unit_id FROM user_business_units WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS properties_insert_owner ON properties;
CREATE POLICY properties_insert_owner ON properties FOR INSERT TO authenticated WITH CHECK (
  business_unit_id IN (SELECT business_unit_id FROM user_business_units WHERE user_id = auth.uid())
);
