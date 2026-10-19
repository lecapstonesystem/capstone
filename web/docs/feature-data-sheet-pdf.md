# Feature spec — Auto-filled Members' Data Sheet (PDF)

Status: **SHIPPED — essentials scope** (portal v1.0: Members drawer and
approved Registrations both print the pre-filled sheet).
Decisions recorded: overlay the scanned form (not a recreation); the full
field scope stays the v1.1 extension — see "Built" below.

## Goal

An admin filling in a walk-in application gets a button that produces the coop's
**official Members' Data Sheet**, already typed in, ready for the applicant to
sign. Closes the paper <-> digital loop:

    admin types details  ->  system prints the coop's own form  ->
    applicant signs  ->  office files the signed copy

This replaces the current mock "View PDF" placeholder in the Applications table.

## Approach — overlay the real form (not a recreation)

- `pdf-lib` (client-side, lazy-loaded, no server, no Supabase Storage needed)
- Load the scanned template once, stamp text at fixed coordinates
- Output stays 100% faithful: logo, fonts, ruled lines, the "Bspb/8-8-18" footer
- Coordinates live in **one** `data-sheet-template.json` — reusable by the
  teammate's Android app so both sides share a single template definition

## Template source

Using the scan provided (Members' Data Sheet photo).
If KHS Mentor's later provides the original Word/PDF soft copy, recalibrate
against it — cleaner output, same code. A 300 DPI flatbed re-scan (no skew, no
shadow) is the fallback improvement.

## Fields — full data sheet

Collect in the walk-in form (beyond what `03_add_form_columns.sql` already
gave the member record — middle name, civil status, spouse, landline,
GSIS/SSS/Pag-IBIG/PhilHealth, gov ID, member type):

- date of birth, no. of dependents, spouse occupation
- permanent address AND present address (the form asks for both)
- department, position, years in service, employee no.
- educational attainment (course + school: College, M.A. Undergrad, M.A., Doctorate)
- financial institution member, capital share

Auto-derived at print time:

- age from date of birth
- no. of years in the cooperative from membership date
- civil status / membership type rendered as a mark in the right box

Left blank by design: 1x1 picture and signature (wet ink, physical steps).

## Out of scope

- Supabase Storage — PDF is generated on demand in the browser
- Reprinting history — the signed paper original stays the record

## Built (v1.0, essentials scope)

- `web/src/lib/memberDataSheetPdf.js` stamps with pdf-lib: fetches
  `web/public/forms/members-data-sheet.jpg` plus
  `data-sheet-template.json` — coordinates are fractions of the page, so
  a re-scan at any resolution keeps the template, and the mobile app can
  reuse the same JSON.
- Stamped from the live record: name parts, DOB + computed age, civil
  status mark, spouse name, present address, landline/mobile/email,
  TIN/GSIS/SSS/PAG-IBIG/PHILHEALTH, membership date + computed years in
  the cooperative, capital share, membership-type mark. Permanent
  address stays blank — the system holds one address (the member's
  current one), which prints on Present Address.
- Gender + Birthday added to the member edit form (columns existed since
  the base schema; the portal now collects, shows and saves them).
- Left blank for wet ink: 1x1 photo, signature, date signed, dependents,
  spouse occupation, department/position/years/employee no., education
  block, financial institution.
- Recalibrate any time with `node scripts/sample-data-sheet.mjs` (from
  `web/`) — writes `public/forms/_sample.pdf`; compare against the
  printed lines and adjust the JSON.
