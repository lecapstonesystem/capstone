-- ============================================================
-- 08_realign_sequences.sql
-- Run AFTER: scripts/seed_supabase.py --apply
--
-- The seeder assigns explicit IDs (max+1), so the sequences created
-- in 05 still believe the next id is 1 — the first portal INSERT
-- after seeding would collide with a seeded row (duplicate key
-- 23505). setval moves each sequence past the seeded maximum.
--
-- Only the three seeded tables need this; every other sequence
-- points at empty tables and is already correct.
-- Safe to re-run.
-- ============================================================
SELECT setval('member_member_id_seq', (SELECT COALESCE(MAX(member_id), 1) FROM member));
SELECT setval('loan_loan_id_seq', (SELECT COALESCE(MAX(loan_id), 1) FROM loan));
SELECT setval('payment_payment_id_seq', (SELECT COALESCE(MAX(payment_id), 1) FROM payment));

-- Verify — seq.last_value must equal max_id (next nextval = max + 1).
-- Empty tables show max_id NULL with seq at 1: still correct.
SELECT 'member' AS tbl,
       (SELECT MAX(member_id) FROM member) AS max_id,
       (SELECT last_value FROM member_member_id_seq) AS seq
UNION ALL
SELECT 'loan',
       (SELECT MAX(loan_id) FROM loan),
       (SELECT last_value FROM loan_loan_id_seq)
UNION ALL
SELECT 'payment',
       (SELECT MAX(payment_id) FROM payment),
       (SELECT last_value FROM payment_payment_id_seq);
