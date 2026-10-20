-- ============================================================
-- 24_loan_application_co_maker.sql
-- The member's suggested co-maker(s) from the app.
--
-- WHY: the app's loan form asks the member for a co-maker, but
-- loan_application had no column for it — and co_maker rows can only
-- exist against an approved loan (foreign keys to loan and member).
-- The name was collected in the app and silently dropped, so the
-- portal's Review Loan Request always started with empty boxes.
--
-- WHAT THIS DOES: one nullable array column carries the names the
-- member typed to the review screen. The admin still confirms the
-- person is an existing member before approving — the app cannot
-- check that (members only read their own row under RLS), so the
-- value is a suggestion, not an authority.
--
-- App side (contract Flow 2): send
--   "requested_co_makers": ["Full Name", "Second Name"]
-- with 1–2 names. Omitting it is fine — the review boxes simply
-- start empty, as before.
--
-- Run AFTER: 23_notification_freeze_fk_null.sql
-- Safe to re-run.
-- ============================================================

ALTER TABLE loan_application
  ADD COLUMN IF NOT EXISTS requested_co_makers text[];

-- Verify: the table should now list requested_co_makers (ARRAY).
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'loan_application'
ORDER BY ordinal_position;
