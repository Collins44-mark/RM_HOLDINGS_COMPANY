-- Correct RLS using ONLY verified columns (no company_id, no users.company_id)
-- Remove broken assignment-only policies from 20261102
DROP POLICY IF EXISTS properties_select_owner ON properties;
DROP POLICY IF EXISTS properties_insert_owner ON properties;

-- Remove any invalid company-based policies if they exist from 20261103
DROP POLICY IF EXISTS properties_select_company ON properties;
DROP POLICY IF EXISTS properties_insert_company ON properties;

-- Employee authorization via verified user_business_units table only
CREATE POLICY IF NOT EXISTS properties_select_employee ON properties FOR SELECT TO authenticated USING (
  business_unit_id IN (SELECT business_unit_id FROM user_business_units WHERE user_id = auth.uid())
);
CREATE POLICY IF NOT EXISTS properties_insert_employee ON properties FOR INSERT TO authenticated WITH CHECK (
  business_unit_id IN (SELECT business_unit_id FROM user_business_units WHERE user_id = auth.uid())
);
