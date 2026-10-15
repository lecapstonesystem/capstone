# UCMS Flutter App ↔ Supabase Contract

For: teammate (Flutter) · Written: Oct 16, 2026 · Schema owner: review `database/13_app_documents.sql` before it is run.

The Flutter app and the Vue admin portal talk to the **same Supabase
project**. No FastAPI in between — the phase-2 service_role backend is
out of scope (admin portal writes directly under `06_admin_access.sql`,
the app writes directly under RLS from `02` + `13`).

---

## 1. Credentials

| What | Value |
|---|---|
| Project URL | `https://akgdwvcuyfqwtvnhryut.supabase.co` |
| Key to ship in the app | the **publishable / anon key** — same value as `web/.env` (`VITE_SUPABASE_…`). Safe to bundle: it is public by design; RLS is the guard. |
| NEVER ship | the **service / secret key** (`backend/.env`). Anyone who unpacks the APK would get full database access. |

## 2. Setup

```yaml
# pubspec.yaml
dependencies:
  supabase_flutter: ^2.8.0
  image_picker: ^1.1.2
  flutter_image_compress: ^2.3.0
```

```dart
await Supabase.initialize(
  url: 'https://akgdwvcuyfqwtvnhryut.supabase.co',
  anonKey: '<publishable key>',
);
final supabase = Supabase.instance.client;
```

## 3. Auth model — email + password

- **Registration flow (not yet a member):** `signUp(email, password)` first —
  this mints the `auth.uid` that every insert below must carry.
  Requires the dashboard toggle: *Authentication → Sign In / Providers →
  Email → Confirm email = OFF* (Hans does this once).
- **Paying members:** `signInWithPassword(email, password)` — same account
  they got at registration approval (or one linked later with the helper SQL
  in `13_app_documents.sql` for pre-existing members).
- Session persists on device; `signOut()` to log out.

```dart
final res = await supabase.auth.signUp(email: email, password: password);
final uid = res.user!.id; // null only if email confirmation is still ON
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

1. `signUp` → `uid`
2. Pick + compress the ID photo (bucket caps: **5 MB**, jpeg/png/webp only —
   compress to ~200–300 KB so uploads stay fast on mobile data)

```dart
final compressed = await FlutterImageCompress.compressWithFile(
  photo.path, quality: 75, minWidth: 1280, minHeight: 1280,
);
final path = '$uid/id.jpg';
await supabase.storage.from('member-documents').uploadBinary(
  path, compressed!,
  fileOptions: const FileOptions(contentType: 'image/jpeg', upsert: true),
);
```

3. Insert the member row

```dart
await supabase.from('member').insert({
  'auth_uid': uid,
  'name': composedFullName,            // as printed on paper
  'first_name': firstName,             // 03 data-sheet columns
  'middle_name': middleName,           // optional
  'last_name': lastName,
  'status': 'Pending',                 // FORCED by RLS — anything else fails
  'id_photo_url': path,
  'date_joined': DateTime.now().toIso8601String().split('T').first,
  // optional profile the form collects:
  'gender': gender, 'date_of_birth': dob, 'address': address,
  'contact_number': contact, 'email': email,
  'government_id': idNumber, 'gov_id_type': idType,   // Passport / Driver's License / UMID / National ID
  'civil_status': civilStatus, 'spouse_name': spouse, 'landline': landline,
  'gsis_number': gsis, 'sss_number': sss,
  'pagibig_number': pagibig, 'philhealth_number': philhealth,
});
```

**Never send:** `member_no` (portal assigns on approval), `member_id`,
`login_enabled`, `must_change_password`, `temp_password`, `created_at`
(has default), or any `status` other than `'Pending'`.

4. Track the result: re-read your own row — `status` flips
   `Pending → Active` (approved, `member_no` assigned) or `→ Rejected`.

```dart
final me = await supabase.from('member')
    .select().eq('auth_uid', uid).maybeSingle();
```

## 6. Flow 2 — loan application

```dart
final me = /* as above, own member row */;

await supabase.from('loan_application').insert({
  'member_id': me['member_id'],
  'amount': amount,
  'purpose': purpose,
  'term_months': termMonths,          // 1–36
  'loan_type': loanType,              // the app's dropdown values
  'status': 'Pending',                // FORCED by RLS
  'date_submitted': DateTime.now().toIso8601String().split('T').first,
});
```

`reviewed_by` / `date_reviewed` must be omitted — the portal sets them.
Track status by re-reading your rows: `Pending → Approved / Rejected / Returned`.

## 7. Flow 3 — loan payment (with receipt photo)

Read own loans first (RLS returns only yours):

```dart
final loans = await supabase.from('loan').select(
  'loan_id, amount, status, due_date, date_issued, term_months, loan_type',
).order('date_issued', ascending: false);
```

Only offer payment on rows with `status` = `Released` (RLS enforces this
too). Then photo → insert:

```dart
final path = '$uid/receipt-$loanId-${DateTime.now().millisecondsSinceEpoch}.jpg';
await supabase.storage.from('member-documents').uploadBinary(
  path, compressed!,
  fileOptions: const FileOptions(contentType: 'image/jpeg', upsert: true),
);

await supabase.from('payment').insert({
  'loan_id': loanId,
  'member_id': me['member_id'],
  'amount': amount,                   // > 0
  'date': DateTime.now().toIso8601String().split('T').first,
  'status': 'Pending',                // FORCED by RLS until an admin verifies
  'channel': channel,                 // Cash | GCash | Cheque | ATM Deduction | Salary Deduction
  'reference_number': refNo,          // GCash / transaction reference, optional
  'receipt_image_url': path,
  // optional schedule hints if the app shows them:
  'installment_no': n, 'expected_amount': expected, 'due_date': due,
});
```

Omit `payment_id`, `verified_by`, `date_verified`.
Track `Pending → Recorded` after the admin verifies in the portal.

## 8. Error codes

| Code / message | Meaning | Fix |
|---|---|---|
| `42501` (PostgrestException) | RLS rejected the write | almost always a wrong `status` value, or a `member_id`/`loan_id` that is not yours |
| `23505` on `member_auth_uid_key` | account already has a registration row | sign in instead of signing up |
| `PGRST301` / `AuthSessionError` | session expired | `signInWithPassword` again |
| storage `413` / "exceeded" | file > 5 MB | compress harder / re-encode |
| storage `415` | mime not allowed | upload jpeg/png/webp (`contentType: 'image/jpeg'`) |
| signUp `weak_password` / invalid email | local validation | enforce 8+ chars in the form |

## 9. What the app can NEVER do (defense talking points)

- see other members, the ledger, reports, audit log, or the admin list;
- mark its own payment verified or its own registration approved —
  status transitions are **admin-portal-only**, enforced by RLS;
- submit a payment against someone else's loan or a not-yet-released loan;
- exceed 5 MB or non-image uploads (bucket limits, server-enforced);
- the service key is not in the app, so even a decompiled APK yields
  only the public key plus RLS.

## 10. Status lifecycles (who flips what)

| Row | App writes | Admin portal later sets |
|---|---|---|
| `member` | `Pending` | `Active` (assigns `member_no`) or `Rejected` |
| `loan_application` | `Pending` | `Under Review` → `Approved` / `Returned` / `Rejected` |
| `payment` | `Pending` | `Recorded` (+ `verified_by`, `date_verified`) |

Balances count only `Recorded` payments — a `Pending` receipt does not
move the loan balance until verified.

## 11. Before the first end-to-end demo

1. Run `database/13_app_documents.sql`, check its Verify block.
2. Dashboard: *Authentication → Sign In / Providers → Email → Confirm email = OFF*.
3. First `signUp` from the app → link that UUID to a demo member
   (commented helper at the bottom of `13`).
4. Portal review UIs (registration approval, receipt verification) land
   with the upcoming Applications/Loans work — until then submissions
   sit `Pending` and are visible in the portal only after those screens ship.
