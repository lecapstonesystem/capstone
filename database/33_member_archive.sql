-- Archive inactive members without deleting their records or history.
-- Run after 32_immutable_ledger_reversals.sql.

ALTER TABLE public.member
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by integer
    REFERENCES public.admin(admin_id) ON DELETE SET NULL;

ALTER TABLE public.member
  DROP CONSTRAINT IF EXISTS member_archive_requires_inactive;
ALTER TABLE public.member
  ADD CONSTRAINT member_archive_requires_inactive
  CHECK (archived_at IS NULL OR lower(status) = 'inactive');

COMMENT ON COLUMN public.member.archived_at IS
  'When set, the inactive member is hidden from normal member lists and excluded from member reports by default. The member record and financial history are retained.';
COMMENT ON COLUMN public.member.archived_by IS
  'Admin account that archived the member; NULL if that admin account was later removed.';

-- Verify archive metadata and the inactive-only constraint.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'member'
  AND column_name IN ('archived_at', 'archived_by')
ORDER BY column_name;
