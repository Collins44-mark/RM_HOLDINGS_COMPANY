-- Property RLS — Owner/Group Admin company access + Employee assignment restriction
-- Owner (OWNER/SUPER_ADMIN) accesses company business units; employees use assigned units

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS properties_select_owner ON properties;
CREATE POLICY properties_select_owner ON properties FOR SELECT TO authenticated USING (
  business_unit_id IN (
    SELECT business_unit_id FROM user_business_units WHERE user_id = auth.uid()
  )
  OR (business_unit_id IN (
    SELECT id FROM business_units
    WHERE id IN (SELECT business_unit_id FROM user_business_units WHERE user_id = auth.uid())
  ))
);

DROP POLICY IF EXISTS properties_insert_owner ON properties;
CREATE POLICY properties_insert_owner ON properties FOR INSERT TO authenticated WITH CHECK (
  business_unit_id IN (
    SELECT business_unit_id FROM user_business_units WHERE user_id = auth.uid()
  )
  OR (business_unit_id IN (
    SELECT id FROM business_units WHERE id IN (SELECT business_unit_id FROM user_business_units WHERE user_id = auth.uid()))
  )
);
