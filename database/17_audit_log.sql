-- ============================================================
-- 17_audit_log.sql
--
-- The audit trail: a durable "who did what, when" record behind the
-- Activity lists in Members, Loans and Admins, and the Dashboard's
-- Recent Activity card. Until now logAction() only appended to
-- arrays in browser memory — everything vanished on refresh.
--
--   actor        — snapshot of the acting admin's name at the time
--                  of the action, kept as plain text: the account
--                  itself may one day be removed, but the record of
--                  its actions must stay (RA 9520 / AMLA).
--   entity_type  — 'member' | 'loan' | 'admin'.
--   entity_id    — text, so it fits any id type (member_id,
--                  loan_id, admin_id).
--   action       — plain-language description ("Approved by
--                  committee", "Login disabled", ...).
--
-- Append-only through the portal: the policies below let admins
-- SELECT and INSERT and nothing else. There is deliberately no
-- UPDATE or DELETE policy — history is corrected only through SQL
-- by a system administrator, never by a click in the portal.
--
-- The base schema (ucms_schema.sql) shipped its own audit_log with a
-- different shape (log_id / admin_id / module ...). Nothing ever
-- wrote to it — the portal never used it and the Flutter contract
-- keeps the audit log out of the app's reach (02_rls_policies.sql) —
-- so it is replaced here. The guard below drops it only when that
-- old shape is detected, which keeps this file safe to re-run once
-- the new table is live.
--
-- Run AFTER: 06_admin_access.sql (is_admin()).
-- Safe to re-run (guarded drop / IF NOT EXISTS / DROP POLICY IF
-- EXISTS everywhere).
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'audit_log'
      AND column_name = 'log_id'
  ) THEN
    DROP TABLE audit_log;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  actor text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_log_entity_idx
  ON audit_log (entity_type, entity_id, created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read the audit log" ON audit_log;
CREATE POLICY "Admins can read the audit log"
  ON audit_log FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can append to the audit log" ON audit_log;
CREATE POLICY "Admins can append to the audit log"
  ON audit_log FOR INSERT
  WITH CHECK (public.is_admin());
