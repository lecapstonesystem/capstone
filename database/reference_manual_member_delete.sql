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
       (SELECT count(*) FROM audit_log al        WHERE al.member_id  = m.member_id) AS audit_rows
FROM member m
WHERE m.name ILIKE '%test%'          -- or: WHERE m.member_no = 'KHS-0092'
ORDER BY m.member_id;


-- ---------- 2. DELETE, IN FK-SAFE ORDER ----------
-- No foreign key in this schema cascades (all are NO ACTION), so
-- children must go before parents or the delete is rejected.
-- share_capital and audit_log reference member WITHOUT a foreign
-- key, so they must be cleared by hand or they orphan.
--
-- Edit target_id, then run. Atomic: if anything fails, nothing is
-- removed.

DO $$
DECLARE
  target_id integer := 92;           -- <<< EDIT: member_id from step 1
BEGIN
  DELETE FROM co_maker
    WHERE member_id = target_id
       OR loan_id IN (SELECT loan_id FROM loan WHERE member_id = target_id);
  DELETE FROM payment
    WHERE loan_id IN (SELECT loan_id FROM loan WHERE member_id = target_id);
  DELETE FROM loan_application  WHERE member_id = target_id;
  DELETE FROM share_capital     WHERE member_id = target_id;   -- no FK
  DELETE FROM audit_log         WHERE member_id = target_id;   -- no FK
  DELETE FROM loan              WHERE member_id = target_id;
  DELETE FROM member            WHERE member_id = target_id;
END $$;


-- ---------- 3. VERIFY ----------

SELECT count(*) AS still_there FROM member WHERE member_id = 92;


-- ---------- 4. APP-REGISTERED MEMBERS ONLY ----------
-- A member who registered through the Flutter app also has a
-- Supabase Auth login (member.auth_uid). Deleting the member row
-- does NOT remove that login. If it must go too:
--   Supabase dashboard -> Authentication -> Users -> find by email
--   -> Delete user.
-- Walk-in members approved in the portal have no Auth login yet,
-- so this step usually does not apply.
