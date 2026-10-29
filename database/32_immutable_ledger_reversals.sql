-- Ledger entries are immutable. Correct mistakes with one linked,
-- opposite-type entry that records the reason and correcting admin.
-- Run after 31_loan_policy_controls.sql.

ALTER TABLE public.ledger
  ADD COLUMN IF NOT EXISTS reversal_of integer
    REFERENCES public.ledger(ledger_id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS correction_reason text,
  ADD COLUMN IF NOT EXISTS recorded_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS ledger_one_reversal_per_entry
  ON public.ledger (reversal_of)
  WHERE reversal_of IS NOT NULL;

ALTER TABLE public.ledger
  DROP CONSTRAINT IF EXISTS ledger_correction_reason_required;
ALTER TABLE public.ledger
  ADD CONSTRAINT ledger_correction_reason_required
  CHECK (
    reversal_of IS NULL
    OR (correction_reason IS NOT NULL AND length(trim(correction_reason)) > 0)
  );

CREATE OR REPLACE FUNCTION public.enforce_immutable_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  original public.ledger%ROWTYPE;
  expected_type text;
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Ledger entries are immutable; record a reversal instead.'
      USING ERRCODE = '55000';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.admin
    WHERE admin_id = NEW.admin_id AND auth_uid = auth.uid()
  ) THEN
    RAISE EXCEPTION 'A ledger entry must be recorded under the signed-in admin.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.reversal_of IS NULL THEN
    IF NEW.correction_reason IS NOT NULL THEN
      RAISE EXCEPTION 'A correction reason requires a linked reversal.'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.reversal_of = NEW.ledger_id THEN
    RAISE EXCEPTION 'A ledger entry cannot reverse itself.'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO original
  FROM public.ledger
  WHERE ledger_id = NEW.reversal_of;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The ledger entry to reverse does not exist.'
      USING ERRCODE = '23503';
  END IF;

  IF original.reversal_of IS NOT NULL THEN
    RAISE EXCEPTION 'A reversal entry cannot itself be reversed.'
      USING ERRCODE = '23514';
  END IF;

  IF original.type = 'Income' THEN
    expected_type := 'Expense';
  ELSIF original.type = 'Expense' THEN
    expected_type := 'Income';
  ELSE
    RAISE EXCEPTION 'The original transaction has an unsupported type.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.type <> expected_type THEN
    RAISE EXCEPTION 'A reversal must use the opposite transaction type.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.amount <> original.amount
     OR NEW.category IS DISTINCT FROM original.category THEN
    RAISE EXCEPTION 'A reversal must match the original amount and category.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.correction_reason IS NULL OR length(trim(NEW.correction_reason)) = 0 THEN
    RAISE EXCEPTION 'A correction reason is required.'
      USING ERRCODE = '23514';
  END IF;

  NEW.description := format('Reversal of LDG-%s', lpad(original.ledger_id::text, 4, '0'));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS immutable_ledger_entries ON public.ledger;
CREATE TRIGGER immutable_ledger_entries
  BEFORE INSERT OR UPDATE OR DELETE ON public.ledger
  FOR EACH ROW EXECUTE FUNCTION public.enforce_immutable_ledger();

-- Replace the broad policy from 06_admin_access.sql. Ledger corrections
-- are append-only for all portal roles; only reads and new entries remain.
DROP POLICY IF EXISTS "admin full access" ON public.ledger;
DROP POLICY IF EXISTS "admin select rows" ON public.ledger;
DROP POLICY IF EXISTS "admin insert rows" ON public.ledger;
DROP POLICY IF EXISTS "admin update rows" ON public.ledger;
DROP POLICY IF EXISTS "developer delete test data" ON public.ledger;

CREATE POLICY "admin select rows" ON public.ledger
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "admin insert rows" ON public.ledger
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

REVOKE UPDATE, DELETE ON TABLE public.ledger FROM authenticated;

-- Verify: ledger should have select/insert policies only, plus the
-- reversal columns and uniqueness index.
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'ledger'
ORDER BY policyname;
