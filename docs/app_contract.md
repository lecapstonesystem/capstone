# UCMS Mobile App ↔ Supabase Contract

For: teammate (Android Studio, native app) · Written Oct 16 (as Flutter) · Adapted to native Android Oct 18, 2026.

The mobile app and the Vue admin portal talk to the **same Supabase
project**. No FastAPI in between — the phase-2 service_role backend is
out of scope (admin portal writes directly under `06_admin_access.sql`,
the app writes directly under RLS from `02` + `13`).

All 26 migrations (`database/01…26`) are **already applied on
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
| Read own notifications, mark them read | yes |
| File loan application (`status='Pending'`) | yes, own member_id only |
| Submit payment with receipt (`status='Pending'`, own released loan) | yes |
| Upload files into **own folder** in `member-documents` (profile photo, payment receipt, loan documents under `loan-apps/{application_id}`) | yes |
| Read anything else / other members / ledger / admin tables | **no** |
| Mark own payment verified, set own status/member_no, approve anything | **no** (admin portal only) |

## 5. Flow 1 — member registration (with photo)

1. Sign up → `uid`
2. Pick + compress the profile photo (bucket caps: **10 MB**, jpeg/png/webp/pdf
   — but still compress to ~200–300 KB so uploads stay fast on mobile data)

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

**Email policy.** `email` is the member's **personal** address and becomes
their app login — ask for it as "personal email", not the DepEd address.
DepEd accounts are deactivated when staff leave and DepEd's guidelines
restrict their use for non-official services. The portal keeps the DepEd /
office address in `work_email`, which is **record only**: the app never
reads or writes it and it is never used for sign-in or password resets.

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

val row = supabase.from("loan_application").insert(
    mapOf(
        "member_id" to me!!["member_id"],
        "amount" to amount,
        "purpose" to purpose,
        "term_months" to termMonths,        // 1–36
        "loan_type" to loanType,            // the app's dropdown values
        "status" to "Pending",              // FORCED by RLS
        "date_submitted" to LocalDate.now().toString(),
        "requested_co_makers" to requestedCoMakers, // 1–2 names the member typed (optional)
        "co_maker_ids"        to coMakerIds,        // member ids the app looked up (optional)
    )
).select().decodeSingleOrNull()              // returns the inserted row —
                                             // you need its id for the
                                             // documents folder below
val applicationId = row!!["application_id"].jsonPrimitive.int  // decode style varies by version
```

`reviewed_by` / `date_reviewed` / `remarks` must be omitted — the portal sets them.
Track status by re-reading your rows: `Pending → Approved / Rejected / Returned`.

`requested_co_makers` (migration 24) is the member's **suggestion**: the portal
shows it on the review screen and pre-fills the co-maker boxes. Approval still
requires the admin to confirm each co-maker is an existing member — the app
cannot check that (members only read their own row under RLS). Omitting the
field is fine; the review boxes simply start empty.

`co_maker_ids` (migration 28) is the stronger form of the same suggestion: the
member ids the app's co-maker search returned, e.g. `[123, 456]`. The portal
tries these first — it shows "Co-makers chosen in the app" with each name and
KHS number, and pre-fills the boxes with those members. An id that is not an
active member is ignored and the box falls back to `requested_co_makers`
matching, then stays empty. Approval still requires the admin's confirmation
in the pickers; the ids never bypass it. Send plain integers (from the member
table's `member_id`), 1–2 entries, in the same order as the names. Omitting it
is fine — old requests behave exactly as before.

### 6b. Required documents (shown to the admin during review)

After the insert, upload one file per requirement. **The folder name is the
contract** — the portal's Review Loan Request modal only looks in
`{your auth uid}/loan-apps/{application_id}/`:

```kotlin
val docs = mapOf(
    "valid-id.jpg"         to validIdBytes,   // compressed JPEG (or a PDF below)
    "proof-of-salary.jpg"  to salaryBytes,
    "checking-account.jpg" to checkingBytes,
)
for ((name, bytes) in docs) {
    supabase.storage.from("member-documents")
        .upload("$uid/loan-apps/$applicationId/$name", bytes) {
            contentType = ContentType.Image.JPEG   // or ContentType.Application.PDF
            upsert = true
        }
}
```

- **Filenames are pinned** (`valid-id`, `proof-of-salary`, `checking-account` +
  extension) — the portal labels them for the reviewer. Other names still list,
  just shown raw.
- Limits: **10 MB** per file, jpeg/png/webp/pdf (bucket-enforced).
- Uploads run **after** the insert — the folder is named after the id. If one
  fails, tell the member: the application itself is already filed.
- **Never** insert into the `attachment` table — it is admin-only and rejects
  you with 42501. Storage in your own folder is the only door.
- On approval the portal registers these files on the new loan's **Files**
  panel (with an audit line). On return/rejection they simply stay in your
  folder, and a re-filed application gets a new folder — nothing is lost.

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
        "channel" to channel,               // Cash | Cheque | ATM Deduction | Salary Deduction (GCash removed 10/2026 — portal dropdown no longer offers it)
        "reference_number" to refNo,        // bank / transaction reference, optional
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
| storage `413` / "exceeded" | file > 10 MB | compress harder / re-encode |
| storage `415` | mime not allowed | upload jpeg/png/webp/pdf (`contentType = image/jpeg`) |
| signUp `weak_password` / invalid email | local validation | enforce 8+ chars in the form |
| 401 `Forbidden use of secret key` | the secret key leaked into the app | replace with the publishable key immediately |

## 9. What the app can NEVER do (defense talking points)

- see other members, the ledger, reports, audit log, or the admin list;
- mark its own payment verified or its own registration approved —
  status transitions are **admin-portal-only**, enforced by RLS;
- submit a payment against someone else's loan or a not-yet-released loan;
- exceed 10 MB or upload anything outside jpeg/png/webp/pdf (bucket limits, server-enforced);
- the secret key is not in the app, so even a decompiled APK yields
  only the publishable key plus RLS.

## 10. Status lifecycles (who flips what)

| Row | App writes | Admin portal later sets |
|---|---|---|
| `member` | `Pending` | `Active` (assigns `member_no`) or `Rejected` |
| `loan_application` | `Pending` | `Under Review` → `Approved` / `Returned` / `Rejected` |
| `payment` | `Pending` | `Recorded` (+ `verified_by`, `date_verified`) |
| `notification` | (reads own rows) marks own `read_at` | creates every row — bulk reminders + loan-decision notices |

Balances count only `Recorded` payments — a `Pending` receipt does not
move the loan balance until verified.

## 11. End-to-end test (current state — everything below exists)

1. Point the app at the production URL + publishable key (section 1).
2. Dashboard: *Authentication → Sign In / Providers → Email → Confirm
   email = OFF* (verify once).
3. App registers a test member with a photo → portal **Registrations**
   shows it, source "Mobile App", status Pending → approve it → member
   becomes Active, photo is their avatar everywhere.
4. App files a loan request **with the required documents** (6b) → portal
   **Loans** → amber panel → Review shows the request and its documents
   (View opens each) → approve → the request leaves the queue and the
   documents appear in the new loan's **Files** panel.
5. App records a loan payment with a receipt → portal **Loans** →
   payment shows, receipt viewable, status Pending → verify it →
   Recorded, balance moves.
6. Portal → **Notifications** → *Find payments due* → send → the app's
   notification inbox shows the reminder; and when the admin approves /
   returns / rejects your app-filed loan request, the inbox shows
   `Loan request approved / returned / rejected` (with the admin's
   remarks) after the app refreshes.

## 12. Notifications — the member inbox (in-app)

Every message the coop sends lands in the `notification` table; the app
is the delivery channel. No push service, no Firebase — RLS does the
scoping, and a database trigger freezes message content: you may only
ever set `read_at`.

| Need | Call |
|---|---|
| List my messages (newest first) | see below |
| Unread count for the bell badge | count rows where `read_at` is null |
| Mark one read | update `read_at` filtered to its `notification_id` |
| Edit title / body / target | **never** — read-only by trigger |

```kotlin
val notes = supabase.from("notification")
    .select("notification_id, type, title, body, loan_id, created_at, read_at")
    .order("created_at", order = SortingOrder.Descending)
    .decodeList()

// RLS already returns ONLY your member's rows — no extra filter needed.

// mark one read (style varies by version — your usual update + where):
supabase.from("notification")
    .update(mapOf("read_at" to java.time.Instant.now().toString())) {
        eq("notification_id", noteId)
    }
```

- **Refresh when the app opens and when it returns to the foreground** —
  that refresh is what keeps the member informed without visiting the
  office. (Live updates via Realtime on `notification` are a nice
  optional extra later.)
- Types you will show: `payment_due` and `payment_overdue` (bulk
  reminders the admin sends from the portal's Notifications page) and
  `loan_approved`, `loan_returned`, `loan_rejected` — written
  automatically the moment the admin reviews the member's loan
  request. Returned/rejected messages carry the admin's remarks
  verbatim, so the member knows exactly what to re-file.
