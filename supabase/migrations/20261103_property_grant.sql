-- Property table privileges for authenticated users (if missing)
-- Safe: only grants necessary operations to existing authenticated role
-- Must be applied in Supabase SQL Editor; does not recreate table or disable RLS

GRANT INSERT, SELECT, UPDATE, DELETE ON properties TO authenticated;
