-- Loan policy updates: board-member status and Super Admin-only loan decisions.
-- Run after 30_added_by_attribution.sql.

ALTER TABLE public.member
  ADD COLUMN IF NOT EXISTS is_board_member boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.member.is_board_member IS
  'Board of Directors members are ineligible to act as co-makers.';

CREATE OR REPLACE FUNCTION public.enforce_super_admin_loan_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reviewer_role text;
  is_loan_decision boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF TG_TABLE_NAME = 'loan' THEN
      is_loan_decision := NEW.status <> 'For Approval';
    ELSE
      is_loan_decision := NEW.status <> 'Pending';
    END IF;
  ELSIF TG_TABLE_NAME = 'loan' THEN
    is_loan_decision :=
      OLD.status = 'For Approval'
      AND NEW.status <> 'For Approval';
  ELSE
    is_loan_decision :=
      OLD.status IN ('Pending', 'Under Review')
      AND NEW.status IN ('Approved', 'Rejected', 'Returned');
  END IF;

  IF NOT is_loan_decision THEN
    RETURN NEW;
  END IF;

  -- Server-side service-role operations are trusted; browser sessions must
  -- map to an enabled Super Admin account.
  IF auth.uid() IS NULL
     AND current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT role
    INTO reviewer_role
    FROM public.admin
   WHERE auth_uid = auth.uid()
     AND login_enabled IS TRUE;

  IF reviewer_role IS DISTINCT FROM 'Super Admin' THEN
    RAISE EXCEPTION 'Only a Super Admin may review loan applications'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_super_admin_loan_review() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_super_admin_loan_decisions ON public.loan;
DROP TRIGGER IF EXISTS enforce_super_admin_loan_insert ON public.loan;
CREATE TRIGGER enforce_super_admin_loan_insert
  BEFORE INSERT ON public.loan
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_super_admin_loan_review();

CREATE TRIGGER enforce_super_admin_loan_decisions
  BEFORE UPDATE OF status ON public.loan
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_super_admin_loan_review();

DROP TRIGGER IF EXISTS enforce_super_admin_loan_application_decisions ON public.loan_application;
DROP TRIGGER IF EXISTS enforce_super_admin_loan_application_insert ON public.loan_application;
CREATE TRIGGER enforce_super_admin_loan_application_insert
  BEFORE INSERT ON public.loan_application
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_super_admin_loan_review();

CREATE TRIGGER enforce_super_admin_loan_application_decisions
  BEFORE UPDATE OF status ON public.loan_application
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_super_admin_loan_review();

-- Verify member marker and decision guards.
SELECT column_name, data_type, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'member'
   AND column_name = 'is_board_member';

SELECT trigger_name, event_object_table
  FROM information_schema.triggers
 WHERE trigger_schema = 'public'
   AND trigger_name LIKE 'enforce_super_admin_loan%';
