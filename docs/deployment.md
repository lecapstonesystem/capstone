# Deployment — UCMS Admin Portal

One-time setup to take the portal from your laptop to the live URL the
coop can use. Nothing here touches member data — Supabase stays the
host of all data, auth, and storage; Cloudflare only serves the
static files.

## 1. Deploy the web app (Cloudflare Pages)

**Standard route: Wrangler CLI (from the laptop).** This is the
project's official deployment path — it needs no GitHub wiring in
Cloudflare at all, and keeps hosting fully under the deployer's own
account.

1. One-time: `npx wrangler login` → browser → **Allow**.
2. One-time (project already exists — skip):
   `npx wrangler pages project create ucms-admin --production-branch main`
3. Every release:
   - `npm run build` in `web/` — the local `.env` bakes in
     `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
   - `npx wrangler pages deploy dist --project-name ucms-admin --branch main`
4. Deploy only from a **clean, pushed tree** — the live site must
   never contain work that isn't in the repo.

`web/public/_redirects` (already in the repo) makes every route
(`/members`, `/loans`, …) work on refresh — Vue Router handles them
client-side.

### Optional: Git auto-deploy

The repo lives in the team org (`lecapstonesystem`). Once you're an
org member and the **Cloudflare GitHub App is installed on the org**
with `capstone` selected (org Settings → GitHub Apps → Cloudflare
Workers & Pages), connect in Cloudflare: project → Settings →
Build → Git repository → Connect → pick the repo. Build settings
`web` / `npm run build` / `dist` and env vars `NODE_VERSION=22`,
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; deploys then run on
every push to `main`.

## 2. Point Supabase Auth at the live URL (required!)

The Admins module resets passwords by **email link** — the link
targets Supabase's Site URL, so it must be updated or reset emails
will point at localhost.

Supabase Dashboard → **Authentication → URL Configuration**:

- **Site URL:** `https://<your-live-url>`
- **Redirect URLs:** add `https://<your-live-url>/**`

Do this right after the first successful deploy, then test a password
reset end-to-end (Admins → Reset → check the email → open the link).

## 3. Nothing else to configure

- Database schema, RLS policies, audit log: migrations in
  `database/` (run in numeric order). Apply migration 32 before
  deploying the immutable-ledger reversal UI.
- Storage bucket `member-documents`: already private, policies in 13.
- The Android app talks to Supabase directly — the web deploy does
  not affect it (contract: `docs/app_contract.md`).

## 4. Production regression (before tagging)

Run once on the live URL with a real login:

1. Login + forced password change flow.
2. All 8 modules load: Dashboard, Members, Loans, Ledger,
   Applications, Reports, Admins, audit trail.
3. Photo upload (member drawer + payment receipt) + preview.
4. Password reset email link arrives with the **production** URL.
5. Ledger correction appends an opposite-type reversal with a reason;
   verify the original remains visible and the net balance is unchanged.

## 5. Tag v1.0

```
git tag -a v1.0 -m "UCMS v1.0 — KHS Mentor's MPC admin portal"
git push origin v1.0
```

Tag only after step 4 passes.

## Security reminders

- Repo stays **private** (real PII).
- `service_role` key: Supabase backend scripts only — never in
  `web/`, never in the Android app, never in chat.
- The anon key in the client build is safe: RLS + `is_admin()`
  decide everything server-side.
