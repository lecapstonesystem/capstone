-- ============================================================
-- 06_admin_access.sql  (DRAFT — teammate review before running)
--
-- ADMIN-portal access layer.
-- 02_rls_policies.sql covers the MEMBER app: own-row access via
-- member.auth_uid, and it says ledger/report/audit_log/admin "stay
-- invisible to the app, by design". "The app" there = the member
-- app. The admin portal is the exception — that's this file.
--
-- Adds the admin side WITHOUT touching any policy 02 created.
-- Postgres policies are permissive: ours OR with theirs, so
-- members stay confined to their own rows.
--
-- Run AFTER: ucms_schema.sql, 02_rls_policies.sql,
--            03_add_form_columns.sql, 04, 05.
-- Safe to re-run (IF NOT EXISTS / DROP IF EXISTS everywhere).
--
-- Who counts as admin: a row in public.admin whose auth_uid matches
-- the logged-in Supabase Auth user — the SAME pattern 02 uses for
-- members. Deleting the row revokes access on the spot.
-- (Alternative considered: JWT app_metadata role claim. Row-based
-- was chosen because it mirrors 02 and keeps the admin list in one
-- place. Flagging for review — easy to switch.)
-- ============================================================

-- ---------- 1. Link admin rows to Supabase Auth users ----------
ALTER TABLE admin ADD COLUMN IF NOT EXISTS auth_uid uuid UNIQUE;

-- ---------- 2. is_admin() ----------
-- SECURITY DEFINER so checking it inside a policy on `admin` itself
-- cannot recurse (owner postgres reads the table directly).
-- auth.uid() is NULL for anon -> EXISTS is false -> anon sees nothing.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin WHERE auth_uid = auth.uid()
  );
$$;

-- The function is an internal switch, not an API: only the portal's
-- role needs to call it.
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ---------- 3. API grants the portal needs ----------
-- 02 granted SELECT-only on most tables and nothing on
-- ledger/audit_log/admin. Grants are additive — this extends them.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  member, loan, loan_application, payment, share_capital,
  dividend, co_maker, ledger, audit_log, report, admin
  TO authenticated;

-- 05 gave every PK a nextval() default; INSERTs need sequence rights
-- or they die with 42501 on the sequence even with policies in place.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ---------- 4. One admin policy per table ----------
-- FOR ALL covers SELECT/INSERT/UPDATE/DELETE in one policy.
-- WITH CHECK protects writes: an admin's rows must pass the same
-- gate as the read path.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'member', 'loan', 'loan_application', 'payment', 'share_capital',
    'dividend', 'co_maker', 'ledger', 'audit_log', 'report', 'admin'
  ] LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS "admin full access" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "admin full access" ON public.%I '
      'FOR ALL TO authenticated '
      'USING (public.is_admin()) WITH CHECK (public.is_admin())', t);
  END LOOP;
END $$;


-- ============================================================
-- Verify
-- ============================================================
-- 1) admin policy on all 11 tables:
SELECT policyname, tablename
FROM pg_policies
WHERE schemaname = 'public' AND policyname = 'admin full access'
ORDER BY tablename;

-- 2) auth link + function exist:
SELECT column_name FROM information_schema.columns
WHERE table_name = 'admin' AND column_name = 'auth_uid';
SELECT proname FROM pg_proc WHERE proname = 'is_admin';

-- 3) INSERT now granted everywhere the portal writes:
SELECT table_name
FROM information_schema.role_table_grants
WHERE grantee = 'authenticated'
  AND table_schema = 'public'
  AND privilege_type = 'INSERT'
ORDER BY table_name;


-- ============================================================
-- After this file runs: bootstrap the FIRST admin
-- (end-to-end login can only be tested with a real auth user)
--   1. Supabase Dashboard -> Authentication -> Users -> Add user
--      (email + temp password, "Auto Confirm User" ON)
--   2. Copy the new user's UUID
--   3. INSERT INTO admin (name, role, email, created_at, auth_uid)
--      VALUES ('Full Name', 'Administrator', 'email@example.com',
--              now(), '<paste-uuid-here>');
-- Then the portal login (Supabase Auth) + probe can verify for real.
-- ============================================================
