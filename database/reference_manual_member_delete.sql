-- =============================================================
-- reference_manual_member_delete.sql  (REFERENCE — NOT a migration)
--
-- Run this by hand, in the Supabase SQL Editor, only when there is
-- a real justification: a bogus/test entry, a genuine duplicate, or
-- a legal erasure request. For an ordinary member who left the coop
-- use Suspend / Drop in the portal — the record must be kept
-- (RA 9520, AMLA). Nothing in the web app deletes members anymore.
--
-- The portal has no delete button on purpose. This is the
-- deliberate backend path.
--
-- Updated for the current schema: the attachment table (19) and the
-- audit_log rebuild (17 — rows are keyed by entity_type/entity_id,
-- the old member_id column no longer exists).
-- =============================================================


-- ---------- 1. LOOK BEFORE YOU DELETE ----------
-- Find the member_id and see everything attached.
-- If loans / payments / co_maker_rows > 0 it is a real member with
-- financial history — do NOT delete; that history is the record the
-- coop is required to keep.

SELECT m.member_id, m.member_no, m.name, m.status,
       (SELECT count(*) FROM loan l              WHERE l.member_id   = m.member_id) AS loans,
       (SELECT count(*) FROM payment p JOIN loan l ON p.loan_id = l.loan_id
                                        WHERE l.member_id           = m.member_id) AS payments,
       (SELECT count(*) FROM co_maker c          WHERE c.member_id   = m.member_id) AS co_maker_rows,
       (SELECT count(*) FROM loan_application la WHERE la.member_id  = m.member_id) AS loan_apps,
       (SELECT count(*) FROM share_capital sc    WHERE sc.member_id  = m.member_id) AS share_capital,
       (SELECT count(*) FROM attachment a        WHERE a.member_id   = m.member_id
                                                   OR a.loan_id IN
                                                      (SELECT loan_id FROM loan WHERE member_id = m.member_id)) AS attachments,
       (SELECT count(*) FROM audit_log al        WHERE (al.entity_type = 'member' AND al.entity_id = m.member_id::text)
                                                    OR (al.entity_type = 'loan'   AND al.entity_id IN
                                                        (SELECT loan_id::text FROM loan WHERE member_id = m.member_id))) AS audit_rows
FROM member m
WHERE m.name ILIKE '%test%'          -- or: WHERE m.member_no = 'KHS-0092'
ORDER BY m.member_id;

-- 1b. Storage files the rows point at. The tables hold the PATHS;
-- the actual files live in the private member-documents bucket and
-- survive a row delete. Copy the paths now, then remove them later
-- (Supabase dashboard -> Storage -> member-documents) — or leave
-- them, they are inert. Replace 92 with the member_id from step 1.

SELECT a.file_path FROM attachment a
 WHERE a.member_id = 92
    OR a.loan_id IN (SELECT loan_id FROM loan WHERE member_id = 92);

SELECT p.receipt_image_url FROM payment p
 WHERE p.receipt_image_url IS NOT NULL
   AND p.loan_id IN (SELECT loan_id FROM loan WHERE member_id = 92);


-- ---------- 2. DELETE, IN FK-SAFE ORDER ----------
-- No foreign key in this schema cascades (all are NO ACTION), so
-- children must go before parents or the delete is rejected.
-- share_capital references member WITHOUT a foreign key, and
-- audit_log has no member column at all (keyed by entity_type /
-- entity_id) — both are cleared by hand here so they do not orphan.
--
-- Edit target_id, then run. Atomic: if anything fails, nothing is
-- removed.

DO $$
DECLARE
  target_id integer := 92;           -- <<< EDIT: member_id from step 1
BEGIN
  DELETE FROM attachment
    WHERE member_id = target_id
       OR loan_id IN (SELECT loan_id FROM loan WHERE member_id = target_id);
  DELETE FROM co_maker
    WHERE member_id = target_id
       OR loan_id IN (SELECT loan_id FROM loan WHERE member_id = target_id);
  DELETE FROM payment
    WHERE member_id = target_id
       OR loan_id IN (SELECT loan_id FROM loan WHERE member_id = target_id);
  DELETE FROM loan_application  WHERE member_id = target_id;
  DELETE FROM share_capital     WHERE member_id = target_id;   -- no FK
  DELETE FROM audit_log                                -- rebuilt in 17:
    WHERE (entity_type = 'member' AND entity_id = target_id::text)
       OR (entity_type = 'loan'
           AND entity_id IN (SELECT loan_id::text FROM loan WHERE member_id = target_id));
  DELETE FROM loan              WHERE member_id = target_id;
  DELETE FROM member            WHERE member_id = target_id;
END $$;


-- ---------- 3. VERIFY ----------

SELECT count(*) AS still_there FROM member WHERE member_id = 92;


-- ---------- 4. TEST LOANS ONLY (the member stays) ----------
-- A test loan filed under a real member: remove just the loan.
-- Look the loan_id up first (the Loan No in the portal is display
-- text, not necessarily the id):

SELECT loan_id, member_id, amount, status, created_at
  FROM loan
 WHERE member_id IN (SELECT member_id FROM member WHERE name ILIKE '%test%')
 ORDER BY loan_id;

-- Then edit target_loan and run:

DO $$
DECLARE
  target_loan integer := 152;        -- <<< EDIT: loan_id from the lookup
BEGIN
  DELETE FROM attachment WHERE loan_id = target_loan;
  DELETE FROM co_maker   WHERE loan_id = target_loan;
  DELETE FROM payment    WHERE loan_id = target_loan;
  DELETE FROM audit_log
    WHERE entity_type = 'loan' AND entity_id = target_loan::text;
  DELETE FROM loan       WHERE loan_id = target_loan;
END $$;

-- An app-filed request you also want gone (the request itself):
-- DELETE FROM loan_application WHERE application_id = <id>;


-- ---------- 5. LEFTOVERS THE TABLES DO NOT COVER ----------
--   * Supabase Auth login of an app-registered member — deleting
--     the member row does NOT remove it. Dashboard ->
--     Authentication -> Users -> find by email -> Delete user.
--     Walk-in members approved in the portal have no Auth login,
--     so this usually does not apply.
--   * Storage files (paths listed in 1b) — the rows carry the path,
--     the file itself stays in the bucket until removed by hand.
--   * Manual test entries on the Ledger page — delete them from the
--     portal's Ledger (it has a delete); nothing here references them.
--   * Sequences do NOT rewind: the next member or loan simply
--     continues the count, and member_no numbering is unaffected.
