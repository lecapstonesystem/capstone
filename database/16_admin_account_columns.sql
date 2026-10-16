-- ============================================================
-- 16_admin_account_columns.sql
--
-- Admin account lifecycle columns, so the Admins module can run on
-- real data instead of the old mock. Mirrors what 04 did for
-- member accounts.
--
--   login_enabled        — Disable/Enable Login in the portal. Gated
--                          in is_admin() below, so turning it off
--                          actually revokes database access, not just
--                          hides a button.
--   must_change_password — set when an account is created or reset;
--                          the portal forces a password change on
--                          first login until it is cleared.
--   last_login           — timestamp of the most recent successful
--                          sign-in (shown in the admins list).
--
-- No temp_password column: temporary passwords are never stored.
-- One is generated at creation, shown once in the portal, and the
-- value lives only in that browser session. Forgotten passwords are
-- recovered through Supabase's emailed reset link.
--
-- Run AFTER: 06_admin_access.sql (is_admin()), 07_seed_admin.sql.
-- Safe to re-run (IF NOT EXISTS / CREATE OR REPLACE everywhere).
-- ============================================================

ALTER TABLE admin ADD COLUMN IF NOT EXISTS login_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE admin ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
ALTER TABLE admin ADD COLUMN IF NOT EXISTS last_login timestamp without time zone;

-- The existing Super Admin (and any seeded row) must be able to log
-- in after this runs — default is enabled, but state it explicitly.
UPDATE admin SET login_enabled = true WHERE login_enabled IS NULL;


-- ---------- is_admin() now also requires an enabled login ----------
-- Same body as 06, plus `AND login_enabled`. SECURITY DEFINER so it
-- can read admin without recursing through the policy that calls it.
-- Consequence: a disabled admin's session is refused by every
-- "admin full access" policy on the spot. Re-enabling the row restores
-- access — no re-login needed.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin WHERE auth_uid = auth.uid() AND login_enabled
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;


-- ============================================================
-- Verify
-- ============================================================
-- 1) the three columns exist:
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'admin'
  AND column_name IN ('login_enabled', 'must_change_password', 'last_login')
ORDER BY column_name;

-- 2) every existing admin can still log in (all should be true):
SELECT admin_id, name, role, login_enabled, must_change_password
FROM admin
ORDER BY admin_id;

-- 3) is_admin() is the updated version — it must reference
--    login_enabled. A row returned here means the old body is live:
SELECT prosrc FROM pg_proc WHERE proname = 'is_admin';
