-- =============================================================
-- 18_profile_photo_label.sql
-- =============================================================
-- WHY: the coop issues no membership IDs, so "1x1 ID photo" was a
--       misleading label. The picture on file is a PROFILE photo
--       (face on record for counter verification). The portal was
--       renamed in commit f6218c4 follow-up; this migration aligns
--       the database default and fixes any rows created before the
--       rename.
--
-- WHAT: member.app_checklist default + existing rows:
--       '1x1 ID photo' → '1x1 photo'
--       ('Photocopy of valid ID' stays — that is a GOVERNMENT ID,
--       which members do have.)
--
-- Run in the Supabase SQL Editor (paste-run). Safe to re-run.
-- =============================================================

-- ---------- 1. Fix rows created before the rename ----------
UPDATE member
SET app_checklist = (
  SELECT jsonb_agg(
    CASE
      WHEN elem->>'label' = '1x1 ID photo'
        THEN jsonb_set(elem, '{label}', '"1x1 photo"')
      ELSE elem
    END
  )
  FROM jsonb_array_elements(app_checklist) AS elem
)
WHERE app_checklist @> '[{"label": "1x1 ID photo"}]'::jsonb;

-- ---------- 2. Fix the default for future rows ----------
ALTER TABLE member
  ALTER COLUMN app_checklist SET DEFAULT '[
    {"label": "Signed application form", "checked": false},
    {"label": "Photocopy of valid ID", "checked": false},
    {"label": "1x1 photo", "checked": false},
    {"label": "Membership fee paid", "checked": false}
  ]'::jsonb;

COMMENT ON COLUMN member.app_checklist IS
  'Requirements verified before approval: signed form, ID photocopy, 1x1 photo, membership fee';

-- ---------- Verification ----------
-- Expect: first query 0 (no stale labels), second query shows the
--         new default.
SELECT count(*) AS stale_labels
FROM member,
     jsonb_array_elements(app_checklist) AS elem
WHERE elem->>'label' = '1x1 ID photo';

SELECT column_default
FROM information_schema.columns
WHERE table_name = 'member' AND column_name = 'app_checklist';
