-- ============================================================
-- 11_loan_payoff.sql
--
-- The seeded historical loans (data/loans_clean.csv) carry no
-- status column and only 24 actual payment rows exist, so the
-- portal showed most of them as "Released" with a full balance —
-- but the coop's paper records say every historical loan was
-- fully paid (confirmed by the client-facing admin).
--
-- This records one final payoff entry per unfinished seeded loan:
--   amount  = remaining balance under the portal's own formula
--             total_due = principal + interest_rate * principal * (term + 1) / 2
--             minus payments already recorded
--   date    = the loan's due_date (its scheduled finish)
--   status  = 'Recorded', note marks it as a historical payoff
-- then flips every seeded "Released" loan to 'Paid'.
--
-- SAFE TO RE-RUN: only touches seed rows (created_at IS NULL) —
-- loans created through the portal are never affected. The math
-- is self-guarding: once the payoff is recorded the remaining
-- balance is 0, so a second run inserts nothing.
--
-- Run AFTER: 10_loan_remarks.sql.
-- ============================================================

WITH calc AS (
    SELECT l.loan_id,
           l.member_id,
           COALESCE(l.due_date, l.date_issued) AS payoff_date,
           round(
               l.amount
               + (l.interest_rate * l.amount * (l.term_months + 1)) / 2
               - COALESCE((
                     SELECT sum(p.amount) FROM payment p WHERE p.loan_id = l.loan_id
                 ), 0),
               2
           ) AS remaining
    FROM loan l
    WHERE l.created_at IS NULL
      AND l.status IN ('Released', 'Paid')
)
INSERT INTO payment (loan_id, member_id, amount, date, status, note)
SELECT loan_id, member_id, remaining, payoff_date, 'Recorded',
       'Payoff per coop historical records'
FROM calc
WHERE remaining > 0.01;

UPDATE loan
SET status = 'Paid'
WHERE created_at IS NULL
  AND status = 'Released';

-- Verify — expect: seed_loans_not_paid = 0, seed_loans_with_balance = 0,
-- payoff_rows = however many unfinished loans were topped up.
WITH calc AS (
    SELECT l.loan_id,
           round(
               l.amount
               + (l.interest_rate * l.amount * (l.term_months + 1)) / 2
               - COALESCE((
                     SELECT sum(p.amount) FROM payment p WHERE p.loan_id = l.loan_id
                 ), 0),
               2
           ) AS remaining
    FROM loan l
    WHERE l.created_at IS NULL
)
SELECT
    (SELECT count(*) FROM loan WHERE created_at IS NULL AND status <> 'Paid')
        AS seed_loans_not_paid,
    (SELECT count(*) FROM payment WHERE note = 'Payoff per coop historical records')
        AS payoff_rows,
    (SELECT count(*) FROM calc WHERE remaining > 0.01)
        AS seed_loans_with_balance;
