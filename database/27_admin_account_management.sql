-- ============================================================
-- 27_admin_account_management.sql
-- Only Super Admins and the Developer may manage admin accounts.
--
-- WHY: adviser UAT found the rule was claim-only. The Admin
-- Accounts banner promised "Only a Super Admin can manage
-- accounts", but nothing enforced it: the page had no role
-- checks, and — more importantly — 06_admin_access.sql gave
-- every admin session a "admin full access" (FOR ALL) policy on
-- the admin table itself. Any signed-in admin could therefore
-- INSERT an account, or UPDATE another account's role, straight
-- against the API, with or without buttons. The web app now also
-- gates the page (stores/admins.js canManageAccounts); this
-- migration is the layer that does not depend on the interface.
--
-- WHAT CHANGES:
--   1. is_super_admin() — same SECURITY DEFINER pattern as
--      is_admin() (06) and is_developer() (22).
--   2. The single "admin full access" policy on admin is replaced
--      by three, mirroring how 22 tightened the data tables:
--        * SELECT   — every admin (the list page stays view-only
--                     for the ordinary Admin role).
--        * INSERT   — Super Admin or Developer only.
--        * UPDATE   — managers may touch any row; an ordinary
--                     admin may touch only their own row, and
--                     only for last_login / must_change_password
--                     (the two writes every sign-in and the
--                     change-password screen legitimately make).
--        * DELETE   — deliberately left with NO policy for any
--                     role. Accounts are disabled, never deleted
--                     (audit trail: notification.created_by
--                     clears to NULL if a row ever goes, per 23).
--   3. admin_account_freeze() trigger — RLS cannot restrict
--      WHICH columns a row updates (same reason as 21), so the
--      trigger freezes name, role, email, auth_uid, login_enabled
--      and created_at for non-managers. An ordinary admin cannot
--      promote their own row. The SQL editor (no JWT) is exempt,
--      so 22's grant-yourself-the-role line and the reference
--      scripts keep working.
--
-- Run AFTER: 26_member_status_inactive.sql
-- Safe to re-run (DROP POLICY IF EXISTS / CREATE OR REPLACE /
-- DROP TRIGGER IF EXISTS everywhere). No rows are touched.
-- ============================================================


-- ---------- 1. is_super_admin() ----------

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin WHERE auth_uid = auth.uid() AND role = 'Super Admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;


-- ---------- 2. Replace "admin full access" on admin ----------
-- PostgreSQL allows ONE command per policy, so the FOR ALL from 06
-- becomes: select (all admins), insert (managers), update
-- (managers any row / ordinary admins own row). No DELETE policy
-- exists for any role.

DROP POLICY IF EXISTS "admin full access" ON public.admin;

DROP POLICY IF EXISTS "admin select rows" ON public.admin;
CREATE POLICY "admin select rows" ON public.admin
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "manager insert rows" ON public.admin;
CREATE POLICY "manager insert rows" ON public.admin
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR public.is_developer());

DROP POLICY IF EXISTS "manager update rows" ON public.admin;
CREATE POLICY "manager update rows" ON public.admin
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin() OR public.is_developer()
    OR auth_uid = auth.uid()
  )
  WITH CHECK (
    public.is_super_admin() OR public.is_developer()
    OR auth_uid = auth.uid()
  );


-- ---------- 3. Column freeze for non-managers ----------
-- The own-row UPDATE above would still let an ordinary admin set
-- role = 'Super Admin' on their own row — WITH CHECK cannot tell a
-- role change from a last_login stamp. The trigger can.

CREATE OR REPLACE FUNCTION public.admin_account_freeze() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- The SQL editor and the service key have no JWT — they are the
  -- trusted operator path (seed script, reference scripts).
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  -- Managers (Super Admin / Developer) manage every column.
  IF public.is_super_admin() OR public.is_developer() THEN
    RETURN NEW;
  END IF;
  -- An ordinary admin may only stamp their own sign-in trail:
  -- last_login (each sign-in) and must_change_password (cleared by
  -- the change-password screen). Everything else is frozen,
  -- including their own role — no self-promotion.
  IF NEW.name            IS DISTINCT FROM OLD.name
     OR NEW.role         IS DISTINCT FROM OLD.role
     OR NEW.email        IS DISTINCT FROM OLD.email
     OR NEW.auth_uid     IS DISTINCT FROM OLD.auth_uid
     OR NEW.login_enabled IS DISTINCT FROM OLD.login_enabled
     OR NEW.created_at   IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Only a Super Admin or the Developer can manage admin accounts';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS admin_account_freeze ON public.admin;
CREATE TRIGGER admin_account_freeze
  BEFORE UPDATE ON public.admin
  FOR EACH ROW EXECUTE FUNCTION public.admin_account_freeze();


-- ---------- 4. Verify ----------
-- a) function — expect 1 row:
SELECT proname FROM pg_proc WHERE proname = 'is_super_admin';

-- b) policies — expect 3 rows: "admin select rows" (select),
--    "manager insert rows" (insert), "manager update rows"
--    (update). NO delete row:
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'admin'
ORDER BY policyname;

-- c) trigger — expect 1 row:
SELECT tgname FROM pg_trigger
WHERE tgrelid = 'public.admin'::regclass AND NOT tgisinternal;

-- d) behavior spot-checks (run as an ordinary Admin session from the
--    app, or reason through them): the self-promotion UPDATE below
--    must be rejected by the trigger with
--    "Only a Super Admin or the Developer can manage admin accounts":
-- UPDATE admin SET role = 'Super Admin'
-- WHERE auth_uid = auth.uid();
