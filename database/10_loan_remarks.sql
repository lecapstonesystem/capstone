-- ============================================================
-- 10_loan_remarks.sql
--
-- The admin portal's rejection flow records WHY a loan was turned
-- down ("Salary proof insufficient — ...") and shows it on the loan
-- detail and in Recent Activity. public.loan had no column for it.
--
-- Run AFTER: 09_backfill_member_no.sql.
-- Safe to re-run (IF NOT EXISTS).
-- ============================================================

ALTER TABLE loan ADD COLUMN IF NOT EXISTS remarks text;

-- Verify — expect exactly one row.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'loan' AND column_name = 'remarks';
