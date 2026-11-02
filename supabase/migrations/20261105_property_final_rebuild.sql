-- Simple properties flow — delete all policy rules, nothing else
DROP POLICY IF EXISTS properties_select_owner ON properties;
DROP POLICY IF EXISTS properties_insert_owner ON properties;
DROP POLICY IF EXISTS properties_select_company ON properties;
DROP POLICY IF EXISTS properties_insert_company ON properties;
DROP POLICY IF EXISTS properties_select_employee ON properties;
DROP POLICY IF EXISTS properties_insert_employee ON properties;
