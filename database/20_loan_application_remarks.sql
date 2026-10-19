-- db/20_loan_application_remarks.sql — run AFTER 19_attachments.sql
--
-- The portal's loan-request review (Approve / Return / Reject on
-- app-filed loan_application rows) needs somewhere to keep the
-- reviewer's remarks — the same convention as loan.remarks (10)
-- and member.app_remarks (15).
--
-- The mobile app never writes this column: like reviewed_by /
-- date_reviewed it is portal-managed (see docs/app_contract.md,
-- Flow 2 — "the portal sets them").

ALTER TABLE loan_application ADD COLUMN IF NOT EXISTS remarks text;

-- ============================================================
-- Verify — expect one row: remarks | text
-- ============================================================
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'loan_application' AND column_name = 'remarks';
