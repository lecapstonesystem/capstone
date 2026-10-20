-- ============================================================
-- 25_member_work_email.sql
-- A second, record-only email for members.
--
-- WHY: the coop's paper data sheets carry the member's
-- @deped.gov.ph address, but the app login must use a personal
-- address the member controls — DepEd accounts are deactivated
-- when staff leave, and DepEd's guidelines restrict government
-- accounts from being used for non-official services.
--
-- WHAT THIS DOES: `email` stays the login identity (reset links,
-- Issue Credentials, duplicate check, email-change guard all use
-- it). `work_email` is contact information for the coop only —
-- no system behaviour, never used to sign in or send resets.
--
-- App side: nothing to change. The app continues to send `email`
-- (the login address); `work_email` is filled by the portal.
--
-- Safe to re-run.
-- ============================================================

ALTER TABLE member
  ADD COLUMN IF NOT EXISTS work_email text;

COMMENT ON COLUMN member.work_email IS
  'Work / office email (e.g. DepEd). Record only — never used for login or password resets.';

-- Verify: work_email should appear as text.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'member'
ORDER BY ordinal_position;
