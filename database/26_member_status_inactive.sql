-- =============================================================
-- 26_member_status_inactive.sql
--
-- Collapse the membership lifecycle to two states:
--   Active   — full member, can sign in to the app
--   Inactive — login disabled (suspended or left the coop)
--
-- Suspended and Dropped both become Inactive. Nothing is deleted:
-- the record and its history stay, and the reason the admin typed
-- before this change remains in the audit log. Reactivation is a
-- single status change back to Active.
--
-- The same column also carries the REGISTRATION lifecycle for rows
-- submitted from the app (Pending / Under Review / Returned /
-- Rejected — 15_registration_queue.sql). Those values are left
-- untouched: the app's sign-up policy (13 §4) requires status =
-- 'Pending', and the Registrations module moves them through review.
-- That is why no CHECK constraint is added here — the column holds
-- two lifecycles by design.
--
-- Run in the Supabase SQL Editor (paste-run). Safe to re-run.
-- =============================================================

-- 1. Legacy membership states → Inactive (and normalize case).
update member
   set status = 'Inactive'
 where lower(status) in ('suspended', 'dropped', 'inactive');

update member
   set status = 'Active'
 where lower(status) = 'active';

-- 2. An inactive member cannot hold an app login.
update member
   set login_enabled = false
 where status = 'Inactive';

-- 3. Document the column (visible in the Supabase Table Editor).
comment on column member.status is
  'Membership lifecycle: Active | Inactive. Registration queue rows use Pending | Under Review | Returned | Rejected.';

-- ---------- Verify ----------
-- Expect Active / Inactive / Pending (plus any rows still under
-- review) — no Suspended or Dropped rows remain.
select status, count(*) as members
  from member
 group by status
 order by status;

-- Inactive rows must not have a working login.
select count(*) as inactive_with_login
  from member
 where status = 'Inactive' and login_enabled is true;
