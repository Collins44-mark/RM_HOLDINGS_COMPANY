-- Remove broken property-specific assignment-only policies (20261102)
DROP POLICY IF EXISTS properties_select_owner ON properties;
DROP POLICY IF EXISTS properties_insert_owner ON properties;

-- Existing working modules use service-role admin + session authorization.
-- Properties must not invent new per-user assignment rules for Owner.
-- Keep employee authorization via user_business_units; allow Owner via session/business context.
CREATE POLICY IF NOT EXISTS properties_select_company ON properties FOR SELECT TO authenticated USING (
  business_unit_id IN (SELECT business_unit_id FROM user_business_units WHERE user_id = auth.uid())
  OR business_unit_id IN (SELECT id FROM business_units WHERE company_id = (SELECT company_id FROM users WHERE id = auth.uid()))
);
CREATE POLICY IF NOT EXISTS properties_insert_company ON properties FOR INSERT TO authenticated WITH CHECK (
  business_unit_id IN (SELECT business_unit_id FROM user_business_units WHERE user_id = auth.uid())
  OR business_unit_id IN (SELECT id FROM business_units WHERE company_id = (SELECT company_id FROM users WHERE id = auth.uid()))
);
