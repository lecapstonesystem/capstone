-- ============================================================
-- 09_backfill_member_no.sql
--
-- scripts/seed_supabase.py inserted members with only
-- member_id, name, date_joined — so:
--   * member_no stayed NULL (nothing to print on the portal
--     or on paper forms),
--   * status / member_type kept their lowercase DEFAULTs
--     ('active' / 'regular'), while the portal matches the
--     Title Case strings from admins.js ('Active' / 'Regular').
--
-- Run AFTER: 08_realign_sequences.sql.
-- Safe to re-run:
--   * the member_no UPDATE only touches NULL rows and
--     'KHS-' || lpad(member_id) is unique per member,
--   * initcap() is idempotent.
-- ============================================================

UPDATE member
SET member_no = 'KHS-' || lpad(member_id::text, 4, '0')
WHERE member_no IS NULL;

UPDATE member
SET status = initcap(status)
WHERE status IS DISTINCT FROM initcap(status);

UPDATE member
SET member_type = initcap(member_type)
WHERE member_type IS DISTINCT FROM initcap(member_type);

-- Verify — expect for ~91 seeded members:
--   total = with_member_no, active_status = total, regular_type = total
SELECT count(*)                             AS total,
       count(member_no)                     AS with_member_no,
       count(*) FILTER (WHERE status = 'Active')     AS active_status,
       count(*) FILTER (WHERE member_type = 'Regular') AS regular_type
FROM member;
