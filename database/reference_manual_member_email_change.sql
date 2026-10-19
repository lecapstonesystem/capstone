-- ============================================================
-- Reference: change a member's app-login email
-- ------------------------------------------------------------
-- USE WHEN: a member can no longer access the email on their
-- app account (mailbox closed, wrong address, provider deleted
-- the account).
--
-- DO NOT USE for members with no app login yet (auth_uid empty)
-- -- they have no login email to change; edit them in the
-- portal: Members -> Edit form.
--
-- The app signs in against Supabase Auth, so the address lives
-- in TWO places that must move together:
--   1. auth.users / auth.identities  the actual login credential
--   2. member.email                  the portal's record
-- The portal's Edit form BLOCKS changing the email on members
-- with a login (it would leave the portal and the login out of
-- sync) — this script is the sanctioned way to change it.
--
-- HOW TO USE:
--   1. Replace every 'REPLACE-...' below with the real values
--      (member number + the new address).
--   2. Run the whole script in one go in the SQL Editor.
--   3. Check the SELECTs at the bottom all show the SAME new
--      address.
--   4. Tell the member to sign in with the NEW address and
--      their EXISTING password — no password reset needed.
--
-- If any statement errors (e.g. permission denied), the whole
-- run stops and nothing changes — report the exact message.
-- ============================================================
BEGIN;

-- 1) The login credential the app actually uses. Keyed through
--    the member's linked account, so the right auth user changes.
UPDATE auth.users
SET email = lower('REPLACE-new-email@example.com')
WHERE id = (
  SELECT auth_uid FROM member
  WHERE member_no = 'REPLACE-member-no' AND auth_uid IS NOT NULL
);

-- 2) The identity copy Supabase Auth keeps alongside it
--    (0 rows here is harmless if the member has no login).
UPDATE auth.identities
SET identity_data = jsonb_set(
  identity_data, '{email}', to_jsonb(lower('REPLACE-new-email@example.com')::text)
)
WHERE provider = 'email'
  AND user_id = (
    SELECT auth_uid FROM member
    WHERE member_no = 'REPLACE-member-no' AND auth_uid IS NOT NULL
  );

-- 3) The portal record (shown in the UI, used as the reset target)
UPDATE member
SET email = lower('REPLACE-new-email@example.com')
WHERE member_no = 'REPLACE-member-no';

COMMIT;

-- Verify: all three must show the SAME new address
SELECT member_no, email, auth_uid
FROM member
WHERE member_no = 'REPLACE-member-no';

SELECT id, email, confirmed_at
FROM auth.users
WHERE id = (SELECT auth_uid FROM member WHERE member_no = 'REPLACE-member-no');

SELECT provider, identity_data ->> 'email'
FROM auth.identities
WHERE user_id = (SELECT auth_uid FROM member WHERE member_no = 'REPLACE-member-no');
