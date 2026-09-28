-- db/02_rls_policies.sql — UCMS security layer (run AFTER 01_schema.sql)

-- Step 1: identity link between Supabase logins (UUID) and member_id (int)
ALTER TABLE member ADD COLUMN IF NOT EXISTS auth_uid UUID UNIQUE;

-- Step 2a: API visibility — member-facing tables only
-- (ledger/report/audit_log/admin stay invisible to the app, by design)
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON member, loan_application, payment TO authenticated;
GRANT SELECT ON loan, share_capital, dividend, co_maker TO authenticated;

-- Step 2b: MEMBER — own row only (registration creates it with the user's own UUID)
ALTER TABLE member ENABLE ROW LEVEL SECURITY;
CREATE POLICY "member own row select" ON member FOR SELECT TO authenticated
  USING (auth.uid() = auth_uid);
CREATE POLICY "member own row insert" ON member FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = auth_uid);
CREATE POLICY "member own row update" ON member FOR UPDATE TO authenticated
  USING (auth.uid() = auth_uid) WITH CHECK (auth.uid() = auth_uid);

-- Step 2c: LOAN_APPLICATION — file and track their own (approval via backend service_role)
ALTER TABLE loan_application ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own applications" ON loan_application FOR SELECT TO authenticated
  USING (member_id IN (SELECT member_id FROM member WHERE auth_uid = auth.uid()));
CREATE POLICY "file own application" ON loan_application FOR INSERT TO authenticated
  WITH CHECK (member_id IN (SELECT member_id FROM member WHERE auth_uid = auth.uid()));

-- Step 2d: LOAN / PAYMENT / SHARE_CAPITAL / DIVIDEND — read own via member link
-- (writes happen through the backend with service_role, which bypasses RLS)
ALTER TABLE loan ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own loans" ON loan FOR SELECT TO authenticated
  USING (member_id IN (SELECT member_id FROM member WHERE auth_uid = auth.uid()));
ALTER TABLE payment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own payments" ON payment FOR SELECT TO authenticated
  USING (member_id IN (SELECT member_id FROM member WHERE auth_uid = auth.uid()));
CREATE POLICY "upload own payment" ON payment FOR INSERT TO authenticated
  WITH CHECK (member_id IN (SELECT member_id FROM member WHERE auth_uid = auth.uid()));
ALTER TABLE share_capital ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own shares" ON share_capital FOR SELECT TO authenticated
  USING (member_id IN (SELECT member_id FROM member WHERE auth_uid = auth.uid()));
ALTER TABLE dividend ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own dividends" ON dividend FOR SELECT TO authenticated
  USING (member_id IN (SELECT member_id FROM member WHERE auth_uid = auth.uid()));

-- Step 2e: CO_MAKER — visible if you're the borrower or the co-maker
ALTER TABLE co_maker ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own comaker rows" ON co_maker FOR SELECT TO authenticated
  USING (member_id IN (SELECT member_id FROM member WHERE auth_uid = auth.uid())
     OR loan_id IN (SELECT loan_id FROM loan WHERE member_id IN
                    (SELECT member_id FROM member WHERE auth_uid = auth.uid())));
