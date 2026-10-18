# Feature spec — Auto-filled Members' Data Sheet (PDF)

Status: **PARKED — start after the Supabase connection phase is done.**
Decision recorded: use the scanned form we already have; full data-sheet field scope.

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
