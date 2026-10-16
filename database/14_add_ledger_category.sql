-- ============================================================
-- 14_add_ledger_category.sql
--
-- The ledger table (base schema) has no category column, but the
-- Ledger UI and its client story break income/expense down by
-- category: Canteen Sales, Membership Fees, Loan Payments,
-- Supplies, Utilities, Miscellaneous, Other Income.
--
-- How public.ledger maps to the UI (see stores/ledger.js):
--   ledger_id  -> row id; refNo is DERIVED (LDG-0001 style), no column
--   type       -> 'Income' | 'Expense'   (varchar(20) already fits)
--   category   -> the column added below  (varchar(30))
--   admin_id   -> NOT NULL; the portal stamps the logged-in admin's
--                 profile.admin_id on every write (06 admin access)
--   amount     -> numeric; date -> 'YYYY-MM-DD' strings
--
-- The table starts EMPTY by decision (Oct 16, 2026): no seed data.
-- Dashboards and the Reports cash-flow trend read this table and show
-- zero until the coop's first real entry is recorded in the portal.
--
-- Run AFTER: 13_app_documents.sql
-- Safe to re-run (IF NOT EXISTS).
-- ============================================================

ALTER TABLE ledger ADD COLUMN IF NOT EXISTS category varchar(30);


-- ============================================================
-- Verify — expect 7 columns for ledger, with category included:
--   ledger_id, date, type, description, amount, admin_id, category
-- ============================================================
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'ledger'
ORDER BY ordinal_position;
