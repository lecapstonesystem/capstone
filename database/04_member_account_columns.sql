-- ============================================================
-- 04_member_account_columns.sql
-- Transitional account columns for the admin portal's member panel
-- (Login Enabled / Must change password / temporary password).
--
-- Run AFTER: ucms_schema.sql, 02_rls_policies.sql, 03_add_form_columns.sql
-- Safe to re-run.
--
-- TRANSITIONAL by design: when Supabase Auth is wired, logins live in
-- auth.users and these three columns are dropped — in particular
-- temp_password must not stay in the database longer than that.
-- ============================================================

ALTER TABLE member ADD COLUMN IF NOT EXISTS login_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE member ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
ALTER TABLE member ADD COLUMN IF NOT EXISTS temp_password text;  -- TRANSITIONAL — drop with Supabase Auth

-- Existing members default to a clean state; only members who were issued
-- credentials before the swap need manual fixing (none yet — DB is empty).
UPDATE member SET login_enabled = true WHERE login_enabled IS NULL;

-- Verify
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'member'
  AND column_name IN ('login_enabled', 'must_change_password', 'temp_password')
ORDER BY column_name;
