# UCMS Mobile App ↔ Supabase Contract

For: teammate (Android Studio, native app) · Written Oct 16 (as Flutter) · Adapted to native Android Oct 18, 2026.

The mobile app and the Vue admin portal talk to the **same Supabase
project**. No FastAPI in between — the phase-2 service_role backend is
out of scope (admin portal writes directly under `06_admin_access.sql`,
the app writes directly under RLS from `02` + `13`).

All 18 migrations (`database/01…13`, `14…18`) are **already applied on
production** — you code against the live schema, you run no SQL.

---

## 1. Credentials

| What | Value |
|---|---|
| Project URL | `https://akgdwvcuyfqwtvnhryut.supabase.co` |
| Key to ship in the app | the **publishable key** (`sb_publishable_…`) — same value as `web/.env` (`VITE_SUPABASE_…`) or Supabase Dashboard → API Keys → Publishable. Safe to bundle: it is public by design; RLS is the guard. |
| NEVER ship | the **secret key** (`sb_secret_…` / `backend/.env`). Anyone who unpacks the APK would get full database access. Supabase also actively rejects it from app/browser contexts. |

## 2. Setup (supabase-kt)

```kotlin
// app/build.gradle.kts — check the latest release on
// github.com/supabase-community/supabase-kt
implementation(platform("io.github.jan-tennert.supabase:bom:3.+"))
implementation("io.github.jan-tennert.supabase:auth-kt")
implementation("io.github.jan-tennert.supabase:postgrest-kt")
implementation("io.github.jan-tennert.supabase:storage-kt")
implementation("io.ktor:ktor-client-android")
```

```kotlin
// in your Application class (supabase-kt 3.x)
val supabase = Supabase.create(
    "https://akgdwvcuyfqwtvnhryut.supabase.co",
    "<publishable key>",
)
// on 2.x it is: Supabase.initialize { url(...); anonKey(...) }
```

**Not using supabase-kt? Plain HTTP works too** — every flow below is
just these endpoints:

| Need | Call |
|---|---|
| Register | `POST {url}/auth/v1/signup` body `{"email","password"}` |
| Sign in | `POST {url}/auth/v1/token?grant_type=password` body `{"email","password"}` → returns `access_token` |
| Table read/write | `{url}/rest/v1/{table}` — headers: `apikey: <publishable>`, `Authorization: Bearer <access_token>` |
| Photo upload | `POST {url}/storage/v1/object/{bucket}/{path}` — same headers + `Content-Type: image/jpeg`, `x-upsert: true` |

## 3. Auth model — email + password

- **Registration flow (not yet a member):** sign up first — this mints
  the `auth.uid` that every insert below must carry. Requires the
  dashboard toggle: *Authentication → Sign In / Providers → Email →
  Confirm email = OFF* (Hans does this once).
- **Paying members:** sign in with email + password — same account they
  got at registration approval (or one an admin creates later in the
  portal: Members → Issue Credentials signs the login up and links
  `auth_uid`; when the login already exists, Reset Password emails the
  member a sign-in link instead).
- Session persists on device; sign out to log out.

```kotlin
supabase.auth.signUpWith(Email) {
    email = emailInput
    password = passwordInput
}
val uid = supabase.auth.currentUserOrNull()?.id   // null only if email confirmation is still ON

// later / paying members:
supabase.auth.signInWith(Email) {
    email = emailInput
    password = passwordInput
}
```

## 4. What RLS allows (the whole contract in one table)

| Action | Allowed? |
|---|---|
| Register (insert own member row, `status='Pending'`) | yes, once per account |
| Read own member row / own loans / own payments / own applications | yes |
| File loan application (`status='Pending'`) | yes, own member_id only |
| Submit payment with receipt (`status='Pending'`, own released loan) | yes |
| Upload photos into **own folder** in `member-documents` | yes |
| Read anything else / other members / ledger / admin tables | **no** |
| Mark own payment verified, set own status/member_no, approve anything | **no** (admin portal only) |

## 5. Flow 1 — member registration (with photo)

1. Sign up → `uid`
2. Pick + compress the profile photo (bucket caps: **5 MB**, jpeg/png/webp
   only — compress to ~200–300 KB so uploads stay fast on mobile data)

```kotlin
fun compressJpeg(context: Context, uri: Uri, maxDim: Int = 1280, quality: Int = 75): ByteArray {
    val src = BitmapFactory.decodeStream(context.contentResolver.openInputStream(uri))
    val scale = maxDim.toFloat() / maxOf(src.width, src.height, 1)
    val bmp = if (scale < 1f)
        Bitmap.createScaledBitmap(src, (src.width * scale).toInt(), (src.height * scale).toInt(), true)
    else src
    val out = ByteArrayOutputStream()
    bmp.compress(Bitmap.CompressFormat.JPEG, quality, out)
    return out.toByteArray()
}

val jpeg = compressJpeg(context, photoUri)
val path = "$uid/id.jpg"
supabase.storage.from("member-documents").upload(path, jpeg) {
    contentType = ContentType.Image.JPEG
    upsert = true
}
```

3. Insert the member row — **this JSON is the contract** (library style
   may differ slightly on your supabase-kt version):

```kotlin
supabase.from("member").insert(
    mapOf(
        "auth_uid" to uid,
        "name" to composedFullName,        // as printed on paper
        "first_name" to firstName,         // 03 data-sheet columns
        "middle_name" to middleName,       // optional
        "last_name" to lastName,
        "status" to "Pending",             // FORCED by RLS — anything else fails
        "app_source" to "App",             // shows as "Mobile App" in the portal queue
        "id_photo_url" to path,
        "date_joined" to LocalDate.now().toString(),
        // optional profile the form collects:
        "gender" to gender, "date_of_birth" to dob, "address" to address,
        "contact_number" to contact, "email" to email,
        "government_id" to idNumber,
        "gov_id_type" to idType,   // Passport / Driver's License / UMID / National ID
        "civil_status" to civilStatus, "spouse_name" to spouse, "landline" to landline,
        "gsis_number" to gsis, "sss_number" to sss,
        "pagibig_number" to pagibig, "philhealth_number" to philhealth,
    )
)
```

**Never send:** `member_no` (portal assigns on approval), `member_id`,
`login_enabled`, `must_change_password`, `temp_password`, `created_at`
(has default), `app_checklist` / `app_events` / `app_remarks`
(portal-managed: checklist and timeline have defaults, remarks are
the admin's), or any `status` other than `'Pending'`.

4. Track the result: re-read your own row — `status` moves
   `Pending → Under Review → Active` (approved, `member_no`
   assigned), or `→ Returned` (fix and re-submit) / `→ Rejected`.

```kotlin
val me = supabase.from("member")
    .select { eq("auth_uid", uid) }
    .decodeSingleOrNull()
```

## 6. Flow 2 — loan application

```kotlin
val me = /* as above, own member row */;

supabase.from("loan_application").insert(
    mapOf(
        "member_id" to me!!["member_id"],
        "amount" to amount,
        "purpose" to purpose,
        "term_months" to termMonths,        // 1–36
        "loan_type" to loanType,            // the app's dropdown values
        "status" to "Pending",              // FORCED by RLS
        "date_submitted" to LocalDate.now().toString(),
    )
)
```

`reviewed_by` / `date_reviewed` must be omitted — the portal sets them.
Track status by re-reading your rows: `Pending → Approved / Rejected / Returned`.

## 7. Flow 3 — loan payment (with receipt photo)

Read own loans first (RLS returns only yours):

```kotlin
val loans = supabase.from("loan")
    .select("loan_id, amount, status, due_date, date_issued, term_months, loan_type")
    .order("date_issued", order = SortingOrder.Descending)
    .decodeList()
```

Only offer payment on rows with `status` = `Released` (RLS enforces this
too). Then photo → insert:

```kotlin
val path = "$uid/receipt-$loanId-${System.currentTimeMillis()}.jpg"
supabase.storage.from("member-documents").upload(path, jpeg) {
    contentType = ContentType.Image.JPEG
    upsert = true
}

supabase.from("payment").insert(
    mapOf(
        "loan_id" to loanId,
        "member_id" to me!!["member_id"],
        "amount" to amount,                 // > 0
        "date" to LocalDate.now().toString(),
        "status" to "Pending",              // FORCED by RLS until an admin verifies
        "channel" to channel,               // Cash | GCash | Cheque | ATM Deduction | Salary Deduction
        "reference_number" to refNo,        // GCash / transaction reference, optional
        "receipt_image_url" to path,
        // optional schedule hints if the app shows them:
        "installment_no" to n, "expected_amount" to expected, "due_date" to due,
    )
)
```

Omit `payment_id`, `verified_by`, `date_verified`.
Track `Pending → Recorded` after the admin verifies in the portal.

## 8. Error codes

| Code / message | Meaning | Fix |
|---|---|---|
| HTTP body `code: 42501` (RestException) | RLS rejected the write | almost always a wrong `status` value, or a `member_id`/`loan_id` that is not yours |
| `23505` on `member_auth_uid_key` | account already has a registration row | sign in instead of signing up |
| 401 / "JWT expired" / PGRST301 | session expired | sign in again |
| storage `413` / "exceeded" | file > 5 MB | compress harder / re-encode |
| storage `415` | mime not allowed | upload jpeg/png/webp (`contentType = image/jpeg`) |
| signUp `weak_password` / invalid email | local validation | enforce 8+ chars in the form |
| 401 `Forbidden use of secret key` | the secret key leaked into the app | replace with the publishable key immediately |

## 9. What the app can NEVER do (defense talking points)

- see other members, the ledger, reports, audit log, or the admin list;
- mark its own payment verified or its own registration approved —
  status transitions are **admin-portal-only**, enforced by RLS;
- submit a payment against someone else's loan or a not-yet-released loan;
- exceed 5 MB or non-image uploads (bucket limits, server-enforced);
- the secret key is not in the app, so even a decompiled APK yields
  only the publishable key plus RLS.

## 10. Status lifecycles (who flips what)

| Row | App writes | Admin portal later sets |
|---|---|---|
| `member` | `Pending` | `Active` (assigns `member_no`) or `Rejected` |
| `loan_application` | `Pending` | `Under Review` → `Approved` / `Returned` / `Rejected` |
| `payment` | `Pending` | `Recorded` (+ `verified_by`, `date_verified`) |

Balances count only `Recorded` payments — a `Pending` receipt does not
move the loan balance until verified.

## 11. End-to-end test (current state — everything below exists)

1. Point the app at the production URL + publishable key (section 1).
2. Dashboard: *Authentication → Sign In / Providers → Email → Confirm
   email = OFF* (verify once).
3. App registers a test member with a photo → portal **Applications**
   shows it, source "Mobile App", status Pending → approve it → member
   becomes Active, photo is their avatar everywhere.
4. App records a loan payment with a receipt → portal **Loans** →
   payment shows, receipt viewable, status Pending → verify it →
   Recorded, balance moves.
