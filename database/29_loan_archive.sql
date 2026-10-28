-- ============================================================
-- 29_loan_archive.sql
--
-- ARCHIVAL FEATURE (panel revision request): move fully-paid loans
-- out of the working list WITHOUT deleting them. Cooperatives must
-- retain financial records (RA 9520 / AMLA) — archive is a
-- visibility change, the loan row, its payments and its audit
-- trail all stay in the database forever.
--
--   archived_at = when an admin archived it (NULL = active)
--   archived_by = the admin who archived it (admin_id)
--
-- Effects:
--   * Archived loans are hidden from the portal's default Loans
--     list; a "Show archived" toggle brings them back.
--   * NOTHING else changes: reports, cash flow and member app
--     history still include archived loans (the money is real
--     history). Status stays 'Paid' — archive is not a status.
--
-- Run AFTER: 28_loan_application_co_maker_ids.sql
-- Safe to re-run (IF NOT EXISTS everywhere).
-- ============================================================

ALTER TABLE loan
  ADD COLUMN IF NOT EXISTS archived_at timestamp;

ALTER TABLE loan
  ADD COLUMN IF NOT EXISTS archived_by integer REFERENCES admin(admin_id) ON DELETE SET NULL;

COMMENT ON COLUMN loan.archived_at IS
  'Set when an admin archives a fully-paid loan. NULL = active. Hides the loan from the portal working list only; rows are never deleted (RA 9520 / AMLA retention).';

COMMENT ON COLUMN loan.archived_by IS
  'admin.admin_id of the admin who archived the loan.';

-- ============================================================
-- Verify — expect one row each for archived_at / archived_by
-- ============================================================
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'loan' AND column_name LIKE 'archived%'
ORDER BY column_name;
