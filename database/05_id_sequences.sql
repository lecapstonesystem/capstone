-- ============================================================
-- 05_id_sequences.sql
-- Give every primary key a default value so INSERTs work without
-- hand-picking IDs in the application code.
--
-- Verified gap in ucms_schema.sql: a sequence was created ONLY for
-- loan_application. Everything else would fail with:
--   null value in column "member_id" violates not-null constraint
-- This file follows the teammate's existing pattern
-- (CREATE SEQUENCE + SET DEFAULT nextval), so it reads the same.
--
-- Run AFTER: ucms_schema.sql, 02_rls_policies.sql,
--            03_add_form_columns.sql, 04_member_account_columns.sql
-- Safe to re-run (IF NOT EXISTS everywhere).
-- ============================================================

-- ---------- member ----------
CREATE SEQUENCE IF NOT EXISTS member_member_id_seq;
ALTER TABLE member ALTER COLUMN member_id SET DEFAULT nextval('member_member_id_seq');
ALTER SEQUENCE member_member_id_seq OWNED BY member.member_id;

-- ---------- loan ----------
CREATE SEQUENCE IF NOT EXISTS loan_loan_id_seq;
ALTER TABLE loan ALTER COLUMN loan_id SET DEFAULT nextval('loan_loan_id_seq');
ALTER SEQUENCE loan_loan_id_seq OWNED BY loan.loan_id;

-- ---------- payment ----------
CREATE SEQUENCE IF NOT EXISTS payment_payment_id_seq;
ALTER TABLE payment ALTER COLUMN payment_id SET DEFAULT nextval('payment_payment_id_seq');
ALTER SEQUENCE payment_payment_id_seq OWNED BY payment.payment_id;

-- ---------- share_capital ----------
CREATE SEQUENCE IF NOT EXISTS share_capital_share_id_seq;
ALTER TABLE share_capital ALTER COLUMN share_id SET DEFAULT nextval('share_capital_share_id_seq');
ALTER SEQUENCE share_capital_share_id_seq OWNED BY share_capital.share_id;

-- ---------- dividend ----------
CREATE SEQUENCE IF NOT EXISTS dividend_dividend_id_seq;
ALTER TABLE dividend ALTER COLUMN dividend_id SET DEFAULT nextval('dividend_dividend_id_seq');
ALTER SEQUENCE dividend_dividend_id_seq OWNED BY dividend.dividend_id;

-- ---------- ledger ----------
CREATE SEQUENCE IF NOT EXISTS ledger_ledger_id_seq;
ALTER TABLE ledger ALTER COLUMN ledger_id SET DEFAULT nextval('ledger_ledger_id_seq');
ALTER SEQUENCE ledger_ledger_id_seq OWNED BY ledger.ledger_id;

-- ---------- audit_log ----------
CREATE SEQUENCE IF NOT EXISTS audit_log_log_id_seq;
ALTER TABLE audit_log ALTER COLUMN log_id SET DEFAULT nextval('audit_log_log_id_seq');
ALTER SEQUENCE audit_log_log_id_seq OWNED BY audit_log.log_id;

-- ---------- report ----------
CREATE SEQUENCE IF NOT EXISTS report_report_id_seq;
ALTER TABLE report ALTER COLUMN report_id SET DEFAULT nextval('report_report_id_seq');
ALTER SEQUENCE report_report_id_seq OWNED BY report.report_id;

-- ---------- admin ----------
-- The dump never gave admin a primary key (admin_id was a plain nullable
-- column) — worth telling your teammate, since every other table has one.
-- Without it, duplicate admin rows are possible and Supabase Auth linkage
-- has nothing stable to reference. Guarded so it runs once even if a PK
-- is added later under another name.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_index
    WHERE indrelid = 'admin'::regclass AND indisprimary
  ) THEN
    ALTER TABLE admin ADD CONSTRAINT admin_pkey PRIMARY KEY (admin_id);
  END IF;
END;
$$;

CREATE SEQUENCE IF NOT EXISTS admin_admin_id_seq;
ALTER TABLE admin ALTER COLUMN admin_id SET DEFAULT nextval('admin_admin_id_seq');
ALTER SEQUENCE admin_admin_id_seq OWNED BY admin.admin_id;

-- loan_application and co_maker already have defaults (sequence /
-- GENERATED ALWAYS AS IDENTITY) — nothing to do for those two.


-- ------------------------------------------------------------
-- After bulk-importing historical rows that carry their own legacy IDs,
-- realign the sequences or the next INSERT will collide:
-- ------------------------------------------------------------
-- SELECT setval('member_member_id_seq',   (SELECT COALESCE(MAX(member_id),   1) FROM member));
-- SELECT setval('loan_loan_id_seq',       (SELECT COALESCE(MAX(loan_id),     1) FROM loan));
-- SELECT setval('payment_payment_id_seq', (SELECT COALESCE(MAX(payment_id),  1) FROM payment));


-- ------------------------------------------------------------
-- Verify — 9 rows, every one showing a nextval(...) default.
-- Matched as (table, column) pairs so member_id columns on OTHER
-- tables (loan, payment, ...) don't show up as false failures.
-- ------------------------------------------------------------
SELECT table_name, column_name, column_default
FROM information_schema.columns
WHERE (table_name, column_name) IN (
    ('member',       'member_id'),
    ('loan',         'loan_id'),
    ('payment',      'payment_id'),
    ('share_capital','share_id'),
    ('dividend',     'dividend_id'),
    ('ledger',       'ledger_id'),
    ('audit_log',    'log_id'),
    ('report',       'report_id'),
    ('admin',        'admin_id')
  )
  AND table_schema = 'public'
ORDER BY table_name;
