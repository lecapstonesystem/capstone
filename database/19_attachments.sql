-- =============================================================
-- 19_attachments.sql
-- Files module: admin-uploaded attachments (scans, receipts, checks)
--
-- Before this, the portal could only upload photos (13's member
-- profile photo and payment receipts). Cooperatives also keep paper
-- trails that arrive as scans and photos of PHYSICAL documents:
-- the signed membership form, valid IDs, loan receipts and checks.
-- This adds:
--
--   attachment       one table for both targets — a row points at
--                    exactly one member OR one loan (check
--                    constraint), storing the storage path plus the
--                    display name, optional label and uploader.
--   bucket update    member-documents now also accepts PDF and the
--                    size cap rises from 5 MB to 10 MB (scans).
--
-- Storage layout (inside the private member-documents bucket):
--   admin/member/<member_id>/<timestamp>-<rand>.<ext>
--   admin/loan/<loan_id>/<timestamp>-<rand>.<ext>
-- The admin/ prefix keeps the member app's own folders untouched,
-- and 13's "admin manage documents" storage policy already lets
-- admins write, read and delete there — no new storage policies
-- are needed.
--
-- Visibility: admins only. There is deliberately NO member-facing
-- policy on the table, so app users never see these files — the
-- attachments stay the coop's internal paper trail.
--
-- Run in the Supabase SQL Editor (paste-run). Safe to re-run.
-- =============================================================

-- ---------- 1. The attachment table ----------

CREATE TABLE IF NOT EXISTS attachment (
  attachment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id integer REFERENCES member(member_id),
  loan_id integer REFERENCES loan(loan_id),
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_type text NOT NULL,
  file_size integer,
  note text,
  uploaded_by integer REFERENCES admin(admin_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attachment_one_target CHECK (num_nonnulls(member_id, loan_id) = 1)
);

COMMENT ON TABLE attachment IS
  'Admin-uploaded document attachments: scans and photos of physical paperwork';
COMMENT ON COLUMN attachment.file_path IS
  'Path inside the private member-documents bucket (admin/member/... or admin/loan/...)';
COMMENT ON COLUMN attachment.note IS
  'Optional human label, e.g. "Signed membership form" — shown instead of the filename';
COMMENT ON COLUMN attachment.uploaded_by IS
  'admin.admin_id of the admin who uploaded the file (nullable for safety)';

CREATE INDEX IF NOT EXISTS attachment_member_idx ON attachment (member_id);
CREATE INDEX IF NOT EXISTS attachment_loan_idx ON attachment (loan_id);

-- ---------- 2. RLS: admins only ----------

ALTER TABLE attachment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin full access" ON attachment;
CREATE POLICY "admin full access" ON attachment
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON attachment TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ---------- 3. Bucket: accept PDF, raise the cap to 10 MB ----------
-- The member app only ever sends images, so widening the bucket
-- changes nothing for it.

UPDATE storage.buckets
SET file_size_limit = 10 * 1024 * 1024,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
WHERE id = 'member-documents';

-- =============================================================
-- Verify
-- =============================================================
-- 1) table + constraint + indexes:
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'attachment'
ORDER BY ordinal_position;

-- 2) exactly one admin policy, and members see nothing:
SELECT policyname, tablename FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'attachment';

-- 3) bucket now allows PDF at 10 MB:
SELECT id, file_size_limit, allowed_mime_types
FROM storage.buckets WHERE id = 'member-documents';

-- 4) starts empty:
SELECT count(*) AS attachments FROM attachment;
