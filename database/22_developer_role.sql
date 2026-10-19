-- ============================================================
-- 22_developer_role.sql
-- Developer role — test-data cleanup from the portal.
--
-- WHY: testing on the live database leaves test members and loans
-- behind; until now removing them meant hand-running the reference
-- SQL script. This migration creates a third admin role value
-- ('Developer') whose session may delete rows nobody else can.
--
-- SECURITY MODEL:
--   * admin.role already existed — 'Developer' is simply a value in
--     it, granted by a Super Admin from the Admin Accounts page, or
--     by the one-line UPDATE at the bottom of this file. There is no
--     self-promotion path in the app.
--   * 06_admin_access.sql gave every admin FOR ALL on every table —
--     so at the API level ANY admin session could already delete a
--     member; only the absence of buttons prevented it. This file
--     TIGHTENS that: the tables below lose DELETE for ordinary
--     admins, and a new policy grants DELETE to is_developer() only.
--   * audit_log gets NO delete policy at all — the trail is
--     append-only, even for the developer. Deleting test data is
--     itself logged as an audit entry.
--   * The portal adds a typed-confirmation step; RLS enforces the
--     role. Both halves must agree before a row disappears.
--
-- Run AFTER: 21_notifications.sql
-- Safe to re-run (IF NOT EXISTS / DROP IF EXISTS everywhere).
-- Existing rows untouched — only policies and one function change.
-- ============================================================


-- ---------- 1. is_developer() ----------
-- Same SECURITY DEFINER pattern as is_admin() (06) so it can be
-- checked inside a policy on any table without recursion.

CREATE OR REPLACE FUNCTION public.is_developer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin WHERE auth_uid = auth.uid() AND role = 'Developer'
  );
$$;

REVOKE ALL ON FUNCTION public.is_developer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_developer() TO authenticated;


-- ---------- 2. Ordinary admins lose DELETE on the data tables ----------
-- Recreate 06's "admin full access" as SELECT, INSERT, UPDATE — same
-- gate, no DELETE. The portal has no legitimate flow that deletes
-- these rows, so nothing breaks. audit_log tightens to the same
-- three commands and keeps no DELETE path for anyone.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'member', 'loan', 'payment', 'co_maker', 'loan_application',
    'share_capital', 'attachment', 'audit_log'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "admin full access" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "admin full access" ON public.%I '
      'FOR SELECT, INSERT, UPDATE TO authenticated '
      'USING (public.is_admin()) WITH CHECK (public.is_admin())', t);
  END LOOP;
END $$;


-- ---------- 3. Developer-only DELETE ----------
-- audit_log is deliberately absent from this list: no delete policy
-- exists on it for any role.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'member', 'loan', 'payment', 'co_maker', 'loan_application',
    'share_capital', 'attachment'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "developer delete test data" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "developer delete test data" ON public.%I '
      'FOR DELETE TO authenticated USING (public.is_developer())', t);
  END LOOP;
END $$;


-- ---------- 4. Grant yourself the role (run once — edit the email) ----------
-- UPDATE admin SET role = 'Developer' WHERE email = 'your-login@email';


-- ---------- 5. Verify ----------
-- a) function exists:
SELECT proname FROM pg_proc WHERE proname = 'is_developer';

-- b) roles in place (promote yourself with the UPDATE above if needed):
SELECT admin_id, name, role FROM admin ORDER BY admin_id;

-- c) policies — expect each of the 8 tables to show "admin full access"
--    with cmd 'select,insert,update', and the 7 deletion tables to also
--    show "developer delete test data" with cmd 'delete'. audit_log must
--    have NO delete policy:
SELECT tablename, policyname, cmd FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('member','loan','payment','co_maker',
                    'loan_application','share_capital','attachment','audit_log')
ORDER BY tablename, policyname;
