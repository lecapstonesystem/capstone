-- ============================================================
-- 23_notification_freeze_fk_null.sql
-- Fix: developer test-data cleanup could not delete a loan.
--
-- WHY: notification.loan_id references loan with ON DELETE SET NULL.
-- Deleting a loan makes PostgreSQL write loan_id = NULL on that
-- loan's notifications — an UPDATE — and the content-freeze trigger
-- (21) treated every change except read_at as tampering, including
-- this system-issued nulling. The delete failed with a raw trigger
-- error, which the portal could only show as a generic message.
--
-- WHAT CHANGES: the freeze still protects everything a person could
-- edit (member, type, title, body, created_at). The two foreign-key
-- links may now be cleared to NULL by a parent delete:
--   * loan_id    — set null when a loan is deleted
--   * created_by — set null when an admin account is deleted
-- Pointing a link at a DIFFERENT non-null row is still rejected.
--
-- The portal also clears a loan's notifications before deleting it
-- (web/src/stores/loans.js), so this migration is the safety net for
-- the reference SQL scripts and any future path.
--
-- Run AFTER: 22_developer_role.sql
-- Safe to re-run (CREATE OR REPLACE only; no data touched).
-- ============================================================

CREATE OR REPLACE FUNCTION notification_freeze() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.member_id   IS DISTINCT FROM OLD.member_id
     OR (NEW.loan_id IS DISTINCT FROM OLD.loan_id AND NEW.loan_id IS NOT NULL)
     OR NEW.type     IS DISTINCT FROM OLD.type
     OR NEW.title    IS DISTINCT FROM OLD.title
     OR NEW.body     IS DISTINCT FROM OLD.body
     OR (NEW.created_by IS DISTINCT FROM OLD.created_by AND NEW.created_by IS NOT NULL)
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'notification content is read-only — only read_at may change';
  END IF;
  RETURN NEW;
END;
$$;

-- Verify: the body above must show the two "IS NOT NULL" guards.
SELECT pg_get_functiondef('notification_freeze'::regproc);
