-- =============================================================
-- 15_registration_queue.sql
-- Applications module: the registration queue lives on `member`
--
-- Client rule: there is NO online registration. Members register
-- face-to-face, arriving one of two ways:
--   1. Walk-in — an admin types the applicant's details (portal)
--   2. Flutter app — the app pre-fills the paper form and inserts
--      the member row directly with status 'Pending' + the ID
--      photo (13_app_documents.sql)
--
-- Until approved, an applicant is a member row in a REVIEW status
-- (Pending / Under Review / Returned / Rejected) — the Members
-- module filters those out (they are not members yet). Approving
-- flips the row to Active and assigns member_no = KHS-#### from
-- member_id, the same rule as 09's backfill.
--
-- Status lifecycle on member.status:
--   Pending → Under Review → Active | Returned | Rejected
--   Returned → Under Review (applicant resubmits, admin re-reviews)
--   Active = approved — a real member.
--
-- Columns added to member:
--   app_source    'Walk-in' (portal entry) or 'App' (Flutter app)
--   app_remarks   admin remarks (required to return/reject)
--   app_checklist the 4 requirements verified before approval
--   app_events    review timeline [{at, action, by}], newest first
--
-- The Flutter contract's registration insert must send
-- app_source = 'App'; checklist and events default correctly for
-- both sources, remarks are written by the admin only.
--
-- NOTE FOR SCHEMA REVIEW (teammate): application review state lives
-- on member itself — there is no separate registration table, by
-- design: a rejected applicant keeps their row (status Rejected)
-- and an approved one becomes the member with no copy created.
--
-- Run in the Supabase SQL Editor (paste-run). Safe to re-run.
-- =============================================================

ALTER TABLE member
  ADD COLUMN IF NOT EXISTS app_source varchar(20) NOT NULL DEFAULT 'Walk-in',
  ADD COLUMN IF NOT EXISTS app_remarks text,
  ADD COLUMN IF NOT EXISTS app_checklist jsonb DEFAULT '[
    {"label": "Signed application form", "checked": false},
    {"label": "Photocopy of valid ID", "checked": false},
    {"label": "1x1 ID photo", "checked": false},
    {"label": "Membership fee paid", "checked": false}
  ]'::jsonb,
  ADD COLUMN IF NOT EXISTS app_events jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN member.app_source IS
  'Application source: Walk-in (admin entry) or App (Flutter pre-filled registration)';
COMMENT ON COLUMN member.app_remarks IS
  'Admin remarks on the application (required when returning or rejecting)';
COMMENT ON COLUMN member.app_checklist IS
  'Requirements verified before approval: signed form, ID photocopy, 1x1 photo, membership fee';
COMMENT ON COLUMN member.app_events IS
  'Application review timeline, newest first: [{at, action, by}]';

-- ---------- Verification ----------
-- Expect: 4 rows (app_checklist, app_events, app_remarks, app_source)
--         members_total = 80, in_queue = 0 (queue starts empty).
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'member'
  AND column_name LIKE 'app\_%'
ORDER BY column_name;

SELECT count(*) AS members_total,
       count(*) FILTER (WHERE status IN ('Pending', 'Under Review', 'Returned', 'Rejected')) AS in_queue
FROM member;
