-- ============================================================
-- 12_merge_duplicate_members.sql
--
-- The seed inserted some members twice: the old records spelled the
-- same person differently (word order "Velasco, Virgilia" vs "Virgilia
-- Velasco", a stray period "Acala. Aimee", all-caps duplicates), so
-- name-text matching created two member rows and SPLIT that person's
-- loans across both.
--
-- 11 confirmed pairs. Per pair:
--   - survivor = the LOWER member_id (keeps its KHS number)
--   - survivor takes the EARLIEST date_joined of the two
--   - every loan / payment / share capital / co-maker row of the
--     duplicate is re-homed to the survivor (nothing is deleted from
--     those tables)
--   - the duplicate member row is deleted
--
-- SAFE TO RE-RUN: after the first run the duplicate ids no longer
-- exist, so every statement matches nothing.
--
-- Run AFTER: 11_loan_payoff.sql.
-- ============================================================

BEGIN;

-- date_joined: survivor keeps the earliest of the two
WITH pairs(survivor, dup) AS (
    VALUES (2, 4), (5, 63), (6, 78), (7, 49), (10, 83), (11, 73),
           (12, 87), (23, 84), (30, 74), (48, 86), (55, 75)
)
UPDATE member m
SET date_joined = LEAST(m.date_joined, d.date_joined)
FROM pairs p
JOIN member d ON d.member_id = p.dup AND d.date_joined IS NOT NULL
WHERE m.member_id = p.survivor
  AND d.date_joined < m.date_joined;

-- re-home the duplicates' records (NULL member_id rows untouched)
WITH pairs(survivor, dup) AS (
    VALUES (2, 4), (5, 63), (6, 78), (7, 49), (10, 83), (11, 73),
           (12, 87), (23, 84), (30, 74), (48, 86), (55, 75)
)
UPDATE loan l
SET member_id = p.survivor
FROM pairs p
WHERE l.member_id = p.dup;

WITH pairs(survivor, dup) AS (
    VALUES (2, 4), (5, 63), (6, 78), (7, 49), (10, 83), (11, 73),
           (12, 87), (23, 84), (30, 74), (48, 86), (55, 75)
)
UPDATE payment pay
SET member_id = p.survivor
FROM pairs p
WHERE pay.member_id = p.dup;

WITH pairs(survivor, dup) AS (
    VALUES (2, 4), (5, 63), (6, 78), (7, 49), (10, 83), (11, 73),
           (12, 87), (23, 84), (30, 74), (48, 86), (55, 75)
)
UPDATE share_capital sc
SET member_id = p.survivor
FROM pairs p
WHERE sc.member_id = p.dup;

WITH pairs(survivor, dup) AS (
    VALUES (2, 4), (5, 63), (6, 78), (7, 49), (10, 83), (11, 73),
           (12, 87), (23, 84), (30, 74), (48, 86), (55, 75)
)
UPDATE co_maker cm
SET member_id = p.survivor
FROM pairs p
WHERE cm.member_id = p.dup;

WITH pairs(survivor, dup) AS (
    VALUES (2, 4), (5, 63), (6, 78), (7, 49), (10, 83), (11, 73),
           (12, 87), (23, 84), (30, 74), (48, 86), (55, 75)
)
UPDATE loan_application la
SET member_id = p.survivor
FROM pairs p
WHERE la.member_id = p.dup;

-- now the duplicates have no children left — safe to delete
WITH pairs(survivor, dup) AS (
    VALUES (2, 4), (5, 63), (6, 78), (7, 49), (10, 83), (11, 73),
           (12, 87), (23, 84), (30, 74), (48, 86), (55, 75)
)
DELETE FROM member m
USING pairs p
WHERE m.member_id = p.dup;

COMMIT;


-- ============================================================
-- JUDGMENT CALLS — same person suspected, spelling differs.
-- Confirm against the coop's paper records, then uncomment the
-- pairs you approve and re-run this file (safe to re-run; the
-- confirmed pairs above become no-ops).
-- Chained pair note: (23 -> 17) is correct even though 23 already
-- absorbed 84's loans above — statements run top to bottom.
-- ============================================================

-- BEGIN;
--
-- WITH pairs(survivor, dup) AS (
--     VALUES (1, 67), (36, 41), (15, 76), (16, 72),
--            (19, 51), (29, 80), (17, 23), (10, 85)
-- )
-- UPDATE member m
-- SET date_joined = LEAST(m.date_joined, d.date_joined)
-- FROM pairs p
-- JOIN member d ON d.member_id = p.dup AND d.date_joined IS NOT NULL
-- WHERE m.member_id = p.survivor
--   AND d.date_joined < m.date_joined;
--
-- WITH pairs(survivor, dup) AS (
--     VALUES (1, 67), (36, 41), (15, 76), (16, 72),
--            (19, 51), (29, 80), (17, 23), (10, 85)
-- )
-- UPDATE loan l SET member_id = p.survivor FROM pairs p WHERE l.member_id = p.dup;
--
-- WITH pairs(survivor, dup) AS (
--     VALUES (1, 67), (36, 41), (15, 76), (16, 72),
--            (19, 51), (29, 80), (17, 23), (10, 85)
-- )
-- UPDATE payment pay SET member_id = p.survivor FROM pairs p WHERE pay.member_id = p.dup;
--
-- WITH pairs(survivor, dup) AS (
--     VALUES (1, 67), (36, 41), (15, 76), (16, 72),
--            (19, 51), (29, 80), (17, 23), (10, 85)
-- )
-- UPDATE share_capital sc SET member_id = p.survivor FROM pairs p WHERE sc.member_id = p.dup;
--
-- WITH pairs(survivor, dup) AS (
--     VALUES (1, 67), (36, 41), (15, 76), (16, 72),
--            (19, 51), (29, 80), (17, 23), (10, 85)
-- )
-- UPDATE co_maker cm SET member_id = p.survivor FROM pairs p WHERE cm.member_id = p.dup;
--
-- WITH pairs(survivor, dup) AS (
--     VALUES (1, 67), (36, 41), (15, 76), (16, 72),
--            (19, 51), (29, 80), (17, 23), (10, 85)
-- )
-- UPDATE loan_application la SET member_id = p.survivor FROM pairs p WHERE la.member_id = p.dup;
--
-- WITH pairs(survivor, dup) AS (
--     VALUES (1, 67), (36, 41), (15, 76), (16, 72),
--            (19, 51), (29, 80), (17, 23), (10, 85)
-- )
-- DELETE FROM member m USING pairs p WHERE m.member_id = p.dup;
--
-- COMMIT;


-- ============================================================
-- Verify — expect members_now = 80 (88 if no judgment pairs were
-- merged), loans_now = 147, orphan_loans = 0, and the loan counts
-- per merged survivor as listed in the pair notes:
--   KHS-0002: 6   KHS-0005: 2   KHS-0006: 7   KHS-0007: 2
--   KHS-0010: 4   KHS-0011: 3   KHS-0012: 5   KHS-0023: 2
--   KHS-0030: 3   KHS-0048: 2   KHS-0055: 8
-- ============================================================
SELECT (SELECT count(*) FROM member)                       AS members_now,
       (SELECT count(*) FROM loan)                         AS loans_now,
       (SELECT count(*) FROM loan l
          LEFT JOIN member m ON m.member_id = l.member_id
         WHERE m.member_id IS NULL)                        AS orphan_loans;

SELECT m.member_no, m.name, m.date_joined, count(l.loan_id) AS loans
FROM member m
LEFT JOIN loan l ON l.member_id = m.member_id
WHERE m.member_id IN (2, 5, 6, 7, 10, 11, 12, 23, 30, 48, 55)
GROUP BY m.member_id, m.member_no, m.name, m.date_joined
ORDER BY m.member_id;
