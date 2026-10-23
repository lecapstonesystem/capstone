-- ============================================================
-- 28_loan_application_co_maker_ids.sql
-- The exact member ids of the co-maker(s) chosen in the app.
--
-- WHY: migration 24 carried the co-maker names the member typed
-- (requested_co_makers) — suggestions that had to be matched back
-- to members by name, which can miss or mismatch. The updated app
-- now looks the co-makers up itself and sends their member ids.
--
-- WHAT THIS DOES: one integer array column carries those ids to
-- the review screen. The portal shows them read-only and prefills
-- the pickers with them, but the admin still confirms each
-- co-maker before approving — the value stays a suggestion, not
-- an authority. Existing rows get {} and behave exactly as before
-- (name matching), so old pending requests are unaffected.
--
-- App side (contract Flow 2): send
--   "co_maker_ids": [123, 456]
-- alongside the existing requested_co_makers. Omitting it is fine
-- — the review boxes simply fall back to name matching.
--
-- Run BEFORE installing the Android build that sends co_maker_ids:
-- its insert fails while the column is missing. No RLS change — the
-- column rides on the loan_application row the member already
-- inserts and reads. Safe to re-run.
-- ============================================================

ALTER TABLE loan_application
  ADD COLUMN IF NOT EXISTS co_maker_ids integer[] NOT NULL DEFAULT '{}';

-- Reload PostgREST's schema cache so the app and the portal see
-- the new column through the API immediately.
NOTIFY pgrst, 'reload schema';

-- Verify: the table should now list co_maker_ids (ARRAY).
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'loan_application'
ORDER BY ordinal_position;
