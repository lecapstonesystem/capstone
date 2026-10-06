-- ============================================================
-- 03_add_form_columns.sql
-- UCMS — columns required by the coop's official paper forms:
--   * Members' Data Sheet (essentials only)
--   * Loan Note KB Cr.13
--   * Pledge of Deposits / Authority to Deduct
--
-- Run AFTER: ucms_schema.sql and 02_rls_policies.sql
-- Safe to re-run (every statement uses IF NOT EXISTS).
-- Existing RLS policies are unaffected: they only reference
-- member_id / auth_uid, never the columns added below.
-- ============================================================


-- ------------------------------------------------------------
-- member — Members' Data Sheet (essentials)
-- ------------------------------------------------------------

-- The schema keeps one full-name column; the paper form needs the parts.
ALTER TABLE member ADD COLUMN IF NOT EXISTS first_name  varchar(50);
ALTER TABLE member ADD COLUMN IF NOT EXISTS middle_name varchar(50);
ALTER TABLE member ADD COLUMN IF NOT EXISTS last_name   varchar(50);
-- `name` stays the composed full name (NOT NULL). The app writes all four
-- together, so existing code and reports keep working unchanged.

-- Printed member number shown on the UI and on every paper form (KHS-0001).
-- member_id (integer) remains the internal primary key.
ALTER TABLE member ADD COLUMN IF NOT EXISTS member_no varchar(20);
CREATE UNIQUE INDEX IF NOT EXISTS member_member_no_key ON member (member_no);

-- Civil status and spouse, both printed on the data sheet.
ALTER TABLE member ADD COLUMN IF NOT EXISTS civil_status varchar(20);  -- Single / Married / Widowed / Separated
ALTER TABLE member ADD COLUMN IF NOT EXISTS spouse_name  varchar(100);

-- Second contact number (form has a separate landline field).
ALTER TABLE member ADD COLUMN IF NOT EXISTS landline varchar(20);

-- Government identifiers printed on the data sheet.
ALTER TABLE member ADD COLUMN IF NOT EXISTS gsis_number     varchar(20);
ALTER TABLE member ADD COLUMN IF NOT EXISTS sss_number      varchar(20);
ALTER TABLE member ADD COLUMN IF NOT EXISTS pagibig_number  varchar(20);
ALTER TABLE member ADD COLUMN IF NOT EXISTS philhealth_number varchar(20);

-- The schema stores the ID number only; the form also states which ID.
ALTER TABLE member ADD COLUMN IF NOT EXISTS gov_id_type varchar(30);   -- Passport / Driver's License / UMID / National ID


-- ------------------------------------------------------------
-- payment — how each payment was actually made
-- The app records this on every payment row; the schema had no column.
-- ------------------------------------------------------------
ALTER TABLE payment ADD COLUMN IF NOT EXISTS channel varchar(30);  -- Cash / GCash / Cheque / ATM Deduction / Salary Deduction
ALTER TABLE payment ADD COLUMN IF NOT EXISTS note    text;         -- short remark from the recording admin


-- ------------------------------------------------------------
-- loan — release details from the Loan Note
-- ------------------------------------------------------------
ALTER TABLE loan ADD COLUMN IF NOT EXISTS release_channel varchar(30);  -- how the cash was handed over
ALTER TABLE loan ADD COLUMN IF NOT EXISTS collateral      varchar(255); -- Loan Note "collateral / pledged deposit" line
                                                                          -- (remove this one line if deposits stay out of scope)


-- ------------------------------------------------------------
-- Verify — both queries must list the new columns.
-- ------------------------------------------------------------
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name IN ('member', 'payment', 'loan')
  AND column_name IN (
    'first_name', 'middle_name', 'last_name', 'member_no',
    'civil_status', 'spouse_name', 'landline',
    'gsis_number', 'sss_number', 'pagibig_number', 'philhealth_number',
    'gov_id_type', 'channel', 'note', 'release_channel', 'collateral'
  )
ORDER BY table_name, column_name;
