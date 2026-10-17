# Deployment — UCMS Admin Portal

One-time setup to take the portal from your laptop to the live URL the
coop can use. Nothing here touches member data — Supabase stays the
host of all data, auth, and storage; Cloudflare only serves the
static files.

## 1. Deploy the web app (Cloudflare Pages)

1. Push the repo (`potchiloco-stack/capstone`, stays **private**).
2. Cloudflare Dashboard → **Workers & Pages → Create → Pages →
   Connect to Git** → pick the repo.
3. Build settings:
   - **Root directory:** `web`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. Environment variables (build-time, all client-safe):
   - `NODE_VERSION` = `22` — the project requires Node ^22.18;
     Cloudflare's default build image is older
   - `VITE_SUPABASE_URL` — Supabase Dashboard → Project Settings →
     API Keys → Project URL
   - `VITE_SUPABASE_ANON_KEY` — the **anon / publishable** key
     (never the service_role key — it must never reach a browser)
5. Deploy. The site gets a URL like
   `https://ucms-admin.pages.dev`.

`web/public/_redirects` (already in the repo) makes every route
(`/members`, `/loans`, …) work on refresh — Vue Router handles them
client-side.

### Backup route: deploy from the laptop (Wrangler CLI)

If the GitHub link ever breaks (repo access revoked, app
uninstalled), the same site can be pushed straight to the same
Cloudflare project — no GitHub involved:

1. One-time: `npx wrangler login` → browser opens → **Allow**
   (uses your own Cloudflare account).
2. Build locally — `npm run build` in `web/`; the local `.env`
   bakes the Supabase variables in.
3. Deploy:
   `npx wrangler pages deploy dist --project-name <name> --branch main`
   (run in `web/`; `<name>` = the Pages project name).

Rules:

- Deploy only from a **clean, pushed tree** — the live site must
  never contain work that isn't in the repo.
- Both routes write to the same project's deploy history; the
  newest deploy wins.

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

- Database schema, RLS policies, audit log: migrations 01–18 (all run).
- Storage bucket `member-documents`: already private, policies in 13.
- The Flutter app talks to Supabase directly — the web deploy does
  not affect it (contract: `docs/flutter_app_contract.md`).

## 4. Production regression (before tagging)

Run once on the live URL with a real login:

1. Login + forced password change flow.
2. All 8 modules load: Dashboard, Members, Loans, Ledger,
   Applications, Reports, Admins, audit trail.
3. Photo upload (member drawer + payment receipt) + preview.
4. Password reset email link arrives with the **production** URL.
5. Ledger correction (edit + delete-with-reason) leaves audit lines.

## 5. Tag v1.0

```
git tag -a v1.0 -m "UCMS v1.0 — KHS Mentor's MPC admin portal"
git push origin v1.0
```

Tag only after step 4 passes.

## Security reminders

- Repo stays **private** (real PII).
- `service_role` key: Supabase backend scripts only — never in
  `web/`, never in the Flutter app, never in chat.
- The anon key in the client build is safe: RLS + `is_admin()`
  decide everything server-side.
