-- ============================================================
-- 07_seed_admin.sql
-- Bootstrap the FIRST admin: links a public.admin row to a
-- Supabase Auth user so is_admin() (from 06) grants portal access.
--
-- Run AFTER: 06_admin_access.sql, and AFTER the auth user exists:
--   Supabase Dashboard -> Authentication -> Users -> Add user
--   (email + temp password, "Auto Confirm User" ON)
--
-- EDIT the two marked lines to match that auth user.
-- Safe to re-run: ON CONFLICT (auth_uid) DO NOTHING.
-- ============================================================
INSERT INTO admin (name, role, email, created_at, auth_uid)
SELECT
  'Change Me',                 -- EDIT: display name shown in the portal
  'Super Admin',               -- exact string the portal matches on (admins.js)
  'change-me@example.com',     -- EDIT: must match the Auth user's email (lowercase)
  now(),
  u.id
FROM auth.users u
WHERE u.email = 'change-me@example.com'   -- EDIT (same email again)
ON CONFLICT (auth_uid) DO NOTHING;

-- Verify — expect exactly 1 row with linked = true.
-- 0 rows means the two EDIT lines still have placeholders, or the
-- email doesn't match an Auth user yet.
SELECT admin_id, name, role, email, auth_uid IS NOT NULL AS linked
FROM admin;
