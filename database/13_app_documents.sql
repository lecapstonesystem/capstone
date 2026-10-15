-- ============================================================
-- 13_app_documents.sql
-- Flutter member app: photo storage + locked-down submission rules.
--
-- WHY: the app submits (a) member registration with an ID photo,
-- (b) loan applications, (c) loan payments with a receipt photo.
-- 02_rls_policies.sql sketched the row rules; four gaps remain:
--   1. member self-registration had NO status gate — an app user
--      could insert themselves straight in as an ACTIVE member;
--   2. members could UPDATE their own member row — self-approve,
--      rewrite their own member_no, flip login_enabled;
--   3. payment inserts had NO status/ownership gate — a member could
--      insert a payment already marked 'Recorded' against someone
--      else's loan (RLS only checked member_id, not loan ownership);
--   4. no Storage bucket existed for photos.
--
-- Decisions (agreed with Hans, Oct 16):
--   * app login = email + password (Supabase Auth)
--   * app writes go DIRECT with RLS — the phase-2 service_role
--     backend is out of scope; the admin portal already writes
--     directly under 06_admin_access.sql
--
-- Run AFTER: 12_merge_duplicate_members.sql
-- Safe to re-run (IF NOT EXISTS / DROP IF EXISTS everywhere).
-- Existing rows are untouched — only policies and one column change.
--
-- Teammate: schema ownership is yours — review before Hans runs it.
-- ============================================================


-- ---------- 1. Photo column + friendlier insert defaults ----------

ALTER TABLE member ADD COLUMN IF NOT EXISTS id_photo_url text;

-- App registration inserts must not fail on NOT NULL date_joined;
-- defaults make the app's insert robust. Seeds pass explicit values,
-- so nothing existing changes.
ALTER TABLE member ALTER COLUMN date_joined SET DEFAULT (now()::date);
ALTER TABLE member ALTER COLUMN created_at   SET DEFAULT now()::timestamp;


-- ---------- 2. Storage bucket for member documents ----------
-- Private: the portal signs short-lived URLs for review; nothing is
-- public. file_size_limit and allowed_mime_types are ENFORCED by the
-- Storage API — this is where size/type gets checked, because RLS
-- policies cannot see file contents.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('member-documents', 'member-documents', false,
        5 * 1024 * 1024,                            -- 5 MB per photo
        ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public             = false,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Supabase ships default storage grants; restating keeps this file
-- self-contained (grants are additive, re-running is a no-op).
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;


-- ---------- 3. Storage policies ----------
-- Path convention: FIRST folder = the uploader's auth uid:
--   {auth-uuid}/id.jpg            registration ID photo
--   {auth-uuid}/receipt-42.jpg    payment receipt for loan 42
-- The folder check is what keeps members out of each other's files.

DROP POLICY IF EXISTS "member documents upload" ON storage.objects;
CREATE POLICY "member documents upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'member-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "member documents read own" ON storage.objects;
CREATE POLICY "member documents read own" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'member-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- replace + delete so a photo retake BEFORE approval can overwrite
DROP POLICY IF EXISTS "member documents replace own" ON storage.objects;
CREATE POLICY "member documents replace own" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'member-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'member-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "member documents delete own" ON storage.objects;
CREATE POLICY "member documents delete own" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'member-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Admin portal: read every document to review submissions (and manage
-- rows as needed — creating a signed URL touches storage.objects, so
-- SELECT alone is deliberately not the limit here).
DROP POLICY IF EXISTS "admin manage documents" ON storage.objects;
CREATE POLICY "admin manage documents" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'member-documents' AND public.is_admin())
  WITH CHECK (bucket_id = 'member-documents' AND public.is_admin());


-- ---------- 4. Registration: force a reviewable status ----------
-- 02 allowed ANY status at insert. The app must send exactly
-- 'Pending'; approval to 'Active' happens later in the admin portal.
-- Admin inserts ride the "admin full access" policy from 06 —
-- permissive policies OR together, so the portal is unaffected.
DROP POLICY IF EXISTS "member own row insert" ON member;
CREATE POLICY "member own row insert" ON member FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = auth_uid AND status = 'Pending');


-- ---------- 5. Members may no longer UPDATE their own row ----------
-- 02's self-update policy let a member approve themselves (status),
-- rewrite member_no, or flip login_enabled. The app's flows only
-- need read + insert; profile editing can come later with
-- column-scoped grants if the client asks for it.
-- Admin updates keep working through 06.
DROP POLICY IF EXISTS "member own row update" ON member;


-- ---------- 6. Loan applications: unreviewed 'Pending' only ----------
DROP POLICY IF EXISTS "file own application" ON loan_application;
CREATE POLICY "file own application" ON loan_application FOR INSERT TO authenticated
  WITH CHECK (
    member_id IN (SELECT member_id FROM member WHERE auth_uid = auth.uid())
    AND status = 'Pending'
    AND reviewed_by IS NULL
    AND date_reviewed IS NULL
  );


-- ---------- 7. Payments: own loan, released, 'Pending', unverified ----------
-- Guards beyond 02: the loan must be OWNED by the submitter and in a
-- payable state; the row must start unverified; amount must be real.
DROP POLICY IF EXISTS "upload own payment" ON payment;
CREATE POLICY "upload own payment" ON payment FOR INSERT TO authenticated
  WITH CHECK (
    member_id IN (SELECT member_id FROM member WHERE auth_uid = auth.uid())
    AND loan_id IN (
      SELECT loan_id FROM loan
      WHERE member_id IN (SELECT member_id FROM member WHERE auth_uid = auth.uid())
        AND status IN ('Released', 'Paid')
    )
    AND status = 'Pending'
    AND amount > 0
    AND verified_by IS NULL
    AND date_verified IS NULL
  );


-- ============================================================
-- Verify — expected results noted per query
-- ============================================================

-- 1) photo column exists:
SELECT column_name FROM information_schema.columns
WHERE table_name = 'member' AND column_name = 'id_photo_url';
-- expect: id_photo_url

-- 2) bucket exists, private, size/type limited:
SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets WHERE id = 'member-documents';
-- expect: member-documents | f | 5242880 | {image/jpeg,image/png,image/webp}

-- 3) app write gates — all three with_check clauses must mention
--    status = 'Pending' (and the payment one, loan ownership):
SELECT policyname, cmd, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname IN ('member own row insert', 'file own application', 'upload own payment')
ORDER BY policyname;

-- member table policies — expect EXACTLY these three (no self-update):
--   admin full access | member own row insert | member own row select
SELECT policyname FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'member'
ORDER BY policyname;

-- 4) storage policies — expect:
--   admin manage documents, member documents upload,
--   member documents delete own, member documents read own,
--   member documents replace own
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY policyname;

-- 5) payment statuses — every current row stays 'Recorded'
--    (the web's paidOf() counts only 'Recorded', so balances do not
--    move until an admin verifies an app-submitted 'Pending' receipt):
SELECT status, count(*) FROM payment GROUP BY status ORDER BY status;
-- expect: Recorded 171


-- ============================================================
-- AFTER the first member signs up in the app — link a demo member:
--   1. Dashboard -> Authentication -> Users -> copy the user's UUID
--   2. uncomment and paste:
-- ============================================================
-- UPDATE member SET auth_uid = '<paste-auth-uuid-here>'
-- WHERE member_no = 'KHS-0017';   -- or whichever member you demo with
