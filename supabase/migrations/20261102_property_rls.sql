-- Property RLS policy for RM Holdings multi-tenant architecture
-- Enables safe INSERT/SELECT for authorized users based on business_unit membership
-- Does NOT grant unrestricted access; verifies user is assigned to the business unit

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS properties_select_owner
ON properties FOR SELECT
TO authenticated
USING (business_unit_id IN (
  SELECT business_unit_id FROM user_business_units WHERE user_id = auth.uid()
) OR EXISTS (
  SELECT 1 FROM user_business_units ub WHERE ub.user_id = auth.uid() AND ub.business_unit_id = properties.business_unit_id
));

CREATE POLICY IF NOT EXISTS properties_insert_owner
ON properties FOR INSERT
TO authenticated
WITH CHECK (business_unit_id IN (
  SELECT business_unit_id FROM user_business_units WHERE user_id = auth.uid()
));
