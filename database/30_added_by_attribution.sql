-- ============================================================
-- 30_added_by_attribution.sql
--
-- ATTRIBUTION (panel revision request): show WHO added each member
-- and each loan, and with what role. The coop distinguishes
-- staff-entered records from developer-entered TEST records this
-- way — only the Developer role may delete the latter (enforced by
-- row-level security in 22_developer_role.sql, not by the portal).
--
--   added_by_name  = snapshot of the signing-in admin's name at insert
--   added_by_role  = snapshot of their role at insert
--
-- A snapshot instead of a foreign key to admin on purpose:
--   * it stays truthful even if the admin's name or role changes
--     later, or the account itself is removed;
--   * it needs no join to display in the portal.
--
-- Rows added BEFORE this migration keep NULL in both columns and
-- show no "Added by" line — nothing is guessed.
--
-- Effects:
--   * The portal's member and loan detail screens show a small
--     "Added by <name> (<role>)" line when the values exist.
--   * Nothing else changes: no constraints, no triggers, reports
--     and the app are unaffected.
--
-- Run AFTER: 29_loan_archive.sql
-- Safe to re-run (IF NOT EXISTS everywhere).
-- ============================================================

ALTER TABLE member
  ADD COLUMN IF NOT EXISTS added_by_name text;

ALTER TABLE member
  ADD COLUMN IF NOT EXISTS added_by_role text;

ALTER TABLE loan
  ADD COLUMN IF NOT EXISTS added_by_name text;

ALTER TABLE loan
  ADD COLUMN IF NOT EXISTS added_by_role text;

COMMENT ON COLUMN member.added_by_name IS
  'Snapshot of the admin name that registered the member. NULL = entered before this column existed.';

COMMENT ON COLUMN member.added_by_role IS
  'Snapshot of that admin''s role at insert time (Admin / Super Admin / Developer).';

COMMENT ON COLUMN loan.added_by_name IS
  'Snapshot of the admin name that added the loan (portal application or historical entry). NULL = entered before this column existed.';

COMMENT ON COLUMN loan.added_by_role IS
  'Snapshot of that admin''s role at insert time (Admin / Super Admin / Developer).';

-- ============================================================
-- Verify — expect one row each for member/loan x added_by_name/role
-- ============================================================
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE column_name LIKE 'added_by%'
ORDER BY table_name, column_name;
